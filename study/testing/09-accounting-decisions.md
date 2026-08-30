# Phase F — four accounting decisions, implemented

Date: 2026-08-30. Tenant: Gulf Auto Parts (Kuwait, KWD 3dp).
Migration: `packages/db/drizzle/0317_audit-scope-and-journal-approval.sql`.

Migrator target line, quoted verbatim from the run that applied it:

```
[drizzle:tenant] target database "zerupt_tenant_gulf_auto_parts_mt5kya1i" on host "ep-fancy-king-a11gw110-pooler.ap-southeast-1.aws.neon.tech"
```

Ledger gate (status-aware) before the first write and after the last: `0.000000` both times.
Tenant left as found: 0 non-open periods, 0 rows with `status_before_close`, 0 closed fiscal years,
`requireJournalApproval` back to `false`.

---

## The one thing all four share: no new mechanism was invented

Every decision reuses machinery that already existed. The single genuinely new artefact is a
`@AuditedExport` decorator, and that exists precisely so the GET/audit rule did NOT have to be relaxed.

New shared file: `apps/api/src/auth/second-approver-liveness.ts` — `countOtherActiveApprovers`.
This is `CloseRunCrudService.countOtherCloseApprovers` extracted verbatim and parameterised by
permission key. It was the strongest self-approval block in the codebase but was hard-wired to
`accounting.close.approve`. `close-run-crud.service.ts` now delegates to it, so there is ONE copy of
the cross-database liveness question (permission grant in the TENANT db, active membership in the
ADMIN db), not two that drift.

New shared service: `apps/api/src/approval-pin/maker-checker.service.ts` — `MakerCheckerService`.
It composes, in the order close-management already used them:

1. `countOtherActiveApprovers` (above), and
2. `PinVerificationService.verifyApproval` (`apps/api/src/approval-pin/pin-verification.service.ts`)
   which already enforces approver != actor, the PIN, the per-approver lockout, the authority check,
   and a denial audit row, all behind one generic 422 with no oracle.

Escape hatches, both modelled on close-run's `reviewSelfApproved` flag:
- the Owner may always proceed (`PermissionService.hasPermission(...).isOwnerBypass`);
- when NOBODY else could approve, the lone actor proceeds.
Neither is silent: both return `selfApproved: true`, which the callers write onto the audit row, so
the compliance log never implies a second person looked when nobody did.

---

## Decision 1 — maker-checker on manual journal posting (ACC-JRN-003)

### Mechanism reused
- `PinVerificationService.verifyApproval` (the same call `sales-invoice-amend.adapter.ts` and the POS
  approval gates make).
- The seven-flag `tenant_identity` pattern plus its capability gate
  `apps/api/src/tenant-settings/approval-capability.ts`, which already REFUSES to switch a flag on
  for a tenant with fewer than two active members. The new flag is the eighth member of
  `APPROVAL_FLAG_KEYS`, so it inherits that protection with no new code.
- Close-run's liveness check, now shared.

### What changed
- `packages/db/src/schema/tenant-identity.ts`: `requireJournalApproval boolean DEFAULT false NOT NULL`.
  Default OFF, deliberately: a solo Kuwaiti bookkeeper is frequently the only accountant in the
  business, and a mandatory second approver would make the product unusable for the launch customer.
- `apps/api/src/journal-entries/journal-entry-draft.service.ts`: `postDraft` now runs the gate BEFORE
  any write and BEFORE a document number is reserved, so a refusal leaves nothing behind and burns no
  number. `PostResult` gained `selfApproved` / `approvedBy`.
- `apps/api/src/journal-entries/journal-entries.controller.ts`: threads the outcome onto the audit row
  through the existing `request.auditReason` escape hatch (the pattern doc-numbering already uses).
