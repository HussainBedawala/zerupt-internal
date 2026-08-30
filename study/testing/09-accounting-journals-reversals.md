# Phase F — Accounting: manual journal entries, amendments, reversals

Scope: `/:locale/accounting/journal-entries`, `/new`, `/:id`, `/amendments`.
Tenant: Gulf Auto Parts (Kuwait, KWD 3dp), legal entity `d67ece83-e21c-4ae4-ad46-c9356d7f0f06`.
Method: code read end-to-end + authenticated curl (accountant1) + SQL, with every number
hand-derived from the GL before believing a screen. Browser confirmation pass was BLOCKED
(see Verification gaps).

## Ledger identity gate

```sql
SELECT round(sum(debit-credit),6), count(*) FROM journal_entry_lines;
```
- **Before first write:** `0.000000 | 889`
- **After last write:** `0.000000 | 911`
- By status at close: `draft 0.000000/8 · posted 0.000000/899 · reversed 0.000000/4`
- OB-0001 / OB_AP-0001 / OB_AR-0001 / OB_INV-0001 all still `posted`, untouched.

> **Methodology note for the programme (not a product bug).** The gate as written in the
> briefing sums DRAFT lines too. An unbalanced draft is a *legal* state in this module, so
> the gate fires falsely on any tenant with one open. Mid-session it read `7.000000` purely
> because of my own deliberately-unbalanced ZZTEST draft. Recommend the gate become:
> ```sql
> SELECT round(sum(l.debit-l.credit),6) FROM journal_entry_lines l
>   JOIN journal_entries je ON je.id=l.journal_entry_id WHERE je.status <> 'draft';
> ```

---

# Findings (ranked)

## ACC-JE-001 — CRITICAL — CONFIRMED
### Every manual journal entry is invisible to branch-filtered financial statements, but its reversal is visible

**The two line-insert bodies disagree.** This is defect pattern #1 (one concept, two bodies,
only one carries the rule).

- `apps/api/src/journal-entries/journal-posting.service.ts:1058` and `:1147` (`postDirect` —
  the path every engine-posted JE **and every reversal** takes):
  ```ts
  branchId: line.branchId ?? input.branchId,   // falls back to the header branch
  ```
- `apps/api/src/journal-entries/journal-entry-draft.service.ts:159` and `:299`
  (`createDraft` / `updateDraft` — the path every **manual** JE takes):
  ```ts
  branchId: line.branchId,                     // NO fallback -> NULL
  ```

The manual-JE UI has no per-line branch field, so `line.branchId` is always undefined and
every manual JE line lands with `branch_id = NULL` while its header carries the branch.

**Readers then disagree three ways.** Six report services filter with bare equality, which
NULL can never satisfy:

| File | Line | Predicate |
|---|---|---|
| `reports/profit-and-loss.service.ts` | 269 | `eq(journalEntryLines.branchId, query.branchId)` |
| `reports/balance-sheet.service.ts` | 341 | `eq(...)` |
| `reports/general-ledger.service.ts` | 101, 501 | `eq(...)` |
| `reports/cash-flow-statement.service.ts` | 713, 873 | `eq(...)` |
| `reports/cost-center-pl.service.ts` | 140 | `eq(...)` |
| `reports/customer-statement.service.ts` | 253 | `eq(...)` |
| `reports/shared/posted-line-scope.ts` | 122 | `or(eq(...), isNull(...))` — **correct** |
| `reports/vat201.service.ts` | 407 | `coalesce(l.branch_id, je.branch_id)` — **correct** |

### Proof (this is a wrong number out of the real report, not a code reading)

Posted one manual JE `B1ALRAIMAINS-JRN-00088`, branch Al Rai, Rent 6210 debit 33.333 KWD.
The only other 6210 movement that day was `JRN-00086`, the *reversal* of an earlier manual
JE, credit 12.345 KWD.

