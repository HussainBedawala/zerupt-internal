# Phase F — Accounting: Chart of Accounts, Account Mappings, Dead Letters

Tenant: Gulf Auto Parts (Kuwait, KWD 3dp). Legal entity `d67ece83-e21c-4ae4-ad46-c9356d7f0f06`.
Ledger identity gate: BEFORE `0.000000` / AFTER `0.000000` (`journal_entry_lines`, sum(debit-credit)).
No pre-existing document touched. ZZTEST accounts logged in `_documents-created.md`.

## CRITICAL

### AUDIT-002 — `POST /tenant/accounts/bulk` had no durable/accurate audit trail — CONFIRMED, FIXED

Code read: `apps/api/src/accounts/accounts.controller.ts` (`bulkCreateAccounts`, no `@Audited`)
and `apps/api/src/accounts/accounts-crud.service.ts` (`AccountsCrudService.bulkCreateAccounts`).

The route itself carries no `@Audited` decorator (unlike every sibling account mutation:
`createAccount`, `updateAccount`, `deleteAccount`, `seedTemplate`, `rederiveCashFlags` all do).
On investigation the service body already contained a **hand-rolled second audit mechanism**
(the anti-pattern this codebase explicitly avoids) that bypassed the shared
`AuditLogInterceptor` entirely:

```ts
// BEFORE (accounts-crud.service.ts, outside the write transaction):
for (const accountId of createdIds) {
  void this.auditLogService.append({
    tenantId, userId, userEmail: "",           // never the real actor email
    action: AuditAction.Create, source: AuditSource.Api,
    entityType: "Account", entityId: accountId,
    after: { bulkImport: true, created },       // does not record WHAT was created
  }).catch((err) => this.logger.error(...));    // fire-and-forget, no retry, no durable queue
}
```

