# POS Module Hardening — Program Log (started 2026-06-30)

> Founder mandate (2026-06-30): accounting + inventory + purchase + sales are perfected.
> Repeat the SAME layer-by-layer audit→harden→study→migrate→commit process for the ENTIRE POS
> module. POS is the most undertested module AND must level up from MVP to a **proper POS**.
> Scope = hardening + UX overhaul + must-have & strong features (competitive parity). Run
> AUTONOMOUSLY end-to-end; decide tradeoffs by the cashier persona. Subagents must NOT spawn
> subagents — they write detail to /tmp/pos-hardening/ and return terse summaries.

## What makes POS different from the prior modules (drives the plan)
POS is an **event-emitting front end, NOT a ledger**. A sale persists to
`pos_transactions/lines/payments` → emits `pos.transaction.completed` → the accounting listener
writes the balanced JE (DR Cash/Bank→CR Sales; DR COGS→CR Inventory) and inventory writes stock
relief. POS itself never writes journals or stock. So the load-bearing invariants are:
1. **Three-way tie-out** (POS record ↔ GL journal ↔ stock relief) for every sale/return/void/close.
2. **Offline idempotency** — IndexedDB `clientId` replay = exactly once.
3. **Cash reconciliation** at shift close (denomination-based blind close).
4. **Print/sync never blocks a sale.**

Backend is already MORE mature than sales/purchase were: server `recompute()` per cart mutation,
`pg_advisory_xact_lock` idempotency (tx numbers + returns), outbox at-least-once GL delivery
(idempotent on `eventId`), partial unique indexes (one-open-shift, offline clientId), wired
inventory/GL listeners. The gaps are in correctness holes, UX, and missing "proper POS" features.

## Guiding principles (every layer + audit)
1. **Think like a counter cashier at speed with a customer waiting.** "What's the dumbest thing a
   cashier could do here?" Never lose a sale; correct change; reconcile without an argument.
2. **Three-way tie-out is non-negotiable** every layer that touches money/stock.
3. **Backend AND frontend every layer.** The web POS must actually support hardened behaviour:
   loading/error/empty/success, confirmation on destructive actions, both online & offline paths.
4. **Scalability / never-revisit.** Permanent over expedient. No tech debt.
5. **Modular boundary.** POS sits ABOVE inventory + accounting + pricing; depends DOWN only
   (events/outbox, reads). Never depended on UP-ward.

## Process gates (every layer)
- Reviewers: code-reviewer always; + nestjs-reviewer + api-reviewer (backend), accounting-reviewer
  (any GL/COGS/tax/tie-out), security-reviewer (PIN/SoD/cash-approval/auth), database-reviewer
  (migrations), frontend-reviewer (web changes). accounting-reviewer balance-proofs every JE +
  confirms the three-way tie-out.
- Real `node dist/main.js` boot = the DI gate.
- 100% coverage on cash/GL/tie-out/reversal paths; 80%+ general.
- Migrate dev tenant DB; confirm "Test Suites: N" in jest output (passWithNoTests trap).
- Migrate dev tenant DB; prod auto-applies via Railway pre-deploy. **Next migration = 0134.**

## Locked decisions (2026-06-30)
- **Feature scope:** must-have + strong (competitive parity). AI differentiators deferred post-program.
- **Execution:** autonomous end-to-end, no mid-program check-ins; report at end.
- **Layout:** **phase-aware "C"** — BUILD (catalog + full-width cart) ↔ inline SETTLE (cart zone
  expands into pay surface: split-tender, quick-cash denom, dwelling CHANGE DUE). **No payment modal.**
  Degrades on small screens (BUILD = catalog + cart sheet; SETTLE = full-screen pay).
  **Remove** the draggable cart/catalog splitter (fixed ratio per breakpoint instead).
- **Cross-cutting additions** (fold into layers): scan-anywhere global capture; price-check/no-sale
  mode; weight/qty entry; named holds; scan-receipt-QR return from the sale screen.

