# Year-End Closing — Entry Generation

> Service: `apps/api/src/journal-entries/year-end-closing.service.ts`

## Purpose

Generates the closing journal entry that zeros out income/expense accounts and transfers the net to Retained Earnings.

## Algorithm: `generateClosingEntry()`

| Step | Action |
|------|--------|
| 1 | Validate: FY exists, not closed, no existing closingEntryId |
| 2 | Find last period (highest periodNumber) for posting date |
| 3 | Find RE accounts: `subType = current_year_earnings` (3300) + `subType = retained_earnings` (3200) |
| 4 | Raw SQL: net balances for all income/expense non-header accounts in FY periods |
| 5 | Build closing lines (zero out each account) |
| 6 | Build RE Current Year line (absorb net income/expense) |
| 7 | Transfer RE Current Year → RE Prior Years |
| 8 | Balance validation: `sum(debit) === sum(credit)` |
| 9 | Reserve doc number, transaction: insert header + lines, update FY.closingEntryId |

### Line Building Logic

| Account Balance | Closing Line |
|----------------|-------------|
| Credit balance (income) | DR to zero it |
| Debit balance (expense) | CR to zero it |
| Net profit (income > expense) | CR RE Current Year (3300) |
| Net loss (expense > income) | DR RE Current Year (3300) |

### RE Transfer

After income/expense closing, the RE Current Year account's final balance (existing + net) is transferred to RE Prior Years:

| Final RE Current Year Balance | Transfer |
|-------------------------------|----------|
| Negative (net credit = retained profit) | DR RE Current Year, CR RE Prior Years |
| Positive (net debit = accumulated loss) | CR RE Current Year, DR RE Prior Years |

### Edge Case

If no activity and no RE balance → returns `{ null, null }` without creating any entry.

## Preview: `previewClosingEntry()`

Same algorithm, no writes. Returns `{ lines[], summary: { totalDebit, totalCredit, netProfitOrLoss, currency } }`.

`netProfitOrLoss`: negative = profit, positive = loss.

## Reversal: `reverseClosingEntry()`

1. Validate: year closed, closingEntryId exists
2. Crash recovery: if closing entry already `reversed` → just clear closingEntryId
3. Delegate to `JournalReversalService.reverseEntry()`
4. Clear `fiscalYears.closingEntryId = null`

## Events

- `"accounting.year-end-closing.posted"` after generate
- `"accounting.year-end-closing.reversed"` after reversal
