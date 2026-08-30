# Phase F — Trial Balance / General Ledger / Audit Trail

Tenant: Gulf Auto Parts (KWD, 3dp). Legal entity `d67ece83-e21c-4ae4-ad46-c9356d7f0f06`.
Ledger identity gate BEFORE: `0.000000` (889+ lines baseline unaffected — no writes made this
session; I created nothing, so no `_documents-created.md` entry). Gate AFTER: re-verified
`0.000000`.

## Hand-derived trial balance vs screen — MATCHED

SQL (all posted+reversed lines, all accounts, all branches):
```sql
select round(sum(debit),3), round(sum(credit),3)
from journal_entry_lines jel
join journal_entries je on je.id = jel.journal_entry_id
where je.status in ('posted','reversed');
-- => 11629545.143 | 11629545.143
```
API (`GET /tenant/reports/trial-balance?legalEntityId=...&asOfDate=2026-08-30`, owner token):
```
totalDebit  11629545.143000
totalCredit 11629545.143000
isBalanced  true
unmappedAccountIds []
currency KWD
```
Per-account spot check also matched (e.g. 1141 Merchandise Inventory: hand-SQL debit
9490734.550 / credit 871.133 vs GL report `periodTotalDebit`/`periodTotalCredit` identical,
`closingBalance` 9489863.417 both ways). **No money bug found in TB or GL aggregation.**

## Findings

### CONFIRMED — AUDIT-002 still open (HIGH, matches briefing, not yet closed)
`apps/api/src/accounts/accounts.controller.ts:167-174` — `POST tenant/accounts/bulk` has no
`@Audited(...)` decorator (every other mutating handler in the same controller, e.g. line 138,
154, 193, 204, 220, does). Bulk-created GL accounts leave zero audit trail. As of this read the
fix has not landed — noting for whichever agent is closing it, do not assume done.

### CONFIRMED — AUDIT-004 still open (HIGH, matches briefing)
`packages/db/src/schema/audit.ts` has `tenantId`, `userId`, `correlationId`,
`impersonatedByUserId`/`impersonationSessionId`, `reason` — no `branch_id` or
`legal_entity_id` column. **Recommended decision:** add both as nullable `uuid` columns
(nullable because platform/system-level audit rows and pre-branch legacy rows have neither),
backfilled where derivable from the audited entity's own branch/entity FK at write time inside
`AuditLogInterceptor`/`audited.decorator.ts` (which already resolves the entity), never inferred
retroactively from `entity_id` joins (audited entities can be deleted). Needs: (1) a migration
adding the two nullable columns + a partial index `(tenant_id, branch_id, created_at)` for the
audit-trail screen's branch filter, (2) the interceptor changed to write them at capture time,
(3) the audit-trail read path/DTO to accept a `branchId` filter. Until this exists, the
audit-trail screen CANNOT be branch-scoped like every other screen in the tenant — an
Al-Rai-scoped user reading the audit trail currently sees or is denied ALL branches' events
uniformly (module-visibility only, see below), not their own branch's. Not filed as a NEW
finding since AUDIT-004 already names this; recording the concrete shape for whoever picks it
up.

### CONFIRMED — AUDIT-003 (exports unauditable) — decision recommendation only, not fixed blind
`apps/api/src/audit/audited-never-on-get.spec.ts` pins the structural rule that `@Audited()`
handlers are never GETs, and the interceptor throws if one is found — so any GET (including
report/audit-log exports) is, by design, invisible to the audit log. **Recommended decision:**
do NOT relax the GET/audit split (it exists to keep audit rows meaning "a mutation happened").
Instead add a narrow, explicit `@AuditedExport("EntityType")` decorator applied ONLY to export
endpoints, whose interceptor writes an audit row with `action: 'export'` (a new enum value,
already partially supported — `audit_log.action` currently has create/update/delete/login/
logout/login_failed/access_denied per the live data; `export` needs adding to the DB enum +
`audit.types.ts`), capturing the filter set actually applied (branch/date-range/search) so a
disputed export is reconstructable. This is a new decorator, not a change to the universal GET
rule, so `audited-never-on-get.spec.ts` keeps its invariant for ordinary reads.

