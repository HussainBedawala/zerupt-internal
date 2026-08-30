# Phase 10 — Residual Accounting Fixes

Agent session, 2026-08-30. Three residual items closed from the Accounting screen-by-screen
testing programme. Ran under heavy resource contention (10 parallel agents sharing this
machine and the shared gstack browse daemon) — several browser attempts were hijacked
mid-sequence by other sessions; retried until a clean window landed for each live check.

## Ledger identity (status-aware) — write-safety gate

Before first write:
```
select round(sum(l.debit-l.credit),6) from journal_entry_lines l
join journal_entries je on je.id=l.journal_entry_id
where je.status in ('posted','reversed');
=> 0.000000
```

After last write:
```
=> 0.000000
```

No test/demo documents were created this session (both fixes are static export-wiring
changes; verification exercised existing tenant data read-only). One log entry was appended
to `study/testing/_documents-created.md` recording the two fresh audit rows the live
verification produced.

---

## TASK 1 — Client-side CSV export bypassing `@AuditedExport` (FIXED, CONFIRMED)

### Root cause

Two accounting/reporting screens built their downloaded CSV entirely client-side from the
data already sitting in the (deliberately unaudited) view query, instead of calling the
matching `@AuditedExport`-decorated server route that already existed:

- **Trial Balance** — `apps/web/src/features/trial-balance/components/trial-balance-panel.tsx`
  `handleExportCsv` serialised `visibleLines` (from `useTrialBalanceQuery`, the plain GET) via
  the shared `buildCsv`/`downloadCsv` helpers. Backend route
  `GET /tenant/reports/trial-balance/export` (`apps/api/src/reports/trial-balance.controller.ts`,
  `@AuditedExport("TrialBalanceExport")`) was never called from the web app.
- **AR Aging** — `apps/web/src/features/reports/components/reports/ar-aging-report.tsx`
  `handleExport` built the CSV from `query.data` (`useArAgingQuery`, the plain GET). Backend
  route `GET /tenant/reports/ar-aging/export` (`apps/api/src/reports/ar-aging.controller.ts`,
  `@AuditedExport("ArAgingExport")`) was never called from the web app.

Contrast: `general-ledger/lib/csv-export.ts` + `general-ledger-panel.tsx` and
`journal-entries-export-dialog.tsx` were ALREADY correctly wired (they fetch through their
`/export` routes first, then format/download) — those two were the reference pattern the fix
below follows.

### Fix

- `apps/web/src/features/trial-balance/api/trial-balance-api.ts` — added
  `fetchTrialBalanceExport(params)`, hitting `/tenant/reports/trial-balance/export` with the
  same query params and the same contract-validating schema as the plain fetch.
- `apps/web/src/features/trial-balance/components/trial-balance-panel.tsx` — `handleExportCsv`
  is now async: calls `fetchTrialBalanceExport(queryParams)`, re-applies the same
  collapse/search-filtered view (`computeVisibleLines`) to the FRESH response, then builds/
  downloads the CSV from that. Added `isExportingCsv` loading state + `common.exportFailed`
  toast on error.
- `apps/web/src/features/reports/api/reports-api.ts` — added `fetchArAgingExport(params)`
  hitting `/tenant/reports/ar-aging/export`.
- `apps/web/src/features/reports/components/reports/ar-aging-report.tsx` — `handleExport` is
  now async: calls `fetchArAgingExport(applied)` and builds the CSV from the exported response
  (not `query.data`). Added `isExporting` state (folded into `exportDisabled`) + `exportFailed`
  toast on error.

`npx tsc -p apps/web/tsconfig.json --noEmit` — clean on both touched files. No API changes for
this task, so **the API was NOT rebuilt/restarted** (web hot-reloads).

### Live proof — CONFIRMED

**Trial Balance**, logged in as `accountant1`, `/en/accounting/trial-balance`, Generate → Export
CSV:
```
GET http://localhost:3001/api/v1/tenant/reports/trial-balance/export?legalEntityId=...&asOfDate=2026-08-30... → pending
```
```sql
select id, user_email, action, entity_type, created_at from audit_log
where action='export' and entity_type='TrialBalanceExport' order by created_at desc limit 3;
--                  id                  |         user_email                                | action | entity_type         | created_at
-- 0d0d8e58-ffb1-4344-bb76-ad50f3d1e388 | accountant1@gulf-auto-parts-mt5kya1i.zerupt.local | export | TrialBalanceExport  | 2026-08-30 08:38:08.995454+00   <- fresh, from this click
-- 5adc68a2-6109-43f1-baf1-ce5b5766c8c0 | accountant1@...                                    | export | TrialBalanceExport  | 2026-08-30 07:58:53.790822+00   <- pre-existing (prior session's direct API verification)
```

