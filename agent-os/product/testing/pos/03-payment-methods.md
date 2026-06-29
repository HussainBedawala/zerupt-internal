# POS — Payment Methods Testing Checklist

> Persona: **Counter cashier.** You are taking money from customers as fast as possible. You must accept cash, card, or a mix; give the right change; and never accidentally overcharge or double-charge. Ask at every screen: **"what's the dumbest thing a cashier could do here, at speed, with a customer waiting?"**

- **Route(s):** Payment panel within `/pos` cart
- **Feature dir:** `apps/web/src/app/[locale]/(pos)/pos/` — payment panel component(s)
- **API:** `POST tenant/pos/transactions/:id/pay`, `GET tenant/pos/tender-types`, `POST tenant/pos/tender-types`
- **Tables:** `pos_payments`, `pos_tender_types`
- **Depends on:** 01-register-session (open shift), 02-transaction-lifecycle (transaction in pending status with at least one line).

## 0. Preconditions

- [ ] At least one transaction in `pending` status exists in the active shift.
- [ ] Tender types configured: at minimum cash; additionally card, store credit, gift card if testing those paths.
- [ ] Know the transaction grand total and the tenant currency / precision.
- [ ] Foreign-currency test: at least one foreign-currency tender type configured with an exchange rate, if testing that path.

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

### Tender type list

- [ ] **Tender types load** (`GET tenant/pos/tender-types`) — all active tender types displayed in the payment panel with name and icon/label.
  - [ ] Empty state (no tender types configured): cashier sees a clear message, not a broken panel.
  - [ ] Loading state: panel skeleton shown while fetching.
- [ ] **Create tender type** (`POST tenant/pos/tender-types`) — admin adds a new tender type (e.g. "KNET", "Store Credit"); it appears immediately in the payment panel on next open.

### Cash payment

- [ ] **Cash — exact amount:** cashier enters the exact grand total; change due = 0; pay confirms; change display shows "KD 0.000" not blank.
- [ ] **Cash — overpayment (customer hands more):** cashier enters more than the total; change due is calculated correctly and displayed prominently before confirmation; `changeGiven` stored on the payment record.
- [ ] **Cash — underpayment:** partial cash entered; grand total not yet met; Pay button remains disabled or shows "remaining" amount clearly; system does not allow completion until total is covered.
- [ ] **Split cash:** multiple cash tender lines sum to ≥ grand total; change computed correctly against the actual cash tendered, not the first entry alone.
- [ ] **KWD 5-fils rounding:** verify the server's rounding result (stored in `pos_payments.amount`) matches what the client displayed to the cashier — mismatch between client-computed and server-computed round amounts must surface as a reconciliation warning, not a silent discrepancy.

### Card payment

- [ ] **Card — exact amount:** cashier enters the grand total as card; Pay confirms; no change given (changeGiven = 0 or null on non-cash tender).
- [ ] **Card — partial payment then remaining as cash:** card for part of total, then cash for the rest; sum meets grand total; change only computed on the cash portion.
- [ ] **Card — reference number:** card payment requires a reference/approval code; empty reference rejected client- and server-side with a clear message.
- [ ] **Card — overpayment attempt:** cashier tries to enter more than the remaining balance on a card tender — rejected or capped; `changeGiven` must be 0 on non-cash tenders.
- [ ] **Card — change given = 0:** no change popup or change display for card payments.

### Store credit & gift card

- [ ] **Store credit:** balance checked before apply; if balance < remaining total, partial store credit allowed; remaining covered by another tender.
- [ ] **Store credit — balance exhausted mid-payment:** clear message; cashier prompted to add another tender for the remainder.
- [ ] **Gift card:** similar to store credit; balance validation; partial redemption supported.
- [ ] **Void of transaction with store credit / gift card payment:** balance is restored atomically; verify the restoration is service-enforced, not just a UI label.

### Foreign currency

- [ ] **Foreign-currency tender:** cashier selects a foreign-currency tender type; exchange rate is displayed and locked for this transaction; `exchangeRate` stored on the payment record (non-null).
- [ ] **Exchange rate missing:** if the exchange rate is not configured for the selected foreign currency, the tender type is either disabled or the system prompts for a manual rate; not a silent null.

### Multi-tender completion

- [ ] **Two tenders that together exceed the total:** excess is applied as change against the last cash tender; total `Σ(amount) - changeGiven ≥ grandTotal` holds.
- [ ] **All non-cash tenders, total < grand total:** Pay remains blocked; the remaining balance is shown.
- [ ] **Mixing cash and non-cash:** change calculated correctly; non-cash tenders capped at their line amount.

### Payment panel UX