Hand-derived truth from the GL:
```sql
SELECT je.entry_number, l.branch_id, l.debit, l.credit
FROM journal_entry_lines l JOIN journal_entries je ON je.id=l.journal_entry_id
WHERE l.account_id='a4d60f5d-26e1-4300-9a9b-63999bbab7b4'
  AND je.status='posted' AND l.posting_date='2026-08-30';
```
```
B1ALRAIMAINS-JRN-00086 | 43df4c2e-... (Al Rai) | 0.000000  | 12.345000   <- reversal, branch SET
B1ALRAIMAINS-JRN-00088 | (null)                | 33.333000 | 0.000000    <- manual JE, branch NULL
```
Al Rai's true rent for the day = 33.333 − 12.345 = **20.988 KWD expense**.

```bash
# unfiltered — correct
curl ".../tenant/reports/profit-and-loss?legalEntityId=$LE&periodStart=2026-08-30&periodEnd=2026-08-30"
#   6210 Rent: "33.333000",  operatingProfit "-33.333000"

# filtered to Al Rai — WRONG
curl ".../tenant/reports/profit-and-loss?...&branchId=43df4c2e-ec1b-4dc7-8f0d-d35a250c15e6"
#   6210 Rent: "-12.345000",  operatingProfit "12.345000"
```

The Al Rai P&L reports a **negative rent expense** and an **operating profit** on a day whose
only activity was an expense. The manual entry vanished; its reversal did not.

**Amend has the same hole, worse.** `journal-entry-amend.adapter.ts:359` recreates the
corrected entry through `draftService.createDraft` (NULL line branch) while the void leg goes
through `postDirect` (branch set). A branch-filtered P&L therefore shows **only the reversal**
of an amended entry and never the correction.

**Blast radius today:** only 2 entries in this tenant (both mine) —
```sql
SELECT je.source, count(DISTINCT je.id), count(*), round(sum(l.debit+l.credit),3)
FROM journal_entry_lines l JOIN journal_entries je ON je.id=l.journal_entry_id
WHERE je.status IN ('posted','reversed') AND l.branch_id IS NULL AND je.branch_id IS NOT NULL
GROUP BY 1;   -- manual | 2 | 4 | 91.356
```
No pre-existing corrupt data. But the defect is live and fires on the first manual JE a
bookkeeper posts to a branch. The 645 other NULL-line-branch rows sit on NULL-branch headers
(opening balances etc.) and are legitimately unbranched.

**Recommended fix — at the primitive, write side.** Make the draft service match `postDirect`:
`branchId: line.branchId ?? input.branchId` at `journal-entry-draft.service.ts:159` and `:299`.
That closes the write divergence AND makes a reversal a true line-level mirror. Patching the
six readers instead leaves the two bodies divergent and would need re-patching per new report.
Not fixed in this session: it needs a backfill decision for existing rows plus a rebuild of an
API shared with several concurrent sessions.

---

## ACC-JE-002 — HIGH — CONFIRMED
### `validateLines` does not check that debits equal credits; only a DB CHECK stops an unbalanced post, and the user gets a bare 500

`journal-entry-draft.service.ts:361` claims:
> `validateLines` enforces: ≥2 lines, debit XOR credit, non-negative, **Σdebit=Σcredit in both
> functional and TC currency**

It does not. `journal-posting.service.ts:1272-1291` only checks line count and per-line
invariants. The balance assertions live in `postDirect` at `:919` and `:975` — and **`postDraft`
never calls `postDirect`**; it UPDATEs the draft row to `posted` directly. So the manual-JE post
path has **no application-layer balance gate at all**.

```bash
# create a deliberately unbalanced draft: 10 debit vs 3 credit — ACCEPTED
curl -X POST "$API/tenant/journal-entries" -d '{... "lines":[
  {"accountId":"<6210>","debitTC":"10.000","currency":"KWD"},
  {"accountId":"<1111>","creditTC":"3.000","currency":"KWD"}]}'
# -> {"data":{"id":"6203133e-...","status":"draft"}}

curl -X POST "$API/tenant/journal-entries/6203133e-.../post" -d '{}'
# -> {"statusCode":500,"message":"Internal server error"}
```
API log:
```
DrizzleQueryError: update "journal_entries" set ... status = $3 ...
  cause: error: new row for relation "journal_entries"
         violates check constraint "je_posted_balanced_check"
```

