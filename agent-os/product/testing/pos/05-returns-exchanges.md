# POS — Returns & Exchanges Testing Checklist

> Persona: **Counter cashier / shift supervisor.** A customer walks up with a bag, receipt in hand (or not), and wants their money back. You are five customers deep. Ask at every screen: **"what's the dumbest thing a cashier could do here, at speed, with a customer waiting?"**

- **Route(s):** Return flow from `/pos` (initiated by looking up original transaction then selecting Return)
- **Feature dir:** `apps/web/src/app/[locale]/(pos)/pos/` — return flow components; back-office return history in `apps/web/src/features/pos-transactions/`
- **API:** `POST tenant/pos/transactions/:id/return`
- **Tables:** `pos_transactions` (`type=return`, `originalTransactionId`), `pos_transaction_lines` (negative qty on return), `pos_payments` (refund rows)
- **Depends on:** 01-register-session (open shift), 02-transaction-lifecycle (at least one completed transaction to return against).

## 0. Preconditions

- [ ] At least one completed sale transaction exists; know its transaction number, lines, quantities, and original prices.
- [ ] A second completed transaction available for partial-return testing (return one of multiple lines).
- [ ] A transaction available for testing the serial-tracked item return path.
- [ ] Both a cashier account and a manager/supervisor account available (some return paths require manager approval).
- [ ] Refund method options: know which tender types support refunds (cash refund, store credit).

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

### Locate original transaction

- [ ] **Search by transaction number** — cashier types the receipt/transaction number; the original sale loads with all lines and prices.
  - [ ] Unknown transaction number: clear "transaction not found" message; not a crash or empty screen.
  - [ ] Attempting to return against a voided transaction: blocked; clear message.
  - [ ] Attempting to return against another return transaction: blocked; you cannot return a return.
  - [ ] Loading state while fetching; not a frozen UI.

### No-receipt return

- [ ] **Return without receipt** — cashier selects "no receipt"; manager PIN required to proceed; refund is limited to store credit only (no cash refund without receipt per policy).
  - [ ] Manager PIN incorrect: rejected; cashier cannot proceed.
  - [ ] Store credit issued at item's current (not original) price? — confirm the policy is implemented consistently.

### Partial return

- [ ] **Partial return — select lines and quantities** — cashier picks which lines to return and enters quantities ≤ original sold; return transaction created with negative qty lines.
  - [ ] Returning qty > original sold on a line: rejected client- and server-side; cumulative returned quantity ceiling enforced.
  - [ ] Returning 0 qty on a selected line: rejected or line is ignored; not added as a zero-qty line.
  - [ ] All lines returned at once: equivalent to a full return; original transaction marked appropriately.
- [ ] **Second partial return on the same original transaction** — cashier returns the remaining unreturned qty; system shows only the returnable balance, not the original full qty again.
  - [ ] Attempting to return more than the remaining returnable qty: blocked.

### Return price

- [ ] **Return uses original sale price** — the unit price on the return line equals the unit price at the time of original sale, not the current list price; verify by checking `pos_transaction_lines.unitPrice` on the return transaction against the original.
  - [ ] If the original sale had a discount: the refund is for the discounted price the customer actually paid, not the list price.

### Refund method

- [ ] **Cash refund** — refund amount decreases `expectedCash` on the current shift; correct amount displayed to cashier before confirmation.
- [ ] **Store credit refund** — store credit record created for the customer; balance immediately available; customer notified.
- [ ] **Original payment method refund** — if policy requires refund to the original tender (e.g. card-back-to-card): cashier is guided to select the correct method; over-refund to a different method blocked or flagged.
- [ ] **Refund amount matches returned line totals** — `Σ(|returnLine.lineTotal|) = refundAmount`; no under- or over-refund.

### Serial-tracked item return

- [ ] **Serial number on return** — cashier must enter or scan the serial number; the system validates it matches the serial sold in the original transaction.
  - [ ] Wrong serial number: rejected with a clear message naming the expected serial.
  - [ ] Serial from a different transaction: rejected.
- [ ] Stock restoration includes the specific serial number back to available inventory.

### Exchange (return + new sale)

- [ ] **Exchange flow** — cashier completes the return, then immediately starts a new sale for the replacement item; the two transactions are distinct records but can be linked on the receipt.
  - [ ] Exchange where new item is more expensive: cashier charged the difference; correct.
  - [ ] Exchange where new item is cheaper: customer refunded the difference; correct.
  - [ ] The two events (`pos.return.completed` and `pos.transaction.completed`) are emitted in the correct order to avoid inventory double-count or GL imbalance.

### Return in back-office

- [ ] Return transactions appear in the back-office list filtered by `type=return`; the `originalTransactionId` link resolves to the original sale.
- [ ] Return transactions are included in shift Z-report under a dedicated "Returns" line, not counted as negative sales in revenue.

