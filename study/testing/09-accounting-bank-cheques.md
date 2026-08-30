# Phase F — Accounting: Bank Reconciliation & Cheques

Tenant: Gulf Auto Parts (KWD, 3dp). Ledger identity BEFORE: `0.000000` (889+ lines).
Ledger identity AFTER (final check below): `0.000000`. No correcting entries written.
All ZZTEST documents logged in `study/testing/_documents-created.md`.

## Findings

### 1. CRITICAL — CONFIRMED — On-account cheque documents commit while the GL entry permanently fails to post
An incoming cheque received with the default `settlementMode: "on_account"` (the API default —
no field forces `against_document`) posts a `customer_deposit` JE line to account **2151
"Customer Deposits"** and — per `accounting-events/helpers/build-cheque-je-payload.ts` lines
236-256 — deliberately attaches the customer as `partyId`/`partyType` on that line. But
`accounts/system-roles/system-role-registry.ts` (lines 54-73, hand-authored, load-time-guarded)
**deliberately excludes** `customer_deposits` (2151) from `PARTY_SUBLEDGER_ROLE_KEYS` — the
account is pooled, `isControlAccount: false`, and the file's own comment says tagging deposits
per party "would first require those template accounts to become control accounts" (open work,
Finding 15). `journal-entries/journal-posting.service.ts` (~line 1544) enforces this invariant
and rejects any line on a non-party account that carries a party.

Result: **every on-account cheque (the default path) creates a document (HTTP 201) whose GL
posting fails forever.** The outbox event retries and lands in terminal `failed` status with no
JE ever created — the cheque is invisible to the bank/AR view of the GL, exactly the "document
commits before GL posts" defect class this programme flags as highest-value.

Repro (owner token, Al Rai branch):
```
POST /api/v1/tenant/accounting/cheques
{"direction":"incoming","branchId":"43df4c2e-...","counterpartyId":"d54ba534-...",
 "counterpartyName":"ZZTEST Ahmad Al Mutairi 1","chequeNumber":"ZZTEST-CHQ-0001",
 "bankName":"ZZTEST National Bank","amount":"50.000","currency":"KWD",
 "chequeDate":"2026-08-29","receivedDate":"2026-08-29"}
→ HTTP 201, cheque id f3a930d0-de71-4534-b4a1-67ef8950a236, status "received"
```
```sql
select id, event_type, status, attempts, last_error from accounting_event_outbox
where id = 'd7c5beb8-06e9-4742-a3fe-c50c9dfa8826';
-- failed | 2 | "Journal line 2 (account ccc4c4b5-...): this account is not a party
--         sub-ledger, so the line must not carry a party."
```
```sql
select count(*), count(*) filter (where party_id is not null)
from journal_entry_lines where account_id = 'ccc4c4b5-5614-4e19-ad4e-99e0af15691d';
-- 1 | 0   (the one existing line on 2151 in this whole tenant history has NO party —
--           this path has never successfully posted in this tenant)
```
Fix direction (not applied — out of scope for a read/test pass): either (a) make 2151 (and
1161, the mirrored supplier_advance account) a party-sub-ledger control account and add it to
`PARTY_SUBLEDGER_ROLE_KEYS` (the design already anticipates this as "Finding 15"), or (b) stop
`build-cheque-je-payload.ts` from attaching a party to on-account cheque lines. (a) is more
consistent with the stated product need to track per-customer advances. This also affects the
`bounced`/`cancelled` reversal legs for on-account cheques (same `partyForChequeLine` function),
so a bounce of an on-account cheque would ALSO fail to post.

### 2. CRITICAL — CONFIRMED — Same GL line can be matched into two different bank reconciliations (double-matching)
`bank-reconciliation.service.ts::matchLine` verifies the target journal-entry-line exists and
belongs to the tenant, and that the bank-statement-line itself is `unmatched` — but never checks
whether that journal-entry-line is **already** matched to a line on this or any other statement.
Contrast with `auto-match.service.ts` (lines 83-98), which correctly builds a tenant-wide
`matchedJelIds` set from `bankStatementLines.matchedJournalEntryLineId` and excludes them from
its candidate pool. The manual match path has no equivalent guard, and there is no DB unique
constraint on `matched_journal_entry_line_id` either.

Repro (owner token):
```
POST .../bank-statements/{A}/match-line {"lineId":"554fd72d-...","journalEntryLineId":"ae92e1be-..."}
→ 200 {"success":true}
POST .../bank-statements/{B}/match-line {"lineId":"7d696a89-...","journalEntryLineId":"ae92e1be-..."}
→ 200 {"success":true}
```
```sql
select id, statement_id, match_status, matched_journal_entry_line_id
from bank_statement_lines where matched_journal_entry_line_id = 'ae92e1be-...';
-- 554fd72d... | 3c2db1c5(stmt A) | matched | ae92e1be...
-- 7d696a89... | cd231d7a(stmt B) | matched | ae92e1be...
```
Impact: the same KWD 7.332 cash movement can be "cleared" on two separate bank reconciliations,
each showing a false zero-difference tie-out (the exact "which side do you trust" failure mode
the addendum warns about, except here BOTH sides can independently claim it and both look clean).
Fix: apply the same tenant-wide "already matched" exclusion `auto-match.service.ts` already has,
to the manual `matchLine` path — one shared helper, not a second copy.