**Money is safe** — the DB constraint is a real backstop and the entry stayed `draft`
(verified by SQL). That is why this is HIGH, not CRITICAL. But: the error is unmapped, the user
sees "Internal server error" instead of "Debits must equal credits", and the code comment
asserting the gate exists is exactly the kind of false documentation that lets a future
refactor remove the DB constraint believing the app covers it.

### ACC-JE-002b — MEDIUM — CONFIRMED (same shape, draft-create)
`manualLineSchema` (`journal-entries.dto.ts:187-188`) defaults `debitTC`/`creditTC` to `"0"`, so
a line with **neither** amount passes Zod, reaches the DB, and trips
`jel_amount_required_check` → another bare 500. Reproduced by sending `debit`/`credit` (the
event-schema field names) instead of `debitTC`/`creditTC`: Zod silently strips the unknown keys
and the amounts become zero.

```
cause: error: new row for relation "journal_entry_lines"
       violates check constraint "jel_amount_required_check"
detail: Failing row contains (..., 0.000000, 0.000000, KWD, 1.0000000000, ...)
```
Transaction rolled back cleanly — **no orphan header** (verified: `SELECT je.id, count(l.id) ...
GROUP BY` returned zero rows). Add a "each line needs a debit or a credit" refine to
`manualLineSchema` and a balance refine to `createManualJournalEntrySchema`.

---

## ACC-JE-003 — HIGH — CONFIRMED
### No maker-checker anywhere on the manual-journal path

A single accountant can author, post, amend and reverse any journal entry unilaterally.
Same control shape as the Purchase "accountant posts a payment with no approver" finding.

Proven empirically, as `accountant1`, with no second party involved at any step:
```bash
POST /tenant/journal-entries          -> {"id":"cd73749e-...","status":"draft"}
POST /tenant/journal-entries/cd73749e-.../post -> {"entryNumber":"B1ALRAIMAINS-JRN-00085","status":"posted"}
```
`postJournalEntrySchema` (`journal-entries.dto.ts:240`) accepts only `softLockOverrideReason`.
There is no `approvedBy`, no PIN, no approval permission on the post route.

The control **exists in the codebase** and is deliberately switched off for this module —
`journal-entry-amend.adapter.ts:424`:
```ts
async isApprovalRequired(): Promise<boolean> {
  // ponytail: no per-tenant maker-checker flag for manual JE amendment
  // exists today (unlike sales' requireInvoiceApproval) — always false.
  return false;
}
```
So even the amend saga's Gate 5 (`amend-saga-runner.service.ts:253`) never fires for journals,
while sales invoices *do* get a second approver. The highest-risk manual money lever in the
product is the one with the weakest control.

---

## ACC-JE-004 — MEDIUM — CONFIRMED
### Posting and reversing a journal are both audited as `action='create'`, and reversal writes no audit row against the entry it reversed

```sql
SELECT action, entity_type, entity_id, user_id, created_at FROM audit_log
WHERE entity_id IN ('cd73749e-...','f16c1ffb-...','84ef32bd-...','6203133e-...')
ORDER BY created_at;
```
```
create | JournalEntry | 6203133e-... | draft created
create | JournalEntry | cd73749e-... | draft created
create | JournalEntry | cd73749e-... | <- this is the POST
create | JournalEntry | f16c1ffb-... | <- this is the REVERSAL (logged against the NEW entry)
delete | JournalEntry | 6203133e-... |
create | JournalEntry | 84ef32bd-... | draft created
create | JournalEntry | 84ef32bd-... | <- POST
```