- `apps/api/src/journal-entries/journal-entry-amend.adapter.ts`: the hard-coded `false` and its
  `ponytail:` comment are GONE. `isApprovalRequired` reads the same flag; `approvalPermission` moved
  from `accounting.journal.reverse` to `accounting.journal.post`, because the approver should hold the
  authority for the act being approved. Amending a posted entry is a void plus a re-post, so it must
  not be a weaker control than the post it replaces.
- Settings surface: API DTO + `/tenant/settings/current`, and the web toggle in
  `features/organisation` with ar + en copy (`requireJournalApproval` / `...Hint`).

### Why this is the scalable choice, not a band-aid
A hard-coded `false` was the band-aid. A second bespoke approval mechanism would have been worse: the
product would then have had three ways to ask for a second person, three lockout policies, and three
places to get segregation of duties wrong. Instead the journal gate is the SAME `verifyApproval` call
the whole product already routes through, behind the SAME tenant-flag pattern, with the SAME
capability guard. Adding a ninth control later is one column and one call site.

### Live evidence
All as `accountant1` unless stated. Base `http://localhost:3001/api/v1`, tenant `gulf-auto-parts`.

BEFORE (flag OFF, the default):
```
POST /tenant/journal-entries/0e799850.../post  {}
{"data":{"id":"0e799850-...","entryNumber":"B1ALRAIMAINS-JRN-00113","status":"posted","selfApproved":false,"approvedBy":null}}
```

AFTER (owner PATCHes `requireJournalApproval: true`):
```
POST .../3a36018d.../post  {}
{"statusCode":400,"error":"Bad Request","code":"SECOND_APPROVER_REQUIRED","control":"journalPost",
 "message":"Someone else needs to approve this entry before it can be posted. Ask a colleague who can post journal entries to approve it with their PIN."}

POST .../3a36018d.../post  {"approvedBy":"<accountant1's OWN id>","approvalPin":"1234"}   # maker == checker
{"code":"PIN_INVALID","message":"invalid approval credentials"}

POST .../3a36018d.../post  {"approvedBy":"<owner id>","approvalPin":"9999"}               # bad PIN
{"code":"PIN_INVALID","message":"invalid approval credentials"}
```

OWNER escape hatch, same draft, flag still ON:
```
{"data":{"id":"3a36018d-...","entryNumber":"B1ALRAIMAINS-JRN-00114","status":"posted","selfApproved":true,"approvedBy":null}}
```

Audit rows for those two entries (`audit_log`), showing the new scope columns and the honest reason:
```
 JournalEntry | create |                                                                | branch=t | entity=t
 JournalEntry | create |                                                                | branch=t | entity=t
 JournalEntry | update |                                                                | branch=t | entity=f
 JournalEntry | update | Posted without a second approver (no other approver available) | branch=t | entity=f
```

RESTORE control: flag switched back OFF, `accountant1` posts alone again → `JRN-00115`, `selfApproved:false`.

### Tests
`apps/api/src/approval-pin/maker-checker.service.spec.ts` (new, 9 tests): no-op when off; refuses with
no approver; refuses PIN-without-approver and approver-without-PIN; threads `actingUserId` so SoD can
fire; maker == checker refused; wrong role refused; Owner hatch; zero-other-approvers hatch; holding
the permission alone does NOT open the hatch.

`apps/api/src/journal-entries/journal-entry-draft.service.spec.ts` (+4 tests): flag OFF by default and
posts; flag + credentials threaded; refusal happens BEFORE `reserveOrSeedNumber` and emits no event;
`selfApproved` reported through.

`apps/api/src/journal-entries/journal-entry-amend.adapter.spec.ts`:
- **(b) rewritten to assert the correct rule** — `"never requires approval (no maker-checker flag
  exists...)"` asserted the OLD hard-coded `false`. Replaced by three tests: flag ON requires approval,
  flag OFF does not, missing settings row does not.
- **(b) rewritten** — `approvalPermission returns accounting.journal.reverse` → `...journal.post`.

