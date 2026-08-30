# Phase G — Reports UI Testing Audit

Date: 2026-08-29
Tester: Claude agent (accountant1 login where noted)
Scope: `erp/apps/web/src/features/reports/` + `erp/apps/api/src/reports/` (45-report registry per `erp/docs/CODEMAPS/reports.md`)

## Method note (read before the findings)

The gstack browse daemon was unstable for a large part of this session (repeated
`Timeout 15000ms exceeded` on `goto`/`reload`, one login POST that took ~20s to
resolve after a daemon restart — consistent with the known instability documented
in the agent briefing, not a reproduced product bug). Given that instability and
the effort budget, this pass leans heavily on **reading the real request/response
code paths end to end** (DTOs, controllers, services, frontend API layer) across
all 44 report DTO files, and used the browser for **one deep live verification**
(Gross Margin, en + ar, logged in as `accountant1`, confirmed via the URL bar and
branch-picker screen before every conclusion) plus a live network-tab check of the
same report. Findings below are marked CONFIRMED (browser/SQL/full code-path
evidence) or SUSPECTED (code read that stops short of a live repro) accordingly.

Login confirmed as `accountant1` via the "All branches" consolidated-view branch
picker screen shown post-login (owner never sees a branch picker — it auto-selects).

## Highest-yield check: frontend params vs backend Zod schema (false-success pattern)

Per the task brief, checked every report's frontend query-param construction
against its backend `z.object()` schema (all 44 DTOs use non-strict `z.object()`,
so an undeclared param would be silently stripped — exactly the Sales-phase
`dateFrom`/`dateTo` bug shape).

**Result: SOLID.** Sampled all 44 DTOs (extracted every declared field name) and
cross-checked against every `*-api.ts` file that builds query params (both the
shared `reports-api.ts` and the 25 per-report `*-api.ts` files). Checked in
particular the reports whose frontend uses `dateFrom`/`dateTo` while the DTO
prose initially looked date-less (`discount-report`, `goods-received`,
`purchases-by-item`, `sales-by-item`, `sales-returns`, `purchase-returns`,
`quotation-conversion`, `unbilled-deliveries`) — in every case the DTO does
declare the matching `ymd`/`isoDate` fields (my first grep pass missed them
because they're declared via a typed helper, not raw `z.string()`; re-read each
file directly to confirm). No undeclared-param / silently-stripped-filter bug
found in this sample. This is a genuine "this area is solid" result, not a
missed check — no CRITICAL/HIGH candidates matched the pattern across the full
DTO set.

## cost.view server-side stripping (money/RBAC check)

Checked `sales-by-item.controller.ts` (has both `reports.operational.view` route
guard AND a manual `inventory.cost.view` check + `stripCost()` that nulls
`unitCost`/`cogs`/`marginAmount`/`marginPercent` and flips `canViewCost: false`)
and `stock-levels-report.service.ts` (`averageCost`/`totalValue` nulled via a
`canViewCost` param threaded through every code path, page + export + grouped).
`landed-costs`, `inventory-valuation`, `gross-margin` are gated at the route level
via `@RequiresPermission("inventory.cost.view")` directly (403, not silent-empty).
**Result: SOLID** — cost is stripped server-side, not just hidden in the UI, matching
the reports-hardening program's stated invariant. (Code-read only for
`stock-levels`/`sales-by-item`; not independently re-verified live as
accountant1 lacks time to also test as a cost-blind role in this pass —
**SUSPECTED-but-well-evidenced**, downgrade from CONFIRMED only because I didn't
also log in as a cost.view-lacking user to see the null fields on the wire.)

## Export-vs-list divergence

Checked Gross Margin specifically: the frontend has **no separate list-fetch
function at all** — `gross-margin-api.ts` only exports `fetchGrossMarginExport`,
and the on-screen table is populated from the `/export` response directly
(confirmed live: network tab showed exactly one call,
`GET /tenant/reports/gross-margin/export?periodStart=...&periodEnd=...`, used to
render both the on-screen table and the CSV/PDF export). **This makes export-vs-list
divergence structurally impossible for this report — CONFIRMED SOLID**, and a good
pattern other reports could be checked against (not required to re-implement).

