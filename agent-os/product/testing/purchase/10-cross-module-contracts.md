# Purchase — Cross-module Contracts Testing Checklist

> Persona: **Shop owner / system auditor.** You are not using a purchase screen — you are verifying that every purchase event correctly rippled into the GL, into stock, and into reports. You trust nothing until you have traced the trail from the source document to the journal entry to the stock ledger to the aging report. Ask at every step: **"if this listener silently threw an error, what would I see, and would I notice?"**

- **Route(s):** No dedicated UI for event contracts; verified via GL (Accounting module), stock levels (Inventory module), AP aging (09), and server logs / dead-letter queue.
- **Feature dir:** `apps/api/src/accounting-events/listeners/purchase-accounting.listener.ts` (primary listener file)
- **API (events only, no direct API calls):** invoice confirmed/voided, GRN confirmed/voided, landed-cost allocated/reversed, return confirmed/voided, payment posted/reversed
- **Tables (written by listeners):** `journal_entries`, `journal_entry_lines` (Accounting), `stock_ledger_entries`, `materialized_stock_levels` (Inventory), `purchase_invoices.balance`/`balanceFn` (AP subledger)
- **Depends on:** 02-purchase-orders, 03-direct-purchase, 04-grn-receipt, 05-purchase-invoices, 06-landed-costs, 07-supplier-payments, 08-purchase-returns, 09-ap-aging-overview — all must be passing before cross-module contracts are verified.

## 0. Preconditions

- [ ] At least one completed direct-purchase bill AND one completed PO→GRN→bill chain exist for the SAME item and quantity (for dual-path equivalence testing).
- [ ] At least one landed-cost allocation, one purchase return, one supplier payment, and one reversal (of any of the above) exist in the dataset.
- [ ] The GL chart of accounts includes: 1141 (Merchandise Inventory), 2111 (Accounts Payable), 2121 (GR/IR clearing), 2122 (Landed Cost Accrual), 5210 (Purchase Price Variance), Cash and Bank accounts. Know the account codes for this tenant.
- [ ] Access to the GL journal entry list (Accounting module), the stock ledger (Inventory module), and `/purchase` AP aging (09) for verification.
- [ ] If a dead-letter queue or event failure log is available, know how to access it.

## 1. Functional — actions & states

### GRN confirmed → Inventory & GL
- [ ] **Stock increases at receipt cost:** each GRN line generates a `RECEIPT`-type `stock_ledger_entries` row with `quantity = +(line qty)` and `unitCost` = receipt cost; `materialized_stock_levels` on-hand increases accordingly.
- [ ] **GR/IR JE posted:** `DR 1141 (Inventory) → CR 2121 (GR/IR clearing)` at receipt cost; balanced.
- [ ] **JE references the source document:** `sourceDocumentType`/`sourceDocumentId` point to the GRN; drill-down resolves.

### Bill confirmed (matched to GRN) → GL
- [ ] **GR/IR clears:** `DR 2121 (GR/IR) → CR 2111 (Accounts Payable, party-tagged)` at the billed amount for the matched portion.
- [ ] **Price variance posts when bill price ≠ receipt cost:** the difference posts to `5210 (purchase_variance)`, not silently absorbed into inventory or AP.
- [ ] **Input VAT line is blank/zero for Asala** (no-VAT tenant) — confirm no stray VAT posting appears on any bill.

### Direct purchase bill (no GRN) → Inventory & GL
- [ ] **One balanced entry, no GR/IR round-trip:** `DR 1141 (Inventory) → CR 2111 (Accounts Payable, party-tagged)` directly; stock ledger entry created at the same cost, same as the GRN path.

### Landed cost allocated → Inventory & GL
- [ ] **Stock revalued:** the allocated landed-cost amount is spread across the GRN lines' inventory value; WAC recomputed per item.
- [ ] **GL posted:** `DR 1141 (Inventory, allocated) → CR 2122 (Landed Cost Accrual) / AP / Cash` depending on the funding source selected.
- [ ] **Multiple components share one logical event** (freight, customs, etc.) but each posts its own JE line with a deterministic sub-eventId; no component is silently dropped.

### Payment posted / reversed → GL & AP subledger
- [ ] **GL on post:** `DR 2111 (AP, party-tagged) → CR Cash/Bank`; bill balance(s) reduced by the allocated amount(s). (Full detail in 07.)
- [ ] **GL on reverse:** contra JE mirrors the original; bill balance(s) restored exactly.

### Return confirmed / voided → Inventory & GL
- [ ] **GL on confirm:** `CR 1141 (Inventory, at original cost) / DR 2111 or DR 2121` depending on matched vs accrual-only source line; stock ledger entry reduces on-hand. (Full detail in 08.)
- [ ] **GL on void:** exact reversal of the confirm-time journal, including the frozen tax breakdown (should stay zero for Asala).

### Failed postings
- [ ] If any listener throws mid-processing, the failure is captured (dead-letter queue or equivalent) rather than silently dropped; confirm via logs or a queue inspection tool if available.

## 2. Domain invariants (AP / GL / stock / reports)