### 3. HIGH — CONFIRMED — Match / unmatch / no-match / reconcile actions produce zero audit log rows
All four bank-reconciliation-workspace mutation endpoints carry `@Audited("BankStatement")`:
`POST :id/match-line`, `:id/unmatch-line`, `:id/no-match`, `:id/reconcile`. None of my four
successful (HTTP 200) calls against ZZTEST statements produced an `audit_log` row.
```sql
select distinct action from audit_log where entity_type='BankStatement';
-- create | delete   (only)
```
Only `POST` (create) and `DELETE` (delete) on the statement itself are audited; the workspace
actions that actually move money between "cleared" and "outstanding" — including the
`accounting.reconciliation.approve`-gated finalize step — leave no trace of who did what, when.
Combined with finding #2, an operator could double-match a line and finalize both statements
with no audit record of either match action. Recommend the same class fix as `AUDIT-002`
(bulk accounts) already tracked for this phase — likely the interceptor is silently skipping
these handlers because their response body (`{success:true}`) carries no entity snapshot to
diff, and needs either an explicit `action` override or an entity-registry hook for
`BankStatementLine`.

### 4. LOW/FRICTION — SUSPECTED, not exercised live — no test data for this tenant
`bank_statements`, `bank_statement_lines`, and `cheques` were all EMPTY (0 rows) in Gulf Auto
Parts before this session. This means the real UI screens for bank reconciliation and cheques
have never been walked with real production-shaped data by any prior testing pass — the
tenant's existing bank account (1121 "Primary Bank Account") already carries 68,637.181 KWD of
unreconciled book activity from other document types (sales, purchase, POS), which made it
impossible to construct a genuinely BALANCED reconciliation through the API in the time
available (see Verification Gaps). This is not a defect, but it means findings 1-3 are the
extent of what a curl-and-SQL pass could confirm before this session needed to close out; a
full click-through of `/accounting/bank-reconciliation` and `/accounting/cheques` in the browser
with realistic data remains open.

## Verified working (do not re-litigate)

- **Reconciliation math is shared, not duplicated.** `reconciliation-math.ts` is pure,
  Decimal-based, and used by both the live workspace (`bank-reconciliation.service.ts`) and the
  printable report (`reports/bank-reconciliation-report.service.ts`) per its own header comment —
  the prior two-implementation bug this file documents fixing.
- **Sign-off tolerance is currency-derived**, not a hardcoded 0.01 — `reconciliationTolerance()`
  uses half a minor unit (KWD 0.0005), so a KWD statement out by even one fils cannot be signed
  off. Read end to end; matches the addendum's warning about the old hardcoded 0.01 bug exactly
  (this is the FIX for that bug, already shipped).
- **The "complete while out of balance" bypass does NOT work.** Tried directly via curl
  (bypassing the UI) against a statement with an intentionally wrong closing balance:
  ```
  POST .../bank-statements/{C}/reconcile → 400 "Cannot reconcile: difference is
  127267.031000. Must be zero."
  ```
  The gate is server-side in `BankReconciliationService.reconcile()`, re-derives the summary
  itself, and is not just a UI-layer check.
- **Reconciled statements cannot be deleted.** `deleteStatement()` throws `ForbiddenException`
  for `status === "reconciled"`; non-reconciled statements delete cleanly (by design — lines
  cascade, matched JEL references clear harmlessly, no JEL is ever deleted). Verified by code
  read; a non-reconciled ZZTEST statement was deleted successfully (204) in this session as
  ordinary cleanup, confirming the non-reconciled path works.
- **Unmatching a reconciled line is blocked** — `unmatchLine()` throws `ConflictException` when
  `line.matchStatus === "reconciled"`. Verified by code read only (I could not drive a real
  statement to a genuinely balanced/reconciled state in this session — see gap below — so this
  control was not exercised live).
- **Cheque status transitions use the correct transactional-outbox pattern.** In
  `cheques.service.ts::transition()`, the status-flip UPDATE (with an optimistic-concurrency
  `eq(status, fromStatus)` guard against a double-clear race) and the outbox-event INSERT happen
  in the SAME `db.transaction()`. Tax resolution for a re-billed bounce fee happens BEFORE the
  transaction opens, so a missing tax config throws 422 before the cheque is ever left bounced
  with a doomed JE. This is the correct shape and rules out the classic "document commits, GL
  never posts" defect for the STATUS-TRANSITION path — finding #1 is a different failure (a
  structurally-impossible JE payload for the RECEIVED event's on-account leg, not a transaction
  boundary problem).
- **Cheque cursor pagination uses the ms-vs-microsecond-safe direction.** `cheques.cursor.ts` /
  `cheques.service.ts::list()` encode the cursor via `new Date(last.createdAt).toISOString()`
  (JS, millisecond precision) then compare `< cursor.createdAt::timestamptz` against Postgres's
  microsecond-precision column. Truncation here always FLOORS (JS drops sub-ms digits, never
  rounds up), and the comparison direction is a strict `<` on a DESC-ordered cursor — the boundary
  row's own truncated value is always `<=` its true value, so the row itself is correctly
  excluded from the next page and no row in between can exist (any row that would sort between
  the floor and the true value would already have appeared earlier in the DESC order). Read
  through carefully because this is exactly the RPT-037 bug shape; concluded SAFE by inspection,
  not reproduced against >1 page of live data (see gap below).