`apps/api/src/tenant-settings/approval-capability.spec.ts`:
- **(a) stale in shape only** — `toHaveLength(7)` pinned a COUNT, which is not what the test is for.
  Rewritten to `toEqual([...APPROVAL_FLAG_KEYS])` plus an explicit `toContain` for the new flag, so it
  keeps its real claim and cannot go stale on the ninth flag.

`apps/web/.../controls-section.test.tsx`: **(a) stale in shape only** — base props gained the 8th toggle.

### Guard proven failable
Changed `actingUserId: input.actingUserId` to `input.approvedBy` in `MakerCheckerService` (which would
let self-approval through, since `verifyApproval` compares the two): `Tests: 1 failed, 8 passed`.
Restored: `Tests: 9 passed`. Separately, forcing `enabled: false` in `postDraft`: `1 failed, 48 passed`;
restored: `49 passed`.

---

## Decision 2 — asymmetric period unlock (ACC-PER-001)

### Mechanism reused
The SAME `MakerCheckerService`, with `requiredPermission: "accounting.close.approve"`. That key is
deliberate and is the whole design: it is the key `CloseRunService.reviewTask` requires to sign off a
close task, Manager and Owner hold it, and `packages/shared/src/role-templates.ts` explicitly EXCLUDES
it from the Accountant template with the comment "the person who prepares the close must not also sign
it off". So reopening a hard lock now needs exactly the same second party the lock needed, and the
Accountant cannot self-serve it.

### What changed (`apps/api/src/fiscal-period/fiscal-period.service.ts`)
A single private `assertHardLockReopenApproved`, called from three places:
- `updatePeriodStatus` when and only when `HardLocked -> Open`;
- `batchUnlockPeriods`, when at least one period in the year is `hard_locked` (checked before the
  transaction, so a refusal writes nothing);
- `reopenFiscalYear`, after the "not closed" check and before any write.

Soft-lock unlock is untouched and stays cheap. Locking is untouched: only the reopen direction is gated.
`updatePeriodStatusSchema`, `unlockPeriodSchema`, `batchUnlockPeriodsSchema` and
`reopenFiscalYearSchema` gained `approvedBy` / `approvalPin`, and `FiscalPeriodsController.unlockPeriod`
threads them (dropping them there would have made the gate unsatisfiable from that endpoint).
Both the single and batch audit payloads now record `approvedBy` and `selfApproved`.

`status_before_close` (migration 0102) is untouched: the reopen restore path
(`restoreCapturedPeriodStatuses` / `openClosingEntryPeriod`) was not modified, the gate runs strictly
before it, and the tenant still reports 0 rows with a non-null `status_before_close`.

### Why this is the scalable choice
The alternative was a new `accounting.period.hard-unlock` permission. That would have created a key no
role template holds, which this codebase has been burned by repeatedly (see the orphaned
`accounting.close.approve` and `reports.sales.read` incidents) and which silently kills a feature.
Reusing `close.approve` means the control is already granted to exactly the right people on day one,
and the symmetry is self-documenting: the key that closes the period is the key that reopens it.

### Live evidence — PARTIAL, and here is exactly what is and is not shown
Shown live as `accountant1` on Jan 2025 (`7a35384c-...`):
- `POST /tenant/fiscal-periods/{id}/lock {"status":"SoftLocked"}` → 200
- `POST /tenant/fiscal-periods/{id}/unlock {"reason":"ZZTEST soft unlock control"}` → 200
  The soft path is unchanged, which is the negative control the decision requires.
- `POST .../lock {"status":"HardLocked"}` → 409, "Cannot hard-lock: 1 period(s) do not have a completed
  close checklist ... Complete the monthly close for every period first."

NOT shown live: the refusal on an actual `hard_locked` period. Reaching that state through the product
requires a completed close run for the period, and close runs cannot be removed again through any
endpoint (only `deleteFiscalYear` cascades them). Creating them would have left the tenant materially
different from how I found it, which the brief forbids. A direct `UPDATE fiscal_periods SET
status='hard_locked'` was attempted as a fixture and was blocked by the environment's command
classifier. I did not work around either constraint.