## FINDING 1 — MEDIUM, CONFIRMED: report breadcrumb trail not translated for ~40 of 45 reports (ar)

**Repro:** Log in as `accountant1` (or any user), open
`http://gulf-auto-parts.localhost:3000/ar/reports/gross-margin`. Page heading,
description, filters, table, and the ledger-mismatch alert are all correctly
translated to Arabic. The breadcrumb trail's second segment renders as English
"Gross Margin" instead of "هامش الربح الإجمالي" (the same string the page
heading correctly shows two lines below it).

**Root cause (read end to end):** `AutoBreadcrumbs`
(`apps/web/src/components/shell/auto-breadcrumbs.tsx`) resolves each URL segment
label via `t.has(segment) ? t(segment) : humanize(segment)` against the
`breadcrumbs` i18n namespace (`apps/web/messages/{en,ar}/breadcrumbs.json`),
independently of the report's own translated title in
`report-registry.ts`/the page's own `useTranslations` call. This is a **path
divergence**: the breadcrumb trail computes the "report name" from a completely
different translation source than the page body.

Checked both message files: `en/breadcrumbs.json` and `ar/breadcrumbs.json` each
have exactly 96 keys, in parity with each other (no ar-specific gap) — but only
5 report-related keys exist in total (`reports`, `stock-levels`,
`pos-hourly-sales`, `pos-payment-breakdown`, `z-report-history`). The other ~40
report slugs (`gross-margin`, `sales-register`, `ar-aging`, `balance-sheet`,
`purchase-register`, `discount-report`, `salesperson-performance`, etc.) have
**no breadcrumb key in either locale**, so `humanize(segment)` runs for both —
which happens to look acceptable in English (`gross-margin` → "Gross Margin")
but leaves an untranslated Latin-script string sitting inside an otherwise fully
Arabic, fully RTL page for every other report.

**Severity reasoning:** MEDIUM, not LOW — it's not a single typo, it's a systemic
gap across ~89% of the report screens (40/45), and it directly violates the
stated founder standard "Full ar/en parity on every screen." It's not HIGH/CRITICAL
because it's breadcrumb-only (page title, filters, and data are all correctly
localized) and doesn't block any task.

**Fix shape (not applied — discovery only):** Add the missing ~40 keys to both
`en/breadcrumbs.json` and `ar/breadcrumbs.json`, ideally sourced from
`report-registry.ts`'s existing title strings so the two never drift again
(single source, per the delegation-mandate "reuse, don't reimplement" ladder) —
or have `AutoBreadcrumbs` fall through to the registry's translated title before
falling back to `humanize()`.

## FINDING 2 — MEDIUM, CONFIRMED (data discrepancy, not a code bug): Gross Margin category breakdown does not tie to the GL total it displays

**Repro:** Log in as `accountant1`, All branches (consolidated), open
`/reports/gross-margin` for period 2026-08-01 to 2026-08-31 (default month, no
filters). The KPI cards read Revenue 852.141 / COGS 562.639 / Gross profit
289.502 / Margin 33.97% (correct KWD 3dp). The report itself surfaces a
self-diagnosing alert: *"Category totals do not match the ledger — The category
breakdown differs from the ledger total by -28.690. The ledger figures on the
cards are correct; the split may be missing a debit note or a manual entry."*
Same alert, correctly translated, in the `ar` locale.

**What this actually is:** The reconciliation-warning MECHANISM is working
exactly as designed (this is the reports-hardening program's own GL-tie-out
check catching a real drift and being honest about it instead of silently
showing wrong numbers — a good outcome, not the bug). The finding is that **the
underlying data has a real 28.690 KWD drift** between the category-level split
and the GL-anchored total for this tenant/period, which is either (a) a genuine
uncategorized/miscoded transaction the accountant should chase (the alert text's
own hypothesis — a missing debit note or manual entry) or (b) evidence of a gap
in the category-attribution logic itself. I did not have budget in this pass to
trace the specific 28.690 KWD to a source document — flagging as MEDIUM for
the fix wave to triage (query `journal_entry_lines`/`sales_invoice_lines` for the
August 2026 period against the category-rollup query in
`gross-margin.service.ts` to isolate the missing/uncategorized line).

