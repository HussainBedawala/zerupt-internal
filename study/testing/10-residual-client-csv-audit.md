# Residual audit gap — client-side CSV vs `@AuditedExport` server routes

Task: close the "path divergence" gap flagged by two prior sessions — a suspected list of ~24
report screens under `apps/web/src/features/reports/components/reports/` that use a client-side
`buildCsv`/`downloadCsv` builder while an `@AuditedExport`-decorated server route sits unused next
to them, plus a wider ~90-file surface across `apps/web/src/features/**`.

**Headline finding: the ~24-screen list from the prior sessions was a false positive.** On
file-by-file verification, every one of the 24 (plus 2 more checked for the same reason,
goods-received and inventory-valuation) already fetches its CSV data through the
`@AuditedExport`-decorated server route — the `buildCsv`/`downloadCsv` grep signal the prior
sessions used (buildCsv present + no matching function in the single centralized
`reports/api/reports-api.ts`) missed that most of these reports have their **own dedicated
per-report `api/<name>-queries.ts` + `api/<name>-api.ts` files**, each with its own
`fetchXExport` function that DOES call the audited `/export` route. `buildCsv` still runs
client-side in every case — that part is fine and intended (the decorator only needs to see the
network call, not the CSV serialization) — the earlier finding conflated "client builds the CSV
string" with "client never calls the audited endpoint," which are different things.

No rewiring was needed or performed on any of the 24 (bucket A is empty). Per method rule 1
(a green code-read is not proof), I did not stop at code reading — see the "Live proof" section
below for authenticated-curl + SQL confirmation on 3 representative screens.

## Method

Code reading (component → query hook → api fetch function → backend controller decorator),
scoped greps under `apps/web/src/features/**` and `apps/api/src/**`, then authenticated curl
(`study/testing/_tools/tok.sh`) against the live API + direct SQL against the Gulf Auto Parts
tenant DB for the live-proof step. Ledger identity gate (`sum(debit-credit)` over posted+reversed
JE lines) confirmed `0.000000` before and after (no writes were made — read-only investigation,
zero screens needed rewiring). No documents created, so `_documents-created.md` has no new rows
from this pass.

## Bucket table

### The originally-flagged 24 (+2 checked for the same reason) — ALL bucket C

| Screen | Data-source hook | Underlying fetch | Hits `/export` route? |
|---|---|---|---|
| goods-received-report.tsx | `useGoodsReceivedReportQuery` (view) + `fetchGoodsReceivedExport` (export click) | `fetchGoodsReceivedExport` | YES — `GoodsReceivedExport` |
| pos-sales-summary-report.tsx | view query + `fetchPosSalesSummaryExport` on click | same | YES |
| pos-discounts-report.tsx | view query + `fetchPosDiscountsExport` on click | same | YES |
| discount-report.tsx | view query + `fetchDiscountReportExport` on click | same | YES |
| unbilled-deliveries-report.tsx | view query + `fetchUnbilledDeliveriesExport` on click | same | YES |
| stock-aging-report.tsx | `useStockAgingQuery` — **the on-screen query itself is `fetchStockAgingExport`** (no pagination UI, comment explains why) | same | YES — fires on every filter change, not just Export click (design choice by a prior agent, not a new finding) |
| parts-stock-velocity-report.tsx | `usePaginatedPartsStockVelocityReportQuery` (view) + `exportQuery` = `usePartsStockVelocityReportQuery` → `fetchPartsStockVelocityExport` (export click, `exportRows`) | export click uses `exportQuery.data` | YES |
| stock-movement-ledger-report.tsx | view query + `fetchStockMovementLedgerExport` on click | same | YES |
| fitment-coverage-report.tsx | `useFitmentCoverageReportQuery` (view) + `useFitmentCoverageExportQuery` → `fetchFitmentCoverageExport` (export, `exportQuery.refetch()`) | same | YES |
| day-book-report.tsx | view query + `fetchDayBookExport` on click | same | YES |
| parts-sales-by-brand-report.tsx | `usePartsSalesByBrandReportQuery` — **the on-screen query is `fetchPartsSalesByBrandExport`** (same no-pagination pattern as stock-aging) | same | YES |
| purchase-returns-report.tsx | view query + `fetchPurchaseReturnsExport` on click | same | YES |
| pos-cash-variance-report.tsx | view query + `fetchPosCashVarianceExport` on click | same | YES |
| pos-refunds-voids-report.tsx | view query + `fetchPosRefundsVoidsExport` on click | same | YES |
| open-purchase-orders-report.tsx | view query + `fetchOpenPurchaseOrdersExport` on click | same | YES |
| low-stock-report.tsx | `usePaginatedLowStockReportQuery` (view) + `exportQuery` = `useLowStockReportQuery` → `fetchLowStockExport` (export, `exportRows`) | same | YES — **live-verified below** |
| purchases-by-item-report.tsx | `usePurchasesByItemReportQuery` — on-screen query is `fetchPurchasesByItemExport` | same | YES |
| expiry-batch-report.tsx | paginated view query + `exportQuery` = `useExpiryBatchReportQuery` → `fetchExpiryBatchExport` | same | YES |
| inventory-valuation-report.tsx | `useInventoryValuationExportQuery` → `fetchInventoryValuationExport` | same | YES |
| sales-returns-report.tsx | view query + `fetchSalesReturnsExport` on click | same | YES |
| landed-costs-report.tsx (report, not the purchase-module dialog) | `useLandedCostsReportQuery` → `fetchLandedCostsExport` | same | YES |
| gross-margin-report.tsx | `useGrossMarginReportQuery` → `fetchGrossMarginExport` | same | YES |
| purchase-register-report.tsx | view query + `fetchPurchaseRegisterExport` on click | same | YES |
| sales-by-item-report.tsx | `useSalesByItemReportQuery` → `fetchSalesByItemExport` | same | YES — **live-verified below** |
| sales-register-report.tsx | view query + `fetchSalesRegisterExport` on click | same | YES |

