# Chapter 02 — Stock Reconciliation: Automated Detectors

Source: `apps/api/src/inventory-reconciliation/inventory-reconciliation.service.ts`

## Overview

The inventory-reconciliation module provides two programmatic detectors that verify
mathematical consistency of the ledger's derivative structures. These are **independent of
the physical count** — they run at any time to confirm the system's internal arithmetic is
coherent. They do not require warehouse access or a human counter.

## Detector 1 — `detectQuantityVariances` (line 423)

**What it asserts:**
- `materialized_stock_levels.on_hand == Σ stock_ledger_entries.quantity` per (item, warehouse)
- `item_batches.qty_remaining == Σ stock_ledger_entries.quantity` per batch_id (for
  batch-tracked items where attribution is present)

**How it works:**

Level check (SQL):
```sql
SELECT m.item_id, m.warehouse_id, m.on_hand, COALESCE(l.qty, 0) AS ledger_qty
FROM materialized_stock_levels m
LEFT JOIN (
  SELECT item_id, warehouse_id, SUM(quantity) AS qty
  FROM stock_ledger_entries WHERE tenant_id = $1 GROUP BY item_id, warehouse_id
) l ON l.item_id = m.item_id AND l.warehouse_id = m.warehouse_id
WHERE m.tenant_id = $1 AND m.legal_entity_id = $2
```

A LEFT JOIN means if `materialized_stock_levels` has a row but no ledger rows, the
divergence surfaces as `on_hand ≠ 0`. The reverse (ledger rows but no materialized row)
is NOT caught — this would silently lose data if `materializedStockLevels` rows are
accidentally deleted.

Batch check: uses a GUARD — if no ledger rows carry `batch_id` for a batch-tracked item,
it emits an informational `batchAttributionPending` note rather than a variance. This
prevents false positives from the Layer 2 attribution backfill work being incomplete.

**Tolerance:** configurable `threshold` parameter (default from `DEFAULT_THRESHOLD` constant).
Variances within tolerance are suppressed.

**Invocation:** exposed via `GET /tenant/inventory-reconciliation/quantity-variances`.
Not called automatically anywhere (no scheduled job, no event trigger). Must be run manually
or by an audit script.

## Detector 2 — `detectReservedQuantityVariances` (line 552)

**What it asserts:**
- `materialized_stock_levels.reserved_qty == Σ stock_reservations.quantity` per (item, warehouse)
  where reservation status = 'active'

**How it works:**
```sql
FULL OUTER JOIN between materialized_stock_levels (reserved_qty ≠ 0) and
stock_reservations (active status, summed by item+warehouse)
```

FULL OUTER JOIN catches both directions: orphaned materialized holds (level has
reserved_qty but no active reservation) AND active reservations with no materialized
projection.

**Invocation:** `GET /tenant/inventory-reconciliation/reserved-quantity-variances`.
Also manual-only.

## Gaps in the detector set

| Gap | Detail |
|-----|--------|
| **No reverse-direction level check** | `detectQuantityVariances` uses LEFT JOIN from `materialized_stock_levels` — if a ledger row exists but the materialized row is absent, the discrepancy is silent. |
| **No serial projection check** | No detector verifies `COUNT(item_serial_numbers WHERE status=available)` == `on_hand` for serial-tracked items. |
| **No value reconciliation** | No detector checks `materialized_stock_levels.total_cost == Σ ledger.total_cost` (WAC × qty vs sum of individual movement costs). |
| **No scheduled / automatic invocation** | Both detectors are API-only, manual. They fire on no event: not on period close, not nightly, not after count posting. |
| **No alert / notification on variance** | The service logs a `logger.warn()` but does not emit an event, outbox message, or notification. A divergence can sit undetected until someone queries the endpoint. |
| **Batch attribution pending note not surfaced to UI** | The `batchAttributionPending` list is returned in JSON but the controller may not present it clearly. It could be mistaken for a clean reconciliation. |
