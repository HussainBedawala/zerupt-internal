# Journal Reversal in Double-Entry Accounting

## Core Concept

In double-entry accounting, posted journal entries are **immutable**. You never edit or delete them. To correct a mistake or undo a transaction, you create a **reversal entry** — a new journal entry that mirrors the original with debits and credits swapped.

## Why Immutability Matters

- **Audit trail**: Regulators (tax authorities, auditors) need to see every transaction that ever happened, including mistakes
- **Period integrity**: Financial statements for a closed period must not change retroactively
- **Legal compliance**: In many jurisdictions (UAE, Saudi, India), altering posted accounting records is illegal

## How Reversal Works

Given an original entry:
```
JE-0001 (posted, 2026-03-15)
  DR  Cash          100.00
  CR  Revenue       100.00
```

The reversal creates:
```
JE-0002 (posted, 2026-03-19)  ← today's date, not original's
  DR  Revenue       100.00    ← swapped
  CR  Cash          100.00    ← swapped
  reversalOfEntryId = JE-0001
```

And updates the original:
```
JE-0001 (reversed)
  reversedByEntryId = JE-0002
```

Net effect on all accounts: zero. The books are clean.

## Bidirectional Linking

Both entries point to each other:
- **Original** → `reversedByEntryId` points to the reversal
- **Reversal** → `reversalOfEntryId` points to the original

This allows queries in both directions: "Was this entry reversed?" and "What entry did this reverse?"

## Period Assignment

The reversal always posts to the **current open period**, even if the original is in a locked (past) period. This is how corrections work without reopening closed periods.

## Race Conditions

Two users clicking "Reverse" simultaneously on the same entry is a real risk. Solutions:
1. **SELECT FOR UPDATE** — locks the row in the database so the second request waits
2. **Optimistic guard** — `UPDATE ... WHERE status = 'posted'` ensures only one reversal succeeds; the second sees `status = 'reversed'` and fails gracefully

## IAS 21 — Multi-Currency Reversals

When reversing a multi-currency entry, the reversal must use the **same exchange rate** as the original (not today's rate). This ensures the functional currency amounts cancel exactly. The `exchangeRateDate` on each line should reference the original transaction date, not the reversal date.

## Key Invariants

1. A reversal entry must always be `posted` (never `draft`)
2. An entry cannot be both a reversal AND be reversed (no chains)
3. An entry cannot reverse itself (no self-referential links)
4. Reversed entries must have `reversedByEntryId` set
5. All of these are enforced by database CHECK constraints
