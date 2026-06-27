# 08 — Open Questions / Candidate Gaps for the Auditor

This chapter is the honest audit brief for the Layer 5 hardening pass. Items are
grouped by severity. This is NOT a list of things to build blindly — the auditor
should verify each against the current codebase and determine which are correctness
bugs vs acceptable MVP deferral.

---

## CRITICAL / HIGH gaps

### G1: Stock movement ledger uses createdAt, not occurredAt

**File:** `apps/api/src/reports/stock-movement-ledger.service.ts` lines 88, 105, 118, 164-172

**Impact:** Date-range filters and row ordering use the insert timestamp, not the
effective movement date. Any backdated adjustment or count-variance posting (which
uses `count_date` as `occurredAt`) will appear in the wrong date bucket. Cross-period
reporting is broken for these cases.

**Fix:** Change `buildWhere()` and `orderBy()` to reference `stockLedgerEntries.occurredAt`.
Also update the `LedgerRow.date` field to return `occurredAt`, not `createdAt`.

---

### G2: Stock valuation asOfDate is accepted but silently ignored

**File:** `apps/api/src/reports/inventory-valuation.service.ts` lines 8-10, entire `aggregate()` method

**Impact:** The API contract promises historical valuation but delivers current state.
A user running the report "as of June 1" on June 27 gets current numbers. If on-hand
has changed, they get a wrong historical picture. This is documented in the code
comment but not surfaced to the user in the API response.

**Fix options:**
1. Remove `asOfDate` from the query schema until the ledger-replay approach is built (honest)
2. Implement ledger-replay: Σ(stock_ledger_entries.quantity, total_cost WHERE occurred_at ≤ asOfDate)
3. At minimum, add a `dataAsOf: "current"` field to the response distinguishing "requested asOfDate" from "actual data freshness"

---

### G3: Slow-moving / aging report is entirely absent

**Impact:** A standalone stockkeeper cannot identify dead stock for write-off decisions.
This is an essential report for any retail/pharma/grocery operation.

**What to build:** A ledger-derived query grouping items by last-outbound-movement date,
bucketed into aging tiers (0-30 / 31-60 / 61-90 / 90+ days). Reads `stock_ledger_entries`,
fully reconcilable by construction.

---

### G4: BatchExpirySchedulerService has C1 latent flaw (ALS context missing)

**File:** `apps/api/src/inventory/batches/batch-expiry-scheduler.service.ts`

**Impact:** The daily batch status transition (active → expiring → expired) may silently
fail for every tenant because `BatchesService.getTenantDb()` reads from ALS but the
scheduler runs outside a `tenantStore.run()` call. The Layer 4 hardening fixed the
identical flaw in the recon scheduler but NOT this one (explicitly deferred).

**Fix:** Wrap each tenant's call in `tenantStore.run({ tenantId }, callback)` mirroring
the fix applied to `StockCountsService`'s scheduler.

---

### G5: sourceModule post-filter corrupts pagination meta

**Files:**
- `apps/api/src/reports/stock-movement-ledger.service.ts` (sourceModule filter)
- `apps/api/src/inventory/reorder/reorder.service.ts` (status filter)

**Impact:** When filtering by `sourceModule` (movement ledger) or `status` (reorder),
the `count` sub-query runs without that filter, so `meta.total` (and therefore total
pages) reflects the unfiltered set. A client paginating by sourceModule=pos may receive
`meta.total = 5000` but only 200 rows match — pagination is misleading.

**Fix:** For `sourceModule`, add a derived column or case expression in SQL so it can
be a real predicate. For `status`, same approach — filter in SQL not in application code.

---

## MED gaps

### G6: No standalone period variance / shrinkage summary report

**Impact:** A manager cannot get "total inventory shrinkage this month" without querying
the DB directly. The variance is embedded in individual count detail views only.

---

### G7: Running balance resets per page in movement ledger

**File:** `apps/api/src/reports/stock-movement-ledger.service.ts` lines 123-137

**Impact:** Multi-page ledger reports show running balance starting from 0 on each page.
For a high-volume item with years of history, the balance on page 2 is meaningless.

**Fix:** Pre-query: `SELECT SUM(quantity) FROM stock_ledger_entries WHERE ... AND occurred_at < page_start_date` as a "balance carried forward" to seed the running balance.

---

### G8: No batch/serial dimension in movement ledger filters

**Impact:** Cannot drill into "show me all movements for batch LOT-2026-003" or
"show me the history of serial SN-12345" from the movement ledger. Must use raw DB.

---

### G9: docNumber is always null in movement ledger

**File:** `apps/api/src/reports/stock-movement-ledger.service.ts` line 126

**Impact:** Every row shows a UUID not a human-readable document reference.

---

### G10: No spec for stock-movement-ledger, inventory-valuation, or reorder services

No test files exist for:
- `reports/stock-movement-ledger.service.ts`
- `reports/inventory-valuation.service.ts`
- `inventory/reorder/reorder.service.ts`

---

## LOW gaps / deferred decisions

### G11: No cross-module GL reconciliation check

The inventory asset account balance in the GL should equal `Σ(materialized_stock_levels.total_value)`
across all warehouses for a tenant. No automated check verifies this. It would require
a cross-module query spanning `journal_entry_lines` (accounting) and `materialized_stock_levels`
(inventory), which is correct architecturally (reports can read both) but is not implemented.

### G12: Expiry report has no value-at-risk aggregation

The batch list shows individual batches. No management summary of "total value expiring
in 30/60/90 days" exists.

### G13: No frontend page for inventory-valuation report

The codemap frontend routes do not list a `/reports/inventory-valuation` page. The
service and controller exist but may not be accessible from the web app.

### G14: item_batches.qty_remaining not explicitly verified against ledger on expiry report

The expiry report reads `item_batches.qty_remaining` (a maintained projection). The
Layer 0 batch-reconciler exists but runs only on manual trigger, not on a schedule.
A drifted `qty_remaining` would show wrong "quantity at risk" in the expiry report.
