# POS — Transaction Lifecycle Testing Checklist

> Persona: **Counter cashier.** You are ringing up customers one after another. You add items, adjust quantities, park a sale, recall it, take payment, and occasionally void or return. Ask at every screen: **"what's the dumbest thing a cashier could do here, at speed, with a customer waiting?"**

- **Route(s):** `/pos` (cart), back-office `/pos-transactions` (confirm feature path: `apps/web/src/features/pos-transactions/`)
- **Feature dir:** `apps/web/src/app/[locale]/(pos)/pos/` (cart); `apps/web/src/features/pos-transactions/` (back-office list — confirm path exists)
- **API:** `POST tenant/pos/transactions`, `GET tenant/pos/transactions`, `GET tenant/pos/transactions/:id`, `POST tenant/pos/transactions/:id/lines`, `PATCH tenant/pos/transactions/:id/lines/:lineId`, `PATCH tenant/pos/transactions/:id/lines/:lineId/price`, `DELETE tenant/pos/transactions/:id/lines/:lineId`, `POST tenant/pos/transactions/:id/hold`, `POST tenant/pos/transactions/:id/recall`, `POST tenant/pos/transactions/:id/pay`, `POST tenant/pos/transactions/:id/void`, `GET tenant/pos/transactions/:id/receipt`, `POST tenant/pos/transactions/:id/return`, `POST tenant/pos/transactions/:id/receipt/reprint`, `GET tenant/pos/shifts/:shiftId/held`
- **Tables:** `pos_transactions`, `pos_transaction_lines`, `pos_payments`, `pos_receipts`
- **Depends on:** 01-register-session (open shift required), inventory items in active status.

## 0. Preconditions

- [ ] An open shift exists on a register; logged in as the cashier for that shift.
- [ ] At least one active item exists; at least one serial-tracked item for serial-qty tests.
- [ ] Know the tenant currency and decimal precision (e.g. KWD = 3 dp).

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

### Start transaction & add lines

- [ ] **New transaction** (`POST tenant/pos/transactions`) — opening the POS cart creates (or implicitly starts) a transaction tied to the active shift.
  - [ ] Loading state: cart shell renders; not a blank screen while the transaction is initializing.
  - [ ] Error state: if shift is not open, the cashier is redirected with a clear message, not dropped into a broken cart.
- [ ] **Add item by barcode scan** (`POST :id/lines`) — scanning a barcode adds the correct item and quantity; price, tax, and line total compute correctly.
  - [ ] Scanning an unknown barcode shows a user-friendly "item not found" message, not a crash.
  - [ ] Scanning a deactivated or draft item shows a clear block message.
  - [ ] Rapid back-to-back scans of the same barcode increment quantity rather than opening duplicate lines (debounced or merged by the client).
- [ ] **Add item by search** — typing a partial name or SKU returns filtered results; selecting adds the line.
- [ ] **Edit line quantity** (`PATCH :id/lines/:lineId`) — increasing / decreasing quantity updates line total and grand total immediately.
  - [ ] Setting qty = 0: either removes the line or prompts for removal; never saves a zero-qty line.
  - [ ] Setting qty to a negative value: rejected client- and server-side.
  - [ ] Serial-tracked item: qty is locked to 1; cashier cannot type 2; server also rejects qty ≠ 1.
- [ ] **Price override** (`PATCH :id/lines/:lineId/price`) — cashier with override permission changes line price; `priceOverride=true` and `priceOverrideById` are set; price change reflected in totals.
  - [ ] Cashier WITHOUT override permission: override button is hidden or disabled; server rejects the PATCH with 403.
- [ ] **Remove line** (`DELETE :id/lines/:lineId`) — line removed; totals recalculate; last line removal leaves the cart in a valid empty state (not a crash).

### Hold & recall

- [ ] **Hold transaction** (`POST :id/hold`) — current cart is parked; cashier can start a new transaction immediately.
  - [ ] Hold succeeds even with payment partially entered (the payment is discarded on hold, amount refunded to customer is surfaced).
  - [ ] Limit: if 10 held transactions already exist on this register, hold is blocked with a clear message; cashier must recall one first.
- [ ] **Recall held transaction** (`POST :id/recall`, `GET tenant/pos/shifts/:shiftId/held`) — held list shows all parked transactions with customer name (if set) and total; selecting one restores the cart.
  - [ ] Recalling a held transaction that another cashier simultaneously recalled: second recall is rejected cleanly.
- [ ] **Held list** (`GET :shiftId/held`) — empty state (no held transactions) is clear.

### Pay & complete

- [ ] **Pay** (`POST :id/pay`) — cashier selects payment method(s), enters amounts, confirms; transaction moves to `completed`.
  - [ ] Loading state while payment is being processed; button disabled to prevent double-submit.
  - [ ] On success: receipt screen / QR shown; cart resets for the next customer.
  - [ ] On error (e.g. payment gateway timeout): transaction remains in `pending` or `payment-pending`; cashier can retry without duplicating the charge.
  - [ ] `completedAt` and `transactionNumber` are set on completion.
- [ ] **Void** (`POST :id/void`) — cashier (with permission) voids a completed transaction; provides a void reason.
  - [ ] Void reason is mandatory; blank reason rejected.
  - [ ] `voidedAt`, `voidedById`, and `voidReason` are all set on the voided record.
  - [ ] A voided transaction is immutable after voiding — no further edits or second void.
  - [ ] Void triggers stock restoration and accounting reversal (verified in 09-cross-module-contracts).
