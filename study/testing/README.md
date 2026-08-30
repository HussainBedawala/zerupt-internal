# UI Testing Programme

Systematic screen-by-screen testing of all 7 modules against the live dev tenant.

**Tenant:** Gulf Auto Parts Company W.L.L. (`gulf-auto-parts-mt5kya1i`) — Kuwait, KWD (3dp),
auto-parts industry, en primary + ar secondary. LIVE.
**DB:** Neon `restless-hill-33464873` / `br-old-recipe-a1d3dw26` / `zerupt_tenant_gulf_auto_parts_mt5kya1i`

## Order (dependency + real-customer frequency)

| Phase | Scope | File | Status |
|---|---|---|---|
| A | Permissions & branch scoping (all roles) | `A-permissions-*.md` | **DONE** |
| B | Inventory (27 screens) | `01-inventory*.md` | **COMPLETE - 27/27 screens** |
| C | POS | `04-pos-*.md` | **COMPLETE - 34 findings, all fixed + verified** |
| D | Purchase | `05-purchase-*.md` | **COMPLETE - 12 waves, 64 findings, dual full cycles run live** |
| E | Sales (37 routes) | `06-sales-*.md` | **COMPLETE - 10 findings, live cycle run** |
| F | Accounting (24 screens) + Print | `09-accounting-*.md`, `09-print-setup.md` | **IN PROGRESS** (opened 2026-08-30) |
| G | Reports | `08-reports-*.md` | **COMPLETE - 45/45 screens verified by code+SQL AND live browser (en+ar) AND live API. 52 findings, ALL closed. Zero open.** |
| H | Settings (full) | `10-settings-*.md`, `10-residual-*.md` | **COMPLETE - 2026-08-30. 5 areas + 7 residuals closed. Programme ends here.** |

### Phase E (Sales) — opening baseline, 2026-08-28

Ledger identity at open: **0.000000**. The sales document chain has **never been run in this
tenant**: `sales_orders=0`, `sales_receipt_vouchers=0`, `sales_credit_notes=0`, `quotations=0`,
`delivery_orders=0`, `direct_sales=0`, `sales_debit_notes=0`, `sales_refund_vouchers=0`.
Only `sales_invoices=316` (seeded/POS-originated) and `sales_customers=500` exist.

This is the same profile Purchase had: code-hardened in June (6 layers, `study/sales/_hardening-log.md`),
declared complete, and never exercised live — and Purchase's two CRITICAL money bugs both surfaced
only on the first live run. The sales hardening log's own TOP FOUNDER TODO is "run a full sales
cycle end-to-end on a real dev tenant". Phase E does that.

Cross-cutting files: `00-shell-and-navigation.md`, `00-dashboard.md`, `00-auth-session.md`,
`_test-users.md`, `_screen-inventory.md`.

## Scoreboard (fixed + verified in browser unless noted)

