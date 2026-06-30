# POS Cash Integrity — Layer 0 Study

> Audience: future maintainer or hardening agent picking this up cold.
> Scope: register config, shift lifecycle, cash movements, expectedCash formula, Z-report, and GL posting.
> Date: 2026-06-30

---

## 1. The Cash Flow Chain

```
Register (config + defaultCashFloat)
  → Shift open   (openingFloat captured)
    → Transactions (pos_payments, method='cash', status='completed')
    → Cash movements (pay_in / pay_out, pos_cash_movements)
  → Shift close  (actualCash entered, expectedCash computed, cashOverShort derived)
    → Z-report   (printed / viewed — read-only aggregate)
    → GL JE      (cash over/short posted via accounting outbox)
```

Every monetary amount in the chain is `numeric(19,6)` in Postgres and `Decimal.js` in the service layer. No IEEE floats touch money at any point.

---

## 2. Schema Summary (packages/db/src/schema/pos.ts)

### pos_registers (lines 79-200)
- `default_cash_float numeric(19,6) NOT NULL DEFAULT 0` — suggested float for new shifts; CHECK >= 0.
- `status posRegisterStatus NOT NULL DEFAULT 'active'` — only `active` registers can open shifts.
- No maximum-float limit. No daily cash-limit per register.

### pos_shifts (lines 207-283)
- `opening_float numeric(19,6) NOT NULL DEFAULT 0` — captured at open; CHECK >= 0.
- `expected_cash`, `actual_cash`, `cash_over_short` — all nullable, populated only on close.
- `closed_by_id uuid` — nullable; the user who closed (may differ from opener for manager override).
- Partial unique index `pos_shifts_one_open_per_register` (`status <> 'closed'`) — at most one open shift per register.
- Partial unique index `pos_shifts_one_open_per_cashier` (tenantId, cashierId, `status <> 'closed'`) — a cashier cannot open two shifts simultaneously.
- `is_offline boolean NOT NULL DEFAULT false` — shift was opened while register had no connectivity.

### pos_cash_movements (lines 666-695)
- `type posCashMovementType NOT NULL` — enum: `pay_in` | `pay_out`.
- `amount numeric(19,6) NOT NULL` — CHECK > 0.
- `reason varchar(300) NOT NULL` — not-null in schema; see service note below.
- `approved_by_id uuid` — nullable; COMMENT says "manager who approved". In practice the service writes the cashier's own userId (not a separate manager). No manager PIN gate exists.
- No index on `approved_by_id` (not queried by approver today).

### pos_transactions / pos_payments (lines 289-660)
- Payments linked to transactions via `transaction_id`. `method posPaymentMethod NOT NULL`.
- Only `method = 'cash'` payments count toward the drawer balance.
- `change_given numeric(19,6) NOT NULL DEFAULT 0` — cash change returned; excluded from cash sales (payment amount already nets this out because the DR is limited to the sale amount, not the tendered amount).

---

## 3. Shift Open (apps/api/src/pos/shifts/pos-shifts.service.ts:80-129)

1. Register must exist for tenant and have `status = 'active'`.
2. `openingFloat = input.openingFloat ?? register.defaultCashFloat`.
3. `shiftNumber = max(shiftNumber for register) + 1` — sequential, never resets.
4. INSERT into `pos_shifts` with `status = 'open'`. A concurrent second open on the same register fails on the partial-unique index (23505 → ConflictException).

No permission beyond `pos.session.create` RBAC. No manager countersignature on float.

---

## 4. Cash Movements (apps/api/src/pos/cash-movements/pos-cash-movements.service.ts)

### Create (lines 21-81)
1. `amount > 0` enforced (Decimal check, line 29).
2. FOR UPDATE row lock on the shift row before insert — serializes with the shift-close path.
3. `lockedShift.status` must be `'open'` (not closing or closed).
4. `reason` is required for `pay_out` (service line 37, DTO refine). For `pay_in`, if no reason is given the service silently defaults `reason` to `"Pay in"` (line 68).
5. `approvedById` is set to `createdById` — the cashier submitting the request, not a separate manager. There is no manager PIN verification, no dual-approval flow.

### Offline behavior
Cash movements are online-only. The `CashMovementDialog` disables submission when `shiftId` is null (shift not yet synced). If the register loses connectivity after opening a shift, pay-ins and pay-outs CANNOT be recorded until connectivity returns. These movements do not join the offline sale queue. The drawer can therefore diverge from the server's expected-cash calculation during an offline episode if the cashier makes physical cash exchanges but cannot record them.

---

## 5. The expectedCash Formula (service lines 437-501)

```
expectedCash = openingFloat
             + cashSales          (SUM payments.amount WHERE method='cash', tx.type='sale', tx.status='completed')
             - cashRefunds        (SUM payments.amount WHERE method='cash', tx.type='return', tx.status='completed')
             - payOuts            (SUM movements.amount WHERE type='pay_out')
             + payIns             (SUM movements.amount WHERE type='pay_in')
```

All five components are summed in a single `Promise.all` of three queries (one for sales, one for refunds, one for movements). Decimal arithmetic — no float accumulation.

**Voided transaction handling:** Both the cash-sales query and cash-refunds query filter `tx.status = 'completed'`. A voided transaction has `status = 'voided'`, so it is correctly excluded from the expectedCash sum. There is no false-shortage bug in the cash reconciliation path.

