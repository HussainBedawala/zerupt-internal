# Accounting Phase F — MEDIUM/LOW sweep

All items verified against code and/or live before fixing. Ledger gate before
first write and after last write: `7.000000` (unchanged) — **NOT** 0.000000,
**pre-existing, not caused by any write in this session** (confirmed: no
journal entries were created or touched by any fix below; only close-checklist
template rows, a schema/index change, and error-copy edits). Flagging loudly
per protocol rather than attempting a correcting entry. This should be handed
to whoever owns the ledger-gate invariant to trace which prior session's write
left it unbalanced.

## 1. ACC-PER-003 (MED) — module-load-frozen clock — CONFIRMED, FIXED

`stock-adjustments.dto.ts:246` used `z.coerce.date().max(new Date())`. Zod
schemas are built once at module import, so `new Date()` evaluated ONCE at
process boot and froze "now" for the process's life — rejecting today's date
as "in the future" after the first moment past boot.

Repo-wide sweep for the same class (`grep -rn "new Date()"` across
`apps/api/src` and `apps/web/src` filtered to `.max(`/`.min(`/`z.coerce`/
schema files): **this was the only live hit.** Every other `new Date()` at
module scope is inside a Drizzle `.$onUpdate(() => new Date())` callback,
which is a function re-evaluated per-row-write, not a frozen value — not the
same trap.

`z.coerce.boolean()` sweep: **fully closed already.** `common/query-boolean.schema.ts`
is the shared primitive; the two remaining hits in `suppliers.dto.ts` and
`sales/customers/customers.dto.ts` are comments *warning about* the trap, not
live usages — both files use the explicit truthy-string parse.

**Fix:** `apps/api/src/inventory/stock-adjustments/stock-adjustments.dto.ts` —
replaced `.max(new Date())` with `.refine((d) => d.getTime() <= Date.now())`,
which evaluates on every parse.

**Test:** `stock-adjustments.dto.spec.ts` — 3 new cases: today's date parses
(classification: new, was previously untested and would have failed after the
first moment past module load), a genuine future date still rejects, and a
fake-timer test proving the check re-evaluates "now" per-parse rather than
using a value cached at import.

## 2. ACC-PER-002 (MED) — non-idempotent seed — CONFIRMED, FIXED

Live repro before fix: two `POST /tenant/close/templates/seed-default` calls
6 seconds apart created two active `Monthly Close` templates
(`298efc86…` and `3184ddb4…`, both `is_active=true`) in the gulf-auto-parts
tenant DB — exact match to the reported bug.

**Fix, two layers (native constraint over app validation, per house
preference):**
- `packages/db/src/schema/close-management.ts` — added a partial unique index
  `cct_one_active_default_idx` on `(tenant_id, legal_entity_id, period_type)
  WHERE is_active = true`. Judged worth adding at the DB layer because the app
  check-then-insert has a TOCTOU race under concurrent double-submit; the
  index is the actual backstop.
- `apps/api/src/close-management/close-template-crud.service.ts` —
  `seedDefault` now checks `findActiveTemplate` first and returns the existing
  template instead of creating a shadow copy.

**Migration:** `packages/db/drizzle/0316_add-close-template-active-unique-idx.sql`
— generated via `drizzle-kit generate`, applied to the local dev tenant DB via
`drizzle-kit migrate`. **Also manually applied to the gulf-auto-parts tenant's
own Postgres DB** (per-tenant DBs are separate from `zerupt_tenant_dev` —
`drizzle-kit migrate` only touches the dev DB pointed to by
`DIRECT_URL_TENANT`). Before applying the index to gulf-auto-parts, deactivated
the pre-existing duplicate rows found live (298efc86…, and two more created
by my own before/after-fix verification curls) so the unique index could be
created; one active row remains (`a98d1c32…`).

**Live verification after fix + rebuild + restart:** two consecutive
`seed-default` calls both returned the SAME id (`a98d1c32-f54f-450f-b995-96dd2d7b1d84`).

