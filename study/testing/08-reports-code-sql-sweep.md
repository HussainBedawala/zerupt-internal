# Phase G — Reports: code + SQL sweep (2026-08-29)

Method pivot from the two prior sessions: breadth driven from **code + SQL**, not the
browser. Every finding below was derived by reading the query service and running the SQL
against the live tenant, then comparing against the GL. Five family sweeps (financial 14,
inventory 9, purchase 6, sales 11, POS 8) plus two frontend-checklist sweeps closing the
gap the backend passes left open.

Ledger identity `0.000000` at open and close, 868 lines, unchanged — nothing wrote to the
tenant. Opening-balance journals untouched. Nothing committed.

Final gate: API typecheck clean · web typecheck clean · i18n all locales in sync.

## Fixed this session

| ID | Sev | Summary | Status |
|---|---|---|---|
| RPT-002 | MED | Arabic breadcrumbs untranslated on ~40 of 45 reports. `AutoBreadcrumbs` resolved labels from `breadcrumbs.json` (5 report slugs) independently of `report-registry.ts`, which already held complete translated titles. Fixed by DERIVING the label from the registry `titleKey` against the parity-checked `reports.json`, not by copying 40 strings into a second file. Guard test iterates every registry entry and asserts both locales resolve (47 tests). I additionally hardened the lookup with `tReports.has()` — the agent's unguarded `tReports(key)` would have rendered a raw i18n key path into the UI on a miss, which is the ROLE-002 defect | FIXED |
| RPT-008 | MED | Refund date dialogs defaulted from UTC; backend compared in UTC too, so a client-only fix would have looked correct and been worse. Fixed as a COORDINATED change: client onto the shared `todayIsoDate`, server onto `todayInZone(tenantTimeZone(...))`. No new helper on either side. Lower bound deliberately LEFT on UTC and commented: for a UTC+ tenant the UTC day is always <= the local day so it can never falsely reject, and it matches the dialog's `min` — localising only the server would make it stricter than the browser and rebuild the exact rejection this finding exists to prevent. 4 new tests at 22:30Z Kuwait-local; 29+40 jest, 3 vitest, both typechecks clean | FIXED |
| RPT-009 | MED | Stock Levels REPORT used strict `<` against `reorder_level` in 4 places while the Reorder screen, Low Stock report and shared `low-stock-metric.ts` all used `<=`. **261 rows sit exactly at the boundary** (6,462 strictly below vs 6,723 at-or-below) — two screens, one fact, opposite answers. Fourth body of a rule whose own header documents it was unified once already. Fixed by extracting one shared `atOrBelowReorderLevel` predicate | FIXED |
| RPT-009b | MED | FIFTH site: the operational Stock Levels SCREEN (`inventory/stock-levels/stock-levels.service.ts`) carried the same strict `<`. Migrated onto the shared predicate, which was MOVED from `reports/` to `inventory/shared/` so the dependency points DOWN rather than inverting the architecture rule. Repo-wide grep confirms no sixth copy | FIXED |
| RPT-010 | MED | Two surviving hand-copied UTC `today` helpers (`purchase-register.service.ts:172`, `open-purchase-orders.service.ts:302`) understated `daysOverdue` by one for the first ~3 hours of every Kuwait/India local day. Migrated onto `resolveReportAsOf`. Confirmed `daysOverdue` is display-only (never summed into a tie-out or export total), so MED not HIGH. The other 4 `toISOString().slice(0,10)` sites in the reports tree were CLASSIFIED and correctly left alone | FIXED |
| RPT-011 | HIGH | AR/AP Aging stamped the **unapplied** filter state onto exported bytes: behind a Generate gate, `asOf` (live input) drove the CSV filename, the PDF subtitle and the drill-through `toDate` while `applied.asOf` drove the rows. Change the date, don't click Generate, export: the file claims the new date over the old date's aging — a document a merchant hands to a bank. Fixed in the UNREPRESENTABLE shape: live state renamed to `asOfInput`, `asOf` rebound to `query.data?.asOf ?? applied.asOf`, so the wrong value is no longer reachable under the name a future author would type. Partial-scope banner now reads the response's `branchScope` | FIXED |
| RPT-012 | MED | VAT201 (UAE) and Tax Summary ROUTES were reachable in a no-VAT Kuwait tenant, VAT201 rendering AED at 2dp over KWD 3dp figures. **Partly WITHDRAWN**: the original finding claimed no server guard existed — false, `UaeCountryGuard` and `TaxRegistrationGuard` were already on both controllers, so data was always refused. Genuine defect was narrower: the route never consulted the registry, so a Kuwait user got a broken error-flashing screen instead of a clean bounce. Fixed structurally via one `ReportRouteGuard` deriving from the same `isReportVisible()` the index cards use. Only 2 registry entries carry `countries`/`requiresTaxRegistration`; both now wrapped | FIXED (partly withdrawn) |
| RPT-013 | HIGH | The reports slice re-introduced `EM_DASH = "—"` as the empty-value placeholder, returned by all four formatters — the exact regression `packages/shared/src/format/empty-value.ts`'s doc comment warns about by name. Migrated onto `EMPTY_VALUE_PLACEHOLDER`, local export DELETED, 3 further bare `"—"` literals found and fixed (z-report-history x2, top-sellers). Guard test fails if the export reappears | FIXED |
| RPT-014 | HIGH | Fitment Coverage exported the CURRENT PAGE only, filename literally `fitment-coverage-page-N.csv`, while its 3 siblings all fetch a full-filtered-set export endpoint. No such endpoint existed; added one — and `loadRows` already computed the whole filtered set internally and was slicing it away, so the fix is a slice removal | FIXED |
| RPT-015 | MED | 6 paginated reports blanked the whole panel — table AND the Prev/Next buttons — on every page click. `keepPreviousData` added to 5. General Ledger got Day Book's `isLoading && !cursor` gate instead, because GL rebuilds its whole `queryParams` on page turn (structurally cursor pagination). Correct patterns deliberately left alone | FIXED |
| RPT-015b | LOW | Category filter had no directory fallback while Branch/Warehouse/Register in the SAME file all did. Latent today (default roles hold both permissions) but a custom role with report access and no inventory view gets a permanently disabled filter. Fourth instance of the RPT-005 class. Fixed the sanctioned way: permission-free names-only `GET /tenant/item-categories/directory`, declared before the root route, minimal allowlist payload. **No permission widened** | FIXED |
| RPT-016 | MED | `formatQty` hand-rolled `Intl.NumberFormat` with a hardcoded `maximumFractionDigits: 6` — the exact anti-pattern the canonical `formatQuantity` documents. Delegated to the canonical helper. Also fixed stock-movement-ledger's CSV emitting raw unformatted qty while the screen formatted it | FIXED (see gaps) |
| RPT-017a | LOW | "90+ days" bucket label claimed day 90, which actually lands in 61-90. LABEL fix in 4 places, no bucketing math touched. Arabic was already correct | FIXED |
| RPT-017b | LOW | Balance Sheet never rendered its own `warnings[]`, so `BS_FISCAL_YEAR_OVERLAP` was silently dropped. cost-center-pl already rendered its warnings — copied that pattern | FIXED |
| RPT-017c | LOW | API shipped hardcoded English `"(unknown party)"` in AR/AP aging payloads, rendered verbatim, never translated. Now returns null; client renders the translated placeholder | FIXED |
| RPT-018 | **CRIT** | **Daily Sales counted POS refunds as SALES.** `posCompletedRange` filtered `status='completed'` with NO `type` filter, and a POS return stores a POSITIVE `grand_total`. 26 Aug reported 438.429 against a true 379.847 — the day's headline number overstated by 58.582 (~15%) — and Q3 shared the predicate, so a cash refund showed as cash TAKEN IN. Clean path divergence: every other POS-touching report discriminates on `type`; daily-sales was the sole holdout, and its own comment falsely promised it could "never show a different cash figure" than pos-payment-breakdown (they differed by exactly 29.291). FIXED: refunds excluded from sales, surfaced as their own `posReturns` column, subtracted once in Net Sales. Both reports now agree (`cash_agrees=true` both days) | **FIXED + live-verified** |
| RPT-019 | HIGH | `netSales = totalSales − totalVoids`, but a void flips status to `voided` so it had ALREADY left `posSales` — voids subtracted twice. `totalVoids` kept and still displayed (operationally interesting) but no longer deducted | FIXED (code-confirmed only, see gaps) |
| RPT-020 | HIGH | Sales Returns tie-out summed credit-note `total`/`subtotal` RAW against a functional-currency GL sum, while the same file converted correctly everywhere else. RPT-004 shape: the banner would lie, the rows were right. Now joins the credited invoice for the rate | FIXED |
| RPT-021 | HIGH | Five sales services summed foreign-currency document money with no conversion and no warning. Four fixed (`top-sellers`, `sales-by-item`, `gross-margin`, `parts-sales-by-brand`); `gross-margin`'s header claim that doc lines were "in functional currency too" was simply FALSE and was why the bug survived review | FIXED |
| RPT-021b | HIGH | Same gap in `daily-sales` Q5. Fixed. This file has no credit-note query at all, so no credited-invoice join was needed — checked rather than assumed | FIXED |
| RPT-022 | MED | Gross Margin's P&L scope note still told readers the report does NOT net sales discounts — the opposite of what the code does since the RPT-001 fix, on the exact number that was just corrected. Rewritten in both locales | FIXED |
| RPT-023 | MED | Salesperson Performance invoice leg included delivery income (4130) while the POS leg excluded it, inflating margin against a product-only COGS; its header claimed it mirrored gross-margin, untrue once a delivery fee exists. Legs made consistent | FIXED (code-confirmed only) |
| RPT-024 | LOW | `stripCost` duplicated across 4 controllers. **My brief called them "verbatim" — they were not**: 3 field lists, 2 contracts. Extraction became two helpers (`nullCostFields`, `omitCostFields`); salesperson keeps a 3-line wrapper because `cogsTrueUpTotal` is header-level, not a row field | FIXED |
| RPT-025 | LOW | `sumInvoiceArDebit` lacked the mirror predicate the list side applied. Chased as a candidate RPT-004 and found SAFE (a mirror emits no `sales.invoice.confirmed`). Predicate added belt-and-braces so the two sides cannot desynchronise | FIXED |
| RPT-026 | HIGH | **Sales by Item and Parts Sales by Brand omitted every POS counter sale** — 49.380 shown against a true 823.451, about 6% of the business, while Top Sellers beside them included POS and disagreed by ~17x. Founder decision: include POS. FIXED with a third additive leg copied from top-sellers' shape. Reconciliation I verified myself: POS net 774.071, 49.380 + 774.071 = **823.451 exactly**; parts lands 800.951, the 22.500 gap being POS revenue for items with no `part_details` row, correctly excluded by its inner join. Top Sellers now agrees **item by item**, sum of per-item absolute differences 0.000000 | **FIXED + live-verified** |

