# Chapter 05 — Count Snapshot Integrity

## What the snapshot captures

At `StockCountsService.create()` (stock-counts.service.ts:324-337):
```typescript
SELECT item_id, on_hand, average_cost
FROM materialized_stock_levels
WHERE tenant_id = ? AND warehouse_id = ?
```

This is a point-in-time read of `materialized_stock_levels`. The values are written into
`stock_count_lines.system_qty` (on_hand) per line. The `average_cost` is NOT persisted
to the line — it is re-joined at `saveLines` time from the live `materialized_stock_levels`.

## Live drift during the count

Once a count is created:

1. **`system_qty` on lines is frozen** — it reflects on_hand at count creation time and
   never updates, even as new movements occur during the count period.

2. **WAC used for variance value is NOT frozen** — `saveLines` joins `average_cost` from
   the live `materialized_stock_levels` at the time the counter enters counted quantities
   (stock-counts.service.ts:439-452). If a new receipt changes WAC between count creation
   and the counter saving lines, the variance value will use the new WAC, not the WAC at
   the count start.

3. **New items received after count creation are not on the count sheet** — if an item is
   received into the warehouse after the count is created, it appears in
   `materialized_stock_levels` but has no line in `stock_count_lines`. It will not be
   counted and any on-hand for it will not be verified by this count.

4. **Items sold/consumed during the count are not tracked against the snapshot** — the
   counter is physically looking at current on-hand, but the system_qty on the line reflects
   the snapshot. A sale of 5 units during the count means: system_qty shows N (pre-sale),
   counter physically finds N-5, variance = -5. But after posting, the adjustment is
   applied to the current on_hand (which already reflects the sale, so it is now N-5).
   The posted decrease would drive on_hand to N-10. This is the fundamental "moving target"
   problem with counts that occur while the warehouse is active.

## No freeze / lock mechanism

There is **no mechanism to freeze movements** during an active stock count. The system
does not:
- Block sales/adjustments/transfers to a warehouse with an active count.
- Log movements that occur after the count snapshot was taken.
- Compute a "movement-adjusted system qty" = `snapshot_qty + movements_since_snapshot`.

This is a deliberate MVP simplicity choice but it means count accuracy degrades the
longer the count takes and the more active the warehouse is during the count period.

## Concurrency: two counts on the same warehouse

The schema has no unique constraint preventing two `in_progress` counts on the same
warehouse simultaneously. The application code in `create()` does not check for existing
active counts on the same warehouse. Two concurrent full-count sheets on the same
warehouse is possible, and posting both would double-apply variance adjustments.

## Snapshot freshness guarantee

The snapshot query and the line insertions are inside a single DB transaction
(stock-counts.service.ts:370-404). This ensures the snapshot and line rows are consistent
with each other (no partial writes). However, the snapshot itself is not isolated from
concurrent writes at the Postgres transaction level — it uses the default READ COMMITTED
isolation, so it reflects committed on_hand at the moment the SELECT runs.