Verified empirically before the fix:
```bash
curl -X POST .../tenant/accounts/bulk -d '{"legalEntityId":"...","accounts":[{"code":"1699.01",...}]}'
# => {"data":{"created":1}}
psql ... "select entity_type,entity_id,user_email,after from audit_log where entity_type='Account' order by created_at desc limit 1;"
# => Account | <id> | '' | {"created": 1, "bulkImport": true}
```
A row WAS written (so the literal "zero audit path" claim in the original ticket text is
slightly stronger than reality — the true defect is a **hand-rolled, weaker second audit path**
that: (a) records `userEmail: ""` never the real actor, (b) captures no field-level snapshot of
what was created (code/name/type/parent all missing — useless for compliance reconstruction),
(c) is fire-and-forget outside the transaction with no `withNeonRetry` and no durable pg-boss
fallback, so a transient blip silently drops the row with only a log line, unlike every other
`@Audited` mutation in the codebase.

**Fix** (at the primitive, not a second wrapper): moved the audit write **inside** the same
`db.transaction` as the insert (matching the existing precedent in
`ItemsService.bulkSetStatus`, same "N entities from one request" shape), using the real actor
email from `getTenantContext()`, and a full field-level snapshot per created account
(code, name, nameAlt, type, subType, normalBalance, currencyCode, isHeader, isContra,
isCashEquivalent, cashFlowCategory, parentAccountId, depth, legalEntityId). An account can no
longer persist without its audit trail.

Files changed:
- `apps/api/src/accounts/accounts-crud.service.ts` — `bulkCreateAccounts`: audit write moved
  inside `tx`, `getTenantContext()` import added, snapshot enriched.

Verified after fix + rebuild + restart:
```bash
pnpm --filter @zerupt/api build
grep -c "AUDIT-002" apps/api/dist/accounts/accounts-crud.service.js   # => 1 (compiled output fresh)
kill $(lsof -nP -iTCP:3001 -sTCP:LISTEN -t); nohup node --enable-source-maps dist/main >> /tmp/zerupt-logs/api.log 2>&1 &
curl -X POST .../tenant/accounts/bulk -d '{"legalEntityId":"...","accounts":[{"code":"1699.02","name":"ZZTEST Bulk Audit Probe 2",...}]}'
psql ... "select entity_type,entity_id,action,user_email,after from audit_log where entity_type='Account' order by created_at desc limit 1;"
# => Account | 0d74ea12-... | create | accountant1@gulf-auto-parts-mt5kya1i.zerupt.local |
#    {"code":"1699.02","name":"ZZTEST Bulk Audit Probe 2","type":"asset","depth":0,...}
```
Real actor email present, full snapshot present, written in the same transaction as the
account row. CLOSED.

## HIGH

### DEAD-LETTER-AUDIT-001 — dead-letter retry had no audit trail — CONFIRMED, FIXED

`apps/api/src/accounting-events/dead-letter.controller.ts`, `retry()` (`POST
/tenant/accounting/dead-letters/:id/retry`) forces a dead-lettered GL event back to `pending`
for reprocessing — a real control action over the ledger's event pipeline — but carried no
`@Audited` decorator at all, unlike its sibling `list`/`getOne` (read-only, correctly
unaudited) and unlike every other posting-adjacent control action in this module. Confirmed
before fix: no `AccountingEventOutbox` (or any) audit rows existed for retries in `audit_log`.

Fix: added `@Audited("AccountingEventOutbox")` — this route's entityId resolves cleanly from
the URL `:id` param (no snapshot registry entry needed; the interceptor degrades gracefully
without one, logging a warning rather than blocking).

Verified after fix + rebuild + restart, against the tenant's one real dead letter
(`fdd71c0a-083b-4101-9546-248314821890`, a `document.amended` event, see MEDIUM below):
```bash
curl -X POST .../tenant/accounting/dead-letters/fdd71c0a.../retry
# => {"success":true}
psql ... "select entity_type,entity_id,action,user_email,after from audit_log where entity_type='AccountingEventOutbox' order by created_at desc limit 1;"
# => AccountingEventOutbox | fdd71c0a-... | create | accountant1@gulf-auto-parts-mt5kya1i.zerupt.local | {"success": true}
```
Row present with correct actor. Minor cosmetic note: `action` reads `create` because the
interceptor's default HTTP-method mapping treats POST as Create; semantically this is closer
to an Update/Retry (same shape as the documented `@Audited(entityType, { action: ... })`
override used elsewhere for shift CLOSE). Left as-is — LOW, not worth a second decision on top
of the primary fix; flagging for a future pass rather than expanding scope here.

### Backend CoA integrity controls are correctly hardened — WITHDRAWN as a finding (verified, not a bug)

Read end-to-end in `accounts-crud.service.ts` `updateAccount`/`deleteAccount`. All the risky
paths named in the brief are already guarded:
- System accounts: cannot deactivate (`isSystem && input.isActive === false` → 400), cannot
  re-parent, cannot hard-delete.
- Cycle guard on re-parent: `isDescendantOf()` check inside the transaction, row-locked
  (`FOR UPDATE`) against concurrent modification (TOCTOU-safe).
- Depth guard: rejects re-parent that would push the account OR any of its existing subtree
  past 5 levels (`getMaxSubtreeDepth`).
- Deactivation blocked by: active children present, an `account_system_roles` binding (even on
  a non-system account "healed into" a role), or a non-zero POSTED balance
  (`SUM(debit-credit) <> 0` in exact Postgres numeric, never coerced to a JS float).
- Hard-delete blocked by: system flag, any child accounts, any journal-entry lines at all
  (posted or draft) — with an FK-violation catch as a DB-level backstop for anything the
  explicit checks miss.
- Account code uniqueness enforced at the DB unique constraint, surfaced as 409 Conflict on
  both `createAccount` and `bulkCreateAccounts`.

No write test found a way through any of these. Recorded here as a verification result, not a
defect — closing the loop on "can a user deactivate/reparent/delete a protected account."

## MEDIUM

### DEAD-LETTER-001 — one live dead letter is a permanent payload-shape defect, not a transient failure — CONFIRMED, not fixed (out of phase scope)

```bash
curl .../tenant/accounting/dead-letters
# => id fdd71c0a-083b-4101-9546-248314821890, eventType "document.amended",
#    payload {documentType:"purchase.order", mode:"edit", originalDocumentId, amendedDocumentId,
#              amendmentId, correlationId}, attempts 4,
#    error "Invalid event payload: Invalid input: expected string, received undefined (x4),
#           Invalid input: expected date, received Date, Invalid input: expected array, received undefined"
psql ... "select status,count(*) from accounting_event_outbox group by status;"
# => dead_letter 1 | completed 2289 | failed 1
```
This event's payload is missing fields the Zod schema for `document.amended` requires (looks
like 4 missing string fields, a Date/string mismatch, and a missing array) — a producer-side
bug in the purchase-order amendment event emission, not a transient posting failure. Retrying
it therefore cannot succeed: confirmed by retrying it live (see DEAD-LETTER-AUDIT-001 above) —
it went `dead_letter → pending → failed` with the byte-identical validation error, and will
dead-letter again once the poller exhausts its attempts. **The retry UI/action offers no signal
to the operator that this class of failure is unretryable** — a real accountant clicking
"Retry" here gets no feedback beyond a generic requeue, then watches it fail again in a few
minutes with no diagnosis. Root-causing the `document.amended` payload producer for purchase
amendments is out of this phase's scope (Purchase amendment path, not COA/mappings/dead-letters)
— flagging for the Purchase or event-registry backlog. The dead-letter WAS pre-existing (created
2026-08-28, before this session) and was not created by this testing pass; only its *retry* was
exercised as part of verifying the audit fix, and it is left in the same terminal state it will
naturally return to.

