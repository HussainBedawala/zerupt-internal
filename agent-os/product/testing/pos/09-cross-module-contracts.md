# POS — Cross-Module Contracts Testing Checklist

> Persona: **Shift supervisor / system auditor.** You are not using the POS screen — you are verifying that every POS event correctly rippled into the GL and inventory. You trust nothing until you have traced the trail from the POS record to the journal entry to the stock ledger. Ask at every step: **"if this listener silently threw an error, what would I see — and would I notice?"**

- **Route(s):** No dedicated UI for event contracts; verified via GL (Accounting module), stock levels (Inventory module), and server logs / dead-letter queue.
- **Feature dir:** `apps/api/src/accounting-events/listeners/pos.listener.ts` (primary listener file)
- **API (events only, no direct API calls):** `pos.transaction.completed`, `pos.return.completed`, `pos.void.completed`, `pos.shift.closed`
- **Tables (written by listeners):** `journal_entries`, `journal_entry_lines` (Accounting), `stock_ledger_entries`, `materialized_stock_levels` (Inventory)
- **Depends on:** 02-transaction-lifecycle, 05-returns-exchanges, 08-z-report-shift-close — all must be passing before cross-module contracts are verified.

## 0. Preconditions

- [ ] At least one completed sale, one completed return, one voided sale, and one closed shift exist in the dataset.
- [ ] The GL chart of accounts includes: 1112 (Cash), 1141 (Merchandise Inventory), 4110 (Sales Revenue), 5100 (Cost of Goods Sold), 6700 (Cash Over/Short), and a Bank account. Know the account codes for this tenant.
- [ ] Access to the GL journal entry list (Accounting module) and the stock ledger (Inventory module) for verification.
- [ ] If a dead-letter queue or event failure log is available, know how to access it.

## 1. Functional — actions & states

For each event: verify the listener ran, the downstream records exist, and the amounts are correct.

### `pos.transaction.completed` → Accounting

- [ ] **Revenue JE posted:** `DR 1112 (Cash or card receivable per tender type) → CR 4110 (Sales Revenue)` for the net sale amount. Verify the JE is in the GL and `DR total = CR total`.
- [ ] **COGS JE posted per line:** `DR 5100 (COGS) → CR 1141 (Merchandise Inventory)` at `costAtSale × qty` for each line. Verify each line generates its own JE line, not a single rolled-up entry (to preserve traceability).
- [ ] **Tax JE posted (if applicable):** tax collected is separated into a tax liability account; it does not inflate revenue. The tax account code and the amount match the `taxTotal` on the transaction.
- [ ] **Discount JE posted (if applicable):** if a dedicated sales discount account (e.g. 4190) is configured, the discount is debited there; gross revenue is credited to 4110 in full and 4190 absorbs the discount. If no discount account, the net revenue is credited to 4110.
- [ ] **JE references the source document:** every `journal_entries` row has a `sourceDocumentType = 'pos_transaction'` and `sourceDocumentId = pos_transactions.id`; drill-down from accounting to POS resolves correctly.
- [ ] **JE `eventId` uniqueness:** if the same `pos.transaction.completed` event is replayed (at-least-once delivery), the listener is idempotent; no duplicate JE is created. Confirm by checking `journal_entries` for duplicate `eventId` rows.

### `pos.transaction.completed` → Inventory

- [ ] **Stock deduction per line:** each sale line generates a `SALE` entry in `stock_ledger_entries` with `quantity = −(line qty)` and `unitCost = costAtSale`; the sum matches the line quantity.
- [ ] **`materialized_stock_levels` updated:** on-hand for each item/warehouse combination decreases by the sold quantity; verify by reading stock levels before and after a known sale.
- [ ] **Serial number recorded:** for serial-tracked items, the `stock_ledger_entries` row has a non-null `serialNumberId` matching the serial sold.

### `pos.return.completed` → Accounting & Inventory

- [ ] **Revenue reversal JE:** `DR 4110 → CR 1112 (or credit liability)` for the refunded amount; balanced.
- [ ] **COGS reversal JE:** `DR 1141 → CR 5100` at the original sale cost per line; inventory is restored at the original cost, not the current WAC.
- [ ] **Stock restored:** `stock_ledger_entries` gains a `SALE_RETURN` row with positive quantity; on-hand increases accordingly.
- [ ] **Serial number on return ledger entry:** serial-tracked returned item's ledger entry carries the same `serialNumberId` as the original sale entry.

### `pos.void.completed` → Accounting & Inventory

- [ ] **Full reversal JE:** both the revenue JE and the COGS JE from the original completion are reversed; the GL returns to the pre-sale state for this transaction.
- [ ] **Stock restored:** `SALE_RETURN` or reversal entry in `stock_ledger_entries`; on-hand restored to pre-sale quantity.
- [ ] **Cash refund if applicable:** if the original tender was cash, the expectedCash on the shift is reduced (handled at the shift level, not the JE level — confirm the correct account is adjusted).

### `pos.shift.closed` → Accounting