**24/24 confirmed bucket C.** Two more checked for the identical reason (buildCsv present,
server route exists) also came back bucket C: `goods-received-report.tsx`,
`inventory-valuation-report.tsx` (both listed above).

### Wider ~90-file surface (`apps/web/src/features/**`, spot-checked beyond the reports family)

| Screen | Verdict | Evidence |
|---|---|---|
| `inventory/components/items-export-dialog.tsx` | C | `fetchItemsExportCsv` → `/tenant/items/export` |
| `journal-entries/components/journal-entries-export-dialog.tsx` | C | `fetchJournalEntriesExportCsv` |
| `inventory/components/stock-levels-panel.tsx` | C | `fetchStockLevelsExportCsv` |
| `pos-transactions/components/pos-transactions-list-panel.tsx` | C | `fetchPosTransactionsExport` → `/tenant/pos/transactions/export` — **live-verified below** |
| `general-ledger/components/general-ledger-panel.tsx` (uses `general-ledger/lib/csv-export.ts`) | C | `fetchGeneralLedgerExport` |
| `purchase/components/suppliers-export-dialog.tsx` | C | `fetchSuppliersExportCsv` |
| `delivery-orders/.../delivery-orders-export-dialog.tsx` | C | `fetchDeliveryOrdersExportCsv` |
| `inventory/components/batches/batch-export-dialog.tsx` | C | `fetchBatchesExportCsv` |
| `purchase/components/returns/returns-export-dialog.tsx` | C | `fetchReturnsExportCsv` |
| `sales/components/direct/direct-sales-export-dialog.tsx` | C | `fetchDirectSalesExportCsv` |
| `quotations/components/quotations-export-dialog.tsx` | C | `fetchQuotationsExportCsv` |
| `purchase/components/landed-costs/landed-costs-export-dialog.tsx` | C | `fetchLandedCostsExportCsv` |
| (by extension, not individually opened this pass — same file-naming/import pattern: `adjustments-export-dialog.tsx`, `reorder-export-dialog.tsx`, `serial-number-export-dialog.tsx`, `stock-counts-export-dialog.tsx`, `transfers-export-dialog.tsx`, `invoices-export-dialog.tsx`, `bills-export-dialog.tsx`, `direct-purchase-export-dialog.tsx`, `grns-export-dialog.tsx`, `orders-export-dialog.tsx`, `payments-export-dialog.tsx`) | SUSPECTED C | Not opened individually — flagged as a follow-up to independently confirm, but every one of the 11 dialogs actually opened this pass and the prior sessions' 24-screen accounting/reports pass followed the identical `fetchX­ExportCsv`-from-server-route pattern with zero exceptions found, so the prior is high |
| `customers/components/customers-list-panel.tsx` | **B** | `buildCsv` from `fetchCustomers` (plain list endpoint). No `AuditedExport`/export controller exists anywhere under `apps/api/src/customers`. Genuinely unaudited — no server route to rewire to. |
| `purchase/components/suppliers-list-panel.tsx` | **B (distinct feature, not a duplicate of the dialog)** | `handleExportSelected()` builds CSV from already-loaded on-screen rows filtered to the checkbox selection — a different feature ("export selected page rows") from the full-dataset `suppliers-export-dialog.tsx` (bucket C) that sits on the same screen. No server route exists for a selection-scoped export. Not rewired: building one would be new server surface, out of this task's "no new routes" scope. |
| `purchase/components/overview/ap-aging-table.tsx` | **B** | `buildCsv` from locally loaded AP aging rows. `apps/api/src/reports/ap-aging.controller.ts` has only `@Get("ap-aging")` — **no export route at all** exists server-side (unlike its sibling AR Aging, which was the prior session's fix target and does have one). Genuinely unaudited, no route to rewire to. |
| `opening-balance/components/opening-balance-review.tsx` | **B** | `buildCsv` from in-memory onboarding-wizard review data. No `opening-balance` export controller exists. This is a one-time onboarding review screen rather than a recurring report; still technically an unaudited egress of financial data. |
| `accounts/lib/export-coa-csv.ts` (used by `accounts-panel.tsx`) | **B** | `buildCsv` from the in-memory chart-of-accounts tree. No COA/accounts export controller exists under `apps/api/src/accounts`. |

## Why nothing was rewired

Bucket A (client CSV + an EXISTING, unused, matching server `@AuditedExport` route) came back
**empty** across every screen checked — both the originally-flagged 24 and the wider spot-check.
The rewiring instructions in the task (steps 2-3: copy the trial-balance/ar-aging pattern, extract
a shared helper if 2+ screens need the identical fix) therefore had no target. Per the task's own
instruction not to build new server routes, the 5 genuine bucket-B screens found
(`customers-list-panel`, `suppliers-list-panel`'s selected-rows export, `ap-aging-table`,
`opening-balance-review`, chart-of-accounts export) are reported, not fixed.

## Live proof (3 screens, authenticated curl + SQL — CONFIRMED)

Used the session's existing working API access (`study/testing/_tools/tok.sh`), hitting the exact
routes the frontend components call, then querying `audit_log` directly. This corroborates the
code-reading conclusion per method rule 1 (a green trace through the code is not itself proof).

```
T=$(bash study/testing/_tools/tok.sh accountant1)
curl -s -H "Authorization: Bearer $T" -H "x-tenant-slug: gulf-auto-parts" \
  "http://localhost:3001/api/v1/tenant/reports/low-stock/export?legalEntityId=<LE>" → HTTP 200
curl -s ... "http://localhost:3001/api/v1/tenant/reports/sales-by-item/export?legalEntityId=<LE>&dateFrom=2026-01-01&dateTo=2026-08-30" → HTTP 200

T=$(bash study/testing/_tools/tok.sh owner)   # accountant1 got 403 on pos/transactions/export — correct RBAC, not a bug
curl -s ... "http://localhost:3001/api/v1/tenant/pos/transactions/export?dateFrom=2026-01-01&dateTo=2026-08-30" → HTTP 200
```

```sql
select entity_type, action, user_email, created_at from audit_log
where entity_type in ('LowStockExport','SalesByItemExport','PosTransactionsExport')
order by created_at desc limit 6;
--       entity_type      | action |                    user_email                     |          created_at
-- PosTransactionsExport  | export | anonymator8@gmail.com                             | 2026-08-30 09:39:52.928559+00
-- SalesByItemExport      | export | accountant1@gulf-auto-parts-mt5kya1i.zerupt.local | 2026-08-30 09:39:39.796146+00
-- LowStockExport         | export | accountant1@gulf-auto-parts-mt5kya1i.zerupt.local | 2026-08-30 09:39:25.339108+00
```
Three fresh rows landed within seconds of the calls, correct actor, correct action, correct
entity type. **CONFIRMED**: these three screens' export path — the exact live network path the
React component's own query hook uses to render *and* export — writes to `audit_log`.

**File-content spot-check (founder's standard — export must be useful, not just audited):**
`sales-by-item/export` response row: `{"sku":"GAP-ELEPLG-02171","qtySold":"2.000000",
"grossRevenue":"133.268000","cogs":"99.218000","marginAmount":"34.050000",...}` — money fields
carry full underlying precision from the DB; the component formats them through
`formatCsvMoneyCell(value, currency)` which resolves KWD to 3 decimals (not a raw 2dp truncation),
matching the tenant's KWD-3dp requirement. No raw UUIDs in the exported row (SKU + name, not
`dimensionId`). CONFIRMED for this row; not opened for every one of the 24 screens' output files
individually (would require opening the browser for each) — the shared `formatCsvMoneyCell`
primitive being used uniformly across all 24 (confirmed by the earlier grep of each file) is why
this is treated as a class property rather than re-verified per screen.

Browser click-through (as opposed to authenticated curl) was **not** attempted this session — the
shared gstack browse daemon was reported crashing/contended by concurrent sessions per the task
brief, and the curl+SQL method above is the same one the prior two sessions in this programme used
successfully for the original Trial Balance / AR Aging proof, so it was preferred over risking a
daemon hang. Mark the specific "clicked the Export button in the browser" claim SUSPECTED (not
independently observed via `/browse`); the underlying network-call-writes-audit-row claim is
CONFIRMED via the identical HTTP request the button issues.

## Test to pin this class

**Not written.** Reasoning: the mechanical guard that would pin "a report screen with an
available `@AuditedExport` route must not build its CSV from the plain view endpoint" needs to
statically resolve, per screen, "which query hook feeds the CSV builder" and "does that hook's
`queryFn` reach an audited route" — which requires cross-file resolution (component → hook →
fetch-function → URL string) that a lint-style regex cannot do reliably, and the one time a similar
regex-based guard was written in this programme (`audited-never-on-get.spec.ts`'s new export-route
block, `10-residual-audit.md` step 4) it took two rounds of live false positives to get right even
scoped to a single file's decorators, a much simpler shape than tracing across 4 files per screen.
Given this pass found the class **not actually present** (bucket A is empty), writing a guard
against a defect that doesn't currently exist, without being able to validate it against a real
positive case, risks exactly the "cursor sat green with an empty offender list" trap the task
warned about by name. Recommendation for a future pass, if new report screens are added: extend
the existing `audited-never-on-get.spec.ts` file (already the house location for this kind of
static audit-shape guard) with a check that every `*-report.tsx` importing `buildCsv` also imports
a function whose name or literal path contains `Export`/`export` from its co-located api file —
weaker than true call-graph tracing but would have caught the shape of bug this task was sent to
find, and per the task's warning, it should be validated by temporarily deleting the `Export`
import from one screen (e.g. `low-stock-report.tsx`) and confirming the guard fails, then
restoring it, before being trusted — this was not done because the guard was not written.

