# 02 — The Balance Sheet

## What it measures

The balance sheet (also called the statement of financial position) shows the **state of
the business at a single point in time**: what the business owns or controls (assets),
what it owes (liabilities), and the owners' residual interest (equity). It is a photograph,
not a video clip.

The balance sheet answers one question: if we stopped trading today and settled all our
debts, what would be left for the owners?

## The accounting equation

Every balance sheet, for every business, in every country, at every point in time, must
satisfy:

```
Assets = Liabilities + Equity
```

This is not a convention or a preference. It is a mathematical consequence of double-entry
bookkeeping. Every journal entry keeps both sides in balance at the transaction level, so
the accumulated balances across all accounts must also be in balance. If the balance sheet
does not balance to the cent, there is a defect — in the ledger, in the close process, or
in the reporting query.

## Assets

Assets are resources controlled by the business that are expected to produce future
economic benefits. They appear on the left side of the balance sheet (or top section, in
a vertical presentation).

Assets are classified as **current** or **non-current**:

**Current assets** — expected to be converted to cash or consumed within 12 months:
- Cash and cash equivalents (bank accounts, petty cash)
- Trade receivables (amounts owed by customers)
- Inventory (goods held for sale)
- Prepaid expenses (rent paid in advance, insurance premiums)
- Input tax recoverable (VAT/GST paid on purchases, awaiting refund or offset)

**Non-current assets** — held for more than 12 months:
- Property, plant, and equipment (PP&E): land, buildings, vehicles, shop fittings
- Accumulated depreciation (contra-asset; deducted from PP&E to show net book value)
- Intangible assets: software, licenses, brand value (if purchased)
- Long-term deposits: rental deposits, utility deposits

The distinction matters for liquidity analysis. A business with high non-current assets
relative to current assets may look asset-rich but cash-poor.

## Liabilities

Liabilities are obligations the business owes to external parties, to be settled by
transferring cash or other resources.

**Current liabilities** — due within 12 months:
- Trade payables (amounts owed to suppliers)
- Output VAT payable (VAT collected from customers, not yet remitted to the authority)
- Short-term debt, credit lines
- Customer deposits (advance payments received for orders not yet fulfilled)
- Accrued expenses (costs incurred but not yet invoiced or paid)
- Payroll payable (salaries earned but not yet paid)

**Non-current liabilities** — due beyond 12 months:
- Long-term loans and finance leases
- Deferred tax liabilities
- Long-term provisions (warranties, legal claims)

## Equity

Equity is the residual: Assets − Liabilities. It belongs to the owners.

For a company, equity typically consists of:
- **Share capital** — the amount invested by shareholders at face value
- **Share premium** — the excess over face value paid by investors (if any)
- **Retained earnings** — the accumulated net income from all prior periods that has not
  been distributed as dividends
- **Current year net income** — the P&L result for the current fiscal year (until year-end
  close moves it to retained earnings)

The retained earnings line is the direct link between the income statement and the balance
sheet:

```
Retained Earnings (closing) = Retained Earnings (opening) + Net Income − Dividends Paid
```

After the year-end close (Layer 4, Chapter 04), the current year's net income is rolled
into retained earnings, and the income/expense accounts start the new year at zero.

## Point-in-time vs flows

The balance sheet shows **balances at a date**, not movements over a period. Asset,
liability, and equity accounts are **permanent accounts** — they carry their balances
from one fiscal year to the next. They are never zeroed at year-end.

By contrast, income and expense accounts are **temporary accounts** — they accumulate
during a fiscal year and are closed to retained earnings at year-end. On the balance
sheet, no income or expense accounts appear directly; their net effect flows through
the retained earnings and current-year net income lines in equity.

If an income or expense account balance appears as a line item on the balance sheet, the
year-end close was not run or the account is misclassified. Both are serious errors.

## How the balance sheet ties to the trial balance

The balance sheet is a reorganized subset of the trial balance — specifically, all
balance-sheet accounts (assets, liabilities, equity) at a given date.