Two problems:
1. **Wrong verb.** `audit-log.interceptor.ts:57` maps `POST -> Create`, and the journal
   controller decorates `/:id/post` and `/:id/reverse` with the bare `@Audited("JournalEntry")`.
   The interceptor already supports an explicit override (`:175 const action = meta.action ??
   methodAction`, used by POS shift-close), so this is an omission, not a limitation.
   Posting should audit as Update (or a `post` action); reversing as Update.
2. **The reversed entry has no audit row for being reversed.** `JRN-00085` went
   `posted -> reversed` with `reversed_by_entry_id` set, and its audit trail shows only two
   `create` rows. An auditor pulling the history of the entry that was voided cannot see the
   voiding from that entity's trail — only from the new entry's.

Also every row here is `create`, so `before`/`after` are never captured for the state
transition (`audit-log.interceptor.ts:211` returns early for Create).

Interacts with the already-open **AUDIT-004** (`audit_log` has no `branch_id`/`legal_entity_id`).

---

## ACC-JE-005 — MEDIUM — CONFIRMED
### Reverse/amend refusal reasons ship English-only prose with `code: null`, so Arabic users see English

The controller's own contract (`journal-entries.controller.ts`, getById comment) says the code
is the translatable contract and the English `reason` is "only the fallback when a gate has no
code". Several gates have no code:

```bash
curl ".../tenant/journal-entries/f16c1ffb-0a27-48c7-abf6-740baa035435"
```
```json
{ "canReverse": false,
  "reverseBlockReason": "Cannot reverse a reversal entry. Create a new forward entry instead.",
  "reverseBlockCode": null,
  "canAmend": false,
  "amendBlockReason": "This entry is itself a reversal and cannot be amended; create a new forward entry instead.",
  "amendBlockCode": null }
```
Only `PERIOD_BACKDATED_PAST_LOCK`, `PERIOD_FUTURE`, `PERIOD_HARD_LOCKED`
(`journal-reverse-eligibility.ts:188,196,206`) and `OPENING_BALANCE_WRITE_ONCE`
(`journal-entry-amend.adapter.ts:146`) carry codes. The other four amend blocks
(`:157`, `:161`, `:170`) and every reverse state block do not. An `ar` user hovering a disabled
Reverse or Amend button gets an English sentence.

---

## ACC-JE-006 — FRICTION — CONFIRMED
### The draft stage has not earned its place on the manual-JE screen

The founder's default is no draft. Here there is a full draft lifecycle (create / update /
delete / post), plus autosave, plus a separate `Post` confirmation dialog. The `New journal
entry` flow is: fill header + ≥2 lines -> **Post** -> confirm dialog -> posted. That is one
extra dialog on top of a form that already has a balance indicator refusing to enable Post
until the entry balances (`manual-journal-entry-form.tsx:271 prepare(true)`).

Mitigating, and why this is FRICTION not HIGH:
- **The Post button genuinely posts.** `handlePost` persists the draft then opens
  `PostEntryDialog`, whose confirm calls `POST /:id/post` and returns `status:"posted"`
  (verified by curl and by SQL: `entry_number` assigned, `status='posted'`). It is not a
  Post-that-silently-drafts. **Not** a HIGH finding.
- The confirm dialog is defensible: posting a JE is irreversible except by reversal, and the
  dialog is the surface that recovers the three recoverable rejections (soft-lock reason,
  missing FX rate, already-posted). It is one dialog, not stacked.
- Defaults are good: posting date defaults to today, currency is seeded from the entity's
  functional currency (`manual-journal-entry-form.tsx:137-142`), branch comes from context.

**Could an untrained Kuwaiti bookkeeper post a journal first try in under 60 seconds?**
Yes, marginally. Count from `/accounting/journal-entries`: New entry (1 click) -> description
(typing) -> line 1 account picker (2 clicks) -> debit (typing) -> line 2 account picker
(2 clicks) -> credit (typing) -> Post (1) -> Confirm (1) = **7 clicks + 4 typed fields, 0
forced fields beyond account+amount**. Nothing blocks them. The friction is that a
double-entry-literate user is asked to confirm something the balance indicator already
proved, and the word "draft" appears in a flow they never asked to be a draft.

