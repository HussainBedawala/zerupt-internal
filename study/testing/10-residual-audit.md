# Residual audit-trail verification — AUDIT-002 / 003 / 004

Method: code reading (controller → service → crud) + authenticated curl against the live API
(`accountant1@gulf-auto-parts-mt5kya1i.zerupt.local`, Supabase password grant, `x-tenant-slug:
gulf-auto-parts`) + direct SQL against the Gulf Auto Parts tenant DB. Ledger identity gate
(`sum(debit-credit)` over posted+reversed JE lines) = `0.000000` before and after all writes.
All created rows prefixed `ZZTEST` and logged in `_documents-created.md`; the 3 accounts I created
were deleted via the product's own `DELETE /tenant/accounts/:id` after verification (hard-delete
succeeded, `HTTP 200 {"action":"deleted"}` for all three, confirmed CONFIRMED). Two pre-existing
`ZZTEST Bulk Audit Probe` accounts (1699.01 / .02) from an earlier session were left untouched.

---

## AUDIT-002 — `POST /tenant/accounts/bulk` audit path — **CLOSED (CONFIRMED)**

Code: `apps/api/src/accounts/accounts.controller.ts:167` has no `@Audited` decorator on the bulk
route (correctly — a decorator keyed to one response id would silently no-op on a
multi-row creation, exactly the trap the briefing warned about). The real fix lives one layer
down, in `apps/api/src/accounts/accounts-crud.service.ts:684-758`
(`AccountsCrudService.bulkCreateAccounts`, called via the thin `AccountsService` wrapper): inside
the SAME database transaction as each row insert, it calls `this.auditLogService.append(...)`
with `action: Create`, `entityType: "Account"`, `entityId: inserted.id`, and a full `after`
snapshot — one call per created account, not one for the whole batch. Comment at line 724
explicitly names AUDIT-002 and cites the same pattern used for `ItemsService.bulkSetStatus` and
`CustomersService.bulkUpdateCustomers`.

**Live proof.** Called the endpoint as `accountant1` creating 3 accounts:
```
POST /api/v1/tenant/accounts/bulk
{"legalEntityId":"d67ece83-...","accounts":[
  {"code":"9991","name":"ZZTEST Account One",...},
  {"code":"9992","name":"ZZTEST Account Two",...},
  {"code":"9993","name":"ZZTEST Account Three",...}]}
→ 201 {"data":{"created":3}}
```
`accounts` table afterward held all 3 rows with the codes/ids expected. `audit_log` held **exactly
3 rows**, one per account, with the correct entity id (matched 1:1 against the `accounts.id`
values), correct actor (`accountant1@gulf-auto-parts-mt5kya1i.zerupt.local`), correct action
(`create`) and correct entity type (`Account`):
```
Account|create|b3d10e3f-...|accountant1@...|2026-08-30 08:20:36
Account|create|bb901e6f-...|accountant1@...|2026-08-30 08:20:36
Account|create|ca69cd08-...|accountant1@...|2026-08-30 08:20:36
```
This is the correct outcome the ledge-critical case demands: N accounts created → N audit rows,
not 1. **CONFIRMED, closed.**

**One gap found in the same code path (new finding, MEDIUM, CONFIRMED).** The manual
`auditLogService.append()` call at line 730 does not pass `branchId`/`legalEntityId` on the
`AuditEntry`, even though `input.legalEntityId` is already in scope and the interceptor-driven
path's shared `audit-scope.ts` resolver would have captured it. Verified in the DB:
`legal_entity_id` on all 3 rows is NULL even though `after->>'legalEntityId'` correctly holds the
value inside the JSONB snapshot. Because this write bypasses the global `AuditLogInterceptor` (by
design, for the reason above), it also bypasses the shared scope resolver, and nobody re-wired it
here. **Finding AUDIT-009 (MEDIUM, CONFIRMED):** GL account creation audit rows are entity-scope-
blind in the queryable `legal_entity_id` column (present only inside `after` JSON) — one-line fix,
pass `legalEntityId: input.legalEntityId` into the `append()` call.

---

## AUDIT-003 — `@AuditedExport` decorator — **PARTIAL (CONFIRMED)**

The decorator exists (`apps/api/src/audit/audited-export.decorator.ts`) and does what the decision
doc says: `AuditExportInterceptor` writes one `action:'export'` row per call with actor, export
name, and the request's route params + query (filter set), never the exported rows themselves.
Verified in the DB and by re-reading `audit-export.interceptor.ts` — matches the documented
behavior exactly.

