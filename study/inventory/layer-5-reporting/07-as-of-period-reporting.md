# 07 — As-Of / Period Reporting

## The problem

A stockkeeper or auditor routinely asks:
- "What was my on-hand for item X at warehouse Y on June 1st?"
- "What was my total inventory value at the end of Q1?"
- "What movements happened in May?"

These are **point-in-time** and **period-bounded** queries. They require filtering
movements by their EFFECTIVE date (`occurredAt`), not by when they were system-inserted
(`createdAt`).

## What occurredAt enables

Layer 0 hardening added `occurred_at timestamptz NOT NULL` to `stock_ledger_entries`
(schema: `inventory-costing.ts` line 166, index `sle_item_warehouse_occurred_at_idx` at
line 237-243). The design specification says:

> "occurredAt = effective movement date (NOT NULL), distinct from createdAt; FIFO + all
> date-range reports order by occurredAt (createdAt tiebreak)."

Layer 4 added `count_date timestamptz NOT NULL` to `stock_counts` (migration 0114),
threaded as the `occurredAt` of posted count-variance adjustments.

## What the reports actually use

| Report | Date field used | Correct? |
|---|---|---|
| Stock Movement Ledger | `created_at` for ordering AND date filter | NO — should be `occurred_at` |
| Stock Valuation | No date filter applied (asOfDate echoed but ignored) | NO — no historical support |
| Stock Levels | No date filter | N/A (current-only) |
| Reorder | No date filter | N/A (current-only) |
| Batch Expiry | `expiry_date` on item_batches (correct for its purpose) | YES |
| Stock-Take Variance | `count_date` stored; used as adjustment `occurredAt` | YES (Layer 4 fix) |

## How to compute point-in-time on-hand correctly

The only correct way to answer "what was on-hand at date D?" is:

```sql
SELECT
  item_id,
  warehouse_id,
  SUM(quantity) AS on_hand_as_of
FROM stock_ledger_entries
WHERE tenant_id = ?
  AND occurred_at <= ?  -- the as-of datetime
  [AND item_id = ?]
  [AND warehouse_id = ?]
GROUP BY item_id, warehouse_id
```

This query is NOT available in any current report. The `inventory-valuation` service
accepts `asOfDate` but ignores it (reads materialized cache regardless).

## How to compute period movements correctly

```sql
SELECT
  movement_type,
  SUM(quantity) AS total_qty,
  SUM(total_cost) AS total_value
FROM stock_ledger_entries
WHERE tenant_id = ?
  AND occurred_at >= ?   -- period start
  AND occurred_at < ?    -- period end (exclusive)
  AND item_id = ?
GROUP BY movement_type
```

This is what the stock movement ledger SHOULD do. Currently it uses `created_at`
which breaks any backdated movement (e.g. a count with count_date = last week).

## Fiscal period alignment

Layer 4 verified (`F9`) that provisioning seeds an open fiscal period. The inventory
module uses `assertPeriodOpen()` to block backdating beyond closed fiscal periods.

This means the inventory `occurredAt` date is constrained to be within an open fiscal
period — the same boundary the accounting module uses. This is the correct alignment:
- A stock movement with `occurredAt = 2026-05-31` cannot be posted if the May period
  is closed
- All movements in a period are therefore bounded and a period-end snapshot via
  Σ(occurred_at ≤ period_end) is reliable

## The as-of snapshot algorithm (not implemented)

For the `asOfDate` valuation feature to work correctly:

1. Accept `asOfDate` in the query
2. Run a ledger Σ query: `SELECT item_id, warehouse_id, SUM(quantity), SUM(total_cost) FROM stock_ledger_entries WHERE occurred_at <= asOfDate GROUP BY ...`
3. Compute WAC at that date from cost layers (or use `unit_cost` weighted by `quantity` per movement — this is the incremental WAC replay)
4. Return on-hand × WAC-at-date as the historical valuation

This is more expensive than reading the cache but is correct. An index on
`(item_id, warehouse_id, occurred_at)` exists (`sle_item_warehouse_occurred_at_idx`)
and would make this performant for most tenant sizes.

## Summary

The `occurredAt` infrastructure from Layer 0 and `count_date` from Layer 4 are
prerequisites for correct period reporting that ARE IN PLACE at the schema level.
The reports layer has NOT been updated to use them:
- Stock movement ledger uses `createdAt` everywhere
- Valuation has no temporal query at all
- No period-summary report exists for inventory (the accounting equivalent is trial balance per period)
