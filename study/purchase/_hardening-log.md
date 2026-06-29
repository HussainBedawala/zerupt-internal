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
| 1 | ⬜ pending | | | |
| 2 | ⬜ pending | | | |
| 3 | ⬜ pending | | | |
| 4 | ⬜ pending | | | |
| 5 | ⬜ pending | | | |
