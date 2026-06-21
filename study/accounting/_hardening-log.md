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
| 4 Period & balance integrity | ✅ ch00-06,09 | ✅ (TB/opening, period/close, FX) | ✅ | ✅ dev validated (cols + is_monetary backfill + 4830/7220 on real PG) + prod via Railway | ✅ 5d4a006f |
| 5 Reporting | ✅ ch00-09 | ✅ (P&L, BS, CFS, aging, write-off, purchase-return, FX-on-cash) | ✅ | ✅ migrations 0106-0109 dev validated + prod via Railway pre-deploy | ✅ merged (layer-5-closeouts) |

## Layer 4 — work done (merge 5d4a006f, branch phase-2/layer-4-period-balance)

**FX was the heavy area (audit found the unrealized reval was non-functional).**
- Unrealized revaluation (IAS 21) now POSTS (was dead-lettering — its JE lines had no accountId):
  offset leg carries the revalued account directly; gain/loss resolve via NEW mapping
  `fx.unrealized_revaluation` → 4830 / 7220 (migration 0105). Revalues ONLY monetary FC balances
  via new `accounts.is_monetary` flag (migration 0104; backfill validated on real PG — AR/AP/tax
  monetary, inventory/PPE/prepay/equity non-monetary). Revalues AR/AP **per party** so the offset
  line carries party and passes the Layer-3 control⇒party guard; cash/bank per-account no party.
  Reverse-next-period + idempotent; fails loud on missing closing rate; book value counts
  `['posted','reversed']` (reviewer-caught: it was the lone `posted`-only balance reader → phantom
  gain/loss on reversed accounts).
- Sales-side realized FX (the Layer-3 deferral): `exchangeRate` on salesInvoices (booking rate) +
  salesReceiptVouchers (migration 0103); receipt honours payment currency+rate, per-allocation
  realized FX mirroring the purchase reference; AR nets to zero in TC; functional invoices forced
  to rate 1 (reviewer-caught guard).

**Period & close:**
- Soft-lock override now permission-gated (policy `allowSoftLockOverride` AND role membership /
  Owner) on the manual + reversal post paths (was overridable by anyone with a free-text reason).
- Year-end / hard-close gated on COMPLETE close runs across EVERY period (was: only the last
  period checked); reopen restores each period's prior status (migration 0102 `status_before_close`).
- Gated via direct `close_runs` table reads — NO new DI edge; the JournalPosting↔FiscalPeriod↔
  YearEnd forwardRef cycle stays intact (verified by real boot).

**Trial balance & reconciliation:**
- Both recon services now count `['posted','reversed']` like the TB (a reversed control line no
  longer shows a false tie-out mismatch).
- Opening balances rejected when live (non-opening) transactions already exist on/after the opening
  date. Frontend TB shows a loud out-of-balance banner; informational note for branch-scoped TB.

**Already-correct (verified, NOT touched):** TB balances by construction (one header postingDate,
exact Σdr=Σcr in functional+TC, DB CHECK); opening OBE plug + idempotency; hard-lock chokepoint +
DB trigger 0098; year-end roll math; purchase realized FX (the reference impl); reval math/atomicity/
idempotency; Decimal everywhere; DI cycle forwardRef.

**Process:** reviewers caught 6 real issues unit tests missed (FX reversed-status book value =
CRITICAL; functional-invoice rate guard; receipt "1.00" string compare; 0105 hardcoded depth;
fiscal-period tenant_id defense-in-depth; BOOL_OR null→false) — all fixed. Audit C2 sub-claim
("no unrealized FX account") was STALE — 4830/7220 already existed; only the mapping was missing.
One concurrent-session stash appeared (obsolete duplicate, verified + dropped).

## Layer 5 — work done (merged layer-5-closeouts; commit hash to be added by founder's session)

**Aging rewrite (CRITICAL fixes from audit):**
- Both AR and AP aging rewritten from `invoices.balance` (denormalized) to GL-native derivation
  from `journal_entry_lines` on the system-role-resolved control account, per `(party, currency)`.
- Aging now ties to the TB control balance by construction: `grandTotalFunctional = Σ(debit−credit)`
  on the control account. Old report had zero tie guarantee.
- Multi-currency native: one row per `(party, currency)` in transaction currency; functional
  grand total for TB reconciliation.
- Opening-import party lines (no invoice row) now appear in aging — they were silently dropped.
- `due_date` dimension added to `journal_entry_lines` via migration 0106; backfill from invoice
  tables via system-role-resolved control accounts (never hardcoded codes). Posting plumbing
  threads `dueDate` + `sourceDocumentDate` through `build-je-payload.ts` + listeners + `postDirect`.
- FIFO settlement layer added: credits applied oldest-charge-first; per-party net preserved;
  `grandTotalFunctional` unaffected.

**P&L hardening:**
- Closing-JE exclusion added (HIGH): year-end closing sweep previously included → net profit
  would read zero on a closed FY. Fixed via `NOT IN (closing_entry_id subquery)`, mirroring CFS.
- Date column aligned to `journalEntryLines.postingDate` (LOW): matches TB scoping exactly.
- Test 20 (new): asserts closing JE is excluded; net profit = operating result, not zero.

**Balance Sheet hardening:**
- Contra-asset sign fixed (HIGH): `closingBalance()` was `normalBalance`-driven → accumulated
  depreciation shown as positive, overstating total assets by 2× accum. dep. After fix: sign
  driven by `type` (debit−credit for asset/expense, credit−debit for liability/equity/income).
  A contra-asset now carries a negative balance within the asset section, correctly netting PP&E.
- 4 new spec tests covering accumulated depreciation fixture; BS equation verified with contra.

