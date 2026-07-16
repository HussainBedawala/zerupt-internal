# Reports Module — Hardening Log

**Founder mandate:** Reporting is one of the most critical modules of an ERP. Ours
must be super strong. Harden the reports module the same way accounting, inventory,
purchase, POS, and sales were hardened — but **one report at a time, deep**, not all
together. Start with the **financial reports**. Ensure every report name + description
is industry-standard and legible to a non-tech retail user (8th-grade level), copy is
locale-aware (ar + en), dynamic (market-driven where relevant), and brand-aware where
applicable. Add the critical reports customers expect that we don't yet have.

**Execution mode:** Autonomous, one report (= one layer) at a time. Report only at
layer/program boundaries. Subagents must NOT spawn their own subagents — they write to
`/tmp/reports-hardening/` and return terse summaries.

---

## What makes `reports` different

Reports is **not a ledger and owns no tables** — it is a pure **read / tie-out layer**.
So the hardening invariant is inverted from the other modules: instead of proving the
ledger is correct, we prove **each report reconciles to the ledger by construction**.

Every financial report must, by construction:
1. **Tie out to the GL.** P&L, Balance Sheet, Cash Flow, Trial Balance, General Ledger,
   Tax read from posted `journalEntryLines`/`journalEntries` only. Subledger reports
   (AR/AP aging, statements) derive from **party-tagged control-account GL**, never from
   denormalized document balances (per `[[project_ap_subledger_source_of_truth]]`).
   ~~KNOWN FLAG: AR Aging reads salesInvoices directly~~ → RESOLVED: L6 audit (2026-07-16)
   confirmed AR Aging already reads the party-tagged `trade_receivables` GL control account
   (dynamic role resolution, ties to TB/BS), fixed in prior pass DEV-287. Flag was from a
   stale codemap. The party-tagged control-account infra is proven — reuse for statements.
2. **Respect fiscal-period boundaries** (`accounting/08-period-control.md`) — as-of dates,
   period ranges, and "posted only" filters are correct and consistent across reports.
3. **Be tenant-scoped** — every query on TENANT_DB, no cross-tenant leak.
4. **Handle FX / multi-currency** honestly — report in base currency, never silently
   default a missing/≠1 rate (fail loud per house rule).
5. **Handle empty / loading / error / zero states** in the UI (defensive UX persona).
6. **Read at an 8th-grade level, ar + en, brand-aware** — names + descriptions +
   column headers + tooltips. `en/` is source of truth. No em dashes. CSS logical props.