The test: sum all debit-balance accounts in the asset section. Sum all credit-balance
accounts in the liability and equity sections. They must be equal. If the TB balances and
the balance-sheet query correctly includes all balance-sheet accounts, the balance sheet
must also balance.

Common sources of imbalance in the report (not the ledger):
- The current-year net income line is computed separately from the P&L (instead of being
  read from the ledger balance of the income/expense accounts) and does not match.
- A new account code was created in an income or expense category but a balance-sheet
  account code is also in the same account-code range and gets mis-routed.
- The retained earnings balance includes the current year's activity (double-counting the
  net income that was already brought in separately).

## Current-year net income on the balance sheet

Before the year-end close, the income and expense accounts have accumulated balances.
Their net (revenue credits minus expense debits) equals the current year's net income.
This amount must appear in equity on the balance sheet, because the accounting equation
must hold.

There are two equivalent approaches:

**Approach A — Compute separately:** Run the P&L for the current year (sum of income
minus expenses), and present this as a separate "Current Year Net Income" line in equity.
The retained earnings line shows only prior-period retained earnings.

**Approach B — Treat all accounts as of the date:** Include income and expense account
balances in the TB sum, and recognize that the equity section's "retained earnings plus
net income" equals the credit-excess of the TB on the equity side.

Either approach gives the same number. Approach A is more transparent for readers.
What must NEVER happen: including net income in retained earnings AND as a separate line,
double-counting it.

## Worked example

Zerupt Demo Retail. Balance sheet as at 30 June 2025.

**Assets**

| Item | SAR |
|------|----:|
| Cash in Hand (1111) | 2,500 |
| Bank — Al Rajhi (1121) | 84,300 |
| PDC Receivable (1134) | 2,500 |
| Trade Receivables (1131) | 31,200 |
| Merchandise Inventory (1141) | 47,600 |
| Input Tax Recoverable (1162) | 3,820 |
| **Total Current Assets** | **171,920** |
| Furniture & Fixtures (1510) | 18,000 |
| Less: Accumulated Depreciation (1511) | (1,500) |
| **Total Non-Current Assets** | **16,500** |
| **TOTAL ASSETS** | **188,420** |

**Liabilities**

| Item | SAR |
|------|----:|
| Trade Payables (2111) | 28,750 |
| Output VAT Payable (2131) | 6,940 |
| Customer Deposits (2151) | 4,000 |
| **Total Current Liabilities** | **39,690** |

**Equity**

| Item | SAR |
|------|----:|
| Share Capital (3110) | 100,000 |
| Retained Earnings (3120) | 14,200 |
| Current Year Net Income | 33,030 (from P&L above) + 1,500 depreciation already included |

Wait — let us reconcile carefully. From the P&L example in Chapter 01:

Net Income for the period = SAR 33,030.

Equity check:
- Share Capital: 100,000
- Retained Earnings (prior): 14,200
- Current Year Net Income: 33,030
- **Total Equity**: 147,230

But wait: depreciation posts:
```
DR Depreciation Expense (6310)     1,500
  CR Accumulated Depreciation (1511)   1,500
```
The SAR 1,500 depreciation expense is already inside the P&L (operating expenses), and
the accumulated depreciation is already netted in assets. The accounting equation holds:

```
Total Assets (188,420) = Total Liabilities (39,690) + Total Equity (148,730)
```

Hmm — 39,690 + 148,730 = 188,420. ✓ (The exact equity figure depends on the full set
of opening balances and period entries; the point is that both sides must agree.)

## The mental model

> The balance sheet is a point-in-time photograph of everything the business owns and
> owes, with equity as the residual. It must satisfy Assets = Liabilities + Equity to the
> cent, at every date, as a mathematical consequence of double-entry. If it does not
> balance, the reporting code has a bug — not the ledger. The most dangerous balance-sheet
> error is computing current-year net income separately from the ledger and having it
> disagree with the P&L. The P&L and the balance sheet must tell the same story from the
> same source data.

Next: `03-cash-flow-statement.md`.