- [ ] **Receipt** (`GET :id/receipt`) — accessible immediately after completion; all line items, totals, payment breakdown, and shift/cashier info present.
- [ ] **Reprint** (`POST :id/receipt/reprint`) — `reprintCount` increments; REPRINT header visible on reprinted output.
- [ ] **Return** (`POST :id/return`) — covered in detail in 05-returns-exchanges; smoke-test here that the endpoint exists and returns the correct structure.

### Back-office transaction list

- [ ] **List** (`GET tenant/pos/transactions`) — filterable by shift, date range, status (pending, completed, voided, held, return); cashier can search by transaction number or customer.
- [ ] **Transaction detail** (`GET :id`) — all fields present: lines, payments, receipt link, shift reference, cashier.
- [ ] Pagination stable; no duplicate rows.

## 2. Domain invariants (cash / GL / stock)

- [ ] **Grand total identity:** `grandTotal = subtotal + taxTotal - discountTotal` for every transaction; verify by fetching the record after completion and computing manually.
- [ ] **Line total identity:** `lineTotal = (qty × unitPrice) - discountAmount + taxAmount` for every line; spot-check multiple lines.
- [ ] **Completed transactions are immutable:** a `PATCH` or `DELETE` to any field of a `status=completed` transaction must be rejected by the server (409 or 403); `completedAt` and `transactionNumber` are non-null and cannot be changed.
- [ ] **`transactionNumber` is unique per tenant:** no two completed transactions share the same `transactionNumber`; confirm a unique index exists in the DB.
- [ ] **`clientId` uniqueness (idempotent replay):** `clientId` has a partial unique index on completed transactions; a replay of the same client-generated ID returns the existing record, not a duplicate.
- [ ] **Void fields are complete:** `voidedAt`, `voidedById`, and `voidReason` are all non-null on a voided transaction; no partial void state.
- [ ] **`costAtSale ≥ 0` (DB CHECK constraint):** no sale line has a negative cost; zero cost is allowed only for genuinely free items and should be flagged for review (not silently accepted on items with a real WAC cost).
- [ ] **Serial-tracked line qty = 1:** a transaction line for a serial-tracked item cannot have `qty ≠ 1`; the DB check or service enforces this and the specific serial number must be recorded.
- [ ] **Held transactions are not revenue:** a transaction in `held` status must not appear in shift totals, Z-reports, or accounting postings; only `completed` status counts.

## 3. Edge cases & defensive UX — "the dumbest thing a cashier could do here"

- [ ] **Rapid double-tap Pay:** cashier taps pay twice quickly — only one completion is processed; the second returns the existing completed record or is debounced client-side.
- [ ] **Add item with zero stock (negative stock disabled):** cashier scans an out-of-stock item — blocked at line-add with clear stock message; not added silently.
- [ ] **Change qty to a very large number:** cashier accidentally types 9999 — total is displayed clearly; server accepts it if stock allows (or blocks if over-stock).
- [ ] **Empty cart payment:** cashier clicks Pay on a cart with no lines — rejected with a clear message; not a 500.
- [ ] **Hold when shift is closing:** hold attempt after shift enters `closing` status is rejected; cashier told to recall and complete or void.
- [ ] **Stale cart:** cashier leaves the POS screen open for hours, then tries to add a line to a transaction that another session already completed or voided — server returns a conflict; the UI surfacess this clearly instead of corrupting the record.
- [ ] **Price override to negative price:** rejected client- and server-side.
- [ ] **Price override to zero:** allowed only if explicitly permitted; confirm the permission check exists.
- [ ] **Delete the last line then immediately pay:** cart is empty; Pay is either disabled or returns a clear error, not a zero-total completion.
- [ ] **RTL (Arabic):** item names, amounts, totals, and payment breakdown all render correctly under RTL; transaction numbers remain LTR.
- [ ] **Line with tax and discount:** ensure `lineTotal` is calculated in the correct order (discount before or after tax per tenant config) — not hardcoded.

## 4. Cross-module / integration

- [ ] Completing a transaction triggers `pos.transaction.completed` → GL listener posts DR 1112 (cash/bank) → CR 4110 (sales revenue) + DR 5100 (COGS) → CR 1141 (inventory) per line (see 09-cross-module-contracts).
- [ ] Completing a transaction deducts stock from `materialized_stock_levels` for each line; on-hand matches before/after difference.
- [ ] Voiding a transaction triggers `pos.void.completed` → full GL reversal + stock restoration.
- [ ] Transaction appears in back-office reports (shift summary, daily sales) immediately after completion.
- [ ] Receipt token is minted in the admin DB atomically with completion; public URL resolves (see 07-receipt-model).

## 5. Known gaps (from recon — verify or track)

- **`grandTotal` may be service-only with no DB check backstop** — if the stored total drifts from the sum of lines (e.g. due to a bug in tax rounding), there is no DB constraint to catch it. Verify whether a DB-level check or a reconciliation job exists. **HIGH** financial integrity risk.
- **`costAtSale = 0` on items with real WAC cost** — the DB `CHECK` only enforces `≥ 0`; a zero cost on a non-free item would understate COGS. Confirm service always reads WAC from stock ledger at sale time and never defaults to 0. **HIGH**.
- **Back-office feature path unconfirmed** — `apps/web/src/features/pos-transactions/` may not exist at this path; confirm before testing. **LOW** (navigation only).
- **Held transaction limit (10 per register) is service-enforced only** — no DB constraint; a concurrent spike could exceed the limit. **LOW** for MVP single-cashier setups; **MEDIUM** for high-traffic stores.
- **`clientId` partial unique index scope** — confirm the index covers the correct status subset (completed only) so that a held transaction's `clientId` does not block a re-use if the held tx is abandoned. **MEDIUM**.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
