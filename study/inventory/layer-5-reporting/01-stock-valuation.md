# 01 — Stock Valuation Report

## Purpose

The stock valuation report answers: "What is my entire inventory worth right now,
broken down by category and warehouse?" It is the balance-sheet face of inventory —
it should equal the Inventory Asset account balance in the GL (which is maintained
by the DR Inventory / CR COGS + AP outbox events from Layer 3).

## As-built: two overlapping reports

### 1. Stock Valuation (grouped by category)

**Service:** `apps/api/src/reports/inventory-valuation.service.ts`
**Controller:** `apps/api/src/reports/inventory-valuation.controller.ts`
**Route:** GET `tenant/reports/inventory-valuation`
**Frontend:** not in the reports codemap frontend routes (no /reports/inventory-valuation page listed)

**Query params:** `asOfDate?`, `warehouseId?`, `categoryId?`

**What it reads:**

```
materialized_stock_levels
  INNER JOIN items
  INNER JOIN warehouses
  LEFT JOIN item_categories
WHERE tenant_id = ? [AND warehouse_id = ?] [AND category_id = ?]
ORDER BY category_name ASC, sku ASC
```

`inventory-valuation.service.ts` lines 77-99: the Drizzle query joins
`materializedStockLevels` (not the ledger). The service reads `onHand`,
`averageCost`, `totalValue` directly from the materialized cache.

**Output shape:**
- Grouped by category → `ValuationCategory[]` each with `rows[]` and `subtotal`
- `grandTotal` = Σ category subtotals
- `summary` with totalStockValue, totalSkus, totalUnits, avgValuePerSku
- `categoryBreakdown[]` for charting

### 2. Stock Levels Report (per item/warehouse flat)

**Service:** `apps/api/src/reports/stock-levels-report.service.ts`
**Route:** GET `tenant/reports/stock-levels`
**Query params:** `warehouseId?`, `categoryId?`

This is a flat list (one row per item/warehouse) also reading `materialized_stock_levels`.
Adds a `status` field (negative / OutOfStock / Low / OK) derived by `deriveStatus()`.

## The critical gap: cache not ledger

**Both valuation reports read `materialized_stock_levels`, NOT `stock_ledger_entries`.**

This means:
1. **No true as-of-date support.** The `asOfDate` param is accepted and echoed in the
   response but NOT used to filter. The service comment at `inventory-valuation.service.ts`
   line 8-10 acknowledges this explicitly: "True historical snapshots would require
   replaying stock_ledger_entries up to the requested date, which is a future enhancement."
2. **Drift risk.** If the materialized cache diverges from the ledger (Layer 0 detector
   catches this, but detectors run on a schedule not synchronously), the valuation report
   shows a wrong number. The GL's Inventory Asset account may not match.
3. **No reconciliation output.** The report does not show "ledger Σ" alongside
   "materialized value" — a reconciliation delta would surface drift immediately.

## Does valuation reconcile to the GL?

Theoretically yes — by construction — because every stock movement writes to both
`stock_ledger_entries` AND `materialized_stock_levels` inside the same DB transaction
(Layer 0 design principle). The inventory-event.listener.ts then enqueues a GL journal
(outbox) for the same movement.

Practically, the reconciliation chain is:

```
stock_ledger_entries (totalCost)
    ↓ materialized atomically
materialized_stock_levels.total_value
    ↓ echoed by report
inventory-valuation report grandTotal
    ↔ should equal
GL Inventory Asset account balance (from journal entries posted by inventory-event.listener)
```

No tooling currently verifies this end-to-end cross-module tie (inventory value =
GL asset balance). The accounting Layer 5 general ledger can be used to drill into
the inventory asset accounts but there is no automated cross-report reconciliation check.

## WAC correctness

WAC (Weighted Average Cost) is maintained incrementally in `materialized_stock_levels.average_cost`
by `InventoryCostingService` on every inbound movement. The formula is:

```
new_wac = (old_total_cost + new_qty × new_unit_cost) / (old_qty + new_qty)
```

For outbound movements, WAC is unchanged (Layer 3 design). For serial-tracked items,
specific-ID cost is used for COGS but WAC is still used for the balance.

The valuation report multiplies `on_hand × average_cost` which should equal
`materialized_stock_levels.total_value`. The service reads `totalValue` directly
rather than re-computing on-the-fly, which avoids floating-point divergence.

## Summary of gaps

| Gap | Severity | Notes |
|---|---|---|
| As-of-date reads cache not ledger | HIGH | Param accepted but unused; explicitly documented in code |
| No GL cross-tie check | MED | No automated inventory-asset vs valuation reconciliation |
| inventory-valuation has no frontend route listed in codemap | LOW | May be backend-only or accessed directly |
| Batch/lot breakdown absent from valuation | LOW | Can't see value per batch from this report |
