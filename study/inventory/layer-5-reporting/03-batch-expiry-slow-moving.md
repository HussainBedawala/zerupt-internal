# 03 — Batch/Lot Expiry Report + Slow-Moving / Aging

## Batch/Lot Expiry Report

### Purpose

A standalone stockkeeper in pharma, grocery, or cosmetics must know:
1. Which batches have already expired (quarantine / write-off)
2. Which batches expire within the next N days (proactive action before stock is unsellable)
3. The quantity and value at risk per batch (to assess write-down exposure)

### As-built: BatchesService.getExpiringBatches

**Service:** `apps/api/src/inventory/batches/batches.service.ts`
**Controller:** `apps/api/src/inventory/batches/batches.controller.ts`
**Route:** GET `tenant/inventory/batches` (with expiry filter params)
**Spec:** `apps/api/src/inventory/batches/batches-expiry.service.spec.ts`

The service exposes a `getExpiringBatches(tenantId, options)` method that queries
`item_batches` directly. Filters: `status` (active/expiring/expired), `expiryBefore`
(date), `warehouseId?`, `itemId?`.

**What it reads:** `item_batches` table — NOT `stock_ledger_entries`. The `qtyRemaining`
field on `item_batches` is the maintained projection (updated by
`MovementAttributionService.incrementBatchRemaining()` from Layer 2a).

**Scheduler:** `apps/api/src/inventory/batches/batch-expiry-scheduler.service.ts`
Daily cron at 01:00 UTC transitions batches:
- `active` → `expiring` when `expiry_date <= now() + warning_window_days`
- `active/expiring` → `expired` when `expiry_date < now()`

**Known flaw (Layer 4 deferred flag):** `BatchExpirySchedulerService.runDailyExpirySweep()`
iterates tenants and calls `this.batchesService.markExpiredBatches(tenantId)`. However,
`BatchesService.getTenantDb()` reads from Async Local Storage (ALS) tenant context.
The scheduler runs from a `@Cron` handler with NO `tenantStore.run()` wrapping — the
same C1 critical flaw that was fixed in Layer 4 for the recon scheduler. **Batch
expiry transitions may silently fail on every tenant, every night.** Logged in the
hardening log as the "identical C1 latent flaw."

### FEFO (First-Expiry First-Out) picker

**Service:** `apps/api/src/inventory/batches/batch-picker.service.ts` (Layer 2a)

`BatchPickerService.pick()` queries `stock_ledger_entries` to derive `qtyRemaining`
per batch (Σ ledger.quantity grouped by batch_id), then picks the lowest
`expiry_date` batch first. This is ledger-derived FEFO — correct by construction.

However this is the PICK ENGINE for sales/POS operations, not a standalone expiry
REPORT. The report surface (what a stockkeeper sees in the UI) is the `item_batches`
table via the batches controller — a different, cache-derived view.

### Gap: no dedicated "Expiry Report" with value at risk

There is no report that shows: batch | item | warehouse | expiry_date | qty_remaining |
unit_cost | total_value_at_risk | status. The batches controller exposes the raw list
but no aggregated view for management reporting (total value expiring in 30/60/90 days,
by category, by warehouse).

---

## Slow-Moving / Aging Report

### As-built: ABSENT

There is no slow-moving or aging report anywhere in:
- `apps/api/src/reports/`
- `apps/api/src/inventory/`
- The reports codemap

**Definition:** An item is "slow-moving" if it has had no outbound movement
(sale/transfer-out/adjustment-decrease) for more than N days (configurable threshold,
e.g. 90 days). Aging groups it into buckets: 0-30 / 31-60 / 61-90 / 90+ days without
movement.

**What would be needed:**
```sql
SELECT
  item_id,
  warehouse_id,
  MAX(occurred_at) FILTER (WHERE quantity < 0) AS last_outbound_at,
  now() - MAX(occurred_at) FILTER (WHERE quantity < 0) AS days_since_last_movement,
  SUM(quantity) AS on_hand,
  AVG(unit_cost) AS avg_cost -- or from materialized
FROM stock_ledger_entries
WHERE tenant_id = ?
GROUP BY item_id, warehouse_id
HAVING now() - MAX(occurred_at) FILTER (WHERE quantity < 0) > INTERVAL '90 days'
   OR MAX(occurred_at) FILTER (WHERE quantity < 0) IS NULL
```

Join to `items` and `materialized_stock_levels` for name/value. This is a pure
ledger query — no cache needed — and reconciles by construction.

**Severity of absence:** HIGH for a pharma/grocery tenant. LOW for a simple retail tenant
(they can infer it from stock-levels report with zero sales but it's not actionable).
A standalone stockkeeper absolutely needs this for year-end write-off decisions.

---

## Summary

| Feature | Status | Source |
|---|---|---|
| Batch expiry list (active/expiring/expired) | PRESENT | item_batches (cache) |
| Daily expiry status transition | PRESENT but C1 flaw | BatchExpirySchedulerService |
| FEFO picker for sales | PRESENT (ledger-derived) | BatchPickerService |
| Expiry report with value-at-risk aggregation | ABSENT | — |
| Slow-moving / aging report | ABSENT | — |
| Lot-level movement history (drill into a batch) | ABSENT from reports module | — |
