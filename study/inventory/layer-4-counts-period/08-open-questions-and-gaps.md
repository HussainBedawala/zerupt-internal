# Chapter 08 — Open Questions & Candidate Gaps for the Auditor

These are weaknesses discovered in this study. Severity assessed from a standalone
stockkeeper / inventory manager perspective.

---

## G1 — CRITICAL: Count posting is NOT atomic across multiple adjustment calls

**File:** stock-counts.service.ts:700-774 (`approvePost`)

Up to 4 separate `StockAdjustmentsService.create()` calls are made sequentially, outside
any wrapping transaction. If call #2 or #3 fails (e.g., period closes between calls,
network error to Neon, unhandled exception), the count ends in a partially-posted state:
- status remains `pending_review` (final status update at line 786 not reached)
- some ledger entries already written
- retry will double-post the already-succeeded variances (no idempotency key)

**Fix candidate:** Wrap all `stockAdjustments.create()` calls in a single transaction, or
introduce a per-count idempotency mechanism (e.g., a `source_doc_id = count_id` column on
`stock_adjustments` with a unique constraint so a retry is a no-op for already-posted ones).

---

## G2 — HIGH: No count-date on variance adjustments (period alignment wrong)

**File:** stock-counts.service.ts:703-742, stock-adjustments.service.ts:122

Count variances always post with `occurredAt = new Date()` (approval wall clock). A count
conducted on Dec 30 but approved Jan 2 posts into January. Shrinkage, surplus, and spoilage
discovered during the December count are misattributed to January.

**Fix candidate:** Add an optional `countDate` field to `CreateStockCountInput` (set at
creation time) and thread it as `occurredAt` on the `StockAdjustmentsService.create()` calls
from `approvePost`. The period guard will then correctly reject approval if the count date
falls in a closed period.

---

## G3 — HIGH: No concurrent-count uniqueness guard on warehouse

**File:** stock-counts.service.ts:304 (create), packages/db/src/schema/stock-counts.ts

No constraint or application check prevents two `in_progress` counts on the same warehouse
simultaneously. Double-posting is possible.

**Fix candidate:** Partial unique index on `stock_counts (tenant_id, warehouse_id)` WHERE
`status IN ('in_progress', 'pending_review', 'approved')`. This blocks creating a second
active count while one is open.

---

## G4 — HIGH: Partial count not warned at posting

**File:** stock-counts.service.ts:596-602 (`approvePost`)

Lines with `countedQty IS NULL` are silently skipped. A count sheet that is only 60% filled
posts without any warning. The stockkeeper and manager have no notification that items were
skipped.

**Fix candidate:** At submit or approve-post time, count `null countedQty` lines. If any
exist, either throw a `BadRequestException` (strict mode) or include a `skippedItemCount`
in the response so the UI can warn the manager.

---

## G5 — MEDIUM: `recount` flag is cosmetic

**File:** stock-counts.service.ts, stock-counts.dto.ts

The `recount` flag on lines cannot be acted upon — no service method resets a line back
to uncounted state or transitions the count from `pending_review` back to `in_progress`.

**Fix candidate:** Add `StockCountsService.reopen(tenantId, id)` that transitions
`pending_review` → `in_progress` and clears `countedQty` on all lines with `recount=true`.

---

## G6 — MEDIUM: WAC used for variance value is live, not snapshotted

**File:** stock-counts.service.ts:439-452 (`saveLines`)

`average_cost` is re-joined from `materialized_stock_levels` at line-save time, not
captured at count creation. A receipt between creation and line-save changes the WAC and
changes the variance value silently.

**Fix candidate:** Capture `average_cost` into `stock_count_lines` at creation time
(add `snapshot_cost` column), and use that frozen cost for variance value computation.

---

## G7 — MEDIUM: No freeze mechanism for active-warehouse counts

No mechanism blocks movements to a warehouse with an active count. See Chapter 05 and
Chapter 07 (open-warehouse problem). The correctness impact depends on warehouse
activity level during the count.

**Fix candidate:** An optional warehouse-level "lock for count" flag that temporarily
blocks inbound/outbound movements (other than the count itself) while a count is active.
This is a significant operational feature.

---

## G8 — MEDIUM: No inventory pre-close checklist

No guided workflow ensures:
- All counts are `posted` or `cancelled` before period close.
- All transfers are `received` or `cancelled` (no in-transit at period end).
- `detectQuantityVariances` was run and returned clean.

**Fix candidate:** Add inventory tasks to `close_management.ts` close checklist templates,
or create a lightweight inventory pre-close endpoint that checks all three conditions.

---

## G9 — LOW: Serial status update not atomic with ledger write in `approvePost`

**File:** stock-counts.service.ts:740-773

The serial status transition (available → defective for missing serials) runs as a
separate `db.update()` call after `StockAdjustmentsService.create()` (which writes the
ledger). These are not inside a single transaction. A crash between the two would leave
the ledger updated but serials still showing `available`.

**Fix candidate:** Pass serial status transitions into the adjustment service, or wrap
the serial UPDATE inside the same DB transaction that the adjustment uses.

---

## G10 — LOW: Detector for orphaned ledger rows (reverse LEFT JOIN gap)

`detectQuantityVariances` uses a LEFT JOIN from `materialized_stock_levels`. If a ledger
row exists but the materialized row was accidentally deleted, the divergence is NOT caught.

**Fix candidate:** Add a second query in `detectQuantityVariances` that selects ledger
rows with no corresponding materialized row (ANTI-JOIN).