## Investigated and WITHDRAWN

- **Inventory valuation GL tie-out** — ties to merchandise_inventory 1141 within 0.00016 on
  9,490,014.101, and correctly values per (item, warehouse) as an ALLOCATION of the
  company-wide pool rather than a naive per-warehouse cost x qty. No bug.
- **`inventory.cost.view` stripping** — verified server-side (not merely UI-hidden) on
  valuation, movements, expiry-batch, purchases-by-item, landed-costs.
- **Fitment coverage has no branch scoping** — deliberate and documented: catalog tables
  have no branch column.
- **PUR-018 orphan AP is a reports blind spot** — it is not. AP Aging is GL-native and
  party-tag-driven, so it honestly includes the KWD 10.005; Purchase Register correctly
  excludes `lc` per its own inclusion test; Landed Costs surfaces the credit destination.
  The product-level issue is real, the reports layer is honest about it.
- **RPT-004 fix regressed / has a third call site** — no. Independent SQL: GL 57.28 +
  refundable 22.00 = report 79.28, exact. `sumConfirmedReturnRefundable` has exactly one
  body and two call sites.
- **RPT-001 fix missed a sibling** — clean sweep. Every sales report's revenue definition
  was tabulated against 4300; no second report carries the old wrong definition.
- **Sales Register gross-vs-net tie mismatch** — ties: both sides 61.725, void-proofing works.
- **POS reports mixing sale/return/void via bare `sourceDocumentType='pos'`** — none do;
  all seven discriminate on `pos_transactions.status`/`type`.
