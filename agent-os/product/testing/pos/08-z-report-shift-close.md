# POS — Z-Report & Shift Close Testing Checklist

> Persona: **Shift supervisor / owner.** At end of shift you count the till, compare it to what the system says, and reconcile. Every discrepancy must have an explanation. Ask at every screen: **"what's the dumbest thing a supervisor could do here at end of shift, tired and in a hurry?"**

- **Route(s):** `/pos/shifts`
- **Feature dir:** `apps/web/src/app/[locale]/(pos)/pos/` — shift close flow; back-office shift list/detail
- **API:** `GET tenant/pos/shifts/:id/z-report`, `POST tenant/pos/shifts/:id/close`, `GET tenant/pos/shifts/:shiftId/movements`, `POST tenant/pos/shifts/:shiftId/movements`
- **Tables:** `pos_shifts` (`expectedCash`, `actualCash`, `cashOverShort`), `pos_cash_movements`
- **Depends on:** 01-register-session (shift in open status), 02-transaction-lifecycle (completed transactions in the shift), 03-payment-methods (cash sales to drive expectedCash).

## 0. Preconditions

- [ ] A shift with a known mix of transactions: at least one cash sale, one card sale, one cash return, one voided cash transaction, one pay-in, one pay-out.
- [ ] Know the opening float, cash sale totals, cash return totals, pay-in totals, pay-out totals from external records (to independently verify expectedCash).
- [ ] Supervisor account with shift-close permission available.
- [ ] No held transactions (confirm before attempting close; see 01-register-session).

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

### Z-Report

- [ ] **Z-Report loads** (`GET tenant/pos/shifts/:id/z-report`) — report includes: shift metadata (register, cashier, open/close times), transaction counts by type (sale, return, void), gross sales, total discounts, net sales, tax collected by rate, payment totals by tender type, pay-ins, pay-outs, opening float, expected cash, actual cash (blank until close), over/short.
  - [ ] Loading state: skeleton shown; not a blank screen.
  - [ ] Error state: clear message if report generation fails.
  - [ ] All monetary amounts at tenant precision (KWD = 3 dp); no hardcoded 2 dp.
- [ ] **Z-Report aggregates match individual records:** spot-check by summing `pos_payments.amount` (cash only, completed, not voided) + opening float − cash returns − pay-outs + pay-ins and comparing against `expectedCash`; the Z-report figure must match.
- [ ] **Void exclusion:** voided transactions are listed as a separate line ("Voids") in the Z-report; they are NOT counted in gross sales or expectedCash; confirm each voided transaction's cash payment is excluded from the cash total.
- [ ] **Return inclusion:** returns reduce gross sales and expectedCash (cash refunds decrease the till); return transactions appear as a negative line in the Z-report.
- [ ] **Print Z-Report:** printing the Z-report produces a formatted document matching the screen; no line is truncated.

### Pay-in / Pay-out (cash movements)

- [ ] **Pay-in** (`POST tenant/pos/shifts/:shiftId/movements` with type `pay_in`) — supervisor adds a cash deposit to the till mid-shift (e.g. change top-up); amount increases `expectedCash`; `approvedById` required; movement appears in the Z-report.
  - [ ] Amount = 0: rejected.
  - [ ] Negative amount: rejected.
  - [ ] Missing `approvedById`: server rejects.
- [ ] **Pay-out** (`POST :shiftId/movements` with type `pay_out`) — supervisor removes cash from the till (e.g. petty cash); amount decreases `expectedCash`; `approvedById` required.
  - [ ] Pay-out amount > current expectedCash: warn ("This exceeds the expected till balance") but allow (supervisor may have a valid reason); do not silently block.
- [ ] **Cash movements list** (`GET :shiftId/movements`) — all pay-ins and pay-outs for the shift listed chronologically; each shows amount, type, reason, approver, timestamp.

### Shift close

- [ ] **Close shift flow** — supervisor enters `actualCash` (physical till count); system shows `expectedCash`, `cashOverShort`, and a visual indicator (green for balanced, red for discrepancy).
  - [ ] `cashOverShort = actualCash − expectedCash`; positive = overage, negative = shortage; sign is correct and displayed clearly.
  - [ ] If `|cashOverShort|` exceeds the configured discrepancy threshold, a manager review / second approval is required before close is allowed.
  - [ ] Held transactions block close (see 01-register-session); confirm the block message here also lists the held transaction numbers.
  - [ ] `POST :id/close` sets `pos_shifts.status = 'completed'`; `closedAt`, `actualCash`, and `cashOverShort` are written atomically.
  - [ ] Close is idempotent: submitting a close request on a shift that is already `completed` returns the existing record (not a 500 or a corruption).
  - [ ] Closed shift is immutable: subsequent `PATCH` to `actualCash` or any shift field returns 409/403.
- [ ] **Discrepancy threshold configuration** — confirm where the threshold is set (tenant settings or register config) and that a change to the threshold takes effect on the next shift, not retroactively on past shifts.

### Post-close

- [ ] **Shift appears in back-office list** as `completed` immediately after close; Z-report is still accessible (read-only).
- [ ] **Cannot reopen a closed shift:** no API endpoint allows transitioning `completed → open`; confirm the attempt returns a clear error.
- [ ] **New shift can be opened on the same register** after the previous is closed.

