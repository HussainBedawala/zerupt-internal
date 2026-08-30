# Phase F — Accounting: fiscal years, period controls, close management, opening balances

Tester: subagent (Phase F, area 09). Tenant **Gulf Auto Parts** (Kuwait, KWD 3dp, LE
`d67ece83-e21c-4ae4-ad46-c9356d7f0f06`). Method: code read + SQL + authenticated curl.

**Ledger identity gate**
- Before first write: `select round(sum(debit-credit),6),count(*) from journal_entry_lines;` -> `0.000000 | 889`
- After last write: -> `0.000000 | 913`  (delta includes other concurrent sessions' rows)

**Period state before / after: IDENTICAL.** All 24 periods (FY2025 + FY2026) `open`,
`status_before_close` NULL, both fiscal years `is_closed = f`. Verified:
`select label,status,status_before_close from fiscal_periods where status<>'open';` -> 0 rows.

---

## Headline

The period-control surface is the strongest thing tested in this programme so far.
Every bypass I attempted was refused, at the right layer, with honest copy. The confirmed
findings are **UX / data-hygiene / copy**, not money or auth. Four hypotheses were
disproven and are recorded as withdrawn.

---

## FINDINGS (ranked)

### F-01 · HIGH · CONFIRMED — Asymmetric control: locking a period needs two people, UNLOCKING needs one

Hard-locking a period is gated on a **completed close run**, which itself cannot complete
without a second person holding `accounting.close.approve` (see F-V2). But **unlocking has
no such gate** — `accounting.period.unlock` alone is sufficient, and the **Accountant role
holds it** alongside `accounting.period.lock` and `accounting.close.manage`.

Proven live. Accountant (`accountant1`, user `bfdf55a3…`) alone reopened a hard-locked month:
```
curl -X POST "$API/tenant/fiscal-periods/4a1fe049-6188-4cd8-9ec5-d15b068488bd/unlock" \
  -H "Authorization: Bearer $T_ACCOUNTANT" -H "x-tenant-slug: gulf-auto-parts" \
  -H "Content-Type: application/json" -d '{"reason":"ZZTEST restore to open"}'
-> 200  {"status":"Open","lockedAt":null,"lockedBy":null}
```
`select r.name, rp.permission_key from roles r join role_permissions rp on rp.role_id=r.id
 where rp.permission_key like 'accounting.period%';`
-> **Accountant** holds BOTH `accounting.period.lock` and `accounting.period.unlock`.

Why it matters: the close gate exists so a month cannot be sealed without review. One
bookkeeper can un-seal it, restate, and re-seal (re-seal does need a fresh close run, so the
control is not fully defeated — but the *reopen* is the act that lets money move again and it
is unwitnessed). The act IS audited (before `{"status":"HardLocked"}` / after
`{"status":"Open","reason":…}`), which is the mitigation.

Fix shape: either split the unlock authority (`accounting.period.unlock` -> require
close-approver authority for `HardLocked -> Open`, exactly as `assertHasCloseApproverAuthority`
already does for the year-end override), or stop granting both halves to one seeded role.

---

### F-02 · MEDIUM · CONFIRMED — `POST /tenant/close/templates/seed-default` is not idempotent; a double-click creates two active templates

```
curl -X POST "$API/tenant/close/templates/seed-default" -d '{"legalEntityId":"d67ece83-…"}'  # x2
psql -c "select id,name,is_active from close_checklist_templates order by created_at;"
 298efc86-ca86-4403-a8fc-05a56066c0f5 | Monthly Close | t
 3184ddb4-8f2d-44d1-8a54-44a2474261cb | Monthly Close | t     <- created by the 2nd click
```
`close-template-crud.service.ts:63 create()` — the documented "single creation chokepoint" —
has no existing-active-template check and there is no partial unique index on
`(tenant_id, legal_entity_id, period_type) WHERE is_active`. `findActiveTemplate`
(`close-template-crud.service.ts:192`) takes `orderBy(desc(createdAt)).limit(1)`, so the
newest silently shadows the older one: a tenant that later customises its checklist and then
re-clicks Seed gets its customisation silently ignored, with two identically-named rows in
the list. Founder standard also requires debounced/idempotent creates.

Two orphan rows are now in this tenant (created by this test) — left in place because
deleting them is not an in-product action.

---

### F-03 · MEDIUM · CONFIRMED — `openingBalanceSchema.occurredAt` freezes "now" at API process start, so today's date is rejected as "in the future"

`apps/api/src/inventory/stock-adjustments/stock-adjustments.dto.ts:246`
```ts
occurredAt: z.coerce.date().max(new Date(), { message: "occurredAt cannot be in the future" }),
```
`new Date()` is evaluated **once, when the module is imported** — not per request. The
ceiling is therefore the API process's boot instant and drifts further into the past the
longer the process runs. Proven live, ~3 minutes after an API restart:
```
API boot: 2026-08-30T03:00:xx UTC
POST /tenant/stock-adjustments/opening-balance  occurredAt=2026-08-30T03:03:27.000Z
-> 400 {"occurredAt":{"errors":["occurredAt cannot be in the future"]}}
```
On a production process up for days, every recent as-of date is refused with a message that
is simply false. This is the only site of the pattern in `apps/api/src`
(`grep -rn "\.max(new Date()"` -> 1 hit), so it is a one-line fix:
`.superRefine`/`.refine` evaluating the clock at parse time.

---

### F-04 · MEDIUM · CONFIRMED — Three user-facing money strings hardcode 2 decimals in a 3-decimal (KWD) tenant

All inside thrown `ConflictException`s / precondition blockers shown verbatim to the user:
- `opening-balance/opening-balance.service.ts:840` — "…already has an opening balance of `${inventoryNet.abs().toFixed(2)}`."
- `opening-import/opening-party-import.service.ts:1235` — "`${label}` control account (`${code}`) already has an opening balance of `${net.abs().toFixed(2)}`."
- `opening-balance/opening-balance.service.ts:2955` — blocker `detail: \`1141 net ${net.abs().toFixed(2)}\``

A KWD figure of 12 345.678 renders as 12 345.68, hiding a fils on the exact screen where the
merchant is being asked to reconcile against that number. Should use the shared money
formatter / the entity's currency decimals, never a literal 2.
(Also `opening-balance.service.ts:1066,1074,1075,1076` — same 2dp, but logger-only, lower priority.)

---

### F-05 · MEDIUM · CONFIRMED — Em dashes in user-facing API error copy (non-negotiable violation), and the shared `dayBefore`/date message is the one a real user hits first

Observed live in a response body:
```
POST /tenant/import/opening-balances?asOfDate=2026-08-24&mode=year-start
-> 400 "Opening balances must be dated 2024-12-31 — the day before the fiscal year starts (2025-01-01). Re-upload with that as-of date."
```
Source `opening-import/conversion-date.validator.ts:92`. Further sites in scope, all inside
thrown user-facing messages:
`opening-balance-corrections.service.ts:285,304,452,484,503,823,1025,1043` ·
`opening-post-preconditions.ts:168` · `opening-balance.service.ts:495,496,1076` ·
`fiscal-period.service.ts:2684`.

The i18n message files are clean (`messages/{en,ar}/{fiscal,closeManagement,openingBalance,openingImport}.json`
— 0 em dashes, 0 en dashes, full en/ar key parity: 166/166, 78/78, 164/164, 177/177). The
violation lives entirely in **server-thrown English strings**, which is also why they are not
translated at all (see F-08).

---

### F-06 · MEDIUM · CONFIRMED — `rowsPreview` is off by one on every opening import, and the helper is hand-copied into three files (defect pattern #1)

Every mapper emits **1-based** row indices (`opening-balance-import.mapper.ts:162`,
`opening-party-import.mapper.ts:164`, `opening-stock-import.mapper.ts:196` — all
`const rowIndex = i + 1;`), but `buildRowsPreview` keys its lookup **0-based**
(`byRow.get(i)` for `i = 0 .. totalRows-1`).

Live proof, 5-row file with deliberate defects on data rows 3, 4 and 5:
```
issues:      rowIndex 3 DUPLICATE_ACCOUNT · rowIndex 4 ACCOUNT_NOT_FOUND · rowIndex 5 HEADER_ACCOUNT
rowsPreview: 0 valid · 1 valid · 2 valid · 3 error(DUPLICATE) · 4 error(NOT_FOUND)
```
Row 3's duplicate is reported on preview row 3 while preview row 2 (the actual duplicate line,
0-based) reads "valid", and **the last row's `HEADER_ACCOUNT` error is dropped from the
preview entirely** because the loop stops at `i < totalRows`. `issue.rowIndex >= MAX_PREVIEW_ROWS`
loses row 100 for the same reason.

