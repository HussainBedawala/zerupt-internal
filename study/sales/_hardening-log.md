# Sales Module Hardening — Overnight Log (started 2026-06-30)

> Founder mandate (2026-06-30): accounting + inventory + purchase are perfected
> (see study/accounting/, study/inventory/, study/purchase/). Repeat the SAME layer-by-layer
> process for the ENTIRE sales module. Sales is the MIRROR of purchase: customer/AR not
> supplier/AP, OUTPUT VAT not input, revenue + COGS-on-sale not inventory receipt, money IN
> not OUT. For EACH layer: (1) subagent writes study material, (2) full audit of gaps by
> severity, (3) harden — 100% concrete & stable for 10 years, think like a seller/shopkeeper,
> (4) apply migrations to the **dev** tenant DB (PROD auto-applies via Railway pre-deploy on
> push to main), (5) commit to main, (6) next layer. No tech debt, permanent fixes. Subagents
> must NOT spawn subagents; they write detail to /tmp/sales-hardening/ and return terse
> summaries. Run AUTONOMOUSLY end-to-end.

## Guiding principles (apply to EVERY layer + audit)
1. **Think like a seller / shopkeeper.** A real operator runs selling standalone: accurate
   customer balances always, audit trail for every document, corrections via reversal/credit-note
   (never edit/delete), partial flows (delivery/return/receipt), multi-currency. Correctness of
   quantity AND value AND AR balance AND revenue/COGS is non-negotiable.
2. **DUAL PATH IS FIRST-CLASS, every layer.** Two operators both fully served:
   - **Inventory-only shopkeeper** — DIRECT / EXPRESS SALE (POS-style, no SO): quick invoice +
     stock relief + receipt. Complete and correct on its own.
   - **Full shopkeeper** — SO → delivery/fulfillment → invoice → receipt chain.
   Every audit explicitly checks BOTH paths. Neither is second-class.
3. **Verify backend AND frontend every layer.** The web feature
   (apps/web/src/features/sales/, customers UI, AR overview) must actually support the hardened
   behaviour: loading/error/empty/success, confirmations on destructive/over-tolerance actions,
   both paths reachable.
4. **Scalability / never-revisit.** Pick what ALWAYS works at scale. Permanent over expedient.
5. **Modular packaging — dependency direction.** Sales sits ABOVE inventory + accounting and
   depends DOWN into them (events/outbox, reads). NEVER depended on UP-ward. Watch boundaries.

## Process gates (every layer)
- Reviewers: code-reviewer always; + nestjs-reviewer + api-reviewer (backend), accounting-reviewer
  (any GL/AR/tax/COGS), security-reviewer (PIN/SoD/auth), database-reviewer (migrations),
  frontend-reviewer (web changes). accounting-reviewer MUST balance-proof every JE + confirm the
  AR reconcile invariant.
- Real `node dist/main.js` boot = the DI gate (not metadata test only).
- 100% coverage on AR/GL/tax/COGS posting + reversal paths; 80%+ general.
- Migrate dev tenant DB; confirm "Test Suites: N" in jest output (passWithNoTests trap).

## Core invariants (the AR mirror of purchase's AP)
- **AR balance DERIVED** from the immutable party-tagged receivables-control ledger (1131-ish),
  NOT a mutable SUM of invoice balances. Per-currency + functional-in-SQL (no float drift).
  Reconcile drift invariant must HOLD after every invoice/receipt/return/reversal.
- Money = Decimal only. Documents immutable — corrections via reversal/void/credit-note JEs,
  never UPDATE/DELETE on journal_entries. Every AR control line party-tagged (customer).
- Reversal flows: FOR UPDATE + status re-assert + distinct deterministic eventId namespace +
  transactional OUTBOX + manager-PIN+SoD via PinVerificationService (generic 422). validatePeriod
  before every financial posting.
- Stock-relief idempotent handoff to inventory + COGS; revenue/COGS never double-counted.

## Layer plan (locked 2026-06-30, document-chain order)
| # | Layer | Scope |
|---|-------|-------|
| 0 | Customer master + AR subledger foundation | identity/dedup/credit-limit/blocked; AR balance DERIVED from immutable party-tagged 1131 ledger; reconcile invariant; multi-currency balanceFn; opening balances. Dual-path: AR works for direct-sale-only. |
| 1 | Sales order lifecycle + DIRECT/EXPRESS SALE | SO state machine, approval/SoD, partial-fulfillment tracking, amendments; define+harden the no-SO express sale. |
| 2 | Delivery / fulfillment + stock relief | deliver vs SO + direct; over/under-ship, partials, serial/batch pick (FEFO), idempotent stock-relief + COGS handoff, delivery reversal. |
| 3 | Sales invoice / billing + output VAT + AR post | invoice from delivery/direct; revenue recognition, output VAT, AR posting party-tagged, price/discount, invoice void. |
| 4 | (scope-dependent) pricing/promotions/commission or revenue-deferral | fold into 3 if module lacks it; renumber. |
| 5 | Customer receipts + returns/credit notes + AR aging + period integrity | receipts (partial/advance/early-discount/FX/allocation/reversal); returns at original cost + stock back-in + AR decrement; AR aging buckets; reconcile. |