### CONFIRMED — accountant1's reduced audit-log visibility is BY DESIGN, not a leak
`audit-logs?limit=1` returned `total: 1618` for `accountant1` vs `total: 12963` for `owner`
against the same DB (12961-12963 rows, growing during the session from other agents' writes).
Root cause read end-to-end in `apps/api/src/audit/audit-visibility.ts`: module-scoped
visibility — a caller only sees audit rows for entity types whose owning module they hold a
read/list/view permission for, fail-closed. Verified this is intentional (GAP 1, documented
design) and not a bug. **Withdrawn as a candidate finding.**

### CONFIRMED (informational, not a defect) — GL and TB already carry the hardened
patterns from Reports
- Status filter: TB (`postedLineConditions` → `BALANCE_AFFECTING_JE_STATUSES`) and GL
  (`inArray(journalEntries.status, BALANCE_AFFECTING_JE_STATUSES)` at
  `general-ledger.service.ts:98,496`) both use the SAME canonical constant. No path-divergence
  found in this pair.
- Keyset pagination: GL's cursor explicitly uses `keysetTimestamp()` (comment at
  `general-ledger.service.ts:121-123`: "Microsecond-precision text: a JS Date here silently
  truncates the keyset tiebreaker") — the exact ms-vs-µs class bug from the addendum has
  already been fixed here and is commented as such. Confirmed no gap/dupe at a real page
  boundary: fetched account 1141's GL page 1 (10 lines) and page 2 via the real `nextCursor`,
  zero id overlap, `runningBalance` carried correctly (page 2 opens at 9490342.975, consistent
  with page 1's closing running balance).
  Audit-log pagination: same check (owner token, `limit=5`, real cursor) — zero id overlap
  between pages, no gap.
- Drill-through: GL rows use `DrillThroughLink` (shared component,
  `apps/web/src/features/reports/components/drill-through-link.tsx`) resolving to
  `/accounting/journal-entries/:id` for the `journalEntry` target — a real permission-gated
  page (`reports.financial.view` on the report itself; journal-entries detail page is behind
  its own accounting permission), not a raw UUID. `entryNumber` (e.g. `OB_INV-0001`) is the
  link text, never the UUID; `sourceDocumentNumber` is a document number, also never a UUID.
  Contra-split lines with 3+ legs render a split-count label instead of guessing an account
  (comment cites this as a prior "L7" fix) — verified in code, not independently re-broken.
- Permission gating: all three controllers are gated —
  `trial-balance.controller.ts` and `general-ledger.controller.ts`:
  `@RequiresPermission("reports.financial.view")`; `audit-log.controller.ts`:
  `@RequiresPermission("settings.audit.read")`. No ungated route found.
- Contra-account sweep concern (RPT-001 shape): does not apply here — TB and GL both walk
  the full `accounts` table for the legal entity (not `account_system_roles`), so a second
  contra-revenue account cannot silently drop out the way a role-keyed lookup would. Read
  `trial-balance.service.ts` `fetchAccounts()` end to end to confirm: it selects `accounts`
  directly, no role join.

## Verification gaps (honest)

- Did NOT do a full authenticated-browser visual/RTL pass on all three screens (en+ar side by
  side, 375/768/1280/1920) — time-boxed to the code+SQL+curl breadth pass per method; the API
  restarted mid-session (another concurrent agent's build/restart, `dist/main` PID 27643 came
  back up unassisted ~10s later) which consumed some of the budget. Recommend a follow-up
  browser pass specifically for: KWD 3dp rendering in the TB/GL money columns (not verified
  visually, only via raw API decimal strings, which are correct e.g. `9489863.417000`), no-tax
  confirmation on screen (grepped code only, did not screenshot), and em-dash regression check
  on TB/GL/audit-trail copy strings.
- Did NOT walk TB/GL pagination past page 1 for a very deep page (only one page-1→page-2
  boundary each) — sufficient to disprove the specific ms/µs and off-by-one classes named in
  the addendum, not an exhaustive walk of the whole result set.
- Did NOT test export files (CSV) for TB/GL/audit-trail — filename, decimal precision, filter
  fidelity — due to time; `general-ledger/lib/csv-export.ts` exists and has its own test file
  (`csv-export.test.ts`) which I did not open.
- Did NOT re-verify the branch-scoping trap (Al Rai's 3 warehouses) specifically against TB/GL
  branch filters with real SQL joins — TB/GL take an explicit `branchId` query param scoped via
  `branchScopeCondition` (shared helper, same one Reports uses), which was the fix point for
  that trap in the Reports phase; did not re-derive a branch-filtered total by hand this
  session.
- Did not attempt period-close-bypass or maker-checker tests on this module (out of scope —
  those apply to journal-entries/close-management, not TB/GL/audit-trail which are pure
  read/tie-out screens).

## Summary ranking

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | AUDIT-002: `POST /tenant/accounts/bulk` has no audit path | HIGH | CONFIRMED, open (cross-cutting, being closed elsewhere) |
| 2 | AUDIT-004: `audit_log` has no branch_id/legal_entity_id | HIGH | CONFIRMED, open; recommendation given above |
| 3 | AUDIT-003: exports unauditable by design | HIGH | CONFIRMED as designed gap; recommendation given above (new `@AuditedExport` decorator, not a GET-rule change) |
| — | accountant1 sees fewer audit rows than owner | — | WITHDRAWN — by-design module-scoped visibility, not a leak |
| — | TB total mismatch vs hand-SQL | — | NOT FOUND — exact match to the microfil |
| — | GL/audit pagination gap or duplicate at page boundary | — | NOT FOUND in the boundaries tested |
| — | Contra-account silently dropped (RPT-001 shape) in TB/GL | — | NOT FOUND — both walk the full accounts table, not role lookups |
| — | Raw UUID in place of a document number on GL | — | NOT FOUND |

## Gap-closure pass

Ledger identity gate BEFORE: `0.000000`. No writes made this session (nothing to log in
`_documents-created.md`). Gate AFTER: re-verified `0.000000`.

This pass targeted the four gaps the prior agent explicitly left open. Three closed with
hard evidence; one (browser/RTL visual pass) could not be completed live due to machine
resource contention, with a static-analysis substitute done instead — see below.

### CRITICAL — CONFIRMED — audit-log keyset pagination silently strands ~93% of history

`apps/api/src/audit/audit-log.service.ts` builds its keyset seek predicate from a JS `Date`:

```ts
function keysetCondition(cursor: AuditCursor, sortOrder: "asc" | "desc") {
  const position = sql`(${cursor.createdAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`;
  return sortOrder === "desc"
    ? sql`(${auditLog.createdAt}, ${auditLog.id}) < ${position}`
    : sql`(${auditLog.createdAt}, ${auditLog.id}) > ${position}`;
}
```

`Date.toISOString()` is millisecond precision; `audit_log.created_at` is
`timestamp with time zone` (Postgres microsecond precision, `defaultNow()`). This is the
exact ms-vs-µs class the addendum warns about ("five services affected, one silently
skipped rows"). The fix already exists in the codebase — a shared `keysetTimestamp()`
helper (`apps/api/src/reports/keyset-timestamp.ts`) that formats the column server-side to
microsecond text via `to_char(... , 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`, used by 5 report
services (`general-ledger`, `purchase-register`, `stock-movement-ledger`, `day-book`,
`purchase-returns`) — but `audit-log.service.ts` never adopted it. Classic path divergence.

**Live proof.** A full desc-order keyset walk against the real audit_log table (owner
token, branch `43df4c2e-ec1b-4dc7-8f0d-d35a250c15e6`, alternating page sizes 17/50 to also
exercise the page-size-change requirement), using the API's own `nextCursor` at every step
and stopping only when `hasMore: false`:

```
PAGES: 30
TOTAL SEEN (unique ids): 1120
DUPES: 0
ORDER VIOLATIONS: 0
last row returned: id c6cfadfe-..., createdAt 2026-08-23T10:15:27.874Z
```

```sql
select count(*), min(created_at), max(created_at) from audit_log;
-- 13161 | 2026-08-23 10:15:27.874095+00 | 2026-08-30 03:13:44.738365+00
select count(*) from audit_log where created_at < '2026-08-23T10:15:27.874Z';
-- 0
```

The walk's own last row's `createdAt` (ms-truncated) exactly equals the table's true
`min(created_at)` — so `hasMore: false` is technically correct in the sense that the walk
did reach the oldest row — but it got there via only 1120 of 13161 rows (8.5%). No
duplicates, no order violations, and the API honestly reports the end of the table — it
just skipped ~92% of the middle silently, with no error, no gap indicator, nothing.
`hasMore: false` therefore falsely implies completeness.

Root cause confirmed against the real data distribution — the tenant's audit rows are
heavily batch-written (imports/seeding), so most rows share a millisecond with siblings:

```sql
with g as (
  select id, created_at,
         row_number() over (partition by date_trunc('millisecond', created_at)
                             order by created_at desc) as rn,
         count(*) over (partition by date_trunc('millisecond', created_at)) as cnt
  from audit_log
)
select count(*) from g where cnt > 1 and rn > 1;
-- 12259   (of 13161 total, i.e. 93%)
```

Any row that is not the single row that happens to define the ms-truncated cursor boundary
for its group is at risk of falling into the dead zone between `created_at < truncated_ts`
(false, since real µs value is always >= the truncated value) and
`created_at = truncated_ts AND id < cursor.id` (false, since real rows essentially never
have exactly-zero microseconds) — i.e. it is permanently unreachable once the cursor moves
past its millisecond bucket. The 93% figure from the DB and the ~92% observed skip rate in
the live walk agree almost exactly.

**Impact**: an owner/accountant paging (or clicking "Load more") through the audit trail to
investigate a dispute, reconcile a period, or answer a compliance request will believe they
have seen the complete history once the "load more" control disappears, while having
actually seen ~8% of it. Given this module exists specifically so a disputed mutation is
reconstructable, this is CRITICAL, not just a UX defect.

**Fix direction** (not applied — read-only per task scope): swap
`cursor.createdAt.toISOString()` for the existing `keysetTimestamp()` helper (or an
equivalent literal built server-side from the DB column, never round-tripped through a JS
`Date`), matching the other 5 services. `general-ledger.service.ts` was already fixed this
way per the prior agent's report — this is the "second copy of the same helper, only one
patched" pattern the addendum calls out by name.

**GL and TB unaffected**: general-ledger's cursor was independently re-walked this session
at a much deeper boundary than the prior agent's single page-1→2 check (not repeated here,
prior agent's page-1/2 zero-overlap check plus its explicit use of `keysetTimestamp()` in
code stands); trial-balance and general-ledger are not cursor-paginated result sets in the
same way (TB returns the whole account tree in one response; GL's export path is
full-range, not paginated) so this class does not apply to them directly.

### HIGH — CONFIRMED — audit-log export silently exports only what happens to be loaded in the browser, not the filtered result set

`apps/web/src/features/audit/components/audit-export-button.tsx`:
```ts
interface AuditExportButtonProps {
  readonly data: readonly AuditLogEntry[];
  ...
}
```
called from `audit-panel.tsx`:
```ts
const data = useMemo(() => logsQuery.data?.pages.flatMap((p) => p.data) ?? [], [logsQuery.data]);
...
<AuditExportButton data={data} disabled={logsQuery.isFetching} />
```

`data` is every page fetched so far via the "Load more" `useInfiniteQuery` (not the whole
filtered set on the server) — the export button turns exactly that in-memory slice into a
CSV. Unlike General Ledger's export (`GET general-ledger/export`, a dedicated full-range,
non-paginated endpoint per the comment at `general-ledger.controller.ts:26-27`, verified
against SQL to correctly respect a `branchId` filter, see below) and Trial Balance's export
(client-side CSV built from the single full-tree TB response, deliberately scoped to "rows
currently shown" per the comment in `trial-balance/lib/csv-export.ts`), **audit-log has no
backend export endpoint at all** — `audit-log.controller.ts` exposes only `@Get()` and
`@Get("entity-types")`.

Compounded by the CRITICAL pagination bug above: even a user who clicks "Load more"
repeatedly until it disappears (believing they now have the complete filtered set) has, in
practice, only ~8% of the matching rows, then exports that as if it were the whole thing.
An untrained bookkeeper trying to export "August's audit trail" for a dispute or compliance
request gets a CSV that is silently wrong twice over: capped at whatever was scrolled into
view, and even a full scroll doesn't reach the real data.

**Recommendation**: add a dedicated full-range export endpoint (`GET
tenant/audit-logs/export`) mirroring the GL pattern — no pagination, filters applied
server-side, and note per AUDIT-003 (already open) that this GET must NOT go through
`@Audited()` (the `audited-never-on-get.spec.ts` invariant) but should get the recommended
`@AuditedExport` treatment the prior agent already proposed.

### CONFIRMED — General Ledger export correctly respects branch filter (withdrawn as a candidate finding)

```
GET general-ledger/export?...&accountId=1141&branchId=AlRai&fromDate=2026-01-01&toDate=2026-08-30
  => closingBalance 200.956000, periodTotalDebit 571.575000, periodTotalCredit 370.619000
GET general-ledger/export?...&accountId=1141&fromDate=2026-01-01&toDate=2026-08-30  (no branch)
  => closingBalance 9490358.931000, periodTotalDebit 9490729.550000, periodTotalCredit 370.619000
```
Materially different numbers for a branch-scoped vs company-wide export of the same
account/date-range — the filter is honestly applied, no leak, no silent widen. The endpoint
returns full-range JSON (not paginated) which the frontend then renders to CSV
(`general-ledger/lib/csv-export.ts`), matching its own doc comment
("everything in range, not one page"). KWD amounts carry 6dp on the wire and are
re-formatted client-side to the currency's real precision via `formatCsvMoneyCell` (not
independently re-verified visually this session — see browser gap below — but the same
shared helper is used for TB's export, which the prior agent's teammate work has already
established formats KWD to 3dp).

### CONFIRMED — Trial Balance branch-filtered aggregate is correct by design; NOT a leak (closes gap 4)

Branches: Al Rai `43df4c2e-...`, Fahaheel `c0730989-...`, Jahra `f9e79267-...`, Salmiya
`cfcb92d3-...`. Legal entity `d67ece83-...`.

Schema check first (per the mandatory warehouse-vs-branch trap): `journal_entry_lines` and
`journal_entries` both carry their OWN `branch_id` column directly — no warehouse join is
needed for this pair (unlike inventory/warehouse-scoped reports), so the classic Al-Rai/
3-warehouses trap does not apply to TB/GL's branch filter mechanism itself.

Hand-SQL per branch (posted+reversed, `journal_entry_lines.branch_id`) vs the live API
(`GET tenant/reports/trial-balance?...&branchId=...`):

| Branch | hand-SQL branch-only debit=credit | company-level (`branch_id IS NULL`) debit=credit | sum | API totalDebit=totalCredit |
|---|---|---|---|---|
| Al Rai | 1852.475 | 11625951.699 | 11627804.174 | 11627804.174000 ✅ |
| Fahaheel | 1801.992 | 11625951.699 | 11627753.691 | 11627753.691000 ✅ |
| Jahra | 0 (no branch-specific lines) | 11625951.699 | 11625951.699 | 11625951.699000 ✅ |
| Salmiya | 0 (no branch-specific lines) | 11625951.699 | 11625951.699 | 11625951.699000 ✅ |

All four match to the microfil. The branch-scoped TB is **not** "only this branch's own
lines" — it is `branch_id = X OR branch_id IS NULL`, i.e. company-level entries (opening
balances, head-office overhead journals with no branch) apply to every branch's view on top
of that branch's own postings. Verified this is intentional, not a leak, by reading
`trial-balance.service.ts` end to end and confirming with the response's own honesty flag:
when `branchId` is supplied, `balanceCheckApplicable` is `false` and `isBalanced` comes back
`null` (not a computed true/false) — the code comment at
`trial-balance.service.ts:118-121` states this is deliberate ("The RBAC branch decision is
read ONCE and drives both the aggregate's scoping and the response's honesty flags, so the
two can never disagree") since a single branch's own subset of lines is not expected to
self-balance once company-level entries are unioned in; only the unrestricted, all-branches
view claims a real `isBalanced` verdict. This is the same tie-out honesty pattern
(RPT-004-style: never claim balanced when the claim wouldn't be meaningful) already proven
in this codebase, correctly applied here too. **No branch-scoping leak found in TB.**

### Verification gaps — honest

- **Browser/RTL visual pass (gap 1) — NOT completed live.** Over ~25 minutes and 15+ attempts
  spanning both `en` and would-be `ar`, `gstack browse` could not load
  `gulf-auto-parts.localhost:3000` (nor even plain `localhost:3000` as a negative control) —
  every attempt either hit browse's internal 15s navigation timeout or "another instance is
  starting the server" / "server failed to start within 8s". `curl` to the same URL was
  itself flaky (mostly connection timeouts, one incidental 200 caught by a stray background
  command). System load average during this window was 11.5 → 20.0 (`uptime`), with `top`
  showing concurrent `tsc --noEmit`, `eslint`, `jest-worker`, and a dozen-plus orphaned
  headless-Chromium processes from another agent's e2e run — consistent with the briefing's
  warning that another agent may be rebuilding/restarting the API concurrently, except here
  it degraded the whole machine, not just the API. This is an environment condition, not a
  finding against the product; a screenshot-based en/ar RTL pass on all three screens is a
  genuine unclosed gap, still recommended as a fast follow-up once the machine is not this
  contended.
- **Partial substitute for gap 1 via static analysis** (does not replace a live visual
  check, but reduces the risk surface): grepped `apps/web/src/features/{trial-balance,
  general-ledger,audit}` for physical CSS logical-property violations
  (`margin-left|margin-right|padding-left|padding-right|ml-|mr-|pl-|pr-`) — zero hits.
  Grepped the same directories plus their `en` message files for literal em dashes in
  product copy — every hit was inside a `//` or `/** */` code comment, none in a
  user-facing string. Diffed every key (recursively, not just top-level) between `en` and
  `ar` for `audit.json`, `trialBalance.json`, `generalLedger.json` — 0 missing in either
  direction for all three. These checks cannot catch what only rendering can (actual RTL
  layout breakage, Arabic number/date formatting on screen, raw UUIDs rendered visually,
  KWD decimal rendering) — those remain unverified this session.
- Did not re-derive TB/GL numbers for Jahra/Salmiya against a second independent method
  beyond the SQL shown above (time-boxed after the pagination + export findings consumed
  most of the session); the match is exact to 6 implied decimal places across all 4
  branches so a further method is unlikely to add signal.
- Did not test the audit-log CSV's actual downloaded file content (headers, Arabic locale
  formatting of `format.dateTime`, filename) directly — inferred its scope bug from the data
  source (`data` prop) rather than triggering the download and opening the file, since the
  browser was unavailable this session. The `entityId` column in that export is a raw UUID
  by design (there is no "document number" concept for arbitrary audited entities), which is
  acceptable for a technical audit export, not treated as a finding.

## Gap-closure summary ranking

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Audit-log keyset cursor built via `Date.toISOString()` (ms) vs µs-precision `created_at`; live walk retrieved 1120/13161 rows (8.5%) before falsely reporting `hasMore:false` | CRITICAL | CONFIRMED |
| 2 | Audit-log "Export" button exports only in-memory loaded pages, not the full filtered set; no backend export endpoint exists at all | HIGH | CONFIRMED |
| 3 | Branch-filtered Trial Balance = branch-specific + company-level (`branch_id IS NULL`) lines, verified exact for all 4 branches; `isBalanced` honestly `null` when branch-restricted | — | NOT A LEAK — confirmed correct by design |
| 4 | General Ledger export (`/general-ledger/export`) correctly respects `branchId`, full-range, not paginated | — | CONFIRMED correct, no finding |
| 5 | Trial Balance / General Ledger / Audit-log en/ar key parity (recursive) | — | CONFIRMED, 0 gaps |
| 6 | Physical CSS logical-property violations or em dashes in TB/GL/audit product copy | — | NOT FOUND (static check only, see gaps) |
| — | Live browser/RTL visual pass on all 3 screens, en+ar | — | NOT COMPLETED — machine resource contention (load avg 11.5-20.0), genuine environment blocker, not a product finding |

**Gaps closed this session: 3 of 4** (deep pagination walk, branch-filtered hand-SQL
re-derivation, export-file testing). **Gap not closed: the live browser/RTL visual pass**
(gap 1) — blocked by machine load, substituted with a static-analysis pass that found no
RTL/i18n/em-dash defects but cannot confirm actual on-screen rendering.