`buildRowsPreview` exists as **three byte-similar copies**:
`opening-stock-import.service.ts:1340`, `opening-balance-import.service.ts:1401`,
and it is called a third time from `opening-party-import.service.ts:371`.

**Downgraded from HIGH after investigation:** the web wizard renders only `issues`
(`features/opening-import/components/validation-summary.tsx:181-182`, correct 1-based) and
never reads `rowsPreview` (`grep -rn rowsPreview apps/web/src` -> the type declaration only).
So today this is a wrong-and-dead API field, not a user-visible bug — but it is a loaded gun
for whoever builds the preview grid, in three places at once. Fix at the primitive: one shared
helper, 1-based throughout.

---

### F-07 · MEDIUM · CONFIRMED — Every period lock/unlock writes TWO audit rows, one of them mislabelled `create`

```
psql -x -c "select action,before,after from audit_log
            where entity_id='4a1fe049-…' order by created_at desc limit 4;"

action | create      before | (null)   after | {"data":{… "status":"Open" …}}      <- interceptor
action | update      before | {"status":"HardLocked"}  after | {"status":"Open","reason":"…"}   <- service
```
`fiscal-period.controller.ts` decorates `POST :id/lock` and `POST :id/unlock` with a bare
`@Audited("FiscalPeriod")`. On a `@Post` route the interceptor defaults to
`AuditAction.Create`, so the log records "fiscal period **created**" every time somebody locks
or unlocks a month, with a null before-state. The service's own `append` already writes the
correct `update` row with the real before/after and the reason. The same controller gets this
right one route up: `@Post(":id/close")` passes `{ action: AuditAction.Update }` explicitly.