## 3 & 4. ACC-PER-007 / ACC-JRN-004 (MED) — audit shape — PARTIALLY CONFIRMED

**ACC-JRN-004 (journal post/reverse audit) — WITHDRAWN, already fixed.**
Read `journal-entries.controller.ts` end to end: `postDraft` already carries
`@Audited("JournalEntry", { action: AuditAction.Update })` with a comment
documenting the exact fix described in the brief (git blame: commit `b3c2f2f1`,
"accounting subledger, durable audit and close-management hardening" — already
landed by a prior session). `JournalReversalService.reverseEntry` already
writes a dedicated `auditLogService.append` for the ORIGINAL entry's
posted→reversed transition, inside the same transaction as the status flip,
with a comment explaining exactly why the HTTP interceptor cannot write it
(`entityId` keys off the response, which is the new reversing entry). No
further change needed here.

**ACC-PER-007 (period lock/unlock audit) — CONFIRMED, FIXED.**
`fiscal-period.controller.ts`'s `lockPeriod`, `unlockPeriod`,
`batchLockPeriods`, `batchUnlockPeriods`, and `reopenFiscalYear` used the bare
`@Audited("FiscalPeriod")` / `@Audited("FiscalYear")` decorator, defaulting to
the HTTP-method mapping (`POST` → `create`). `closeFiscalYear` already used the
override (`{ action: AuditAction.Update }`) — that is the "sibling that gets
it right" the brief points at. The service layer ALSO writes its own detailed
`auditLogService.append` (action=Update, real before/after) inside the same
transaction — so each of these routes legitimately produces two audit rows,
matching `closeFiscalYear`'s own established shape (one detailed business-context
row + one generic interceptor snapshot), but the SECOND (interceptor) row was
mislabelled `create` with a null before-state on the four uncorrected routes.

**Fix:** added `{ action: AuditAction.Update }` to all five routes'
`@Audited` decorators, converging every period/year lock-shape route on the
one pattern `closeFiscalYear` already used. No new mechanism invented.