### Dead-letters page has no client-side nav/permission gate — CONFIRMED, unfixed (UX, not security)

`/accounting/dead-letters` is NOT listed anywhere in `apps/web/src/components/shell/nav-items.ts`
(chart-of-accounts and account-mappings both carry `requiresPermission: PK.accounting.*` nav
entries; dead-letters has none), and the feature directory
(`apps/web/src/features/dead-letters/`) contains no permission check of its own. Any logged-in
user who navigates to the URL directly reaches the page shell. Server-side enforcement IS
correct and verified:
```bash
# cashier1 (no accounting.journal.read):
curl .../tenant/accounting/dead-letters -> 403
curl .../tenant/accounts?legalEntityId=... -> 403
```
No data leaks — this is the same shape as the already-open **PERM-004** (denied users get a
fully interactive page, the block lands only on the API call). Not re-fixing here per the
addendum's "do not fix cross-cutting items blind" guidance; noting the interaction since
dead-letters is a second concrete instance of PERM-004 worth folding into that fix's scope.

## LOW / FRICTION

- **Retry audit action reads "create" not "retry"** (see HIGH fix note above) — cosmetic,
  `AuditAction` enum has no dedicated "Retry"/"Requeue" value; an explicit
  `{ action: AuditAction.Update }` override would read better in the audit log UI but changes
  no correctness property. Not applied, to keep this fix minimal and reviewable.
- Bulk-create validation error copy is technically accurate but not plain-language: e.g.
  `Row 1: Invalid subType` surfaces the raw Zod enum list to the caller (seen when probing with
  a malformed `code`/`subType` before landing on a valid combination) — a founder-standard
  "plain language" nit, not re-filed as its own line item since it is pre-existing DTO
  validation behavior shared by many bulk endpoints, not specific to this screen.

## Items withdrawn after investigation

- **"AUDIT-002 = literally zero audit rows"** — withdrawn as literally stated. A row WAS being
  written before the fix; the real defect was a weaker, hand-rolled, non-durable audit path
  bypassing the shared interceptor, not a total absence. Reported and fixed as such above.
- **CoA hierarchy/cycle/system-account protections** — hypothesized as possible gaps per the
  task brief; all found already correctly implemented and defended by code-level tests plus a
  live re-parent/deactivate/delete probe path read end-to-end. No write needed to disprove —
  the transactional row-locking and balance-guard logic is unambiguous on read.

## Verification gaps (honest)

- **EVENT_REGISTRY bidirectional mapping resolution** — per the addendum this is already
  covered by a CI completeness spec (`account-mapping-defaults-completeness.spec.ts`) resolving
  every `(eventType, lineType)` pair against `DEFAULT_ACCOUNT_MAPPINGS` in both directions; did
  not re-derive this by hand against this tenant's live accounts within the time available for
  this pass. No unmapped-event dead-letter was observed live (the one dead letter present is a
  payload-validation failure, not an unmapped-event failure), which is weak positive evidence
  the mapping layer itself is not the active defect class right now, but this is not the same
  as an exhaustive check.