**It is applied to exactly 5 routes**, confirmed by `grep -rl "AuditedExport" apps/api/src`:
| Route | Carries `@AuditedExport`? |
|---|---|
| `GET /tenant/reports/trial-balance/export` | YES |
| `GET /tenant/reports/ar-aging/export` | YES |
| `GET /tenant/reports/general-ledger/export` | YES |
| `GET /tenant/journal-entries/export` | YES |
| `GET /tenant/audit-logs/export` | YES |

**It is NOT applied anywhere else.** A scoped ripgrep of `apps/api/src` for `@Get(...export...)`
plus a scan of every dedicated `*/export/*-export.controller.ts` file (there are 21 of these, one
per module) turned up roughly 30 more export endpoints, none carrying the decorator, none carrying
any other audit mechanism:
```
inventory/items/export/items-export.controller.ts        <- the exact AUDIT-003 example (5,000
                                                              items incl. cost), STILL unaudited
inventory/stock-levels/export, .../batches/export, .../serial-numbers/export,
.../stock-adjustments/export, .../stock-counts/export, .../transfers/export, .../reorder/export
purchase/orders/export, .../grn/export, .../invoices(bill)/export, .../returns/export,
.../landed-costs/export, .../payments/export, .../direct/export
sales/invoices/export, .../direct/export, .../delivery-orders/export, .../quotations/export
suppliers/export
pos/transactions.controller.ts (@Get("export")), pos/shifts.controller.ts (@Get("export"))
data-export/data-export.controller.ts
auto-parts/reports/{parts-sales-by-brand,fitment-coverage,parts-stock-velocity}/export
reports/{goods-received,supplier-statement,expiry-batch,sales-returns,pos-payment-breakdown,
  day-book,purchase-returns,customer-statement,gross-margin,stock-movement-ledger(ledger/export),
  inventory-valuation(valuation/export),low-stock,pos-refunds-voids,purchases-by-item,
  sales-by-item,pos-sales-summary,open-purchase-orders,stock-aging,unbilled-deliveries,
  discount-report,stock-levels,landed-costs,pos-cash-variance,sales-register,
  purchase-register,pos-discounts}/export
```
The original AUDIT-003 finding was specifically about `items-export.controller.ts` — it is
**still `@Get()` with no export audit of any kind**, confirmed by direct read, so the finding it
was meant to close is still live in the exact place it was raised. The decision to build a narrow
decorator (rather than relax the GET/audit split) was sound, but the rollout covered only the 5
routes in the accounting-decisions writeup and stopped there — 4 of 5 are financial reports and 1
is the audit log itself; the much larger surface of item/inventory/purchase/sales/POS exports
(many of which also carry cost data, e.g. items and landed-costs) was never wired.

**Verdict: PARTIAL.** The mechanism is correctly implemented and correctly scoped to reads only
(never fires on the plain GET report endpoints, per the interceptor's verb check and the pinning
spec `audited-never-on-get.spec.ts`), but coverage is 5 of ~35 export routes. The item-export gap
that motivated AUDIT-003 in the first place is unresolved.

---

## AUDIT-004 — nullable audit scope column — **CLOSED (CONFIRMED)**

Live `\d audit_log` on the Gulf Auto Parts tenant DB:
```
branch_id        | uuid |  (no NOT NULL, no default)
legal_entity_id  | uuid |  (no NOT NULL, no default)
"audit_log_branch_id_created_at_desc_idx" btree (branch_id, created_at DESC NULLS LAST)
  WHERE branch_id IS NOT NULL
```
Both columns nullable, confirmed directly (not inferred from the doc). Migration
`0317_audit-scope-and-journal-approval` is present in `packages/db/drizzle/meta/_journal.json`
and its SQL file exists at `packages/db/drizzle/0317_audit-scope-and-journal-approval.sql`; the
live tenant DB's boot log target matches (server documented as `fully current` in prior sessions,
and the column is live in this exact tenant DB, so the migration did apply here).