- **Ledger identity held throughout.** `0.000000` before and after every write in this session,
  because the reproduced defects never actually post a JE at all (finding #1) or never touch the
  ledger (finding #2/#3 are matching/audit gaps, not money movements).

## Withdrawn after investigation

- None. Did not chase and disprove any hypothesis to completion in the time available — see
  gaps below instead.

## Verification gaps (honest)

- **No page-2 walk of `/accounting/bank-reconciliation` or `/accounting/cheques` lists** — both
  tables were empty for this tenant before this session, and I only created 4 ZZTEST bank
  statements + 1 ZZTEST cheque, nowhere near enough rows to reach a second page. The cheque
  cursor's safety was established by code reading only (see above), not by walking real
  paginated data.
- **Did not drive a real statement to `canReconcile: true`.** The existing bank account 1121 in
  this live tenant carries 68,637.181 KWD of unreconciled book-side activity from real sales/
  purchase/POS documents already in the tenant, so a true zero-difference reconciliation would
  require either matching or no-matching dozens of pre-existing JE lines (out of scope: I was
  told never to touch pre-existing documents, and matching a JE line is not "touching" it, but
  doing so at the scale needed to zero out 68k+ KWD of real book activity risked leaving the
  reconciliation UI in a confusing state for other concurrent test sessions sharing this tenant).
  This means finding #3 (no audit on match/unmatch/reconcile) is proven for match/unmatch, and
  the `reconcile` endpoint's audit gap is INFERRED (same decorator, same missing pattern) but
  not independently fired against a genuinely successful reconcile call.
- **Did not test the cheque bounce/cancel reversal path live** — CRITICAL finding #1 already
  proves the RECEIVED event for on-account cheques cannot post, which blocks constructing a
  clean state to test bounce from. The code read (finding #1's "also affects bounce/cancel"
  note) is a code-level inference, not a live repro.
- **Did not check en/ar parity, RTL, or run a browser pass at all** — this was a breadth-first
  code+SQL+curl pass per the addendum's method; no visual/i18n confirmation pass was done in the
  time available. Flagging as an open gap rather than silently skipping it.
- **Did not check the bank-account/party picker's `useListWithDirectoryFallback` usage** on the
  bank-reconciliation or cheques screens (frontend code not read in this pass) — cross-cutting
  defect pattern #5 from the addendum was not swept here.
- **`getStatementForUpdate`'s `version` optimistic-lock and `updateStatementStatus`'s own
  `eq(bankStatements.version, currentVersion)` predicate were read but not raced live** (no
  concurrent-request test for a lost-update on the reconcile/version bump path).

Final ledger identity check:
```sql
select round(sum(debit-credit),6) from journal_entry_lines;  -- 0.000000
```

---

## 2026-08-30 addendum — coordinator challenge on CRITICAL #2, and CRITICAL #1 follow-ups

### CRITICAL #2 (double-matching) — RE-REPRODUCED live, evidence left in place. STANDS AS CRITICAL.

The coordinator's query correctly found no duplicate at the moment they ran it — because I had
deleted statement A (`3c2db1c5-...`) as post-test cleanup shortly after observing the duplicate,
and `bank_statement_lines` cascade-deletes with its parent statement (`onDelete: "cascade"`, see
`bank-reconciliation-crud.service.ts` comment above `deleteStatement`). The duplicate state was
real when I recorded it (I read the two rows back via SQL at the time, both in my transcript),
but my own cleanup destroyed the evidence before handoff. That is a reporting-hygiene failure on
my part (I should have left repro state in place, per the write-safety norm), not a false claim —
but since I can't ask the coordinator to take my word for a deleted row, I re-produced it fresh
end to end and this time left it standing.

**Re-repro (owner token, Al Rai branch, both statements ZZTEST-prefixed, NOT deleted):**
```
POST /api/v1/tenant/bank-statements   (stmt X)
{"bankAccountId":"73e3ee6d-...","statementDate":"2026-08-26","periodStart":"2026-08-01",
 "periodEnd":"2026-08-26","openingBalance":"0.000","closingBalance":"3.583","currency":"KWD",
 "lines":[{"date":"2026-08-26","description":"ZZTEST dup-match repro line X","amount":"3.583"}]}
→ 201, stmt 76efb261-c81a-436f-b37b-40d9c151a12f, line 4dd16648-1392-4eb4-8a78-3272eca315a8

POST /api/v1/tenant/bank-statements   (stmt Y)
{"bankAccountId":"73e3ee6d-...","statementDate":"2026-08-30","periodStart":"2026-08-01",
 "periodEnd":"2026-08-30","openingBalance":"0.000","closingBalance":"3.583","currency":"KWD",
 "lines":[{"date":"2026-08-26","description":"ZZTEST dup-match repro line Y","amount":"3.583"}]}
→ 201, stmt 6c065fd6-04b1-4afa-a2e0-41a2e5c90ee4, line a061226a-2ee7-406a-a31f-d9958fabe1df

POST /api/v1/tenant/bank-statements/76efb261-c81a-436f-b37b-40d9c151a12f/match-line
{"lineId":"4dd16648-1392-4eb4-8a78-3272eca315a8","journalEntryLineId":"e667274b-48ce-43b3-8e84-aa166d536ae8"}
→ 200 {"success":true}

POST /api/v1/tenant/bank-statements/6c065fd6-04b1-4afa-a2e0-41a2e5c90ee4/match-line
{"lineId":"a061226a-2ee7-406a-a31f-d9958fabe1df","journalEntryLineId":"e667274b-48ce-43b3-8e84-aa166d536ae8"}
→ 200 {"success":true}
```

**Coordinator's exact SQL, re-run against the live DB right now, still shows the duplicate:**
```sql
SELECT matched_journal_entry_line_id, count(*) AS times_matched,
       count(DISTINCT statement_id) AS distinct_statements
FROM bank_statement_lines WHERE matched_journal_entry_line_id IS NOT NULL
GROUP BY matched_journal_entry_line_id HAVING count(*) > 1;
```
```
     matched_journal_entry_line_id     | times_matched | distinct_statements
--------------------------------------+---------------+---------------------
 e667274b-48ce-43b3-8e84-aa166d536ae8 |             2 |                   2
```
```sql
select id, statement_id, match_status, matched_journal_entry_line_id
from bank_statement_lines where matched_journal_entry_line_id = 'e667274b-...';
```
```
                  id                  |             statement_id             | match_status
--------------------------------------+--------------------------------------+--------------
 4dd16648-1392-4eb4-8a78-3272eca315a8 | 76efb261-c81a-436f-b37b-40d9c151a12f | matched
 a061226a-2ee7-406a-a31f-d9958fabe1df | 6c065fd6-04b1-4afa-a2e0-41a2e5c90ee4 | matched
```
Both statements (`76efb261-...`, `6c065fd6-...`) are ZZTEST-prefixed, logged in
`study/testing/_documents-created.md`, and **deliberately LEFT IN PLACE** this time as standing
evidence — do not delete them; they are the artifact for this finding.

**Verdict: CRITICAL stands, CONFIRMED.** The code-level cause is exactly as originally
diagnosed: `BankReconciliationService.matchLine()` never checks whether the target
`journalEntryLineId` is already referenced by another `bank_statement_lines` row (this or any
other statement), unlike `AutoMatchService`, which correctly builds a tenant-wide
"already matched" exclusion set before offering candidates. There is also no DB-level unique
constraint on `matched_journal_entry_line_id` to catch this as a second line of defense. Nothing
downstream prevents the duplicate — both statements will independently compute
`canReconcile: true` off the same cleared cash movement if their other lines line up, which is
the false-double-clear scenario the original finding described.

### CRITICAL #1 follow-ups (cheque / 2151 party defect) — independently confirmed by coordinator; here is the requested evidence and proposal

**1. Document-vs-GL contrast, confirmed with fresh SQL:**
```sql
select id, cheque_number, status, direction, amount, currency, counterparty_name, settlement_mode
from cheques where id = 'f3a930d0-de71-4534-b4a1-67ef8950a236';
```
```
f3a930d0-... | ZZTEST-CHQ-0001 | received | incoming | 50.000000 | KWD | Ahmad Al Mutairi 1 | on_account
```
```sql
select count(*) from journal_entries where source_document_id = 'f3a930d0-de71-4534-b4a1-67ef8950a236';
-- 0
```
```
GET /api/v1/tenant/accounting/cheques/f3a930d0-de71-4534-b4a1-67ef8950a236 → 200, full cheque
detail returned (same shape the cheque detail SCREEN renders from) — status "received", no
warning field, nothing in the response shape signals the GL failure.
```
The outbox row is `status=failed, attempts=3/5` with the party error — the failure is not a
capacity/queue problem that more retries would clear, it is a deterministic validation rejection
on every attempt, so it is permanently unrecoverable through the retry mechanism, whether or not
it has technically exhausted `max_attempts` yet. **The cheque exists, is fully visible and
actionable in the UI (it can be deposited, presented, etc. — the state machine has no gate on
"does this cheque have a posted GL entry"), and the books never move.** This is the contrast the
addendum flags as the highest-value defect shape in this module.

**2. Bounce/cancel blast radius — exercised live, confirmed to ALSO fail:**
Created ZZTEST-CHQ-0002 (incoming, 25.000 KWD, `settlementMode: on_account`, id
`cb7cff7e-bc1e-4823-949b-df476af7b493`), then `deposit` → `bounce`:
```sql
select payload::jsonb->>'eventType' as event, status, attempts, left(last_error,90)
from accounting_event_outbox
where payload::jsonb->>'sourceDocumentId' = 'cb7cff7e-bc1e-4823-949b-df476af7b493'
order by created_at;
```
```
        event               |  status   | attempts | last_error
cheque.status.received      | failed    | 2        | ...account is not a party sub-ledger...
cheque.status.deposited     | completed | 0        | (posts fine — no party on this leg)
cheque.status.bounced       | failed    | 1        | ...account is not a party sub-ledger...
```
`bounce` returned HTTP 200 and flipped the cheque to `status: "bounced"` — looking, to any user,
like a fully resolved lifecycle event — while its GL entry failed for the identical reason as
`received`. **Confirmed: the blast radius covers all three call sites `partyForChequeLine` feeds
(`received`, `bounced`, and by the same code path `cancelled`)**, for every on-account cheque,
both directions (incoming via `customer_deposit`/2151, outgoing via `supplier_advance`/1161 —
not separately exercised live due to time, but it is the same function with the same unconditional
`payable`/`supplier_advance` branch).

Side effect worth flagging (not a new finding, a corollary of #1): because `received` never
posted, the one JE that DID post (`deposited`, JE `6d77c5ae-...`) is a self-consistent, balanced
entry on its own (25.000 dr `Bank – Cheques in Transit` 1129 / 25.000 cr `Cheques in Hand` 1150
region — exact accounts per the JE lines) but it is crediting an asset account for a receivable
that was never debited, i.e. correct in isolation, silently wrong against the real subledger.
Global ledger identity stays 0.000000 throughout because every JE that DOES post is internally
balanced; the damage from #1 is entirely in JEs that never exist, not in unbalanced ones.

**3. Proposed fix, at the primitive (not implemented — proposal only):**

Do not touch `system-role-registry.ts`'s accounting policy (2151/1161 stay pooled, non-control —
that is a deliberate, larger decision tracked separately as "Finding 15"). Instead, make
`partyForChequeLine()` in `accounting-events/helpers/build-cheque-je-payload.ts` structurally
incapable of attaching a party to a line type whose target account is not a real party
sub-ledger, by deriving eligibility from the SAME source of truth
`journal-posting.service.ts` already enforces at posting time
(`PARTY_SUBLEDGER_ROLE_KEYS` / `resolvePartyRequirement` in
`accounts/system-roles/system-role-registry.ts`), instead of the hand-maintained
`lineType === "receivable" || lineType === "customer_deposit"` string match that currently
exists ONLY in the builder and has silently drifted out of sync with the registry's own
(correct) exclusion list. Concretely:

- Export a small pure predicate next to `PARTY_SUBLEDGER_ROLE_KEYS`, e.g.
  `isPartySubledgerRole(roleKey: SystemRoleKey): boolean`, that is just
  `PARTY_SUBLEDGER_ROLE_KEYS.has(roleKey)` — a one-line addition to the file that already owns
  this invariant, so there is exactly one place that ever answers "does this line type carry a
  party."
- In `build-cheque-je-payload.ts`, replace the current `lineType`-string match in
  `partyForChequeLine` with a `LINE_TYPE_TO_SYSTEM_ROLE` map (`receivable → "trade_receivables"`,
  `payable → "trade_payables"`, `customer_deposit → "customer_deposits"`,
  `supplier_advance → "supplier_prepayments"`) and gate the return value on
  `isPartySubledgerRole(LINE_TYPE_TO_SYSTEM_ROLE[line.lineType])`. When that predicate is false
  (as it now correctly is for `customer_deposit`/`supplier_advance`), the function returns
  `undefined` and no party is ever attached — the JE payload becomes valid by construction, not
  "valid because nobody has exercised the on-account path yet."
- Because `partyForChequeLine` is the ONE function `received`, `bounced`, and `cancelled` all
  call (confirmed above by exercising `received` and `bounced` and seeing the identical error),
  this fixes all three call sites in one place — no second copy to forget, which is the
  path-divergence pattern this programme keeps finding elsewhere.
- This makes the bug impossible rather than absent: any FUTURE line type added to the cheque
  payload (or a future line type added anywhere else that reuses this predicate) inherits
  correctness automatically from the registry, instead of needing a human to remember to update
  a second hand-copied exclusion list.
- Once this ships, on-account cheque `received`/`bounced`/`cancelled` events will post with the
  `customer_deposit`/`supplier_advance` leg carrying NO party — i.e. the deposit/advance balance
  becomes a pooled liability/asset exactly as `system-role-registry.ts` already intends, with no
  per-customer/per-supplier attribution on that leg (attribution for on-account cheque advances,
  if wanted, is the larger "Finding 15" work of promoting 2151/1161 to control accounts).

### Ledger identity re-verified with the coordinator's status-aware form

```sql
SELECT round(sum(l.debit - l.credit), 6) FROM journal_entry_lines l
JOIN journal_entries je ON je.id = l.journal_entry_id
WHERE je.status IN ('posted','reversed');
-- 0.000000  (checked before this addendum's writes and after; unchanged)
```
No pre-existing document touched, no opening-balance journal touched, no correcting entry
written. All new documents (2 bank statements + 1 bank-statement line pair + 1 cheque +
1 deposit/bounce transition on a second cheque) logged in
`study/testing/_documents-created.md`, prefixed `ZZTEST`.

---

## Fixes applied (2026-08-30, Phase F remediation)

Ledger identity BEFORE any write this session (status-aware form): `0.000000`.

### BUG A — on-account cheque commits while its GL posting fails forever — FIXED

**Root cause (restated precisely).** `partyForChequeLine()` in
`erp/apps/api/src/accounting-events/helpers/build-cheque-je-payload.ts` decided party
eligibility from a hand-copied line-type string match
(`lineType === "receivable" || lineType === "customer_deposit"` / `payable ||
supplier_advance`). The posting chokepoint decides the same question from
`PARTY_SUBLEDGER_ROLE_KEYS` in `accounts/system-roles/system-role-registry.ts`, which
deliberately contains only `trade_receivables` and `trade_payables`. The two answers
disagreed for the advance legs, so every on-account cheque built a structurally
invalid JE payload. Classic defect pattern #1 (one question, two bodies).

**The shared predicate extracted.**
`system-role-registry.ts` now exports:

```ts
export function isPartySubledgerRole(roleKey: SystemRoleKey): boolean {
  return SYSTEM_ROLES_BY_KEY.get(roleKey)?.requiresParty === true;
}
```

`hasPartySubledgerRole` (the enforcement side, used by `resolvePartyRequirement`) was
rewritten to call it, so the enforcer and every producer now read ONE body.

`build-cheque-je-payload.ts` replaced the string match with a `CHEQUE_PARTY_LINE_ROLES`
map (`receivable → trade_receivables`, `payable → trade_payables`,
`customer_deposit → customer_deposits`, `supplier_advance → supplier_prepayments`) and
gates the return on `isPartySubledgerRole(...)`. A line type absent from the map can
never carry a party. This is pattern #2 (fix at the primitive): if 2151/1161 are ever
promoted to control accounts under Finding 15, this producer follows automatically with
no edit — the drift that caused this bug is no longer expressible.

`system-role-registry.ts` was NOT changed in policy. 2151/1161 stay pooled and
non-control, as the file's own comment intends. That decision was left where it belongs.

**Blast radius closed in one place.** `received`, `bounced` and `cancelled` all route
through `partyForChequeLine`, both directions. No second call site was patched, because
there is no second body.

**Live verification (fresh ZZTEST cheque, full lifecycle, after a verified-fresh build).**
`ZZTEST-CHQ-0003`, incoming, KWD 50.000, `settlementMode: on_account` (the default),
id `77310dff-0502-4369-98c9-551e93163cff`. Driven `received → deposited → bounced`:

```sql
select payload::jsonb->>'eventType' as event, status, attempts, left(coalesce(last_error,''),70) err
from accounting_event_outbox
where payload::jsonb->>'sourceDocumentId' = '77310dff-0502-4369-98c9-551e93163cff'
order by created_at;
```
```
          event          |  status   | attempts | err
-------------------------+-----------+----------+-----
 cheque.status.received  | completed |        0 |
 cheque.status.deposited | completed |        0 |
 cheque.status.bounced   | completed |        0 |
```
BEFORE the fix the same two events read `failed / "this account is not a party
sub-ledger, so the line must not carry a party"` (see the addendum above). The GL entries
now exist and every leg is balanced:
```
      entry_number      | status | code |             name              |   debit   |  credit   | party_id
------------------------+--------+------+-------------------------------+-----------+-----------+----------
 B1ALRAIMAINS-JRN-00097 | posted | 1134 | Post-Dated Cheques Receivable | 50.000000 |  0.000000 |
 B1ALRAIMAINS-JRN-00097 | posted | 2151 | Customer Deposits             |  0.000000 | 50.000000 |
 B1ALRAIMAINS-JRN-00098 | posted | 1129 | Bank - Cheques in Transit     | 50.000000 |  0.000000 |
 B1ALRAIMAINS-JRN-00098 | posted | 1134 | Post-Dated Cheques Receivable |  0.000000 | 50.000000 |
 B1ALRAIMAINS-JRN-00099 | posted | 2151 | Customer Deposits             | 50.000000 |  0.000000 |
 B1ALRAIMAINS-JRN-00099 | posted | 1129 | Bank - Cheques in Transit     |  0.000000 | 50.000000 |
```
The advance leg now carries NO `party_id`, which is exactly the registry's stated policy,
and the three entries net to zero across the whole lifecycle.

### Ruling on the "document commits before its GL posts" CLASS

**The transaction boundary is correct, and that is precisely why this was so dangerous.**
Verified by reading `cheques.service.ts::transition()`: the status UPDATE (guarded by an
optimistic `eq(status, fromStatus)` predicate) and the outbox-event INSERT are inside ONE
`db.transaction()`. The transactional-outbox pattern is implemented properly. What it
guarantees is that *an event will be delivered*; it cannot guarantee that the event is
*postable*. A payload that the posting chokepoint rejects deterministically fails on
attempt 1, 2, 3 and every future retry, so the document is durably visible while its GL
entry durably does not exist — and the ledger identity stays at `0.000000` throughout,
because the damage is entirely in journal entries that were never written. No balance
check anywhere in the product can see this.

The product ruling: **retry exhaustion on an `accounting.post` event is a business-visible
state, not an infrastructure detail.** A deterministic rejection is not a transient
failure and must not be treated as one. Recommended, in priority order (none implemented
here — out of scope for this fix, and each is a design decision worth its own pass):

1. **Surface it.** A document whose posting event is in `failed`/dead-letter must say so
   on its own detail screen and in its list row, in plain language ("This cheque is not in
   your books yet. Support has been notified."), and must be excluded from any tie-out
   that claims completeness. Today `GET /cheques/:id` returns a clean 200 with nothing in
   the shape that signals the GL failure — a screen literally cannot show what the API does
   not say.
2. **Classify the failure.** Split the outbox's terminal state into *transient-exhausted*
   (retry may help; alert ops) and *invalid-payload* (retry can never help; alert
   engineering immediately and stop retrying). Three wasted attempts against a schema
   invariant is a monitoring blind spot, not resilience.
3. **Do not block the transition.** Validating the payload synchronously before commit
   would trade a silent GL gap for a hard failure in front of a cashier holding a physical
   cheque, and the Purchase programme's lesson was that blocking ordinary input at a late
   gate is its own defect. Post-hoc surfacing plus a build-time-impossible payload (what
   this fix does) is the right shape.
4. **Compensation is not needed here** and would be wrong: nothing was posted, so there is
   nothing to reverse. Replaying the outbox event after a code fix is the correct remedy —
   which is exactly what the pre-existing failed ZZTEST rows would need.

### BUG B — the same GL line matched into two statements — FIXED (app + database)

**The shared predicate extracted.** New file
`erp/apps/api/src/bank-reconciliation/matched-jel-exclusion.ts`:

- `fetchMatchedJelIds(db, tenantId, onlyJelIds?)` — the tenant-wide set of
  already-matched journal-entry-line ids, optionally narrowed to specific candidates.
- `isJelAlreadyMatched(db, tenantId, jelId)` — a thin call into the same body.

`AutoMatchService` now calls `fetchMatchedJelIds(db, tenantId)` (its inline query was
deleted, not duplicated). `BankReconciliationService.matchLine()` calls
`isJelAlreadyMatched(...)`. One body, two callers. `auto-match`'s condition was **not**
copied into `matchLine` — copying it is how this class of bug recurs.

**User-facing refusal.** A stable code plus plain-language copy that says what to DO:
```
409 {"code":"BANK_JEL_ALREADY_MATCHED",
     "message":"This transaction is already matched on another bank statement.
                Unmatch it there first, or pick a different transaction."}
```
No raw ids, no internal parameter names, no jargon, no em dash.

**DB-level constraint: YES, added.** Migration
`erp/packages/db/drizzle/0315_concerned_mephisto.sql` converts the existing partial index
`bsl_matched_jel_id_idx` into a partial UNIQUE index `bsl_matched_jel_id_unique` on
`matched_journal_entry_line_id WHERE matched_journal_entry_line_id IS NOT NULL`.

Why this is safe against the legitimate cases, each checked in code:
- **Unmatching frees the line.** `unmatchLine()` → `updateLineMatchStatus(id,
  "unmatched", null, null)` nulls the column, and the partial predicate drops the row out
  of the index. No leak.
- **Deleting a statement frees its lines.** `bank_statement_lines.statementId` is
  `onDelete: "cascade"`.
- **A reconciled statement legitimately keeps its match forever.** That is the state the
  index is there to protect — a cleared cash movement must stay claimed by exactly one
  statement. `unmatchLine()` already refuses a `reconciled` line, so nothing can strand it.
- **No voided/reversed statement path retains a stale match** — there is no void concept
  on `bank_statements`; the terminal states are `reconciled` (keeps it, correctly) or
  deletion (cascades).

Migration mechanics, per the stated rules: every statement carries
`--> statement-breakpoint`; `meta/_journal.json` was generated by `drizzle-kit generate`
and never hand-edited; no `CONCURRENTLY` (the migrator runs the whole pending set in ONE
transaction); no `::text` anywhere in the predicate (the predicate compares a uuid column
to NULL, no enum involved). **Existing duplicates are handled explicitly** by a preceding
`UPDATE` that releases the losing rows back to `unmatched` (link nulled, satisfying the
`bsl_unmatched_no_jel_check` CHECK), keeping the row that is hardest to undo: a
`reconciled` line wins over a merely `matched` one, then the earliest `created_at` wins.
Nothing financial is deleted — the losing bank line simply returns to the operator's
matching queue.

**Live verification.** Against the standing duplicate evidence
(`e667274b-48ce-43b3-8e84-aa166d536ae8`, matched on both `76efb261-...` and
`6c065fd6-...`), a third match attempt on a new ZZTEST statement
`bcabdbe3-9c26-46cd-9589-4415c52f4221` / line `4af51eb0-2416-4145-824e-7a615a0c9df4`:

```
POST /api/v1/tenant/bank-statements/bcabdbe3-.../match-line
{"lineId":"4af51eb0-...","journalEntryLineId":"e667274b-..."}
→ HTTP 409
{"statusCode":409,"error":"Conflict","code":"BANK_JEL_ALREADY_MATCHED",
 "message":"This transaction is already matched on another bank statement. Unmatch it
  there first, or pick a different transaction."}
```
BEFORE the fix this exact call returned `200 {"success":true}` (twice — see the addendum).
A control match of the SAME bank line against a genuinely free JEL
(`c70f9412-0945-4542-a854-46d09d6abcb2`) returned `200 {"success":true}`, proving the
guard refuses only the duplicate and does not break ordinary matching.

### AUDIT gap on match / unmatch / no-match / reconcile — root cause established, fixed

**It was NOT a bank-reconciliation defect.** The zero-rows symptom was the
already-diagnosed global interceptor bug: `audit-log.interceptor.ts` resolved tenant
context via the AsyncLocalStorage-backed `getTenantContextOrNull()`, which is always
`undefined` at interceptor time because the global `AuditLogInterceptor` composes OUTSIDE
`TenantContextInterceptor`'s `tenantStore.run()`. The `if (!tenantContext) return
next.handle()` early-return therefore fired on EVERY interceptor-audited mutation, for
every entity type — not just BankStatement. A concurrent session had already fixed this
in source (read `request.tenantContext`, populated by a Guard, which always runs before
any interceptor). **`audit-log.interceptor.ts` was NOT edited by this pass.** The prior
agent measured the pre-fix binary.

Confirmed live after my rebuild: a `match-line` call now writes an `audit_log` row.

The residual, genuinely bank-rec-specific defect this exposed: every workspace mutation is
a `POST`, so `HTTP_METHOD_TO_ACTION` recorded all of them as `action='create'` —
indistinguishable from creating the statement itself, which is exactly why
`select distinct action ... where entity_type='BankStatement'` showed only `create|delete`
even once rows started landing. Fixed in `bank-reconciliation.controller.ts` using the
decorator's existing override, no interceptor change:
`@Audited("BankStatement", { action: AuditAction.Update })` on `autoMatch`, `matchLine`,
`unmatchLine`, `noMatch` and `reconcile`. `BankStatement` is already registered in
`audit-entity-registry.ts`, so before-snapshots are captured for these Updates.

### Tests

- `accounting-events/helpers/build-cheque-je-payload.spec.ts` — **a stale test demanded
  the defect** and was replaced, not deleted: `"the advance legs carry the sub-ledger
  party (advances are party-scoped balances)"` asserted a party on the
  `customer_deposit` / `supplier_advance` legs. It passed only because the builder is a
  pure function that never consults the registry, so it pinned a payload the posting
  chokepoint rejects 100% of the time. Classified before touching: WRONG assertion,
  inverted with a comment recording why. Added a second test walking `received`,
  `bounced` and `cancelled` in BOTH directions asserting no on-account leg carries a
  party and every payload balances. `Test Suites: 1 passed, Tests: 57 passed`.
- `bank-reconciliation/bank-reconciliation.service.spec.ts` — added
  `"refuses a JEL already matched on ANOTHER statement, with a stable code"`, asserting
  the 409, the `BANK_JEL_ALREADY_MATCHED` code, and that `updateLineMatchStatus` is never
  called. No existing assertion changed. `Test Suites: 1 passed, Tests: 22 passed`.

Both run narrowly (`npx jest <fragment> --no-coverage` from `apps/api`), "Test Suites: 1"
confirmed in each. No snapshot regenerated.

### How the compiled binary was verified fresh

`pnpm --filter @zerupt/api build` (exit 0), then grepped the COMPILED SERVICE OUTPUT for
the NEW symbols — not `dist/main.js`, which does not change when only services recompile:

```
apps/api/dist/accounts/system-roles/system-role-registry.js:3   (isPartySubledgerRole)
apps/api/dist/accounting-events/helpers/build-cheque-je-payload.js:2  (isPartySubledgerRole)
apps/api/dist/bank-reconciliation/bank-reconciliation.service.js:1    (BANK_JEL_ALREADY_MATCHED)
apps/api/dist/bank-reconciliation/matched-jel-exclusion.js            (new file present)
```
Then killed the listener on 3001 and restarted `node --enable-source-maps dist/main`.
Every live result above was produced against that process.

### Migration applied and the DB invariant proven live

`node dist/migration/migrate-all.cli` applied `0315` to the tenant fleet. On the Gulf
Auto Parts DB:

```sql
select indexname from pg_indexes where tablename='bank_statement_lines';
--  bank_statement_lines_pkey
--  bsl_statement_id_idx
--  bsl_statement_match_status_idx
--  bsl_matched_jel_id_unique     <- was bsl_matched_jel_id_idx (non-unique)
```

The standing duplicate evidence was released exactly as the migration's tie-break
intends — the earliest row keeps the match, the later one returns to the operator's
queue with a NULL link:
```
                  id                  |             statement_id             | match_status | matched_journal_entry_line_id
 4dd16648-...(repro line X)           | 76efb261-...                         | matched      | e667274b-...
 a061226a-...(repro line Y)           | 6c065fd6-...                         | unmatched    | (null)
```
```sql
SELECT matched_journal_entry_line_id, count(*) FROM bank_statement_lines
WHERE matched_journal_entry_line_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
-- (0 rows)
```

Second line of defence proven by trying to recreate the duplicate BENEATH the
application, straight against Postgres (rolled back):
```sql
BEGIN;
UPDATE bank_statement_lines SET match_status='matched',
  matched_journal_entry_line_id='e667274b-48ce-43b3-8e84-aa166d536ae8'
WHERE id='a061226a-2ee7-406a-a31f-d9958fabe1df';
-- ERROR: duplicate key value violates unique constraint "bsl_matched_jel_id_unique"
ROLLBACK;
```
Double-matching is now impossible, not merely refused.

### Frontend: the refusal is actually shown, in ar and en

`matchLine` had NO `onError` handler at all — a refused match failed **silently**, leaving
the user staring at two lines that simply would not join. Added an `onError` on the
`handleManualMatch` mutation in `reconciliation-workspace.tsx` that maps the stable code
(never the server's English sentence) through next-intl, with a generic fallback:
`bankReconciliation.workspace.errors.BANK_JEL_ALREADY_MATCHED` and `...errors.matchFailed`,
both added to `messages/en/` (source of truth) and `messages/ar/`. No em dashes, no raw
ids, no internal parameter names; the copy says what to DO.
`pnpm --filter @zerupt/web i18n:check` → **"Translation check passed. All locales are in sync."**

### Verification gaps and things deliberately NOT fixed

- **`audit-log.interceptor.ts` was deliberately not touched** — a concurrent session owns
  the fix for the global tenant-context bug that caused the zero-rows symptom, and their
  fix is already in source and confirmed working. Editing it would have collided.
- **The pre-existing failed outbox rows for ZZTEST-CHQ-0001 / 0002 were NOT replayed.**
  They are the historical evidence for this finding and replaying them would post JEs
  dated to a prior repro. The fix is proven on a fresh document instead.
- **`apps/api` full `tsc --noEmit` does not pass on this tree**, but every error is in
  another session's in-flight files (`purchase/payments/supplier-payments.service.ts`,
  `purchase/returns/purchase-returns-events.spec.ts`, `sales/credit-notes/credit-notes.events.ts`,
  `sales/receipts/receipt-vouchers.events.ts`). None is in any file this pass touched, and
  `nest build` completed cleanly for the build that every live result above was produced
  against.
- **No browser pass.** Both fixes were verified through the API and the database. The
  frontend toast wiring is verified by typecheck and i18n parity, not by a click-through.
- **Outgoing (supplier / 1161 `supplier_advance`) cheques were not exercised live** — only
  incoming. They run through the identical `partyForChequeLine` body and are covered by the
  new unit test across `issued`/`bounced`/`cancelled`, but no live outgoing cheque was created.

Ledger identity after the last write (status-aware form): **`0.000000`**.