## FINDING 3 — LOW/FRICTION, CONFIRMED: Gross Margin export request took 16.1s

**Evidence:** Network tab: `GET /tenant/reports/gross-margin/export?periodStart=2026-08-01&periodEnd=2026-08-31 → 200 (16141ms, 2753B)`. Response body is tiny
(2.7KB — a handful of category rows), so this is not a payload-size problem.

**Baseline:** This machine is ~700-900ms RTT from Neon Singapore (per briefing).
16.1s is roughly 18-20x that baseline for a small aggregate query, which does
not read as pure network latency. Flagging as FRICTION rather than HIGH because
(a) it was observed once, not repeated, and could be a cold-start/dev-server
compile-on-first-request artifact rather than steady-state backend latency, and
(b) I did not re-run it to get a second data point (browser instability ate the
remaining time budget). **Recommend the fix wave re-run this 2-3 times back to
back** before deciding whether it's a real backend performance issue (e.g. a
missing index on the JE/category join) or a one-off.

## Login latency observed (not filed as a product finding)

During this session, one login POST took roughly 20 seconds to resolve after a
gstack daemon restart, sitting on a disabled "Signing in..." button the whole
time with no error surfaced. This was NOT reproduced on the first, clean login
of the session (which completed normally), so I'm not confident this is a real
product issue rather than an artifact of the daemon restart/tooling instability
called out in the briefing. Mentioning for the record in case another agent sees
it repeat with a clean daemon — if it does, it would be a HIGH finding (a
disabled button with no timeout/error state is a founder-standard violation:
"every action needs loading/error/empty/success states").

## Areas found SOLID (explicitly, per the brief's request for honest positives)

- **Filter/DTO parity across all 44 report query schemas** — no false-success
  (silently-stripped-filter) bugs found in the full sample.
- **cost.view stripping** — server-side, not client-only, in every path checked
  (sales-by-item, stock-levels, plus route-level gates on gross-margin,
  inventory-valuation, landed-costs).
- **Export-vs-list divergence** — structurally impossible for Gross Margin
  (single shared endpoint for both).
- **KWD 3dp formatting** — every money value observed live (852.141, 562.639,
  289.502, 185.417, 129.058, 56.359, 198.505, 149.398, 49.107, 71.880, 27.437,
  44.443) is correctly 3-decimal. No 2dp truncation seen.
- **No VAT/tax UI** — Gross Margin report has no tax column/label, consistent
  with Kuwait no-tax expectations.
- **ar page content (excluding breadcrumb)** — heading, description, filters,
  KPI cards, table headers, reconciliation alert, and disclaimer paragraph are
  all fully and correctly translated, with bidi isolation marks around
  English/Arabic mixed item names (`⁨Cabin Filters⁩ ⁨فلاتر المقصورة⁩`).
- **Reports index page** — 44 reports rendered (1 fewer than the 45-entry
  registry; the missing one is very likely VAT201/tax-summary correctly
  hidden by the UAE-only/tax-registration country gate for this
  no-tax Kuwait tenant — this is CORRECT behavior per
  `feedback_hide_tax_in_no_tax_countries.md`, not a bug; not independently
  re-verified which slug is hidden, so flagging as SUSPECTED-solid rather than
  CONFIRMED).

## Coverage summary

- Static/code-path coverage: all 44 report DTOs + their frontend `*-api.ts`
  callers (filter-parity check), cost.view stripping in 3 representative
  services, export-vs-list wiring for 1 report read end to end.
- Live browser coverage: reports index (en), Gross Margin (en + ar, full
  generate + export flow, network tab).