Recommend keeping the confirm (irreversible) and dropping the visible draft vocabulary, or
justifying the draft explicitly (it does buy autosave against data loss on a long entry,
which is a real MENA-retail-grade benefit — say so in the UI rather than exposing "draft").

---

# Verified and NOT a finding (withdrawn after investigation)

These were on the hunt list and were disproven. Acting on any of them would have broken
working behaviour.

1. **"A document commits before its GL posts" (the Purchase defect class) — DOES NOT EXIST
   here.** A manual JE *is* the GL; header and lines are written in one `db.transaction`
   (`journal-entry-draft.service.ts:126-179`). I forced a late failure two different ways
   (all-zero leg tripping `jel_amount_required_check`, unbalanced totals tripping
   `je_posted_balanced_check`) and in both cases the transaction rolled back with **no
   half-written artefact** — verified by
   `SELECT je.id, count(l.id) FROM journal_entries je LEFT JOIN journal_entry_lines l ... WHERE
   je.description LIKE 'ZZTEST%' GROUP BY` returning zero rows. Doc-number reservation is
   committed inside the same tx and released on failure.
2. **The reversal is a true value mirror.** Same accounts, same legal entity, same currency,
   same rate, TC amounts swapped, party context and tax base carried through:
   ```sql
   SELECT l.account_id, round(sum(l.debit-l.credit),6), round(sum(l.debit_tc-l.credit_tc),6)
   FROM journal_entry_lines l
   WHERE l.journal_entry_id IN ('cd73749e-...','f16c1ffb-...') GROUP BY 1;
   -- both accounts: 0.000000 | 0.000000
   ```
   The *only* asymmetry is line-level `branch_id`, which is ACC-JE-001.
3. **Reversal date cannot be attacked.** `reverseJournalEntrySchema` accepts only `reason` and
   `softLockOverrideReason` — **no client posting date**. The reversal always posts today and
   is period-gated against today. The amend saga's internal `postingDate` option is not
   reachable from REST and always passes the ORIGINAL entry's date so both legs net inside one
   period (`journal-entry-amend.adapter.ts:328,401`). No backdating or future-dating vector.
4. **Double reversal and re-reversal are both blocked**, under a row lock:
   ```
   POST /:id/reverse on a reversal      -> 409 "Cannot reverse a reversal entry."
   POST /:id/reverse on a reversed entry-> 409 code ALREADY_REVERSED
   ```
5. **The soft-lock override IS genuinely permission-gated** (the Layer 4 claim in the hardening
   log is true — I verified rather than trusting it). `fiscal-period.service.ts:2396`
   `assertSoftLockOverrideAllowed` enforces (a) the fiscal policy flag `allowSoftLockOverride`
   and (b) membership of `softLockOverrideRoles` or the Owner system role. A free-text reason
   alone is not enough. Called on both the post path (`journal-entry-draft.service.ts:419`) and
   the reverse path.
6. **Client-supplied FX is not trusted.** `manual-fx.ts` re-derives every functional amount as
   `debitTC × rate-looked-up-at-posting-date`; a client `debit`/`credit`/`exchangeRate` on a
   manual line is stripped by the schema and overwritten. Missing rate fails loud with
   `FX_RATE_MISSING`, never defaults to 1.
7. **Manual JEs cannot touch control accounts** — blocked at draft create/update
   (`validateAccounts`) and re-blocked under the post transaction via the shared
   `blockControlAccounts` gate, so a stale draft cannot slip through.
8. **Pagination is clean — no keyset/microsecond trap.** The list uses OFFSET with an `id`
   tiebreaker (`journal-entries.service.ts:310-316`), not a timestamp cursor, so RPT-037 does
   not apply. Walked pages 1-4 at `limit=5` on real data: 20 distinct entry numbers, strictly
   descending, **no skip and no repeat across any boundary**.
