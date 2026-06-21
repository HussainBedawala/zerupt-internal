# Accounting Module Hardening — Overnight Log (started 2026-06-20 night)

> Founder mandate (2026-06-20, going to sleep): finish Layer 0, then proceed layer by
> layer through the ENTIRE accounting module. For EACH layer: (1) subagent writes study
> material, (2) full audit identifying gaps (like Layer 0), (3) finish/harden the layer —
> 100% concrete & stable for 10 years, think like an accountant, (4) apply all required
> migrations to dev tenant DB + push to prod, (5) commit + merge branch to main, (6) next
> layer. SKIP templates (founder will do in morning). No tech debt, no follow-ups,
> permanent fixes. Use subagents; subagents must NOT spawn their own subagents. Preserve
> context + tokens (subagents write detail to /tmp, return terse summaries). Full review
> in the morning.

## Guiding principles (apply to EVERY layer + audit)
1. **Think like an accountant.** Assume a real accountant uses this. Design for how they
   actually work (audit trails, reconciliation, period discipline, drill-down, corrections
   via reversal). Correctness is non-negotiable.
2. **Scalability / never-revisit.** When stuck on a decision, pick what will ALWAYS work at
   scale so we never have to revisit. Permanent over expedient.
3. **Modular packaging (long-term).** Vision: sell modules independently (OAuth-style — pick
   Accounting, get core Accounting; pick POS, get POS + its essential deps). So accounting
   must be a clean, self-contained CORE module: other modules depend on accounting (via
   events/outbox), accounting must NOT depend up into POS/sales/purchase. Watch dependency
   direction + module boundaries in every audit so accounting can be packaged & sold alone.

## Branch
`phase-2/layer-0-ledger-hardening` (Layer 0). New branch per layer thereafter.

## Layer status

| Layer | Study | Audit | Hardening | Migrations (dev+prod) | Merged to main |
|-------|-------|-------|-----------|-----------------------|----------------|
| 0 Ledger foundation | ✅ ch00-09 | ✅ | ✅ | ✅ dev validated + prod via Railway | ✅ bcfc9cd5 |
| 1 Chart of Accounts | ✅ ch00-09 | ✅ | ✅ | ✅ dev validated + prod via Railway | ✅ a8becbff |
| 2 Posting pipeline + per-domain JE construction | ✅ ch00-09 | ✅ | ✅ | n/a (no migration) | ✅ 293610b4 |

> Layer 2 also fixed a deploy-crash DI cycle (JournalPosting→FiscalPeriod→YearEnd→JournalPosting):
> forwardRef on all 3 edges. VERIFIED with a real `node dist/main` boot — the metadata-only
> app-bootstrap test passed while the real boot still failed, so ALWAYS do a real boot check
> (or boot-in-CI with Redis) as the DI gate, not just the metadata test.
| 3 Sub-ledgers & valuation | ✅ ch00-07,09 | ✅ (AR/AP, inventory, tax) | ✅ | ✅ dev validated (trigger fired on real PG) + prod via Railway | ✅ 9acf650c |
| 4 Period & balance integrity | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 5 Reporting | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

## Layer 3 — work done (merge 9acf650c, branch phase-2/layer-3-subledgers-valuation)

**The big one — AR/AP sub-ledger had NO party slot.** Every live AR/AP control line
(invoice/receipt/credit-note/payment/POS-on-account/cheque) posted `party_id = NULL`, so the
GL per-customer/supplier sub-ledger was structurally empty (masked because aging reads
`invoices.balance`, a 2nd source of truth). Fixed:
- Plumbed `partyType`/`partyId` end-to-end: `JeLineInput` → `eventLineSchema` → `ResolvedLine`
  → `postFromEvent` → `postDirect` (which already persisted them). Listeners + emitters now set
  party on every `trade_receivables`/`trade_payables` line (sales/purchase/pos/cheque/landed-cost).
- `postDirect` guards: control⇒party, party⇒control, party existence (vs sales_customers/
  suppliers), and manual posts blocked from control accounts. `requiresParty` = EXACTLY
  {trade_receivables, trade_payables} — audit FALSE POSITIVE: customer_deposits/supplier_prepayments
  are NOT control accounts in the base template, so party is forbidden there.
- DB backstop constraint trigger (migration 0100) — VALIDATED firing on real dev Postgres
  (party-less AR/AP line rejected; party line allowed; both rolled back).
- New `SubledgerReconciliationService`: 3-way tie-out (GL control vs Σ GL-party vs Σ
  invoices.balance) + explicit unattributed bucket; read endpoint + monthly-close task
  `reconcile_ar_ap_subledger` (manual checklist item).

**Inventory valuation (where GL balances but detail drifts):**
- `decrementOutbound` now recomputes `total_value = on_hand × WAC` (was subtractive → drifted);
  reconciliation subledger basis = `Σ(on_hand × average_cost)`; one-time backfill (0100).