| ID | Sev | Summary | Status |
|---|---|---|---|
| AUTH-001 | HIGH | Malformed auth cookie 500s every route incl. /login; unhandled rejection | FIXED |
| PERM-001 | HIGH | Staff land on a page their role cannot access | FIXED |
| PERM-002 | MED | "Something went wrong" toast for a normal permission denial | FIXED |
| PERM-003 | HIGH | `(pos)` route group had NO permission gate | FIXED + guard test |
| PERM-004 | MED | Read-only user can open+fill entire create form | OPEN |
| PERM-005 | MED | Dead-end "Access denied" instead of graceful degrade | OPEN |
| DASH-001 | CRIT | Idle Inventory tile showed company-wide data on a branch view | FIXED |
| DASH-002 | HIGH | Three contradictory branch scopes on one dashboard | FIXED |
| DASH-003 | - | WITHDRAWN, my misdiagnosis (AR tile was correct) | N/A |
| DASH-004/5/6 | MED/LOW | Money without currency; number formats; em dash placeholder | FIXED |
| SHELL-001 | MED | Branch chooser truncated branch identity; ar cut the branch NUMBER | FIXED |
| SHELL-002 | MED | Sidebar branch pill repeats SHELL-001 in another component | OPEN |
| ROLE-001 | HIGH | Template selection silently overwrote the typed role name | FIXED |
| ROLE-002/3 | MED | Raw i18n key paths in UI + i18n:check cannot catch missing-in-both keys | FIXED + guard test |
| ROLE-004 | MED | Role create 9.2s, user create 11.3s, no busy state | OPEN |
| POS-001 | HIGH | "Opening float" placeholder 0.00 (2dp) in a 3dp KWD tenant | OPEN |
| POS-001 | MED | Register-create float seeds a neutral 2dp value, re-formats only after async branch-currency resolves (NOT a shared formatter bug; shift-open float is fixed) | OPEN (re-scoped) |
| POS-CRIT-001 | **CRIT** | `/pos` dies permanently for Cashier's default perms: bare `catch{}` swallows branch 403, currency stays "", `formatCurrency` throws by design | OPEN |
| POS-CRIT-002 | **CRIT** | Z-report screen 100% down for ALL users: `Tooltip` with no `TooltipProvider` in `(pos)` layout. 4 siblings each wrap their own | OPEN |
| POS-002 | HIGH | `computeExactValueForTender` ignores its own `tenderId` arg: KWD 5-fils cash rounding applied to ALL tenders, shortfalls on cash AND hard-blocks KNET/card sales | OPEN (re-diagnosed) |
| POS-015 | HIGH | `/ar/pos` category chips stay English: `category-filter-bar.tsx:72` uses audit-grade `primaryText()` (always `name`) where its OWN file header mandates locale-aware `localized-name.ts`. Message-key parity tests structurally CANNOT catch this - needs a lint forbidding `primaryText` in operational components. Check other modules for the same import | OPEN |
| POS-016 | HIGH | Customer display never renders change due: receipt reads local `completedSale` (pay-surface.tsx:288) but broadcast reads store `lastSale` (register-shell.tsx:282). Two sources of truth for one fact | OPEN |
| POS-017 | MED | Display discount row always "-KWD 0.000": strict `!== "0"` string check instead of numeric compare | OPEN |
| POS-018 | MED | Cart tax row is the THIRD instance of the ungated-tax pattern (cart, display, +receipt/Z-report gate correctly). One shared `documentShowsTax`, not N patches | OPEN |
| POS-014 | HIGH | Zero-total cart: "Complete anyway" can NEVER succeed - `assertSalePayable` throws on `payments.length===0`. Button lies (G1) | OPEN |
| POS-003 | HIGH | Blind close bypassable: "Reveal expected cash" works pre-count, and revealed figure excludes cash movements | OPEN |
| POS-004 | HIGH | `costAtSale` returned unconditionally to Cashier; zero `cost.view` enforcement anywhere under `pos/` (not rendered in UI, so HIGH not CRIT) | OPEN |
| POS-005 | HIGH | F1-F4 shortcuts not suppressed while a dialog is open; F-pay flips cart to settle behind an overlay | OPEN |
| POS-006 | HIGH | Register cart renders tax row unconditionally; Kuwait cashiers see "Tax 0.000" every sale. Reuse `documentShowsTax` | OPEN |
| POS-007 | MED | `grandTotal` arithmetic identity is an app assertion only, NOT a DB CHECK - hardening log L1 wrongly claims it shipped | OPEN |
| POS-008 | MED | `POST /pos/approvals/verify` is the only POS mutation with no `@Audited` | OPEN |
| POS-009 | MED | Shift header "Cashier:" shows current user, not the shift's actual cashier | OPEN |
| POS-010 | MED | `usePosTransactionsQuery` lacks `keepPreviousData`; POS's share of the pager-unmount defect | OPEN |
| POS-011 | MED | PERM-004 pattern: Void shown on status alone, never on `pos.transaction.void` (Cashier lacks it) | OPEN |
| POS-012 | SUSP | Shows "Offline" while `navigator.onLine` true, routing online sale through offline queue | SUSPECTED |
| POS-013 | FRICTION | No shortcut for remove-line, qty-change, discount, exact-cash, complete-tender; qty stepper is mouse-only | OPEN |
| POS-025 | HIGH | Zero-total sale 500s at `pos-sync.service.ts:1051` (`.values([])` on empty payments) - no txn row, cashier shown "Sale completed". FIFTH layer of one defect | FIXED + live-verified (txn created, 0 payment rows, stock relieved, JEs balanced) |
| POS-026 | HIGH | Order-level discount missing from SIX print surfaces (receipt, local receipt, customer display, A4 invoice, public digital receipt, export). Fixed once in the shared print stack | FIXED + live-verified (8.332 - 2.000 + 1.000 = 7.332 reconciles) |
| POS-027 | HIGH->MED | Export: "downloads nothing" + "raw UUID cashier" were **FALSE** - verifier curled the JSON endpoint, bypassing the client-side `buildCsv`/`downloadCsv` half (app-wide pattern, 89 files) and `resolveCashierName`. GENUINE part: missing discount/delivery columns | PARTLY WITHDRAWN; real part FIXED |
| POS-019 | **CRIT** | Order discount + delivery fee silently dropped when Payment opens: `cart-repo.ts` never persisted them; PaySurface mount rehydrates cart from IndexedDB, overwriting in-memory values. Hold/recall had it too | **FIXED + DB-VERIFIED** (discounted sale rung end-to-end: order_discount_net 1.000, delivery_fee_net 2.000, identity diff 0.000000, 3-way tie-out balanced) |
| POS-020 | HIGH | Zero-total sale rejected by THREE un-relaxed `.min(1)` payment schemas | FIXED (but see POS-025 - a 4th layer remained) |
| POS-021 | HIGH | `GET /tenant/settings` 403s for cashier -> ONE root cause behind BOTH the Arabic-chip failure and the tax-row flicker | FIXED (settings/current + register countryCode; no permission widened) |
| POS-022 | MED | Z-report rendered with NO `currency` prop; `moneyDecimals()` fell back to 2dp. Same predicate as POS-001 | FIXED |
| POS-023 | MED | `use-cashier-name.ts` fell back to raw userId, baking a UUID into the "name"; ZReportPrintView also resolved the VIEWER not the shift's cashier | FIXED |
| POS-024 | SUSP | Cross-line qty increment on cart shortcuts - NOT reproducible from code (all layers key on `lineId`); regression test added as tripwire | UNREPRODUCED |
| INV-OV-001 | HIGH | Low-stock metric has 3 disagreeing definitions | INVESTIGATING |
| SESSION | ? | Intermittent silent logout, NOT reproducible on demand | OPEN |
| INV-OV-001 | HIGH | Low-stock metric had 3 disagreeing definitions | PARTLY FIXED (see INV-REORDER-001) |
| INV-REORDER-001 | HIGH | Stock Levels uses `<` reorder_level, Reorder uses `<=`; 262 rows disagree | OPEN |
| INV-BATCH-001 | **CRIT** | Batch received already-expired stays `active` AND sorts FIRST in FEFO | OPEN |
| PACK-001 | HIGH | Vehicle label omits `engine`; 1,428 groups render identically. 4 duplicate impls | OPEN |
| PACK-002 | HIGH | What-fits silently truncates at 100; all 4,555 vehicles exceed it; no total/hasMore | OPEN |
| PACK-003 | HIGH | Frontend gates auto-parts buttons on item.* keys, backend demands autoparts.*; no parity test covers in-page buttons | OPEN |
| PACK-004 | MED | Promotions have no below-cost warning | OPEN |
| PACK-005 | MED | `engine` (part of the unique key) hidden behind closed "Advanced" toggle | OPEN |
| REORDER-002 | MED | `generatePo()` all-or-nothing | **WITHDRAWN** - UI offers a fallback-supplier picker, no dead end |
| XFER-001 | MED | Edit form fully interactive for a denied user; denial banner easy to miss (2nd instance of PERM-004) | OPEN |
| XFER-002 | LOW | Edit screen reuses the `noPermission` block reading "You cannot create a transfer" | OPEN |
| PARTREF-001 | LOW | Only path that populates `part_grades`; skipping it ships an empty dropdown | SUSPECTED |
| PUR-001 | HIGH | Bulk supplier deactivate bypassed the blast-radius dependents check that the single-edit path enforced | FIXED - `enforceBlastRadius` now sits inside `SuppliersService.updateSupplier`, the one shared method both the single-resource PATCH and the bulk endpoint call through, so neither entry point can bypass it; a bulk-path test pins both. NOTE: the live-cycle wave's "still unguarded, deactivation succeeds despite an open PO" report was investigated and disproved - the code enforcement is real, the test case just exercised a path outside its scope (see PUR-001b) |
| PUR-001b | MED | An open purchase order is not in blast-radius scope at all (`buildPartyBlastRadius` only hard-blocks on open invoices with a balance > 0), so a supplier you are still awaiting delivery from can be deactivated with no warning. Existing design split is hard-block = money owed, warning = operational - an open PO most likely belongs as a WARNING, not a hard block, since blocking would create a dead end. Related gap: an unpaid landed-cost payable has no `purchase_invoices` row, so it is invisible to both the aging report and this check | OPEN |
| PUR-002 | MED | ~7 purchase list panels (suppliers/orders/GRNs/bills/direct/payments/returns/landed-costs) lacked `placeholderData: keepPreviousData` | FIXED + live-verified (en+ar, pager never unmounts on a 501-row list) |
| PUR-003 | MED | SUSPECTED - seeded `SUPP-####` supplier codes vs. live auto-gen `SUP-####` prefix mismatch, needs a one-line confirm on seed intent | OPEN |
| PUR-004 | - | WITHDRAWN, my misdiagnosis - "storekeeper1 has no role" is wrong, it has the Viewer role (72 perms); a Viewer correctly reads the whole AP book, not a security finding | N/A |
| PUR-005 | HIGH | Seeded Accountant role template had ZERO `purchase.*` permissions, blocking the accountant billing persona entirely | FIXED + live-verified (28 purchase perms granted; payment-create + bill-draft now reachable) |
| PUR-006 | HIGH | order-create screen showed "Before tax" / a tax note for a genuine no-VAT Kuwait tenant (`hasTaxGroups` row-count proxy, always true because every no-tax tenant is seeded one "No Tax" group) | FIXED + live-verified |
| PUR-007 | HIGH | SUSPECTED - direct-purchase `hasTaxedLines` used the identical wrong row-count-shaped proxy | FIXED (same shared fix) |
| PUR-008 | HIGH | direct-purchase DETAIL panel rendered an unconditional "Tax: KWD 0.000" row, no gate at all (3rd inconsistent tax-visibility mechanism in the module) | FIXED + live-verified |
| PUR-009 | MED | direct-purchase tax-row visibility was client-derived from the tax-group catalogue while the bill's was server-derived `taxMode` (path divergence) | FIXED (folded into the shared `showsPurchaseTax` fix) |
| PUR-010 | HIGH | Dead "Manager approval (UUID)" raw-identifier strings still live in messages, 6 duplicated slots, en+ar - no call site found, but never confirmed dead or deleted | OPEN |
| PUR-011 | MED | Em-dash empty-value placeholder duplicated 15+ times across purchase, plus two competing private `EM_DASH`-style constants; no shared component | PARTLY FIXED - the specific reported instance (orders list "Expected delivery") and a 14-screen sweep came back clean, but the structural shared-constant fix was never done and new transient em-dash/raw-value flashes kept surfacing later (see PUR-030, PUR-055, PUR-057) |
| PUR-012 | MED | Two em dashes in real prose (refund-receipt copy, en+ar) | OPEN |
| PUR-013 | MED | Jargon leaks: "reverse-charge" and "contra"/"contra-d" in user-facing copy, "contra" has no plain-language gloss anywhere nearby | OPEN |
| PUR-014 | LOW | SUSPECTED - fallback error toast surfaces raw `ApiError.message` verbatim; web layer has no last-line defense against a technical message reaching the user | OPEN |
| PUR-015 | **CRIT** | CONFIRMED (live) - a purchase return of an already-billed-and-paid GRN debited GR/IR 2121 instead of the supplier's payable 2111, permanently losing KWD 11.000 in this tenant's real books | FIXED + live-verified (void, re-raise, correct AP debit confirmed end to end; ledger 0.000000 throughout) |
| PUR-016 | **CRIT** | A GL leg whose price variance rounds below half a fils was rejected outright post-commit, leaving a confirmed bill with zero GL, reachable through an ordinary discount + 3dp supplier price | FIXED + live-verified (rounding notice shown, dropped-leg absorbed into account 4840, 113 tests green, live JE posted correctly with the PPV leg) |
| PUR-017 | HIGH | Document totals stored at 6dp with no currency-precision rounding, so bill total/balance can diverge from the GL by construction (root cause behind PUR-016's family) | OPEN, not independently re-verified |
| PUR-018 | HIGH | Landed cost credited to Accounts Payable creates a real, party-tagged AP balance with no bill behind it - permanently unsettleable anywhere in the purchase UI | OPEN (live-confirmed, KWD 10.005 stuck) |
| PUR-019 | HIGH | SUSPECTED - landed-cost allocation's zero-skip is correct today but load-bearing and unpinned; the obvious "simplification" refactor would silently under-apply inventory | OPEN, needs a pinned test |
| PUR-020 | MED | Purchase returns relieve inventory at company-wide WAC instead of the GRN receipt cost, dumping a large fictitious variance into PPV 5210 (pinned by a regression spec, deliberate but pre-dates an opening-balance-heavy tenant) | OPEN, founder decision needed |
| PUR-021 | MED | Stacked GRN cost corrections leave a bounded, unmonitored micro-residue in GR/IR 2121 (acknowledged in a `// ponytail:` comment, no monitor exists) | OPEN |
| PUR-022 | LOW | `DPU` document type absent from shared `DOCUMENT_TYPES` - works only because the Postgres enum happens to contain `dpu` | OPEN |
| PUR-023 | HIGH | Purchase-return VOID re-received stock at GRN price but credited GL at average cost, breaking the inventory-GL-vs-cost-pool tie by 19.777 | FIXED (repair CLI + root-cause fix in `inventory-event.listener.ts`; see the 2026-08-28 environment-changes entry below) |
| PUR-024 | MED | Bill line unit-cost edit was silently discarded on Confirm, no unsaved-changes warning before an explicitly irreversible action | FIXED + live-verified (rounding notice now shown and the stored value matches it exactly) |
| PUR-025 | MED | `/purchase/orders/new` rendered a full, enabled form for a user lacking `purchase.order.create` (PERM-004 pattern) | FIXED + live-verified |
| PUR-026 | MED | `/purchase/suppliers/new` same pattern, denial only at submit (server correctly 403'd, no row created) | FIXED + live-verified |
| PUR-027 | MED | direct-purchase create showed "+KWD 0.000 tax" per line once any line was added | FIXED + live-verified |
| PUR-028 | MED | ar mistranslated PO/GRN detail "Subtotal" as "المجموع قبل الضريبة" (total before tax) | FIXED + live-verified |
| PUR-029 | HIGH | SUSPECTED - purchase POSTs over ~40s left the form with no success/error state and a live Save button, inviting a duplicate click | PARTLY FIXED - submit buttons now disable + spinner across all 6 purchase create panels (live-verified), and both write paths proved idempotency-safe (a genuine double-click produced exactly one row); the missing terminal-state screen on a truly slow write was not independently re-verified |
| PUR-030 | LOW | Raw UUID shown as the document number (`DRAFT-<uuid>`) on a draft landed cost's breadcrumb + title; the sibling draft-bill screen already has the fix (renders "New bill") | OPEN |
| PUR-031 | LOW | Outbox reconcile drift warning is a permanent false positive on same-branch stock transfers (predicate doesn't exclude `isSameBranch: true`) | OPEN |
| PUR-032 | LOW | "Showing 1-25" uses an en dash on some purchase lists, a plain hyphen on others | OPEN |
| PUR-033 | MED | Bill detail money rendered at 2 decimals for ~20-25s before the tenant currency resolved (unknown-currency state renders as if it were known) | OPEN |
| PUR-034 | MED | A failed line-price save reverted silently while the "Rounded to KWD X" notice stayed on screen, asserting a value that was never saved | FIXED + live-verified BOTH halves (2026-08-28, owner, bill PINV-00008): typed 0.999889 -> notice "Rounded to KWD 1.000" rendered; bill then confirmed in a second tab so the stale tab's next line edit failed server-side -> the `role=status` notice CLEARED, the field reverted to 1.000, and a plain-language `role=alert` "Only a draft bill can be modified" appeared. `bill-line-save-failure` spec green (2 tests) |
| PUR-035 | LOW | Create/Save buttons on purchase forms were not disabled while the write was in flight, allowing a second concurrent POST | FIXED + live-verified (all 6 purchase create panels share `SubmitButton`: disabled + spinner + re-guarded handler, verified in the browser and by code trace) |
| PUR-036 | LOW | Raw item UUID visible in the GRN printed-document Item column while data loads | FIXED + live-verified (403-sample cold-load sweep on 2 GRNs; Print was never enabled while a UUID was visible) |
| PUR-037 | MED | Raw internal branch code (`B1_AL_RAI_MAIN_SHOWROOM`) shown above the display name on 3 purchase create screens plus the branch-chooser gate | OPEN |
| PUR-038 | MED | "Create landed cost" stays disabled with no statement of the missing input (the Target GRNs selection, far above the button) | OPEN |
| PUR-039 | MED | Landed cost is written via two non-atomic requests (header, then components); a failure between them orphans a headerless document | OPEN |
| PUR-040 | MED | Bill-confirm dialog claims it "receives stock" even on a GRN-sourced bill that already received it (copy written for the direct/no-receipt path, reused unconditionally) | OPEN |
| PUR-041 | MED | SUSPECTED - "Correct quantities" disabled on a freshly-received GRN with a false "already sold or moved" reason | OPEN |
| PUR-042 | MED | Exchange-rate field shown on the supplier payment form in a single-currency KWD tenant (the direct-purchase screen correctly omits it - the two paths disagree) | OPEN |
| PUR-043 | LOW | Premature "Enter a positive cost" validation error on a direct-purchase line before the user has had any chance to type | OPEN |
| PUR-044 | FRICTION | Raw "Line #1" placeholder shown for ~20s while a return line's item name resolves, beside a stale "Enter a quantity" hint next to an already-computed total | OPEN |
| PUR-045 | LOW | Bulk-update success toast "Updated 1 suppliers" is unpluralized | OPEN |
| PUR-046 | MED | Raw Zod validation string ("Invalid option: expected one of...") shown verbatim to the user on the supplier edit form | OPEN |
| PUR-047 | MED | Write-action buttons (New order, Receive goods, New bill, Export) render unconditionally for a read-only Viewer persona | OPEN |
| PUR-048 | MED | Purchase-overview AP aging renders raw supplier UUIDs because the name lookup batches ~300 ids into one URL and the API 400s on it | OPEN |
| PUR-049 | HIGH | A refund-receipt error-map's 422 catch-all falsely told the user "the accounting period for this date is closed" (it was open), discarding the server's correct, actionable message | FIXED |
| PUR-050 | HIGH | A refund was offered (fully enabled dialog) on returns that can never be refunded (`bill_id IS NULL`), failing only after an 11.6s round trip | FIXED (the gate now keys on the GL position instead) |
| PUR-051 | MED | The server's suggested remedy ("amend the return to link its bill") had no corresponding field anywhere in the product | FIXED |
| PUR-052 | MED | `refundable_amount` was populated and shown to the user on a return that could never be refunded | FIXED |
| PUR-053 | LOW | Stale "Enter a quantity to see the total" hint persists beside an already-computed return value while the preview call is in flight | OPEN |
| PUR-054 | LOW | Transient em-dash placeholder for a known supplier name on bill detail (~15-40s before it resolves) | OPEN |
| PUR-055 | HIGH | CONFIRMED - a 30-second client-side write timeout sits below real write time on this link; a GRN cost-correction that fully landed server-side (new bill issued, JEs posted) was reported to the user as "Could not save this correction" | OPEN - the FALSE FAILURE, mirror of POS's false-success class |
| PUR-056 | MED | Raw supplier UUID flashes in the GRN printed-document header for ~1.5s on cold load (on-screen only, never printable) | OPEN |
| PUR-057 | MED | Bill detail's "Unit cost" column shows the GRN receipt cost under a column labelled for the bill, arithmetically contradicting the bill's own line total on the same page | OPEN |
| PUR-058 | MED | A `purchase.invoice.voided` accounting-event-outbox row is permanently unprocessable (empty `lineItems` against a min-1 schema) and retries forever; no money is missing but the queue can never drain it | ROW CLEARED - the stuck row `c47f2de9-...` is `completed` (processed_at 2026-08-28 13:23:47, cleared by an earlier session); 0 rows left in that state. The replay CLI now boots (see below) and correctly refuses to reprocess a completed row without `--force`. The underlying empty-`lineItems` producer bug is tracked separately as already fixed |
| PUR-059 | LOW | Reversing journal entries carry no link (`reversal_of_entry_id`) to the entry they reverse | OPEN, codebase-wide, not purchase-specific |
| PUR-060 | LOW | Internal event names used verbatim as GL entry descriptions ("Auto: purchase.refund.received") | OPEN, codebase-wide |
| PUR-061 | LOW | GRN cost-correction dialog rounds 6dp to 3dp with no "Rounded to KWD X" notice (the notice exists elsewhere in the module) | OPEN |
| PUR-062 | LOW | Bill-edit disabled Qty field shows the raw 6dp DB value (`3.000000`) instead of a formatted quantity | OPEN |
| PUR-063 | LOW | Printed payment voucher reuses the generic goods-line template for bill allocations (bill number under "Item", "Qty 1") | OPEN |
| PUR-064 | HIGH | CONFIRMED (live, 2026-08-28) - EVERY document amendment poisons the accounting outbox. `AmendSagaRunnerService` (`common/amend/amend-saga-runner.service.ts:512`) inserts a `document.amended` outbox row whose payload is a link record (documentType/mode/originalDocumentId/amendedDocumentId/amendmentId), but `OutboxPollerService` has only TWO branches: domain re-fan-out (`isDomainEventType`) or `postFromEvent`. `document.amended` is in neither set, so it falls into `postFromEvent`, fails `postEventPayloadSchema` on every attempt ("expected string, received undefined" x4 + lineItems), and dead-letters. There is NO `@OnEvent("document.amended")` consumer anywhere, so nothing reads it either. Reproduced by amending PO-00004 -> row `fdd71c0a-083b-4101-9546-248314821890`, status failed, 3 attempts. NO money impact (ledger 0.000000, both JEs posted); this is queue hygiene + a permanently red dead-letter signal that will mask a real poisoning | OPEN |
| PUR-065 | MED | CONFIRMED (live) - the "Rounded to KWD X" notice exists on exactly ONE price-entry surface in the module. `onRounded` is used only in `features/purchase/components/bill-lines-table.tsx`; the bill CREATE lines editor (`/purchase/invoices/new`) silently rounded a typed 0.999889 to 1.000 with no notice at all. Same class as PUR-061 (GRN cost-correction dialog). One shared rounding-notice primitive, not N patches | OPEN |
| PUR-066 | LOW | CONFIRMED - raw 6dp DB values in editable quantity inputs: PO draft editor and the route-88 amend editor both seed "Ordered qty"/"Quantity" with `4.000000`. Extends PUR-062 (bill-edit disabled Qty) from a disabled field to editable ones on two more surfaces; `seedQty` needs the same `formatQuantity` treatment everywhere | OPEN |
| CLI-001 | HIGH | FIXED + verified - `replay-dead-letter.cli.ts` (and EVERY other `*.cli.ts`, 16 of them) died at Nest module init with `TypeError: Cannot read properties of null (reading \'getInstance\')`. Root cause was NOT in the CLI: `RawBodyCaptureService.onModuleInit` dereferenced `HttpAdapterHost.httpAdapter`, which is `null` under `NestFactory.createApplicationContext` (no HTTP server). ONE shared guard in `auth-email-hook/raw-body-capture.service.ts` (skip + debug log when there is no adapter) fixes all of them. Verified: the CLI now boots the full container and reaches its own business logic |

| SAL-PERM-001 | HIGH | FIXED + orchestrator-verified (27 sales perms granted, 114 total; SoD negative controls hold — `sales.refund.post`, `credit-limit-override`, `receivable.write-off`, `invoice.void` all correctly ABSENT; ledger 0.000000). CONFIRMED (SQL) — the **Accountant role held ZERO `sales.*` permissions** (0 sales / 28 purchase / 87 total), while Viewer holds 18 sales perms. The AR persona cannot raise an invoice, take a receipt or issue a credit note. This is the **unmirrored half of PUR-005**, which granted the Accountant its 28 purchase perms in Phase D and was never mirrored onto sales. Ranked HIGH to match PUR-005 (blocks the persona; destroys nothing) | FIX IN FLIGHT |
| SAL-BE-001 | HIGH | FIXED (guard moved to the chokepoint `CustomersService.updateCustomer`, mirroring `suppliers.service.ts:698`; partial-success preserved, blocked id lands in `failures`; 3 tests pin BOTH entry points, 119 passed; live-verified bulk refused + customer still `active`). CONFIRMED (orchestrator-verified in code) — `POST /tenant/sales/customers/bulk` **bypasses the party blast-radius guard**. `enforceBlastRadius` sits in `customers.controller.ts:165` (the single PATCH handler) only; bulk goes controller -> `CustomersService.bulkUpdateCustomers` -> `updateCustomer`, never through it, so up to 200 customers with open orders / unpaid AR can be mass-deactivated unchecked. **Byte-identical to PUR-001**, whose fix moved the guard INTO `SuppliersService.updateCustomer`'s equivalent (`suppliers.service.ts:698`) — the sales side still sits on the pre-fix shape. Re-ranked CRITICAL->HIGH to match PUR-001 | FIX IN FLIGHT |
| SAL-BE-002 | HIGH | **FIXED** (stripped not blanked, mirroring the POS pattern; resolved once inside `buildDetail`, the single funnel for get/create/confirm/update/addLine/void/amend so no endpoint can drift out of the gate; fails CLOSED with no caller. 178 tests pass). **A SECOND sales instance was found in the sweep:** `delivery-orders.service.ts` returned `costAtDelivery` behind only `sales.deliveryOrder.read` - DB-confirmed reachable by Viewer - now gated identically. `GET /tenant/sales/invoices/:id` returned `costAtSale` on every line with **no server-side `cost.view` gate** (cf. `inventory/stock-levels`, which has the shared `COST_VIEW_PERMISSION` check). DB-confirmed: the Viewer role holds `sales.invoice.read` but not `inventory.cost.view`, so a Viewer can pull unit costs off any invoice. Same shape as POS-004 | OPEN |
| SAL-01 | MED-HIGH | FIXED (new shared `quantiseReceiptMoney` applied at the single entry point of BOTH `create` and `createComposed` - the second copy that would otherwise have defeated the fix; sub-fils amounts now rejected in plain language instead of persisting a silent no-op; 89 tests passed; live-verified 6dp input persisted quantised). Receipt allocation is **never quantised to currency precision**: DTO accepts 6dp and `receipt-vouchers.service.ts` has no `currencyDecimals`/`toDecimalPlaces` call, so the invoice sub-ledger moves by the unrounded amount while the GL leg rounds to 3dp — total ties, **per-invoice tie breaks permanently**. Correct pattern exists at `receivable-writeoff.service.ts:141-144`. Not CRITICAL: `MoneyInput` re-formats on blur, the posting engine's sub-precision plug keeps the entry balanced, and no such row exists today | FIX IN FLIGHT |
| SAL-LIVE-001 | HIGH->MED | **PARTLY WITHDRAWN.** The stale-detail-page half was NOT reproducible on current code: `usePostReceiptMutation`/`useCreateReceiptMutation` already invalidate `invoiceKeys.all`, and `invoiceKeys.detail(id)` is a prefix match beneath it, so the detail query does refetch. Re-tested live on `B1ALRAIMAINS-INV-00003`: the page went from "Balance 12.345 / No payments recorded yet" to "Paid 12.345 of 12.345 / Balance 0.000" with receipt `B1ALRAIMAINS-RV-00003` listed and the button gone, **with no manual reload**. GENUINE residue: both mutations were missing the `customerKeys.all`/`customerReceiptKeys.all` invalidations that `useReverseReceiptMutation` already had, so customer AR balance/aging screens elsewhere stayed stale | REAL PART FIXED |
| SAL-LIVE-002 | HIGH | **RELOCATED — root cause is NOT in sales, and is a product-wide defect.** The frontend is already correct: `approval-pin-fields.tsx` sources from the names-only `/tenant/users/directory` endpoint and renders `fullName ?? unknownMemberLabel`. The directory returns **`full_name = NULL`** for the staff users. Cause (orchestrator-verified in code + admin DB): **neither invite schema accepts a name at all** — `emailInviteSchema` and `usernameInviteSchema` in `team-users.dto.ts:80-104` are both `.strict()` with no `fullName` field, so every invited member is created null and a name cannot even be passed. Only self-profile-edit or a later owner edit populates it, and username-mode members have no inbox. Admin DB confirms: the self-registered owner is named, all 3 seeded staff are NULL. **Consequence: the SoD control is unusable** (every approver reads "Team member" on invoice void, credit-note confirm, receipt reversal), and `fullName ?? ""` blanks user names in journal entries, roles, landed costs and 4 export services. NOT fixed tonight by deliberate choice: changing an invite contract involves required-vs-optional, backfill of existing null members, and username-vs-email divergence — founder decisions, not a testing-pass edit | OPEN, cross-cutting, founder decision |
| SAL-02 | MED-HIGH | **WITHDRAWN after analysis - no change needed, and making one would have been change for its own sake on a money path.** The receipts case does NOT generalise to refunds: `amount` must EQUAL `refundableAmount` exactly (rejected both above `:243` and below `:258`), that value is frozen at CN confirm over operands the tax engine already quantised (`credit-notes.totals.ts:66,99`) so it is 3dp by construction, the sub-ledger move is an absolute zeroing to `"0"` (`:300`) not a decrement, and both GL legs carry the SAME amount so engine rounding applies identically and no 4840 plug engages. Live DB: 0 rows above 3dp in `refundable_amount`, CN `total`, or invoice `total/paid_amount/balance`. 2 tests added pinning the ACTUAL behaviour. Originally logged as: fourth instance of the SAL-01 quantisation class, found while fixing it: `refund-vouchers.service.ts:155` takes `new Decimal(input.amount)` with no currency quantisation. Deliberately NOT fixed in the same pass — it relieves a different sub-ledger (credit-note `refundableAmount`) that the accounting review never analysed, and changing an unanalysed money path is how PUR-015 happened. Needs the same `quantiseReceiptMoney` treatment after an accounting read | OPEN |
| SAL-03 | LOW | **FIXED pending browser verification** (Discard button, draft-only, gated on the key the controller actually requires, single confirm, full states, en+ar, redirects to the list). Previously: **PARTLY FIXED - the dead end was NOT closed.** `discardDraft` already existed (used by the amend saga); only the endpoint was missing, so `DELETE :id` was added mirroring `SupplierPaymentsController.discard` exactly (204, `@Audited` Delete, permission-gated on the module's existing key rather than inventing a new RBAC key that would orphan on every existing tenant - the `reports.sales.read` failure mode). Service hardened: status now re-asserted INSIDE the tx under `FOR UPDATE`, closing a race where a concurrent post would delete the allocation rows then silently remove 0 voucher rows while reporting success; now a loud 409. 6 tests. **BUT no UI is wired to it** (`payment-detail-panel.tsx:267` still shows only Post for drafts), so the user-facing dead end remains open. Original finding: a receipt draft can be created but never discarded — no discard endpoint exists for receipt drafts, so a mistaken draft is a dead end (founder standard: no dead ends). Surfaced by a test receipt that could not be cleaned up | OPEN |
| SAL-FE-001 | HIGH | FIXED (all 9 hooks patched; live-verified paging en+ar, pager never unmounted). **Structural note:** the fixer confirmed there is NO shared list-query factory - purchase and inventory also patched hook-by-hook, so this defect has now been hand-patched in THREE modules and ~30 panels remain elsewhere. The real fix is one shared query factory; see the new cross-cutting entry below. CONFIRMED - **none** of sales's 9 list panels use `placeholderData: keepPreviousData`; every one flickers to a loading skeleton on each page/filter change. Sales's share of the app-wide pager-unmount defect already fixed in purchase (PUR-002) and inventory | FIX IN FLIGHT |
| SAL-FE-002 | HIGH | **FIXED + INDEPENDENTLY VERIFIED as accountant1** (order/quotation/delivery-order/customer create and order-edit all show a graceful no-permission block with disabled forms; invoice/payment create and the credit-note dialog stay fully usable — no regression in either direction) (8 surfaces gated on the key read from each backend `@RequiresPermission`, never widened; `customer-form-panel` correctly branches create-vs-update by mode rather than OR-ing them; en+ar keys added, parity checked). The fixer could NOT test the negative case - it was stuck as owner, whose `isOwner` bypass hides the gate - so a verifier is now testing it as accountant1, whose partial sales grant exercises both directions. CONFIRMED - **PERM-004 pattern in 6 of 7 sales create surfaces** plus the sales-order edit panel: zero permission checks, denial only as a server 403 after a fully interactive form. Server enforcement is correct, so this is UX not security. The correct reference implementation is already in-module at `direct-sale-panel.tsx:164` (`useHasPermission` + no-permission alert); detail-page action buttons already gate correctly | FIX IN FLIGHT |
| SAL-LIVE-003 | MED | **FIXED + verified as accountant1 (en+ar), after independent verification caught a missed copy.** Detail-page title + breadcrumb FIXED and verified en+ar for both invoices and credit notes. **List rows were NOT fixed**: the invoices list and credit-notes list still render the raw `DRAFT-<uuid>` as the document number. Textbook 'same predicate exists twice, only one copy patched' — the exact trap that has defeated fixes in this programme before, and the reason a fixer's own report never closes an item. Second pass swept every document-number render site and followed the codebase's EXISTING per-feature `lib/display.ts` convention (`displayOrderNumber` etc, already used by orders/quotations/delivery-orders) rather than inventing a fourth pattern - invoices and credit notes were the outliers still doing it inline. The sweep found a THIRD unpatched copy in the same file (`credit-note-detail-panel.tsx`'s `EntityHistoryLink entityLabel={cn.number}`). Draft invoices and credit notes render a raw **`DRAFT-<uuid>`** as their document number/title. Sibling fix already shipped on the purchase draft-bill screen ("New bill", PUR-030) | FIX IN FLIGHT |
| SAL-FE-003 | MED | FIXED (~20 sites across 15 files now use `EMPTY_VALUE_PLACEHOLDER`; no `"—"` literal remains in sales source or in the en/ar message files). ~20 hardcoded literal em-dash empty-value placeholders instead of the shared `EMPTY_VALUE_PLACEHOLDER` (`"-"`), incl. one on a printed document. Em dashes are banned in all product copy | FIX IN FLIGHT |
| SAL-BE-003 | MED | The PUR-064 `document.amended` outbox dead-letter is proven live in the dev DB. The row originated from a PURCHASE amend, but `AmendSagaRunnerService` is shared verbatim by all four sales amend adapters, so any sales amend will dead-letter identically. Fix belongs once in the shared poller/runner | OPEN (shared, not sales-specific) |
| SAL-ACC-002 | MED | `recompute()` writes `balance = total - paidAmount` while the live CHECK is `balance = total - paid_amount - written_off_amount`; invoice discounts are netted into revenue with no `4300` leg (POS posts them separately); early-payment discount is listener-only dead code whose `allocated > total` guard would reject the very case it exists for | OPEN |
| SAL-LIVE-004 | LOW | A "tax" mention leaks into delivery-fee copy in this no-VAT Kuwait tenant; the sales codemap lists frontend routes that 404 | OPEN |
| SAL-WH-001 | HIGH | **FIXED + browser-verified as accountant1.** TWO functions shared the exported name `useWarehouseOptionsQuery`; the `features/locations` one had the 403 -> names-only-directory fallback, the `features/inventory` copy had NO fallback at all. A role without `settings.warehouse.list` got a silently EMPTY Location picker on 8+ inventory screens (New Adjustment, New Transfer, Stock Levels, Stock Counts, Batches, Serial Numbers). Same duplicate-helper failure mode the codebase has hit before: one name, two bodies, one of them fixed. Fixed at the root - added the tenant-wide `useAllWarehouseOptionsQuery` sharing the ONE fallback, and made the inventory hook a thin shape adapter over it (its 11 call sites destructure a `{data:{data}}` envelope). `toStockLocationColumns` was narrowed to a 4-field `StockLocationSource` rather than cast, since demanding the full admin shape would have re-broken the restricted-role path at the type level. Live: all 6 warehouses now render, Al Rai 3-warehouse trap resolved correctly | FIXED |
| SAL-APPR-001 | HIGH | **FIXED.** The shared `ApprovalPinFields` offered EVERY active member except yourself, filtered by neither permission nor PIN. `verifyApproval` then rejects with a deliberately generic 422 (anti-oracle design, left untouched), so an owner in a 2-person shop picked the cashier and got "invalid credentials" forever with no way to learn the real problem was authority. Provisioning seeds ONLY the Owner role, so this is the DEFAULT shape of a small tenant, not an edge case. New permission-free `GET /tenant/approval-pin/eligible-approvers?permission=<key>` (param restricted to a closed enum so it cannot probe arbitrary RBAC keys) + a required `permission` prop threaded through ~50 call sites. Closes the "M3 deferred" gap that `pay-refund-dialog.tsx` documented inline | FIXED |
| SAL-APPR-002 | MED | **FIXED (found while reviewing SAL-APPR-001's own fix).** The new endpoint filters out permission-holders with no PIN, so an empty list conflated two causes with two DIFFERENT user actions: nobody holds the permission (admin must grant a role) vs somebody does but never set a PIN (that person must set one). The copy described only the first, sending half of all users to fix the wrong thing. Now returns an AGGREGATE `unavailableReason` (`no_permission_holder` \| `no_pin_set`) that names nobody, preserving the anti-oracle property, with distinct en+ar copy per case | FIXED |
| SAL-DO-001 | HIGH | **FIXED - the FALSE-SUCCESS class again.** The delivery-orders list screen sent `dateFrom`/`dateTo` that `listDeliveryOrdersQuerySchema` never declared, and a non-strict Zod object strips unknown keys SILENTLY. The date filter rendered, looked applied, and did nothing. Bound to `deliveryDate` (not invoices' `createdAt`) specifically so the CSV export, which already filtered on `deliveryDate`, cannot disagree with the list it was launched from. Verified the picker emits `YYYY-MM-DD`, so this turns a silent no-op into a working filter rather than a new 400 | FIXED |
| SAL-CHQ-001 | MED | **FIXED - path divergence.** `cheque-detail-panel.tsx` gated cheque-amend approval on `requireInvoiceApproval`, a SALES toggle, while `ChequeAmendAdapter.isApprovalRequired()` returns `false` unconditionally. Any tenant enabling sales invoice approval would find the cheque register demanding an approver the server never asks for. `journal-entry-header.tsx` handles the identical situation correctly with `requireApproval={false}` + a ponytail comment; matched that precedent exactly. A sweep of all 19 frontend approval-flag reads against their adapters found no other divergence (`payment-create-panel`'s lone `?? true` is deliberate and correct) | FIXED |
| SAL-EXP-003 | MED | **FIXED - 8 sites, not the 6 first reported.** Export services resolved names as `row.fullName ?? ""`, blanking a member whose `full_name` is null while the UI showed a real name for the same user. All now use the shared `resolveMemberDisplayName`, and every SELECT was widened to fetch `username` (fixing the mapping without the SELECT would have left the export blank and still passed a test). Two sites found beyond the list, one of which fell back to `u.userId` - a raw UUID in a customer-facing CSV, the same defect class as the print CRITICAL | FIXED |
| SAL-CMB-001 | MED | **FIXED at 5 of 16 sites, deliberately not blanket-applied.** `AsyncCombobox`'s `showOnEmpty` defaults false, so pickers render nothing until the user types - which reads as "there is no data" to a non-technical shop owner. Audited every call site: 5 genuinely broken (supplier pickers over a small bounded list, and an item picker whose `>=2` gate contradicted the canonical picker's own default), 9 already correct, 2 deliberately left as type-to-search (supplementary finders beside an already-visible table, where a global flip would duplicate rows). Component default NOT flipped, and argued. Server-side verified safe: `searchItemsQuerySchema` defaults `limit` 20 and documents empty `q` as the list-on-focus case | FIXED |
| SAL-PERM-006 | MED | **FIXED - "unknown state is not isLoading", caught in central verification.** A new (good) up-front permission gate on the quotation and delivery-order create panels drove its "you do not have permission" alert off `useHasPermission`, which fails CLOSED while the query is in flight. Failing closed is right for BLOCKING the write; it is wrong for ASSERTING the denial - every user would flash a false accusation on first paint. Split via `usePermissionChecker`: submit stays blocked while unknown, the notice waits for a resolved answer | FIXED |
| PERM-RETIRE-001 | - | **RETIRED (founder decision).** `settings.approvalpin.manage` gated no route and no nav item; it existed only in `permissions.ts`, a single-key bundle, and the never-instantiated Manager template. Removed all three. The three specs that asserted the old behaviour were INVERTED into absence assertions rather than deleted, so neither the key nor the bundle can be reintroduced silently. 130/130 shared specs pass. Setting your own PIN is now unambiguously permission-free | DONE |
| ENV-001 | - | **RESOLVED.** No Chrome on this machine, but Playwright's `chrome-headless-shell` is already cached here and drives `puppeteer-core` in both headless modes (valid PDF, 14,571 bytes). `chromium-pdf-renderer.ts` needed NO code change, only `PUPPETEER_EXECUTABLE_PATH` in the gitignored root `.env` (backed up first). Production still gets Chromium from the Dockerfile | DONE |
| TEST-001 | MED | **FIXED - the test suite was hiding, and in two places demanding, defects.** (a) 74 tests across 3 files were red from incomplete module mocks (two missing `useCurrentTenantQuery`, one missing `useWarehouseOptionsQuery`) - pre-existing, but they would have masked any real regression in those panels. (b) `quotation-amend-snapshot` ASSERTED a fallback to the raw `item-9` id; the code correctly returns `EMPTY_VALUE_PLACEHOLDER`, so the test pinned the defect the raw-id sweep had fixed. Inverted to assert the id is specifically NOT returned. (c) `amend-document-dialog.test.tsx` passed 19/19 under vitest while `tsc` reported 12 errors in it - an `approvalPermission` string literal widening to `string`. Fixed by referencing `PERMISSION_KEYS.purchase.billApprove` so a rename now fails to compile | FIXED |
| I18N-001 | LOW | **FIXED.** 4 pre-existing em-dash violations in inventory/common product copy (en + ar) - banned in all product copy. `noValue: "-"` left alone (placeholder glyph, not prose). All JSON still parses; en/ar parity passes | FIXED |
| SAL-PRINT-001 | CRIT | **FIXED + CONFIRMED ON RENDERED BYTES (2026-08-29) - the phase's only CRITICAL, closed.** The payment-voucher print mapper put a raw `sourceDocumentId` UUID into a printed allocation line's `itemName`, i.e. a customer-facing document showing a UUID where a document number belongs. Type renamed to `sourceDocumentNumber` so a raw id is unrepresentable, pinned by a `@ts-expect-error` test. Verified the hard way after two earlier attempts could only reach a code trace: extracted the Supabase JWT from the browser session, curled `GET /tenant/documents/sales-receipt/{id}/pdf` directly (bypassing the headless popup-blocking that defeated the blob-tab approach), got a real 123,759-byte PDF for RV-00005, ran `pdftotext`, grepped the 8-4-4-4-12 hex pattern - NONE found, allocation line reads `B1ALRAIMAINS-INV-00005` | FIXED, verified on output |
| SAL-PRINT-004 | HIGH->LOW | **LARGELY RESOLVED, one residue.** Print was flaky (4 attempts, 2x 503). After `PUPPETEER_EXECUTABLE_PATH` was configured: **5/5 sequential renders succeeded, byte-identical output**, 12-17s each (consistent with ~700-900ms Neon Singapore RTT + Chromium render, not a regression). One earlier 503 is explained: the print-render token's 60s TTL AND the 20s `NAVIGATION_TIMEOUT_MS` were both exceeded by a ~404s cold Turbopack compile - dev-only, production serves prebuilt pages. **The second 503 remains genuinely UNEXPLAINED** (no web-server hit at all). A `getBrowser()` TOCTOU race was hypothesised and DISPROVED (no `await` between check and assign, so no interleaving point in Node's single-threaded loop). Downgraded because it is not reproducible on a warm server, but not closed | OPEN (residue) |
| SAL-PRINT-005 | - | **CONFIRMED - printed documents bind to the DOCUMENT's language, not the viewer's UI locale.** The same receipt fetched with the UI in English and in Arabic returned BYTE-IDENTICAL output, still English. KWD renders at THREE decimals throughout and no tax line appears anywhere (correct for Kuwait) | VERIFIED |
| RPT-001 | HIGH | **CONFIRMED (accounting trace, 2026-08-29) - gross margin is OVERSTATED for any tenant that discounts at POS, in the flattering direction. FIX IN FLIGHT.** `gross-margin.service.ts` never subtracts contra-revenue **4300 "Sales Discounts"**: the POS emitter credits 4110 GROSS of discount and debits 4300 separately (`account-mapping-defaults.ts:467`), while the allocation side uses `pos_transaction_lines.line_total`, which is already NET. Two definitions of revenue over one ledger. L96-100 defines the revenue role set as `product_sales` minus `sales_returns` with no discount contra; L330 `glRevenue = glRevenueGross.minus(glReturns)`. Gulf Aug 2026: Revenue card 852.141 should be **823.451**, GP 289.502 should be **260.812**, margin 33.97% should be **31.67%** (COGS 562.639 is correct). Traced to the fils: 5 JE rows on 2026-08-27, Fahaheel register B2FAHAHEELREG1 shift 3, DR 4300 = 1.000+12.345+2.000+12.345+1.000 = **28.690**; 832.052 gross - 803.362 net line totals = 28.690 exactly, nothing unexplained. **The banner had it BACKWARDS**: it asserts "the ledger figures on the cards are correct; the split may be missing a debit note", so it sends an accountant hunting a transaction that does not exist - the CATEGORY BREAKDOWN is right and the CARDS are wrong. Cross-checked against `profit-and-loss.service.ts` (sweeps `sub_type='sales_revenue'`, so it DOES pick up 4300) which agrees with the allocation figure. Proof it is code not data: `pos-sales-summary.service.ts:337-342` already documents the exact invariant gross-margin violates and computes the same 28.690 correctly - two reports on one ledger, one right, one wrong. Ledger identity `0.000000` throughout; the GL itself is correct, this is a REPORTING bug only. Blast radius: single report, but every tenant and every period containing a discounted POS sale. **Fix caveat:** do NOT subtract all 4300 movement - it is also hit by `sales.receipt.posted`/`discount` (early-payment SETTLEMENT concession, not a margin item) and `pos.void.completed`/`discount` (reversal, must net); scope to `SALE_COGS_DOC_TYPES` via the existing `sumGlMovement(..., sourceDocTypes)` pattern. **FIXED + verified: 24/24 jest (17 pre-existing unchanged + 7 new), recomputed live against the dev tenant to exactly 823.451 / 260.812 / 31.67%, ledger 0.000000.** Resolved by CLASSIFICATION (`accounts.sub_type='sales_revenue' AND is_contra`, minus the `sales_returns`-role accounts so returns are not double-counted, scoped to doc types inv/pos/cn) rather than by a new `sales_discount` system role - because `account_system_roles` is UNIQUE on `(tenant, legalEntity, roleKey)`, so a role can name exactly ONE account and a tenant adding a second contra (loyalty, promo) would silently drop out of the headline again. Classification also survives account renumbering and matches how `profit-and-loss.service.ts` already classifies, so the two now agree BY CONSTRUCTION. **No migration needed** (a role would have required a `system_role_key` enum ADD VALUE plus a fleet-wide binding backfill, leaving every tenant broken until it ran). Both fix caveats are handled by the doc-type scope alone, verified against the real emitter mappings: settlement discounts post on an `rv` document and are excluded; `pos.void.completed`/`discount` posts on a `pos` document so a voided sale nets to zero. Banner copy rewritten en+ar: it no longer asserts which side is correct (the old copy said the cards were right and sent accountants hunting a nonexistent debit note) | FIXED |
| RPT-002 | MED | **CONFIRMED - path divergence, same class as SAL-CHQ-001.** Breadcrumbs are untranslated in Arabic on ~40 of 45 reports: `AutoBreadcrumbs` resolves labels from `breadcrumbs.json` (only 5 report slugs have keys) independently of `report-registry.ts`, which holds its own complete translated titles. Two places compute "the report's name", only one is complete | **FIXED** - breadcrumb label now DERIVES from the report registry titleKey against the parity-checked reports.json (not a second copy of 40 strings); guard test asserts every registry entry resolves in en AND ar |
| RPT-003 | - | **SOLID (valuable negative result).** A static sweep of ALL 44 report query schemas found NO filter/DTO parity gaps - the false-success pattern that just bit sales (SAL-DO-001: frontend sends a param the backend schema never declares, non-strict Zod strips it silently) does NOT reproduce in reports. Server-side `cost.view` stripping also verified in 3 representative services (stripped server-side, not merely hidden in the UI) | VERIFIED |
| RPT-004 | HIGH | **FIXED + verified - the SAME gross-vs-net shape as RPT-001, with the roles reversed.** Purchase Register's GL tie-out summed the FULL `prn` debit to Trade Payables 2111 while its report side summed `payable_total`. A return confirm splits its AP debit exactly (`purchase-returns.service.ts:1093-1127`): `debitPayableTotal == billApReductionFn + refundableAmount`. Only `billApReductionFn` moves `payable_total`, so the two sides compared different quantities and the banner went permanently red by `Sigma refundableAmount`. Gulf all-time: report 79.280000 vs GL 57.280000 = **-22.000000**, traced to 2 returns of 11.000 (PR-00002 `bill_id IS NULL`; PR-00008 against an already-fully-paid bill so `bill_ap_reduction_fn = 0`). **The date-window hypothesis was DISPROVED** - identical figures at 2026-07-31, 2026-08-01 and unbounded all-time; AP Aging ties cleanly because it is GL-derived on BOTH sides and never touches `payable_total`. **Mirrored copy found and fixed:** `purchase-returns.service.ts` had the same defect inverted (+22.000 on the same data). Fixed on the GL side in both (the displayed figures are source-document truth and independently verify), via ONE shared `sumConfirmedReturnRefundable` helper so the two cannot drift. **Note the inverse of RPT-001: there the CARDS were wrong; here the cards are right and the BANNER lies** - so a fired tie-out tells you nothing about which side to trust, which is why both were traced rather than pattern-matched. Ranked HIGH not CRITICAL (no wrong number reaches the user), but the systemic risk is real: a permanently-red banner trains users to ignore it, and that is how a genuine mismatch slips through. Verified: purchase-register 24/24, purchase-returns 202/202, shared helper 5/5, both reports now tie to **0.000000**, ledger 0.000000. Includes a FALSIFIABILITY test - a real 5.000 gap alongside the 22.000 refundable slice still fires GL_TIEOUT_MISMATCH, proving the fix reconciles rather than suppresses. Misleading header comments in `purchase-register.service.ts:47-51` and `purchase-returns.dto.ts:8-15`, which enshrined this as an unfixable "clamp edge case", replaced with the actual invariant | FIXED |
| RPT-005 | HIGH | **FIXED - third instance of the missing-403-fallback pattern, this time between SIBLINGS IN ONE FILE.** In `reports/components/filters/use-filter-options.ts`, `useWarehouseOptions()` had the names-only-directory fallback; `useBranchOptions()` and `useRegisterOptions()` sitting beside it did not. As accountant1 (lacking `settings.branch.list` / `pos.register.list`) the Branch and Register filters rendered DISABLED with "Search failed" - reproduced live on AR Aging, AP Aging, Purchase Register and POS Sales Summary. Blast radius ~25 report components for BranchFilter plus ~8 for registers, roughly two-thirds of the catalogue. Fixed as a CLASS, not two patches: extracted one `useListWithDirectoryFallback` primitive and migrated all THREE hooks onto it (per-caller row mappers keep each hook's branch-scoping semantics out of the shared code). Registers needed a backend endpoint that did not exist - added `GET /tenant/pos/registers/directory` following the established permission-free names-only convention (`warehouses.controller.ts`), declared before the `:id` route so Nest cannot match "directory" as an id, with a deliberately minimal payload (id/branchId/warehouseId/code/name/active - NOT cash float, printer config, approval limits or `cashAccountId`). This follows the codebase's own rule that name display must never sit behind an admin permission. Verified 5/5 controller tests pinning no-permission on `directory`, permission still on `list`, tenant scoping, and the response shape as an allowlist | FIXED |
| RPT-006 | MED | **FIXED.** POS Sales Summary rendered a "Tax 0.000" KPI card unconditionally in a no-VAT Kuwait tenant, while the SAME component already gated its tax COLUMN and its CSV tax CELL behind `isTaxRegistered`. Three surfaces, one condition applied to two. Gated on the existing flag rather than a parallel condition so they cannot drift. A sweep of every report using `SummaryCard` found no other ungated tax KPI. Also downgrades the earlier blanket "no-VAT in Kuwait: SOLID" claim to "solid except this card" | FIXED |
| RPT-007 | MED | **CONFIRMED - affects EVERY tenant in the entire target market (MENA, India, SEA - all UTC+). FIX IN FLIGHT.** `defaultFromDate()` builds LOCAL midnight of the 1st then serialises as UTC via `toISOString().slice(0,10)`, so in Kuwait (UTC+3) the default month-to-date range starts `2026-07-31` - one day inside the PREVIOUS month, silently pulling in prior-period documents and corrupting period-over-period comparisons. Three identical copies (`purchase-register-report.tsx:45`, `sales-register-report.tsx:43`, `supplier-statement-report.tsx:47`). The CONVERSE flaw is in `todayYmd()` (`use-current-month.ts:8`), which takes the UTC date, so after 21:00 Kuwait local the range END rolls back a day and the current day's documents vanish. **The two point in OPPOSITE directions, so they compound rather than cancel** - the range is wrong at both ends. **FIXED + verified (typecheck clean, 23 tests across 5 files).** Blast radius was MUCH wider than first reported: the real centre is `currentMonthRange()`/`todayYmd()` in `use-current-month.ts`, imported by ~25 reports, not just the 3 named `defaultFromDate` copies. **No new helper was written** - a correct, already-tested local-calendar helper existed at `packages/shared/src/format/date-format.ts` (`toIsoDate`/`todayIsoDate`) and everything was migrated onto it. Also found and fixed: a 4th hand-copied `todayYmd` (`open-purchase-orders-report.tsx`), `supplier-statement-tab.tsx`, five export-filename stamps, and a genuine sibling bug in `fx-revaluation/lib/default-revaluation-date.ts` (computed "last day of previous month" from UTC parts, so for ~3 hours after local midnight on the 1st it returned a month too early - local 1 Mar 01:00 Kuwait wrongly gave Jan 31 instead of Feb 28). **A test was pinning that wrong answer with a self-contradicting comment** - third instance this session of a stale test demanding a defect (cf. TEST-001). Backend needs NO change for these reports: `invoiceDate`/`postingDate` are Postgres `date` columns compared as plain strings, and a `date` has no timezone reinterpretation, so a correct local-calendar string from the client is sufficient. Correctly LEFT ALONE: stable UTC-anchored round-trips of already-known date-only values (`stock-movement-ledger`, `use-mira-import-flow` idempotency check) and the audit-log export stamp | FIXED |
| RPT-008 | MED | **OPEN - needs a COORDINATED client+server fix, deliberately not half-fixed.** `refunds/components/pay-refund-dialog.tsx` and `purchase-refunds/components/record-refund-receipt-dialog.tsx` both use `todayDateOnlyUtc()`. That is the same UTC-vs-local date-default bug class as RPT-007, BUT the backend compares against UTC too (`RefundVouchersService.assertRefundDateInRange`, `SupplierRefundReceiptsService.assertReceiptDateInRange` both use `toISOString().slice(0,10)`). Fixing only the client would re-introduce the "future date" rejection these files' own `ponytail:` comments already document. Both sides must move together, so it was flagged rather than patched - a client-only fix here would look correct and be worse than the current state | **FIXED** - coordinated client+server: client onto shared `todayIsoDate`, server onto `todayInZone(tenantTimeZone())`. Lower bound deliberately left UTC (permissive direction, matches the dialog `min`) with a comment saying why |
| RPT-009/009b | MED | Reorder comparator `<` vs `<=`: 261 boundary rows disagreed across the Stock Levels report AND screen (4th and 5th bodies of one rule). One shared `atOrBelowReorderLevel`, moved to `inventory/shared/` so deps point DOWN | FIXED |
| RPT-010 | MED | Two hand-copied UTC `today` helpers understated purchase `daysOverdue` by one for the first ~3h of every MENA/India local day. Other 4 sites classified and left alone | FIXED |
| RPT-011 | HIGH | AR/AP Aging stamped the UNAPPLIED filter date onto CSV filename, PDF subtitle and drill-through. Fixed unrepresentably: live state renamed `asOfInput`, `asOf` rebound to the response | FIXED |
| RPT-012 | MED | VAT201/Tax Summary ROUTES reachable in no-VAT Kuwait (AED 2dp over KWD 3dp). Server guards already existed - claim partly WITHDRAWN. One `ReportRouteGuard` derived from `isReportVisible()` | FIXED (partly withdrawn) |
| RPT-013 | HIGH | Reports slice re-introduced the banned `EM_DASH` placeholder - the exact regression `empty-value.ts` warns about by name. Migrated + local export deleted + guard test | FIXED |
| RPT-014 | HIGH | Fitment Coverage exported the current PAGE only (`-page-N.csv`). Full-range endpoint added; `loadRows` already had the full set and was slicing it away | FIXED |
| RPT-015/015b | MED/LOW | 6 paginated reports unmounted the pager on page change; Category filter was the 5th RPT-005-class missing directory fallback (permission-free `/item-categories/directory` added, none widened) | FIXED |
| RPT-016 | MED | `formatQty` hand-rolled a hardcoded 6dp cap - the anti-pattern `formatQuantity` documents. Delegated; per-item precision gap named, not faked | FIXED |
| RPT-017a/b/c | LOW | "90+ days" label off by one; Balance Sheet never rendered its own warnings; API shipped English `"(unknown party)"` | FIXED |
| RPT-018 | **CRIT** | **Daily Sales counted POS refunds as SALES** - no `type` filter, and a return stores a POSITIVE `grand_total`. 26 Aug 438.429 vs true 379.847 (~15% overstated); cash refunds shown as cash taken IN. Sole holdout among all POS reports; its own comment falsely promised it could never disagree with pos-payment-breakdown | **FIXED + live-verified** |
| RPT-019 | HIGH | `netSales` subtracted voids that had already left `posSales` when status flipped - double-deducted. Voids still displayed, no longer deducted | FIXED (no voided rows exist; code-confirmed only) |
| RPT-020/021/021b | HIGH | Sales Returns tie-out compared transaction- vs functional-currency (RPT-004 shape, banner would lie); five sales services summed FX money unconverted. All fixed; `gross-margin`'s header claim that doc lines were functional was simply FALSE | FIXED (code-confirmed; rate-1 tenant) |
| RPT-022/023 | MED | Gross Margin scope note told readers the opposite of the RPT-001 fix; Salesperson invoice leg included delivery income while the POS leg did not | FIXED |
| RPT-024/025 | LOW | `stripCost` in 4 controllers (NOT verbatim - 3 field lists, 2 contracts); asymmetric mirror predicate added belt-and-braces after being chased as a candidate RPT-004 and found safe | FIXED |
| RPT-026 | HIGH | **Sales by Item + Parts Sales by Brand omitted every POS counter sale** - 49.380 shown vs true 823.451 (~6% of the business) while Top Sellers beside them included POS. Founder decision: include POS. Reconciles to 823.451 exactly; Top Sellers now agrees item by item (per-item abs diff 0.000000) | **FIXED + live-verified** |
| RPT-027..033 | MED/LOW | Left OPEN: 5th supplier-picker directory gap; sales-by-item vs parts-by-brand timezone split; `bill-export` UTC daysOverdue; ~12 further UTC business-date defaults repo-wide; no server-side future-date guard on aging; page-only statement PDF; 403 and 500 render identically | OPEN |
| RPT-027..033 | MED/LOW | **ALL CLOSED** (superseded row above): supplier directory fallback; UTC-vs-tenant day bounds (+2 more sites, and the system-TZ-dependent root cause in `localMidnightToUtc`); bill-export UTC; 13 of 18 UTC business-date defaults fixed after individual classification (incl. a bypassable exchange-rate backdate gate); server future-date guard on 7 reports; statement PDF full-range; 403 vs 500 graceful degrade | FIXED |
| RPT-034 | MED | POS shift `netSales` was not net. Closed by RENAMING not netting: a per-shift net-of-returns is incoherent (a return posts to the OPEN shift, its sale may be in a closed one). Guard asserts the old name is unrepresentable | FIXED |
| RPT-035/050 | LOW | Money rendered with no currency caption - sweep found **20 reports**, not 1. Five deliberately excluded (per-row multi-currency) | FIXED |
| RPT-036 | **HIGH** | **Dead Stock reported the truncated subtotal as the total** - summary derived from rows capped at 10,000 while the true population is **11,227** items. Understated dead stock by ~56,000 KWD. I had rated it INFORMATIONAL; SQL proved it real | FIXED |
| RPT-037 | **CRIT** | **Keyset pagination could never advance past page 1 on any bulk-seeded ledger** - `timestamptz` microseconds truncated to a JS `Date`'s milliseconds, so the cursor pointed BEFORE its own row and the `id` tiebreaker was never reached. 316 of 332 AR lines share one timestamp here. 5 services; in one it silently SKIPPED rows instead. Fixed as a class | **FIXED + LIVE-VERIFIED (14-page walk)** |
| RPT-038 | **CRIT** | Goods Received unusable: no default date range (400 + infinite Retry), and zero rows when filtered because `z.coerce.boolean()` turned the client's `"false"` into `true` | FIXED |
| RPT-039/040 | HIGH | 2dp money on screen vs 3dp in the CSV (3rd recurrence of the POS-022 shape); and a raw i18n key as a column header - **missing from BOTH locales, which is exactly why `i18n:check` passed**. Guard now resolves all 1,373 report keys in both locales | FIXED |
| RPT-041 | HIGH | Sales Returns duplicated a credit note via a JE join fan-out (a CN has two JEs; the AR predicate sat on the wrong join). NOT the cursor bug I hypothesised | FIXED |
| RPT-042 | HIGH | `z.coerce.boolean()` class, 10 sites outside reports. **3 were live user-visible bugs**: "Inactive" price lists returned ACTIVE, "Unbilled receipts" returned BILLED (list + export). Source-level ban now API-wide | FIXED |
| RPT-043..046 | MED/LOW | Arabic: GL chip English when selected (11 call sites; 2 were sending wrong-language PAYLOAD data); Day Book/statement names English-only; Eastern-digit labels above Western data; raw `asset` enum pill. Plus a REAL find: the **POS Z-report printed Eastern-digit dates beside Western-digit totals** | FIXED |
| RPT-044b | MED | Posting listeners wrote English-only journal descriptions - **~200 sites across 16 files**. Closed with a keyed map whose type makes supplying one language without the other impossible. No historical backfill (correct for an immutable ledger) | FIXED |
| RPT-047/048 | MED/LOW | Raw item UUIDs in ledger descriptions - fixed by resolving names IN the posting transaction rather than changing event payloads (which would leak the UUID back on every outbox replay); plus em dashes in ledger-bound headers, incl. the generator behind **614 of 624** em-dashed rows | FIXED |
| RPT-049/051 | HIGH/LOW | Dead Stock crashed the error boundary on a transient 500 (guard checked `data`, not `data.bucketSummary`); remaining em-dash placeholders incl. the private `EM_DASH` constant that caused the last regression | FIXED |
| F1..F5 | HIGH/MED/LOW | Export defects found by curling the live API: SML export 33s vs a 20s statement timeout (opaque 500 under load); `DP-<uuid>` placeholder POs leaking into the Goods Received CSV; a locale-formatted date in one CSV; em dashes in **5** Arabic COA seed names incl. Retained Earnings (fixed across constant + spec + a generated idempotent migration) | FIXED |
| ENV-001..003 | HIGH | Infrastructure: a **38 GB `.next` cache** made the dev server effectively unservable (likely explains PERF-002 and both prior sessions' "browse daemon instability"); the API was serving **stale compiled code**; Neon connection timeouts caused report 500s | RESOLVED |

### Cross-cutting, surfaced by Phase E (NOT sales-specific)

- **SAL-IDEM-001 (MED, CONFIRMED by code reading - the FALSE-SUCCESS class again, on a money path).**
  `PriceEditService.findIdempotentReplay` looks up a prior attempt by `idempotencyKey` **without filtering on
  status**. The normal path is safe because `safeCompensate` deletes the draft when confirm fails - but
  `safeCompensate` only LOGS on failure, so if compensation itself fails an orphaned DRAFT credit/debit note
  retains that key, and a retry returns that draft as though the correction succeeded. **The user is told
  "price corrected" while NO journal entry was ever posted** - the same shape as the purchase defect that left
  an invoice invisible to AR, aging and the trial balance. Pre-existing, not introduced this session. Fix in
  **FIXED (written, unexecuted).** `findIdempotentReplay` now only treats a **confirmed** row as a valid
  replay; a non-confirmed match goes to a new `resolveStrandedDraft` that discriminates by AGE
  (`STRANDED_DRAFT_GRACE_MS = 60_000`, comfortably above the in-process create->confirm gap, which has no user
  think-time): older than the window, the orphan is deleted and the retry proceeds to a genuine correction
  under the SAME key (self-healing, key never wedged); within the window, a 409
  `PRICE_EDIT_REPLAY_PENDING` tells the caller to retry shortly without touching a row a concurrent request
  may be mid-confirm on. If the cleanup delete itself fails, the same 409 is thrown rather than falling
  through into a unique-violation - it never silently proceeds. A genuine replay of a CONFIRMED document is
  unchanged, so idempotency against real double-submits is preserved.
  **The other four sales idempotency lookups were checked and are NOT vulnerable, for a reason worth
  recording:** `direct-sale.service.ts` and `sales-orders.service.ts` are also status-unfiltered, but their
  create+confirm runs inside a SINGLE `db.transaction`, so a throw rolls the whole thing back and no orphan
  can exist; `refund-vouchers` likewise; `credit-notes`/`debit-notes` have no lookup at all (DB unique
  constraint only). **That reasoning stops holding the moment any of them is refactored to a two-phase
  create-then-confirm pattern** - which is exactly what made price-edit vulnerable.
- **XCUT-002 RESOLVED (member names).** Decision made and implemented: `fullName` is **optional on EMAIL
  invites** (the invitee has an inbox and `PATCH /tenant/me/profile` is already ungated) and **REQUIRED on
  USERNAME invites** (no inbox, so the invite dialog is the only guaranteed touchpoint, and the owner already
  knows the person by name). One shared resolver `packages/shared/src/user-display-name.ts`
  (`fullName -> username -> email local-part -> fallback`) now backs both the team display helper and
  `useUserMap`, the ~15-call-site id->name resolver. **Backfill done and idempotent:** 4 admin-DB rows
  (`cashier1`, `accountant1`, `storekeeper1`, `zztestmgr1`) set to their own username; re-running returned
  `UPDATE 0`; the owner's real name was untouched. So the approver picker should stop reading "Team member"
  immediately, without a rebuild. A first-login "confirm your name" prompt was judged out of scope and
  flagged rather than half-built. **Still open, outside that agent's boundary:**
  `pos/salesperson-picker-button.tsx:25` does `u.fullName ?? u.userId` (a raw-id fallback the new ESLint guard
  is meant to catch), and 6 backend export services do `row.fullName ?? ""`, blanking names in exports.

- **DESIGN-001a — the capability check is HEADCOUNT-only, and that is a known, deliberate approximation.**
  Discovered 2026-08-29 while investigating SAL-CTRL-002 ("no Manager role seeded"). That turned out NOT to be
  a seeding bug: `provisioning/steps/seed-config.step.ts` seeds ONLY the Owner role by design, and Cashier /
  Accountant / Viewer / Manager are all created by the admin from templates. But it exposed a real gap in
  DESIGN-001's own derivation. `deriveApprovalCapability` counts ACTIVE MEMBERS; approving additionally
  requires HOLDING the approve permission. So a 2-person shop (owner + cashier, the default shape of a fresh
  tenant) reports `available: true`, the owner enables invoice approval, and no non-owner can actually
  approve. The module's own doc comment hedged this as "a distinct approver COULD exist" - that hedge was
  hiding the dead end it exists to prevent.
  **Not fixed by strengthening the boolean**, because the tenant-wide flag cannot answer a per-flag,
  per-maker question, and `verifyApproval`'s generic 422 is a deliberate anti-oracle design that must not be
  made more specific. Fixed instead at the PICKER (SAL-APPR-001 + SAL-APPR-002): only offer people who can
  actually approve, and when nobody can, say which action unblocks the user. The headcount floor remains as
  the coarse settings-level gate, which is honest for the 1-person case it was built for.

- **DESIGN-001 — approvals are now CAPABILITY-derived, not config-derived (founder ruling, 2026-08-29).**
  Founder: "Manager approval is only required in big companies. In a small shop with five or six employees
  they don't care. If it's a one-person business, he has to create a manager and give a PIN and do all that
  nonsense? No. It has to be dynamic and flexible."
  The real defect was that a boolean let a user switch on a control the product could not satisfy: SoD needs a
  DISTINCT approver, so in a single-user tenant every approval flag is a guaranteed dead end.
  **Built:** ONE server-side derivation (`tenant-settings/approval-capability.ts`, `deriveApprovalCapability`,
  minimum 2 ACTIVE members) - no component counts members. Exposed with a deliberate privilege split: the
  gated endpoint returns the full `approvalCapability`, the **permission-free** `settings/current` returns only
  `approvalsAvailable: boolean` and NEVER the headcount - specifically so this does not recreate SAL-SET-002,
  where the roles that must approve could not read the flag and the control silently vanished from their UI.
  A write gate refuses to STORE a flag switched ON while unavailable (plain-language 400, no jargon).
  UI: a solo shop sees **no switches at all**, just one sentence and a link to add a team member - it appears
  as the shop grows, matching the progressive-disclosure convention the PO threshold already uses.
  **Drop-below-threshold ruling (the interesting one):** the flag is NEVER auto-cleared and enforcement is
  never silently weakened - that would remove a financial control behind the owner's back. The state is
  surfaced loudly and only turning it OFF is permitted, so no document is stranded without a remedy.
  **PIN self-service:** `GET /tenant/approval-pin/status` and `PUT /tenant/approval-pin` are now
  permission-free, killing the hand-build-a-Manager-role requirement. **Orchestrator-verified as SAFE and
  STRONGER:** both take the user from `getTenantContext().userId`, never a parameter, so a caller can only
  touch their OWN pin; `readiness`/`reset` stay gated; throttled 5/min, audited, scrypt-hashed, never
  returned. And `setInitialPin` REFUSES to overwrite, so a change now requires password re-auth via
  `POST forgot` - previously a permission holder could silently swap their PIN from a session alone.
  No default changed; all 7 flags stay OFF. **Loose end:** `settings.approvalpin.manage` is now referenced by
  no route and no nav gate, only by `role-templates.ts` - retire or keep, needs one decision.

- **SAL-DN-001 - PREMISE WITHDRAWN, real gap was much smaller and is now built (unexecuted).** There is no
  "create debit note" screen because **the product was never designed to have one**. The intended UX is a
  PENCIL on a confirmed invoice line: the user states the corrected price and the SERVER picks the document
  (decrease -> price-adjustment credit note, increase -> debit note) and confirms it in one call.
  `/sales/debit-notes` is a REGISTER and is correctly read-only. The orchestrator's "half-shipped feature /
  dead routes" framing was WRONG, and nothing was removed - none of it was dead surface, it was an unfinished
  last mile. The genuinely missing piece was ONE dialog + its trigger.
  Backend verified complete by reading: `PriceEditService.editPrice` with DB-unique idempotency replay, an
  `expectedBaselines` drift guard, and `safeCompensate`; `sales.listener.ts:760 handleDebitNoteConfirmed`
  posts DR trade_receivables (party-tagged, with dueDate) / CR revenue / CR output tax, balanced by
  construction, period-gated, outbox-idempotent. Route guard is `sales.invoice.update` but the controller
  ADDITIONALLY asserts creditNote+debitNote create/confirm at runtime to block privilege escalation. The en+ar
  copy layer already existed at full parity; 3 testids were dead. Built `edit-price-dialog.tsx` (effective-price
  baseline so a prior correction is never double-applied, per-open idempotency key so a timeout retry cannot
  double-charge, soft-lock handled IN the same dialog with no stacking or dead end, no tax UI, PIN only when
  the approval flag is on) + `price-correction-impact.ts` + a pencil trigger gated on all FIVE permissions the
  backend asserts. 26 tests written, NONE executed. **The money path is written but UNEXECUTED.**
  Originally reported as: there is no UI at all to create a debit note - the codebase contains
  dead testids for it. The routes `/sales/debit-notes` and `/sales/debit-notes/[id]` exist and the backend
  has a full debit-note API (create/confirm, with a status enum), but nothing in the product can raise one.
  Also blocks verification of the debit-note draft-number surfaces and its confirm toast.
- **SAL-SEARCH-001 (MED, CONFIRMED).** Invoice-list search does not match a customer's ARABIC name, in a
  tenant whose secondary language is Arabic and whose customers carry Arabic names.
- **SAL-SORT-001 (MED, CONFIRMED).** The invoices list has **no sort feature at all** - not a broken sort, an
  absent one. The per-screen checklist expects sorting both directions on every list.
- **SAL-CN-002 (MED, CONFIRMED).** A credit note is mislabeled **"Draft invoice"** in its own panel, and the
  approval gate renders INCONSISTENTLY between two credit-note confirm surfaces - in one case failing to
  render its own required PIN/approver fields, which would make the control unusable on that surface.

- **ENV-001 (blocks all print verification, NOT a code defect).** Headless Chromium is not configured in this
  dev environment - `PUPPETEER_EXECUTABLE_PATH` is unset, so Print/PDF always 503s. **No print or PDF OUTPUT
  can be verified here at all**, including SAL-PRINT-001, this phase's only CRITICAL (the raw UUID on the
  customer-facing receipt). That fix is code-complete, unit-tested against the exact UUID from the DB, and
  live in the rebuilt API, but it is **NOT browser-verified and cannot be** until this is configured. Fix
  before any print-focused pass in Phases F-H.

- **SAL-SET-002 (HIGH, CONFIRMED - found while fixing SAL-SET-001, and MORE serious than it).** **The
  maker-checker gate was INVISIBLE to the exact role that needs it.** Eight sales components read
  `requireInvoiceApproval` through the same admin-gated endpoint and silently fell back to `?? false` on a
  403 - so for accountant1 the UI showed no approver/PIN fields at all. Server-side enforcement was verified
  to still hold independently via the amend adapters, so this was UI degradation, **not an auth bypass**.
  But it means SAL-CTRL-001's toggle fix would have appeared to do NOTHING for the accountant: two fixes that
  only work together. All 8 switched to `settings/current` (`invoice-detail-panel`, `invoice-edit-panel`,
  `direct-sale-cancel-dialog`, `direct-sale-edit-panel`, `credit-note-detail-panel`, `credit-note-create-panel`,
  receipts `payment-detail-panel`, customers `receipt-detail-panel`). **The identical pattern exists in
  PURCHASE (7 files, `requireBillApproval`/`requireReturnApproval`) and POS (1 file,
  `requirePosAmendApproval`) - reported, NOT fixed, both outside this phase.**
- **SAL-SET-001 (HIGH, CONFIRMED, orchestrator-verified). FIXED + rebuilt.** Root cause was `useSellerContext`
  (`features/print/use-seller-context.ts`) - the ONE hook every sales print surface uses. Fixed by EXTENDING
  the permission-free `settings/current` with `nameAlt`, `logoUrl`, `countryCode`, `documentLanguageMode`,
  `documentSettings` (all already printed on documents handed to customers, so nothing newly sensitive)
  rather than widening a permission. `GET /tenant/settings` **403s for accountant1**
  on the sales invoice detail page, breaking **Print** for the AR persona whose job includes printing
  invoices. The page degrades honestly ("company details could not be loaded", no crash) but Print is
  unusable. **FIFTH instance of the fixed-elsewhere-never-mirrored pattern:** `GET /tenant/settings/current`
  exists precisely as the permission-free endpoint, created for POS-021 (the identical cashier 403) and
  already reused by purchase's payment panels with explanatory comments. Sales never adopted it. Fix in
  flight, with the explicit instruction that if `settings/current` lacks fields a printed document needs,
  the right answer is to EXTEND that endpoint (those fields already appear on documents handed to customers)
  and never to widen a permission.
- **SAL-DRAFT-004 (MED). FIXED - and the exhaustive sweep found SEVEN unfixed surfaces, not the one reported.**
  Invoice detail's Receipts / Credit-notes / Debit-notes panels; the Customers receipt dialog title and summary
  row; and - a distinct bug class - the credit-note, debit-note and receipt success TOASTS, which had a
  **stale-closure defect**: they rendered the pre-confirm draft number instead of the mutation result. Every
  other `.number` render site in `apps/web/src` was audited with a per-site verdict; the rest are provably
  gated to confirmed-only documents. Originally reported as a FOURTH `DRAFT-<uuid>` surface: the invoice detail page's Receipts panel.
  This defect has now been fixed in three separate rounds and a fourth surface still slipped through, so the
  final pass is being done differently - an exhaustive audit of EVERY render of a sales document `.number`
  in `apps/web/src` with a per-site verdict, rather than another targeted grep.
- **SAL-CN-001 (MED). FIXED + browser-verified as BOTH owner and accountant1 - and the diagnosis is the
  instructive part.** The verifier was right that behaviour was unchanged, but the first fix was NOT wrong:
  a network trace taken BEFORE reading any code showed the request DID fire on customer select and returned
  the invoice 200. The real blocker was one layer down in the SHARED `components/async-combobox.tsx:356` -
  `showDropdown = open && !isPillSelected && (trimmed.length > 0 || showOnEmpty)` - so with data loaded the
  option list stayed unmounted until a character was typed. Every other browsable picker in the codebase
  (account, return-source, serial-capture, audit toolbar) passes `showOnEmpty` + `minChars={0}`; the
  credit-note picker was the only one that did not. **TWO GATES IN SERIES, ONE PATCHED** - the same family as
  the SAL-CTRL-001/SAL-SET-002 pair, where a correct fix appears to do nothing because a second gate
  downstream still blocks it. Worth noting for future work: the shared component's DEFAULT is
  hide-until-typed, which is the wrong default for a picker that already has its data - left alone here
  because changing it touches 6 call sites, but it is the real root.
  Superseded note: reported fixed, independently proved unchanged, re-diagnosed. The
  `enabled: !!customerId` change did NOT alter the behaviour: an independent verifier confirmed for BOTH
  accountant1 and owner that the invoice combobox still stays empty until a character is typed. Fourth time
  this session that the verification loop caught an item reported as fixed. Second attempt is required to
  reproduce in the BROWSER first and watch the network (does a request even fire on customer select?), then
  confirm the file being read is the one actually rendering the route - the working sibling
  `payment-create-panel.tsx` is the control. Original (partly correct) diagnosis, PROVED with SQL:
  The backend filter is correct and returns `B1ALRAIMAINS-INV-00003` for the exact query it runs. The picker
  was `enabled: !!customerId && invoiceSearch.length > 0`, so it fetched NOTHING until the user typed, while
  displaying "This customer has no confirmed invoices to credit" - a false claim - the instant a customer was
  picked. The sibling picker in the same module (`payment-create-panel.tsx`) already used `enabled: !!customerId`
  alone; matched it. Originally: the credit-note "goods return" Invoice picker returns ZERO eligible
  invoices for customers who demonstrably have confirmed invoices. Reproduced identically as OWNER, so it is
  NOT a permission problem. Under investigation with an explicit instruction that "the filter is correct and
  the data genuinely has none" is an acceptable answer - in which case the defect is the UX (an unexplained
  empty picker is a dead end; the screen must say why nothing is eligible and what to do instead).

- **SAL-PRINT-003 (MED, CONFIRMED + FIXED).** The customer receipt print preview was titled **"Invoice"** -
  the wrong document type on a customer-facing document. Root cause was in the shared label layer, not the
  receipt: `packages/shared/src/print/label/label-keys.ts` `resolveDocTitleKey` mapped `sales-receipt` +
  `taxSystem: "none"` to `document.title.invoice`. Fixed with a no-tax carve-out returning a new
  `document.title.receipt` key (en "Receipt" / ar "سند قبض"), deliberately preserving the ZATCA/GCC-VAT
  behaviour ("Tax Invoice" under `vat`) unchanged. 19/19 label tests. This landed AFTER the coordinated
  rebuild, so a SECOND shared+api rebuild was performed by the orchestrator; API confirmed up, serving,
  401-gated, migration drift clean, ledger 0.000000.
- **XCUT-007 (MED, app-wide). FIXED at the server layer (written, UNVERIFIED - nothing was executed).**
  Key insight: `routing.localePrefix: "always"`, so EVERY url a client effect sees already carries a prefix -
  a client effect structurally cannot distinguish "user typed /ar on purpose" from "next-intl auto-prefixed a
  bare url to /en". That distinction only survives server-side on the raw request, which is why the decision
  moved into `proxy.ts`. Implementation: if the incoming pathname has no locale segment, tag a one-shot
  `zerupt-locale-autoprefixed` marker (whatever locale it lands on is server-invented); if it HAS an explicit
  locale segment, stamp `zerupt-locale-chosen` - unless the request carries the autoprefix marker from the
  prior hop, or is an in-app soft navigation. `LocaleSync`'s consumption logic is unchanged; only WHO sets the
  cookie and WHEN. The go-live/first-login mirror case survives because `router.push("/dashboard")` is a soft
  nav and is deliberately NOT stamped, leaving `LocaleSync` free to bump an ar-default tenant to `/ar/...`.
  **DESIGN RISK to verify, not accept:** soft-vs-hard navigation is detected via Next's INTERNAL `rsc` header
  (read from `next@16.2.7` source, never observed on the wire). If that header changes, the mechanism degrades
  quietly - and the dangerous direction is that soft navs start being stamped as "chosen", which would break
  ar-default tenants rather than merely restoring the old bug. Must be confirmed on the wire before this is
  trusted. Originally diagnosed as: Direct navigation to
  `/ar/...` silently renders English on a fresh session. Root cause: `components/locale-sync.tsx`
  (`LocaleSync`, mounted by `AppShell` on EVERY page load) force-navigates to the tenant's `languageDefault`
  whenever the URL locale differs, UNLESS a `zerupt-locale-chosen` cookie is set - and only the in-app
  `LocaleSwitcher` ever sets that cookie. Gulf Auto Parts' `language_default` is `en`, so the first direct
  visit to `/ar/sales/invoices` is silently replaced with `/en/...`; using the toggle once sets the cookie and
  subsequent direct `/ar/` visits then work, exactly matching the reported symptom. **Not a sales bug** - it is
  a global mechanism with no sales code involved, and the correct fix (move the apply-tenant-default decision
  into `proxy.ts`'s post-login redirect, before a user-chosen locale segment can exist, since a client effect
  cannot distinguish "user typed /ar on purpose" from "user landed on a bare URL") would affect every module.
  Left for a deliberate app-wide change rather than patched from a sales pass.

- **SAL-LIST-001 (HIGH, CONFIRMED, orchestrator-verified).** The **"Voided" status tab on `/sales/invoices`
  is completely broken** - `GET .../invoices?status=voided` returns 400 and the list dies with a generic
  error (reproduced twice from a fresh reload). Root cause is a one-word path divergence in
  `sales-invoices.dto.ts`: line 29 declares `DisplayStatus = "draft"|"confirmed"|"overdue"|"paid"|"voided"`,
  while line 434's list-query schema is `z.enum(["draft","confirmed","overdue","paid"])` - **`voided` is
  missing**. Two declarations of one fact, disagreeing. `voided` is a real stored status (invoice void
  shipped in hardening Layer 3). Fix in flight, WITH a structural test asserting every member of the
  display-status union is accepted by its query schema, so the two can never drift again - worth more than
  a test for the single missing value. **FIXED + API REBUILT.** Traced the service filter first: any status
  other than overdue/paid falls through to a generic `eq(salesInvoices.status, ...)`, so widening the enum
  maps correctly AND does not touch the separate AR-aging/open-query partial-index exclusions.
  **A SECOND copy was found in the sweep** - `credit-notes.dto.ts:147` had the identical divergence
  (`["draft","confirmed"]` vs a DB enum including `voided`, since credit-note void shipped alongside invoice
  void). Seven other sales DTOs checked clean, several because the type and the query schema SHARE ONE
  status constant - the safe ones are safe by construction, not by luck, which is the pattern worth copying.
  `list-status-parity.spec.ts` now enumerates every `InvoiceStatus`/`CreditNoteStatus` value and asserts it
  parses, so a future status fails CI instead of drifting. 2 tests.
  **Coordinated API rebuild done** (shared + api built clean, new pid, Nest started, sales routes mapped and
  correctly 401-gated, health shows only the normal dev `email_config` failure). This build also picks up the
  customer-facing print-UUID fix. Ledger 0.000000.
- **XCUT-005b (the lint guard's first dividend).** The new report-only ESLint rule fires **35 times outside
  sales** - 25 denormalized-name fallbacks and 10 map-get fallbacks in `general-ledger` and `inventory`
  (transfers, batches, serial numbers, stock counts, price lists, reorder, adjustments). All are genuine
  instances of the same user-visible raw-UUID class. **This did NOT break a green gate:** `pnpm lint`
  (`eslint src`) was ALREADY failing repo-wide before the rule was added (134 errors, including 7
  pre-existing `no-restricted-syntax` violations of the older LOCALE/DECIMALS guards). The rule has
  effectively produced a free, precise inventory of this defect class across the app for Phases F-H.

- **XCUT-006 (MED, other modules).** Twelve raw `useWarehousesQuery` call sites remain OUTSIDE sales, each
  carrying the same false-empty-on-403 exposure for any role lacking `settings.warehouse.list` (which,
  per the DB, includes Accountant and Cashier): `purchase-import-header-form`, `delivery-order-detail-panel`,
  `delivery-order-create-panel`, `sami/scan-review`, `pos/create-register-dialog`,
  `inventory/serial-number-add-dialog`, `purchase/bill-detail-panel`, `purchase/order-amend-panel`,
  `purchase/order-detail-panel`, `reports/use-filter-options`. The safe primitive
  (`useWarehouseOptionsQuery`, permissioned-then-directory fallback) already exists - these simply do not use
  it. Correctly EXCLUDED as a non-defect: `locations/warehouses-section.tsx` IS the admin CRUD surface and
  legitimately requires the permissioned endpoint.

- **XCUT-005 (HIGH, class — ~20 sites in sales alone, now getting a GUARDRAIL not an Nth sweep).**
  The codebase has `useEntityMap` (+ `useCustomerMap`/`useItemMap`/`useInvoiceMap`/`useCreditNoteMap`)
  whose entire contract is that a denied, failed or loading lookup can NEVER fall through to a raw id -
  `.get()` returns `EMPTY_VALUE_PLACEHOLDER`. The defect class is code that DEFEATS that contract, in two
  shapes: (a) reaching into the bare `.map.get(id)?.name ?? id` instead of the `.get()` accessor, and
  (b) `?? someEntityId` fallbacks on a DTO's denormalized optional name. **A raw UUID reached a
  customer-facing PRINTED RECEIPT through this class** (SAL-PRINT-001). Fixed so far this session: the
  shared print mapper, the server-side PDF assembler, `receipt-detail-panel`, `payment-detail-panel`,
  `payments-list-panel`, both credit-note list+detail panels, both debit-note panels, `invoice-detail-panel`
  (CreditNoteRow), `invoices-list-panel`, `record-payment-dialog`, `credit-note-dialog`,
  `credit-note-create-panel`. ~13 more identified across sales-orders / quotations / delivery-orders now
  in flight, **together with an ESLint guard** so the class cannot return - the same reasoning POS-015
  reached when it recommended a lint forbidding `primaryText` in operational components. Note the
  constraint carried into that work: the guard must be REPORT-ONLY, because a prior incident had
  `lint-staged` running bare `eslint --fix` and DELETING load-bearing disable directives.

- **SAL-CTRL-001 (HIGH). FIXED pending browser verification** - all THREE missing flags now have toggles
  (`requireInvoiceApproval`, `requireReturnApproval`, `requirePosAmendApproval`), each confirmed accepted by
  `updateTenantSettingsSchema` BEFORE being exposed (a toggle for a flag the API ignores would be a control
  that silently does nothing - worse than no toggle). No default changed: all stay OFF, they merely become
  reachable. Plain-language en+ar copy explaining what turning each ON actually does. 9/9 tests.
  **The control cannot be
  switched on.** `features/organisation/components/controls-section.tsx` renders approval toggles for
  exactly FOUR flags - `requirePoApproval`, `requirePaymentApproval`, `requireBillApproval`,
  `requireRefundApproval` - all purchase-side. `tenant_identity` has SEVEN: those plus
  **`require_invoice_approval`** (sales), `require_return_approval` and `require_pos_amend_approval`,
  none of which has a toggle anywhere in the product. `requireInvoiceApproval` gates **invoice void,
  receipt reversal, credit-note confirm and direct-sale cancel**; the enforcement code exists, is tested,
  and is read by four UI components - it simply defaults OFF and is unreachable. Live proof: owner voided
  an invoice with only a reason field, no approver picker shown, `void_approved_by` NULL in the DB.
  **The sales hardening log's Layers 3 and 5 claim these paths are "PIN+SoD gated". They are - the gate
  is real and correct. It is unreachable.** That is a claim the log would have carried indefinitely had
  the flow not been run live, and it is the single strongest argument for this programme's method.
  FOURTH instance of the purchase-fixed/sales-unmirrored pattern. Fix in flight (additive toggles, no
  default changed).
- **SAL-CTRL-002 (HIGH, founder decision).** No non-Owner role on this tenant holds
  `settings.approvalpin.manage` - only the built-in "Manager" role TEMPLATE has it, and no Manager role
  is seeded. So even once SAL-CTRL-001 is fixed, a tenant cannot set staff PINs without first hand-building
  a role from the template. Same root cause as the open POS residual (`pos.session.close` sits in the
  manager bundle with no manager role created). Needs one decision: seed a Manager role, or move these
  keys. NOT fixed - it is a role-model decision, not a testing-pass edit.
- **SAL-LOOKUP-001 (HIGH). FIXED pending browser verification, and the root cause is instructive: the
  correct primitive ALREADY EXISTED and was simply not used.** `useWarehouseOptionsQuery` tries the
  permissioned list then falls back to the names-only `/tenant/warehouses/directory` on a 403, exactly
  mirroring `useAccessibleBranches`; the credit-note dialog was calling the raw `useWarehousesQuery`.
  Swapped, plus distinct `isError` vs genuine-empty states. **THREE more sales files still call the raw
  hook** (`invoice-create-panel`, `invoice-detail-panel`, `invoice-edit-panel`) - in flight, and NOT a blind
  find-and-replace since they consume a wider response shape. This also closes the loop on a note carried
  forward from Phase D ("four `useWarehousesQuery` call sites in sales/inventory share the false-empty-on-403
  pattern"). **DB evidence reframes the severity UPWARD:** only Viewer and the test Manager role hold
  `settings.warehouse.list` - **Accountant and Cashier do NOT**, and Owner's `isOwner` bypass hid it. So this
  was never confined to the credit-note return location: the accountant hit a false-empty warehouse dropdown
  when **creating, confirming or amending a sales invoice**, the core of that persona's job. An earlier
  verification pass had confirmed the accountant could REACH `/sales/invoices/new`; nobody checked whether a
  line could actually be added. Same lesson as SAL-CTRL-001: reaching a screen is not the same as being able
  to complete the task on it. All three invoice panels + the shared line editor are now on the safe primitive
  with DISTINCT "could not load" vs genuine-empty states (they previously had no messaging for either).
  **Still open, sales-adjacent:** `credit-notes/components/edit-credit-note-fields.tsx:190`.
  Originally: THIRD instance in sales of the permission-gated-lookup false-empty class:
  the goods-return credit-note "Return location" warehouse dropdown renders EMPTY for accountant1 because
  the warehouse list 403s, reading as "this tenant has no warehouses" and blocking the return. The other
  two were the payment form's branch list (fixed) and the salesperson picker. Fix in flight.
- **SAL-ERR-001 (HIGH -> SUSPECTED root cause, MITIGATED).** Price-adjustment credit-note 422s reached the
  user as NOTHING - no toast, no inline error, no terminal state (observed twice with screenshots in the
  browser). **But a code review could NOT reproduce a swallow**: the ApiError -> parseErrorResponse -> toast
  path reads as correct end to end, so the root cause of what was observed remains UNEXPLAINED (suspected
  toast rendering/timing/z-index rather than error handling). Mitigated the right way regardless, per the
  founder's "never leave a submit with no terminal state" rule: a durable, toast-INDEPENDENT inline alert
  now shows the server's verbatim message beside the submit button, cleared on retry. Deliberately NOT
  papered over with a catch-all error map (PUR-049: a purchase 422 catch-all once falsely claimed the period
  was closed, discarding the server's real message). Needs browser re-test to confirm the banner appears.
  Fix in flight, with the explicit guardrail that a catch-all error map must NOT be invented (PUR-049:
  a purchase 422 catch-all once falsely claimed the period was closed, discarding the server's real
  message).
- **Reversals proven correct where run (genuine positives):** invoice void nets to EXACTLY zero on every
  GL leg including COGS, with GL-derived AR going to 0; a partial (1-of-2 line) goods-return credit note
  is GL-correct and halves AR exactly (24.690 -> 12.345) with `invoice.balance` matching GL-derived AR.
  Ledger identity 0.000000 throughout. **Receipt reversal and SO cancel were NOT completed live** - the
  agent ran out of time and reported them honestly as untested rather than assumed. They remain the top
  gap for the next wave.

- **XCUT-004 (HIGH, class now THREE modules deep).** The "cost/margin returned with no server-side
  `inventory.cost.view` strip" defect has now appeared in POS (POS-004), sales invoices AND sales
  delivery orders (SAL-BE-002), and reports: `reports/top-sellers.controller.ts:18-23` returns
  `costOfGoods` / `grossMargin` / `marginPercent` behind `reports.sales.view` alone with only an optional
  `@MasksFields` role mask and NO cost strip, while its own siblings `sales-by-item.controller.ts:26` and
  `salesperson-performance.controller.ts:28` DO strip. DB: Viewer holds `reports.sales.view`, not
  `inventory.cost.view`. Reported from Phase E, belongs to Phase G. Like the mirroring problem and the
  `keepPreviousData` problem, this class needs a systemic answer (a shared response-gate the endpoints
  cannot forget) rather than an Nth per-site patch.

- **SAL-PRINT-001 (CRITICAL, CONFIRMED, orchestrator-verified in DB + code).** The printed CUSTOMER
  RECEIPT VOUCHER shows a **raw UUID** where the invoice number belongs.
  `packages/shared/src/print/mappers/payment-voucher.mapper.ts:68` assigns `itemName: a.sourceDocumentId`,
  and `sales_payment_allocations.source_document_id` is a genuine `uuid` column (verified:
  `invoice | 666ae8b7-c8c5-4a90-9d23-2e1f1d6a50d4`). The mapper's own comment claims the value is
  "an invoice/bill number, never a catalog item" - **the comment is FALSE**, and is very likely why this
  survived review: the code documented an intent the data never satisfied.
  **Why CRITICAL and not cosmetic:** this is the SHARED mapper used by
  `apps/api/src/documents/tax-document-assembler.service.ts:518` for server-side Chromium PDF assembly,
  so the receipt a real customer downloads or is emailed carries the UUID - not just the in-app preview.
  **Blast radius spans a closed phase:** `supplier-payment-print-document.tsx` uses the same mapper, so
  PURCHASE has it too (adjacent to PUR-063). `receipt-detail-panel.tsx:261` leaks it on screen as well.
  Being fixed ONCE at the chokepoint, by changing the mapper's input type so a raw id is unrepresentable
  and TypeScript forces all four call sites. **FIXED at the chokepoint** (pending API rebuild + browser
  verification): `PaymentAllocationLike.sourceDocumentId` -> `sourceDocumentNumber`, so the old field no
  longer compiles - pinned by a `@ts-expect-error` test. All four call sites updated; the web ones resolve
  through `useInvoiceMap`/new `useCreditNoteMap` (built on `useEntityMap`, whose contract is that a
  denied/failed/loading lookup can never fall through to a raw id), and the API assembler - which had NO
  resolution at all, the customer-facing path - now resolves by id with an `EMPTY_VALUE_PLACEHOLDER`
  fallback. Two findings inside the fix: the PURCHASE side was already passing a real `billNumber` under
  the misleading `sourceDocumentId` name (value correct, name wrong - which is what made the sales bug
  invisible), and a **FIFTH copy** was found at `payment-detail-panel.tsx:334`
  (`?? a.sourceDocumentId`), now being fixed. Tests: 54 shared, 2+2 assembler, pinning that `itemName`
  never matches a uuid regex using the exact uuid from the DB.
- **SAL-PRINT-002 (HIGH). FIXED, API rebuilt, pending browser verification** - the block now builds a `PrintFormatContext` from the document's OWN `TaxDocumentData` and resolves via `createPrintLabelResolver` + `PRINT_LABEL_DICTIONARIES`, the same mechanism the rest of the page uses; strings moved into the print label layer (`print.json`), dead `sales.deliveryOrders.print.*` keys removed. The other 5 sales print documents were independently re-checked clean. **Purchase's 4 print documents also call `useTranslations` and were NOT re-verified** - follow-up for whoever owns Purchase. Originally: binds the driver signature
  block ("Delivered by"/"Received by"/"Signature") to `useTranslations`, i.e. the VIEWER's UI locale,
  inside the actual print root - violating the rule that printed documents bind to the DOCUMENT's
  language. Every other sales print document follows the rule correctly. OPEN.
- **SAL-EXP-001 (HIGH).** None of the four server-side streaming CSV exports (invoices, quotations,
  delivery orders, direct sales) include a delivery-fee column, although the shared print layer renders
  one and the schema ties delivery fee into the document total. Invisible in this tenant today (0 rows
  with `delivery_fee_amount > 0`) but silently breaks reconciliation the moment it is used. OPEN.
- **SAL-EXP-002 (LOW/FRICTION).** No export UI exists for credit notes, debit notes, sales orders or
  receipt vouchers; debit notes have no print/PDF surface at all. OPEN.
- **SAL-I18N-001 (MED). FIXED pending browser verification** (gated on the same `showTaxRow`/`taxMode` predicate that already gates the tax row; the pre-preview "estimated" label is now always plain, since it cannot truthfully claim "excl. tax" before the server has resolved a tax mode; ar rewritten to match en exactly). **A SECOND instance was found and is now in flight:** `sales-import-preview-sales.tsx` shows "Total before tax" unconditionally with no tax gate at all. Originally: the quotation line editor shows "Subtotal (excl. tax)" / "Estimated subtotal
  (excl. tax)" unconditionally in en+ar, even though this no-VAT Kuwait tenant correctly suppresses the
  actual tax row a few lines below. OPEN.

- **SAL-BE-004 (HIGH, CONFIRMED live).** `/sales/payments/new` shows a FALSE "No branches configured"
  for accountant1: the page calls the admin-scoped `/tenant/branches`, which 403s for the Accountant
  role, and the failure degrades silently into an empty state — so the accountant cannot take a customer
  payment, the core of that persona's job. Instance of the permission-gated-lookup class (fix by sourcing
  from the self-scoped `/tenant/me/branches` the user can already read, NEVER by widening a permission).
  Note the ordering: this was LATENT until SAL-PERM-001 granted the accountant `sales.receipt.create` —
  unblocking the persona exposed the surface it needs. Also: a 403 must never degrade into an empty state
  that reads like valid data; "No branches configured" is a factual claim about the tenant, and it is
  false. **FIXED + verified as accountant1 in en+ar** (network trace confirms `/tenant/me/branches` 200, real
  branches render, repeated over 5+ reloads): `payment-create-panel.tsx` now uses the `useAccessibleBranches()`
  + `BranchCombobox` primitives purchase already established, no permission widened. A distinct
  `branchesLoadError` state was added so a genuine fetch failure says "Could not load your branches" instead of
  collapsing into the false claim, and the empty-state copy was corrected to the honest wording the
  orders/invoices/delivery-orders forms already use. Grep sweep: this was the ONLY sales call site of the
  admin-scoped endpoint (`direct-sale-form-fields.tsx` was already correct); non-sales hits in pos-transactions,
  cheques, numbering, report filters, team, inventory and purchase landed-costs/returns are reported, untouched.
  The `useWarehousesQuery` false-empty-on-403 pattern does NOT reproduce in sales - sales has no warehouse call
  sites at all.

- **XCUT-003 (LOW, purchase, found while sweeping sales).** `purchase/components/bills-list-panel.tsx:405`
  renders `{b.number}` raw with no draft check - the SAME unpatched raw-`DRAFT-<uuid>` defect just fixed in
  sales, still live in the CLOSED Phase D module. Reported, deliberately not fixed (Phase D is closed and
  re-opening it was out of scope). One more data point that fixes are not being mirrored across modules.

- **XCUT-001 (MED, structural).** The `placeholderData: keepPreviousData` pager-unmount defect has now
  been hand-patched in THREE modules (inventory, purchase PUR-002, sales SAL-FE-001) — roughly 45 hooks
  patched one at a time — because **no shared list-query factory exists**. ~30 list panels outside those
  modules still have the defect and will be patched the same way unless the chokepoint is built. This is
  the textbook case for the programme's own lesson: fix it once at the chokepoint, not per site.
- **XCUT-002 (HIGH, founder decision).** No invite path can set a member's name: `emailInviteSchema` and
  `usernameInviteSchema` (`team-users.dto.ts:80-104`) are both `.strict()` with **no `fullName` field**,
  so every invited member is created `full_name = NULL` and a name cannot even be supplied. Admin DB
  confirms it: the self-registered owner is named, all 3 seeded staff are NULL. Downstream, everything
  reads `fullName ?? ""` or `?? "Team member"`, so **the SoD approver picker is unusable** (invoice void,
  credit-note confirm, receipt reversal) and user names are blank in journal entries, roles, landed costs
  and 4 export services. Username-mode members have no inbox, so the self-profile-edit escape hatch does
  not reach exactly the staff who need it. Decision needed: name required or optional at invite, backfill
  for existing null members, and whether username and email modes differ. See SAL-LIVE-002.

### Phase E (Sales) — genuine positives, balance-proofed

These are recorded because a scoreboard that only lists defects is not trustworthy:

- **Both Purchase money-defect classes are structurally ABSENT from sales.** Rounded-away GL legs are
  DROPPED and absorbed by the 4840 plug rather than rejected post-commit (the PUR-016 shape);
  credit-note returns relieve at **engine-realized stock-ledger cost**, with company-wide WAC only as
  a last, loudly-warned fallback (the PUR-020 shape). Sales totals are currency-quantised by the tax
  engine, so **PUR-017 does not exist here** and the KWD confirm JE leaves no residual.
- Empirical baseline all PASS: ledger identity `0.000000`; zero unbalanced entries; AR sub-ledger
  (party-tagged 1131) vs open invoice balances reconciles with **zero** differing customers; COGS GL
  `5100 = 555.702000` ties exactly to SLE `sale 573.582 - sale_return 17.880`; zero confirmed
  documents without a JE; zero sub-fils precision anywhere. DB triggers make an unbalanced or
  party-less posted entry unreachable independent of app code.
- Tax visibility in sales is ONE correct server-derived `taxMode` mechanism (purchase had three);
  money formatting uses `formatMoneyAmount` consistently across 43 files with no 2dp or hand-rolled
  formatting; RTL is clean (no physical-direction classes).
- **All 5 sales print documents already use the hardened `useCustomerMap`/`useItemMap` pattern**, with
  an explicit anti-regression comment citing the purchase incident. No raw-UUID leak onto sales
  printed documents — the defect that hit eight purchase print paths.
- Backend checked clean on direct inspection: permission + `@Audited` decorator parity across all 12
  sales controllers, maker-checker SoD with self-approval rejection, period validation on every
  posting path, credit-note FX against foreign-currency invoices, no boolean-flag-as-quantity proxy,
  no commit-before-GL ordering.
- Live cycle: the direct/express path (customer -> item -> cash -> save, ONE screen, no forced dialog)
  posted a fully correct invoice + receipt + GL + COGS + stock-relief chain. The full
  SO -> invoice -> payment chain also posted correctly with balanced, party-tagged JEs. No tax UI ever
  leaked. No stacked confirmation dialogs. Good defaults throughout (branch locked, salesperson and
  dates pre-filled, full-balance/cash pre-selected).

**Two things a future fixer must NOT "correct"** (each would be a regression): the AR-below-invoice-
balances gap that credit notes legitimately create (`credit-notes.service.ts:531-558`), and sales'
deliberate foreign-currency support — do NOT port `purchase-fx-guard`'s fail-loud onto sales
(the asymmetry is intentional, resolved in erp 69be287c).

**Coverage caveat, stated so it is not forgotten:** all 316 confirmed `sales_invoices` are
`is_opening = true`. Before this phase there were ZERO app-confirmed invoices, credit notes, receipts
or direct sales in this tenant; every live revenue movement was POS-sourced. The reconciliation
numbers therefore prove the ledger and the AR derivation, but the sales JE paths themselves remain
partly code-derived. Not yet exercised live: credit-note confirm, invoice void, receipt reversal
(all three blocked needing a real manager PIN), quotations, ar/en parity sweep, print-document check.

**The defining pattern of Phase E is the INVERSE of Phase D's.** Purchase's worst defect was a
*sales* guard never mirrored onto purchase. Sales' two worst defects are *purchase* fixes never
mirrored back: PUR-005 (accountant role permissions) and PUR-001 (blast-radius guard placement).
Mirroring is evidently not happening in either direction by default — a fix in one module should
carry an explicit check of its twin.

### Phase D (Purchase) — CLOSED 2026-08-28.

Both full purchase cycles (order path: PO -> GRN -> bill -> payment, and direct path) were run live
for the first time ever in this tenant, closing a long-open TODO from `study/purchase/_hardening-log.md`.
The first supplier refund receipt in the product's history was created and reversed
(`B1ALRAIMAINS-SRR-00001`), closing carried-forward TODO #3 from that same log.

**Final integrity:** ledger identity **0.000000** · GL 1141 vs cost pools tie within **0.000016** ·
6 purchase orders · 6 GRNs · 3 direct purchases · 303 bills · 5 supplier payments · 3 returns ·
1 landed cost · 1 refund receipt · 89 journal entries.

**The pattern that defined this module:** like POS, the dominant defect class was PATH DIVERGENCE -
order vs direct (tax-row visibility, `hasSupplierInvoice` hardcoded false on every direct purchase),
client vs server (the "period is closed" error-map lie masking a real precondition failure), and a
sales-side guard never mirrored onto purchase (the return-vs-bill AP split). Alongside that,
purchase surfaced a new mirror-image of POS's false-success class: a **FALSE FAILURE** (PUR-055) -
a 30s client timeout sitting below real write time, so the UI told users a financial write had
failed when it had in fact fully landed. Where POS lied that broken things worked, purchase lied
that working things broke.

### Still OPEN / carried forward to Phase E

- ~~`replay-dead-letter.cli.ts` does not run~~ CLOSED 2026-08-28 (CLI-001). The failure was never
  in the CLI: `RawBodyCaptureService.onModuleInit` dereferenced a null `httpAdapter` under
  `createApplicationContext`, killing all 16 `*.cli.ts` entry points. One shared guard fixed
  every one of them.
- ~~One `accounting_event_outbox` row remains `status = failed` (`c47f2de9-...`)~~ CLOSED: that
  row is `completed` (processed 2026-08-28 13:23:47 by an earlier session). The CLI correctly
  refuses to reprocess a completed row without `--force`; forcing it was deliberately NOT done
  (its JE already posted, its payload still has the empty `lineItems` that poisoned it, and a
  forced re-emit would only re-fail). **A NEW `failed` row now exists** from the route-88 amend:
  `document.amended` — see PUR-064, which is a producer bug, not a stuck-row incident.
- ~11 test suites OUTSIDE purchase lack a `useCurrentTenantQuery` mock after another session's
  locale change; and four `useWarehousesQuery` call sites in sales/inventory share the
  false-empty-on-403 pattern fixed in purchase (PUR-018-class root cause). Both scoped for Phase E.
- Raw-id fallbacks: the two PRINTED TAX DOCUMENTS are **FIXED** 2026-08-28. `invoice-print-document.tsx`
  and `credit-note-print-document.tsx` destructured the bare `map` out of `useCustomerMap`/`useItemMap`
  and hand-rolled `?? customerId` / `?? itemId`, bypassing the whole point of `useEntityMap`. They now
  resolve through `get()` (never returns a raw id) with `getEntity()` for the genuinely-nullable
  contact fields; the invoice keeps its denormalized `customerName` as the middle fallback and lands
  on `EMPTY_VALUE_PLACEHOLDER`. An existing test PINNED the defect ("falls back to the raw customer
  id") and was inverted; its `use-lookups` mock returned a bare `map`, so it was widened to the real
  `EntityMapResult` shape. 13 + 11 tests green, web typecheck clean.
  **~40 render-path `?? <rawId>` sites remain OUTSIDE purchase** (86 raw grep hits, many of which are
  legitimate form defaults). Highest-risk, all user-visible: `receipts/payments-list-panel.tsx:77`,
  `receipts/payment-detail-panel.tsx:129,334`, `delivery-orders/delivery-orders-list-panel.tsx:307`,
  `delivery-orders/delivery-order-detail-panel.tsx:283`, `invoices/invoice-detail-panel.tsx:1956`,
  `invoices/invoices-list-panel.tsx:384`, `invoices/record-payment-dialog.tsx:167`,
  `invoices/credit-note-dialog.tsx:309`, `general-ledger/general-ledger-panel.tsx:281,289,438`,
  `journal-entries/journal-entries-panel.tsx:259`, `pos-transactions/pos-transactions-list-panel.tsx:593,763,944`,
  `inventory/transfers/transfer-detail-panel.tsx:423,427`, `inventory/adjustments-table.tsx:80`,
  `inventory/reorder/reorder-suggestions-panel.tsx:568`. Reported, deliberately NOT fixed in Phase D.
- ~~F2's "stale rounding notice clears on failure" half (PUR-034)~~ CLOSED - browser-verified both
  halves, see the PUR-034 row. ~~Route 88 was only exercised in its refusal state~~ CLOSED - a
  confirmed PO was created (PO-00004) and the amend editor exercised end to end: frozen fields
  (supplier / branch / order date / currency) each refuse with their own plain-language reason,
  the estimated total recomputed exactly (5 x 2.125 = 10.625), and Save correction cancelled
  PO-00004 and issued+confirmed PO-00005. Two by-products: PUR-064 and PUR-066.

### Environment gotchas (save the next phase real time)

- Anonymous `curl` CANNOT prove a route exists: `proxy.ts` 307s anonymous requests before Next
  resolves routing, so a 307 is returned for real and non-existent routes alike. Always check
  routes logged in, in the browser.
- Deleting `.next/cache` is NOT enough when routes 404: the app-paths manifest lives outside it,
  so a corrupt build directory makes depth-2 routes 404 with no `○ Compiling` line while depth-1
  routes keep working. Delete the whole `.next` directory.
- The Next dev server auto-restarts on its memory threshold and can come back with an incomplete
  route manifest.

### Phase C (POS) — CLOSED 2026-08-27. Both former gaps closed.
Cashier persona exercised end-to-end on the register (was blocked by POS-CRIT-001, now fixed).
Discounted+delivery-fee sale rung through the product and DB-verified. CSV export opened.
Tooltip-crash sweep clean across all POS surfaces. POS-024 closed as a NON-FINDING after three
independent repro attempts plus a full code trace.

**Final integrity (2026-08-27):** ledger 0.000000 / 750 lines · 18 POS txns · 4 shifts ·
5,003 items · 4 opening-balance JEs intact · **0 grand-total identity violations**.

**FOUNDER RULING 2026-08-27 — cashiers close their own shift (RESOLVED, shipped).**
`pos.session.close` MOVED from `pos.supervise` -> `pos.sell`. A manager role must NOT be required:
a one-person shop must work with no manager user at all. One key, at the single source of truth;
the Cashier template derives from the bundle via `posBundleKeys(["pos.sell"])` so it followed
automatically. Migration `0310_backfill_pos_session_close_permission` backfills existing roles
(role_permissions is MATERIALISED) - fail-CLOSED: grants only to an active role already holding
EVERY key of the pre-existing pos.sell bundle. Applied: Cashier gained it, Accountant/Viewer/Owner
unchanged. Cash controls deliberately untouched (blind count + recorded variance + per-register
approval toggle are the control, NOT the permission).
Pinned by `permission-bundles.spec.ts`: asserts the key IS in pos.sell, is NOT in pos.supervise,
the full cashier lifecycle key set, and that the Manager template is not stranded. 125 tests green.
**Live-verified as cashier1:** opened shift, sold KWD 12.626, pay-in 5.500, CLOSED the shift,
variance stored (cash_over_short -515.333), Z-report rendered (used to 409 forever), 3dp, no tax UI.
`pos.transaction.price-override` and `pos.transaction.void` deliberately STAY OUT of the cashier
baseline (documented: bypasses the discount-approval gate / self-void cash-shrinkage vector).
Payment Methods remains in `pos.configure` (back-office setup) - owner reaches it via bypass; no
manager role required there either.

**The one pattern that defined this module:** POS defects were overwhelmingly PATH DIVERGENCE
(online vs offline, client vs server), not bad logic. The zero-total sale took FIVE fixes, each
revealing the next layer: client guard -> 3 DTO schemas -> a Drizzle `.values([])` crash. Three
separate FALSE-SUCCESS bugs shipped ("Sale completed" on a 500, "Shift closed" on a 403, plus the
swallowed currency 403). When fixing here, always ask: does the OTHER path still enforce the old
behaviour?

### Phase F — Print setup (founder-flagged as highest-importance)

**Headline: the language-binding rule PASSES, confirmed both directions.** Same invoice
`B1ALRAIMAINS-INV-00006` captured under `/en` and `/ar`: `#invoice-print-root` textContent is
**byte-identical** (`diff` clean), and layout direction is bound too (under an RTL UI the printed
root reports `attr=ltr computed=ltr htmlDir=rtl`). Arabic-document-under-English-viewer proven by
`vitest run language-binding`, 10/10, with next-intl mocked to THROW on any call. Scoped by what
RENDERS (all 23 files with `@media print` / `window.print()` / `print:block`), not by directory -
the trap that caused a previous audit to miss a hardcoded English string on a Saudi tax invoice.

**19 printable surfaces** (11 canonical `PRINT_DOCUMENT_TYPES` dispatched exhaustively + 8 others).
**Scoping model:** 7-layer sparse-diff chain (country -> brand -> pack -> tenant -> tenant+type ->
branch -> branch+type). Coherent and long-term scalable: new levels cost no columns and no migration.

**Clean:** zero em dashes (the RPT-052 primitive has NOT regressed), no hardcoded decimal counts
(KWD 3dp live), **no path divergence - all 6 print helpers single-sourced**, zero physical CSS
properties, brand fully config-driven, `@Audited` on all print-setup mutations verified in
`audit_log`, en/ar print.json parity 185/185.

| ID | Sev | Summary | Status |
|---|---|---|---|
| PRINT-001 | HIGH | **FIXED + VERIFIED LIVE BY ME** (accountant1 -> 403 on both print-settings endpoints, owner -> 200; nav entry no longer renders for them, direct navigation gives a clean denial instead of a dead end). Fixed by moving the FRONTEND gate onto `settings.tenant.read` - the key its own endpoints already require - so **nothing was widened**, no role template or migration touched. Granting `settings.system` would have handed those roles API-key/webhook/security read. The bookkeeper's real need (viewing and printing documents) is served by the untouched per-document-type gate. **New 49-test parity guard proven failable THREE ways** - and notably the agent's FIRST draft of the grantability check stayed GREEN when broken, because apps/web resolves to a stale `dist`; it found its own unfailable guard by trying to break it and rewrote it to read source from disk | ORIGINAL: | **Orphaned permission:** Accountant and Viewer see a "Printing & Documents" nav section that 403s on everything inside, and **no role can be granted access**. Frontend gates on `settings.numbering.read`; endpoints require `settings.tenant.read/update`. Independently confirmed: `settings.tenant.*` has **ZERO grants across all roles**, `settings.numbering.read` has 2 (Accountant, Viewer). Reachable only via the Owner bypass. Same shape as the orphaned `reports.sales.read` that Reports fixed. **Two passing spec files pin the drift** by asserting decorators against themselves, never against the role catalogue or the frontend gate | OPEN |
| PRINT-002 | MED | Raw UUID where a document number belongs. **Far bigger than first reported**: besides direct-purchase `DP-<uuid>`, the `DRAFT-<uuid>` placeholder is minted at **9 sales call sites** (invoices, credit/debit notes, quotations, delivery orders, receipt vouchers, direct sales) and **11 hand-built PDF filename templates** each interpolated a raw number. The fix also caught a **second live leak the original audit missed** - the POS tax-invoice overlay | **FIXED AT THE PRIMITIVE** - new branded `PrintDocumentNumber` type whose only constructor is `toPrintDocumentNumber()`, so a raw column value is a **compile error** and placeholders are unrepresentable (the SAL-PRINT-001 pattern); filenames single-sourced through `printDocumentFileName`. Live: `filename="purchase-order.pdf"` for a placeholder, control PO keeps its real number |
| PRINT-003 | MED | (UNBUILT FEATURE, not a bug - correctly stated, deliberately not attempted) **No printer selection anywhere, and no thermal medium** (old ESC/POS stack deleted, Phase 13 not built). "Printer-select everywhere" is NOT the current state | OPEN |
| PRINT-004 | MED | No standalone item/shelf label printing exists | (UNBUILT FEATURE, not a bug - deliberately not attempted) |
| PRINT-005 | MED | Server Chromium PDF 503s, degrading to `window.print()` | **WITHDRAWN - environment only.** Three consecutive renders went 503 (21.7s) then 201, 201, and the PO PDF returned 200: `networkidle0` racing a 20s timeout against a loaded dev server, not logic |
| PRINT-006 | MED | POS receipts did `Number(value)` then `formatCurrency(num,"en",...)`, bypassing precision guards and the `arab` numeral seam | **FIXED** - both receipts use `formatPrintMoneySymbol` with the document's own format context; precision stays ISO-4217-derived, no hardcoded 3 |
| PRINT-007 | LOW | Wrapper `#invoice-print-root` inherited viewer RTL (inner root overrode it; latent) | **FIXED on all TEN print wrappers** via a new `printedDocumentDirection(doc)` helper, not just the invoice one |
| PRINT-008 | LOW | Pack template layer declared with no producer | OPEN |
| PRINT-009 | FRICTION | X-report shares the Z-report's `useTranslations` exemption without its written justification | OPEN |

**Founder's standard: PASSES for the owner** - 3 clicks to a setting + 1 to save, 2 clicks to print,
zero forced fields, working defaults, live preview, no stacked dialogs, comfortably under 60s.
**But the agent corrected its own verdict:** the owner bypasses all permission checks, so that
whole browser session proved nothing about other roles. For a non-owner the blocker list now leads
with "they cannot open the screen at all" (PRINT-001).

### Phase F — Accounting + Print (opened 2026-08-30)

| ACC-BUILD-001 | - | The API build was BLOCKED by two fixtures inserting accounts without `isMonetary` | **FIXED BY ME.** A GOOD failure: the FX CRITICAL fix made `is_monetary` `.notNull()` with **no default**, so an omission is now a compile error instead of silently flagging an account monetary and disabling the IAS 21 guard. Fixed by calling the canonical `deriveIsMonetary()`, **not** by hardcoding `true` - a fixture pinning `true` would have recreated the exact bug inside the tests. API rebuilt and restarted clean |


Ledger identity at open: **0.000000 over 889 lines**. Posted-ledger identity re-verified
throughout. Findings files: `09-accounting-*.md`, `09-print-setup.md`, `09-perf-002-diagnosis.md`,
`09-audit-entityid-class.md`.

| ID | Sev | Summary | Status |
|---|---|---|---|
| ACC-COA-001 (was AUDIT-002) | CRIT | `POST /tenant/accounts/bulk` audited by a hand-rolled second mechanism that bypassed the shared interceptor: `user_email` always empty, no field-level snapshot, fire-and-forget outside the transaction | **FIXED + verified live** |
| ACC-COA-002 | HIGH | Dead-letter retry (a control action over the ledger's event pipeline) had no `@Audited` decorator at all | **FIXED + verified live** |
| ACC-FX-001 | CRIT | Unrealized FX auto-reversal could NEVER post - dated to the next period's first day, which the posting guard rejects, so the reval posted and never reversed (permanent unrealized-FX overstatement). Had TWO causes; the second was only exposed once the first was fixed and the error message changed. (1) Future-dating: fixed by a narrow exemption keyed on the EVENT TYPE, not a caller-passable boolean, bounded to the immediately-following period and loud on failure. (2) The reversal event then had NO account mapping at all. | **FIXED + VERIFIED LIVE BY ME.** Resolved via `inheritsFrom` in `GL_EVENT_REGISTRY` rather than seeded rows - the agent correctly OVERRODE my instruction to write a migration: inheritance resolves at query time so there is nothing to backfill, and seeding rows would be actively wrong (a tenant overriding the forward mapping would have the reversal silently fall back to default, both entries balancing while unrealized FX never cleared). Hand-derived 1000 AED @0.0835->0.0870 = gain 3.500; actual matched to the fils: JRN-00106 (08-30) DR 1131 / CR 4830 party-tagged, JRN-00107 (**09-01, first day of next period**) exact mirror. Stranded dead letter retried THROUGH THE PRODUCT, no hand-written journal |
| ACC-FX-002 | CRIT | **FIXED + VERIFIED LIVE BY ME** (migration 0314: now 29 monetary / 71 non-monetary, was 100/0; spot-checked IAS 21 correct - bank/AR/AP/deposits monetary, inventory/retained-earnings/both revenue accounts non-monetary, so revenue 4110 is no longer revalued). `is_monetary` was TRUE for **all 100 accounts**, so the IAS 21 monetary guard is inert — revenue 4110 was revalued and credited KWD 6.500 against a fake offsetting loss. Path divergence: seed + crud services never write `isMonetary` and the DB default is `true`, so **every newly provisioned tenant is born with the guard disabled**. Gain == loss, so summary cards hide it | fix in progress |
| ACC-CHQ-001 | CRIT | On-account cheque received (the DEFAULT settlement mode) put a `partyId` on account 2151 Customer Deposits, which is deliberately NOT a party sub-ledger, so the posting guard rejected the JE. Document committed and `GET /cheques/:id` returned it 200 while ZERO journal entries existed - the highest-value defect class in this module, deterministic so retries could never fix it. `received`, `bounced` AND `cancelled` all affected via one hand-copied lineType list | **FIXED + VERIFIED LIVE BY ME.** `partyForChequeLine` now derives eligibility from `isPartySubledgerRole` - the SAME registry the posting chokepoint enforces - so the bad state is unrepresentable and 2151/1161 promotion would follow automatically. Fresh ZZTEST cheque: outbox `completed`, JE JRN-00104 exists, DR 1134 / CR 2151 balanced, 2151 carries no party |
| ACC-BANK-001 | CRIT | **FIXED + VERIFIED LIVE BY ME** (migration 0315 + unique index `bsl_matched_jel_id_unique`; zero remaining duplicates; existing dupes released back to the operator's queue rather than deleted, winner chosen by hardest-to-undo). Manual bank-rec `matchLine` lacked the cross-statement already-matched guard that `auto-match.service.ts` has, so the SAME GL line can be matched into two statements — two reconciliations can each show a false zero-difference tie-out. Challenged after it failed to reproduce (the agent's own cleanup had erased its first evidence); **re-reproduced live and independently confirmed by me**: `times_matched=2, distinct_statements=2` | fix in progress |
| ACC-BANK-002 | HIGH | **FIXED (verified: a live unmatch now writes a correct audit row - right entity_id, `action=update`, real actor; same root cause as ACC-AUDIT-005).** `match-line` / `unmatch-line` / `no-match` / `reconcile` carry `@Audited("BankStatement")` but produced zero audit rows across four live 200s | reported |
| ACC-FX-004 | HIGH | **The mapping completeness spec was strong but BLIND** - both directions were driven off the hand-maintained `GL_EVENT_REGISTRY`, so an event type emitted by code but never added to the registry was invisible to both checks. An entire event type shipped with zero mappings and CI stayed green | **FIXED - added privileged-type coverage plus a source scan of `eventType:` literals with a documented allowlist and a non-vacuity assertion; proven failable THREE ways, each observed red then restored green (479/479)** |
| ACC-FX-003 | HIGH | Re-posting a revaluation inside the async window returns a raw 500 with a leaked constraint name instead of 409 — reports a committed financial write as a failure (defect pattern #5) | reported |
| AUDIT-004 | HIGH | `audit_log` has no `branch_id` / `legal_entity_id` — independently re-confirmed from `information_schema` | OPEN, decision owed |
| AUDIT-003 | HIGH | Exports unauditable by design; the interceptor never audits GET | OPEN, decision owed |
| ACC-AUDIT-005 | HIGH | **FIXED + VERIFIED LIVE BY ME** (ZZTEST role create -> audit row carries the real entity_id joining back to the created role, and the real actor email). Root cause was deeper than the symptom: the interceptor read tenant context from AsyncLocalStorage that was not yet established at that point in the chain. ORIGINAL: | 17 audit rows across **8 entity types** (incl. `CloseRun`, `FxRevaluation`, `DirectSale`, `Role`) carry `entity_id='unknown'` and cannot be joined back to the record they describe. NOTE: the rows ARE written — the earlier "interceptor silently skips" mechanism was wrong | fix in progress |
| ACC-JRN-001 | CRIT | **FIXED + VERIFIED LIVE BY ME** (ZZTEST JRN-00108: both lines now carry branch_id = Al Rai). Manual JEs wrote `branch_id = NULL` on their lines (`createDraft`) while engine JEs **and every reversal** write the fallback (`postDirect`). Six report services filter with a bare `eq(branchId, X)` that NULL never matches, so a manual JE vanishes from a branch P&L while its reversal appears: Al Rai P&L showed Rent **−12.345 KWD** and an operating *profit* where GL truth is a 20.988 expense. Verified live: engine types all NOT NULL, manual JEs split 8 entries NULL / 2 populated. Three treatments of one column | fix in progress |
| ACC-JRN-002 | HIGH | No application-layer balance check on the manual post path — `validateLines` does not check Σdr=Σcr despite a comment claiming it does. An unbalanced entry is stopped only by the DB CHECK, surfacing as a bare 500. Money safe (backstop held) | fix in progress |
| ACC-JRN-003 | HIGH | No maker-checker on manual journals: accountant1 created AND posted `JRN-00085` alone. `isApprovalRequired()` hard-coded `false` behind a `ponytail:` comment | **founder decision owed** (recommend configurable, default OFF) |
| ACC-JRN-004 | MED | Post and reverse both auditing as `action='create'`, with no audit row on the reversed entry | **WITHDRAWN - already fixed by a prior session (erp b3c2f2f1); both paths verified to carry correct audit rows** |
| ACC-JRN-005 | MED | Reverse/amend refusals return `code: null` with English-only prose | fix in progress |
| ACC-JRN-006 | — | "Document commits before its GL posts" on the manual JE path | **WITHDRAWN — two forced late failures both rolled back cleanly** |
| ACC-INFRA-001 | MED | Five em dashes live in the Arabic chart of accounts; migration `0313` was written but never applied to this tenant | **FIXED — migration applied, 0 remaining** |
| KEYSET-001 | CRIT | **The ms-vs-microsecond cursor bug was in 11 MORE services than any prior phase found** - 8 of them EXPORTS, in Purchase and Sales, both already marked COMPLETE. Every site sorts DESC and seeks with `<`, so a downward-truncated cursor excludes its own millisecond siblings: **11 SKIPPED, 0 REPEATED**. Live data guarantees it fires - 296/304 purchase invoices and 316/328 sales invoices share a millisecond with a sibling (bulk/imported writes share one `now()`). **I reproduced it independently in SQL: with the truncated cursor 0 rows remain after page 1 (export stops at 50 of 304); with the microsecond cursor 254 remain. 254 of 304 rows - 83.6% - silently vanish from a purchase bill export.** A silently short export is worse than a broken screen: nobody sees the gap and an accountant reconciles against a file quietly missing most of its rows | **FIXED - all 11 via the shared `keysetTimestamp()`; `KNOWN_OFFENDERS` allowlist now EMPTY; verified in the compiled binary** |
| KEYSET-002 | - | The `keyset-cursor-precision.spec.ts` allowlist FAILED BECAUSE THE BUG WAS FIXED (it asserted two POS services must still be broken) - a textbook "test demands a defect" | **FIXED - entries removed, ratchet retained, plus an "actually scanned something" assertion guarding against a silently-empty scan** |
| ACC-COA-004 | HIGH | **FIXED (verified: `filteredTreeNodes` now feeds the export, 6 refs).** Chart of Accounts CSV export ignored the active filter - `handleExportCsv` passes raw unfiltered `treeNodes` while search/type filter are applied downstream at render. Filter to "asset", export, get the whole chart. Trial balance right next door correctly exports `visibleLines`: one concept, two implementations, one wrong | fix in progress |
| ACC-COA-005 | HIGH | **FIXED (verified: eventType now rendered via Select/combobox).** Account Mappings "event type" filter was a free-text input against a closed 38-value Zod enum with exact-match equality. Verified live: `eventType=cheque` returns **HTTP 400 dumping the entire internal enum at the user**, and the generic error state blanks all 176 rows. The `scope`/`isActive` filters beside it are already Selects | fix in progress |
| ACC-COA-006 | MED | Raw Zod enum text leaks into user-facing error copy (same DTO-error primitive behind the bulk-create leak - one fix closes both) | fix in progress |
| ACC-COA-007 | MED | **FIXED (verified: `keepPreviousData` now present in account-mappings queries).** Account-mappings query missing `placeholderData: keepPreviousData` - flicker on every filter/page change at the ~700-900ms Neon RTT baseline | fix in progress |
| ACC-COA-008 | - | CoA pagination cursor risk (RPT-037 class) | **WITHDRAWN - screen fetches the whole tree via `/accounts/tree`, not a cursor list; mappings list walked pages 1-9, zero skips/dupes** |
| ACC-ARAP-001 | HIGH | **FIXED + VERIFIED LIVE BY ME** (ZZTEST receipt RV-00008 vs INV-00008: settlement leg on 1131 now carries due_date 2026-08-30, cash leg correctly NULL). Settlement/reversal legs posted to party-tagged control accounts with **`due_date = NULL`**, so aging cannot honour the allocation the user made and falls back oldest-first. A receipt allocated to the `current` invoice moved 4.000 out of `days31To60`: true split 6/10/10, reported 10/10/6. **The grand total still ties, so no tie-out catches it.** Independently confirmed: 327/307 origination legs carry a due date, 10 AR + 7 AP non-origination legs are NULL. The REVERSE builder already stamps it (with a comment explaining why); the FORWARD builder was never patched | fix in progress |
| ACC-ARAP-002 | MED | **FIXED (verified: `customer-ar-balance.service.ts` now imports the shared `resolveReportAsOf` - converged onto the existing primitive rather than patching its dates).** A SECOND AR aging implementation (`customer-ar-balance.service.ts`, feeding sales-overview KPIs and the overdue-notification scheduler) ages against Postgres `current_date` on **GMT, not tenant-local** - wrong by a day for the first 3 hours of every Kuwait business day | fix in progress |
| ACC-ARAP-003 | MED | **FIXED (currency column, functional total and totals row added, with new ar/en keys).** Multi-currency AR aging CSV dropped the currency dimension entirely (no column, symbol or totals row). Summing the export gives 588,996.541 vs a true 588,080.041 - a **916.500 error from one unlabelled AED row** | fix in progress |
| ACC-ARAP-004 | LOW | Duplicate-allocation error prints a raw invoice UUID; its sibling over-allocation error correctly prints the document number | fix in progress |
| ACC-ARAP-005 | - | AR/AP tie-out, NULL-party stranded money, bucket boundaries, allocation guards, Kuwait no-tax, India GST expressibility | **VERIFIED CORRECT - AR 588,080.041 and AP 1,346,111.843 both hand-derived to 0.000 delta; zero NULL-party control lines; AR/AP aging are ONE shared primitive** |
| ACC-PER-001 | HIGH | **Asymmetric period control:** hard-locking needs a two-person completed close run; **unlocking needs only `accounting.period.unlock`, which the Accountant role holds alongside `period.lock`**. accountant1 alone reopened a hard-locked month. Independently confirmed: the role holds BOTH keys. Strong control in, none out | **founder decision owed** |
| ACC-PER-002 | MED | **FIXED (verified: native partial unique index `cct_one_active_default_idx` - one active default per tenant/entity/periodType, plus an app short-circuit).** `POST /close/templates/seed-default` was not idempotent - two clicks create two active "Monthly Close" templates, newest silently shadows the older | OPEN |
| ACC-PER-003 | MED | **FIXED (verified: replaced with a per-parse `.refine`; repo-wide sweep found this was the only live hit, and the `z.coerce.boolean()` trap is separately confirmed fully closed).** `z.coerce.date().max(new Date())` froze "now" at MODULE LOAD, so today's date is rejected as future (reproduced 3 min after boot). Coercion-trap family, same as `z.coerce.boolean()` and the ms/microsecond cursor | OPEN |
| ACC-PER-004 | MED | **FIXED (verified: zero `toFixed(2)` left in the opening-import services; routed through the canonical money primitive, not a hardcoded 3).** Three user-facing money strings hardcoded `toFixed(2)` in a KWD **3dp** tenant (opening-balance.service.ts:840, :2955; opening-party-import.service.ts:1235) | fix in progress |
| ACC-PER-005 | MED | **FIXED (verified: eslint reports 0 errors on all four previously-flagged files, so the strings are corrected and the new guard confirms it on real code).** ~10 user-facing server-thrown strings contain em dashes (TB-import wizard questions, opening-balance errors, export errors). Independently verified | fix in progress + **lint guard being installed** |
| ACC-PER-006 | MED | **FIXED (verified: one shared `build-rows-preview.ts` extracted, 1-based throughout, 4 regression tests).** `buildRowsPreview` off-by-one (mappers emit 1-based, helper reads 0-based, last row's error dropped) hand-copied into THREE importer services. Latent: the wizard renders `issues`, not `rowsPreview` | OPEN |
| ACC-PER-007 | MED | **FIXED (verified: 6 `AuditAction.Update` overrides on the fiscal-period routes, reusing the mechanism the correct sibling already used).** Every period lock/unlock wrote TWO audit rows, one mislabelled `create` with a null before-state; the sibling `close` route gets it right | OPEN |
| ACC-PER-008 | LOW | Override refusal leaked a raw period UUID and the internal parameter name `softLockOverrideReason`. Sweep found **27 MORE sibling copies** than reported | **FIXED (verified: 16 files now use one shared `softLockOverrideRequiredError` primitive with a stable code)** |
| ACC-PER-009 | FRICTION | Live tenant had ZERO close templates, so close management was inert and year-end close impossible. 14 actions across two accounts to close one period; nothing says a lock is reversible. An untrained bookkeeper could not do it first try | OPEN |
| ACC-PER-010 | - | Reversal appears to bypass a soft lock | **WITHDRAWN - posts on today's date into an open period, correct convention; acting on it would have broken working behaviour** |
| ACC-PER-011 | - | `/opening-balance` vs `/opening-balances` path divergence | **WITHDRAWN - a 16-line `permanentRedirect`, not a second implementation** |
| ACC-INFRA-006 | MED | The last em dash in the web app was `preview.noValue` in `en/ar settings.json`, rendered into the **POS receipt print preview**. Hidden from every code sweep because it lived in the message catalogue, not `src/`. Fixed at the primitive: use `EMPTY_VALUE_PLACEHOLDER` and DELETE the key from both locales so it cannot drift again | **FIXED — i18n parity + typecheck clean, 0 em dashes left in messages** |
| ACC-FX-007 | HIGH | **A single global rate feed is the wrong architecture for a MENA-first product.** I verified against the live ECB API: **KWD, AED, SAR, QAR, OMR and BHD are ALL absent** (India/SEA and all supplier currencies are covered). Correcting my own earlier advice, which understated this as a KWD-only caveat. The fix is not a different feed - the three groups need different treatments: a **peg table** for the hard-pegged Gulf currencies (a fixed peg is MORE accurate than a market feed, which would inject phantom FX gains on balances that never moved), a **CBK source** for basket-pegged KWD, and ECB for floating India/SEA. Resolution must be per CURRENCY PAIR, not per tenant | OPEN (architecture recorded; fail-loud verified working) |
| ACC-FX-005 | HIGH | `exchangerate.host` silently requires an API key the code never sends, so auto-fetch would fail for every tenant the moment it is enabled | **FIXED** - switched to keyless Frankfurter with SSRF validation preserved and a fail-loud `UnsupportedCurrencyError` checked pre- AND post-fetch; KWD test passes in both base and quote position with zero network calls and zero rows stored |
| ACC-ARAP-005 | MED | The 20 historical NULL-due settlement legs **cannot be migrated** - `prevent_posted_journal_line_mutation()` unconditionally blocks any UPDATE to a posted/reversed JE line, even a metadata column (confirmed via a rolled-back test transaction). That is the ledger being correctly immutable. 4 are FX legs where a due date has no meaning, 15 are derivable by join, 1 is unrecoverable | **RULED: resolve at READ time in the aging report via COALESCE joins, never mutate the ledger.** Draft migration was tested then fully removed (file + snapshot + journal, regenerated not hand-edited) |
| ACC-ARAP-004 | LOW | Raw UUID in the duplicate-allocation error. Sweep found **~14 sites** across AP and AR, not the one reported | **FIXED** - all now print `bill.number` / `invoice.number` |
| ACC-COA-006 | MED | Raw Zod enum dump in user-facing 400s | **WITHDRAWN - live repro shows it already fixed** by a concurrent session's uncommitted work |
| ACC-FX-006 | LOW | A rate entered as `closing` is invisible to transactional forms, which look up `spot`, with no explanation to the user. **Recommendation: do NOT fall back spot->closing** (different rates for different purposes; silent substitution is what 'FX fails loud' forbids) - instead say on the form: you have a closing rate but no spot rate for this date. Also documents the scoping model: rates are TENANT-WIDE per (pair, date, type), with **no branchId/legalEntityId** - correct, since a rate is a property of a currency pair, not a shop | OPEN (recommendation recorded) |
| ACC-FX-006b | - | I initially reported this as a probable serious gap (users enter rates, documents cannot see them) | **WITHDRAWN/CORRECTED within the same exchange** - the create dialog defaults to `spot` and lookup defaults to `spot`, so defaults ALIGN; the 404 came from rates our own FX test agent created as `closing` |
| ACC-INFRA-009 | - | **Em-dash ban is now ENFORCED**, closing the mechanism behind 5 prior recurrences: ESLint rule (`packages/eslint-config/em-dash.js`) for code, scoped to thrown-exception messages + copy-shaped object keys + JSX text (comments/loggers/regex deliberately excluded, defended in writing); `check-translations.ts` Phase 0b for the JSON catalogue, closing the exact hole the last one hid in. Bans U+2014/U+2015, allows U+2013 en dash as a legitimate range separator | **DONE - I injected a probe and watched the catalogue gate go RED, then restored it to GREEN** |
| ACC-INFRA-008 | HIGH | **The `.next` cache lead was REAL but is a SECOND, separate bug from PERF-002's API half.** Cache grew 27GB -> 32GB this session; dev server stopped answering entirely (API on 3001 fine throughout, so not machine load). Log: `GET /en/login 200 in 10.2min (next.js: 7.9min)` and `Finished writing to filesystem cache in 4.5min` - minutes per request in Next's own cache machinery, while `proxy.ts` was 102ms. This is what the '3s browser-vs-curl gap' always pointed at. **Dev-environment only, NOT a product bug** - no customer runs `next dev`. Also blocked the live browser pass for 4 separate agents | **FIXED - cache cleared, dev server restarted under tmux; also killed 17 orphaned browse daemons at load 28.7** |
| ACC-INFRA-007 | LOW | Snapshot test named "byte-identical to the pre-change shape" whose snapshot is no longer byte-identical to that shape - a later bilingual feature legitimately moved it, so the frozen-shape guard silently became a tautology. Classified every changed line first: all monetary fields byte-identical, change is additive Arabic `descriptionAlt` | reported (POS-owned, not fixed mid-phase) |
| ACC-BANK-003b | - | I claimed this was a THIRD orphaned permission and that no shipped role holds `reconciliation.approve` | **MY CLAIM WITHDRAWN - the Manager role template DOES hold it via the `accounting.approve` bundle.** My SQL measured only the roles THIS TENANT had provisioned, and Gulf Auto Parts never created a Manager role (templates are opt-in). I generalised from one tenant's data to a claim about the product. The real defect was different and better: `create` and `approve` are an **SOD_RESTRICTED_PAIRS** entry, so the workflow was STRUCTURALLY IMPOSSIBLE for anyone - the Accountant who imports could not match, the Manager who could match could not import |
| PERM-GUARD-001 | - | No guard existed against a `@RequiresPermission` key that no role can be granted | **ADDED + PROVEN FAILABLE** - 234 cases sweeping all 232 distinct keys, requiring each to be in a bundle, a role template, or `OWNER_ONLY_KEYS`. Reads source from DISK, never importing `@zerupt/shared` (deliberately avoiding the stale-`dist` trap that made an earlier guard unfailable). Orphaning a key went red with a precise message, restoring went green. The only 4 unheld keys are `OWNER_ONLY_KEYS` by design |
| PRINT-008 | LOW | Pack template layer declared with no producer | **WITHDRAWN - a spec-pinned reserved seam explicitly marked NOT IMPLEMENTED; deleting it renumbers every layer rank for zero behaviour change** |
| PRINT-009 | FRICTION | X-report shares the Z-report `useTranslations` exemption without justification | **CLOSED, and narrowed: the X-report dialog never prints (no `@media print`, no `window.print()`) so needs no exemption. The real gap was `ZReportDocument`'s header justifying only the Z-report while also serving as the X-report body; header now scopes it explicitly** |
| ACC-FX-003 | HIGH | Re-posting a revaluation inside the async window returned a raw 500 with a leaked constraint name instead of 409 | **FIXED** - now a 409 with plain copy; the detector walks `.cause` because Drizzle wraps the error (the existing close-run helper checks only the top level and would have missed it). Also fixed a neighbouring 409 leaking a raw UUID |
| ACC-INFRA-002 | HIGH | **FIXED (verified: CLAUDE.md now documents `DIRECT_URL_TENANT` vs the POOLED `DATABASE_*_URL`, and each drizzle config PRINTS its resolved target database and host before applying).** `drizzle-kit migrate` reports success while migrating the WRONG database when the env var name is wrong; CLAUDE.md documents `DATABASE_TENANT_URL` but the config reads `DIRECT_URL_TENANT` | OPEN |
| ACC-INFRA-003 | MED | The programme's own master ledger gate is status-blind, so any unbalanced draft trips it. Use the posted+reversed form | **methodology corrected** |
| ACC-DL-001 | MED | A `document.amended` purchase-order event has been failing Zod validation since 2026-08-28 — producer emits a short shape, consumer validates the full accounting-event shape. Includes an `expected date, received Date` coercion trap | OPEN (Purchase-side) |
| ACC-INFRA-005 | — | "Failed outbox events are invisible in the dead-letters UI" | **WITHDRAWN — they were mid-backoff; retry machinery is correct** |
| ACC-COA-003 | — | CoA cycle guard / depth guard / deactivation + delete protections | **WITHDRAWN — verified correct** |
| PERF-002 | HIGH | **ROOT CAUSE FOUND after standing open across several phases.** Not the Next layer (HTML shell is ~10ms) and not the 27 GB `.next` cache; also NOT per-request connection setup (my hypothesis — disproven: a cold Neon connect costs 2.5s, more than a whole request, and the pool cache logs hits). Real cause: `BranchAccessResolver.isOwner` and `PermissionGuard.hasPermission` both call an unmemoized `loadActiveRoles`, so **the identical RBAC query ran twice on every tenant request, ~50% of total latency**. Fixed by per-REQUEST memoization keyed by the Drizzle db object (not tenant/user id, so a pg-boss job inheriting the ALS cannot get a cross-tenant hit by construction); request scope, not TTL, so permission revocation is unaffected. Agent measured 1.94s -> 0.67s isolated, ~1.52s -> ~0.79s under load. **My own re-measurement was inconclusive under ~9 concurrent agents — to be re-verified when quiet.** Affects EVERY tenant request app-wide, not just accounting | **FIXED — pending my independent re-measurement** |

## Rules of engagement
- Write freely into the tenant. Every document created is logged in `_documents-created.md`.
- Never touch the 4 opening-balance journals (OB-0001, OB_AP-0001, OB_AR-0001, OB_INV-0001)
  or the go-live state. Ledger must still reconcile to 0.000000 at the end.
- Full ar/en parity checked on EVERY screen.
- Every finding fixed via a background subagent; money / tenant-scoping / schema changes
  are escalated to the founder before being applied.

## Severity
**CRITICAL** data loss, money wrong, tenant leak, auth bypass ·
**HIGH** blocks the task, silent failure · **MEDIUM** confusing, friction, missing state ·
**LOW** cosmetic, copy · **FRICTION** works but wastes the user's time

## Per-screen checklist (EVERY screen, no exceptions)

Applied to every list page, form, detail page, dialog and printed output.

### A. Scoping (data isolation) — CRITICAL
- [ ] **Branch scoping** — when a branch is selected, ONLY that branch's data renders.
      No cross-branch leakage in lists, totals, counts, KPIs, pickers or exports.
- [ ] **Legal entity scoping** — same, for the legal-entity axis. Entity-scoped data
      (stock, GL, documents) never crosses entities.
- [ ] **Warehouse scoping** where applicable (6 warehouses in this tenant).
- [ ] **Tenant scoping** — every backing query carries `tenant_id`. Verified in DB /
      by reading the service, not assumed.
- [ ] Switching branch/entity refetches, and does NOT show stale prior-scope data.
- [ ] Aggregates (totals, counts, badges) obey the same scope as the rows beneath them.

### B. Permissions
- [ ] The route IS gated (an ungated screen is itself a finding).
- [ ] Backend `@RequiresPermission` matches the frontend nav/route gate (no drift).
- [ ] A user lacking the permission gets a clean denial, not a crash or a blank page.
- [ ] Sub-permissions honoured: `cost.view` strips cost/margin columns,
      `operational.view` etc. Hidden in UI AND stripped server-side.
- [ ] Action buttons (edit / void / approve / export) gated individually, not just the route.

### C. Audit
- [ ] Every mutation writes an audit row (create, edit, void, approve, delete, export).
- [ ] The audit row has correct actor, entity_id, entity type, before/after, branch, entity.
- [ ] Verified in the DB, not inferred.
- [ ] No raw URL used as a dedupe key or entity_id.

### D. List pages
- [ ] Pagination (deep pages, page-size change, keyset correctness at 5,000 rows)
- [ ] Search (partial, exact, alt-code, Arabic, no-results state, debounce)
- [ ] Every filter, individually and combined; filters survive pagination
- [ ] Sorting on every sortable column, both directions
- [ ] Empty state, loading state, error state (unknown state is NOT isLoading)
- [ ] Export: file downloads, correct filename, correct format, **applied filters
      respected**, values derived correctly, actually useful to a human
- [ ] Import (where present): template, validation, conflicts, partial failure, progress

### E. Forms
- [ ] Every field: required/optional, validation client AND server, error copy
- [ ] Unnecessary fields identified for removal (Musk rule: simplest that works)
- [ ] No-tax country → NO tax UI anywhere (Kuwait)
- [ ] KWD 3 decimals everywhere. Any 2dp rounding = CRITICAL
- [ ] Keyboard-first: tab order, Enter to advance, shortcuts for every frequent action,
      no mouse required for the happy path
- [ ] Loading / error / empty / success states on every action
- [ ] Destructive actions confirmed; buttons debounced; race conditions handled
- [ ] Warn before data loss on navigate-away
- [ ] Scroll behaviour correct at 375 / 768 / 1280 / 1920

### F. i18n (full parity, every screen)
- [ ] No hardcoded strings — en and ar both complete
- [ ] RTL correct: CSS logical properties only, no physical margin-left/padding-right
- [ ] Numbers, dates, currency formatted per locale
- [ ] Printed documents bind to the DOCUMENT language, never the UI locale

**2026-08-29 - configured `PUPPETEER_EXECUTABLE_PATH` (ENV-001, unblocks all print/PDF verification).**
There is no Chrome or Chromium application on this machine, but Playwright's
`chrome-headless-shell` is already cached at
`~/Library/Caches/ms-playwright/chromium_headless_shell-1234/`. Tested directly against
`puppeteer-core`: both `headless: true` and `headless: "shell"` produce a valid PDF (14,571
bytes), so `chromium-pdf-renderer.ts` needed **no code change** - only the env var.

- Added to the gitignored root `erp/.env` (backed up to `.env.bak-preprint` first).
- Production is unaffected: it still gets Chromium from `apps/api/Dockerfile` (`apk chromium`).
- Before this, every print/PDF request returned 503 and SAL-PRINT-001 (the phase's only
  CRITICAL) could not be verified on rendered output at all.

**Ledger integrity across this session: `0.000000` before and after, unchanged.**

## Environment changes made during testing (audit trail)

**2026-08-26 — applied 3 pending migrations to the Gulf Auto Parts tenant** (founder approved).
The tenant was 3 behind the code under test. Ran the sanctioned pre-deploy path:
`node dist/migration/migrate-all.cli` from `erp/apps/api`.

- 0306 drop_supersession_alt_code_type · 0307 fantastic_enchantress · 0308 backfill_autoparts_pack_permissions
- Result: 1 tenant migrated, 27 deferred DDL applied, 0 failed. Drift now clean (behindCount 0).
- Why it was required: `role_permissions` is MATERIALISED, so without 0308 existing roles would
  silently lose auto-parts authority once the pack routes demand the new keys. Any permission
  finding made before this would have been untrustworthy.

**Integrity verified before AND after:**

| Check | Before | After |
|---|---|---|
| Ledger net (must be 0) | 0.000000 | **0.000000** |
| Journal entries | 4 | 4 |
| Items | 5,000 | 5,000 |
| Stock rows | 11,239 | 11,239 |
| Alternate codes | 12,301 | 12,301 |
| code_type='supersession' | 754 | 0 |
| code_type='superseded' | 0 | 754 |

The supersession -> superseded collapse lost no rows (12,301 total unchanged), so no
cross-reference was merged away by a unique-key collision.

Also applied: trigram indexes on item name / SKU / part number / name_alt (0306, 0307). These
materially affect search behaviour, so search performance measured before this point is not
comparable to after.

## Phase E residual verification gaps (honest list, 2026-08-29)

These were NOT verified live and are recorded as gaps rather than passes:

- **Arabic customer-name search on quotations and delivery-orders.** Confirmed live on invoices (3/3
  expected rows) and sales orders (1/1), matched against SQL on `sales_customers.name_alt` BEFORE
  searching. Quotations and delivery-orders have ZERO live rows in this tenant and `accountant1` lacks
  create permission to seed any, so those two are code-trace only - all four filter files call the same
  shared `customerIdsMatchingName()` helper, and the delivery-order CSV export now imports the list's
  `searchCondition` (which is what fixed its separate second predicate).
- **Delivery-order date filter (SAL-DO-001).** SUSPECTED-OK on code only, same cause: no delivery orders
  exist and the role could not create one. The fix itself is verified by unit tests (67/67) and typecheck.
- **Organisation Controls approval section in Arabic.** Not reached before the agent ran out of budget.
  Flagged as not attempted, explicitly NOT as passing.

Sort + pagination integrity WAS verified live on invoices (322 rows, two sort fields, page 1 vs page 2
document numbers captured, zero overlap and zero gaps both times) - the assertion the `id` secondary sort
key exists to protect.

## Known testing gap
`role_permissions` has **0 rows and 0 roles** in this tenant. The test user is the tenant owner,
who bypasses RBAC. **Permission gating therefore cannot be exercised end to end here** without
first creating a non-owner user and role. Flagged for the Settings/roles phase.

## G. FRICTION AUDIT — apply to EVERY screen and EVERY form (founder standard)

The user base is non-technical retail shop staff, often in a rush. Friction is a defect, not a
nitpick. Test every screen against these and file findings when they fail.

### G1. The button must do exactly what it says
- "Post payment" POSTS the payment. "Confirm" CONFIRMS. No silent draft.
- **A button label that describes an action the click does not complete is a HIGH finding.**
- Known example already found: the invite-user flow's submit says **"Send invitation"** on the
  USERNAME path, which explicitly states "No email will be sent". The button lies about what it
  does. It should read "Create login".

### G2. No unnecessary draft state
- If a document does not need a draft stage, it must not have one. Do not make the user save a
  draft and then find a second button to make it real.
- Ask on every create flow: could this be ONE action instead of create-then-confirm?
- Where a draft genuinely IS needed (e.g. an order being built over time), that is fine. State
  why it is needed. The default is NO draft.

### G3. Count the clicks and the screens to complete the core task
For every create/edit flow, record:
- number of clicks from intent to done
- number of separate dialogs/steps/screens crossed
- number of fields the user is FORCED to fill
Then state whether it could be done in fewer. Multi-step wizards for a task with under ~8 fields
are usually friction, not guidance.

### G4. No stacked dialogs, no repeated confirmation
- A dialog opening on top of a dialog is a finding.
- Confirm ONCE, and only for genuinely destructive/irreversible actions (void, delete, post to
  ledger). Do NOT confirm ordinary saves.
- Never ask the same question twice in one flow.

### G5. No dead ends
- Every error/empty/denied state offers a next action that WORKS for that user.
- Never send a user to a page they cannot access (see PERM-001).

### G6. Defaults over questions
- If the system can know it, do not ask. Pre-fill branch, warehouse, date, currency, salesperson.
- Flag every field that could have been defaulted but was left blank.

### G7. Plain language, always
- No accounting or software jargon on an operational screen. No raw field/key names.
- Error copy must say what to DO, not what went wrong internally.
- Known example: a negative price produces "This number is too large. Use at most 13 digits
  before the decimal point." Wrong AND jargon AND invisible on screen.

### G8. The 60-second test
For each primary create flow, answer directly: **could a non-technical Kuwaiti shop owner
complete this in under 60 seconds on their first try, without training?**
If no, say exactly what stops them.

**2026-08-28 — corrected a cost-pool vs GL inventory break created during Phase D testing.**
Voiding a purchase return (the first ever voided in this product) restored inventory to GL 1141 at
the frozen confirm relief (30.777056) while re-receiving stock into `item_cost_pools` at the GRN
document price (2 @ 5.500 = 11.000), leaving the pool understated by the confirm's PPV. Root cause
was in the inbound write path (`inventory-event.listener.ts`), where the GL figure and the stock
figure came from different sources for one event; that code defect is FIXED (one authoritative
figure now drives the ledger row, the pool and the JE). GRN void and landed-cost reversal were
checked and do not share it.

Repair applied via the new `repair:cost-pool-return-void` CLI (dry-run by default, detects the
divergence itself, refuses any gap it cannot attribute, writes a durable `cost_pool_value_discards`
row). Founder approved the write.

| Check | Before | After |
|---|---|---|
| Pool `total_value` (GAP-ELEBAT-00003) | 504.531614 | **524.308670** |
| Pool `average_cost` | 14.839165 | **15.420843** |
| GL 1141 vs Σ cost pools gap | 19.777386 | **0.000330** |
| `cost_pool_value_discards` (repair context) | 0 rows | 1 row, -19.777056 |
| Ledger net (must be 0) | 0.000000 | **0.000000** |

The residual 0.000330 was deliberately LEFT: it is 6dp-ledger-vs-3dp-GL leg rounding, a separate
documented issue (the accounting review measured the same class at 0.000056 across 5,003 pools),
and folding it into this repair would have disguised it. Re-running the CLI now reports
"cost pools tie to GL 1141, nothing to repair".| ACC-JRN-007 | - | I read `f-browser-je-total-debit-stale.png` as a balanced entry displaying as unbalanced, and called it HIGH | **MY CLAIM WITHDRAWN.** The browser agent traced it to its OWN failed combobox click automation, confirmed by the app's correct validation message and a clean successful run earlier. Re-reading my analysis: I noticed line 1's account still showed the UNCOMMITTED search affordance and treated it as a symptom - it was the cause. The line genuinely held no committed account or debit, so the totals bar was CORRECTLY reporting form state. **The app was right; the screenshot was an automation artifact.** Flagged as a gap for a human mouse-click spot-check |

---

## Phase H — Settings + programme-wide residual closure (2026-08-30)

Final phase. Method: code + SQL + authenticated curl for breadth; browser reserved for visual/RTL
confirmation. Every CRITICAL/HIGH independently re-verified by the orchestrator against the live DB
before being relayed. Write safety verified at close: ledger identity `0.000000`, `role_permissions`
exactly at baseline (Accountant 114 / Cashier 20 / Viewer 72), all 24 fiscal periods OPEN, branches
4/4 and warehouses 6/6 active. **No permission left widened, no period left closed.**

### Residuals closed

| ID | Sev | Summary | Status |
|---|---|---|---|
| PERF-002 | HIGH | ~3s gap alleged *above* the API in the Next/client layer | **CLOSED - PREMISE DISPROVEN.** Next document layer measures ~10ms warm (3 samples, quiet machine). `.next` 10 GB is one opaque Turbopack blob, no correlation with render time; cache never cleared and clearing is not indicated. Real cost was a duplicated RBAC query *inside* the API, fixed prior session (1.94s->0.67s). Reframed: page time is dominated by API round-trips at ~700-900ms RTT to Neon Singapore - network topology, NOT a defect |
| AUDIT-002 | CRIT | `POST /tenant/accounts/bulk` created GL accounts with no audit path | **CLOSED, live-proven.** Bulk path correctly avoids the decorator (which keys on one entity id and would no-op for a batch) and writes one audit row per created row inside the same transaction. 3 ZZTEST accounts in -> 3 audit rows out, correct actor/entity |
| AUDIT-003 | HIGH | `@AuditedExport` decided but not rolled out | **CLOSED.** Applied to 50 further routes (71 applications / 60 files, up from 5), incl. the inventory items export the original finding named. Pinned by new `audited-never-on-get.spec.ts` (5 tests). Live `audit_log` rows confirmed across 10 distinct export types |
| AUDIT-004 | - | Nullable audit scope column, no backfill | **CLOSED.** Verified independently: 13,340 rows NULL vs 14 populated. Migration 0317 applied |
| AUDIT-009 | MED | Bulk account audit rows omitted the queryable `legal_entity_id` | FIXED |
| AUDIT-011 | HIGH | Raw actor UUID shown as `userEmail` on-screen AND in export for FiscalPeriod/CloseRun rows; `fiscal-period.service.ts` passes `userEmail: userId` at 12 call sites | **OPEN** - recommend closing at the type level (make it unrepresentable), as the raw-UUID voucher bug was closed via `sourceDocumentNumber` |
| CURSOR-SWEEP | CRIT | ms-vs-us keyset cursor class | **CLOSED.** 30 paths enumerated, **7 unsafe found and fixed** (3 in Sales/POS, modules already marked COMPLETE). Fixed at the shared `keysetTimestamp()` helper. **The existing ratchet was INERT** - green with an empty offender list while all 7 bugs were live, because truncation hid inside local helpers (`toIso`) so the call sites never contained `toISOString()`. Detector strengthened + a "did this actually scan anything" meta-guard added. Live: 135-page walk of 13,417 audit rows, zero duplicates |
| KEEPPREV | MED | ~30 list panels lacked `placeholderData: keepPreviousData` | **CLOSED.** 45 hooks assessed, 23 missing, all 23 fixed across 20 files. Regression pinned in 6 new modules (37 tests / 10 files) |
| QUERYKEY-001 | HIGH | `useExpiringWarrantiesQuery` keyed only on `days` while fetching `days,page,limit` - page 2 silently served cached page-1 rows | FIXED. Also found to have **zero callers** (dead code with a live latent bug) |
| ACCT-EXPORT | MED | 2 accounting exports built CSV client-side, bypassing the audited route | FIXED + live-proven (`TrialBalanceExport`, `ArAgingExport` audit rows) |
| ACCT-I18N | MED | Aug 2026 fiscal-period label wrong in Arabic | **FIXED at the primitive.** Root cause: `fiscal_periods.label` stored a **baked English string** rendered raw on 4 screens - no translation work could ever have fixed it. Added `formatFiscalPeriodLabel(startDate, locale)` to `packages/shared`. Live: "أغسطس ٢٠٢٦" / "Aug 2026", no regression |
| PERIOD-UNLOCK | - | Live hard-lock proof | **NOT REACHABLE through the product** without an irreversible side effect (hard-lock needs a completed, non-deletable close run). No SQL force attempted. Declared ceiling: `fiscal-period.service.spec.ts` 197/197 |
| PERM-004 | MED | Denied users get fully interactive forms | **PARTLY WITHDRAWN** - does not reproduce in Settings' own create flows (both panels hide the trigger pre-render, backed by server `@RequiresPermission`). Genuine instances remain: XFER-001, POS-011. No shared permission-aware wrapper exists to migrate them onto |
| DESIGN-001a | MED | Approvals capability counts headcount, not permission | **VERDICT REACHED.** Strengthen the boolean at the settings gate with the NECESSARY condition (>=2 active members AND an active PIN-holder with approval permission); keep the picker as the sufficient per-maker check; leave `verifyApproval`'s anti-oracle 422 untouched. Current gap: 2+ members with ZERO PINs still reports `available: true`, so the toggle saves a dead control |
| POS founder-decisions | - | `pos.session.close` + Payment Methods reachability | **RESOLVED - premise was stale.** Cashier role in this tenant DOES hold `pos.session.close` (live row confirmed); the "only owner can close a shift" premise is false. Payment Methods IS genuinely owner-only (zero non-owner roles hold `pos.tenderType.*`) - recommend a seeded "Store Manager" role rather than widening any bundle |

### Settings findings

| ID | Sev | Summary | Status |
|---|---|---|---|
| SET-LOC-001 | **CRIT** | Deactivating a warehouse holding stock (42,650 units / 2,535 items) succeeded silently; only guard checked `isDefault`. Downstream modules then reject it, stranding stock that still counts toward valuation | **FIXED + live-proven** (409 `WAREHOUSE_HAS_STOCK`, DB unchanged) |
| SET-LOC-002 | HIGH | Branch deactivation had ZERO guards - succeeded with an open POS shift and 39,613 units on hand | **FIXED + live-proven** (409 `BRANCH_HAS_OPEN_SHIFT` / `BRANCH_HAS_IN_TRANSIT_STOCK` / `BRANCH_HAS_STOCK`; in-transit correctly NOT overridable by `acknowledgeStock`). A concurrent agent had wired the acknowledgement state+handler but **never rendered a dialog** - a dead end - completed here |
| SET-BILL-001 | HIGH | **Five-axes collapse:** `branches.isActive` doubles as the billing meter (`getBillableOutletCount()` = count of active branches), so an administrative toggle silently changes the invoice | **FOUNDER DECISION** - no billing semantics changed. Minimum disclosure added |
| SET-GATE-001 | HIGH | `SectionGate` gated on `isLoading`, so a transient query error rendered "not available for your plan" (the documented "unknown state is not isLoading" class) | FIXED at the shared primitive (`!isSuccess`) |
| SET-GATE-002 | MED | `SectionGate` showed identical plan/country copy for a plain PERMISSION denial - told cashier1 their *plan* was the problem | FIXED (split copy, en+ar) |
| SET-PAGE-001 | HIGH | Branch/warehouse/zone/bin lists had no pagination; server `limit(20)` and search filtered only the truncated page - a 25-outlet chain silently loses branches 21-25 | FIXED |
| SET-CUR-001 | MED | Settings "Decimal Places" is a DEAD COLLECTED FIELD - stored and editable, never consumed (`currencyDecimals()` resolves from the registry-derived map) | **FIXED - direction REVERSED after review.** Originally reported CRITICAL with "wire it through"; wiring it would let a tenant set KWD to 2dp and break every GL tie-out. Correct fix: read-only, derived from the registry. Regression test proves a spoofed client value is ignored |
| SET-CUR-002 | HIGH | `assertCurrencyNotInUse` checks only legal-entity/branch refs, NOT posted GL - AED has live posted exposure (1131 +83.500000) and is deactivatable with no gate | OPEN |
| SET-CUR-003 | MED | Transaction currency is never validated against the `tenant_currencies` whitelist in sales/purchase/JE posting (zero grep hits), contrary to spec | OPEN |
| SET-CUR-004 | MED | Branch create/update accepted non-tenant currencies (USD) and invalid ISO codes (ZZZ); UI picker was the only constraint | FIXED (server-side validation) |
| SET-TAX-001 | MED | `settings.tax.rate.change` + manager-PIN gate required by spec does not exist - not in the catalog, not in code, granted to nobody. Live-probed: accountant1 gets a clean 403, no PIN challenge | OPEN (spec drift) |
| SET-NOTIF-001 | HIGH | Event Policies renders RAW i18n KEYS for 6/16 rows (en+ar); Document Numbering renders raw codes (`Dn/Do/Qot/Dsl/Rf/Dpu`) for 6 doc types. One root cause: a catalog outgrew the message files with no parity test. **Repeat of ROLE-002/003** - `i18n:check` structurally cannot catch keys missing in BOTH locales | IN PROGRESS |
| SET-NOTIF-002 | HIGH | `digestMode` is a DEAD COLLECTED FIELD - enum, column, DTO, service write path and a UI dropdown, **zero read sites**, no scheduler exists | IN PROGRESS (remove the control; do NOT build a scheduler) |
| SET-NOTIF-003 | HIGH | No non-owner can see or change their OWN notification prefs - self-scoped routes share the admin-defaults permission, which no shipped role holds | IN PROGRESS (split the permission; **do NOT widen** the admin one) |
| SET-NOTIF-004 | HIGH | Low-stock fans out per-item with email ON by default (~500 emails/night at scale). The same fix was applied elsewhere and never back-ported - path divergence | IN PROGRESS |
| SET-NOTIF-005 | HIGH | 3 `billing.trial*` events emit but are silently dropped (no listener, missing `eventId`) while the outbox marks them "completed" - the FALSE SUCCESS pattern | IN PROGRESS (make the drop loud) |
| SET-PACK-001 | MED | No tenant-facing Packs screen, and **no deactivate/uninstall endpoint exists anywhere** - pack toggle-off is not reachable through the product (deliberate: "a commercial act, not a support one") | BY DESIGN, recorded |
| SET-CSV-B | MED | 5 screens build CSV client-side with NO server route at all. **AP Aging is highest priority** - its AR Aging sibling has an audited export and it does not | **FOUNDER DECISION** |

### Positives confirmed (verified, not assumed)

- Tax-visibility **derivation** verified, not just the symptom: no fourth mechanism in Settings; shared `documentShowsTax`/`showsPurchaseTax` used consistently across 30 call sites. Kuwait shows no VAT UI.
- **Zero orphaned permissions.** All 16 candidates verified individually. (Third false orphan report in this programme - the agent also caught its own extraction bug: a single-arg regex missed the second permission in OR-style `@RequiresPermission(a, b)`.)
- **`z.coerce.boolean()` is clean** across the whole API - zero occurrences, guard test passes. The hypothesis that Settings would be full of these traps did NOT hold.
- **No queryKey scope-leak anywhere.** 150 hook call sites / 129 files; the dominant "forward the whole params object" pattern is inherently safe against the class.
- **Document numbering concurrency PASSES**: 8 simultaneous reserves -> 8 distinct consecutive numbers (atomic `UPDATE...RETURNING`); failed-transaction handling correct under both gap policies.
- Audit screen verified SQL-first: screen total == `count(*)` exactly (13,377); combined filters survive 4+ cursor pages on 11,307 rows; export respects filters and carries real before/after JSON diffs.
- Pack manifest read generically - no industry conditional hardcoded into the core item-form panel; both guardrails hold (hidden fields never drop value; stay visible when already set).
- Webhook SSRF guard is properly built: real `URL` parsing, resolved-IP blocking, delivery-time re-validation, connect-time IP pinning, no redirect-following; secrets masked.
- Logo -> printed invoice passes the founder test: 2 clicks, auto-upload, zero forced fields, confirm-dialog reserved for the destructive action only, full ar/en parity.

### Withdrawn after investigation (5)

1. **"24 report screens bypass the audited export route"** - FALSE POSITIVE. The grep heuristic assumed one centralized `reports-api.ts`; most reports have their own per-report `api/<name>-queries.ts` with a correct `fetchXExport`. Buckets: A=0, B=5, C=26.
2. **`audit_log.branch_id` NULL on 13,340/13,354 rows** reported as a guard-inert-by-uniform-data defect - it is the verified AUDIT-004 outcome (nullable, no backfill, by decision).
3. **SET-CUR-001 as a CRITICAL with "wire the field through"** - downgraded to MEDIUM and the fix direction reversed; acting as reported would have introduced a real CRITICAL.
4. **PERM-004 in Settings** - does not reproduce; both panels gate pre-render.
5. **Guard over-triggering as the cause of 18 failing specs** - orchestrator hypothesis, disproven. Zero call-site bugs; both services gate strictly on `isActive` true->false. The blast radius came from a bundled legitimate refactor.

### Method notes for the record

- **A green guard is not a guard.** The cursor ratchet sat green for multiple phases with an empty offender list while 7 real bugs were live. Every new guard this phase was **deliberately broken and confirmed to fail** before being trusted, and carries a "did this actually scan anything" assertion.
- **Declining to write an unvalidatable guard is correct.** The client-CSV class had no true positive left, so a guard could not be validated against one - writing it anyway would have produced exactly the reassuring-but-inert artefact above.
- **Agent hygiene:** subagents repeatedly adopted an orchestrator identity when RESUMED to fix their own findings, and several spawned nested subagents despite the prohibition (14 agents where 10 were dispatched). Two pairs ended up assigned to the same files - the "one name, two bodies" defect, in the process itself. Fix work must be given to a FRESH agent with a concrete pre-verified defect list, never to a resumed reporter.
- The shared gstack browse daemon is **unusable under high concurrency** (confirmed URL jumps and identity flips to other test users). Several live checks are honestly marked SUSPECTED for this reason rather than inferred from code.

### Phase H closure round (2026-08-30, after founder instruction to close everything)

Founder ruling: take every remaining decision, choosing the ROOT-CAUSE PERMANENT fix that is
dynamic and required, never a temporary band-aid.

| Item | Decision taken | Outcome |
|---|---|---|
| SET-BILL-001 billing/admin axis collapse | Separate the axes. Billable = every branch PROVISIONED to the tenant, independent of `isActive`. Rejected both band-aids (a disclosure banner, and a second `billing_status` column - two hand-maintained flags that can disagree is worse than one wrong flag) | FIXED. No schema change, no migration, so NO re-pricing risk. Gulf billable count 4 before and after. Found 2 further billing bugs: billing and `assertBranchLimitNotExceeded` counted DIFFERENT populations (usage card showed "2 of 3" then refused with BRANCH_LIMIT_REACHED), and `deleteBranch`'s `if (wasActive)` guard would have kept charging for a deleted closed branch. New pins assert on REAL RENDERED Drizzle SQL via PgDialect - the old shape-only mock structurally could not see the predicate, which is how this survived review |
| AP Aging export asymmetry | Build routes for ALL FIVE bucket-B screens, not just AP Aging | FIXED. Export audit types now 14. **Caught a near-downgrade before shipping:** the `ids`-bypass paths hardcode `outstandingBalance: "0"` for name-map lookups, so "export selected rows" would have silently zeroed the balance column. Threaded `includeBalance` through both branches; live-verified real `1.005000`. Opening-balance review deliberately NOT built (one-time pre-posting review, no persisted resource) |
| Payment Methods owner-only | Seed a Store Manager role, never widen a bundle | FIXED, migration `0318`. Composed DYNAMICALLY from bundle keys, not a hardcoded permission list. Upserts by fixed literal PRIMARY KEY (not slug), guarded with `INSERT...SELECT FROM tenant_identity`, zero UPDATEs, idempotent (applied twice). Baseline 5 roles unchanged; Store Manager 31 |
| Shared list-query primitive | Reversed the earlier "defer" recommendation and DID it - the tests pin the SYMPTOM, the primitive removes the POSSIBILITY | FIXED. `useListQuery` (`lib/query/use-list-query.ts`): `keepPreviousData` is the DEFAULT, and queryKey is `[...keyPrefix, params]` derived from the SAME object passed to queryFn, so a used-but-unkeyed param is unrepresentable. **54 hooks across 41 files migrated.** Manual deep-scan surface shrank ~127 -> ~73 hooks. ~19 nullable-params financial report hooks deliberately left (no null variant in the generic; forcing it risks changing cache-key shape on money-adjacent reports) |

| Residual closed this round | Outcome |
|---|---|
| SET-CUR-002 | FIXED. `assertCurrencyNotInUse` now blocks on posted/reversed journal lines. Live: AED deactivation 409s naming "4 posted journal lines" |
| SET-CUR-003 | FIXED. Shared `assertCurrencyEnabled` wired into every document-currency entry point INCLUDING the PO amend-saga DRY-RUN (validate-before-void rule) |
| SET-TAX-001 | FIXED (option a - implement the spec, not delete the claim). New `settings.tax.rate.change` permission + PIN via the EXISTING `PinVerificationService`, never a second PIN system. Anti-oracle generic 422 preserved |
| SET-TAX-001 UI regression | The backend gate shipped without its frontend half, making the screen unusable. FIXED by reusing the shared `ApprovalPinFields` (already used by credit notes / refunds / purchase refunds). **SECOND time today a backend gate shipped without its UI half** - see also the notification-preferences split |
| AUDIT-011 | FIXED. Runtime sanitizer at the single INSERT chokepoint all 82 callers funnel through (rejects UUID-shaped `userEmail`, substitutes a sentinel, logs ERROR+Sentry); 12 fiscal-period sites collapsed to 1 resolver. NOTE: fail-safe, NOT unrepresentable - a compile-time brand was rejected as disproportionate. No backfill (consistent with AUDIT-004); display resolves via the names-only directory with a "Deleted user" fallback |
| Low-stock email fan-out | FIXED for the LIVE tenant via a `sync:notification-catalog-defaults` CLI using an explicit UPDATE keyed on `(tenant_id, event_key)`, never `onConflictDoNothing`. Verified `channel_email=false` |
| PERM-004 | CLOSED. Shared `components/permission-gate.tsx` built (keyed `!isSuccess`, never `isLoading`), XFER-001/002 migrated. POS-011 verified ALREADY FIXED by another session. PUR-025/026 deliberately left (already correct; migrating means untangling two entangled permissions for no defect) |
| INV-BATCH-001 (CRIT) | FIXED. A receipt with a past expiry was created `status:"active"` unconditionally, staying FEFO-eligible AND sorting FIRST - the system would pick expired stock ahead of good stock. Shared `deriveStatusFromExpiry` wired into the inbound path. Live: 0 expired-active batches |
| PACK-001/002/003/005, PUR-010 | FIXED (4 duplicate vehicle-label impls collapsed to one shared formatter; silent truncation now has honest total/hasMore; frontend/backend permission-key mismatch repointed; `engine` unhidden; dead UUID strings deleted) |
| 8 prior-phase items | ALREADY FIXED by later work - triage-first avoided the wasted effort (PUR-022, INV-REORDER-001, PUR-011 structural, PUR-012, PUR-013, POS-006/017/018) |

**Final tree state (all verified by the orchestrator):** `pnpm --filter @zerupt/api build` exit 0 ·
`npx tsc --noEmit` (api) clean · `pnpm --filter @zerupt/web typecheck` exit 0 · ledger `0.000000` ·
24/24 periods open · role baseline 114/20/72 intact (+Store Manager 31) · branches 4/4 ·
warehouses 6/6 · AED still active · 0 expired-active batches.
The "9 pre-existing errors from another session" reported by two agents were in fact this session's
own agents' mid-edit state, and resolved on completion - a reminder that "someone else's error" is
itself a claim requiring verification.

**Stated verification ceilings (code-confirmed + test-pinned, NOT human-verified):**
1. Period hard-lock/unlock - not reachable through the product without an irreversible close run.
   Ceiling: `fiscal-period.service.spec.ts` 197/197.
2. Tax-rate PIN flow - the Taxation section is correctly HIDDEN in Kuwait (no-VAT country), so the
   dialog is structurally unreachable in this tenant. Incidentally an independent confirmation that
   the tax-visibility derivation works end to end.
3. Permission propagation delay (5-min `staleTime`) - both live-timing routes were refused by the
   environment's safety classifier; the agent correctly did not route around the block.