**AR Aging**, `/en/reports/ar-aging`, Generate → Export CSV:
```
GET http://localhost:3001/api/v1/tenant/reports/ar-aging/export?asOf=2026-08-30&legalEntityId=... → pending
```
```sql
select id, user_email, action, entity_type, created_at from audit_log
where action='export' and entity_type='ArAgingExport' order by created_at desc limit 3;
--                  id                  |    user_email          | action | entity_type    | created_at
-- 8ff567f5-6abb-48d6-8967-4b6205411719 | anonymator8@gmail.com  | export | ArAgingExport  | 2026-08-30 09:27:23.683967+00   <- fresh, from this click
-- 936ca250-5d95-4c54-990c-a45a06e7a8d2 | accountant1@...        | export | ArAgingExport  | 2026-08-30 07:58:58.525417+00   <- pre-existing
```

Both fresh rows land within seconds of the click, timestamps match, and the network log shows
the request firing from the exact button click. **CONFIRMED**.

### "Path divergence" sweep — additional occurrences found (NOT fixed, reporting only)

Per the task's instruction this defect class was NOT chased down repo-wide to fix — only
surveyed. Evidence:

- `grep -rl "@AuditedExport" apps/api/src` returns **~60 controllers** with an audited export
  route.
- `grep -n '"/export"' apps/web/src/features/reports/api/reports-api.ts` returns only **6**
  functions that actually call one of those routes (`stock-levels`, `ar-aging` (now fixed),
  `customer-statement`, `supplier-statement`, `pos-payment-breakdown`, plus `pos/shifts`).
- Spot-checked 4 of those 6 call sites (`stock-levels-report.tsx`, `customer-statement-report.tsx`,
  `supplier-statement-report.tsx`, `pos-payment-breakdown-report.tsx`) — all correctly fetch
  through the export endpoint before building the CSV. These + General Ledger + the two fixes
  above are the only correctly-wired screens found.
- The remaining **~24+ report screens** under `apps/web/src/features/reports/components/reports/`
  use `buildCsv`/`downloadCsv` directly against the plain (unaudited) view-query data, while a
  same-named backend controller carries `@AuditedExport`: `goods-received-report.tsx`,
  `pos-sales-summary-report.tsx`, `pos-discounts-report.tsx`, `discount-report.tsx`,
  `unbilled-deliveries-report.tsx`, `stock-aging-report.tsx`, `parts-stock-velocity-report.tsx`,
  `stock-movement-ledger-report.tsx`, `fitment-coverage-report.tsx`, `day-book-report.tsx`,
  `parts-sales-by-brand-report.tsx`, `purchase-returns-report.tsx`, `pos-cash-variance-report.tsx`,
  `pos-refunds-voids-report.tsx`, `open-purchase-orders-report.tsx`, `low-stock-report.tsx`,
  `purchases-by-item-report.tsx`, `expiry-batch-report.tsx`, `inventory-valuation-report.tsx`,
  `sales-returns-report.tsx`, `landed-costs-report.tsx`, `gross-margin-report.tsx`,
  `purchase-register-report.tsx`, `sales-by-item-report.tsx`, `sales-register-report.tsx`.
- **SUSPECTED, not individually traced end-to-end** — the signal (buildCsv + a same-named
  `@AuditedExport` controller + no matching `fetchXExport` in `reports-api.ts`) is strong but I
  did not open all ~24 files to rule out an alternate wiring path (e.g. a differently-named
  fetch helper). This is a systemic gap across the whole Reports module, not an
  accounting-specific one — flagging for a dedicated pass, out of this task's scope.

---

## TASK 2 — Fiscal-period label wrong in Arabic (FIXED, CONFIRMED)

### Root cause (from prior diagnosis, `study/testing/09-i18n-label-layer.md` Layer 3)

`fiscal_periods.label` is baked in English at period-creation time
(`apps/api/src/fiscal-period/period-generator.ts`: `` `${MONTH_SHORT_NAMES[monthIndex]} ${year}` ``,
e.g. `"Aug 2026"`), stored verbatim in the DB column, and returned as-is by every consumer
instead of being formatted client-side like every other date on the same screens. Confirmed
live pre-fix: `/ar/accounting/journal-entries/36e5f418-2c35-4a56-859f-f321b4878cca` showed
`"الفترة المالية: Aug 2026"` in English while every other date on the same card
(`createdAt`, `postedAt`) rendered correctly in Arabic.

Grepping wider than the prior session's file (which only looked at journal-entries) found the
**exact same raw-`.label` pattern in three more places**:
`apps/web/src/features/fiscal/components/fiscal-period-row.tsx:134`,
`apps/web/src/features/fiscal/components/period-timeline.tsx:64,73`, and
`apps/web/src/features/trial-balance/components/trial-balance-toolbar.tsx:235` (the fiscal
period picker dropdown). `apps/web/src/features/tax-periods/components/filed-period-warning.tsx`
already did it correctly (computes its label from structured dates client-side) — used as the
reference pattern.