- [ ] **Over/short JE:** if `cashOverShort ≠ 0`, a JE posts: shortage → `DR 6700 → CR 1112`; overage → `DR 1112 → CR 6700`; zero difference → no JE posted (not a zero-amount entry).
- [ ] **Bank deposit JE:** `DR Bank → CR 1112` for the actual cash counted; the Bank account code must be the one configured for this register or tenant, not hardcoded.
- [ ] Both JEs reference `sourceDocumentType = 'pos_shift'` and the shift ID.

## 2. Domain invariants (cash / GL / stock)

- [ ] **Every completed event → balanced JE (`DR total = CR total`):** query `journal_entry_lines` grouped by `journalEntryId`; no entry has `Σ DR ≠ Σ CR` for any POS-sourced entry.
- [ ] **Every sale line → one stock ledger deduction:** the count of `SALE`-type `stock_ledger_entries` rows for a given transaction equals the number of completed sale lines; no line is silently skipped.
- [ ] **Return → stock increase + accounting reversal:** every `pos.return.completed` event produces both a positive `SALE_RETURN` ledger entry and a balancing reversal JE; neither half can exist without the other.
- [ ] **`eventId` uniqueness (idempotent listener):** across all `journal_entries` rows sourced from POS events, no `eventId` appears more than once; duplicate event delivery does not create duplicate JEs.
- [ ] **POS listener never writes JEs or stock entries directly (no bypass of event system):** the POS service itself has no imports of `JournalEntryService` or `StockLedgerService`; all writes to those tables flow exclusively through `pos.listener.ts` and the inventory event listener; verify by grepping the POS module for direct cross-module service injections.
- [ ] **Events emitted after local persist:** `pos.transaction.completed` is emitted only after the `pos_transactions` row is committed to the DB; if the event fires before the commit and the listener reads the transaction back, it may find stale or missing data. Confirm the event emission point in the service.

## 3. Edge cases & defensive UX — "the dumbest thing a cashier could do here"

- [ ] **Listener throws after partial JE write:** the revenue JE line is written but the COGS JE line fails; the journal entry is half-written. Confirm the listener wraps both writes in a single DB transaction; a partial JE is never committed.
- [ ] **Event replayed after listener already succeeded:** the second execution is a no-op (idempotent on `eventId`); no duplicate JE or stock entry.
- [ ] **Sale with zero-cost item (`costAtSale = 0`):** COGS JE has amount 0; no division-by-zero; no crash; a zero-COGS JE is still posted for the item so the inventory GL account is not out of sync.
- [ ] **Sale with many lines (20+):** the listener processes all lines in one invocation; no line is silently dropped due to a loop error or timeout.
- [ ] **`pos.shift.closed` event with `cashOverShort = 0`:** no over/short JE is posted; the bank deposit JE is still posted; confirm neither JE is a zero-amount entry.
- [ ] **Void payload size:** `pos.void.completed` event payload carries the full `originalTransaction` object; for a large transaction, this payload may exceed message size limits. Confirm there is no payload truncation; alternatively confirm the listener re-fetches the transaction by ID instead of relying on the payload.

## 4. Cross-module / integration

- [ ] **GL trial balance agrees:** after a shift with known cash sales, returns, and voids, the GL trial balance for accounts 1112, 1141, 4110, 5100, and 6700 reflects the net effect of all completed POS events; compute manually and compare.
- [ ] **Inventory on-hand agrees:** `Σ stock_ledger_entries.quantity` for each item sold in the shift equals the pre-shift on-hand minus net units sold; verify `materialized_stock_levels` matches.
- [ ] **Drill-down from GL to POS:** clicking the source document link on a journal entry navigates to the correct POS transaction record; no broken links.
- [ ] **Drill-down from POS to GL:** from a completed POS transaction in the back-office, a link to the GL journal entries for that transaction resolves correctly.

## 5. Known gaps (from recon — verify or track)

- **EventEmitter is not transactional** — NestJS `EventEmitter` fires in-process; if the listener throws after partial writes and there is no at-least-once delivery guarantee, the partial JE or stock entry may never be corrected. Confirm whether a dead-letter queue or a persistent event log exists; if not, a listener failure leaves the GL and/or inventory in an inconsistent state with no automated recovery path. **CRITICAL**.
- **No compensation defined for partial JE write** — if the listener's DB transaction rolls back after posting the revenue JE but before the COGS JE, the listener must retry the full set; confirm the retry replays from a safe checkpoint and does not double-post the revenue JE. **HIGH**.
- **`pos.void.completed` payload carries full `originalTransaction` object** — for a large transaction (many lines), this payload may be very large and could exceed in-process message size limits or cause serialization delays. Consider the listener re-fetching the transaction by ID on replay. **MEDIUM**.
- **POS listener file path confirmation** — `apps/api/src/accounting-events/listeners/pos.listener.ts` is the assumed path; confirm it exists and is registered in the `AccountingEventsModule`; an unregistered listener silently never fires. **MEDIUM** (operational, not code bug).
- **Inventory listener location** — the inventory stock-deduction listener may be in a separate file from the accounting listener; confirm both are registered and both run on `pos.transaction.completed`. **MEDIUM**.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