- Negative-stock COGS true-up on the next cost-establishing receipt; materialized `total_value`
  reduced by the true-up so it ties to GL EXACTLY (caught by accounting-reviewer as a divergence
  in the first cut — fixed).
- Transfer receive uses pack-resolved base qty (was raw qty → corrupted destination WAC/on_hand).

**Tax (mostly mature already):**
- POS-return now carries `taxLines[]` with `taxCodeId` (was a flat party-less `taxAmount` → silently
  dropped from VAT output aggregation → overstated output VAT). `taxableAmountTC` required when
  `taxCodeId` set; `taxAmountTC` populated; rate carried as exact string; `out_of_scope` handled.

**Process notes (learned):**
- Reviewers caught TWO real HIGH/CRITICAL bugs unit tests missed: (a) inventory true-up materialized
  vs GL divergence; (b) recon used `status IN ('confirmed','overdue')` but `'overdue'` is not in the
  enum → Postgres THROWS at runtime; `detect()` crashed on real PG (12 unit tests passed because they
  mock the query builder). Reconfirms: ALWAYS validate against real Postgres; mocks hide enum/SQL bugs.
- One fix subagent died mid-task (connection drop) leaving a half-edited service+spec (invalid
  `PartyBalance.partyType`, unfinished readGlControl query-fold, stale mock queue). Recovered by hand.
- Verified false positives (did NOT "fix"): trigger legalEntityId scoping (accounts are entity-scoped
  via unique PK, so tenant+account scoping is sufficient); customer_deposits as party-subledger.

## Layer 3 — DEFERRED / FLAGGED FOR FOUNDER (carry forward)
1. **Sales-side receipt FX** — `salesReceiptVouchers` has no `exchangeRate`; FC customer receipts are
   coerced to functional with no realized FX. Purchase side is correct. Belongs in **Layer 4 (FX)**.
2. **Write-off / bad-debt path** — none exists. Needs a permissioned, audited action (DR bad-debt /
   CR AR control WITH customer party). A period-close requirement; build as a feature.
3. **Purchase-return inventory credit single-source (MEDIUM-1)** — engine event-handoff was too
   fragile (async cross-listener buffering); reverted. Needs a proper two-JE clearing-account
   redesign (engine owns the inventory-relief leg, like sales COGS). Current behavior is balanced
   (priceVariance plug), just imprecise on variance classification.
4. **GL-native multi-currency aging report** — aging still reads `invoices.balance` (functional only,
   mis-aggregates multi-currency customers). Now that party is populated + reconciliation alerts on
   drift, rewrite aging to derive from GL party lines per (party, currency) in **Layer 5 (reporting)**.
5. **DB trigger LOW notes** — backfill produces negative `total_value` for negative on_hand (intended,
   CHECK permits); `ALTER TYPE ADD VALUE` (0101) not idempotent (drizzle journal prevents re-apply).
6. **Historical party backfill** — N/A (no live tenants); if tenants existed, pre-Layer-3 AR/AP lines
   would be party-less and the trigger only guards new writes.

## Layer 0 — work done (waves)
- W1 keystone: `postDirect()` single ledger primitive (balance functional+TC, leaf/isHeader, entity-scope, non-neg, currency-aware rounding). `postFromEvent` delegates. + public `validateLines`/`validateAccounts`.
- W2a: reversal → postDirect; manual-draft → shared validators (preserves draft row identity).
- W2b: year-end / opening-balance / inventory-recon → postDirect; commitReservation moved inside tx; DI wired.
- W3 (outbox): COGS/FX-reval/POS/cheque fire-and-forget → transactional outbox. [running]
- W4 (DB): migration 0097 (cost_centers + FK + accounts (type,sub_type) & normal_balance CHECKs), 0098 (totals-sync trigger + fiscal hard-lock guard). db typecheck clean.

## OPEN ITEMS to close before Layer 0 merge
1. 4 failing tests in journal-posting.service.spec.ts (`accountId override`, `postDirect › rounds amounts`) — REAL, must fix.
2. Confirm outbox POLLER awaits posting result & only marks row completed on success (else retry guarantee is fake). Verify in accounting-events poller.
3. Repo-wide typecheck + full accounting jest green.
4. Golden test suite (Layer 0 freeze): T1 multi-currency post, T2 FNC sentinel, T3 header-account reject (auto path), T5 year-end self-balance, T6 purchase/inventory listener balance, T8 cross-entity reject, T9 FX fallback.
5. Reviewers: accounting-reviewer + nestjs-reviewer + database-reviewer; fix all findings.
6. Apply migrations dev tenant DB; prod via Railway pre-deploy on merge. Verify from actual DB.

## Notes for morning review
(to be appended per layer)
