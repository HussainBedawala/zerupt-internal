# 05 — `materialized_stock_levels`: The Read Model and Its Consistency Contract

## Why a materialized view?

`stock_ledger_entries` is append-only and grows unboundedly. If the POS had to `SUM(quantity)`
across the entire ledger every time a cashier scanned an item, the query would slow down
as the business grows. After 5 years of operations with 50,000 items × 10 warehouses ×
200 movements per item per year, that is 100 million rows to aggregate on every sale.

`materialized_stock_levels` solves this by maintaining an incrementally-updated running
total. Instead of summing from the beginning of time, each movement is applied as a
delta to the current row:

```
on_hand   += quantity      (inbound: +qty, outbound: −qty)
totalValue  ← recomputed   (not subtracted — see below)
averageCost ← recomputed
```

The key design constraint: **this is a transactional materialized view, not an
eventually-consistent cache.** The materialized level is updated in the SAME Postgres
transaction as the stock ledger entry that caused it. There is no async process, no
reconciliation job, no lag. The moment the transaction commits, both the ledger and the
materialized level are in sync.

## Schema: `materialized_stock_levels`

Schema file: `packages/db/src/schema/inventory-costing.ts` (lines 341–457)

| Column | Purpose |
|---|---|
| `id` | Row PK |
| `tenant_id` | Defense-in-depth isolation |
| `legal_entity_id` | Organizational scope |
| `warehouse_id` | The location dimension |
| `item_id` | The item dimension |
| `on_hand` | Net current quantity (signed — can be negative under flexible policy) |
| `in_transit` | Informational: quantity in transit TO this warehouse (no COGS effect) |
| `average_cost` | Current WAC per unit. For WAC items: used for COGS at sale time. For FIFO items: maintained for informational purposes only — actual COGS comes from cost layers. |
| `last_cost` | Unit cost of the most recent inbound movement (fallback/reporting) |
| `total_value` | Current inventory value = `on_hand × average_cost` (maintained incrementally) |
| `currency` | Functional currency of the legal entity (denormalized for query perf) |
| `last_movement_at` | Timestamp of the last ledger entry that updated this row |
| `created_at`, `updated_at` | Standard audit timestamps |

**Unique constraint:** `(item_id, warehouse_id)` — one row per item per warehouse.

## The update rules (enforced by `StockLevelService`)

### Inbound movements (GRN, sale return, adjustment increase)

```
INSERT INTO materialized_stock_levels (item_id, warehouse_id, on_hand, average_cost, ...)
VALUES (qty, newWac, ...)
ON CONFLICT (item_id, warehouse_id) DO UPDATE SET
  on_hand       = on_hand + qty
  average_cost  = newWac          (pre-computed by WAC engine)
  last_cost     = unitCost
  total_value   = (on_hand + qty) × newWac
  last_movement_at = now
```

The `newAverageCost` is pre-computed by `WacEngineService` before the upsert, so
`StockLevelService` is a pure storage layer — it does not recalculate cost.

### Outbound movements (sale, adjustment decrease, etc.)

```
UPDATE materialized_stock_levels SET
  on_hand     = on_hand - qty
  total_value = round((on_hand - qty) × average_cost, 6)
  last_movement_at = now
WHERE item_id = ? AND warehouse_id = ?
```

**Critical: `total_value` is recomputed from `(on_hand − qty) × average_cost`, NOT
subtracted as `total_value − totalCost`.** This is intentional. `average_cost` is stored
rounded to 6dp, and `qty × WAC` is also rounded to 6dp — repeatedly subtracting a
rounded value accumulates penny drift over hundreds of transactions. Recomputing from the
stored (already-rounded) `average_cost` keeps the subledger self-correcting on every
outbound. The COGS GL credit still uses the exact `qty × WAC`; the tiny residual is
surfaced by the reconciliation detector, not silently masked.

See `stock-level.service.ts` lines 454–481 for the comment and implementation.

### Negative-stock true-up path