- **cashier-performance leaks a raw UUID** (POS-023 class) — it does not; the frontend
  resolves via `useUserMap()` with a non-UUID fallback and propagates `isError`.
- **Ungated tax UI across POS/purchase/sales** — all gated behind `isTaxRegistered`; the
  remaining reports contain no tax fields at all. RPT-006 had no siblings.
- **VAT201 has no server guard** — false, see RPT-012 above. Recorded because acting on it
  as written would have added a redundant guard and mis-stated the severity.
- **`stripCost` bodies are verbatim** — false, see RPT-024.

## Honest verification gaps

- **No voided POS transaction exists in this tenant** (17 completed sales, 1 completed
  return, 1 draft, zero voided). RPT-019's fix and POS void-proofness generally are
  structural inference plus unit tests, NOT live-proven.
- **RPT-026's double-count guard is unit-tested, not SQL-proven.** This tenant has ZERO
  mirror invoices, so no on-account POS sale exists to exercise it. The SQL reconciliation
  cannot distinguish a correct fix from one that would double-count on a tenant that sells
  on account — which is precisely why the mirror-exclusion assertion is pinned in the test
  rather than left to the fixture.
- **All FX findings are code-confirmed, never data-confirmed.** Single currency, one
  distinct rate (1.0), one credit note, zero delivery fees. Every FX fix is a verified
  numeric no-op here. This is why `sales-fx-basis.spec.ts` asserts compiled SQL SHAPE
  rather than values: the rate is a column, so a value test would pass against the defect.
  Red/green proven (strip the terms -> fail, restore -> pass).