## Layer status
| # | Status | Commit | Migration | Notes |
|---|--------|--------|-----------|-------|
| 0 | ✅ COMPLETE | main 96d1c32d | 0131 | AR balance now DERIVED from the immutable party-tagged trade-receivables (1131) GL ledger via new CustomerArBalanceService (DR-normal mirror of SupplierApBalanceService) — per-currency + functional-in-SQL; reconcile invariant proved (subledger==GL after invoice/receipt/credit-note). **GL was already correctly party-tagged on all 4 sales events** (study's "blocked customer = zero enforcement" was a FALSE POSITIVE — `requireActiveCustomer` already hard-blocks). Structural drift-kill: `total_fn`/`balance_fn` → **GENERATED ALWAYS AS (x * coalesce(exchange_rate,1)) STORED** (removed all service writes; NULL-propagation + drift now impossible). Credit-limit HARD-BLOCK at invoice confirm — AR read moved INSIDE the confirm tx + `pg_advisory_xact_lock(tenant:customer)` (no TOCTOU 2×-limit race); override gated by NEW RBAC perm `sales.invoice.credit-limit-override` (manager/owner SoD, 403 without). balance=total-paidAmount CHECK; default_currency+ISO; blocked_reason/at + status-transition table; tax_number partial-unique; soft dup-name guard on create AND rename; opening-requires-JE CHECK scoped to confirmed (draft-safe); default_price_list_id FK (price_lists stable, built not deferred); contacts/addresses updated_at. Client errors no longer leak ids/AR/limit/on-hand. Frontend: credit/currency/blocked fields, GL-derived per-currency AR KPI, dup-name + credit-override dialogs (keep-open-on-error, bidi, double-submit guard), en+ar parity. **7-reviewer panel:** accounting BLOCK→fixed (TOCTOU + float-on-money), security HIGH SoD→fixed (RBAC perm), db CRITICAL opening-JE-check→fixed (confirmed-scoped), frontend 2 CRIT (em-dash, locale-in-audit)→fixed; all HIGH/MED/LOW fixed same session. dev migrated (up to date @ 0131); boot DI gate 553 routes; 14 suites / 283 tests green. **Founder follow-ups (NOT bugs):** full manager-PIN UX on override (RBAC perm is in place as the gate now); `priceOverrideById` DTO field accepted-but-unpersisted (Layer 3 pricing scope); pre-PROD-apply audit for any confirmed opening invoice with null JE + dup tax numbers (dev clean). |
| 1 | ✅ COMPLETE | main 86ee163f | none | DUAL PATH verified: direct/express sale is REAL atomic idempotent reuse of the invoice+receipt engine at GOVERNANCE PARITY (no parallel posting). Credit-limit hard-block now also at SO confirm via NEW shared **CreditLimitGuard** (dedups the ~75-line gate across invoice+SO, ready for POS): advisory lock at TOP of confirm tx → GL-derived AR read under lock → 422 over-limit unless overrideReason(min10)+`sales.invoice.credit-limit-override` perm (else 403). **Lynchpin fix:** structured coded exceptions (CUSTOMER_OVER_CREDIT_LIMIT / CREDIT_LIMIT_OVERRIDE_FORBIDDEN / FX_CURRENCY_MISMATCH in body) — the override dialog was previously UNREACHABLE on BOTH direct-sale AND SO paths (also corrected the already-shipped Layer-0 invoice contract). Direct sale FX fail-loud (no silent rate=1); SO cancel blocked once any invoice sourced; two-arg 64-bit advisory lock (no cross-customer collision); AR account lookup threaded under lock; single DbExecutor type kills unsafe tx casts. EVENT-CONTRACT verdict: sync in-tx StockReservationService reserve/release is SAFE — left synchronous (async would reopen oversell window). Frontend: SO+direct override dialogs key on codes, free-text manager reason, error-in-footer, no dead-ends, en+ar. **5-reviewer panel:** nestjs HIGH (lock-after-update)→fixed, security+frontend HIGH (unreachable override / mis-routed 403+422)→fixed, accounting APPROVE, code MED (extract shared guard)→done; all fixed same session. boot 553 routes; 15 suites / 302 tests; no migration. **Founder follow-ups (NOT bugs):** partial-invoicing (invoicedQty/PartiallyInvoiced states), quotation→SO conversion, Closed/short-close, full manager-PIN UX (RBAC perm gates it now), B2B delivery-note doc — all fail-loud, none half-built. |
| 2 | ✅ COMPLETE | main b04b2508 | none | POS-style: stock relief + COGS at invoice confirm (no separate delivery doc — deferred B2B). **A1 oversell now rolls back BEFORE revenue posts:** confirm tx locks materializedStockLevels FOR UPDATE in deterministic item+warehouse order (no deadlock) + rejects short stock (coded 422 INSUFFICIENT_STOCK) before status flip/outbox/emit → zero revenue + zero COGS on oversell (was: whole-invoice revenue with partial/zero COGS, unrecoverable). **A2 COGS ties by construction:** credit-note return cost reads ACTUAL engine-realized cost from stock_ledger_entries (per-unit, multi-lot FEFO aware, sourceDocumentType='inv'), bit-exact on full-line returns, COGS-out==COGS-reversal; fallbacks snapshot→WAC with loud WARNs, never silent zero. Two-listener split (inventory owns COGS JE, sales owns AR/revenue) + idempotent deterministic-eventId relief preserved. Frontend: friendly not-enough-stock message (keeps form open). **4-reviewer panel:** accounting APPROVE (COGS-tie + oversell-no-post CONFIRMED via balance proof), nestjs HIGH (non-deterministic lock order→deadlock)→fixed, code/frontend APPROVE; all MED/LOW fixed same session (full-line exact-tie caught a would-be COGS double-count — fixed as per-unit quotient). boot 553 routes; 15 suites / 307 tests; no migration. **Founder follow-ups:** B2B delivery-note + partial-delivery doc, unconfirm, batch lot-ref on CN line; residual ≤1 ULP on >6dp multi-lot full-line returns is inherent to the numeric(19,6) per-unit schema (documented). |
| 3 | ✅ COMPLETE | main acb8c13f | 0132 | Output VAT/AR/revenue VERIFIED correct (balanced party-tagged JE, net-of-discount, period-gated). **NEW sales invoice VOID** (the CRITICAL gap — only credit notes existed): POST :id/void (sales.invoice.void RBAC + manager PIN + distinct-approver SoD via verifyApproval) → read-only immutable contra off STORED amounts (DR revenue 4110 / DR output VAT 2131 / CR AR 1131 party-tagged) net-zero + inventory/COGS reversal via sale_return fan-out at ENGINE-REALIZED cost (Layer-2 tie) so confirm+void nets to exactly zero on EVERY leg incl. serial restore; idempotent, FOR UPDATE + status re-assert, deterministic void-namespaced eventId, transactional outbox, period-validated on original confirm date. Coded 409 ALREADY_VOIDED/_PAID/_HAS_CREDIT_NOTE; blocked once paid/credited; **CN confirm now locks parent invoice FOR UPDATE (closes CN-vs-void race)**. Migration 0132: 'voided' status + void cols (status::text in CHECKs — enum-in-one-tx gotcha) + SoD CHECK + aging partial index excludes voided. voidInvoice decomposed to <50-line helpers; recomputeSummary asOf REQUIRED (no silent today-rate VAT); legalEntityId in shared payload schema; Σdr==Σcr assert before emit; approvalPin in audit DENIED_KEYS; G2 priceOverrideById now coded-422 rejected (was silently dropped). **7-reviewer panel:** accounting APPROVE (void JE balance-proven net-zero per leg incl multi-rate VAT + COGS), security CLEAN (PIN/SoD airtight, no leaky pre-check), database PASS (enum gotcha handled), nestjs/code/frontend all fixed same session (decompose + numeric balance-proof test + CN-race + null-confirmedAt guard + aging-index). **Account mapping note:** void resolves via in-code DEFAULT_ACCOUNT_MAPPINGS (system-role 4110/2131/1131) exactly like confirm — VERIFIED on dev tenant (confirmed itself has 0 DB mapping rows; engine falls back to code defaults), so NO per-tenant seed needed (cleaner than purchase's 5210/2122). dev migrated @ 0132; boot 554 routes; 80 suites / 1527 tests green. **Founder follow-ups:** real price-list lookup, header discount, per-code VAT UI, rounding line, dup-invoice guard, confirm/confirmComposed decomposition (pre-existing 1882-line file), period-HardLock race (module-wide pre-existing), AR/GL async reconcile alerting (reconcile endpoint exists), UI permission hook (no useHasPermission exists; server enforces + canVoid gates). |
| 5 | ⏳ next | | 0133 | Audit banked (/tmp/sales-hardening/layer-5-audit.md): AR-reconciles invariant HOLDS today; NO over-credit/over-refund money loss; receipts+CN+aging+writeoff solid. Land-now: G1 receipt REVERSAL (copy purchase supplier-payments reverse — net-zero contra, re-credit invoice balance, PIN+SoD, period-gated, outbox; needs reversedAt/By/reason cols) + G3 cheque method (trivial: add to DTO enum; listener already maps cheque→bank). Defer: G4 CN FX leg, G2 advance re-allocation, G5 write-off recovery. |
