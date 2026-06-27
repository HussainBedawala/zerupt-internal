# 05 — Stock-Take / Count Variance Report

## Purpose

After a physical count, the stockkeeper must see:
1. Item by item: what the system said (system qty), what they counted (counted qty),
   the variance (counted - system), and the value of that variance
2. Which variances were posted (shrinkage/overage adjusted in the ledger) vs which
   are still pending
3. The total shrinkage value for the period (ties to the GL Inventory Shrinkage expense)

## As-built

The stock-take variance is NOT a standalone report in `apps/api/src/reports/`. It is
embedded in the stock-counts workflow:

**Service:** `apps/api/src/inventory/stock-counts/stock-counts.service.ts`
**Controller:** `apps/api/src/inventory/stock-counts/stock-counts.controller.ts`
**Routes:**
- GET `tenant/inventory/stock-counts` — list all count sessions
- GET `tenant/inventory/stock-counts/:id` — get one count with lines (variance view)
- POST `tenant/inventory/stock-counts/:id/approve-post` — post variances as adjustments

**Schema:** `packages/db/src/schema/stock-counts.ts`
- `stock_counts` header: status, warehouseId, count_date (added Layer 4), legalEntityId
- `stock_count_lines`: itemId, systemQty (snapshot), countedQty, varianceQty,
  varianceValue (recomputed at post from live WAC per Layer 4 fix F7), notes, isRecounted

### What the variance report shows

When a stockkeeper GETs `tenant/inventory/stock-counts/:id`, they see:
- `lines[]` each with: itemId, systemQty, countedQty, varianceQty, varianceValue
- Count header: status (draft/in_review/pending_review/posted/cancelled)
- varianceValue is stored on the line (computed at approve-post from live WAC, per Layer 4 F7)

### Tie to the ledger (Layer 4 fix)

After Layer 4 hardening:
- `approvePost()` wraps all variance adjustments in ONE atomic transaction with
  `SELECT FOR UPDATE` on the count header (fixes F2 CRIT: no more partial-failure
  or concurrent double-post)
- For non-serial lines: `adjustmentQty = countedQty - liveOnHand` where `liveOnHand`
  is re-read INSIDE the locked transaction at post time (fixes F1 CRIT: count = truth,
  not frozen snapshot)
- `count_date` (Layer 4, migration 0114) threads through as the `occurredAt` of the
  posted adjustment entry in `stock_ledger_entries` — this means the variance entry
  appears at the correct effective date in the stock movement ledger

### Reconciliation path for the variance

Posted variance adjustments create rows in:
1. `stock_adjustments` (adjustment header, adjustment lines)
2. `stock_ledger_entries` (with `source_document_type = 'adj'`, `occurred_at = count_date`)
3. GL journals via outbox (DR Inventory Shrinkage / CR Inventory Asset for losses,
   or reverse for overages)

This means variance values ARE in the ledger and CAN be queried by:
```sql
SELECT SUM(total_cost)
FROM stock_ledger_entries
WHERE source_document_type = 'adj'
  AND tenant_id = ?
  AND occurred_at BETWEEN ? AND ?
  AND quantity < 0  -- losses only
```

But there is no dedicated variance REPORT that surfaces this aggregation. A stockkeeper
cannot currently get "total shrinkage this month" without querying the DB directly.

### What is absent

| Feature | Status |
|---|---|
| Standalone variance report (list all counts + total variance value in period) | ABSENT |
| Variance summary by item category | ABSENT |
| Shrinkage trend over multiple counts | ABSENT |
| Cross-count comparison (same item, multiple counts over time) | ABSENT |
| Variance tie to GL Shrinkage account (cross-module check) | ABSENT |

The variance view is embedded in the count detail (`GET /stock-counts/:id`), which
means a manager can only see one count at a time. There is no aggregated view across
multiple counts or periods.

## Connection to count_date (Layer 4)

`count_date` was added in Layer 4 (migration 0114, `stock_counts.count_date timestamptz NOT NULL`).
This is the effective date of the physical count. When the variance is posted,
`postAdjustmentInTx()` uses `count_date` as `occurredAt` on the ledger entry.

For reporting:
- A range query on `stock_ledger_entries.occurred_at` for adjustment entries WILL capture
  count-variance postings by their count date (correct)
- The stock movement ledger report (ch 02) uses `createdAt` not `occurredAt` — so a
  variance posted for a count dated last week would appear in the wrong date bucket

## Summary of gaps

| Gap | Severity | Notes |
|---|---|---|
| No standalone variance report (period summary) | HIGH | Manager can't get total shrinkage for the month |
| Variance view embedded in count detail only (single count at a time) | MED | No multi-count aggregate |
| Movement ledger uses createdAt, not occurredAt — variance entries appear in wrong bucket | HIGH | Inherited from ch 02 bug |
| No GL shrinkage tie (total variance value vs shrinkage GL account) | MED | Cross-module reconciliation absent |