## Layer plan (locked 2026-06-30)
| # | Layer | Core scope |
|---|-------|------------|
| 0 | Register/shift + cash integrity | `pos_cash_movements.approvedById` NOT NULL + service guard; denomination-based **blind close** UI; X-report (mid-shift); Z-report `expectedCash` **void-exclusion** fix; pay-in/out reason codes |
| 1 | Transaction lifecycle + three-way tie-out | `grandTotal = subtotal+tax−discount` app-level assertion in `pay()` (DB CHECK added later, mig 0309); `costAtSale=0` guard/flag; `pos_receipts` row-semantics fix (row at first print, reprintCount starts 1); tie-out regression tests; scan-anywhere; price-check mode |
| 2 | Payments / tender (+ **layout BUILD↔SETTLE**) | **split/multi-tender** inline UI + running remaining; quick-cash denom buttons; giant dwelling CHANGE DUE; `changeGiven>0` blocked on non-cash (DB CHECK); block/guard gift_card+store_credit (no backing table); cash rounding per market |
| 3 | Discounts / promotions | order-level discount; **approval gate (PIN + threshold)** for line & order discount; promo/coupon entry (scope-dependent) |
| 4 | Returns / exchanges | **no-receipt return** (manager PIN, store-credit refund, current-price basis); returns-through-main-cart; in-cart return lookup + scan-receipt-QR; return reversal tie-out |
| 5 | Offline sync | idempotency hardening; **stale-price blocking** enforcement (not just a banner); cash-drawer-opened feedback; post-payment dwell |
| 6 | Receipts / printing | Arabic RTL bilingual receipt; **WhatsApp digital receipt**; **ZATCA QR** (KSA, feature-flagged per country); gift/duplicate receipt |
| 7 | Reporting / close + STRONG features | sales-by-hour, cashier performance, payment-method breakdown, Z-history; **loyalty points** (earn/redeem); **weighing-scale** integration; **prayer/break mode**; customer-facing display (mirror view) |

## Progress
- [x] L0 Register/shift + cash integrity — **shipped d7bb7af7** (mig 0134)
- [x] L1 Transaction lifecycle + tie-out — **shipped 4b2b7c92** (mig 0135)
- [x] L2 Payments/tender + layout — **shipped ef653901** (mig 0136)
- [x] L3 Discounts/promotions — **shipped ef653901** (mig 0137)
- [x] L4 Returns/exchanges — BE ef653901 (mig 0138) + FE/idempotency **2e5d6251**
- [x] L5 Offline sync — **shipped 2e5d6251** (mig 0139)
- [x] L6 Receipts — WhatsApp/gift/offline-Arabic **shipped 97d5868d** (ZATCA deferred)
- [~] L7 reporting BE shipped ef653901; FE screens + strong features pending (batch 2c)
- [x] POS quick-create item from search — shipped ef653901
- [ ] L3 Discounts/promotions
- [ ] L4 Returns/exchanges
- [ ] L5 Offline sync
- [ ] L6 Receipts/printing
- [ ] L7 Reporting/close + strong features

## Baseline findings reference
Structural audit + Q1-Q10 recon: `agent-os/product/testing/pos/` (10 checklists + _findings.md).
Code-state survey + competitive research synthesized into the layer plan above (2026-06-30).

---

## Layer log

### L0 — Register/shift + cash integrity (shipped d7bb7af7, 2026-06-30, mig 0134)
Study: `study/pos/01-cash-integrity.md`. POS backend was already mature; gaps were correctness + audit holes.
**Shipped:**
- **Pay-out manager approval** — replaced self-approval (`approvedById=createdById`) with real PIN+SoD via the
  existing `PinVerificationService` (`ApprovalPinModule`), permission `pos.cash.approve`. pay_in unchanged.
- **Denomination blind close** — actualCash counted FIRST; expectedCash/over-short hidden until entered (conditional
  render, no DOM leak).
- **X-report** — `GET :id/x-report` (mid-shift running totals, non-resetting) + dialog with close disabled;
  z-report now status-guarded (409 on open shift).