## 2. Domain invariants (cash / GL / stock)

- [ ] **expectedCash formula holds for every closed shift:**
  `expectedCash = openingFloat + Σ(cashSalePayments) − Σ(cashRefundPayments) − Σ(payOuts) + Σ(payIns)`
  Verify by computing independently from raw table rows and comparing against `pos_shifts.expectedCash`.
- [ ] **Voided cash transactions excluded from expectedCash:** every `pos_payments` row for a voided transaction must be excluded from the expectedCash aggregation; if the payment row is not deleted (only the parent transaction is voided), the aggregation query must filter on `pos_transactions.status ≠ 'voided'`.
- [ ] **`cashOverShort = actualCash − expectedCash` exactly:** no rounding or truncation in the subtraction; the stored value equals the arithmetic result at tenant precision.
- [ ] **Closed shift is permanently immutable:** no row-level update is possible on a `completed` shift via any API endpoint; verify by attempting a direct PATCH.
- [ ] **Z-report aggregates match individual transaction records:** `Σ Z-report gross sales = Σ pos_transaction_lines.lineTotal` (excluding voided and return transactions); any mismatch indicates a query bug in the report generation.
- [ ] **Pay-in/out require `approvedById`:** every `pos_cash_movements` row has a non-null `approvedById`; no movement was recorded without supervisor approval.
- [ ] **`pos.shift.closed` event → accounting GL entries:** over/short posts to account 6700 (if shortage, DR 6700; if overage, CR 6700); bank deposit posts DR Bank → CR 1112 Cash; both JEs are balanced and traceable to the shift ID.

## 3. Edge cases & defensive UX — "the dumbest thing a supervisor could do here"

- [ ] **Supervisor enters actual cash in the wrong currency unit** (e.g. types 1500 meaning 1.500 KWD): the field should enforce tenant precision; show the interpreted amount back clearly before confirmation.
- [ ] **Supervisor closes the shift before the last sale has synced (offline scenario):** the close should be blocked or explicitly warn that unsynced offline transactions will not be included in the Z-report totals.
- [ ] **Double-tap close:** two simultaneous close requests; the second should return the already-completed shift record, not attempt to close again and corrupt `actualCash`.
- [ ] **Discrepancy > threshold but manager is unavailable:** the system blocks close, not just warns; supervisor cannot force-close without manager approval. (If force-close with a reason is a feature, confirm it is audited.)
- [ ] **Z-report printed before close (mid-shift X-report):** confirm the report is accessible mid-shift and clearly labelled as a draft/interim report, not a final Z-report.
- [ ] **Pay-out reason field blank:** reject or require a reason to maintain audit trail; a blank reason provides no value.
- [ ] **RTL (Arabic):** Z-report renders correctly under RTL; amounts and dates localized; the over/short indicator text is localized.
- [ ] **Large number of transactions (500+):** Z-report aggregation does not time out; the query is efficient (indexed on `shiftId` and `status`).

## 4. Cross-module / integration

- [ ] `pos.shift.closed` listener posts two accounting JEs: (1) over/short to account 6700; (2) bank deposit: DR Bank → CR 1112. Verify both entries appear in the GL trial balance with the correct shift date.
- [ ] If the `pos.shift.closed` listener throws after POS has already committed the close, a split-brain condition exists: the shift is `completed` in the POS DB but the GL has no entries. Confirm the listener failure is detected (dead-letter queue, alert) and can be replayed without duplicating the JE.
- [ ] The Z-report cash total matches `pos_shifts.expectedCash`; the accounting GL balance for account 1112 (Cash) increases by the net cash sales amount after the shift is processed.
- [ ] Over/short is surfaced in the daily management report (if such a report exists) for owner review.

## 5. Known gaps (from recon — verify or track)

- **Voided cash tx must be excluded from expectedCash — aggregation query risk** — if `pos_payments` rows are not deleted on void (the transaction status changes but the payment rows remain), the expectedCash aggregation query MUST filter on `pos_transactions.status ≠ 'voided'`. If the query aggregates `pos_payments` without this join, every voided cash sale inflates `expectedCash`. This is a **CRITICAL** financial calculation bug; verify the aggregation query in the Z-report and shift-close service.
- **`pos.shift.closed` listener failure = split-brain** — POS closes the shift (immutable), but the GL listener fails: over/short and bank deposit JEs are never posted. No compensation or retry is confirmed. **HIGH** accounting integrity gap; confirm the listener has at-least-once delivery and the JEs are idempotent on replay.
- **No mid-shift X-report endpoint** — whether a supervisor can print an interim X-report (running totals without closing the shift) is unconfirmed. If absent, supervisors close the shift early to check totals, which is a workflow problem. **MEDIUM** UX gap.
- **Discrepancy threshold configuration location** — unconfirmed whether the threshold is per-register, per-tenant, or hardcoded. **LOW** for MVP; **MEDIUM** once multi-register is common.
- **Pay-out > expectedCash warning vs. block** — the design allows a pay-out that exceeds expectedCash (with a warning); in practice this would result in a negative expected cash, which is physically impossible. Consider whether a hard block is more appropriate. **LOW**.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
