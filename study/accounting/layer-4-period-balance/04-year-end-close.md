# 04 — Year-End Close

## The problem the year-end close solves

The income statement (P&L) measures performance over a period — typically one year.
Revenue and expense accounts accumulate throughout the year. At the end of the year, they
have done their job. The next year starts fresh: we want Year 2's revenue to show only
Year 2's sales, not the sum of Year 1 and Year 2 combined.

Balance-sheet accounts (assets, liabilities, equity) work differently. A bank balance
at 31 December does not reset to zero on 1 January. It carries forward — the bank
account on 1 January has exactly the money that was there on 31 December. These accounts
are **permanent** (they persist across years).

Revenue, cost, and expense accounts are **temporary** (they exist to measure performance
over one period). At year-end, the balances of all temporary accounts are zeroed and
their net effect is transferred to **Retained Earnings (3120)** — the equity account that
accumulates the business's lifetime profits.

This zeroing process is the **year-end close** (also called: closing the books, closing
the ledger, closing the income statement).

## Retained earnings vs current year earnings

Some systems track two equity components:

**Retained Earnings (3120):** the cumulative sum of all prior-year net incomes, minus
any dividends declared. This account is updated once per year — at year-end close.
During the year it carries the prior year's closing retained earnings balance unchanged.

**Current Year Earnings (3130):** a sub-total equity account computed in real time as
the sum of all revenue minus all expenses for the current year. This is not a real posted
account — it is a calculated field in the balance sheet report:

```
Current Year Earnings = SUM(revenue accounts) − SUM(expense accounts)
```

Because revenue accounts have credit balances and expense accounts have debit balances:

```
Current Year Earnings = SUM(credit balances in 4xxx accounts)
                      − SUM(debit balances in 5xxx, 6xxx, 7xxx accounts)
```

During the year, Current Year Earnings is visible as a derived line on the balance sheet,
keeping Assets = Liabilities + Equity true at all times. At year-end close, this derived
figure is posted as a real journal entry, moving it into Retained Earnings, and the
temporary accounts are zeroed.

## The closing entry

The year-end close is a single journal entry (or a set of them that together accomplish
the same thing). It:

1. Closes all revenue accounts (credits → zeros, so debit them)
2. Closes all expense, cost, and contra-revenue accounts (debits → zeros, so credit them)
3. Posts the net difference (profit or loss) to Retained Earnings

**Worked example:** Zerupt Demo Retail, FY 2025 (SAR).

Full-year income statement accounts as at 31 December 2025:

| Account | Normal Balance | FY 2025 Balance |
|---------|---------------|----------------:|
| **4110** Product Sales | Credit | 482,300.00 CR |
| **4200** Sales Returns | Debit | (9,400.00) DR |
| **4820** FX Gain | Credit | 1,200.00 CR |
| **5100** Cost of Goods Sold | Debit | (301,500.00) DR |
| **6100** Salaries Expense | Debit | (72,000.00) DR |
| **6210** Rent Expense | Debit | (24,000.00) DR |
| **6230** Repairs & Maintenance | Debit | (3,800.00) DR |
| **7130** Bank Charges | Debit | (1,140.00) DR |
| **7210** FX Loss | Debit | (2,800.00) DR |

Compute net income:

```
Revenue:
  Product Sales        482,300.00
  FX Gain                1,200.00
  Sales Returns         (9,400.00)   ← contra-revenue (debit balance)
  ─────────────────────────────────
  Net revenue          474,100.00

Expenses:
  COGS                 301,500.00
  Salaries              72,000.00
  Rent                  24,000.00
  Repairs                3,800.00
  Bank Charges           1,140.00
  FX Loss                2,800.00
  ─────────────────────────────────
  Total expenses       405,240.00

Net income: 474,100.00 − 405,240.00 = 68,860.00
```

**The closing journal entry (posted 31 December 2025, Period 12 or Period 13):**

```
DR  Product Sales (4110)           482,300.00
DR  FX Gain (4820)                   1,200.00
      CR  Sales Returns (4200)                 9,400.00
      CR  Cost of Goods Sold (5100)          301,500.00
      CR  Salaries Expense (6100)             72,000.00
      CR  Rent Expense (6210)                 24,000.00
      CR  Repairs & Maintenance (6230)         3,800.00
      CR  Bank Charges (7130)                  1,140.00
      CR  FX Loss (7210)                       2,800.00
      CR  Retained Earnings (3120)            68,860.00
```