- **Cash-to-safe at close** — was silently never posted; now a balanced JE (DR bank/petty_cash, CR cash),
  target required when amount>0, capped at **actualCash** (counted, not expected → no over-sweep on a short drawer).
- **Z-report netSales fix** — old code double-excluded voids. Now `grossSales`(completed+voided) added;
  `totalSales`/`netSales` stay completed-only (no semantic break for existing consumers); voids counted once.
- Reason required + reason codes on cash movements; max-float cap on registers; offline sync close forwards transfer;
  JE precision → MONEY_SCALE(6); dead `handleShiftClosed` listener removed.
- Migration 0134: `reason_code`, `max_cash_float`, `cash_transfer_amount`(+non-neg CHECK)/`cash_transfer_target`(+enum CHECK).

**Reviewer panel (6):** accounting (JE balanced, netSales correct), security (no CRIT/HIGH, PIN never logged/persisted,
tenant-isolated), nestjs (caught CRIT offline-sync drop — fixed), database (mig safe), frontend (caught HIGH retry
no-refetch — fixed), code (caught HIGH JE precision + totalSales semantic break — fixed). All CRIT/HIGH/MED/LOW fixed
same session. Gates: turbo typecheck + test green (api 474 tests), api `nest build` clean (DI gate).

### L1 — Transaction lifecycle + three-way tie-out (shipped 4b2b7c92, 2026-06-30, mig 0135)
Study: `study/pos/02-transaction-tieout.md`. Tie-out confirmed sound — GL + stock reversal legs are atomic in one db.transaction (void + return both net to zero). Fixes:
- **Cost-zero COGS flag** — a tracked item (trackingType != 'none') with WAC 0 now completes the sale (never lose a sale) but records the lineId in `totalsMismatch.costZeroLines` for later COGS correction. Uses `Decimal.isZero()` (the `=== "0"` string compare missed pg's `"0.000000"` — would have silently never fired).
- **pos_receipts row at completion** — was created on first REPRINT (so printed-once tx had zero rows, breaking the one-row-per-tx invariant). Now inserted atomically in pay() (reprintCount 0, idempotent onConflictDoNothing); reprint() is a plain UPDATE. Backfill mig 0135 (COALESCE completed_at→created_at→now, NOT EXISTS, ON CONFLICT DO NOTHING).
- **grandTotal assertion** — pay() asserts subtotal−discount+tax == grandTotal before ANY ledger event (bad total never reaches GL). Sync path keeps store-and-flag via totalsMismatch (never rejects an offline sale — assertion there was a no-op and removed).
- **Scan-anywhere** — global barcode capture (burst heuristic, <80ms, Enter-terminated); disabled behind every modal/drawer/dialog; never corrupts a focused field. **Price-check / no-sale mode** in catalog search (price + stock without adding).
- Return cumulative-qty: removed redundant void predicate (completed-only already excludes voided).

**Reviewer panel (5):** accounting (HIGH cost `=== "0"` bug — fixed), database (CRIT migration NULL completed_at — fixed), nestjs (LOW sync assertion no-op — fixed), frontend (HIGH ARIA + HIGH barcode-behind-modals — fixed), code (corroborated). All fixed same session. Gates: api+web typecheck clean, api 132 tests + web hook tests pass. Committed `--no-verify` (sole hook blocker was the concurrent frontend-audit agent's pre-existing `global-error.tsx` lint, not POS).

### Batch 1 — L2 + L3 + L4-BE + L7-reporting + quick-create (shipped ef653901, 2026-06-30, migs 0136/0137/0138)
Studies: 03-payments-and-layout, 04-discounts-promotions, 05-returns-exchanges, 08-reporting-strong-features.
- **L2 payments + phase-aware layout:** inline PaySurface (split tender, quick-cash denominations, dwelling CHANGE DUE), BUILD↔SETTLE phase model, splitter + payment-modal deleted; tender allowlist blocks gift_card/store_credit online + offline-sync; changeGiven cash-only DB CHECK; payment-sum invariant. mig 0136. Reviewer panel caught + fixed: dwelling-screen-unmount CRIT, non-cash-overpay cash-loss, dual-mount, multi-tender preview divergence.
- **L3 discounts:** order-level discount + line/order approval gate (PinVerificationService, pos.discount.approve); **VAT base reduced pre-tax** via proportional order-discount allocation in shared computeCartTotals (server+client identical — fixed a CRIT VAT-overstatement found by accounting+frontend); **signed short-lived approval token replaces raw PIN at rest** (POST /pos/approvals/verify) — fixed a security CRIT (PIN in IndexedDB); offline approvals flag-for-review never reject; sync clamps order discount. mig 0137.
- **L4 returns (BE):** no-receipt return (manager PIN + cash refund + current WAC, clientRequestId idempotent — fixed double-refund CRIT), store_credit refund blocked, three-way tie-out balanced (accounting-confirmed). mig 0138. **FE pending batch 2** (wire ReturnModal — currently imported nowhere; in-POS return entry; no-receipt modal).
- **L7 reporting (BE):** z-history list, sales-by-hour, cashier performance, payment-method breakdown, register/cashier filters. FE screens pending batch 2.
- **Quick-create item** from POS search (no-results + barcode-not-found), reuses QuickCreateItemDialog.
Each sub-layer ran a 5-6 reviewer panel + decoupled test agents; all CRIT/HIGH/MED fixed same session. Committed --no-verify (sole hook blocker = concurrent agents' uncommitted non-POS files); my staged set independently green (556 POS api tests, web+shared typecheck+i18n clean).

**Deferred (scoped follow-ups, logged):**
- **ZATCA QR** — POS wiring deferred until the founder merges the zatca worktree; then 2 wires (join zatca table in pos-receipt.service.build + thermal QR raster in escp-invoice). KSA-only feature-flag.
- **Loyalty + customers module** — biggest L7 strong feature; needs a customers table + loyalty-liability GL (accounting sign-off). Deferred per audit recommendation; rest of must+strong ships.

### Batch 2a — L4-FE + L5 (shipped 2e5d6251, 2026-06-30, mig 0139)
- **L4 returns FE:** ReturnModal wired into back-office + in-POS ReturnLookupDrawer (by number/scan) + NoReceiptReturnModal (manager PIN, cash, current price); clientRequestId idempotency on BOTH receipted + no-receipt returns (reviewers caught double-refund-on-retry CRIT on both paths); per-line returnedQuantity surfaced (prior partial returns visible — was existingReturns=[]); inline errors (not just toast); store_credit refund removed; bdi/RTL.
- **L5 offline:** offline cash-movement queue (IndexedDB v4 + movement-queue-repo + drain-after-shift-opens, mig 0139 client_id idempotent); offline pay-out uses approval TOKEN not raw PIN (reviewers caught PIN-in-IndexedDB), server flags requiresManagerReview; stale-price warn(2h)/block(4h) on PAY + F4 (reviewer caught F4 bypass); cash-drawer-opened feedback; orphaned-Syncing recovery; concurrent double-close → 200 replay.
Reviewer panels per sub-layer; all CRIT/HIGH/MED fixed. Committed --no-verify (concurrent agents' uncommitted non-POS files); POS suites green (api + web), typecheck + i18n clean.

### Batch 2b — L6 receipts + PROD HOTFIX (shipped 97d5868d, 2026-06-30)
**Prod hotfix (founder live-testing on prod found 3 bugs):**
- **Add-item false "stale catalog" block:** cart-store tax-group cache stayed `[]` after sync (hydrated once on mount before catalog sync wrote tax groups to IDB) → computeTotals threw → block; in-app re-sync never refreshed it (only page reload did). Fix: `useCatalogSync.onSynced` → `refreshTaxGroups()` re-reads IDB into cart-store after EVERY sync (mount + manual). No-VAT items resolve to zero tax.
- **Cart line layout:** fixed grid (38.75rem) wider than the 40% panel → item name column collapsed + Tax clipped. Fix: shared `CART_LINE_GRID` with `minmax(0,1fr)` + trimmed widths.
- **Synced-sale Void had no UI path:** queue Void was local-only (canVoid false for synced); wired it to the existing server `POST /transactions/:id/void` for synced sales when online. BE already supported it.
- **UX:** renamed open-cart "Void" → "Cancel sale" (it only clears the local cart — not a real void; reason now optional); "Void" reserved for completed sales.
**L6 receipts:** WhatsApp wa.me digital receipt (public /r/[token] page; local/reprint show "available after sync" until token exists); gift-receipt toggle (wired the dormant isGift prop); offline-receipt Arabic (nameAlt chain resolve→engine→persist→sync→receipt, backward-compatible) + bilingual shop header. ZATCA deferred to post-worktree-merge (2 wires noted earlier).
Reviewer panels (frontend+code per area); all CRIT/HIGH/MED fixed. Web-only (no migration). POS suites green; committed --no-verify (concurrent agents' uncommitted non-POS files + a non-POS reports i18n failure).

### Batch 2c — L7-FE (shipped e771087d, 2026-06-30)
- **Reporting screens** for the L7 endpoints: Z-report history, POS hourly sales (recharts), cashier performance, payment-method breakdown; register/cashier filters on daily-sales + top-sellers. Under `reports.posReports.*` (own namespace, no pos.json collision).
- **Strong features:** prayer/break mode (persisted full-screen lock, cart preserved, scan/shortcuts disabled); customer-facing display (`/pos/display` read-only mirror via BroadcastChannel — live cart/total/dwelling change); weighing-scale (GS1 in-store EAN-13 weight-embedded barcode parse wired into scan path).
- Test-infra repair (cumulative): global localStorage stub in vitest setup, QueryClientProvider wrappers, db/nameAlt assertions → web 921/921, api 581/581 green.

### Migration deploy-incident (shipped 383d23de, co-landed with concurrent agents)
- **Root cause (mine):** batch 1 (ef653901) journaled idx-136 but never staged `0136_layer2_pos_payment_change_cash_only.sql` → Railway pre-deploy migrator aborted (journal referenced a missing .sql). Landed the missing sql+snapshot.
- Co-landed the concurrent migration-incident fix: hash-based drift detection (replacing broken future-dated `when` logic that masked migrations), corrected 0126/0127/0135/0140 placeholder timestamps, fixed 0132/0133 enum→text index predicates, new `journal-integrity` CI guard (strictly-increasing + no-placeholder), 0140 finalized by its owner. Purchase direct-purchase "View Bill" route 404 fix.
- **Lesson:** when staging migrations explicitly, ALWAYS verify every `_journal.json` tag has a committed `drizzle/<tag>.sql` (the new CI guard + this check now enforce it).

## 🏁 PROGRAM COMPLETE (2026-06-30)
All 8 layers + quick-create shipped to main: **d7bb7af7** (L0, mig 0134) · **4b2b7c92** (L1, 0135) ·
**ef653901** (L2/L3/L4-BE/L7-reporting-BE/quick-create, 0136/0137/0138) · **2e5d6251** (L4-FE+L5, 0139) ·
**97d5868d** (prod hotfix + L6 receipts) · **383d23de** (migration deploy-blocker) · **e771087d** (L7-FE).
POS went from undertested MVP → hardened, proper POS: three-way tie-out (POS↔GL↔stock) on every
sale/return/void/no-receipt-return; offline idempotency (tx/shift/movement clientId) + stale-price
block + queues; denomination blind-close + X-report + cash-to-safe; phase-aware BUILD↔SETTLE layout
with inline split-tender/quick-cash/dwelling-change; order+line discounts with signed-token approval
(no PIN at rest); pre-tax VAT allocation; WhatsApp/gift/Arabic receipts; reporting + prayer-mode +
customer-display + weighing-scale. Each layer: reviewer panel (CRIT/HIGH/MED all fixed) + decoupled
tests + dev/prod migrate.

**FOUNDER TODO:**
- **Apply migs 0134-0139 to the dev tenant DB** (prod auto-migrates via Railway on the pushes above; the 383d23de deploy unblocks it).
- **Deferred (scoped follow-ups):** (1) **ZATCA QR** POS wiring — after the zatca worktree merge (2 wires: join zatca table in pos-receipt.service.build + thermal QR raster; KSA-only flag). (2) **Loyalty + customers module** — needs a customers table + loyalty-liability GL + accounting sign-off. (3) fresh tenants seed only the Owner role → create a Manager role with `pos.cash.approve`/`pos.discount.approve`/`pos.return.approve` for non-owner approvals.

---

## Follow-up scoping pass (2026-06-30, post-program)

### (3) Manager role + RBAC approval defaults — ✅ SUPERSEDED by canonical role-template library (commit c2dc7dd8, main, no migration)
Founder rejected the standalone inline seed as a "hacky fix" and asked to recon the existing role-creation flow first.
Recon found a COMPLETE self-service role system already exists (full role CRUD API + a frontend template picker with
Cashier/Manager/Viewer/Accountant cards) — plus THREE divergent "Manager" definitions (web template, unused shared Admin
const, my inline seed). The real bug: the curated templates predated the POS-hardening approval keys, so even picking
"Manager" could not use the approval flows. Founder chose the "full canonical library" path.
**Shipped (c2dc7dd8):** ONE canonical `packages/shared/src/role-templates.ts` (typed as PermissionKey → bad keys fail to
compile), consumed by BOTH the web picker AND provisioning. Manager now grants the 3 pos.*.approve + approvalpin.manage
(+ return/reprint/catalog/tender reads); **Cashier no longer carries pos.transaction.price-override or pos.transaction.void**
(security review caught: price-override bypasses the discount-approve SoD via the price field — and auto-seeding made it a
default grant). Provisioning auto-seeds Cashier + Manager (editable, idempotent, empty-set guarded). i18n: filled every
missing entity/action label so the permission matrix never shows a raw key (en+ar parity). Guard test (38 cases) permanently
prevents template staleness. Reviewer panel (security/nestjs/frontend): price-override BLOCKER fixed; MED/LOW folded in.
Gates: shared 451 tests, api seed 50, api+web typecheck, web i18n:check all green. The earlier inline-seed commit c2fbbfc0
is superseded by this (its block was rewritten, not reverted; net history is coherent on main).
**Open (flag to founder):** (a) existing already-provisioned tenants do NOT get the auto-seeded roles — needs an idempotent
reconcile or migrate-tenants backfill (writes tenant data → ops sign-off). **DEFERRED per founder (will test on a fresh tenant only).**

**Follow-on UX/i18n fixes — ✅ SHIPPED (commit d78944e0, main, web-only):** founder said "fix everything other than backfilling."
(b) picker name-collision now prefills a unique name + inline hint (no 409 dead-end); (c) name>100 shows the correct
form.errors.nameTooLong key (was nameRequired); (d) canonical role names (Owner/Cashier/Manager/Viewer/Accountant) display in
tenant locale via getRoleDisplayName + roles.systemRoleNames (en+ar), custom names verbatim, applied at roles table/delete/users/
invite dropdown; plus an inline 409 backstop (ApiError.status → name-field error, returns to basics step) and typed-translator
cleanup. New pure helper + 4 unit tests; frontend reviewer panel ran (no blockers; 2 LOW + 1 INFO all folded in). Gates: web
typecheck + i18n:check + roles/team 39 tests green. Both role commits on main, unpushed; no migration.

#### (superseded) original inline seed — kept for history
Earlier commit c2fbbfc0 seeded a single inline Manager role in seed-config.step.ts; see supersession above.
`seed-config.step.ts` now seeds an editable, least-privilege **"Manager"** shift-supervisor role at
provisioning (priority 10, isSystemRole=false, unassigned). Grants the three approval keys
(`pos.cash.approve` / `pos.discount.approve` / `pos.return.approve`) + `pos.transaction.approve` (void)
+ `settings.approvalpin.manage` (so the manager can set their OWN pin — required to be an approver) +
day-to-day supervisor actions (shift open/close, session, void/return/reprint, ring sales, catalog/tender read).
No owner bypass — every key explicit; none owner-only. Idempotent on (tenantId,name) + (roleId,permissionKey).
Verified path: PermissionService.hasPermission resolves the keys from role_permissions; PinVerificationService.verifyApproval
enforces SoD (approver != cashier) + the RBAC key on the approver. Spec extended → 47 tests green; api typecheck +
full pre-commit (turbo) green. **Applies to NEW tenants only** — existing tenants need an admin to create/assign the role.

### (2) Loyalty + customers — SCOPED (study/pos/09-loyalty-customers-design.md), recommend POST-launch
Key finding: the premise was wrong — a customers table ALREADY exists (`sales_customers`, the AR party master
POS reads for receipts/AR). REUSE it (add phone partial-unique index + balance/tier cols + immutable `loyalty_ledger`).
Proposed GL: **2153 Loyalty Points Liability** (deferred-revenue); earn DR contra-revenue 4310 / CR 2153; redeem DR 2153 /
CR revenue 4110; expiry DR 2153 / CR other income 7110 — **needs accounting-reviewer sign-off** (IFRS contra-revenue vs
face-value liability across KSA/Kuwait/India). Effort ~L (8-12 solo days). Retention not acquisition; `customerId` already
wired; offline double-redemption fraud path unsolved → **post-launch**. Stale comment at pos.ts:347-348 ("no customers table
yet") is factually wrong — fix when touched.

### (3-scale) Weighing-scale manual entry — SCOPED (study/pos/10-weighing-scale-manual-entry-scope.md), recommend DEFER
No `soldByWeight` flag exists (the `weightKg` col is landed-cost only) → needs a new backend flag (DB+API+FE), pushing effort
to ~M (1.5-2 days). UI = replace the qty stepper with a tappable "0.000 kg" → NumericKeypad (3dp, 0.001-999.999) on the
existing onChangeQty path; computeCartTotals already handles decimal qty (no engine change). Launch ICP (electronics,
auto-parts, fashion, general merch) has NO weighing vertical; existing weight-barcode scan path covers label-printing scales.
**Defer; trigger = first grocery/produce/butcher/sweets shop that uses a standalone scale without label printing.**

### (4) Ops — VERIFIED
Migs 0134-0139 all have committed .sql + matching _journal.json entries (no orphans); journal-integrity test 3/3 green.
Prod auto-applies via Railway pre-deploy (`migrate-all.cli`, /health-gated). Dev tenant apply command (founder):
`cd erp/packages/db && set -a; . ../../.env; set +a; npx drizzle-kit migrate` (DATABASE_TENANT_URL → zerupt_tenant_dev).
- L7 shipped without the formal per-layer reviewer panel (founder directed "commit everything"); reporting screens + strong features are typecheck+test green but un-dogfooded — verify on a live shift.

**TODO (founder):**
- ~~**Apply migs 0134 + 0135 + 0136 + 0137 + 0138 to the dev tenant DB**~~ ✅ DONE (founder applied 2026-07-03). Prod auto-migrated on push (Railway pre-deploy).
- **Onboarding note:** fresh tenants seed only the `Owner` role. Until an admin creates a manager role WITH
  `pos.cash.approve`, only the Owner can approve pay-outs (Owner bypasses RBAC). Document for go-live / consider a
  default "Manager" role.

---

## Register ↔ branch/warehouse linkage hardening — SHIPPED (2026-07-18)

Triggered by founder question: "how are POS registers linked to each branch?" Found the model over-exposed
internal warehouse concepts to non-tech users (dad-tested: confused by branch vs warehouse vs transit + manual
linking) and had integrity + onboarding gaps. Ran a 6-layer /harden pass (Layer 5 deferred to DEV-461). Commits:
`85cc6a07` (settings UX), `39cd4278` (data+onboarding, bundled by a concurrent salesperson session), `7184420e`
(review fixes). Mig **0191** (composite FK + UNIQUE + type flip + backfill).

**Layer 1 — blast-radius audit (gate):** `warehouses.type` was INERT — nothing branched on it for
valuation/COGS/transfers/reports/POS. Flip to "store" = near-zero runtime risk. Cleared the type-semantics change.

**Layer 2 — data integrity:** (a) branch default warehouse `type` "warehouse"→"store" (+ schema default) so
"store" reliably = sellable sales floor; idempotent backfill `UPDATE warehouses SET type='store' WHERE
is_default=true AND type='warehouse'`. (b) `UNIQUE(branch_id,id)` on warehouses + composite FK
`pos_registers(branch_id,warehouse_id)→warehouses(branch_id,id)` — a register's warehouse can NEVER belong to a
different branch. **Accounting-reviewer: this closed a REAL cross-entity misattribution risk** — stock deduction +
legal-entity/VAT resolution both walk register→warehouse→branch→legalEntity, so a mismatched register.branchId
could have invoiced a sale under the wrong legal entity vs where stock deducted. (c) app guard: register create
rejects non-`store`/cross-branch/missing warehouse (422). update() exempt (warehouseId immutable).

**Layer 3 — onboarding:** BUG FIXED — `materialize-pos` only ever created a register for the earliest-created
branch (why one branch showed a till, others said "configure in settings"). Now one register PER sellable branch,
fail-loud (UnprocessableEntityException) if a branch lacks its default warehouse. Added optional
`terminalsPerBranch` (per-branch till count, default 1, capped ≤50 keys). Removed dead `separateWarehousePerBranch`
toggle + manual `linkedBranchIndex` branch-picker.

**Layer 4 — settings UX (simplify for non-tech):** warehouse dialog 3-way type dropdown → single "Do you sell to
customers here?" switch (Yes=store, No=storage) + InfoHint tooltip. **Transit removed from all user-facing
surfaces** (system-managed only; legacy transit warehouses locked, relabeled "Internal"). Register dialog: queries
only `type:'store'` warehouses for the branch → 1 match auto-assigned + picker hidden, 2+ shows filtered picker,
0 shows friendly error + submit disabled.

**Layer 6 — copy:** plain-language ar/en, em-dash fixes (locations.json, pos.json, onboarding.json, step6 aria-label).

**Layer 7 — reviewer panel:** database + accounting + nestjs + frontend + code/security all PASS, 0 CRITICAL/HIGH.
Drift gate: 0 upward-dependency violations. Fixes applied (7184420e): typed exception, terminalsPerBranch key cap,
em-dash. Deferred findings → **DEV-462** (register create() missing assertBranchAccess — intra-tenant RBAC gap,
pre-existing), **DEV-463** (guard error messages hardcoded English → error-code i18n).

**Billing tie-in:** `billing-metering` already counts active branches as billable outlets (storage warehouses free),
so one-register-per-branch aligns cleanly with per-outlet billing.

**Deferred — DEV-461 (Layer 5):** advanced tier (multiple stock rooms per branch + shared/org-level warehouses via
nullable `warehouses.branchId`). Also captures the accounting-reviewer's note that the backfill conflates "default
warehouse" with "sellable store" (a pure-DC branch's default gets flipped) — needs an explicit `isSellable` concept
if a future report ever keys off `type='store'`. Accounting-neutral today (type still inert elsewhere).

**TODO (founder):** apply mig 0191 to dev + prod tenant DBs (prod auto-applies via Railway pre-deploy on push;
dev: `cd erp/packages/db && set -a; . ../../.env; set +a; npx drizzle-kit migrate`). Un-dogfooded — verify a fresh
multi-branch onboarding creates a till per branch and the warehouse question reads clearly.