Consequence on `/settings/audit`: the highest-consequence accounting action in the product is
listed under the wrong verb, twice. Fix: `@Audited("FiscalPeriod", { action: AuditAction.Update })`
on both routes, or drop the decorator since the service already audits.

---

### F-08 · MEDIUM · CONFIRMED — Every period/close/opening error message is English-only, server-side, un-i18n-able

All the refusals a Kuwaiti bookkeeper will actually meet are built as English template
literals in the service layer and returned as `message` — "Cannot post to hard-locked period
Jul 2026. Unlock the period first.", "Period Jul 2026 is soft-locked. Provide
softLockOverrideReason to proceed.", the seed/precondition messages above. The `ar` message
bundles have full parity for the *screens*, so an Arabic user gets an Arabic page with English
errors on every failure path in this area. The stable `code` fields
(`PERIOD_HARD_LOCKED`, `PERIOD_SOFT_LOCKED_NEEDS_REASON`, `OB_GL_OPENING_ALREADY_POSTED`,
`OB_LIVE_TRANSACTIONS_EXIST`, `DUPLICATE_ACCOUNT`, `ACCOUNT_NOT_FOUND`, `HEADER_ACCOUNT`) are
already emitted, so the client has everything it needs to translate — the keys just are not
in the bundles.

---

### F-09 · LOW · CONFIRMED — Internal identifier leaks into user copy on the soft-lock override refusal

```
POST /tenant/journal-entries/{id}/post  {"softLockOverrideReason":"…"}
-> 403 "Period 4a1fe049-6188-4cd8-9ec5-d15b068488bd is soft-locked and override is disabled
        by fiscal policy. Cannot post to this period."
```
`fiscal-period.service.ts:2406`. One layer up, the same refusal is written properly —
`"Period Jul 2026 is soft-locked. Provide softLockOverrideReason to proceed."` — so the label
is available. Also `softLockOverrideReason` is a raw internal parameter name in copy aimed at
a shop owner: it should read "add a reason for posting into a locked month".
Same class at `fiscal-period.service.ts:2684` (`Fiscal year ${fiscalYearId} has no periods`).