## 2. Domain invariants (cash / GL / stock)

- [ ] **`type=return` requires `originalTransactionId` pointing to a `completed` transaction:** no return transaction exists without a valid, completed original; the server enforces this on `POST :id/return`.
- [ ] **Cumulative returned qty per original line ≤ original sold qty:** the sum of all return line quantities across all return transactions for a given original line cannot exceed the original qty; this ceiling is service-enforced (verify a DB constraint or a SELECT-FOR-UPDATE check exists).
- [ ] **Return line uses original sale price:** `pos_transaction_lines.unitPrice` on the return transaction equals `unitPrice` from the original sale line; no re-pricing at current list price (unless no-receipt policy differs — confirm that case too).
- [ ] **Cash refund decreases expectedCash on the shift:** every completed cash return decreases the shift's `expectedCash` field by the cash refund amount; a return cannot increase `expectedCash`.
- [ ] **Store credit return creates a credit record:** a store credit refund creates (or increments) a customer credit record atomically with the return completion; failure to create the credit must roll back the return or land in a dead-letter queue — not silently complete the return without issuing the credit.
- [ ] **Serial on return matches original:** for serial-tracked items, the returned serial number must match the serial number recorded on the original sale line; mismatched serials are rejected server-side.
- [ ] **`pos.return.completed` event triggers stock restoration + accounting reversal:** every completed return fires this event; the inventory listener restores stock for each returned line; the accounting listener posts the reversal JE (DR Inventory, CR COGS reversal + DR Revenue, CR Accounts Receivable/Cash).

## 3. Edge cases & defensive UX — "the dumbest thing a cashier could do here"

- [ ] **Return against a transaction from a different shift:** should be allowed (customer returns next day); confirm there is no shift-scope lock on the originalTransactionId.
- [ ] **Return against a transaction from a different cashier:** should be allowed; the return is recorded under the current cashier's shift.
- [ ] **Cashier enters return qty as a positive number:** the return line internally uses negative qty; if the UI shows a positive input the system must negate it internally without confusing the cashier with negative numbers.
- [ ] **Double-tap confirm on return:** only one return transaction created; button debounced; second tap returns the existing return record.
- [ ] **Return the same line twice simultaneously from two cashier stations:** second return is blocked by the cumulative ceiling check; race condition handled (SELECT-FOR-UPDATE or equivalent).
- [ ] **Exchange: new sale fails after return completes:** return is committed; the new sale fails; customer is left with a refund but no replacement item. The system must surface this clearly — not a silent partial exchange.
- [ ] **No-receipt return for a high-value item:** manager PIN required; the UI must not allow bypassing by backing out and re-entering the flow without the PIN.
- [ ] **RTL (Arabic):** return reason field, original transaction lookup, and refund amount all render correctly under RTL.
- [ ] **Return of a free item (zero price):** line total = 0; refund = 0; no division-by-zero or crash; stock is still restored.

## 4. Cross-module / integration

- [ ] `pos.return.completed` → Accounting listener posts: DR 4110 (revenue reversal) → CR 1112 (cash) or CR credit liability; DR 1141 (inventory restored) → CR 5100 (COGS reversal); both JEs are balanced.
- [ ] Stock levels for each returned item increase by the returned quantity immediately after the event is processed; on-hand matches the sum of ledger entries.
- [ ] The original sale transaction's receipt notes how many items have been returned (e.g. "2 of 3 units returned") — verify the receipt model reflects partial returns.
- [ ] Return transaction appears in Accounting's AR subledger (if the original was a credit sale) or in the Cash account (if cash sale) with the correct sign.
- [ ] Store credit issued appears in the customer record in the CRM/accounting layer; the customer can redeem it in the next sale.

## 5. Known gaps (from recon — verify or track)

- **Partial-return ceiling is service-only** — there is no DB constraint preventing two simultaneous return requests from each returning the full original qty. A `SELECT-FOR-UPDATE` or similar locking must exist in the service; confirm it does. **CRITICAL** if missing — double returns are a direct financial loss.
- **No-receipt return UI reachability** — the no-receipt flow exists in the spec but whether the UI surface is reachable on the live POS screen is unconfirmed. If the button is absent, cashiers have no recourse for customers without receipts. **HIGH** UX gap.
- **Exchange event ordering** — `pos.return.completed` and `pos.transaction.completed` are both emitted in an exchange; if the sale event fires before the return event is processed, inventory may transiently go negative or COGS may double-count. Confirm the emission order and whether both events are in the same async queue. **MEDIUM**.
- **Store credit balance restoration on void of a return** — if a return transaction is voided (edge case), does the store credit issued by that return get reversed? Unclear. **MEDIUM**.
- **Return reason mandatory / optional** — whether a return reason is required (like a void reason) is unconfirmed; an optional free-text reason provides no audit value; consider making it a required dropdown. **LOW**.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
