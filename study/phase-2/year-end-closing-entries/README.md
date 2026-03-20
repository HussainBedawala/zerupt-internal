# Year-End Closing Journal Entries

## What is a closing entry?

At the end of a fiscal year, temporary accounts (income and expense) must be zeroed out so the next year starts fresh. The net result flows into permanent equity accounts. This is the "closing" process.

## The closing sequence

1. **Zero income accounts** — Income accounts have credit-normal balances. To zero them, debit each account for its balance.
2. **Zero expense accounts** — Expense accounts have debit-normal balances. To zero them, credit each account for its balance.
3. **Plug to Retained Earnings — Current Year** — The difference between total income debits and total expense credits is the net profit or loss. This amount goes to a Current Year Earnings equity account (subType: `current_year_earnings`).
4. **Transfer to Retained Earnings — Prior Years** — The full balance of RE Current Year (including the new plug) transfers to RE Prior Years (subType: `retained_earnings`), clearing the current year account for the next cycle.

## Net profit vs net loss

- **Profit**: Total income > total expenses. The plug to RE Current Year is a credit (increasing equity).
- **Loss**: Total expenses > total income. The plug to RE Current Year is a debit (decreasing equity).

The entry must always balance: total debits = total credits.

## Reopening and reversal

If a fiscal year needs to be reopened (e.g., late adjustments), the closing entry is reversed:
- A new journal entry is created with all lines flipped (debits become credits, credits become debits)
- The `closingEntryId` reference on the fiscal year is cleared
- The original closing entry is marked as reversed (immutable — never deleted)

## Idempotent crash recovery

The reversal process involves two steps: reversing the journal entry and clearing the fiscal year reference. If the process crashes between these steps, the system must handle this gracefully on retry — checking if the entry is already reversed before attempting again.

## Financial precision

All monetary calculations use `Decimal.js` with precision 28 and banker's rounding (ROUND_HALF_EVEN) to avoid floating-point errors. This is critical for accounting — a single rounding error can cause the trial balance to not balance.

## Scoping balances to the fiscal year

Account balances for closing must be scoped to only the periods within the fiscal year being closed. Querying all-time balances would incorrectly include prior years' activity (which was already closed in previous years).

## Key accounting concepts

- **Temporary accounts**: Income, expense, dividends — reset to zero each year
- **Permanent accounts**: Assets, liabilities, equity — carry forward indefinitely
- **Credit-normal vs debit-normal**: Income/liabilities/equity are credit-normal; assets/expenses are debit-normal
- **Double-entry invariant**: Every transaction must have equal debits and credits