- [ ] **Every completed event → balanced JE (`DR total = CR total`):** query `journal_entry_lines` grouped by `journalEntryId`; no purchase-sourced entry has `Σ DR ≠ Σ CR`.
- [ ] **Every receipt/bill line → one stock ledger entry:** the count of stock-ledger rows for a given GRN/direct-bill equals the number of stock/item lines; no line silently skipped.
- [ ] **`eventId` uniqueness (idempotent listeners):** across all `journal_entries` rows sourced from purchase events, no `eventId` appears more than once; replaying an event does not create a duplicate JE.
- [ ] **Purchase services never write JEs or stock entries directly (no bypass of the event system):** grep the purchase module for direct imports of `JournalEntryService` / `StockLedgerService` outside the listener; all such writes flow exclusively through `purchase-accounting.listener.ts` and the inventory listener.
- [ ] **AP subledger = party-tagged 2111 ledger, always.** For every supplier, Σ open bill balances = supplier's 2111 GL balance; Σ all suppliers = total 2111. Re-verify after EVERY event type in this checklist (GRN, bill, landed cost, payment, return, and every reversal/void of each).
- [ ] **GR/IR (2121) nets to zero once a receipt is fully billed** — a GRN that has been both received and fully matched to a bill leaves no residual 2121 balance for that document.
- [ ] **Inventory subledger = 1141 control account** — Σ item on-hand value (qty × WAC) across all warehouses = the 1141 GL balance, after every receipt/return/landed-cost event.
- [ ] **PPV posts to 5210, never silently absorbed elsewhere** — verify a bill with price ≠ receipt cost produces a nonzero 5210 line, and the 1141 value used going forward is the RECEIPT cost, not the billed price (unless the design intentionally revalues stock — confirm which and that it's consistent).
- [ ] **Landed-cost-accrual (2122) clears when the accrual is settled** (paid or matched) — no permanent residual balance for a fully settled landed cost.

### Dual-path equivalence (CRITICAL)
- [ ] **Direct purchase and PO→GRN→bill post IDENTICAL GL + stock for the same economic event** (same item, qty, cost): compare the resulting 1141 debit, 2111 credit, and stock ledger unit cost between the two paths for equal inputs — they must match exactly.
- [ ] **Both paths produce the same reconcile-invariant outcome** — AP subledger and 2111 GL agree regardless of which path was used.

## 3. Edge cases & defensive UX

- [ ] **Listener throws after partial JE write:** e.g. the GR/IR debit line is written but the AP credit line fails. Confirm the listener wraps the full JE write in a single DB transaction; a partial (unbalanced) JE is never committed.
- [ ] **Event replayed after the listener already succeeded:** the second execution is a no-op (idempotent on `eventId`); no duplicate JE or stock entry, no double-reduced bill balance.
- [ ] **Bill with zero price-variance:** no spurious 5210 line posted when billed price exactly equals receipt cost.
- [ ] **Return that references a GRN line spanning both a matched (2111) and accrual-only (2121) source:** the AP debit correctly reverses the SAME control account the original receipt credited for that specific line, not a blanket assumption.
- [ ] **Reversal chains** (e.g. payment reversed, then the underlying bill voided) process in the correct order; voiding a bill with an active (non-reversed) payment allocation is blocked with a clear message, not allowed to silently orphan the payment.
- [ ] **Void payload / event size:** large multi-line documents (many landed-cost components, many return lines) do not truncate or drop components during event processing.

## 4. Cross-module / integration — three-way tie-out

Run this tie-out for BOTH Asala suppliers, as of the same date, after a representative mix of bills/payments/returns:

- [ ] **Tie-out 1 (AP subledger ↔ GL):** Σ open bill balances for the supplier (from `/purchase/invoices` filtered by supplier) = supplier's party-tagged 2111 balance (from `/accounting/general-ledger`).
- [ ] **Tie-out 2 (AP aging ↔ AP subledger):** the supplier's total row in `/purchase` AP aging (09) = Σ open bill balances from Tie-out 1.
- [ ] **Tie-out 3 (Balance Sheet ↔ GL):** the AP line on the Balance Sheet (Current Liabilities) as of the same date = total 2111 GL balance = grand total of Tie-out 1 summed across both suppliers.
- [ ] **All three numbers match exactly** (to the fils). Any mismatch is CRITICAL — it means a posting bypassed the subledger or an event silently failed.
- [ ] **Inventory tie-out:** item on-hand value (qty × WAC) for a representative item = the portion of the 1141 GL balance attributable to that item's stock movements (spot-check, not full reconciliation).
- [ ] **P&L tie-out:** if a purchase return or PPV posted in the period, confirm the P&L reflects the COGS/variance effect correctly (5210 line appears in the relevant expense section).
- [ ] **Drill-down round-trip:** from a GL journal entry sourced from a purchase event, navigate to the source document (bill/GRN/payment/return); from that source document, navigate back to the GL entry. Both directions resolve without a broken link.

## 5. Known gaps (from recon — verify or track)

- **EventEmitter is not transactional across process boundaries** — NestJS `EventEmitter` fires in-process; if the listener throws after partial writes and there is no persistent event log, the partial JE or stock entry may never self-correct. Confirm whether a dead-letter queue exists for purchase events; if not, a listener failure leaves the GL/AP/stock in an inconsistent state with no automated recovery path. **CRITICAL**.
- **Period-end unrealized-FX AP revaluation is deferred** — not applicable to Asala (KWD-only, FX fail-loud), but flag for any future foreign-currency supplier tenant. **LOW for this persona**.
- **FIFO auto-allocation on payments is deferred** — clerk allocates manually; no systemic risk, just a UX gap already logged in 07. **LOW**.
- **Reversing an already-applied advance is deferred** — already logged in 07; re-verify here that the GL stays balanced when this path is deliberately NOT exercised (i.e. the block itself doesn't leave a dangling JE). **MEDIUM**.
- **Confirm `purchase-accounting.listener.ts` and the inventory stock-deduction listener are both registered** on every relevant event (GRN confirmed/voided, invoice confirmed/voided, landed cost, return, payment) — an unregistered listener silently never fires. **MEDIUM** (operational, not a code bug, but easy to miss in review).

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