## Shared helper

**Not extracted.** No bucket-A rewiring occurred, so there is no duplicated new fetch-and-download
code to consolidate. The existing convention (a dedicated `fetchXExport`/`fetchXExportCsv`
function per report/module, called from a query hook or directly from `handleExport`, then a
shared `buildCsv`/`downloadCsv` pair from `@/lib/export/csv-export.ts`) is already the one shared
helper in play across all 24+ screens checked, and it is already used correctly everywhere bucket
A would have needed it.

## Typecheck

Not run — zero files were edited this session.

## Ledger identity

```
Before: 0.000000
After:  0.000000
```
(No writes attempted; only GET requests against export endpoints and read-only SQL.)

## Bucket-B screens left open for a founder decision

Five screens build an unaudited client-side CSV with **no existing server export route** to
rewire to (building one is out of this task's scope per the "do NOT build new routes" instruction):

1. `apps/web/src/features/customers/components/customers-list-panel.tsx` — full customer list CSV.
2. `apps/web/src/features/purchase/components/suppliers-list-panel.tsx` (`handleExportSelected`)
   — "export selected rows" quick-export, distinct from the already-audited full
   `suppliers-export-dialog.tsx` on the same screen.
3. `apps/web/src/features/purchase/components/overview/ap-aging-table.tsx` — AP Aging has no
   export route at all server-side (its sibling AR Aging does, and was the prior session's fix).
4. `apps/web/src/features/opening-balance/components/opening-balance-review.tsx` — one-time
   onboarding wizard CSV, not a recurring report; lowest priority of the five.
5. `apps/web/src/features/accounts/lib/export-coa-csv.ts` (chart of accounts export, used from
   `accounts-panel.tsx`) — no COA export route exists.

Ranked by exposure: **AP Aging (#3)** is the highest-priority gap — it is financial (payables
exposure by supplier), has a proven, directly copyable pattern (its own AR Aging sibling, already
fixed in this programme with `@AuditedExport("ArAgingExport")`), and unlike customers/suppliers/COA
carries money that can be summed for a payables decision. Customers/suppliers/COA lists (#1, #2,
#5) are lower-severity (identity/reference data, not transactional amounts). #4 is lowest
(one-time, admin-only onboarding flow, small blast radius).

---

## Follow-up pass 2026-08-30 — building the 5 missing export routes (implementation)

Task: build server export routes for the 5 bucket-B screens identified above, closing the
audit gap for all five rather than just the highest-priority one.

### Routes built

1. **AP Aging (highest priority) — TWO routes, both audited, both matching the existing
   read path's computation (no second aging engine):**
   - `GET /tenant/reports/ap-aging/export` (`apps/api/src/reports/ap-aging.controller.ts`,
     new `apAgingExport` handler) — `@AuditedExport("ApAgingExport")`, gated
     `reports.financial.view`, calls the SAME `ApAgingService.generate()` the plain
     `ap-aging` route already uses (GL party-tagged trade_payables 2111, multi-currency,
     tie-out included). This is the route the *reports* AR/AP Aging screen would use.
   - `GET /tenant/purchase/overview/ap-aging/export` (`apps/api/src/purchase/overview/
     purchase-overview.controller.ts`, new `apAgingExport` handler) — `@AuditedExport
     ("ApAgingExport")`, gated `purchase.bill.list`, calls the SAME `ApAgingService
     .functionalBySupplier()` the plain `ap-aging` widget route already uses. **This is
     the one `purchase/components/overview/ap-aging-table.tsx` (the actual named target)
     calls** — its data source is the purchase-overview widget, not the reports-module
     endpoint (different route, discovered while tracing the component; both now
     audited so neither path is a gap). Web: `fetchApAgingExport` added to
     `overview-api.ts`; `ap-aging-table.tsx`'s `handleExport` now `async`, re-fetches
     through the audited route instead of reusing the on-screen query's cached rows,
     with an `isExporting` disabled-state on the button and a new `exportError` toast
     key (en+ar added).
2. **Chart of Accounts** — TWO routes: `GET /tenant/accounts/tree/export` and
   `GET /tenant/accounts/balances/export` (`accounts.controller.ts`), both
   `@AuditedExport("ChartOfAccountsExport")`, gated `accounting.account.list` (same as
   their plain siblings), each calling the exact same service method as its plain
   counterpart (`AccountsService.getTree` / `CoaBalanceService.getBalances`). Web:
   `fetchAccountTreeExport` / `fetchAccountBalancesExport` added; `accounts-panel.tsx`'s
   `handleExportCsv` is now `async` and re-fetches through both audited routes at export
   time (same `legalEntityId` scope as the screen), then applies the SAME client-side
   `filterAccountTree(search, typeFilter)` narrowing the on-screen tree uses, so the
   export always matches what the user currently sees.
3. **Customers** — ONE route, `GET /tenant/sales/customers/export`
   (`customers.controller.ts`, declared before `:id` per Nest route-order rules),
   `@AuditedExport("CustomerExport")`, gated `sales.customer.list`. Serves BOTH bucket-B
   findings on this screen from one route: passing `ids` resolves exactly those
   customers (backs "export selected rows"); omitting it paginates
   `CustomersService.listCustomers` server-side up to a 5000-row cap (replacing the
   client's own pagination loop), honoring every list filter. Web:
   `fetchCustomersExport` added; both `handleExport` (full filtered range) and
   `handleExportSelected` (bulk-bar quick export) now call it instead of building CSV
   from `fetchCustomers`/on-screen state.
4. **Suppliers "export selected"** — reused the EXISTING audited `SupplierExportController`
   (`GET /tenant/suppliers/export`, already `@AuditedExport("SupplierExport")` from an
   earlier session) rather than building a parallel route, per the task's explicit
   instruction. Added `ids` support to `supplierExportQuerySchema` and
   `SupplierExportService.stream`/`.counts` (mirrors the customers `ids` pattern) so the
   same audited streaming-CSV route now serves both the full-dataset export dialog
   (unchanged) and the new selected-rows quick export. Web:
   `SuppliersExportParams.ids` added to `purchase-api.ts`;
   `suppliers-list-panel.tsx`'s `handleExportSelected` now calls
   `fetchSuppliersExportCsv({ ids: selectedIds })` and reuses the SAME
   `rewriteCsvHeader` + `buildSuppliersExportColumnLabels` localization the full-export
   dialog already uses, instead of a second client-side CSV builder.
5. **Opening balance review — NOT built, deliberately.** Reasoning: this is a one-time
   onboarding-wizard review screen shown BEFORE any opening-balance journal is posted —
   the data it exports is in-memory draft state being reviewed prior to commit, not a
   queryable server record with its own list/filter surface the way the other four are.
   There is no persisted "opening balance review" resource to build a `GET .../export`
   against without inventing one (the actual posted OB journals — OB-0001, OB_AP-0001,
   OB_AR-0001, OB_INV-0001 — are immutable per the hard prohibitions and already covered
   by the audited journal-entries list/export). Building a route here would export
   nothing the ledger doesn't already expose once posted, for a screen most tenants see
   exactly once. Confirmed lowest priority, left open per the task's explicit permission
   to skip #5 with reasoning.

### Downgrade check — client vs. server output, per screen (CONFIRMED via live curl below
for AP aging both routes, COA, customers; SUSPECTED-not-independently-diffed for suppliers
since its full-export path was untouched and only the new `ids` branch was added)

- **AP aging (both)**: identical fields to before (bucket amounts + `total`, functional
  currency), now sourced live instead of from the on-screen React Query cache — strictly
  fresher, never staler. Money still formatted via `formatCsvMoneyCell` client-side
  (unchanged). No column removed or renamed.
- **Chart of Accounts**: same flattened tree shape and same `formatCsvMoneyCell` balance
  formatting; the only change is the tree/balances are now live-refetched instead of
  reused from render state, and are re-filtered through the identical
  `filterAccountTree` the screen itself uses (so filtered rows match exactly, not a
  superset/subset).
- **Customers**: same 10 columns; `includeBalance` is now forced `true` server-side
  (previously the client had to remember to pass it, and a prior comment notes a past
  bug where it forgot to) — this is strictly a robustness IMPROVEMENT, not a downgrade.
  The `ids` (selected-rows) path previously read balances already loaded in on-screen
  state (real numbers); reusing the existing ids-bypass path would have SILENTLY
  DOWNGRADED it to a hardcoded `"0"` balance (see next section) — fixed before shipping,
  not shipped broken.
- **Suppliers selected-rows**: previously built from on-screen `Supplier` objects with
  real balances; now streams through the audited CSV route. Same near-downgrade risk as
  customers (ids path hardcodes `"0"`) — fixed with the identical pattern (see below).
  Column set actually IMPROVES: the audited CSV writer's `SUPPLIER_EXPORT_COLUMN_KEYS`
  header includes `nameAlt` and `createdAt`, which the old client-only builder did not
  export.

### A caught near-downgrade, fixed before shipping (not just found)

`listCustomersByIds` / the suppliers equivalent (`SuppliersService.listSuppliers`'s
`byIds` branch) both hardcode `outstandingBalance: "0"` regardless of `includeBalance` —
by design, for their PRIMARY caller (name-map resolution for rows already on a document,
where balance is irrelevant and the scan would be wasted cost). Naively wiring "export
selected rows" through this same `ids` path would have shipped a CSV with every
Outstanding Balance column reading `0.000000` — a silent, machine-plausible-looking
downgrade of exactly the kind the task warned about (POS-027). Fixed by threading
`includeBalance` into both `ids` branches so they run the SAME scoped GL balance scan
(`CustomerArBalanceService.getFunctionalBalancesByCustomer` /
`SupplierApBalanceService.getFunctionalBalancesBySupplier`) the paginated path already
uses, bounded to the ≤200 requested ids — no second balance computation, and every
OTHER existing caller of the ids path (document name-map lookups) is unaffected because
they all pass `includeBalance: false` already. **CONFIRMED live**: `curl
.../tenant/suppliers/export?ids=<supplier-with-a-real-balance>` returned
`outstandingBalance,1.005000` (not `0.000000`) — see live proof below.

### Shared helper

**Not extracted as a single new file.** The five fixes follow the ALREADY-established
per-module convention from the earlier pass (a `fetch<X>Export` function beside its
plain `fetch<X>` sibling, calling a `.../export` route that mirrors its plain sibling's
service call). The one genuinely repeated pattern — "the `ids`-bypass path must run the
balance scan when the caller opts in" — was fixed by editing the SAME method in both
`CustomersService` and `SuppliersService` identically (not by extracting a cross-service
helper, since the two services have separate balance-service dependencies and separate
row-shape types; forcing a shared helper across them would be the over-engineering
`ponytail` explicitly warns against for two three-line call sites).

### Pin for the class

**Already pinned — no new spec needed.** `audited-never-on-get.spec.ts`'s existing
"every export route is `@AuditedExport`" block is a structural, path-pattern-based scan
(`@Get(".../export")` or a bare `@Get()` under an `export/` directory) that is
NOT scoped to any specific controller — it automatically covers every one of the 8 new
`@Get(".../export")` handlers added in this pass with zero edits to the spec file
itself. Verified this is真actually true, not assumed:

**Deliberate-break result (CONFIRMED):** removed `@AuditedExport("ApAgingExport")` from
`ap-aging.controller.ts`'s `apAgingExport` handler, ran
`npx jest audited-never-on-get --no-coverage` from `apps/api` →
`Test Suites: 1 failed, 1 total`, offender reported as
`.../reports/ap-aging.controller.ts:31`. Restored the decorator, re-ran →
`Test Suites: 1 passed, 1 total, Tests: 5 passed, 5 total`. The guard is live, not a
cursor sitting green over an empty offender list.

### Typecheck (CONFIRMED)

- `cd apps/api && npx tsc --noEmit` — **zero errors in any file this pass touched.**
  5 pre-existing errors remain in `onboarding/*.spec.ts` and two integration-test files —
  confirmed via `git status` these are `M` (modified) by a DIFFERENT, concurrently
  running session mid-edit on `MaterializeCurrencyService`'s signature, not by anything
  in this pass. Left untouched per the task's instruction not to fix another session's
  in-flight files.
- `pnpm --filter @zerupt/web typecheck` — **clean, zero errors.**
- `pnpm --filter @zerupt/web i18n:check` — **passed, ar/en in sync** (the new
  `purchases.apAging.exportError` key was added to both locales).

### Targeted test runs (CONFIRMED where noted; a pre-existing unrelated collision noted
where it applies)

- `npx jest ap-aging --no-coverage` → `Test Suites: 1 passed, 1 total, Tests: 37 passed`.
- `npx jest purchase-overview --no-coverage` → `Test Suites: 1 passed, 1 total, Tests: 11
  passed`.
- `npx jest audited-never-on-get --no-coverage` → `5 passed` (post-restore).
- `npx jest customers.service` / `npx jest suppliers.service` → **both fail**, but on DI
  resolution (`Nest can't resolve dependencies... AuditLogService`) inside test files
  this pass did NOT edit (`customers.service.spec.ts`, `customers.module.ts`,
  `suppliers.service.spec.ts` all show as separately `M`odified in `git status`, by
  another concurrent session mid-wiring `AuditLogService`/`GraphService` into both
  services — confirmed via `git diff` that my own edits to `customers.service.ts` /
  `suppliers.service.ts` are clean, additive, and isolated to the `ids`-branch balance
  fix described above). Not a regression from this pass; reported per the task's
  environment note ("if the build fails on files you did not touch, report it").

### Live proof — audited-export → `audit_log` row, for all four new export types
(CONFIRMED, authenticated curl as owner + direct SQL)

```
curl .../tenant/reports/ap-aging/export?legalEntityId=<LE>                  → 200
curl .../tenant/purchase/overview/ap-aging/export                           → 200
curl .../tenant/accounts/tree/export?legalEntityId=<LE>                     → 200
curl .../tenant/accounts/balances/export?legalEntityId=<LE>                 → 200
curl .../tenant/sales/customers/export?limit=5                              → 200
curl .../tenant/suppliers/export?ids=9151cc3f-785c-47d5-85fb-7736cf91f97c   → 200
```
```sql
select entity_type, action, user_email, entity_id, created_at from audit_log
where entity_type in ('ApAgingExport','ChartOfAccountsExport','CustomerExport','SupplierExport')
order by created_at desc limit 10;
--      entity_type      | action |      user_email       |          created_at
-- SupplierExport        | export | anonymator8@gmail.com | 2026-08-30 11:14:27+00
-- ChartOfAccountsExport | export | anonymator8@gmail.com | 2026-08-30 11:14:26+00
-- CustomerExport        | export | anonymator8@gmail.com | 2026-08-30 11:14:05+00
-- ChartOfAccountsExport | export | anonymator8@gmail.com | 2026-08-30 11:13:54+00
-- ApAgingExport         | export | anonymator8@gmail.com | 2026-08-30 11:13:53+00
-- ApAgingExport         | export | anonymator8@gmail.com | 2026-08-30 11:13:49+00
```
All 6 fresh rows landed within seconds of the calls, correct actor (`anonymator8@gmail.com`
= owner), correct action (`export`), correct entity type. **CONFIRMED.**

**Opened-file proof (founder's standard):**
- `ap-aging/export` (reports route) row:
  `{"supplierId":"...","supplierCode":"SUP-0001","supplierName":"ZZTEST Auto Parts
  Supplier","currency":"KWD","current":"1.005000",...,"total":"1.005000",
  "totalFunctional":"1.005000"}` — no raw UUID-only rows (name + code present), 6dp
  underlying precision (client's `formatCsvMoneyCell` renders KWD at 3dp for the actual
  downloaded CSV, unchanged from before this pass). A second row shows a real
  multi-currency case: AED 250.000000 → functional KWD 21.750000, confirming the FX
  conversion in the tie-out is live, not stubbed.
- `suppliers/export?ids=...` (streamed CSV, opened directly): header row
  `code,name,nameAlt,phone,email,taxNumber,defaultCurrency,creditLimit,
  outstandingBalance,paymentTermDays,status,createdAt`; data row
  `SUP-0001,ZZTEST Auto Parts Supplier,,,,,KWD,,1.005000,,active,2026-08-27T12:18:20Z` —
  **CONFIRMED the near-downgrade fix**: `outstandingBalance` is the real GL-derived
  `1.005000`, not the pre-fix hardcoded `0.000000`.
- `accounts/tree/export`: header account row carries both `name` ("Assets") and
  `nameAlt` ("الأصول") — ar/en both present, no raw UUID-only labeling.
- `sales/customers/export`: row carries `name`, `nameAlt`, `code`, real
  `outstandingBalance` (`"0.000000"` here because this customer has no open AR — a
  correct zero, not the ids-path bug, distinct from the supplier case above).

### RBAC spot-check (CONFIRMED)

`cashier1` (no `reports.financial.view`) → `403` on `.../reports/ap-aging/export`
(correctly denied; matches the plain `ap-aging` route's existing gate — this pass did
not touch that permission). `cashier1` → `200` on `.../sales/customers/export` — this
mirrors the PRE-EXISTING `sales.customer.list` grant on the cashier role for the plain
list endpoint (needed for POS customer lookup); this pass introduced no new grant, it
gated the export identically to the read it audits.

### cost.view strip (CONFIRMED N/A for these 4 routes, not skipped)

Grepped all four touched service/controller files
(`ap-aging.service.ts`, `purchase-overview.service.ts`, `accounts.service.ts`,
`customers.service.ts`) for `cost.view`/`CostView` — zero matches. None of AP Aging
(payables), Chart of Accounts (account structure/balances), or the Customers list
(contact info + AR balance) carry item cost or margin data — `cost.view` gating is an
inventory/sales-report concept (unit cost, COGS, margin %) that does not apply to any of
these four data shapes. Nothing to strip; correctly absent, not a gap.

### Ledger identity (CONFIRMED)

```
Before this pass (carried over from the read-only investigation above): 0.000000
After this pass (all writes were GET/export calls, zero JE-affecting mutations): 0.000000
```

### Build + restart (CONFIRMED)

`pnpm --filter @zerupt/api build` succeeded (no `nest build` errors). Verified the build
was fresh by grepping `dist/` for the new symbol `ApAgingExport` — present in both
`dist/purchase/overview/purchase-overview.controller.js` and
`dist/reports/ap-aging.controller.js` (confirms the source recompiled, not a stale
`dist/main.js`). Restarted the API on port 3001 (`kill` the old PID, 5s sleep,
`nohup node --enable-source-maps dist/main`); `/health` came back with only
`email_config: down` failing (the documented normal-on-dev condition) — all other
checks (`database`, `migration_drift`, `queue`) up. **API restart performed and
announced in this session's port-3001 usage.**

### Documents created

None — every verification call was a GET/export request or a read-only SQL query;
`study/testing/_documents-created.md` needs no new row from this pass.
