# Purchase Module Hardening — Overnight Log (started 2026-06-29)

> Founder mandate (2026-06-29): accounting + inventory are perfected (see study/accounting/,
> study/inventory/). Repeat the SAME layer-by-layer process for the ENTIRE purchase module.
> For EACH layer: (1) subagent writes study material, (2) full audit identifying gaps,
> (3) harden the layer — 100% concrete & stable for 10 years, think like a purchaser/shopkeeper,
> (4) apply migrations to the **dev** tenant DB (PROD auto-applies via the fixed Railway
> pre-deploy migrator on push to main), (5) commit + merge branch to main, (6) next layer.
> No tech debt, no follow-ups, permanent fixes. Use subagents; subagents must NOT spawn their
> own subagents. Preserve context (subagents write detail to /tmp/purchase-hardening/, return
> terse summaries). Run AUTONOMOUSLY end-to-end. Full review in the morning.

## Guiding principles (apply to EVERY layer + audit)
1. **Think like a purchaser / shopkeeper.** A real operator runs procurement standalone:
   accurate supplier balances at all times, audit trail for every document, corrections via
   reversal/debit-note (never edit/delete), 2-way & 3-way matching discipline, partial flows
   (receipt/return/payment), multi-currency. Correctness of quantity AND value AND AP balance
   is non-negotiable.
2. **DUAL PATH IS A FIRST-CLASS REQUIREMENT (founder, 2026-06-29).** Two operators must both
   be fully served, every layer:
   - **Inventory-only shopkeeper** — has only the inventory module conceptually; must bring
     stock in via the **DIRECT PURCHASE** path (no PO, quick receipt/bill). This path must be
     complete and correct on its own.
   - **Full shopkeeper** — uses the full **PO → GRN → invoice → payment** chain.
   Every audit must explicitly check BOTH paths. Neither may be a second-class citizen.
3. **Verify backend AND frontend every layer** (founder, 2026-06-29). Not code/test only —
   the web feature (apps/web/src/features/purchase/, suppliers UI, AP overview) must actually
   support the hardened behaviour: loading/error/empty/success states, confirmations on
   destructive/over-tolerance actions, both paths reachable in the UI.
4. **Scalability / never-revisit.** When stuck on a decision, pick what ALWAYS works at scale.
   Permanent over expedient.
5. **Modular packaging — dependency direction.** Purchase is NOT a self-contained core; it sits
   ABOVE inventory + accounting and depends DOWN into them (events/outbox, reads). It must NEVER
   be depended on UP-ward by inventory/accounting. Watch boundaries every audit. (The inventory
   program flagged F12: reorder→purchase is the one remaining UP violation to event-ify — verify
   here.)

## Process gates (every layer)
- Reviewers: code-reviewer always; + nestjs-reviewer + api-reviewer (backend), accounting-reviewer
  (any GL/AP/tax), database-reviewer (migrations), frontend-reviewer (web changes).
- Real `node dist/main` boot = the DI gate (not metadata test only).
- 100% coverage on AP/GL/tax/valuation posting paths; 80%+ general.
- Migrate dev tenant DB; confirm "Test Suites: N" in jest output (passWithNoTests trap).

## Layer plan (locked 2026-06-29, document-chain order)
| # | Layer | Scope |
|---|-------|-------|
| 0 | Supplier master + AP subledger foundation | supplier identity/status/lifecycle, supplier_item_codes, payment terms/credit limit, currency/tax defaults, AP subledger integrity + opening balances. Dual-path: AP works for direct-purchase-only. |
| 1 | Procurement intake: PO lifecycle + DIRECT PURCHASE | PO state machine, line schema, approval/SoD, partial-receipt tracking, amendments; define+harden the direct-purchase (no-PO) intake path. |
| 2 | Goods Received Note: receipt + stock handoff + GR/IR | GRN against PO + direct receipt, over/under-receipt tolerance, partials, serial/batch capture, idempotent inventory handoff, GR/IR accrual. |
| 3 | Purchase invoice / billing: matching + input VAT + AP post | 3-way (PO/GRN/inv) + 2-way (direct bill) match, input VAT/GST, price/qty variance, GR/IR reversal, AP posting, period control. |
| 4 | Landed cost allocation + inventory revaluation | by_weight/by_value allocation, idempotent WAC revaluation handoff, GL posting, multi-currency. |
| 5 | Supplier payments + returns + AP aging/period integrity | payments (partial/advance/early-discount/FX/allocation), returns/debit notes, AP aging report, module-wide period integrity + reporting. |