When `on_hand` was negative at the time of a sale (under flexible policy), the WAC engine
records the cost of those "pre-sold" units at the stale prior WAC. When a GRN later
brings stock in and covers the negative position, a true-up adjustment reconciles the
materialized `total_value` to the GL:

```
true_up_reduction = (qty_covered × stale_WAC) − (qty_covered × new_WAC)
```

The `trueUpReduction` is subtracted from `total_value` in the SAME upsert that processes
the GRN, so the materialized value ties exactly to the GL inventory account. See
`stock-level.service.ts` lines 282–316 for the full logic.

## The consistency contract

The contract is simple: **for any committed transaction, `on_hand` in
`materialized_stock_levels` equals `Σ quantity` in `stock_ledger_entries` for the same
`(item_id, warehouse_id)` pair.**

This is maintained by:
1. Every write to `stock_ledger_entries` is accompanied by a write to
   `materialized_stock_levels` IN THE SAME TRANSACTION
2. `StockLevelService` requires an explicit `tx` parameter on all write methods —
   it is impossible to call `upsertInbound` or `decrementOutbound` outside a transaction
3. `decrementOutbound` throws `NotFoundException` if no row exists for the
   `(item_id, warehouse_id)` — preventing a sale from creating phantom negative stock

## Verifying the contract: the reconciliation query

The audit should run this query to verify integrity on the dev DB:

```sql
SELECT
  sle.item_id,
  sle.warehouse_id,
  SUM(sle.quantity)          AS ledger_sum,
  msl.on_hand                AS materialized_on_hand,
  SUM(sle.quantity) - msl.on_hand AS discrepancy
FROM stock_ledger_entries sle
JOIN materialized_stock_levels msl
  ON sle.item_id = msl.item_id
 AND sle.warehouse_id = msl.warehouse_id
GROUP BY sle.item_id, sle.warehouse_id, msl.on_hand
HAVING ABS(SUM(sle.quantity) - msl.on_hand) > 0.000001
ORDER BY ABS(SUM(sle.quantity) - msl.on_hand) DESC;
```

A clean result (zero rows) confirms the materialized view is consistent with the ledger.
Any rows returned indicate a divergence that must be investigated before production.

## Lifecycle: row creation and row deletion

- A row is **created** on the first inbound movement for a `(item_id, warehouse_id)` pair
  (`upsertInbound` with `ON CONFLICT DO UPDATE`)
- A row is **never deleted** — even if `on_hand = 0`, the row remains (it records that
  this item was once tracked at this warehouse)
- `on_hand` can be negative (under flexible policy)
- `total_value` is 0 when `on_hand = 0` (not deleted, just zeroed)

## Indexes

| Index | Purpose |
|---|---|
| `msl_item_warehouse_key` (unique) | Enforces one row per item per warehouse; implicit index |
| `msl_item_warehouse_idx` on `(tenant_id, item_id, warehouse_id)` | POS hot path: COGS lookup at sale time |
| `msl_warehouse_item_idx` on `(warehouse_id, item_id)` | Inventory valuation report for a warehouse |
| `msl_zero_or_negative_stock_idx` WHERE `on_hand <= 0` | Low stock / reorder alert scanning |
| `msl_legal_entity_id_idx`, `msl_warehouse_id_idx` | FK restrict-check performance |

The partial index for zero/negative stock is a design highlight: it keeps the "find items
that need reordering" query fast without scanning the full table, which grows proportionally
to the item catalogue.

## Design quality assessment

The materialized stock level design is sound:
- Transactional consistency (not eventual) is the right choice for a real-time POS
- The self-correcting `total_value` formula prevents penny drift
- The true-up path for negative-stock receipts is sophisticated and correct
- The pessimistic `SELECT FOR UPDATE` (`getLevelForUpdate`) prevents concurrent sales
  from double-decrementing the same row

The one open question is the dimension granularity: currently keyed on `(item_id,
warehouse_id)`, which means batch-level and serial-level on-hand requires joining to
`item_batches` and `item_serial_numbers` separately. See Chapter 02.