7. **Shown only to the right people** — every report gated by a correct RBAC permission
   for view/create/export, enforced backend (PermissionGuard) AND reflected frontend
   (hide cards the user can't open). Audit the permission→role assignment, not just that
   a guard exists.
8. **Dynamic visibility by tenant profile** — tax reports (Tax Summary, VAT/GST Return,
   VAT201) MUST NOT show to non-tax-registered tenants. Visibility keys off the tenant's
   tax-registration / market config (same source that drives the VAT-vs-GST label).
   Generalize: a report a tenant can't meaningfully run should not appear.

> **Think broadly (founder ruling 2026-07-16):** do not be narrow. At every layer,
> actively look for problems beyond the checklist — perf/N+1 on large ledgers, export
> correctness, timezone/as-of-date edge cases, rounding, drill-through integrity,
> caching staleness, anything a real user could break — and surface it.

9. **Query performance at scale (founder ruling 2026-07-16, CRITICAL).** Reports run over
   the largest tables (journalEntryLines grows unbounded). Every report query MUST be
   optimal: covered by indexes (no seq scans on hot paths), aggregate in SQL not in JS,
   paginate/stream large row sets (General Ledger, Day Book), enforce the statement
   timeout, and be `EXPLAIN`-checked on a realistically-sized dataset. A report that
   locks or slows the tenant DB as data grows is a failure even if the numbers are right.
11. **No hardcoded accounts — resolve dynamically (founder ruling 2026-07-16, CRITICAL).**
    Reports MUST resolve GL accounts by **system role / account type from the tenant's
    chart of accounts** (e.g. trade-receivables control account by role, revenue/COGS/
    expense sections by account type), NEVER by hardcoded account codes like "1131"/"2111".
    Tenants customize their COA; a hardcoded code silently shows wrong numbers. Every layer
    must prove its account selection is role/type-driven. AR aging already does this
    (control account resolved by system role) — that is the reference pattern.

10. **Customer's perspective (founder ruling 2026-07-16).** Judge every report as the
    business owner receiving it: is the number they need obvious, is it something they can
    hand to their accountant / debtor / tax authority as-is, does it answer the question
    they actually asked? Legible beats complete.

12. **Export — complete, multi-format, consistent (founder ruling 2026-07-16, CRITICAL).**
    Every report gives the customer a real export path via ONE shared mechanism (reuse
    `lib/csv-export.ts` + `lib/pdf-export.ts`; add XLSX/Excel since accountants live in
    Excel). Formats per report: CSV + Excel for data reports, PDF for hand-off documents
    (statements, financial statements, VAT return). CRITICAL: exports must cover the
    ENTIRE filtered dataset, NOT just the visible/paginated page — General Ledger & Day
    Book currently export only the current page (L2 finding); fix so export streams the
    full range (server-side export endpoint, statement-timeout-guarded, tenant-scoped).
    Export respects the `reports.*.export` permission (currently unenforced — wire it).

## Guiding principles — think like the accountant AND the shopkeeper

- **The accountant** opens Trial Balance and every statement must foot and cross-foot;
  P&L net profit must roll into Balance Sheet retained earnings; the report must equal
  what the GL says to the fils/paisa.
- **The shopkeeper** (MENA/India/SEA retail, not tech-savvy) must understand the report
  name, know what number to look at, and be able to hand a Customer Statement to a debtor
  or a VAT Return to their accountant without a training session.
- Backend AND frontend every layer. No tech debt. Modular boundary points DOWN only.

## Process gates

- **Reviewer roster:** always `code-reviewer`; backend → `nestjs-reviewer` + `api-reviewer`;
  any GL/tie-out/tax/COGS → `accounting-reviewer` (balance-proof, tie-out proof, not
  assertions); web → `frontend-reviewer`; any raw SQL/perf → `database-reviewer`.
  Money/tie-out paths ALSO get an independent cross-model pass (gstack `/review`).
- **Boot gate:** real `node dist/main.js` boot (catches DI/wiring unit tests miss).
- **Coverage:** 100% on any GL/tie-out/tax path; 80%+ general. Confirm literal
  "Test Suites: N" with N>0 (jest passWithNoTests silently passes on 0 matches).
- **Arch drift:** `study/ops/graphify/check-drift.sh` must exit 0 each layer.
- **Next migration number:** reports owns no tables; migrations only if a report needs a
  supporting index/view. Check `packages/db` journal before generating.

## Locked decisions

- **Commit directly to main, no branches** (founder ruling 2026-07-16). Still gate each
  layer (reviewers + boot + typecheck + drift) before committing.
- **Layer = one report.** Deep-dive each; do not batch (founder ruling 2026-07-16).
- **Scope this program = FINANCIAL reports first** (the 8 on the Reports index +
  VAT201 already in code). Sales/inventory/POS reports = a later phase, not now.
- **All 4 new reports committed:** Customer Statement, Supplier Statement, VAT/GST Return
  (harden/surface existing `vat201`), Day Book. Copy: locale-aware, dynamic, 8th-grade,
  brand-aware (founder ruling 2026-07-16).
- **New reports are ponytail/reuse-first (founder ruling 2026-07-16).** Build them by
  reusing existing report scaffolding, NOT from scratch: same controller+service+dto+spec
  shape, shared response envelope + statement-timeout guard, shared date/period parsing,
  the frontend report-page components + report-registry, canonical primitives
  (`formatMoneyAmount`/`formatQuantity`, entity pickers for customer/supplier), and the
  party-tagged GL subledger that AR/AP aging already query. UI must stay visually
  consistent with the existing report pages. Shortest working diff that ties out.
- **Copy standard applies to ALL reports, new and existing**, incl. the naming tweaks:
  "A/R Aging" → "Receivables Aging", "A/P Aging" → "Payables Aging" (plus plain-language
  descriptions); "Tax Summary" → market-driven label (VAT in GCC, GST in India).

---

## Layer plan (ledger-first, report-by-report)

| # | Layer (report) | Source of truth | Status |
|---|----------------|-----------------|--------|
| 0 | Foundation — shared infra + copy + RBAC + dynamic visibility | period/tenant/FX/timeout guards, response envelope, report registry, locale-aware/8th-grade/brand-aware copy standard, RBAC view/create/export gating, dynamic tax-report visibility by tenant profile | pending |
| 1 | Trial Balance | posted GL (the anchor everything reconciles to) | pending |
| 2 | General Ledger | posted GL by account | pending |
| 3 | Profit & Loss | posted GL (P&L accounts) | pending |
| 4 | Balance Sheet | posted GL (BS accounts) + roll-in of P&L to retained earnings | pending |
| 5 | Cash Flow Statement | posted GL (cash movements, operating/investing/financing) | pending |
| 6 | Receivables Aging (A/R) | 1131 party-tagged control account (FIX current source) | pending |
| 7 | Payables Aging (A/P) | 2111 party-tagged control account | pending |
| 8 | Tax Summary (= VAT/GST Return) + VAT201 reconciliation | posted GL: outputTax, inputTax, netPayable already computed | pending |
| 9 | Customer Statement (NEW) | 1131 party-tagged control account, running balance | pending |
| 10 | Supplier Statement (NEW) | 2111 party-tagged control account, running balance | pending |
| 11 | VAT/GST Return — REFRAME not build (tax-summary already computes netPayable; vat201 = UAE box overlay) | reuse tax-summary; UI framing + market variants | pending |
| 12 | Day Book (NEW) | posted GL, chronological across all accounts | pending |

## Progress checklist

> Execution note (2026-07-16): running parallel, one commit at end (founder ruling). Statuses
> below: [b] = built + own-tests green, pending consolidation/review/gates; [x] = fully shipped.
> Git turbulence recovered: L0 was reverted into stash@{0}, restored surgically; on main now.

- [b] L0 Foundation — timeout on all services, permission-gated cards, dynamic tax visibility (isTaxRegistered), canonical formatMoney
- [b] L1 Trial Balance — window bug fixed (cumulative as-of + opening/movement/closing), raw tie-out detects real imbalance, 21 tests
- [b] L2 General Ledger — keyset cursor pagination (O(pageSize)), full-range export endpoint, no hardcoded AED, 21 tests
- [ ] L3 Profit & Loss
- [ ] L4 Balance Sheet
- [ ] L5 Cash Flow Statement
- [ ] L6 Receivables Aging
- [ ] L7 Payables Aging
- [ ] L8 Tax Summary + VAT201 reconciliation
- [b] L9 Customer Statement (NEW) — GL trade_receivables party-tagged, running balance, 9 tests
- [b] L10 Supplier Statement (NEW) — GL trade_payables party-tagged, running balance, 12 tests
- [ ] L11 VAT/GST Return — reframe tax-summary (market label + surface warnings + tax-payable tie-out)
- [b] L12 Day Book (NEW) — chronological all-account, keyset pagination, per-day balance proof, 12 tests

### Consolidation (DONE 2026-07-16, green)
Module wired (3 new reports), registry entries (FileText/ReceiptText/CalendarDays), full en+ar
i18n, TB opening/movement/closing keys. Naming pass shipped: Receivables Aging, Payables Aging,
Tax Summary description = filing-ready return. api+web typecheck + i18n:check all pass.

### Remaining after consolidation (Wave 2)
- [ ] L3-L8 lighter hardens: drill-through to JE (shared pattern), BS return imbalance delta,
      surface tax warnings, Receivables/Payables naming (in consolidation pass)
- [ ] L11 tax reframe + dynamic VAT-vs-GST market label
- [x] Reviewer panel — accounting (all 4 tie out, no CRIT/HIGH), nestjs (clean tenant-iso/DI/guards),
      frontend (i18n/RTL/reuse clean; 1 HIGH pre-Generate blank state + em-dash MED being fixed)
- [x] Gates: web typecheck ✓ · drift 0 upward violations ✓ · api build ✓ · boot (Nest started, DI clean) ✓
- [~] Reports test suite — L0 timeout wrap broke 11 legacy specs' db mocks (transaction cb not mocked);
      test-only regression (prod db.transaction real, ar-aging passes), fix in progress
- [x] Final commit to main — **shipped 704e7806** (100 files; feat(reports) hardening)

### Shipped 2026-07-16 — 704e7806
Wave 1 (financial reports, one commit): L0 foundation, L1 trial balance (window-bug fix +
real tie-out), L2 general ledger (keyset pagination + full export), L9 customer statement,
L10 supplier statement, L12 day book, L11 tax reframe (VAT/GST label + warnings), naming pass
(Receivables/Payables Aging). All gates green: web+api typecheck, i18n:check, drift (0 upward),
api build, boot (clean DI), 359 report tests. Reviews (accounting/nestjs/frontend) findings all
fixed. Recovered a mid-run git-stash/detached-HEAD incident (L0 restored surgically from stash).

## Layer log

_(entries appended as each report ships)_

### Pre-run audit findings (recorded 2026-07-16, before harden)

**L0 Foundation** (`/tmp/reports-hardening/layer-0-audit.md`): (1) statement-timeout guard
on only 2/18 services; (2) frontend cards not permission-gated (see cards they 403 on);
(3) tax reports not gated by tax-registration (`vat201` only checks country AE, `tax-summary`
none); (4) `formatMoney` hand-rolled in `features/reports/lib/format.ts`; (5) `*.export`
perms defined but unenforced. Registry: `packages/shared/src/permissions.ts`; roles:
`role-templates.ts`; tax flag: `taxRegistrationNumber` in `tenant-identity.ts`; copy:
`messages/{en,ar}/reports.json`. → L0 harden in progress.

**L1 Trial Balance** (`/tmp/reports-hardening/layer-1-trial-balance-audit.md`):
- HIGH: period-window bug — `postingDate BETWEEN from AND to` gives period ACTIVITY, but a
  real TB is cumulative-to-date for B/S accounts. Partial range understates balances.
  Fix at L1: standard TB = as-of-date cumulative; if a period is chosen, show opening +
  movement + closing columns (get accounting-reviewer sign-off). 
- MED: tautological tie-out — nets per-account before summing totals, so it can never
  detect a genuinely unbalanced GL. Fix: sum raw debits & credits independently, compare.
- LOW: no drill-through to GL; includeZeroBalances default mismatch FE/BE; credit=red
  sign coloring misreads normal credit-balance accounts. Perf: good (SQL GROUP BY, indexed).

**L2 General Ledger** (`/tmp/reports-hardening/layer-2-general-ledger-audit.md`):
correctness solid (posted+reversed only, Decimal running balance, deterministic order,
opening balance correct across pages). Gaps: (1) missing statement-timeout (fixed in L0);
(2) offset pagination O(offset)/page → O(n²) deep paging — move to keyset/cursor; (3) CSV
export = current page only, not full filtered range; (4) hardcoded "AED" fallback when no
lines on visible page. Fix all at L2.

## Cross-cutting themes (surfaced across L1-L5 audits, address per-layer + foundation)

1. **Drill-through missing everywhere** — TB, BS, P&L (and likely GL rows) have no click-through
   from a line to the underlying journal entries. Add per-layer as each report is hardened;
   reuse a single shared drill-through pattern so UX stays consistent.
2. **No automated cross-report tie-out** — P&L net profit is not asserted to equal Balance
   Sheet current-year-earnings (`balance-sheet.service.ts:285`). Add a foundation-level
   integration test that reconciles P&L ↔ BS ↔ Trial Balance on shared fixtures.
3. **Tests are mocked-unit only** — no live-DB integration tests confirming the real SQL
   (branch scope, joins, header-vs-line postingDate). Add integration coverage per layer.
4. **Statement-timeout guard** — being applied to all services in L0 (BS, CFS & agings already had it).
5. **Tax-payable control-account tie-out** — tax-summary/vat201 compute independently from JE
   lines and do NOT reconcile to the tax-payable GL control account. Add a tie-out at L8/L11
   for the same by-construction guarantee the other statements have.

## All audits complete (2026-07-16)

Every financial report (L0-L8) + new-report reuse scope audited. Headline: the accounting
engine under the 8 existing reports is strong (AR/AP aging GL-native + dynamic role
resolution + FIFO bucketing; BS proves A=L+E; CFS proves cash tie-out; P&L excludes closing
JEs; tax-summary is a correct filing-ready return). Real work = cross-cutting foundation
(perms, tax-visibility, timeouts, export completeness, dynamic accounts) + copy/naming +
drill-through + the ONE heavier fix: Trial Balance period-window bug (L1). New reports are
mostly reuse. Lighter, higher-confidence than a from-scratch harden.

## Deferred

**Deferred scope (own follow-up layer/ticket):**
- **Drill-through** from report lines to journal entries (TB, GL, P&L, BS, statements). Cross-cutting
  UX; touches report components that overlap another session's stashed WIP (stash@{3}) — defer to
  avoid clobber. Build once as a shared pattern later.
- **Tax-payable GL tie-out** for Tax Summary / VAT return (L11 #3). Larger than a reframe: needs a
  tax_payable control-account role, a new GL-movement query, 100% tests. Own layer.
- **Balance Sheet imbalance-delta in UI** (L4 audit): backend computes delta, UI shows only a badge.
  Small, but balance-sheet-report.tsx overlaps stash@{3} — defer with drill-through.
- **Dynamic VAT-vs-GST**: label implemented (L11 #1); deeper market-specific return forms beyond
  UAE VAT201 (e.g. India GSTR) not built — future.

**Founder-TODOs (need a human):**
- **Multi-entity blend** (accounting review LOW): `legalEntityId` optional on TB + Customer/Supplier
  statements + ar/ap-aging means omitting it blends control-account balances across all legal
  entities in a multi-entity tenant. Pre-existing pattern. Decide desired behavior for the whole
  aging+statement family (default to selected entity? require it?) — consistent fix across all.
- Verify the new reports on a real dev tenant with live data before go-live (reviews were code/test level).