- [ ] **Pay button disabled while payment request is in flight** — no double-submit; a second tap does not create a duplicate payment record.
- [ ] **Error on pay** (e.g. network timeout): transaction remains in `pending`; cashier can retry; no orphan payment record is created in the DB.
- [ ] **Cancel payment** — cashier can back out of the payment panel and return to the cart without losing line items or totals.

## 2. Domain invariants (cash / GL / stock)

- [ ] **Σ(payment amounts) − changeGiven ≥ grandTotal for every completed transaction:** no completed transaction has been underpaid; verify on a sample of completed records from the shift.
- [ ] **No overpayment on non-cash tenders:** `changeGiven = 0` (or null) for every `pos_payments` row where the tender type is card, store credit, or gift card; overpayment on non-cash is a data error.
- [ ] **Card reference non-empty on card payments:** every card-type payment row has a non-empty `referenceNumber`; null or blank reference is a compliance gap.
- [ ] **`changeGiven` on cash only:** `changeGiven > 0` exists only on rows with a cash tender type; non-cash rows must have `changeGiven = 0` or null.
- [ ] **Foreign-currency `exchangeRate` non-null:** every payment row for a foreign-currency tender has a non-null, positive `exchangeRate`; null exchange rate on a foreign-currency payment corrupts the GL conversion.
- [ ] **KWD rounding is applied on cash only:** fractional fils rounding (to 5-fils) is applied to cash tenders only; card and non-cash tenders store the exact amount without rounding.
- [ ] **Payment records are immutable post-completion:** no `PATCH` or `DELETE` endpoint exists (or succeeds) on `pos_payments` rows after the parent transaction is `completed`; only void (which creates a reversal, not a mutation) is permitted.

## 3. Edge cases & defensive UX — "the dumbest thing a cashier could do here"

- [ ] **Cashier enters amount in wrong field** (e.g. types card amount into cash field, giving change): UI layout should make it unmistakably clear which field is which; confirm change due is highlighted prominently before cashier confirms.
- [ ] **Cashier forgets to enter a reference for card:** Pay is disabled or the field auto-focuses with an inline error — cashier should not be able to proceed without it.
- [ ] **Cashier enters 0 in the cash field and tries to confirm:** partial cash of zero; system shows remaining balance, not "paid" confirmation.
- [ ] **Rapid re-tap of Pay after first attempt fails:** first failure leaves the transaction in `pending`; second attempt retries cleanly without creating a duplicate payment record.
- [ ] **Customer wants to split across three methods:** three tender lines; total must equal or exceed grand total; change computed on the cash portion only.
- [ ] **Amount precision:** cashier types an amount with more decimal places than the currency supports (e.g. 4 dp for KWD) — silently rounded or rejected with a clear message; never stored with excess precision.
- [ ] **Store credit balance on stale data:** if store credit balance changed between the time the cashier opened the payment panel and when they confirm — server validates the current balance, not the cached value; over-redemption is rejected.
- [ ] **RTL (Arabic):** amounts in payment panel render right-to-left with correct digit grouping; currency symbol placement follows locale convention.

## 4. Cross-module / integration

- [ ] Cash payment increments `expectedCash` on the shift; card payment does not (only cash tenders affect the expected cash count at close).
- [ ] `pos.transaction.completed` event fires after payment is stored; GL listener correctly maps the tender type to the appropriate debit account (cash account vs. card receivable vs. gift-card liability).
- [ ] Void of a cash transaction decrements `expectedCash` on the shift by the cash amount, and increments it by the `changeGiven` that was returned.
- [ ] Store credit payment creates a corresponding debit on the customer's credit account; verify via the accounting subledger or the credit record directly.

## 5. Known gaps (from recon — verify or track)

- **KWD 5-fils rounding parity** — the client may compute rounded change differently from the server (which recomputes and stores its own rounded value). A mismatch is displayed to the cashier as the correct change but stored as a different amount. This is a **HIGH** financial integrity gap; verify by comparing client-shown change vs. `pos_payments.changeGiven` in the DB for a cash sale with a total not divisible by 0.005.
- **Gift card / store credit balance restoration on void is service-only** — no DB constraint ensures the balance is restored when a transaction is voided; if the listener fails silently, the credit is permanently lost. Track as **HIGH**.
- **Gift card feature status unclear** — confirm whether gift cards are a live feature or stub; if stub, disable the tender type option in the UI to avoid cashier confusion. **MEDIUM**.
- **Foreign-currency GL conversion** — the accounting listener must use `exchangeRate` from the payment record, not a live rate at the time of the listener execution; confirm the payload carries the rate. **MEDIUM**.
- **No upper limit on manual exchange rate** — a cashier or admin could set an absurdly high exchange rate; no server-side range validation confirmed. **LOW**.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