9. **No type-coercion trap.** The only `z.coerce` in the query DTO is `page`/`limit`
   (`.coerce.number().int()`), which is correct. There is no `z.coerce.boolean()` anywhere in
   the journal DTOs.
10. **Kuwait tax UI is correctly hidden.** `journal-entry-lines-table.tsx:93`
    `const showTax = countryHasConsumptionTax(useTenantCountry())` — derived from country, not
    hardcoded. No VAT/GST field renders for this tenant.
11. **KWD 3dp is correct by construction.** All money rendering goes through the canonical
    shared primitives (`formatMoneyWithSymbol` / `formatMoneyAmount` / `MoneyInput`), which take
    the currency. Nothing hand-rolls a `toFixed(2)`. The CSV export emits `1.500`.
12. **i18n clean.** `pnpm --filter @zerupt/web i18n:check` -> "All locales are in sync".
    Zero em dashes in `messages/{en,ar}/journalEntries.json` and `messages/{en,ar}/amend.json`.
13. **Export works and respects filters.** `GET /tenant/journal-entries/export?status=draft`
    returned a BOM'd CSV containing only drafts, with `legalEntityName` / `branchName` /
    `fiscalPeriod` resolved to names (no raw UUIDs) and amounts at KWD 3dp.
14. **Authorization on the org coordinates is real.** `createDraft` calls `assertBranchAccess`
    + `assertLegalEntityAccess` on the client-supplied `branchId`/`legalEntityId`;
    `updateDraft` re-authorizes BOTH the old and the destination branch on a move.
    `list` authorizes `legalEntityId` so a user cannot name another entity and read its register.

---

# Verification gaps (honest)

- **No browser pass.** The shared gstack browse daemon was killed by concurrent sessions on
  five consecutive attempts (`about:blank` after each successful `goto`). I did authenticate as
  `accountant1` and reach `/en/dashboard` once, then lost the session. Consequently the
  following are **asserted from code only, not observed**: RTL/logical-property correctness on
  the three journal screens, responsive behaviour at 375/768/1280/1920, the loading/empty/error
  states of the list, the actual rendered click count, and whether the amendments recovery
  console renders anything for this tenant. ACC-JE-006's click count is derived from
  `manual-journal-entry-form.tsx`, not counted on screen.
- **Concurrency was not tested.** The `FOR UPDATE` + optimistic `WHERE status=` guards on both
  post and reverse are read and look correct, but I did not fire two simultaneous posts or
  reversals at one entry.
- **I did not exercise the amend saga end-to-end** (`POST /:id/amend`). ACC-JE-001's amend
  consequence and ACC-JE-003's `isApprovalRequired -> false` are read from source, not run.
  Both are simple enough to be high-confidence, but they are marked CONFIRMED on a code read,
  not on an observed API response.
- **Period-close bypass was only partially probed.** I verified the hard-lock and soft-lock
  gates exist and that the override is role-gated, but this tenant has every period from
  Jul-Dec 2026 `open`, so I never observed a real `PERIOD_HARD_LOCKED` or
  `PERIOD_SOFT_LOCKED_NEEDS_REASON` rejection fire. Another session was concurrently creating
  "ZZTEST period gate" drafts across Jun/Jul 2026, so I deliberately did not lock a period.
- **ACC-JE-001 blast radius is tenant-local.** I confirmed only 2 affected entries in Gulf Auto
  Parts (both mine). Other tenants with existing manual JEs would need the same query run
  against their DBs before the fix ships, to decide whether a backfill is needed.
- **AUDIT-002** (`POST /tenant/accounts/bulk` has no audit path) was in scope for the phase but
  belongs to the chart-of-accounts screen, not the journal screens, and I did not touch it.

---

# Ledger safety statement

Every write in this session was ZZTEST-prefixed and is logged in `_documents-created.md`.
`JRN-00088` (33.333 KWD) is **deliberately left posted** as standing evidence for ACC-JE-001 —
delete or reverse it once that finding is closed. No pre-existing document was voided, edited
or reversed. The four opening-balance journals were not touched. Final gate: **`0.000000`**.
