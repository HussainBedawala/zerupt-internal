# 06 — The Reconcile-by-Construction Principle

## The principle

In the accounting module's Layer 5, every financial report was designed so that it
reads from the general ledger and is therefore reconcilable by construction — if
the ledger is correct, the report is correct; they cannot diverge silently.

For inventory, the equivalent is:

> Every quantity and value shown in any inventory report must be derivable from
> `stock_ledger_entries` by aggregating `quantity` (and/or `total_cost`) over
> the correct filters. Reports that read `materialized_stock_levels` instead
> are approximations — correct when the cache is in sync, silently wrong when it drifts.

## Current landscape: ledger vs cache reads

| Report | Reads ledger directly? | Reads cache? | Reconcilable by construction? |
|---|---|---|---|
| Stock Movement Ledger | YES (stock_ledger_entries) | NO | YES — but uses createdAt not occurredAt (ordering bug) |
| Stock Valuation (inventory-valuation) | NO | YES (materialized_stock_levels) | APPROX — drifts if cache drifts |
| Stock Levels Report | NO | YES (materialized_stock_levels) | APPROX |
| Reorder Report | NO | YES (materialized_stock_levels) | APPROX |
| Batch Expiry Report | NO | YES (item_batches.qty_remaining) | APPROX — item_batches is a ledger-derived projection |
| Slow-Moving / Aging | ABSENT | — | — |
| Stock-Take Variance (embedded in count) | PARTIAL — variance qty re-read from cache at post; posted adjustment is ledger entry | Both | APPROX for display; CORRECT when posted |
| FEFO Picker (BatchPickerService) | YES (ledger-derived) | NO | YES |

## The two-tier consistency model

Layer 0 established that `materialized_stock_levels` is updated IN THE SAME TRANSACTION
as each `stock_ledger_entries` insert. This means under normal operation, cache and
ledger are always in sync.

The risk of drift comes from:
1. **Bug in the application layer** — a code path that writes to the ledger but fails
   to update the materialized table (or vice versa). The Layer 0 reconciliation detector
   catches this retroactively.
2. **Direct DB manipulation** — anyone with direct Postgres access can mutate
   `materialized_stock_levels` without touching the ledger (the Postgres trigger only
   guards `stock_ledger_entries` against UPDATE/DELETE, not `materialized_stock_levels`).
3. **Migration errors** — a migration that touches on_hand values in one table but
   not the other.
4. **Scheduler failures** — the batch-expiry scheduler has the C1 ALS flaw (ch 03);
   `item_batches.qty_remaining` may be stale on specific tenants if the scheduler fails.

## The detector gap

Layer 4 added a recon scheduler (`StockCountsService` recon detector) that runs
`detectQuantityVariances()` and `detectReservedQuantityVariances()` on a cron schedule
per tenant, wrapped in proper ALS context.

BUT: the Layer 0 batch-reconciler (`reconcileBatchRemaining`) has no scheduled
automation — it is an internal method called only from the Layer-0 detector endpoint
(manual HTTP call). There is no nightly sweep of batch projection vs ledger.

## Drift risk surface

```
stock_ledger_entries (ground truth)
    ↓ atomically in same tx
materialized_stock_levels ← what ALL valuation/level/reorder reports read
    ↓ incremental projection (maintained by MovementAttributionService)
item_batches.qty_remaining ← what expiry report reads
```

If drift enters `materialized_stock_levels`, all downstream reports (valuation,
levels, reorder) show wrong numbers simultaneously. The detector fires on the next
scheduler run (nightly by Layer 4), but between the drift event and the next sweep,
the reports are silently wrong.

## How accounting solved this (the mirror)

In accounting Layer 5, every report reads from `journal_entry_lines` (the immutable
ledger). The trial balance IS the source; every financial statement is a filtered
view of it. There is no separate materialized cache — the database indexes make the
ledger fast enough for report queries.

Inventory has a harder performance problem (per-movement update to on-hand is needed
for real-time availability checks), which is why the materialized cache exists. But
the consequence is that inventory reports are NOT reconcilable by construction in the
same way financial reports are.

## The 10-year design recommendation

A report that reconciles by construction should:
1. Always read from `stock_ledger_entries` for quantity and value
2. JOIN `materialized_stock_levels` only as a performance optimization for the CURRENT
   snapshot (and validate it matches the ledger Σ inline)
3. For historical/period queries, ALWAYS use `stock_ledger_entries` with `occurred_at`
   date filter — never use the cache for point-in-time queries

Reports that read only the cache should be labeled as "approximate" in the UI and
include a "last reconciled" timestamp from the detector.