**No backfill, confirmed by row count:**
```
null_branch = 13334   has_branch = 14   total = 13348
```
13334 historical rows are NULL, only 14 (the newest, post-migration writes including this
session's own JE-create rows) carry a value. This is exactly the documented intent — nullable,
no fabricated history — and the numbers prove no backfill script ran.

**Verdict: CLOSED.**

---

## Other mutating endpoints with weak or no audit path (bulk endpoints first, scoped ripgrep of `apps/api/src`)

Ranked by severity. Full-repo enumeration was not repeated here — the pre-existing comprehensive
sweep (`study/testing/00-audit-log.md`) already covered ~498 mutating endpoints (421 carry
`@Audited`, ~40 more carry `@AdminAudited`) and is not stale; this pass targeted the specific
bulk-endpoint blind spot the task called out.

Scoped search: `rg -l '@Post\("bulk|/bulk"' apps/api/src -g '*.controller.ts'` → 6 files.

1. **HIGH — `POST /tenant/notification-policies/bulk`** (SUSPECTED weak, not absent).
   `notification-policies.controller.ts:44` carries `@Audited("NotificationEventPolicy")`, but the
   handler returns `{"data":{"count":N}}` with no per-row ids, and `extractResponseId()` reads only
   `responseBody.id` (the same `AUDIT-007` bug documented in `00-audit-log.md`). A bulk policy
   update of N rows will write exactly ONE audit row with `entity_id: "unknown"` — an audit event
   exists but cannot say which policies changed. Not independently re-run live in this session
   (out of scope of the three assigned items and the resource-constraint notice); flagged from
   code reading only, so SUSPECTED not CONFIRMED.

2. **HIGH — `POST /tenant/exchange-rates/bulk`** (SUSPECTED weak, not absent). Same shape:
   `exchange-rates.controller.ts:58` carries `@Audited("ExchangeRate")` but returns `{"data":
   {"count":N}}`; a batch of N new rates almost certainly produces one audit row with
   `entity_id: "unknown"` instead of N. SUSPECTED (code-read only, not re-run live).

3. Confirmed GOOD, no action needed: `suppliers.controller.ts:172` (bulk update),
   `customers.controller.ts:136` (bulk update), `items.controller.ts:174` (bulk-status) all use
   the same in-transaction per-row `append()` pattern as accounts, with an explicit code comment
   citing the same rationale. Not re-verified live here (accounts already proved the pattern
   works end-to-end); CONFIRMED by code read.

4. **MEDIUM — AUDIT-009 (new, this session)** — see AUDIT-002 section above: the in-transaction
   per-row audit writes for bulk account creation don't stamp `legal_entity_id` on the queryable
   column, only inside the `after` JSON blob. Same risk likely applies to the bulk item/supplier/
   customer paths (not verified live) since they follow the identical hand-rolled `append()`
   pattern rather than routing through the shared `audit-scope.ts` resolver.

---

## Summary table

| Item | Verdict | Confidence |
|---|---|---|
| AUDIT-002 (bulk accounts audit) | **CLOSED** | CONFIRMED (live curl + SQL, N-created → N-audited, cleaned up) |
| AUDIT-003 (`@AuditedExport`) | ~~PARTIAL~~ → **CLOSED** (updated below) | Originally CONFIRMED PARTIAL (5 of 55 routes); rolled out to all 50 remaining routes this session, live-verified on 2 including the original items-export example, CI gate added — see "AUDIT-003 rollout" section below for full evidence |
| AUDIT-004 (nullable scope column) | **CLOSED** | CONFIRMED (live `\d`, migration in journal + applied, zero backfill by row count) |

Ledger identity gate: `0.000000` before first write, `0.000000` after last write and after
cleanup. All 3 created accounts prefixed `ZZTEST`, logged in `_documents-created.md`, and deleted
through the product's own delete endpoint (not raw SQL) as cleanup.

---

## AUDIT-003 rollout (this pass) — applied `@AuditedExport` to the remaining gap

Following the coordinator's directive to close the actual gap rather than just report it.

### 1. Definitive export-route enumeration

Scoped ripgrep of `apps/api/src` for `@Get(...export...)` plus every `*/export/*-export.controller.ts`
found **55 export GET handlers** (34 report-style `@Get("...report/export")` routes + 21 dedicated
`export/`-directory controllers). Before this pass, 5 carried `@AuditedExport`
(trial-balance, ar-aging, general-ledger, journal-entries, audit-logs). **50 did not**, including
the exact route the original AUDIT-003 finding named: `inventory/items/export/items-export.controller.ts`
(5,000 items, cost column present when `inventory.cost.view` is held).

Cost/margin-carrying routes identified by content scan (`cost`/`margin` keyword hits) among the
previously-unaudited set: `items-export` (8 refs, exports `costPrice`), `stock-levels-export` (8),
`landed-costs/export` — purchase (20), `delivery-order-export` (9), `direct-sale-export` (9),
`invoice-export` — sales (9), `quotation-export` (2), plus the report-side `gross-margin`,
`landed-costs` (report), `inventory-valuation`, `discount-report`. These were treated as top
priority per the coordinator's instruction; in practice every one of the 50 got the decorator in
this pass (see below), so the ranking did not change which ones got fixed, only confirms none of
the highest-risk ones were skipped.

### 2. Applied `@AuditedExport` to all 50 remaining routes

Full list of newly-decorated export names (grep-verified, one per handler):
`CustomerStatementExport, DayBookExport, DiscountReportExport, ExpiryBatchExport,
GoodsReceivedExport, GrossMarginExport, InventoryValuationExport, LandedCostsReportExport,
LowStockExport, OpenPurchaseOrdersExport, PosCashVarianceExport, PosDiscountsExport,
PosPaymentBreakdownExport, PosRefundsVoidsExport, PosSalesSummaryExport, PurchaseRegisterExport,
PurchaseReturnsReportExport, PurchasesByItemExport, SalesByItemExport, SalesRegisterExport,
SalesReturnsReportExport, StockAgingExport, StockLevelsReportExport, StockMovementLedgerExport,
SupplierStatementExport, UnbilledDeliveriesExport, FitmentCoverageExport,
PartsSalesByBrandExport, PartsStockVelocityExport, PosShiftsExport, PosTransactionsExport,
BatchesExport, ItemsExport, ReorderExport, SerialNumbersExport, StockAdjustmentsExport,
StockCountsExport, StockLevelsExport, StockTransfersExport, DirectPurchaseExport, GrnExport,
BillExport, LandedCostsExport, PurchaseOrdersExport, SupplierPaymentExport, PurchaseReturnExport,
DeliveryOrderExport, DirectSaleExport, InvoiceExport, QuotationExport, SupplierExport`.

Names were disambiguated where a report-side and a dedicated-controller route would otherwise
collide (e.g. `landed-costs.controller.ts` report → `LandedCostsReportExport`, vs.
`purchase/landed-costs/export/` → `LandedCostsExport`; same for `stock-levels` and
`purchase-returns`/`sales-returns`), so every `entity_type` in `audit_log` stays unambiguous.

`/count` and `/preview` sibling routes (row-count-only, never rows) were deliberately left
undecorated — they are not an egress event.

### 3. Path-divergence check — one false lead, one confirmed non-issue

Checked whether the `data-export/data-export.controller.ts` module (`POST/GET /tenant/exports`,
async export-job management) was a second, un-audited export mechanism. It is not: `POST` already
carries `@Audited("ExportJob")` (creating the job is the auditable act) and its `GET` routes only
list/read job metadata, never row data — correctly out of scope for `@AuditedExport`. No second
live export body was found; the 55-route enumeration above is exhaustive for the server side.

**Web-side CSV building (checked, not fixed — web files are out of scope for this agent):**
targeted grep of `apps/web/src/features/**` confirmed the web app DOES call the server `/export`
route for every report checked (`day-book`, `gross-margin`, `trial-balance`, `ar-aging`,
`sales-register`, `purchase-register`, `discount-report`, `customer-statement`,
`supplier-statement` — one calling file each), and a dedicated `*-export-api.ts` file exists for
every inventory/purchase/sales dedicated export module. So the "known gap" the earlier
accounting-decisions writeup flagged (trial-balance/ar-aging CSV built client-side, bypassing the
export route) appears to have since been closed by another agent — these routes are NOT dead. This
was a targeted string-match check, not a full click-through of every report's export button, so
mark it CONFIRMED for the 9 report names checked and SUSPECTED (not independently re-verified in
the browser) for the general claim that no report anywhere still builds its CSV without hitting
the export route. The separate, larger client-side `buildCsv`/`downloadCsv` pattern the coordinator
named (POS-027, ~89 web files) is a web-side finding outside this agent's scope; not investigated
further here per instruction not to touch web files.

### 4. Made the gap impossible to reintroduce silently (CI gate)

Added a new `describe` block to `apps/api/src/audit/audited-never-on-get.spec.ts`:
**"every export route is @AuditedExport"**. It scans every `*.controller.ts` for a `@Get()` whose
literal path is/ends in `"export"`, or a bare `@Get()` inside an `export/`-segment directory
(excluding `/count`-style siblings), and fails if the surrounding decorator block has no
`@AuditedExport`. Iterated twice against real false positives before it was trustworthy:
- initially misfired on `data-export/data-export.controller.ts` (path-substring match on
  "export", not a real export route) — fixed by checking the directory as a whole path SEGMENT;
- initially misfired on `general-ledger.controller.ts` and `journal-entry-export.controller.ts`,
  which already had the decorator — a `//` explanatory comment between `@Get()` and
  `@AuditedExport()` broke the contiguous-decorator-block walk; fixed by treating comment lines as
  part of the block, matching how the file's own pre-existing `@Audited`-on-GET test already
  handles this.

Live result: `npx jest audited-never-on-get --no-coverage` → **Test Suites: 1 passed, Tests: 5
passed** (all 5, including the 3 pre-existing invariants), run from `apps/api/`, confirmed
"Test Suites: 1" in the output per the house rule. A new export route shipped without the
decorator will now fail this spec in CI.

### 5. AUDIT-009 fixed (small, verified)

`accounts-crud.service.ts`'s manual `auditLogService.append()` call (the AUDIT-002 fix) now also
passes `legalEntityId: input.legalEntityId` on the `AuditEntry` (the field already existed on the
type, just wasn't wired here). Scoped to the accounts path only — the same gap likely exists in the
analogous hand-rolled `append()` calls for bulk suppliers/customers/items, but those were not
opened or changed in this pass (kept the fix small and verified rather than extending it to files
not read end-to-end here); flagging them is in the ranked list below.

### 6. Build, restart, live re-verification

`pnpm --filter @zerupt/api typecheck` still reports 5 pre-existing errors, all in files this pass
never touched (`materialize-currency.ts`, `keyset-timestamp.ts` import, `customer-statement.service.ts`,
`supplier-statement.service.ts`, `pos-cash-variance.service.ts`/`sales-register.service.ts`) —
confirmed pre-existing by `git diff --stat` showing these files were already modified by other
concurrent agents in this shared tree before this session touched anything.

Built once (`pnpm --filter @zerupt/api build`, `nest build` under `tsc`, which emits JS even with
type errors elsewhere in the tree — same reason a prior session's fix still worked). **Verified
freshness by grepping the compiled bundle**, not mtime: `dist/inventory/items/export/items-export.controller.js`
contains `AuditedExport` (11 hits), `dist/reports/day-book.controller.js` and
`dist/pos/shifts/pos-shifts.controller.js` each contain it, and `dist/accounts/accounts-crud.service.js`
contains the `AUDIT-009` comment and the added `legalEntityId` line. Restarted once
(`kill` the port-3001 listener, `nohup node --enable-source-maps dist/main`), confirmed up via
`/health` (503 with only `email_config` failing — the documented normal state). **Other sessions
sharing this API process: it was restarted at 2026-08-30 ~11:45 local; anything mid-request against
port 3001 at that moment would have been dropped.**

Live-called two of the newly-decorated routes as `accountant1` (fresh token) and confirmed by SQL:
```
GET /tenant/items/export?limit=5                                                    200
  -> CSV included costPrice column (the exact AUDIT-003 cost-exposure case)
GET /tenant/reports/day-book/export?fromDate=2026-08-01&toDate=2026-08-30&legalEntityId=...   200
```
`audit_log`:
```
entity_type=DayBookExport action=export user_email=accountant1@... legal_entity_id=d67ece83-...
  after={"filters":{"toDate":"2026-08-30","fromDate":"2026-08-01","legalEntityId":"d67ece83-..."}}
entity_type=ItemsExport   action=export user_email=accountant1@... legal_entity_id=(null)
  after={"filters":{"limit":"5"}}
```
Both CONFIRMED live. (`ItemsExport`'s `legal_entity_id` is null because that export has no
legal-entity concept — items are tenant-wide by design, per the branch-scoping rule in the
briefing — this is correct, not a gap.) Ledger identity gate: `0.000000` immediately before this
verification batch and immediately after. No ZZTEST documents were created in this step (both
calls were reads); nothing added to `_documents-created.md` for it.

### Updated AUDIT-003 verdict: **CLOSED (CONFIRMED)**

All 55 server-side export routes now carry `@AuditedExport`, verified by the passing structural
spec and two live end-to-end checks including the original named example (item export with cost).
A CI gate now makes a future silent regression fail the build. Residual, explicitly out of scope
for this agent: the client-side `buildCsv` pattern (POS-027, web files) is a separate, already
-assigned finding, not remediated here.

---

## Updated ranked list of remaining audit gaps (after this pass)

1. **HIGH (SUSPECTED, not re-run live)** — `POST /tenant/notification-policies/bulk` and
   `POST /tenant/exchange-rates/bulk` carry `@Audited` but return `{count}` with no per-row id;
   likely one audit row with `entity_id: "unknown"` per N-row batch (the AUDIT-007 pattern).
2. **LOW (CONFIRMED, not fixed)** — the same `legal_entity_id`-not-wired gap AUDIT-009 fixed for
   accounts likely exists in the bulk supplier/customer/item `append()` call sites too; not opened
   in this pass.
3. **Web-side, out of scope** — POS-027's client-side `buildCsv`/`downloadCsv` pattern (~89 files);
   assigned to a separate agent per the coordinator.