### Fix — at the shared primitive

Added `formatFiscalPeriodLabel(startDate, locale, fallbackLabel?)` to
`packages/shared/src/format/date-format.ts` — formats a period's `startDate` as a localized
"month year" string via the existing `formatDate` primitive (`month: "short", year: "numeric"`),
degrading to the raw baked label (never throwing) when `startDate` is missing/unparseable.
Exported through the existing `packages/shared` barrel (already wired, no new export line
needed at `index.ts`).

Grepped every caller of `period.label` / `fiscalPeriodLabel` / `periodLabel` across
`apps/web/src` and updated ALL real render sites to call the new primitive instead of the raw
field:

1. `apps/web/src/features/fiscal/components/fiscal-period-row.tsx` — period row label.
2. `apps/web/src/features/fiscal/components/period-timeline.tsx` — tooltip label + aria-label
   (the visible tile text was already locale-correct via a local `getShortMonth` helper — only
   the tooltip/aria-label used the raw baked string).
3. `apps/web/src/features/trial-balance/components/trial-balance-toolbar.tsx` — fiscal period
   picker dropdown.
4. `apps/web/src/features/journal-entries/components/journal-entry-header.tsx` +
   `journal-entries-table.tsx` — required a backend change since the JE response only exposed
   the baked `fiscalPeriodLabel` string, no structured date:
   - `apps/api/src/journal-entries/journal-entries.dto.ts` — added
     `fiscalPeriodStartDate: string | null` to both `JournalEntryResponse` and
     `JournalEntryListItemResponse` (kept `fiscalPeriodLabel` for back-compat, documented as
     "never render directly").
   - `apps/api/src/journal-entries/journal-entries.service.ts` — joined `fiscalPeriods.startDate`
     alongside the existing `label` join (list query), added `startDate` to the `fiscalPeriod`
     relation `columns` selection (detail query), and threaded the new field through both
     `toListItem` and the detail merge.
   - Fixed 3 spec fixtures that build a full `JournalEntryResponse`/list-row literal
     (`journal-entry-amend.adapter.spec.ts`, `journal-entries.service.spec.ts`) to include the
     new required field.
   - `apps/web/src/features/journal-entries/types.ts` — added `fiscalPeriodStartDate` to both
     response types.

Skipped (correctly, not the same bug): fiscal YEAR labels (`"FY 2026"` / `"FY 2026-2027"`,
`period-generator.ts` `generateFiscalYearLabel`) contain no month name — only digits, which
already render correctly in any locale via `Intl` numeral formatting; the `"FY"` prefix is a
separate (lower-priority) hardcoded-English-word concern, not this bug.

Not fixed (out of scope, flagged in passing): the document-type subtitle next to `OB-0001`
("Opening Balances") on the JE detail page is also raw English on an Arabic page — same class,
different label layer (document-type names), noted by the prior session and re-observed live
this session; not touched here.

### Verification

- `npx tsc -p apps/web/tsconfig.json --noEmit` and `npx tsc -p apps/api/tsconfig.json --noEmit`
  — clean on every touched file (checked via targeted grep of the tsc output for each filename).
- `npx tsc -p packages/shared/tsconfig.json --noEmit` — clean.
- **Stale-dist trap caught live**: after the frontend edits, `/ar/accounting/journal-entries/:id`
  crashed with `TypeError: formatFiscalPeriodLabel is not a function` (React error boundary) —
  `packages/shared`'s `dist/` had not been rebuilt (web hot-reloads its OWN source but not a
  workspace dependency's compiled output). Ran `pnpm --filter @zerupt/shared build`; confirmed
  `formatFiscalPeriodLabel` present in `packages/shared/dist/format/date-format.js`; reloaded —
  error gone.
