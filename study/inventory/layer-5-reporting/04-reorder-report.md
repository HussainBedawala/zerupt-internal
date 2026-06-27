# 04 — Reorder Report

## Purpose

The reorder report answers: "What do I need to buy (or make) right now?" It compares
current on-hand against configured reorder points and safety stock thresholds, and
suggests the quantity to reorder (and optionally the preferred supplier).

A standalone stockkeeper uses it to trigger purchase orders without manually reviewing
every item's stock level.

## As-built

**Service:** `apps/api/src/inventory/reorder/reorder.service.ts`
**Controller:** `apps/api/src/inventory/reorder/reorder.controller.ts`
**Route:** GET `tenant/inventory/reorder`
**DTO:** `apps/api/src/inventory/reorder/reorder.dto.ts`
**Spec:** NO spec file found for reorder.service.ts.

### What it reads

```
materialized_stock_levels (on_hand)
  INNER JOIN items (name, sku, reorder_level fallback)
  LEFT JOIN item_reorder_config (reorder_point, safety_stock, reorder_qty, max_level,
            lead_time_days, preferred_supplier_id)
  LEFT JOIN warehouses
  LEFT JOIN suppliers
WHERE tenant_id = ?
  AND (
    COALESCE(config.reorder_point, items.reorder_level, '0')::numeric >= msl.on_hand::numeric
    OR (config.max_level IS NOT NULL AND msl.on_hand::numeric > config.max_level::numeric)
  )
ORDER BY on_hand ASC  (most urgent first)
```

Source: `reorder.service.ts` lines 48-115 (the base query).

### Derived status (application layer)

After the DB fetch, the service derives a `ReorderStatus` per row:
- `out` — on_hand <= 0
- `low` — 0 < on_hand <= reorder_point
- `overstock` — on_hand > max_level (only when max_level configured)

Status filter (`query.status`) is applied in application layer after the DB fetch,
NOT as a SQL predicate — so it does not reduce DB scan and does not affect pagination
count (same issue as stock-movement-ledger sourceModule post-filter).

### Suggested reorder quantity

```
suggestedQty = MAX(reorder_qty, reorder_point - on_hand + safety_stock)
```

Falls back to `reorder_point - on_hand` when no `reorder_qty` or `safety_stock`
configured. Computed in application code.

### Generate PO action

The service exposes `generatePo(tenantId, input)` which calls
`PurchaseOrdersService.create()` to create a draft PO from the suggestion.
This is a write action, not a report, but it is part of the reorder workflow.

## ATP (Available-to-Promise) awareness

**ATP is NOT incorporated into the reorder report.**

The reorder decision is based purely on `on_hand` vs `reorder_point`. It does not
subtract `reserved` quantity (from `stock_reservations`, built in Layer 2b) from on-hand
before comparison, nor does it add `inTransit` (from in-transit transfers or open POs)
to on-hand before comparison.

**Impact:**
- An item may show as needing reorder when on_hand = 2 below reorder_point, but a
  transfer-in of 50 units is already in transit — a PO would double-order.
- An item may not show as needing reorder when on_hand is above reorder_point, but
  most of that on_hand is reserved for committed sales orders — net available is negative.

True ATP formula:
```
available = on_hand - reserved + incoming_transfers + open_po_qty
```

None of these adjustments are applied. `stock_reservations.reserved_qty` (built in
Layer 2b) exists but is not joined into the reorder report.

## Reorder KPIs endpoint

The service also exposes `getKpis(tenantId, warehouseId?)` which returns:
- `totalItemsBelowReorder`, `totalItemsOutOfStock`, `totalItemsOverstock`
- `totalSuggestedOrderValue` (sum of suggestedQty × avg_cost for out/low items)

These are all derived from the same materialized cache query.

## No lead-time or demand-forecast awareness

The reorder report does not incorporate:
- Lead time days (stored in `item_reorder_config.lead_time_days` but not used to
  compute "days of stock remaining" or "reorder by date")
- Demand velocity (average daily usage, derived from stock_ledger_entries outbound
  movements — not computed anywhere)
- Dynamic reorder point based on demand × lead time (IAS 2 / supply chain best practice)

For the MVP retail use case this is acceptable. For a serious wholesale or pharma
operator, demand-driven reorder is essential.

## Summary of gaps

| Gap | Severity | Notes |
|---|---|---|
| Reads cache (materialized_stock_levels) not ledger | LOW | Acceptable — reorder is operational, not financial |
| Status filter applied post-DB (pagination count wrong) | MED | Same pattern as stock-movement-ledger sourceModule |
| ATP: reserved qty not subtracted | MED | Overstates available; may under-trigger reorder |
| ATP: incoming PO/transfer qty not added | MED | May over-trigger reorder |
| No demand velocity / lead-time reorder computation | LOW | MVP acceptable; needed for advanced use |
| No spec file | LOW | Untested service |
