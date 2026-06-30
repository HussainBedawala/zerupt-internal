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
| 1 | ⏳ next | | 0132 | Study+audit banked: direct/express sale is REAL reuse (atomic, idempotent) at parity; land-now set small — SO-confirm credit gate [L0-DEP], FX fail-loud, cancel-asserts-no-invoice, direct-sale credit warning. Defers: partial-invoicing, quotation conversion, short-close, full approval-PIN. |

(layers 2-5 pending)