---

### F-10 · LOW · CONFIRMED — The import validate step never tells the user the file is out of balance

A 2-row file with Dr 100.500 / Cr 50.250 validates as `validRows: 2, errorRows: 0` with no
mention of the 50.250 residual — a **50% Opening Balance Equity plug**. The service only
returns `totalDebit`/`totalCredit` "on a clean validate"
(`opening-balance-import.service.ts:330-332`), and the materiality refusal
(`isPlugMaterial`, `OPENING_BALANCE_ERROR_CODES.plugExceedsMateriality`) only fires at
**apply**. So the merchant completes the whole wizard before being told the file is wrong.
Not a money bug (the apply-time guard is real and correct) — a dead-end at the last step,
which the founder standard calls out explicitly.

---

### F-11 · LOW · CONFIRMED — `assertPeriodOpen` exists as two byte-identical private copies

`inventory/stock-adjustments/stock-adjustments.service.ts:1704` (public) and
`inventory/transfers/stock-transfers.service.ts:1982` (private). Same four branches, same four
messages, same order. Currently in sync, which is exactly the state every path-divergence
defect in this programme was in the day before it diverged. One shared helper over
`FiscalPeriodService.validatePeriod`.

---

### F-12 · FRICTION · CONFIRMED — A live tenant cannot close a month until someone finds a hidden "seed default template" action