**Change given:** `posPayments.changeGiven` is stored but not used in the expectedCash formula. The `amount` column on a payment is the tender amount NET of change. This is correct — the drawer balance moves by the net amount applied to the sale, not the gross cash tendered.

---

## 6. Shift Close (service lines 306-402)

1. Shift must not already be closed (status check + guarded UPDATE).
2. Held transactions (status='held') block close — `countHeldTransactions` runs first.
3. `computeCashComponents` runs to derive `expectedCash`.
4. `cashOverShort = actualCash - expectedCash` (positive = over, negative = short).
5. Guarded UPDATE + outbox insert in ONE Postgres transaction. The cash over/short JE is at-least-once guaranteed (transactional outbox).
6. In-process fast path also emits `pos.shift.closed` via EventEmitter for immediate GL posting.

**Unsynced sale handling (offline):** The UI shows a checkbox acknowledgement when there are pending/failed sales in the offline queue but does NOT block close on the server side. The cashier closes the shift with open eyes. The server has no visibility into unsynced client-side transactions at close time.

---

## 7. Z-Report (service lines 160-303)

Reads five result sets in a single `Promise.all`:
1. **salesRow** — count + grandTotal for `type='sale', status='completed'`.
2. **voidsRow** — count + grandTotal for `type='sale', status='voided'`.
3. **itemsRow** — sum of line quantities for completed sales.
4. **paymentRows** — payment totals by method for completed sales.
5. **taxRows** — tax by tax group for completed sales.
6. **cashSummary** — from `computeCashComponents` (same formula as close).

`netSales = totalSales - totalVoidAmount` (line 265). Here `totalSales` sums only `completed` sales, and `totalVoidAmount` sums only `voided` sales. If a completed sale is later voided (status changes from `completed` to `voided`), it leaves `totalSales` and enters `totalVoidAmount`. The formula then subtracts it a second time from a base that no longer includes it, producing an understated or negative `netSales`.

This is a display-layer bug in the Z-report's `salesSummary.netSales` field. It does NOT affect `cashSummary.expectedCash` (which uses the correct `computeCashComponents` path). Fix: either include voided sales in totalSales (gross-then-deduct model), or remove the totalVoidAmount deduction (net-direct model — just count completed).

---

## 8. GL Posting (apps/api/src/accounting-events/listeners/pos.listener.ts)

Four POS events post JEs:

| Event | Trigger | Key JE |
|---|---|---|
| `pos.transaction.completed` | every sale | DR cash/card/receivable, CR revenue, CR output_tax |
| `pos.return.completed` | cash refund | DR sales_return + DR output_tax reversal, CR cash |
| `pos.void.completed` | voided transaction | Full DR/CR swap of the original sale's lines |
| `pos.shift.closed` | shift close | DR/CR cash_over_short for over or short; optionally DR bank/petty_cash CR cash for cash transfer |

**Cash transfer on close:** The shift-close JE schema includes `cashTransferAmount` (default "0") and `cashTransferTarget` (default "bank"). But `buildShiftClosedJePayload` is the emitter — let me note that the close flow does not yet collect a cash-transfer amount from the UI or API body. The `CloseShiftInput` DTO only accepts `actualCash` and `notes`. The JE will always have `cashTransferAmount = "0"` (i.e., no cash-to-safe posting). The GL never records the physical cash leaving the register for the safe.

---

## 9. Invariants

| # | Invariant | Enforced By |
|---|---|---|
| I-1 | One open shift per register | Partial unique index `pos_shifts_one_open_per_register` |
| I-2 | One open shift per cashier | Partial unique index `pos_shifts_one_open_per_cashier` |
| I-3 | openingFloat >= 0 | DB CHECK |
| I-4 | Movement amount > 0 | DB CHECK + service Decimal guard |
| I-5 | Movement reason NOT NULL | DB NOT NULL (service fills "Pay in" default) |
| I-6 | No cash movement on non-open shift | FOR UPDATE lock + status check in service |
| I-7 | No shift close with held transactions | `countHeldTransactions` check before close |
| I-8 | Shift close JE at-least-once | Transactional outbox |
| I-9 | Voided transactions excluded from cash sum | `status='completed'` filter in `computeCashComponents` |

---

## 10. Current Gaps (Layer 0)

| ID | Gap | Severity |
|---|---|---|
| G-1 | `approvedById` always stores cashier's own userId, not a manager's. Pay-out has no manager approval gate — text reason only. | HIGH |
| G-2 | No PinVerificationService or any manager-PIN/dual-approval mechanism anywhere in POS. | HIGH |
| G-3 | Cash movements are online-only — no offline queue. Drawer diverges silently during offline episodes. | MEDIUM |
| G-4 | Pay-in silently defaults reason to "Pay in". No reason CODES — no audit classification. | MEDIUM |
| G-5 | `netSales` in Z-report display incorrectly double-subtracts voided transactions from an already-net base. Display only; does not affect expectedCash. | MEDIUM |
| G-6 | No blind-count close: expected cash is shown to the cashier before they enter actualCash. | LOW |
| G-7 | No X-report (mid-shift non-resetting summary). The Z-report endpoint works on open shifts, but no dedicated route or UI. | LOW |
| G-8 | Cash transfer to safe is modelled in the GL listener but never collected from UI/API — no cash-to-safe JE is ever posted. | LOW |
| G-9 | `openingFloat` is accepted from the cashier's own input at shift open with no upper bound check. A cashier could open with an arbitrarily large float. | LOW |