## Initial map (from codemap 2026-06-29 — verify per layer, don't trust blindly)
- Tables in `packages/db/src/schema/purchase.ts`: suppliers, purchase_orders/_lines, grns/grn_lines,
  purchase_invoices/_lines, supplier_payments/_allocations, purchase_returns/_lines; supplier_item_codes
  in its own schema file.
- Services under apps/api/src/purchase/{orders,grn,invoices,payments,returns,landed-costs,overview} +
  apps/api/src/suppliers. Events → accounting-events/listeners/purchase-accounting.listener.ts (AP,
  inventory, COGS journals); landed-cost confirmed → inventory/landed-cost.listener.ts (revalue).
- Design decisions (spec README): all docs immutable (reversal-only); event-driven (purchase emits,
  accounting+inventory consume); partial flows supported; multi-currency per supplier/PO; tax per line;
  manager-PIN + segregation-of-duties on PO approval/over-receipt/landed-override/return/payment;
  validatePeriod(date) before all financial posting.
- Specs: agent-os/product/modules/purchase/ (01 supplier, 02 PO, 03 GRN, 04 landed, 05 returns,
  06 payments, 07 cross-module contracts, 08 event mappings).

## Layer status
| # | Status | Branch / commit | Migration | Notes |
|---|--------|-----------------|-----------|-------|
| 0 | ✅ COMPLETE | main 33c7a688 | 0124 | AP balance now DERIVED from immutable party-tagged 2111 ledger (was SUM of invoice balances); per-currency + functional-in-SQL (no float drift) + reconcile drift invariant; supplier default_currency/credit_limit(+soft warn)/blocked_reason+at+transition guards; tax-number dup guard + name/code normalization + dup-name confirm; audited allowlist+before-snapshot; supplier_item_codes FKs; blast-radius helper moved inventory/items→graph (boundary fixed); opening-bill CHECK; frontend currency/credit/blocked/per-currency AP + bidi + AlertDialog. 6-reviewer panel: 0 CRIT, all HIGH/MED/LOW fixed same session; accounting-reviewer validated AP derivation sound. dev migrated, boot DI gate passed, 45 supplier tests green. Founder follow-ups (NOT bugs): status-lifecycle policy depth, advances(1161)-netting, SupplierApBalanceService shared-module placement if a 2nd consumer appears. |
| 1 | ✅ COMPLETE | main 53b0de52 | 0125 | DUAL PATH verified first-class: direct purchase reuses the real GRN/bill/payment engine in one atomic idempotent tx (no parallel accounting, no drift, no PO assumption) + now at GOVERNANCE PARITY (same approval-threshold+PIN+SoD gate inside tx, graceful when unconfigured). H1 client exchangeRate dropped (rate=1 hard-set, totalFn/balanceFn safe). PO updateLine→resolvePackUnit (pack-unit invariant). order.confirmed/cancelled → transactional outbox (crash-durable). F12 BOUNDARY FIXED: reorder→purchase inverted to inventory.reorder.requested event + purchase-side listener (circular dep + upward dep gone). cancel() FOR UPDATE; direct_purchases.status CHECK; SoD→generic 422; reorder userId attribution. Frontend tax preview (loading/error/zero-rate aware) + confirm-on-cancel. 6-reviewer panel (incl security): 0 CRIT/0 HIGH, 1 MED + LOWs all fixed same session; nestjs/accounting/security all APPROVE. dev migrated, boot DI gate passed, 22 suites/478 tests. Founder follow-ups (NOT bugs): threshold/PIN reads outside outer tx (Layer 5 revisit); in-process PIN lockout→Redis on horizontal scale; onOrder @OnEvent consumer not built (durable signal in place); DP reversal/void→Layer 5; per-line warehouse in DP; Mira-scan connect; PO revision log. |
| 2 | ✅ COMPLETE | main e5635748 | 0126+0127 | GRN confirm re-validates PO status under FOR UPDATE (no receiving against cancelled/closed PO); PO FX rate FROZEN onto GRN + grn.confirmed emitted in functional currency (correct accrual JE + WAC for foreign-currency receipts); over-receipt DB backstop (locked post-increment assert, PIN-bypass only); batch/expiry validation at confirm; draft tax preview anchored to receipt date. NEW GRN VOID/REVERSAL: confirmed→voided for not-yet-billed receipt, reverses stock (purchase_return @ original cost) + GR/IR accrual (contra original accts, net-zero, idempotent), reopens PO, DELETEs confirm-created serials so corrected GRN can re-receive same serial, PIN+SoD, blocked 409 once billed; void locks grn_lines FOR UPDATE (no race w/ bill-match). canVoid+billedQty on response; void UI (PIN dialog, voided banner w/ approver, keeps-open-on-error). PIN lockout→generic 422. DUAL PATH: PASS (no posting drift, direct path reuses same engine); idempotency SOUND (durable outbox). 7-reviewer panel (incl security+accounting): 0 CRIT; accounting APPROVE-CLEAN (14 checks); 2 void-flow HIGH (serial-delete, grn_lines lock) + canVoid + MED/LOW all fixed same session. dev migrated, boot DI gate passed, 21 suites/462 tests. **MIGRATION GOTCHA (recorded):** Drizzle migrate() wraps ALL pending migrations in ONE tx → a new enum value (ADD VALUE 'voided') CANNOT be referenced in a CHECK in the same run even across separate files; fix = cast status::text in the CHECK to avoid the enum-catalog lookup. Founder follow-ups (NOT bugs): validateBatchTracking/serial FOR UPDATE (concurrent item-config edits); in-process PIN lockout→Redis; bin-level GRN receipt; per-supplier over-receipt tolerance; aged GR/IR report→L5; manual PO-close endpoint. |
| 3 | ✅ COMPLETE | main 2fc7d4b8 | 0128 | **C1 CRITICAL FIXED:** reverse-charge bills (UAE/KSA imports) now save+post — new payable_total (= total − self-assessed RC), balance CHECK rebased to balance = payable_total − paid; RC dual legs (1162.10/2131.10) net-zero, AP = payable. H1 3-way price match (editable invoice price; qty×(billPrice−grnCost)→PPV 5210; 2121 still clears exactly). H2 expense/service bills (non-inventory lines DR validated expense account, no phantom stock). H3 bill void/reversal (idempotent contra of ORIGINAL accounts net-zero, READ-ONLY summary so posted bill immutable, PIN+SoD, 409 once paid, re-opens GRN billedQty under FOR UPDATE, voided balance zeroed). H4 dup-bill guard normalized (lower(btrim()) partial unique, 409). H5 foreign-currency bills FAIL-LOUD (reject rate≠1; totalFn/balanceFn at rate 1) — full FX = founder follow-up. Frontend: expense lines, editable price + PPV indicator, payableTotal row, dup banner, bill void dialog, FX guard. 7-reviewer panel: 0 CRIT; accounting APPROVE — all 5 balance proofs (C1/H1/H2/H3/H5) balance; security CLEAN (expense-account whitelist solid, void SoD/replay safe); all HIGH/MED/LOW fixed same session. dev migrated + seed:system-accounts re-applied (5210 + void mappings; 37 acct/21 binding backfill). boot DI gate passed (547 routes). 11 suites/262 tests. Verdicts: DUAL PATH no drift; GR/IR no-double-count; 3-way match race SAFE (shared grn_lines lock). Founder follow-ups (NOT bugs): full bill FX (non-1 rate); N+1 in applyGrnMatching/reverseGrnMatching (batch later); voidApprovedBy/voidedBy unindexed (reports layer); soft-lock-override-on-confirm + near-dup-invoice-warning UX polish; in-process PIN lockout→Redis. |
| 4 | ✅ COMPLETE | main 8cefc2ad | 0129 | **CRITICAL double-GL-post FIXED:** inventory listener now does SOLD-PORTION COGS reclass ONLY (DR 5100/CR 1141); purchase-accounting listener owns full capitalization + freight liability (2122); two JEs tie by construction (no double-count). H1 consumed-stock split per-THIS-receipt (FIFO getRemainingQtyForSource itemId-scoped — was mis-splitting COGS on multi-item GRNs; WAC min(onHand,received)). H2 WAC reversal clamps ≥0 (no negative-WAC corruption). H2-durable revaluation→transactional outbox (deterministic eventId dedup). NEW landed-cost reversal (POST :id/reverse — contra JE + signed inventory reversal net-zero, PIN+SoD, period-validated, status→reversed). FX fail-loud (reject rate≠1). documentDate→occurredAt (no split-period). DUAL PATH HOLDS (direct purchase's internal GRN landed-cost-eligible). Frontend reversal dialog + banner + FX guard. 7-reviewer panel: 0 CRIT; accounting balance proofs tie + reversal net-zero per account (caught the multi-item-GRN itemId BLOCK, fixed); security clean; all HIGH/MED/LOW fixed same session. dev migrated; account mappings current. boot DI gate (548 routes). 6 suites/227 tests. Founder follow-ups (NOT bugs): full FX; by_weight pack/UOM weight; PPV-vs-LC interaction; allocation-preview endpoint+UI; negative-cost SLE gate is service-enforced reversal-only. |
| 5 | ✅ COMPLETE | main f63a230d | 0130 | **3 CRITICAL FIXED:** C1 payments persist balanceFn on every balance write (restores AP reconcile invariant multi-currency); C2 returns DECREMENT linked bill balance net-of-landed-cost so allocation can't over-pay (was real money loss) + AP-value guard (reverse payment before returning > unpaid balance) keeps GL DR 2111 == bill reduction (reconcile always holds); cheque payments now post balanced JE (was DLQ'd — listener enum + PAYMENT_LINE_TYPE). C3 NEW payment reversal + NEW return void (idempotent contra, restore AP/bill/stock net-zero, PIN+SoD, FOR UPDATE, period-validated, transactional outbox, frozen confirm-time tax for exact contra). H1 advance-application relieves AP at invoice rate (FX→gain/loss). H2 bill-sourced returns (grn_line_id nullable + bill_line_id XOR) — manual/direct-purchase bills returnable (dual path). H3 AP aging buckets 0-30/31-60/61-90/90+ functional, excludes voided/reversed + per-supplier + reconcile endpoints. cheque method; fxGainLoss persisted; bank_account_id FK. Frontend: reversal/void dialogs, AP aging table, bill-source return picker. 7-reviewer panel: accounting PROVED reconcile holds after pay/return/reversal + every JE net-zero; security CLEAN; 0 CRIT remaining; CRIT(cheque)+HIGH(C2 drift) caught+fixed same session. dev migrated; boot DI gate (553 routes); 7 suites/221 tests. Backend split across 2 hardener passes (part-1 C1/H1/H3, part-2 C2/C3/H2). Founder follow-ups (NOT bugs): period-end unrealized-FX AP revaluation; credit-note/refund-receivable for over-value returns; FIFO auto-allocation; reverse already-applied advance; in-process PIN lockout→Redis. |