What backs the gate instead: four unit tests plus a proven-failable check (below), and the compiled
binary the running server loaded contains the gate
(`grep -c assertHardLockReopenApproved dist/fiscal-period/fiscal-period.service.js` → 4).

**Recommended follow-up for whoever can spend the tenant state:** seed a close run for one period via
`POST /tenant/close-management/runs`, complete and review its tasks, hard-lock the period, then run the
unlock as `accountant1` (expect 400 `SECOND_APPROVER_REQUIRED`) and as `owner` (expect 200,
`selfApproved` recorded), then delete the fiscal year's close runs.

### Tests (`apps/api/src/fiscal-period/fiscal-period.service.spec.ts`, +4)
- hard-lock reopen calls the gate with `enabled: true`, the acting user, the supplied credentials and
  `requiredPermission: "accounting.close.approve"`;
- a refused approval propagates AND `mockDb.transaction` was never called (nothing written, nothing audited);
- soft-lock unlock does NOT call the gate;
- LOCKING does NOT call the gate.

One existing assertion changed: the DEV-62 audit test asserted `after` as an exact object.
**(a) stale in shape only** — the payload gained `approvedBy` / `selfApproved`. Converted to
`expect.objectContaining({ status: "Open", reason: "Correction needed" })`, so the claim it always made
is still asserted exactly, and only the new keys are tolerated.

The spec's DI harness also gained a `MakerCheckerService` provider (required, otherwise every test in
the file fails to construct the service). Same for `journal-entry-draft.service.spec.ts`.

### Guard proven failable
Replaced the `currentStatus === "HardLocked" && newStatus === "Open"` condition with `false`:
`Tests: 2 failed, 195 passed`. Restored: `197 passed`.

---

## Decision 3 — exports are unauditable by design (AUDIT-003)

### The rule was NOT relaxed
`audited-never-on-get.spec.ts` still forbids plain `@Audited` on `@Get`/`@Sse`, and that exclusion
stays load-bearing: auditing every GET would flood `audit_log`, which is RANGE-partitioned monthly and
is one of the largest tables of every tenant, and an unusable compliance record is worse than the gap.

### What was built
- `apps/api/src/audit/audited-export.decorator.ts` — `@AuditedExport("<Name>")`. Opt-in per handler.
  There is no blanket rule that can turn a read into an audited event.
- `apps/api/src/audit/audit-export.interceptor.ts` — a SEPARATE global interceptor. It writes one
  `action: 'export'` row: who, when, which export, the applied filter set (route params + query, run
  through the existing `scrubSnapshotObject` deny-list), and `rowCount` / `truncated` / `maxRows` when
  the response reports them. It NEVER records the exported rows, which would double the compliance log
  every time somebody exported it. Best-effort, exactly like `DataExportWorkerService`: a failed audit
  write must not 500 an export that already succeeded.
- `AuditAction.Export` already existed (`data-export-worker.service.ts` uses it), so no enum change
  was needed.

### Applied to
| Route | Export name |
|---|---|
| `GET /tenant/reports/trial-balance/export` (new) | `TrialBalanceExport` |
| `GET /tenant/reports/ar-aging/export` (new) | `ArAgingExport` |
| `GET /tenant/reports/general-ledger/export` | `GeneralLedgerExport` |
| `GET /tenant/journal-entries/export` | `JournalEntryExport` |
| `GET /tenant/audit-logs/export` | `AuditLogExport` |

The audit-log export's hand-rolled `recordExport` method was DELETED and replaced by the decorator, so
every export in the product now writes the same row through the same code path instead of one
controller carrying its own copy.