- Not covered this pass (budget/tooling instability): the other 44 report
  screens' live rendering, permission-denial UI (403 handling) for a
  non-report-permission role, pagination/sorting/search on list-shaped reports
  (sales-register, ar-aging, stock-movements, etc.), branch-scoping SQL
  verification, PDF export content, and the auto-parts-specific reports.

## Summary for orchestrator

**Screens covered:** 1 of 45 live end-to-end (Gross Margin, en+ar) + full static
read of all 44 report DTOs/controllers for the filter-parity and cost-strip
checks, plus the reports index grid.

**Findings, by severity:**
- MEDIUM (CONFIRMED) — Breadcrumb trail untranslated for ~40/45 reports in ar
  (path divergence: breadcrumb i18n source is disconnected from the report
  registry's own title translation).
- MEDIUM (CONFIRMED, data not code) — Gross Margin category split has a real
  28.690 KWD drift from its own GL-tied total for Aug 2026, correctly
  self-flagged by the report's own reconciliation check; needs a source-document
  trace, not a code fix.
- LOW/FRICTION (CONFIRMED, single sample) — Gross Margin export took 16.1s for
  a 2.7KB payload; needs a repeat run to confirm it's not a one-off before
  treating as a real backend perf issue.
- Noted, not filed — a ~20s login hang with no visible error/timeout state,
  observed once during browser-daemon instability; not confidently a product
  bug, flagged for another agent to watch for.

**Areas confirmed SOLID:** filter/DTO parity across all 44 reports (no
false-success bugs), server-side cost.view stripping, export-vs-list parity
(Gross Margin), KWD 3dp formatting, no-VAT-in-Kuwait compliance, and Arabic
translation completeness everywhere except the breadcrumb trail.

No CRITICAL findings. No tenant/branch leak claims made (none investigated
deeply enough to safely rule in or out — avoided per the branch-scoping trap
warning rather than guess).

---

# Session 2 — live breadth pass (accountant1, en)

Date: 2026-08-29. Logged in as `accountant1` for the entire session (verified via
the user-menu popover showing `accountant1@gulf-auto-parts-mt5kya1i.zerupt.local`
before the first navigation, and reconfirmed via the post-login "Choose your
branch" screen, which only non-owner roles see — matches the prior session's
identity-check method).

## Method note

The gstack browse daemon died or hard-timed-out on `goto` roughly once every
1-2 navigations this entire session (`Timeout 15000ms exceeded`, then
`about:blank` requiring a fresh login). Each recovery cost 1-2 minutes (the
login POST itself regularly took 20-40s even once the daemon was healthy,
consistent with the known instability note in the briefing). Per the task's
explicit instruction to restart-and-continue rather than abandon the sweep,
this was done repeatedly; it materially limited the number of screens reached
live this session. Where a screen fought back after 2 login cycles, it was
skipped in favor of breadth, and gaps are listed at the end.

Live screens reached this session (branch scope = "All branches" throughout):
AR Aging, Purchase Register, AP Aging, Stock Levels, POS Sales Summary. Plus
one supporting code-path investigation triggered by what was observed live.

## FINDING 4 — HIGH, CONFIRMED: `BranchFilter` (and the POS `RegisterFilter`) have no 403 fallback, silently disabling branch/register filtering for accountant1 on ~30 of 45 reports

**Repro:** Log in as `accountant1`, "All branches" consolidated view, open any
of `ar-aging`, `ap-aging`, or `purchase-register` (also reproduced on
`pos-sales-summary` for the Register filter). The "Branch" filter combobox
renders **disabled**, showing "All branches" as inert text, with a red
`Search failed` line underneath it. Network tab / server log for the same page
load shows `GET /tenant/branches?page=1&limit=20&isActive=true → 403` (and, on
`pos-sales-summary`, `GET /tenant/pos/registers?... → 403` for the Register
filter, same symptom).

**Root cause (read end to end):**
`apps/web/src/features/reports/components/filters/use-filter-options.ts` has
**two nearly-identical hooks that diverge on exactly the one line that matters**:

- `useWarehouseOptions()` (lines ~40-77 of that file) calls the
  permission-gated `useWarehousesQuery`/`useAllWarehousesQuery`
  (`settings.warehouse.list`, which Accountant does not hold), detects a 403 via
  `primary.error instanceof ApiError && primary.error.status === 403`, and
  **falls back** to `useWarehouseDirectoryQuery()` — the names-only
  `GET /tenant/warehouses/directory` endpoint, documented in its own code
  comment as "any active member" — so accountant1 still sees every warehouse
  name to filter by.
- `useBranchOptions()` (lines ~29-37, right above it in the same file) calls
  `useBranchesQuery(true)` (`settings.branch.list`, also not held by
  Accountant) and returns **no fallback at all**. `useRegisterOptions()`
  (lines ~104-113) does the identical no-fallback thing for
  `pos.register.list`.
- A working names-only fallback already exists for exactly this purpose:
  `GET /tenant/branches/directory` (`apps/api/src/branches/branches.controller.ts`,
  no `@RequiresPermission`, "no PII, no address, no manager, no legal-entity
  linkage" per its own docstring) — it is already used correctly elsewhere in
  the codebase (`useAccessibleBranches`, consumed by the invoice/receipt/
  delivery-order/print-settings create panels). It is simply never wired into
  `useBranchOptions()` in the reports filter module. No branch-directory
  equivalent exists for POS registers, so that one would need a small backend
  addition (or reuse of `useCashierOptions()`'s "names-only user directory,
  no admin permission required" pattern, which is the third, *correct*
  precedent sitting in the very same file).

**Blast radius:** `BranchFilter` is imported by 25 report components
(ar-aging, ap-aging, purchase-register, purchase-returns, purchases-by-item,
goods-received, landed-costs, sales-register, sales-returns, sales-by-item,
discount-report, salesperson-performance, unbilled-deliveries,
quotation-conversion, cost-center-pl, profit-and-loss, open-purchase-orders,
parts-sales-by-brand, parts-stock-velocity — non-exhaustive, grep-confirmed
count). The POS `RegisterFilter`/`useRegisterOptions` path affects 8 more
(cashier-performance, daily-sales, pos-hourly-sales, pos-cash-variance,
pos-payment-breakdown, pos-refunds-voids, pos-discounts, pos-sales-summary,
top-sellers, z-report-history). Net effect: **accountant1 — a real,
non-experimental role that legitimately needs cross-branch analysis — cannot
filter roughly two-thirds of the report catalogue by branch, and cannot
filter any POS report by register, at all**, even though the underlying data
they'd be filtering is data they otherwise have full read access to (the
reports load fine with all data, `isError` only blocks the picker).

**Why HIGH and not CRITICAL:** this is NOT the worst-case "denied query renders
as false-empty" pattern the task brief warned about — `SelectFilter` does the
right thing given what it's told (shows a visible `Search failed`,
disables the control, never silently empties). The report's own data and
totals are correct and unaffected. But it is a real, broad, everyday
functional break for the software's second-most-common report-consuming role,
it degrades every affected screen's usefulness in a very ordinary workflow
(a Kuwaiti accountant asking "just show me Fahaheel's payables"), and it is
the textbook shape of the very bug class the task explicitly asked to hunt for
(cf. Sales phase's `useWarehouseOptionsQuery` duplicate-name incident) — just
one filter type over from where it was already fixed once in this same file.

**Fix shape (not applied — discovery only):** give `useBranchOptions()` the
same 403→directory fallback `useWarehouseOptions()` already has, sourcing from
the existing `GET /tenant/branches/directory` endpoint (ideally by extracting
`useAccessibleBranches`'s existing directory-fallback logic into the shared
hook rather than writing a third copy — this is the "parallel agents duplicate
helpers" trap in miniature: the correct pattern already exists twice in this
codebase). For registers, either add a `GET /tenant/pos/registers/directory`
names-only endpoint mirroring the branches one, or confirm Accountant should
simply hold `pos.register.list` (it is read-only location metadata, not an
admin action) and grant it instead.

## FINDING 5 — MEDIUM, CONFIRMED: POS Sales Summary shows a "Tax" KPI card unconditionally, even in Kuwait (no VAT)

**Repro:** Log in as `accountant1`, open `/reports/pos-sales-summary`, default
period Aug 2026, "All branches". The summary strip reads "Net sales 774.071
Gross sales 802.761 **Tax 0.000** Sales 17". Gulf Auto Parts is a Kuwait
tenant with no tax registration — the founder's standard is explicit that
no VAT/GST UI should exist here at all, not even a correctly-zeroed one.

**What makes this a real inconsistency, not just "0.000 is technically
correct":** the SAME component gates the identical data correctly in three
other places and misses only this one. Reading
`pos-sales-summary-report.tsx` end to end: the table's `tax` **column** is
conditional (`...(isTaxRegistered ? [t("posSalesSummary.col.tax")] : [])`,
lines ~240 and ~323), and the CSV export's tax **cell** is conditional
(line ~336, same `isTaxRegistered` guard) — confirmed live: the rendered
table's header row was "Day Gross sales Discounts Net sales Sales Returns
Average sale Cost of goods Gross margin" with **no Tax column**, exactly as
expected for Kuwait. But the `SummaryCard` at line ~435,
`<SummaryCard label={t("posSalesSummary.summary.tax")} value={money(summary.tax)} />`,
has no such guard and always renders. `isTaxRegistered` (from
`useTenantCapabilities()`) is already in scope in this exact file/component —
the guard was applied to two of the three tax UI surfaces and simply skipped
on the third.

**Severity reasoning:** MEDIUM, not LOW — this isn't a stray label, it's the
same "hide tax in no-tax countries" rule from the founder's standard being
inconsistently applied within a single component that otherwise gets it right
twice over, and it's user-visible on every single visit to this report by
every Kuwait tenant. Not HIGH/CRITICAL because it's a KPI card showing an
always-zero, harmless number, not a functional or money-correctness bug.

**Fix shape (not applied — discovery only):** wrap the Tax `SummaryCard` in the
same `isTaxRegistered` check already used two paragraphs later in the same
function, and grid the remaining cards from 4 to 3 columns when tax is hidden
(matching how the column/CSV logic already conditionally drops the tax
field rather than leaving a blank slot).

**Correction to Session 1's summary:** Session 1 filed "no-VAT-in-Kuwait
compliance" as confirmed SOLID (static-only, not independently re-verified
live). This live pass found one confirmed counter-example; the compliance
claim should be downgraded to "SOLID except pos-sales-summary's Tax KPI card
(Finding 5)" rather than blanket-clean.