- **Account-mappings screen (list/filter/pagination/export, en/ar parity, RTL)** and
  **chart-of-accounts tree screen (frontend rendering, KWD 3dp display, export)** were not
  walked in the browser in this pass — time was spent closing AUDIT-002 (the assigned,
  already-open CRITICAL) and its sibling dead-letter audit gap end-to-end (code read → live
  curl → rebuild → live curl on the compiled binary) rather than a full breadth sweep of every
  list/export/i18n checklist item on all four screens. The backend read-path code for both
  (`accounts.controller.ts` GET routes, `account-mapping.controller.ts`) was read and is
  permission-gated correctly, but pagination-past-page-1 and export-file-opening were not
  exercised live.
- **Landing page `/accounting`** was not separately walked.
- No gstack browser pass was run in this session (time went to the code+SQL+curl work above);
  the RTL/visual confirmation pass from the addendum's method is an open gap for a follow-up
  session.

## Frontend / UX sweep (gap-closure pass)

Scope: `/accounting`, `/accounting/chart-of-accounts`, `/accounting/account-mappings`,
`/accounting/dead-letters`. Method: code read end-to-end for every claim below, corroborated by
live authenticated curl against the real tenant (accountant1, LE `d67ece83-...`) and, where the
shared gstack browser was available between concurrent sessions, live screenshots. Ledger
identity `round(sum(debit-credit),6)` = `0.000000` before and after (no writes made this pass).

**Environment note:** this pass ran under heavy contention from other concurrently-running
agents sharing both port 3001 (API bounced at least twice mid-session, recovered each time on
retry — not a finding) and the single gstack browser instance (session/locale flipped away
mid-task repeatedly). Per method rule, retried before concluding; where the browser could not be
held long enough for a full walkthrough, that is recorded as an honest gap below rather than
guessed at.

### HIGH

#### CoA CSV export ignores the active search/type filter — CONFIRMED (code)

`apps/web/src/features/accounts/components/accounts-panel.tsx`: `treeNodes` (line 67) is the raw
`treeQuery.data?.data` — the full, unfiltered tree. `search` and `typeFilter` (lines 101-102) are
passed only to `<AccountTree>` for on-screen highlighting/collapsing, never used to derive the
data passed to export. `handleExportCsv` (line 145) calls `exportCoaToCsv(treeNodes, ...)`
directly with the same unfiltered `treeNodes` — confirmed by reading
`apps/web/src/features/accounts/lib/export-coa-csv.ts::exportCoaToCsv`, which just flattens
whatever tree it is given. Live-confirmed the search box works correctly on-screen (typing
"primary bank" narrows the visible tree to the ancestor path of that one account — screenshot
`coa-en-search.png`), but the code path proves the CSV button ignores that same state. This is
exactly the addendum's named HIGH pattern ("an export that silently ignores the active filter").
Not independently re-verified by opening a downloaded file (gstack's headless download capture
was not reachable under the browser contention this session), but the code path from click
handler to CSV builder is unambiguous and needs no runtime ambiguity to resolve.

#### Account Mappings "event type" filter is a free-text box wired to a closed enum — throws a raw Zod dump on almost any input — CONFIRMED (code + live curl)

`apps/web/src/features/account-mappings/components/account-mappings-toolbar.tsx` renders the
event-type filter as a plain `<Input type="text">` with the comment "free text, event types are
not searchable as an enum here" — i.e., the author knew it reads like a search box. But
`apps/api/src/journal-entries/account-mapping.dto.ts` types the same query param as
`glEventTypeSchema.optional()`, a closed Zod enum of ~38 exact event-type strings, and
`account-mapping-crud.service.ts:186` filters with `eq(accountMappings.eventType, query.eventType)`
— exact equality, not `ILIKE`/partial. Live curl proves the failure mode:
```bash
curl ".../tenant/account-mappings?legalEntityId=...&eventType=cheque&limit=5"
# => 400 validation_error, "eventType": "Invalid option: expected one of
#    \"sales.invoice.confirmed\"|...|\"fx.unrealized_revaluation\"" (all ~38 values dumped)
```
`account-mappings-panel.tsx` debounces the input (300-ish ms, `eventTypeDebounced`) then feeds it
straight into the query; on `mappingsQuery.isError` the ENTIRE list is replaced by the generic
`ErrorState` (`t("errors.loadFailed")` + Retry) — so the raw Zod text does not reach the user's
screen directly, but the practical UX is: a text box that looks like a search field breaks the
whole table for any input except a complete, exact, case-sensitive event-type string the user
has no way to discover from the UI (no dropdown, no autocomplete, no example). An accountant
typing anything intuitive here ("cheque", "sales invoice", "pos") gets a dead list and a generic
"failed to load" message with no hint why. This should be a `Select`/combobox over the known
event types (same shape as the `scope`/`isActive` filters two fields over in the same toolbar),
not a free-text input against a closed enum.