Trial balance and AR aging had no server export route at all (the web builds their CSV client-side from
already-fetched data). They got one, following the convention `general-ledger/export` and
`day-book/export` already set: identical permission, identical payload, full range. **Known gap:** the
two web CSV buttons still build from the client cache and do not yet call these routes, so a CSV taken
from those two screens is not yet audited. Wiring them changes what the file contains (the full range
rather than the user's collapsed/visible view, which is arguably more correct but is a product change),
and those components are being edited by other agents in this tree, so I did not touch them. That is the
one piece of Decision 3 left undone, and it is a web-only change now that the server side exists.

### Live evidence (as `accountant1`)
```
GET /tenant/reports/trial-balance?legalEntityId=...&asOfDate=2026-08-30          200   <- plain report, must NOT audit
GET /tenant/reports/trial-balance/export?legalEntityId=...&asOfDate=2026-08-30   200
GET /tenant/reports/ar-aging/export?legalEntityId=...&asOf=2026-08-30            200
GET /tenant/reports/general-ledger/export?...&accountId=...                      200
GET /tenant/journal-entries/export?...                                           200
```
`audit_log` afterwards — four rows, one per export, and NOTHING for the plain report GET:
```
 JournalEntryExport  | export | accountant1@... | branch=t | entity=t | {"toDate":"2026-08-30","fromDate":"2026-08-01","legalEntityId":"d67ece83-..."}
 GeneralLedgerExport | export | accountant1@... | branch=t | entity=t | {"toDate":"2026-08-30","fromDate":"2026-08-01","accountId":"a36696b8-...","legalEntityId":"d67ece83-..."}
 ArAgingExport       | export | accountant1@... | branch=t | entity=t | {"asOf":"2026-08-30","legalEntityId":"d67ece83-..."}
 TrialBalanceExport  | export | accountant1@... | branch=t | entity=t | {"asOfDate":"2026-08-30","legalEntityId":"d67ece83-..."}
```

### Tests
`apps/api/src/audit/audit-export.interceptor.spec.ts` (new, 7): nothing for an unmarked handler; one
row with who/which/filters; branch + legal entity stamped; rowCount/truncated recorded when present;
the exported rows are NEVER in the row; nothing without tenant context; a failed audit write never
fails the export.

`audited-never-on-get.spec.ts` — **(b) rewritten to assert the correct rule, not weakened.** The
original assertion (no `@Audited(` on a GET) is unchanged and still runs; `@AuditedExport(` does not
match `@Audited(` so it was never in scope of that scan. Two assertions were ADDED so the file pins
BOTH halves of the real rule: `@AuditedExport` may only appear on a read verb (a mutation must use
`@Audited`, which captures before/after), and the marker is actually in use on at least four handlers
so it cannot rot into a dead decorator. The header comment now states why the split exists. Net effect
is a stricter file, not a looser one.

---

## Decision 4 — audit_log has no branch/entity scope (AUDIT-004)

### What changed
`packages/db/src/schema/audit.ts`: `branch_id uuid` and `legal_entity_id uuid`, both NULLABLE, no FK
(the audit row must survive the branch it references being deleted), plus one partial index
`audit_log_branch_id_created_at_desc_idx ON (branch_id, created_at DESC) WHERE branch_id IS NOT NULL`.

Populated at capture time by one shared resolver, `apps/api/src/audit/audit-scope.ts`, used by BOTH the
mutation interceptor and the new export interceptor so the two can never disagree about what "which
branch" means. Priority: an explicit `request.auditBranchId` / `auditLegalEntityId` service escape
hatch (mirroring `request.auditBefore`), then `TenantContext.currentBranchId` (the only branch value
here that is SERVER-VALIDATED, by the tenant resolver guard), then a uuid-shaped `branchId` /
`legalEntityId` on the body or query. Anything not uuid-shaped is dropped rather than stored: the
column is `uuid`, and a junk value would fail the insert and silently lose the whole compliance row.

Threaded through the durable fallback too (`AuditDurableJobPayload`, producer and worker), so a replay
after an outage carries the same scope rather than silently dropping it.

### Nullable is deliberate, and history is NOT backfilled
Not every audited action is branch-scoped: a tenant-level settings change genuinely has no branch, and
a NOT NULL column would force the code to invent one. Historical rows predate the columns and their
true scope is unknowable. **`audit_log` is an immutable compliance record; fabricating scope onto past
events would be far worse than leaving them NULL,** because a guessed branch is indistinguishable from
a captured one once it is written and can never be un-written. Old rows stay NULL and read as "not
captured", which is the truth. This is visible in the live evidence above: the JE `create` rows carry
`legal_entity_id` (the create body names it) while the `post` rows do not (the post body has no entity),
and nothing was inferred to fill the gap.

### Migration safety
No table rewrite, so it is safe in the fleet-wide pre-deploy path:
- adding a NULLABLE column with no default is metadata-only in Postgres 11+, and on a RANGE-partitioned
  parent it recurses to every partition still without rewriting one;
- `boolean DEFAULT false NOT NULL` on `tenant_identity` is likewise metadata-only (non-volatile default);
- no `CONCURRENTLY` anywhere (the migrator runs the whole pending set in ONE transaction);
- the index is PARTIAL on a plain `uuid IS NOT NULL` predicate, which is IMMUTABLE — no `::text`, so no
  42P17;
- every statement carries `--> statement-breakpoint`;
- every statement is `IF NOT EXISTS`, so a re-run is a no-op;
- `meta/_journal.json` was GENERATED by `drizzle-kit generate`, never hand-edited. The generated SQL was
  inspected before applying and contained ONLY these four statements, so no other session's uncommitted
  schema edit was bundled in.

### Live verification
```
column_name     | data_type | is_nullable
branch_id       | uuid      | YES
legal_entity_id | uuid      | YES
require_journal_approval  (tenant_identity)
audit_log_branch_id_created_at_desc_idx
```
Server boot log: `Boot migration drift check: fleet is fully current.` with
`target migration: 0317_audit-scope-and-journal-approval`.
Every audit row written during this session (4 JE rows + 4 export rows) carries a non-null `branch_id`.

---

## Things I had to touch that belong to other work in this tree

1. **`packages/db/drizzle/0316_add-close-template-active-unique-idx.sql`** (another agent's migration).
   Its bare `CREATE UNIQUE INDEX "cct_one_active_default_idx"` aborted the ENTIRE pending set with
   `42P07 relation already exists` on the Gulf tenant, blocking my migration and every future one.
   Changed to `CREATE UNIQUE INDEX IF NOT EXISTS`, which is the house rule for migrations anyway. Its
   author should know.

2. **`packages/db/src/schema/chart-of-accounts.ts`** — an uncommitted edit by another agent removed
   `.default(true)` from `isMonetary`, which makes the column required on insert and breaks
   `src/__tests__/integration/trial-balance.integration.spec.ts` at lines 199 and 822. This is the ONLY
   remaining `pnpm --filter @zerupt/api typecheck` failure and it is not mine. It was previously hidden
   because `packages/db/dist` was stale; I had to rebuild that package for my own schema change, which
   surfaced it. Not fixed, because it is that agent's decision whether the default should go.

3. **`apps/web/messages/{en,ar}/fiscal.json`** — another agent is concurrently rewording the period
   copy to say a hard lock "can be reopened later if you need". With Decision 2 in place that now
   understates the control (it needs a second approver). Their text was left untouched; it should be
   revisited.

## Verification status

| Check | Result |
|---|---|
| `pnpm --filter @zerupt/api typecheck` | clean except the pre-existing `isMonetary` failure above (not mine) |
| `pnpm --filter @zerupt/web typecheck` | clean |
| `pnpm --filter @zerupt/web i18n:check` | "All locales are in sync" |
| `npx jest audit- audited- data-export maker-checker fiscal-period.service journal-entry` | 35 suites, 768 tests, all passing |
| `npx vitest run controls-section` | 14 passing |
| `study/ops/graphify/check-drift.sh` | 0 upward-dependency violations (cycle count unchanged at 15, all pre-existing) |
| Ledger gate (posted + reversed) | `0.000000` before and after |