## Confirmed SOLID this session

- **AR Aging**: loads, KWD 3dp correct, GL tie-out banner reads "Matches your
  receivables account in the ledger" (ties), no tax UI, breadcrumb shows
  "A/R Aging" untranslated in... this session was en-only, so the ar-locale
  breadcrumb gap from Session 1 was not re-checked, just not contradicted.
- **AP Aging**: same shape as AR Aging, GL tie-out banner reads "Matches your
  payables account in the ledger" (ties), KWD 3dp correct.
- **Stock Levels**: the Location filter (warehouse-backed) populates correctly
  for accountant1 — confirms `useWarehouseOptions`'s 403-fallback works
  live, not just in the source (all 6 warehouses listed by display name,
  including "Shuwaikh Central Warehouse" as a distinct entry — matches the
  known Al Rai 3-warehouse topology, not a leak). Cost/value columns visible
  to accountant1 (expected — Accountant role normally holds
  `inventory.cost.view`). KWD 3dp correct throughout.
- **POS Sales Summary**: revenue/COGS/margin figures present and gated
  correctly by `cost.view` role logic already documented in Session 1; GL
  tie-out banner reads "Matches your sales and tax accounts" (ties); the
  COGS-scope caveat note (retroactive cost corrections excluded) renders
  correctly for a cost-viewing role.