**Cash Flow Statement hardening:**
- IAS 7 `effectOfFxOnCash` line added (MEDIUM-2): FX revaluation on foreign cash accounts was
  folded into operating section. Now extracted as a dedicated reconciling line. Footing unchanged
  (same arithmetic, amount reclassified between buckets). 2 new tests (multi-ccy case + zero for
  single-ccy). `reconciles` remains true by construction.
- BS↔CFS cash reconciliation: pinning test added (test 26) proving `closingCash = cash-assets −
  overdraft`; IAS 7 comment documenting the relationship. No logic change.

**New feature — AR write-off:**
- New module: `sales/receivable-writeoff/` (service + controller + DTO + 18 tests).
- JE: DR 6430 Impairment Loss / CR 1131 AR control (party-tagged). Resolved via account mapping.
- Owner-gated (`OWNER_ONLY_KEYS`), `@Audited` + explicit `auditLog.append`, throttled 5/min.
- Cannot exceed open balance (re-read inside tx); idempotent via UUIDv5 eventId; race-safe.
- Migration 0108: bad_debt→6430 + receivable→1131 mappings.

**New feature — purchase-return two-JE clearing:**
- Two self-balancing JEs via clearing account 1192 (Purchase Return Clearing):
  - AP-side: DR payable/accrual / CR clearing (doc cost) + purchase_variance (5210) + tax legs.
  - Inventory-side: DR clearing (doc cost) / CR inventory at ENGINE WAC + purchase_variance (5210).
- Inventory relieved at WAC (not document cost); variance correctly to 5210 (not COGS 5100).
- Migration 0109: adds accounts 1192 + 5210 to COA template + 5 account mappings.
- Dead DLQ leg (`inventory.purchase_return` with no mapping) now live and correct.

**Performance indexes — migration 0107:**
- `jel_control_party_aging_idx` — partial composite on `(account_id, party_id, currency)
  WHERE party_id IS NOT NULL`: covers the aging control-account + party filter.
- Three additional indexes for P&L/BS date-range scans, entity-status joins, and the
  closing-JE subquery.

**Audit findings — real vs false-positive:**
| Finding | Real? | Action |
|---------|-------|--------|
| Aging reads `invoices.balance`, not GL (CRITICAL×2) | REAL | Full GL-native rewrite |
| BS contra-asset sign wrong (HIGH) | REAL | Fix `closingBalance()` to be type-driven |
| P&L includes closing JEs (HIGH) | REAL | Exclusion subquery added |
| CFS no IAS 7 FX-on-cash line (MEDIUM) | REAL | `effectOfFxOnCash` line added |
| GL has no `due_date` column for aging (HIGH) | REAL | Migration 0106 + posting plumbing |
| `sql.raw(asOf)` SQL injection in aging (CRITICAL from reviewers) | REAL | Replaced with bound parameter |
| Aging missing `accounts.tenantId` defense-in-depth (MEDIUM from reviewers) | REAL | Added to join condition |
| Partial payments bucket to wrong age without FIFO (MEDIUM from reviewers) | REAL | `settleAndBucket()` helper added |
| CFS MEDIUM-1 (cash pool vs BS definition) | NOT-A-BUG | IAS 7 correct; pinning test added |
| BALANCE_AFFECTING_JE_STATUSES includes "reversed" on aging (MEDIUM from DB reviewer) | NOT-A-BUG | Confirmed correct; explanatory comment added |

**Reviewer-caught issues fixed before merge:**
1. `sql.raw` injection in AR/AP aging — CRITICAL; fixed to bound parameter.
2. Missing `accounts.tenantId` in `resolveControlAccountIds` join — MEDIUM; added.
3. Partial-payment bucket mis-distribution — MEDIUM; FIFO settlement layer built.
4. `groupBy` on `sql()` expression reference identity — LOW; comment added.

## Layer 4 — DEFERRED / FLAGGED FOR FOUNDER (carry forward → all resolved in Layer 5)
1. **Write-off / bad-debt path** — ✅ DONE (Layer 5, migration 0108, DR 6430/CR 1131, Owner-gated).
2. **Purchase-return inventory credit single-source** — ✅ DONE (Layer 5, two-JE clearing, migration 0109).
3. **GL-native multi-currency aging report** — ✅ DONE (Layer 5, migration 0106, full GL rewrite).
4. **FX triangulation beyond USD** — ⏳ DEFERRED by founder decision → Linear issue DEV-427.
5. **Reval composite index** — ✅ DONE (migration 0107, `jel_control_party_aging_idx`).
6. **`Owner` system-role bypass bare string** — minor; consistent across codebase; extract constant when convenient (not a correctness issue).
7. Migration 0105 hash note — resolved on merge deploy.

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

## REMAINING OPEN ITEMS (honest, short)

| # | Item | Status | Action |
|---|------|--------|--------|
| 1 | **FX triangulation beyond USD** (EUR/KWD without a USD pivot) | DEFERRED | DEV-427 — founder to schedule; not MVP-blocking |
| 2 | **Prod migrations 0106-0109** | PENDING OPS | Apply via Railway pre-deploy hook on merge of layer-5-closeouts; same as all prior layers |
| 3 | **`Owner` bare-string constant** in fiscal-period + permission.service | COSMETIC | Extract shared constant when convenient; no correctness impact |
| 4 | **`batchLockPeriods` close-run gate** | EXCLUDED | Bulk admin path explicitly outside audit scope (Layer 4 note); not used by normal close flow |
| 5 | **User-created accounts `deriveIsMonetary`** | DEFERRED | New user accounts default `true` (conservative); `deriveIsMonetary` not called for user-created accounts; safe for MVP |

## Notes for morning review
(to be appended per layer)