Verify balance:
- Total debits: 482,300 + 1,200 = **483,500.00**
- Total credits: 9,400 + 301,500 + 72,000 + 24,000 + 3,800 + 1,140 + 2,800 + 68,860 = **483,500.00**

Balanced.

After this entry:
- Every income and expense account has a zero balance. They are ready for Year 2026.
- **Retained Earnings (3120)** increases by SAR 68,860 — the year's profit is now a
  permanent part of equity.
- Balance-sheet accounts are unchanged by this entry: assets, liabilities, and the other
  equity accounts are untouched.

## Balance-sheet accounts carry forward

After the closing entry is posted and the ledger is locked for FY 2025, the opening
balances of FY 2026 are:

- All asset account balances carry forward unchanged.
- All liability account balances carry forward unchanged.
- **Retained Earnings (3120)** carries forward the prior balance plus SAR 68,860.
- All income and expense accounts open FY 2026 at zero.

This carry-forward does not require a separate journal entry in a well-designed system.
The ledger is continuous — the balances as at 31 December 2025 (after the closing entry)
are mathematically identical to the opening balances of 1 January 2026. The "opening"
of FY 2026 is simply reading the ledger from 1 January onwards; the balance-sheet
accounts have non-zero starting balances because they are computed from all history, not
just from 1 January 2026.

## Idempotency: running the close more than once

The year-end close must be idempotent. If the close is run, then an auditor finds an
error and requires a correction, the sequence is:

1. Reopen the year (unlock or post the audit adjustment into Period 13).
2. Post the adjustment.
3. Run the close again.

If the system creates a second closing entry rather than replacing the first, Retained
Earnings is credited twice and every income/expense account has a net credit instead of
zero. This is catastrophic.

The correct design: the closing entry has a stable reference (e.g., `YEAR-CLOSE-2025`).
Running the close a second time either:
- Checks for an existing close entry and refuses if one is already posted (requiring the
  first to be reversed before re-running), or
- Computes the delta: the closing entry has been partially adjusted by the audit
  correction, so the second run only posts the incremental difference.

The simplest safe approach: always reverse the prior closing entry first, then re-run.
The reversal and the new closing entry together have zero net effect on any balance —
they cancel — except that the new closing entry reflects the corrected balances.

## Reversibility: re-opening a year

A year may need to be re-opened for:
- Auditor adjustments (comparative period restatement required by IFRS 8 / IAS 8)
- Material error corrections that cannot be handled prospectively

The process:
1. Post a reversal of the closing entry (exact mirror image, same accounts, DR↔CR swapped)
2. Post the correction entries (with full audit trail)
3. Re-run the year-end close (producing a new, correct closing entry)
4. Re-lock the fiscal year

The reversal of the closing entry re-opens all income and expense accounts to their
pre-close balances. The correction entries adjust those balances. The new closing entry
then zeros them again and posts the corrected net income to Retained Earnings.

## What if there is a loss?

If expenses exceed revenue, the net income is negative — a **net loss**. The closing
entry then **debits** Retained Earnings (reducing equity) instead of crediting it:

```
Net loss for FY 2025: SAR (15,400.00)

Closing entry (partial):
DR  [revenue accounts]       [revenue total]
      CR  [expense accounts]       [expense total]
      DR  Retained Earnings (3120)  15,400.00   ← loss reduces equity
```

The entry still balances. The accumulated deficit in Retained Earnings is the business's
total historical losses minus profits — and a healthy business has a credit balance in
Retained Earnings. A business that has lost more than it has ever earned has a debit
balance in Retained Earnings (called an "accumulated deficit").

## The mental model

> The year-end close is the ritual that separates one year's performance from the next.
> Revenue and expense accounts are temporary scorecards for one year; the closing entry
> zeros them and moves the net score permanently into Retained Earnings. Balance-sheet
> accounts are permanent — they never reset. The closing entry must always balance
> (debits of all credits in income accounts equal credits of all debits in expense accounts
> plus the net difference to Retained Earnings), and it must be idempotent — running it
> twice produces the same result as running it once. A correctly closed year means FY+1
> starts every income and expense account at zero, while every balance-sheet account
> carries forward its true ending balance from FY.

Next: `05-fx-revaluation-ias21.md`.