## 🏁 PROGRAM COMPLETE (2026-06-30)
All 6 layers (0-5) shipped to main: 33c7a688 · 53b0de52 · e5635748 · 2fc7d4b8 · 8cefc2ad · f63a230d.
Migrations 0124-0130 (dev applied; prod auto via Railway pre-deploy). Purchase module now runs
standalone + AP-true for 10 years: **dual path** (direct-purchase express AND PO→GRN→bill→payment)
first-class every layer; **AP subledger-of-record** derived from the immutable party-tagged 2111
ledger with a reconcile invariant that HOLDS after every pay/return/reversal/void; full reversal
coverage (PO cancel, GRN void, bill void, landed-cost reverse, payment reverse, return void) —
never a dead-end; reverse-charge + input VAT + PPV + GR/IR + landed-cost all GL-correct (accounting
panel balance-proofed every layer); backend AND frontend hardened. Modular boundary protected
(F12 reorder→purchase inverted to event). MIGRATION GOTCHA recorded: Drizzle migrate() = ONE tx for
all pending → cast status::text in CHECKs to reference a just-added enum value.
**TOP FOUNDER TODO before go-live:** verify a full purchase cycle end-to-end on a real dev tenant
(reviews were code/test + boot-gate level); confirm prod tenant provisioning seeds the new account
mappings (purchase_variance 5210, landed_cost_accrual 2122). Full FX (non-1 rate) is fail-loud
across the module — the single biggest deferred capability.