**Test:** `fiscal-period.service.spec.ts` was NOT asserting decorator metadata
(decorators aren't exercised by unit tests against the service directly), so
no test needed changing for this part. `assertSoftLockOverrideAllowed`'s
signature changed (see item 6) and 9 spec fixtures needed a new required
`periodLabel` field — classification: **(a) stale in shape only**, the
fixtures asserted the SAME behavior, just needed the new field TypeScript now
requires.

## 5. ACC-PER-006 (MED) — off-by-one, hand-copied 3x — CONFIRMED, FIXED

Read all three copies (`opening-balance-import.service.ts`,
`opening-stock-import.service.ts`, `opening-party-import.service.ts`) —
byte-identical `buildRowsPreview`, each with a comment admitting it mirrors
the others ("kept local to avoid cross-service coupling"). The mappers
(`opening-*-import.mapper.ts`) emit `issue.rowIndex = i + 1` (1-based), but the
copied preview loop read `byRow.get(i)` with `i` 0-based — every lookup missed
its target row, and any issue on the LAST row (`rowIndex === totalRows`) was
dropped outright since the loop only ran to `rowCount - 1`. Confirmed latent
today: the web wizard renders `issues[]`, not `rowsPreview` — but latent today
is shipped tomorrow, per the brief.

**Fix:** extracted ONE shared helper,
`apps/api/src/opening-import/build-rows-preview.ts`, 1-based throughout (both
on input `issue.rowIndex` and on the returned `rowIndex`) so no conversion
happens at the boundary and the class of bug cannot recur. Removed all three
local copies; all three services now import the shared function.

**Test:** new `build-rows-preview.spec.ts`, 4 cases — issue lands on the row
the mapper actually reported (classification: new, previously untested), an
issue on the LAST row of a small file is no longer dropped, an issue exactly
at the 100-row preview boundary is not dropped, and a no-issues file returns
all-valid rows.

**Verification:** `npx jest opening-balance-import opening-stock-import
opening-party-import build-rows-preview --no-coverage` → 4 suites, 352 tests,
all green.

## 6. ACC-PER-008 + ACC-ARAP-004 (LOW) — internals leaking into user copy

**ACC-PER-008 (raw period UUID / internal param name) — CONFIRMED, FIXED, and
found to be far more widespread than the two named sites.**

- `FiscalPeriodService.assertSoftLockOverrideAllowed` (`fiscal-period.service.ts`)
  threw `` `Period ${periodResult.periodId} is soft-locked...` `` and
  `` `override the soft-lock on period ${periodResult.periodId}` `` — a raw
  period UUID where a document number/period label belongs. Fixed to use
  `periodResult.periodLabel` (e.g. "Jan 2026"), already computed and passed by
  every caller; widened the method's `Pick<>` to require it.
- `amend-saga-runner.service.ts:223` threw
  `"The fiscal period is soft-locked; provide softLockOverrideReason to amend into it"`
  — the internal request-body field name in user-facing copy. Fixed to name
  the period and say what to do ("Provide a reason to override the lock").
- **Sweep for siblings found ~29 more copies of the exact same
  `softLockOverrideReason` leak** across sales, purchase, journal-entries
  (receipts, invoices, debit notes, refunds, credit notes, receivable
  write-off, supplier payments, direct purchase, purchase invoices, landed
  costs, GRN confirm/void, supplier refunds, GRN cost corrections, purchase
  returns) — this is the "path divergence / hand-copied helper" pattern the
  addendum calls the most common defect class in this codebase, not a
  two-site fix.

**Fix at the primitive:** new shared
`apps/api/src/fiscal-period/soft-lock-override-required.error.ts` exporting
`softLockOverrideRequiredError(periodLabel, verb)` — a coded
`UnprocessableEntityException` naming the period by its human label, saying
what to do, never the internal field name. Scripted replacement of all 29
call sites (verified each still has `period.periodLabel` in scope — every site
already destructured a full `ValidatePeriodResult` as `period`). Two further
call sites (`journal-reversal.service.ts`, `journal-entry-draft.service.ts`)
already used a `CodedConflictException` with a real code and `periodLabel` —
only their message text still said "provide softLockOverrideReason"; fixed the
text only, kept the existing code/structure.

**ACC-ARAP-004 (duplicate-allocation raw invoice UUID) — NOT INVESTIGATED this
pass** (time-boxed; the sweep above consumed the budget allotted to item 6).
Flagging as an **open item** for a follow-up pass — the brief's own evidence
("its sibling over-allocation error correctly prints a document number") means
the fix pattern is already established in the codebase; it needs the same
"use the document number, not the id" treatment applied to the duplicate path.

**Verification:** `pnpm --filter @zerupt/api typecheck` clean after the sweep
(caught the 9 spec fixtures in item 3/4, and one import-placement bug from the
scripted edit landing inside a multi-line `import type {}` block — fixed).
Narrow suites re-run for every touched file (see the typecheck/test status
table at the end) — all passed except two PRE-EXISTING failures unrelated to
this change (see below).

## 7. ACC-PER-008b / ACC-JRN-005 (MED) — English-only refusals — PARTIALLY ADDRESSED

Confirmed: most `softLockOverrideReason` refusals were bare English strings
with no code at all (`throw new UnprocessableEntityException("...")`), so a
web client had nothing to key a translated string off.

**What was done:** the primitive fix in item 6
(`softLockOverrideRequiredError`) now attaches a stable code,
`PERIOD_SOFT_LOCK_OVERRIDE_REQUIRED`, to all 29 sites in one place, and the two
`CodedConflictException` sites already had `PERIOD_SOFT_LOCKED_NEEDS_REASON`.
This closes the "no code at all" half of the finding for this one refusal
family.

**What was NOT done (honest scope gap):** wiring ar/en label-layer copy in the
web app keyed off these codes, and auditing the OTHER refusal families named
in the finding (period/close/opening-balance error templates broadly, and the
"reverse/amend state blocks return `code: null`" claim specifically) is a
much larger surface — dozens of throw sites across amend adapters, period
gates, and opening-balance reconciliation — than this pass's remaining budget
covered. Recommend a dedicated follow-up pass scoped to: (1) grep every
`throw new (BadRequestException|ConflictException|UnprocessableEntityException)`
in `common/amend/`, `fiscal-period/`, `opening-balance/` with no `code`
argument, (2) give each a stable code, (3) add the ar/en pair in the web
message catalogs, verified with `i18n:check`.

## 8. ACC-COA-006 (MED) — raw Zod enum leaks — NOT INVESTIGATED

Not reached this pass (budget exhausted by the softLockOverrideReason sweep
in item 6, which turned out to be a 29-site fix rather than the 2 named
sites). Flagging as an **open item**. The described primitive (whatever
formats a Zod `ZodError` into an HTTP 400 body) should be checked for whether
it dumps `error.issues[].options` verbatim — if so, the fix is at that one
formatter, not per-DTO.

## 9. ACC-ARAP-002 (MED) — second AR aging on GMT clock — CONFIRMED, FIXED

Read `customer-ar-balance.service.ts` end to end. `agingBuckets()` and
`agingBucketTotals()` (used by `sales-overview` KPIs and, per the brief, the
overdue-notification scheduler) computed age via raw SQL
`current_date - due_date` — `current_date` is the Postgres SESSION's date,
and the connection is GMT, so for the first ~3 hours of every Kuwait
(UTC+3) or India (UTC+5:30) business day this reads YESTERDAY and every
invoice's age (and therefore its bucket) is off by one.

The rest of the file already imports and uses `resolveReportAsOf` correctly
for `getBalance`/`getFunctionalBalancesByCustomer` — only the two aging
methods still used the raw SQL date.

**Fix:** both methods now resolve `asOf` via
`resolveReportAsOf(db, tenantId, undefined)` (the same tenant-timezone
primitive `reports/shared/report-as-of.ts` — the one every other report's
as-of date already goes through) and bind it as `${asOf}::date` in place of
`current_date`.

**Scope note (honest, not a shortcut):** did NOT converge this service onto
the FIFO-settlement `reports/shared/aging-buckets.ts` primitive the brief
calls "the cleanest shared-primitive story in this codebase." That primitive
implements balance-forward credit-netting across a party's invoices — a
materially different bucketing algorithm from this service's simple
per-invoice `balance > 0` sum. Swapping algorithms blind, on a service feeding
live sales-overview KPIs and a notification scheduler, without time to verify
the two algorithms agree numerically on real data, is exactly the kind of
change the brief also warns against ("acting on it would have broken working
behaviour"). The bug that was actually reported and reproducible — wrong day,
wrong bucket boundary — is fixed via the tenant-local-date primitive. Full
architectural convergence onto `settleAndBucket` is a larger, riskier
follow-up, not done here.

**Verification:** `npx jest customer-ar-balance --no-coverage` → 17/17 green.
Live GMT-vs-tenant-local day boundary not independently reproduced in the
browser (would need to run exactly in the 00:00-03:00 GMT window, which this
session's wall clock was not in) — verified by code read + the identical
pattern already proven correct (and covered by tests) in
`resolveReportAsOf`'s own header comment and `ar-aging.service.ts`'s usage.

## 10. ACC-ARAP-003 (MED) — lying multi-currency AR aging export — CONFIRMED, FIXED

Read `apps/web/.../reports/ar-aging-report.tsx`. Confirmed: `formatCsvMoneyCell`
(the shared CSV money formatter) emits a BARE decimal — no currency symbol or
code — and the export had no `currency` column and no totals row at all. A
bookkeeper opening the CSV and summing the "Total" column blends every
currency present with no visual cue. The on-screen table has the identical
gap (row cells render via `formatMoney(r.x, {currency: r.currency})`, which
also calls the bare-number formatter — only the row's decimal-place count
hints at a currency change) but the brief scoped the fix to the export.

**Fix:** `handleExport` now:
1. Adds a `Currency` column (the row's own ISO code) so a mixed-currency row
   is visible in the file.
2. Adds a `Total (functional)` column using the row's `totalFunctional` field
   (already GL-tied, already converted to the report's ONE functional
   currency by the backend) — the column that IS safe to sum in Excel.
3. Appends a totals row built from `query.data.totals` (the same GL-tied
   functional totals the on-screen footer already shows), so the export can
   never disagree with the report it came from.

New i18n keys `arAging.col.currency` / `arAging.col.totalFunctional` added to
both `messages/en/reports.json` and `messages/ar/reports.json`.

**Verification:** `pnpm --filter @zerupt/web i18n:check` → passed, all locales
in sync. `pnpm --filter @zerupt/web typecheck` → clean. Did not independently
re-derive the specific 916.500/AED discrepancy figure from the brief (would
need the exact fixture data referenced there); the fix addresses the root
cause (no currency label, no functional total, no totals row) rather than a
one-off number.

## Pre-existing test failures observed (NOT caused by this session's changes)

- `supplier-payments.service.spec.ts` › "realizes an FX GAIN..." — fails on an
  unrelated `dueDate` field that a DIFFERENT concurrent session appears to be
  adding to AP settlement legs (visible mid-flight in the working tree; my own
  diff to this file is limited to the `softLockOverrideRequiredError` swap
  plus one import). Confirmed via `git diff --stat` that the `dueDate`
  plumbing is not part of my diff.
- `debit-notes.service.spec.ts` › "H1: proceeds when the expected baseline
  still matches" — fails on a "correctable quantity changed" conflict
  unrelated to soft-lock copy; my diff to this file is 5 lines (message +
  import only).

Both are pre-existing/concurrent-session artifacts of this shared dev tree,
not regressions from this pass — flagged per the shared-tree protocol rather
than silently ignored.

## Ledger gate

`SELECT round(sum(debit-credit),6) FROM journal_entry_lines WHERE
je.status IN ('posted','reversed')` → **7.000000**, both before my first
write and after my last. This is NOT zero and NOT caused by anything in this
session (no journal entry was created, voided, or edited by any fix above —
only close-checklist template rows, a DDL index, and exception-message text
changed). Reporting loudly per protocol. Recommend the next session trace
which prior write left this imbalance; did not attempt a correcting entry.

## Typecheck / i18n status

- `pnpm --filter @zerupt/api typecheck` — clean.
- `pnpm --filter @zerupt/web typecheck` — clean.
- `pnpm --filter @zerupt/web i18n:check` — passed, all locales in sync.
- API rebuilt once (`pnpm --filter @zerupt/api build`) and restarted once at
  the end of the session; verified the compiled `dist/` reflects source
  changes by grepping the compiled files, not just `dist/main.js` mtime.
  (Restart required a SECOND kill — the first `lsof -t | xargs kill` missed a
  stale process still holding port 3001 from an earlier boot; caught via
  `EADDRINUSE` in the log and fixed with `kill -9` on the actual PID.)

## Documents / schema created

- Migration `packages/db/drizzle/0316_add-close-template-active-unique-idx.sql`
  — applied to `zerupt_tenant_dev` via `drizzle-kit migrate`, and manually via
  `psql` to the gulf-auto-parts tenant DB (per-tenant DBs are separate; the
  drizzle-kit command only reaches the dev seed DB).
- Deactivated (not deleted) 3 duplicate `close_checklist_templates` rows in
  the gulf-auto-parts tenant DB during verification (one pre-existing
  duplicate reproducing ACC-PER-002 live, two created by my own before/after
  seed-default test calls). One active "Monthly Close" template remains:
  `a98d1c32-f54f-450f-b995-96dd2d7b1d84`. No financial documents were created;
  nothing added to `_documents-created.md` since close-checklist templates are
  not GL-affecting documents.
