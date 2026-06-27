# 00 — Overview & Scope: Inventory Reporting Layer

## Where we are in the building

```
        ┌──────────────────────────────────────────┐
        │ Layer 5: Reporting                        │  ← YOU ARE HERE
        │  (valuation, movement, batch/expiry,      │
        │   reorder, stock-take variance)            │
        ├──────────────────────────────────────────┤
        │ Layer 4: Counts & Period Integrity        │
        │          (stock-count atomic post,        │
        │           count_date, recon schedulers)   │
        ├──────────────────────────────────────────┤
        │ Layer 3: Valuation & Costing + GL Handoff │
        │          (WAC, COGS, outbox)              │
        ├──────────────────────────────────────────┤
        │ Layer 2: Movement Engine + Reservations   │
        │          (attribution, FEFO, ATP)         │
        ├──────────────────────────────────────────┤
        │ Layer 1: Master Data                      │
        │          (items/UOM/locations)            │
        ├──────────────────────────────────────────┤
        │ Layer 0: Stock Ledger Foundation          │
        │          (immutable spine, occurredAt)    │
        └──────────────────────────────────────────┘
```

## What a standalone stockkeeper needs

A person running a warehouse with NO accounting, NO POS, NO sales module must be
able to answer every operational question from the inventory module alone:

| Question | Report | Source of truth |
|---|---|---|
| What is my stock worth right now? | Stock Valuation | stock_ledger_entries Σ OR materialized_stock_levels |
| What happened to item X at warehouse Y between dates D1-D2? | Stock Movement Ledger | stock_ledger_entries (occurredAt) |
| Which batches are expiring soon or already expired? | Batch/Expiry Report | item_batches.expiry_date |
| Which items haven't moved in 90+ days? | Slow-Moving / Aging | stock_ledger_entries (most recent movement) |
| What do I need to reorder? | Reorder Report | materialized_stock_levels vs item_reorder_config |
| How did my physical count compare to the system? | Stock-Take Variance | stock_counts / stock_count_lines + posted adjustments |

## The tie-to-ledger principle

This is the inventory equivalent of the accounting golden rule ("every report must
tie to the trial balance"). For inventory:

> Every balance and valuation number shown in any inventory report must be
> derivable from `stock_ledger_entries` by aggregating `quantity` (and/or
> `total_cost`) over the correct filters. If a report reads `materialized_stock_levels`
> instead and that cache has drifted from the ledger, the report is silently wrong.

The practical test: take any on-hand quantity from any report. Run:

```sql
SELECT SUM(quantity)
FROM stock_ledger_entries
WHERE item_id = ? AND warehouse_id = ? AND tenant_id = ?;
```

The two numbers must agree to 6 decimal places. If they do not, either the cache
has drifted (a Layer 0/3 detector fires) or the report has a bug.

The same test applies to value: `materialized_stock_levels.total_value` must equal
`Σ(stock_ledger_entries.unit_cost × quantity)` at any moment the WAC is stable.

## As-built report inventory (Layer 5 audit scope)

| Report | Service file | Reads ledger? | As-of-date? | Spec |
|---|---|---|---|---|
| Stock Valuation (grouped by category) | `reports/inventory-valuation.service.ts` | NO — reads cache | NO (echoes param only) | ch 01 |
| Stock Levels (per item/warehouse) | `reports/stock-levels-report.service.ts` | NO — reads cache | NO | ch 01 |
| Stock Movement Ledger | `reports/stock-movement-ledger.service.ts` | YES — ledger | dateFrom/dateTo only | ch 02 |
| Batch/Expiry Report | `inventory/batches/batches.service.ts` (getExpiringBatches) | NO — item_batches | N/A | ch 03 |
| Slow-Moving / Aging | ABSENT | — | — | ch 03 |
| Reorder Report | `inventory/reorder/reorder.service.ts` | NO — reads cache | NO | ch 04 |
| Stock-Take Variance | embedded in `stock-counts/stock-counts.service.ts` | Partial | count_date (Layer 4) | ch 05 |

## Chapter map

| Chapter | File | What it covers |
|---|---|---|
| 00 | `00-overview.md` | This overview |
| 01 | `01-stock-valuation.md` | on-hand × WAC; cache vs ledger; as-of-date gap |
| 02 | `02-stock-movement-ledger.md` | drill from balance to movement; filters; occurredAt bug |
| 03 | `03-batch-expiry-slow-moving.md` | FEFO, expiry, slow-moving/aging (absent) |
| 04 | `04-reorder-report.md` | below-reorder-point, reorder qty, ATP awareness |
| 05 | `05-stock-take-variance.md` | count vs system; posted adjustment tie |
| 06 | `06-reconcile-by-construction.md` | which reports read ledger vs cache; drift risk |
| 07 | `07-as-of-period-reporting.md` | point-in-time; count_date; fiscal period alignment |
| 08 | `08-gaps-for-auditor.md` | honest gap list (absent reports, cache reads, irreconcilable) |
| 09 | `09-test-landscape.md` | which paths have specs; coverage |