- **quotation-conversion and unbilled-deliveries are code-trace only** — zero quotations,
  zero delivery orders. Neither has been exercised against a single live row. Not a pass.
- **RPT-023 (delivery fee) and RPT-020 (credit-note FX)** have no live rows: every invoice
  has `delivery_fee_net = 0` and every document is rate 1.
- **No browser pass was run this session.** RTL rendering, painted loading/error/empty
  states, and actual file-download behaviour are unverified for all 45 reports. The
  frontend findings are static-code conclusions about query-key and `isLoading` wiring.
- **`formatQty` precision gap named, not closed**: no report DTO carries per-item
  `quantityDecimals`, so all 16 call sites keep the "unknown precision" fallback — now in
  one shared place instead of a hand-rolled copy. Closing it properly needs backend DTO
  changes.
- Cash Flow Statement's operating/investing/financing classification was spot-checked, not
  traced account by account; the sub-agent covering it reported only 2 tool calls, so its
  conclusions there are low-confidence and deserve a second pass.

## New findings left OPEN (not fixed this session)

| ID | Sev | Summary |
|---|---|---|
| RPT-027 | MED | `purchases-by-item` Supplier picker calls the permissioned `GET /suppliers` with no directory fallback, while a `GET /suppliers/directory` already exists. Fifth site of the RPT-005 class. Latent for default roles |
| RPT-028 | MED | `sales-by-item` resolves day boundaries in the tenant timezone; `parts-sales-by-brand` hardcodes `"UTC"`. The two disagree at range edges, and now that both include POS (whose tickets cluster in local evening hours) the edge effect is LARGER than before |
| RPT-029 | MED | `bill-export.service.ts:355` computes `daysOverdue` from UTC "today" — same class as RPT-010, outside the reports tree |
| RPT-030 | LOW | ~12 further "today from UTC" business-date defaults found repo-wide during the RPT-008 blast-radius sweep (write-offs, promotions, batches, exchange rates, inventory reconciliation, POS, opening-balance imports, `promo-engine.ts`). Each is a separate module's default and needs its own decision |
| RPT-031 | LOW | Aging as-of has no SERVER-side future-date guard (client `max` only), while Trial Balance guards it server-side via `assertNotFutureDated`. Divergent posture on the same axis |
| RPT-032 | LOW | Statement PDF export is a page-only DOM snapshot, so a multi-page statement exports incomplete. The CSV path is genuinely full-range and is the sanctioned path; flagged because a merchant could hand out a short PDF without noticing |
| RPT-033 | LOW | `ErrorState` renders identically for a 403 and a 500, and retrying a 403 loops forever. Systemic across the reports module, not specific to one family |

## Stale tests found pinning defects (running total: 6 this session)

1. `deriveStatus("10","10") === "OK"` (stock-levels REPORT) — pinned RPT-009.
2. `deriveStatus("20","20") === "OK"` (stock-levels SCREEN) — pinned RPT-009b.
3. + 4. `toBe("(unknown party)")` in ar-aging and ap-aging specs — pinned RPT-017c,
   asserting the API should ship English copy.
5. `netSales === "-300.000000"` for a void-only day — pinned RPT-019, asserting a day with
   no sales and one void reports NEGATIVE net sales.
6. `netSales === "1600.000000"` with the comment `// netSales: 1800 - 200 = 1600` — pinned
   RPT-019 at the totals level.

Every one was classified before being changed. No snapshot was bulk-regenerated.
