# Journal Reversal

Immutable correction mechanism: creates a new entry with swapped debit/credit lines. Race-safe via `SELECT FOR UPDATE`.

## Files

1. `01-reversal-mechanics.md` — Pipeline, line swapping, race protection, date rules

## Key Decisions

- **Never edit posted entries** — reversal is the only correction path
- **Posts to today** — reversal always in current period, original stays untouched
- **IAS 21 exchange rates** — reversal uses original rate date, not today's
- **Race-safe** — row lock + optimistic guard prevents concurrent double-reversal
- **Cannot reverse a reversal** — CHECK constraint enforced at DB level