`GET /tenant/close/templates?legalEntityId=…` -> `{"data":[]}` on a LIVE tenant.
`POST /tenant/close/runs` -> `400 "No active monthly close template for this entity. Seed one first."`
There is no create/update template endpoint at all (documented: "the frontend never calls
those"), so the ONLY path is the seed-default button. Gulf Auto Parts has been live and posting
for months with the entire close-management feature inert and its year-end close therefore
impossible. Defaults-over-questions: the default monthly template should be provisioned with
the fiscal year, not waited for.

**Click count for "close a period", from a standing start:** find Close Management ->
seed template (1) -> generate run (1) -> complete 7 tasks (7) -> **log out, log in as a second
user holding `accounting.close.approve`** -> review 3 tasks (3) -> back to Fiscal Years ->
lock period + type a reason (2). **14 actions across two user accounts.**
**Could an untrained Kuwaiti shop owner's bookkeeper close a period first try? No.** Three
things stop them: (a) the empty-template dead end above, (b) nothing on any screen says a
second person is required until the run silently refuses to reach `complete`, (c) the
reversibility of a lock is never stated in the UI — the copy says "Unlock the period first"
only *after* you are already blocked. That last one is the cheapest fix with the biggest
payoff: say "You can reopen this month later" on the lock confirmation.

---

## VERIFIED SOUND (evidence, so it does not get re-tested)

- **F-V1 · The period gate is a real chokepoint and cannot be bypassed.**
  Single authority `FiscalPeriodService.validatePeriod` (`fiscal-period.service.ts:2171`),
  reached by every posting path (`grep` shows JE manual + auto, sales invoice/CN/DN/DO/receipt/
  refund/write-off, purchase bill/GRN/return/payment/landed-cost/refund, POS
  (`pos-period-gate.ts`), stock adjustment/count/transfer, cheques, FX revaluation,
  opening balance, every amend adapter, and all five importers).
  Live probes, all refused, three different paths:
  ```
  # soft-locked Jul 2026, manual JE post
  -> 409 PERIOD_SOFT_LOCKED_NEEDS_REASON "Period Jul 2026 is soft-locked. Provide softLockOverrideReason to proceed."
  # soft-locked, WITH override reason
  -> 403 "…override is disabled by fiscal policy."
  # hard-locked Jul 2026, manual JE post, with and without override reason
  -> 409 PERIOD_HARD_LOCKED "Cannot post to hard-locked period Jul 2026. Unlock the period first."
  # hard-locked, stock adjustment opening-balance, occurredAt 2026-07-16
  -> 409 "Cannot post to hard-locked period. Unlock the period first."
  ```
  The **real** cause fires and the copy is honest — the fake "period closed" cause that five
  Purchase error maps invented does not appear here.
  Backed by a DB floor independent of the app: trigger
  `trg_prevent_hard_locked_period` on `journal_entries` (`prevent_posting_to_hard_locked_period`)
  rejects a hard-locked `fiscal_period_id` **and** rejects a `posting_date` outside its own
  period's `[start_date, end_date]` — which closes the `postDirect` hole where the period link
  and the posting date could name different months.

- **F-V2 · Maker-checker on close is real, and stronger than asked.**
  Accountant completed **all 7** tasks of a close run; the run stayed `in_progress` with
  `lock_recommended_at` NULL, because 3 tasks carry `requires_review` and the Accountant role
  does not hold `accounting.close.approve`. Only after the **owner** reviewed those 3 did the
  run flip to `complete`. Enforced structurally: `close-template-crud.service.ts:77` refuses to
  create any template with zero review-required tasks. Self-approval is refused with a real
  liveness check — `countOtherCloseApprovers` (`close-run-crud.service.ts:424`) joins the
  tenant RBAC tables **and** the admin DB `user_tenant_map.status`, so a departed approver's
  stale role cannot deadlock the close, and the refusal copy tells the user exactly how to
  unblock it. This is the best-implemented control I have seen in this programme.

- **F-V3 · Year-end close IS gated on complete close runs across EVERY period.** Layer 4's
  claim verified, not trusted:
  ```
  POST /tenant/fiscal-years/46f0e0bf-…/close  -> 409
  "Cannot hard-lock: 12 period(s) do not have a completed close checklist (including the
   AR/AP sub-ledger reconciliation task and the accounting-queue drain task):
   Jan 2025, Feb 2025, … Dec 2025. Complete the monthly close for every period first."
  ```
  All twelve named, not just the last. The same gate guards a single-period hard lock.

- **F-V4 · Soft-lock override requires policy AND role, and the kill switch outranks the owner.**
  `assertSoftLockOverrideAllowed` (`fiscal-period.service.ts:2396`) checks
  `allowSoftLockOverride` **before** `assertHasOverrideRole`, so with the tenant's current
  `allowSoftLockOverride: false` (confirmed via `GET /tenant/fiscal-periods/postable-range`)
  even an Owner is refused. Verified live (403 above). Separately, `accounting.close.approve`
  was correctly split away from `softLockOverrideRoles` — "post a late adjustment" and "sign
  off a year-end close" are two authorities, documented at `fiscal-period.service.ts:2426`.

- **F-V5 · Reopen restores each period's PRIOR status, and the half-finished reopen is resumable.**
  `reopenFiscalYear` (`fiscal-period.service.ts:1431`) restores only periods carrying a
  captured `status_before_close`, deliberately leaves a pre-existing hard lock alone, then
  force-opens the ONE period holding the closing entry so the reversal can never become
  impossible, demotes every `complete` close run so the year must be re-reviewed, and audits
  each restored period — all inside the transaction that flips `is_closed`. The
  `isResumingReopen` branch handles "unlock committed, reversal did not". The historical-import
  case is handled too (`createFiscalYear:502` stamps `statusBeforeClose: 'open'` when a year is
  imported already-closed, so its periods restore through the same pair).
  **Verification gap: exercised by code read only — see G-1.**

- **F-V6 · Close/year-end writes its own journal in the same transaction as the status change.**
  No document-commits-before-GL hole here: the closing entry id lives on `fiscal_years`, the
  reopen's period unlock and the run invalidation are one `db.transaction`, and the ONE step
  that genuinely cannot share a transaction (the reversal, which owns its own) is made safe by
  establishing its single precondition idempotently first — reasoned explicitly in the source.

- **F-V7 · Opening balances are refused when they would double-count.** Three independent
  blockers in `opening-post-preconditions.ts`, each evaluated **twice** (before the transaction
  so a refusal leaves nothing behind, and again under the posting advisory lock so a race
  loser still cannot double a balance): `OB_GL_OPENING_ALREADY_POSTED`,
  `OB_CONTROL_ALREADY_SEEDED` (catches the ob_ar/ob_ap/ob_inv journals that post separately),
  and `OB_LIVE_TRANSACTIONS_EXIST` (`postingDate >= asOfDate`, `sourceDocumentType NOT IN`
  the opening types). Verified live:
  ```
  POST /tenant/opening-balances  -> 409 OB_GL_OPENING_ALREADY_POSTED
  "Opening balances are already on the books for this business. To finish an import that
   stopped part way, upload the same file you used the first time. …"
  ```
  Model plain-language error copy. The 4 pre-existing OB journals were **not touched**.

- **F-V8 · Import validation catches every defect class I threw at it.** One upload, five rows:
  ```
  DUPLICATE_ACCOUNT  "Account "1111" already appears earlier in the file"
  ACCOUNT_NOT_FOUND  "No active account matching "9999""
  HEADER_ACCOUNT     "Account "1110" is a header/group account and cannot hold a balance"
  ```
  Plus: empty file -> `"Uploaded file is empty"`; binary garbage -> `"The file has no data
  rows to import"`; >10 MB -> a plain-language split-the-file message. **Row tampering is
  blocked by a content fingerprint** — replaying `validate` with rows the client edited after
  upload returns `409 "The file content has changed since upload. Re-upload the file and try
  again."` That is a genuinely good control and it is why a partial-import forgery is not
  reachable from the client. Apply is a separate permission (`settings.import.apply` vs
  `settings.import.create`) and the GL/AR-AP posts are atomic
  (`opening-balance-import.service.ts:577` / `opening-party-import.service.ts:553`: "a throw
  means nothing was committed. Reopen for retry").

- **F-V9 · Date/timezone handling is correct, including the trap that was CRITICAL in POS Reports.**
  `validatePeriod` resolves the tenant-local calendar day via `todayInZone(tz)` against
  `tenant_identity.timezone` (Kuwait UTC+3) and compares 'YYYY-MM-DD' strings against
  Drizzle `date` columns — parse-free, no ms/µs coercion surface, no UTC-day window.
  **Period endpoints are INCLUSIVE on both sides**: `start_date <= d AND end_date >= d`
  in the app, and `posting_date < start OR posting_date > end` in the DB trigger. The last day
  of a period is postable — confirmed by posting `JRN-00001` on 2026-07-15 and by the July
  boundary probes. The resolved day is **returned** as `resolvedDate` and callers must persist
  it, precisely so the period link and the posting date cannot disagree across midnight
  (`journal-posting.service.ts:443`).

- **F-V10 · Every route in scope is permission-gated.** `fiscal-period.controller.ts` and
  `close-management.controller.ts`: no ungated mutation. The single unauthenticated-by-design
  route, `GET /tenant/fiscal-periods/postable-range`, carries a written rationale (every date
  picker in the product needs it; gating it would 403 a cashier's own POS sale) and still calls
  `assertLegalEntityAccess`. `GET :id/closing-entry-preview` is deliberately moved off the
  settings key onto `accounting.close.read` because it discloses full P&L totals. Frontend
  route-level gating is absent (action-level gates only) — that is the already-open
  cross-cutting **PERM-004**, server enforcement verified correct, not re-filed here.

- **F-V11 · Audit rows are written for every mutation in scope** — `FiscalPeriod`,
  `FiscalYear`, `CloseChecklistTemplate`, `OpeningBalanceImport`, with correct actor, correct
  before/after and the operator's reason. Verified in the DB (see F-07 for the labelling
  defect). Read-only stages (`map-accounts`, `validate`) are deliberately not audited, with
  the reasoning in the source; `POST :id/amend` deliberately omits `@Audited` because the saga
  writes its own — also documented, also not an omission.

- **F-V12 · No tax UI on a Kuwait screen.** The pre-closing checklist returned for FY2025
  contains 9 checks and `tax_returns_filed` is **not** among them
  (`pre-closing/compliance.check.ts` emits it only for tax jurisdictions; pinned by
  `pre-closing-checklist.service.spec.ts:303`). The `fiscal.closeYear.checks.tax_returns_filed`
  key exists in both bundles but stays dormant. Correct.

- **F-V13 · en/ar parity is complete and there are no em dashes in the message bundles.**
  `fiscal.json` 166/166 · `closeManagement.json` 78/78 · `openingBalance.json` 164/164 ·
  `openingImport.json` 177/177. Zero missing, zero extra, zero em/en dashes in either locale.

---

## WITHDRAWN AFTER INVESTIGATION

- **W-1 (was CRITICAL) — "A reversal bypassed the soft lock."** `POST /journal-entries/{id}/reverse`
  on an entry sitting in a soft-locked period succeeded with **no override reason**, which
  looked like a bypass. It is not: the reversal posts on **today's** date, and
  `evaluateReverseEligibility` (`journal-reverse-eligibility.ts:214`) correctly evaluates the
  period of the **reversal date**, not the original's. Confirmed in the DB —
  `JRN-00001 posting_date 2026-07-15 -> Jul 2026 (soft_locked)`, its reversal
  `JRN-00002 posting_date 2026-08-30 -> Aug 2026 (open)`. Acting on this would have broken a
  correct convention. A reversal can never be back-dated into the locked period it reverses.

- **W-2 (was "path divergence") — `/accounting/opening-balance` vs `/accounting/opening-balances`.**
  Not a divergence, not dead code, not a second implementation. `opening-balance/page.tsx` is a
  16-line `permanentRedirect` to `/accounting/opening-balances/new`, with a comment explaining
  it keeps old bookmarks working. Correct.

- **W-3 — "Two active close templates make run generation nondeterministic."**
  `findActiveTemplate` orders `desc(createdAt) limit 1`, so the pick is deterministic. The
  duplication is still a real defect (F-02) but the nondeterminism I suspected is not there.

- **W-4 — "`statusBeforeClose: 'open'` is hardcoded, so reopen restores the wrong status."**
  `createFiscalYear:502` sets it only on the historical-import path (`isClosed` at creation),
  where 'open' is the true prior state by construction — nothing had happened to those periods
  yet. Reasoned in the source. The real close path captures the actual per-period status.

---

## VERIFICATION GAPS (honest)

- **G-1 — Year close/reopen round trip was NOT executed end to end.** Reaching it requires 12
  completed close runs on FY2025, each needing a second approver; and it would post a real
  year-end closing journal into a live tenant. F-V5's restore logic is verified by **code read
  only**. The gate that guards it (F-V3) was verified live.
- **G-2 — `OB_LIVE_TRANSACTIONS_EXIST` could not be reached live** in this tenant: the
  `OB_GL_OPENING_ALREADY_POSTED` blocker fires first and short-circuits. Verified by code read
  (`opening-post-preconditions.ts:145-171`) plus its live sibling blocker.
- **G-3 — Partial-import recovery not exercised.** The apply stage is unreachable here (opening
  balances already posted), so "does a failed apply leave half the rows posted" rests on the
  atomicity comments and the `opening-run-recovery.ts` reopen path, not on an observed failure.
- **G-4 — Two concurrent close runs racing was not tested.** Run generation is idempotent by
  `(tenant, fiscal_period_id)` on inspection, but I did not fire two simultaneously; the API
  process was restarted twice mid-session by other agents, which made timing-sensitive tests
  unreliable.
- **G-5 — No browser pass.** All evidence is SQL + curl + code read. RTL rendering, the visual
  close-management workspace, the wizard's step flow and the 375/768/1280/1920 responsive
  checks are unverified. The i18n bundle parity in F-V13 is a file-level check, not a
  rendered-page check.
- **G-6 — AI column mapping returned zero suggestions** for the most obvious possible headers
  ("Account Code", "Debit", "Credit"): the upload came back with all four columns in
  `unresolvedColumns` and `missingRequired: ["account","debit","credit"]`. Given the AI-first
  import mandate this looks wrong, but the local AI service may simply not be running, so I am
  recording it as a gap rather than a finding.
- **G-7 — Export.** No export exists on any of the four screens in scope, so "open the exported
  file" was not applicable. Cross-references the open AUDIT-003.
- **G-8 — Deep pagination past page 1** was not exercised: `GET /tenant/close/runs` returned
  `{"data":[],"nextCursor":null}` and the fiscal-years list holds 2 rows. Not enough real data
  in this tenant to walk a keyset past page 1.
