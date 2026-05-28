# POS Register & Shift API — Concepts (DEV-274)

The concepts behind register configuration and cashier shift accountability — the
control layer that makes a cash drawer auditable.

## 1. Why a "shift" is the unit of cash accountability

A retail till handles physical cash that no system can directly observe. The
**shift** is the accounting envelope that makes the drawer auditable: a bounded
window (one cashier, one register, open → closed) with a measurable start and end
state. Everything that touches cash during that window is attributed to the shift,
so at close you can ask one question: *does the cash that should be in the drawer
match the cash that is?*

This is the same idea as a bank reconciliation, scaled down to a single drawer and
a single work session.

## 2. Expected vs. actual — the reconciliation identity

```
expectedCash = openingFloat + cashSales − cashRefunds − payOuts + payIns
cashOverShort = actualCash − expectedCash
```

- **expectedCash** is *derived* — the system computes what the drawer *should*
  hold by summing every cash movement attributed to the shift.
- **actualCash** is *observed* — the cashier physically counts the drawer.
- **cashOverShort** is the truth gap. Positive = more cash than expected (over),
  negative = less (short). It is rarely zero, and the magnitude is what matters:
  small gaps are noise (miscounted change), large gaps signal theft or error.

The sign convention is load-bearing. Getting it backwards would post a shortage as
income. This is why the calculation is pure decimal arithmetic with explicit signs
and 100% test coverage — a float rounding error here is real money mis-stated.

## 3. Why cash sales ≠ revenue

`cashSales` in the reconciliation is *only the cash tender* on completed sales —
not the sale total. A KWD 10 sale paid KWD 6 cash + KWD 4 card adds 6 to the
drawer, not 10. The reconciliation cares about what physically entered the till,
which is why it sums `pos_payments` rows filtered to `method = 'cash'`, not
transaction grand totals. Card/gift-card/store-credit tenders never touch the
drawer and are excluded by construction.

Pay-ins and pay-outs (`pos_cash_movements`) are the *non-sale* cash flows — a
change-fund top-up (in) or petty-cash withdrawal (out) — and they shift the
expected balance without any sale behind them.

## 4. Uniqueness as a state machine, enforced in the database

Two business rules are really invariants about *open* state:
- one open shift per register
- one open shift per cashier (across all registers)

The naive implementation is "check then insert", which has a race: two requests
both read "no open shift" and both insert. The robust implementation pushes the
invariant into the database as a **partial unique index** (`WHERE status <>
'closed'`) so the database itself rejects the second open with a unique-violation,
which the service translates to a 409. The application never has to win a race it
can't win — it just catches the constraint error.

The same principle protects **double-close**: the close is a guarded
`UPDATE ... WHERE status <> 'closed'`. A second concurrent close updates zero rows,
and "zero rows" is the signal to return 409 instead of re-running the cash math and
emitting a duplicate accounting entry.

## 5. The shift number is a permanent identifier

`shiftNumber` is sequential per register and never resets — it prints on receipts
and Z-reports and must be stable forever. It is *not* a surrogate key; it's a
human/audit identifier. Sequential-per-register (not global) keeps register
histories independent. The "one open per register" guard serializes opens on a
register, so computing `max(shiftNumber) + 1` is safe in practice — a racing second
open fails the open-shift guard before the duplicate number can persist, and a
unique constraint on `(registerId, shiftNumber)` is the backstop.

## 6. Closing emits an event instead of posting directly

Closing a shift does not write journal entries itself. It emits `pos.shift.closed`
and lets the accounting module decide how a cash over/short becomes a GL posting.
This is the **event-driven boundary**: POS owns "what happened at the till",
accounting owns "how that hits the books". The two never import each other's
internals — they agree on an event payload contract.

Critically, the event is emitted **post-commit**: the shift is already durably
closed before anyone tries to build the JE. If the downstream posting fails, it can
be retried/dead-lettered without ever un-closing the shift. A cashier's drawer
reconciliation must never be held hostage to an accounting failure — the physical
world already happened.

## 7. Defensive posture for non-technical users

The API assumes the operator will do the "dumbest thing possible": close a shift
twice by double-tapping, try to close with parked (held) transactions, open a shift
on a register already in use. Each maps to a specific, recoverable 409 with a
message that says *what to do* ("recall or void held transactions first"), not just
*what failed*. That message is the entire UX for a retail clerk under pressure at
close of day.