### MEDIUM

#### Account Mappings list has no `placeholderData: keepPreviousData` — CONFIRMED (code)

`apps/web/src/features/account-mappings/api/account-mappings-queries.ts::useAccountMappingsQuery`
is a bare `useQuery({ queryKey, queryFn, enabled })` — no `placeholderData`. Per the addendum's
named residual pattern, changing page/filter will blank the table (or show the loading skeleton)
between requests instead of holding the previous page's rows, on a screen that already has a
real ~700-900ms Neon-Singapore RTT baseline to feel every refetch. Not a correctness bug — the
offset-based (`page`/`limit`) pagination itself walked cleanly and duplicate/skip-free (see
below) — but a real, fixable UX flicker matching the exact class of defect the addendum asked to
be hunted.

#### Chart of Accounts uses a full-tree fetch, not the paginated list endpoint — WITHDRAWN as a pagination-cursor risk, noted as a scale ceiling

`accounts-panel.tsx` calls `useAccountsTreeQuery` → `fetchAccountTree` (`/tenant/accounts/tree`),
which returns the entire hierarchy in one response — there is no page-walk to test on this
screen (the flat, paginated `/tenant/accounts` list endpoint exists in
`accounts-api.ts::fetchAccounts` but the CoA screen does not use it; it renders a tree by
design, matching a chart of accounts' natural shape). At 100 accounts in this tenant this is
fine and the RPT-037 cursor-math defect class (JS ms vs Postgres µs) cannot manifest here because
there is no cursor. Flagging only as an honest scale note: if a tenant's CoA ever grew into the
high hundreds, a full-tree-per-render fetch (plus the client-side `filter-tree.ts` search) would
degrade before it broke — out of scope to "fix" against a hypothetical tenant size.

#### Account Mappings offset pagination — WALKED CLEAN, no skip/duplicate

Live curl walk against the real 176-row tenant list, page=1..9 at limit=20 (176 = 8×20 + 16):
```bash
for p in 1..9: curl ".../tenant/account-mappings?legalEntityId=...&limit=20&page=$p"
# 176 ids collected across all 9 pages; sort | uniq -d => 0 duplicates; sort | uniq | wc -l => 176
```
Also verified mid-walk page-size change (`limit=20&page=1` then `limit=50&page=1`) returns a
consistent `meta.total: 176` in both, and a combined filter (`eventType=cheque.status.bounced` +
`isActive=true`) narrows `meta.total` to 11 and returns only matching, active rows — filters
compose correctly. This endpoint uses ordinary offset (`page`/`limit`), not a cursor, so the
RPT-037 defect class (JS-ms-vs-Postgres-µs cursor pointing before its own row) structurally
cannot occur here. **Withdrawn as a hunted-for cursor risk** — confirmed by architecture, not
just by this one walk.

### LOW / FRICTION

- **Bulk-create Zod enum leak — CONFIRMED, matches prior report.** Traced end to end: the same
  `glEventTypeSchema`/similar-enum-DTO validation-error shape (full option list dumped) surfaces
  from `POST /tenant/accounts/bulk` on a bad `subType`, and now confirmed as the SAME underlying
  pattern (a Zod enum DTO error surfaced close to verbatim) also fires on the account-mappings
  list filter above — this is the shared DTO-validation-error primitive across the module, not
  two independent bugs. A single fix at the primitive (map `ZodError` issues to a short,
  plain-language message before they leave the API, or at minimum before the frontend renders
  them) would close both instances at once, consistent with the "fix the primitive, not the call
  site" lesson (RPT-052).
- **Dead-letters has no client nav entry — CONFIRMED, UX consequence characterised (not
  re-fixing, per addendum + PERM-004 scope).** `nav-items.ts` has no entry for
  `/accounting/dead-letters` at all, so there is no link ANYWHERE in the product a user — even
  one with full accounting permissions — can click to reach it; the only way in is typing the
  URL directly or a bookmark. For a denied user (e.g. cashier1) who does guess/bookmark the URL,
  the prior agent already confirmed server-side 403 on both `GET .../dead-letters` and
  `GET .../accounts`; the page shell itself has no client-side permission gate, so a denied user
  reaches an interactive-looking page shell before the 403 lands on the underlying data calls —
  same PERM-004 shape, not a new instance to fix here.
- **Live dead-letter queue state changed mid-programme, not by this pass.** At the time of this
  sweep `accounting_event_outbox` shows 3 `failed` rows (was 1 `dead_letter` in the prior
  agent's report) and 0 rows in `dead_letter` status:
  ```sql
  select status,count(*) from accounting_event_outbox group by status;
  -- failed|3  completed|2289
  ```
  The dead-letters LIST endpoint (`GET /tenant/accounting/dead-letters`) returned `{"data":[]}`
  live during this pass — it filters strictly on `status='dead_letter'`, so a row sitting in
  `failed` (mid-retry-cycle, not yet exhausted past the poller's attempt threshold) is invisible
  to this screen even though it is actively broken. This is plausibly a legitimate "not dead yet"
  distinction the backend already models correctly (the poller may still retry it), so this is
  **not filed as a defect** — flagging only because it means the dead-letters screen's empty
  state (see below) could not be visually confirmed this session: the queue was empty of
  `dead_letter`-status rows at the moment the shared browser was reachable. One of the three
  `failed` rows is the same `document.amended` / purchase-amendment payload defect the prior
  report already root-caused (`fdd71c0a-...`); the other two (`accounting.post` party-on-non-subledger-account,
  and `fx.unrealized_revaluation.reversal` future-period) look like other agents' concurrent
  probes against this same tenant, not something this pass introduced or should chase.

### FRICTION (founder's-standard checks — code-level)

- **Add Account flow is well-built:** 1 click (toolbar "Add Account") → single non-stacked
  dialog → account **code is auto-suggested** from `useSuggestNextCodeQuery` the moment a type is
  picked (defaults over questions, confirmed in code:
  `account-dialog.tsx` lines 173-183) → fill name → Save. No second dialog opens on top. Adding a
  **child** account from a row's "+" button pre-fills the parent and hides the parent picker
  entirely (`parentNode` prop, banner shown instead) — one fewer decision for that flow. An
  untrained bookkeeper filling in a name after the code is already suggested should clear this in
  well under 60 seconds; the multi-field form (type, subType, cash-flow category, currency) is the
  only friction, and only for non-obvious combinations — not evaluated live end-to-end this pass
  because dialog interaction requires holding the shared browser, which was not reliably
  available (see gaps below).
- No em dash found anywhere in the `accounting.json` / `accounts.json` / `accountMappings.json`
  message bundles (en or ar), nor in any `.tsx` under
  `apps/web/src/features/{accounts,account-mappings,dead-letters}` — sweep was a plain grep for
  the U+2014 character, both directions, all three namespaces, both locales.
- No physical-direction Tailwind classes (`ml-*`, `mr-*`, `pl-*`, `pr-*`, `text-left`,
  `text-right`, `left-*`, `right-*`) found anywhere under the same three feature directories —
  logical properties only, as required.
- en/ar key parity is exact (0 keys missing either direction) for `accounting.json` (239 keys
  each, includes the `deadLetters` namespace), `accounts.json`, and `accountMappings.json`.

### Em-dash sweep — RESULT: CLEAN

Specifically re-verified the 5 accounts touched by migration `0313_fix_arabic_coa_em_dash`
directly against the live tenant DB:
```sql
select code, name_alt, name_alt like '%—%' as has_emdash, name_alt like '%-%' as has_hyphen
from accounts where code in ('1129','1134','2145','3200','3300');
-- 1129 | شيكات في الطريق - بنك              | f | t
-- 1134 | شيكات مؤجلة الدفع - مدينة          | f | t
-- 2145 | شيكات مؤجلة الدفع - دائنة          | f | t
-- 3200 | الأرباح المبقاة - سنوات سابقة       | f | t
-- 3300 | الأرباح المبقاة - السنة الحالية      | f | t
```
All 5 render with a plain hyphen, zero em dashes, confirmed at the data layer (what the UI reads
verbatim, no client-side transform on `nameAlt`). Widened the sweep to the WHOLE `accounts`
table (`name`, `name_alt`, `code`) — 0 rows contain U+2014 — and to `account_mappings` joined to
its account names — 0 rows. Also swept the shared formatter primitives
(`packages/shared/src/format/*.ts`) and every `.tsx` in the three feature directories for a
literal em dash in a user-facing string (RPT-052's exact failure class) — none found. Did not
independently re-open a fresh CSV export to eyeball the Arabic column post-export (see gaps
below, and see the CoA export-filter HIGH above which is a separate, already-proven defect on
the same export path) — the underlying data feeding that export is proven clean, and
`export-coa-csv.ts` passes `nameAlt` through unmodified (no string transform in the flatten step),
so the export is expected to inherit the same clean hyphen, though this specific claim is
SUSPECTED rather than independently opened-and-eyeballed this session.

### Click counts (founder's standard)

- **Create an account:** 1 click (Add Account) → dialog opens with code pre-filled → type name →
  1 click (Save) = **2 clicks + 1 required field (name)** for a leaf account under an existing
  header. Code, type inheritance-safe defaults, and structure are handled by the system. Verdict:
  yes, a bookkeeper could do this first try — the only judgment call left to the user is which
  parent/type, which the tree structure itself guides.
- **Change an account mapping:** toolbar has no separate "edit" entry point search — user finds
  the row in the (already-rendered, unpaginated-per-filter) table and clicks its edit action,
  which opens `edit-mapping-dialog.tsx` (single dialog, an account picker to swap the mapped
  account) → Save. **2 clicks** once the row is visible. The friction is entirely upstream of the
  dialog: with 176 mappings and only an exact-match free-text `eventType` filter (see HIGH above)
  and a `scope`/`isActive` select, a bookkeeper hunting for one specific mapping by anything less
  than the exact internal event-type string has no reliable way to narrow 176 rows down — this is
  the practical cost of the HIGH finding above, not a separate issue.

### Verification gaps (honest)

- **No live screenshot obtained for**: `/accounting` landing page, `/accounting/account-mappings`
  fully loaded (only its skeleton state was captured before the shared browser session flipped
  away — screenshots `mappings-en3.png`/`mappings-en4.png`), and `/accounting/dead-letters` in
  any state. The shared gstack browser instance was contended by other concurrently-running
  agents for the majority of this session — repeated `net::ERR_ABORTED` / session-flip-to-a-
  different-locale-or-page every attempt, including after waits up to 60s and 5 consecutive
  retries. This is an environment constraint (explicitly warned about in the briefing), not a
  product defect, but it means the Arabic/RTL visual pass and the dead-letters empty/loading
  state were **not** visually confirmed this session — only reasoned about from code (i18n key
  parity, logical-properties-only CSS, message-bundle em-dash sweep) and from the live DB/API.
- **CoA CSV export was not opened as a downloaded file** this session (gstack's download capture
  was unreachable under the same browser contention) — the ignores-the-filter HIGH finding is
  proven by a complete, unambiguous code read (`treeNodes` passed to both the tree AND the
  export, with `search`/`typeFilter` only ever reaching the tree), not by opening the file, but
  an independent open-and-diff was not performed.
- **Chart of Accounts full en/ar/RTL visual pass, and the "expand all accounts" +
  balance-column-loading interaction**, were only partially observed (one clean EN screenshot
  with a correct 3dp KWD balance `10,252,817.771` on a filtered "Assets" header row, plus one
  correctly-rendered loading-skeleton state) before the browser was reclaimed by another session.
- **Account-mappings create/edit dialog and seed-defaults flow** were read in code
  (`create-mapping-dialog.tsx`, `edit-mapping-dialog.tsx`, `seed-defaults-dialog.tsx` all exist as
  single, non-nested dialogs per the file list) but not exercised live this pass.