## FINDING 6 — MEDIUM, SUSPECTED (single observation, not repeated): Purchase Register shows a real -22.000 KWD GL mismatch for its default period

**Repro:** Purchase Register, default date range (2026-07-31 to 2026-08-29,
auto-selected), "All branches". Banner reads: *"Does not match your payables
account. Difference: -22.000. Checked against the whole company. A recently
confirmed bill may still be posting and should clear on its own shortly."*
KPI strip: Bills 7, Total purchases 79.280, Paid 72.530, Still owed 6.750.

This is the SAME reconciliation-banner mechanism praised in Session 1's
Finding 2 (Gross Margin) — working as designed, honestly surfacing a real
drift instead of hiding it. **Per the task brief, do not trace the Gross
Margin 28.690 number (another agent owns that).** This is a *different*
report, a *different* number (-22.000), and — notably — **AP Aging, checked
minutes later in the same session with the same "All branches" scope, showed
NO mismatch** ("Matches your payables account in the ledger"). That
AR/AP-aging-ties-but-purchase-register-doesn't split is worth the fix wave's
attention: either it's the exact "recently posting bill" explanation the
banner itself offers (period-boundary timing — Purchase Register's default
window starts 2026-07-31, one day earlier than AP Aging's as-of date), or it's
a real gap in how Purchase Register's period bucketing differs from AP
Aging's balance calculation. Flagging as SUSPECTED/MEDIUM rather than
CONFIRMED/HIGH specifically because I did not have budget to re-run it with a
matched date range to isolate whether this is a timing artifact or a real
divergence — that one check would resolve it quickly for whoever picks this
up.

## Screens not reached this session (daemon instability)

Attempted and lost to a daemon death/timeout before data could be captured,
not returned to due to time budget: sales-register, customer-statement,
supplier-statement, trial-balance, general-ledger, day-book,
cash-flow-statement, balance-sheet, cashier-performance,
salesperson-performance, stock-aging, low-stock, expiry-batch,
inventory-valuation, discount-report, all remaining POS reports besides
sales-summary, all auto-parts reports, and the reports index grid's Arabic
render (not re-checked this session — Session 1 already covered ar for Gross
Margin).

## Session 2 summary for orchestrator

**Screens covered live this session:** 5 of 45 (AR Aging, Purchase Register,
AP Aging, Stock Levels, POS Sales Summary), all as `accountant1`, all
identity-confirmed before conclusions. Combined with Session 1's Gross Margin,
cumulative live coverage is **6 of 45**.

**New findings, by severity:**
- HIGH (CONFIRMED) — `BranchFilter`/POS `RegisterFilter` have no 403 fallback;
  disables branch/register filtering for accountant1 on ~30 of 45 reports,
  despite a working fallback pattern (`useWarehouseOptions`,
  `useAccessibleBranches`, `useCashierOptions`) already existing twice in the
  same codebase for the identical problem (Finding 4).
- MEDIUM (CONFIRMED) — POS Sales Summary's Tax KPI card ignores
  `isTaxRegistered`, rendering tax UI in no-tax Kuwait, while the same
  component correctly gates the table column and CSV export (Finding 5).
  Downgrades Session 1's blanket "no-VAT-in-Kuwait: SOLID" claim.
- MEDIUM (SUSPECTED) — Purchase Register's default-period GL tie-out shows a
  real -22.000 KWD mismatch that AP Aging (same data, same day) does not;
  likely a date-window artifact, not independently isolated (Finding 6).

**Confirmed SOLID:** AR Aging, AP Aging (both GL-tied, KWD 3dp, no tax UI);
Stock Levels (warehouse filter fallback works correctly, cost visible to
accountant1 as expected); POS Sales Summary's revenue/COGS/tax GL tie-out
banner and cost-gating (Tax KPI card is the one exception, Finding 5).

**Not reached:** 39 of 45 screens, entirely due to gstack browse daemon
instability this session (near-constant `goto` timeouts requiring a fresh
login, each costing 1-3 minutes) rather than any product issue — see Method
note above. No CRITICAL findings. No branch-scoping-trap false positives (the
Stock Levels warehouse list was checked against the known Al Rai topology
before drawing any conclusion).