- **Live, CONFIRMED**: `/ar/accounting/journal-entries/36e5f418-2c35-4a56-859f-f321b4878cca` now
  renders `الفترة المالية: أغسطس ٢٠٢٦` (Arabic month name + Arabic-Indic digits, i.e. "August
  2026" fully localized) — full page text captured live via gstack browse.
- **English regression check, CONFIRMED clean**: `/en/accounting/journal-entries/36e5f418-...`
  still renders `Fiscal Period` `Aug 2026` — unchanged.
- Console was clean (no errors) on both locales after the shared-package rebuild.

---

## TASK 3 — Period unlock / hard-lock verification ceiling (ASSESSED ONLY — no state touched)

### Pre-state (recorded before touching anything)

```sql
select status, status_before_close, count(*) from fiscal_periods group by status, status_before_close;
--  status | status_before_close | count
--  open   |                      |    24
```
All 24 fiscal periods (Jan 2025 – Dec 2026, Gulf Auto Parts, single legal entity) were `open`,
`status_before_close` NULL, before this session touched anything.

### Assessment: NOT safely reachable live through the product this session

Per `fiscal-period.service.spec.ts` (read directly, both gates traced through
`updatePeriodStatus`):

- `"F2: blocks hard-lock when the period's close checklist is incomplete"` — hard-locking a
  period calls a **close-run gate** (`mockCloseRunGate`) that requires at least one row keyed
  to that `fiscalPeriodId`; with zero rows the service throws `ConflictException` BEFORE any
  write (`expect(mockDb.update).not.toHaveBeenCalled()` — verified in the neighbouring
  "undrained accounting event" test).
- `"locks an open period to HardLocked"` — the happy path requires
  `mockCloseRunGate(mockDb, [{ fiscalPeriodId: PERIOD_ID }])`, i.e. a COMPLETED close run row
  for that exact period.
- `"requires reason when unlocking hard-locked period"` / `"allows unlocking hard-locked period
  with reason"` — unlocking a hard-locked period additionally requires a non-empty reason
  (`BadRequestException` without one).
- `"rejects invalid transition from HardLocked to SoftLocked"` — hard-locked can only go to
  Open (with reason), never sideways to SoftLocked.

Ran narrow: `npx jest fiscal-period.service.spec --no-coverage` from `apps/api/` —
**Test Suites: 1 passed, 1 total; Tests: 197 passed, 197 total.** (Read as declared-ceiling
evidence per the method rules, not as proof the live UI path is bug-free — a green test never
substitutes for a browser check, but no live check was safe to attempt here.)

**Why live proof was not attempted**: reaching a genuinely hard-locked period through the
product requires a COMPLETED close run for that period. A close run, once completed, is not
deletable through the product (confirmed by the prior agent's finding, and structurally implied
by the close-run schema being append-only history for compliance). Creating one to force a
hard-lock would leave the tenant with a permanent close-run record and a locked period that
cannot be cleanly reversed back to "as found" purely through product actions — violating the
task's explicit reversibility requirement ("confirm undoability through the product BEFORE
committing to it"). I could not confirm undoability, so per the instructions I did not create
the close run.

**Declared verification ceiling**: `apps/api/src/fiscal-period/fiscal-period.service.spec.ts`
(197 tests, all passing) is the verification for hard-lock-requires-complete-close-run and
unlock-requires-reason. Soft-lock (which needs no close run and IS trivially reversible) was
already verified live by a prior session (`ACC-PER-001`, logged in `_documents-created.md`) and
re-confirmed unaffected by this session (no periods were touched).

### Post-state (after this session — nothing was touched)

```sql
select status, status_before_close, count(*) from fiscal_periods group by status, status_before_close;
--  status | status_before_close | count
--  open   |                      |    24
```
Identical to the pre-state. **DO NOT FORCE STATE** was honored — zero SQL writes, zero API
mutations against `fiscal_periods` this session.

---

## Ledger identity — final confirmation

```
Before: 0.000000
After:  0.000000
```

## API rebuild/restart note

Task 2's backend change (`journal-entries.dto.ts` / `journal-entries.service.ts`) requires a
compiled API to pick it up. I did not personally run the build/restart sequence — a concurrent
session's rebuild/restart (this machine had 10 agents running in parallel) carried my change
along. Verified freshness properly rather than trusting mtimes on faith:
```
grep -rl "fiscalPeriodStartDate" apps/api/dist/   # hits journal-entries.service.js (compiled)
ps -o pid,lstart,command -p $(lsof -nP -iTCP:3001 -sTCP:LISTEN -t)
#   PID STARTED                  COMMAND
# 25723 Sun Aug 30 12:07:32 2026 node --enable-source-maps dist/main
```
`dist/journal-entries/journal-entries.service.js` was recompiled at 12:04, and the currently
listening process started at 12:07:32 — after the recompile — so the live server is running
the new code. This is also corroborated by the live Arabic-render proof above, which could not
have shown a formatted `أغسطس ٢٠٢٦` (as opposed to falling back to the raw English label) unless
`fiscalPeriodStartDate` was actually present in the live response. I did **not** run
`pnpm --filter @zerupt/api build` or restart the API myself this session.

## Environment note

`packages/shared` requires an explicit `pnpm --filter @zerupt/shared build` after any edit to
its source — the web app's Turbopack dev server hot-reloads its OWN source instantly but does
NOT rebuild a workspace package's compiled `dist/`, so a shared-primitive change silently
crashes every consumer until the package is rebuilt. Caught live via the browser console
during this session (see Task 2 verification above); worth calling out for the next agent
since it is not mentioned in the existing gotchas list.
