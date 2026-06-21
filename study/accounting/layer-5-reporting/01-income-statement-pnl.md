# 01 — The Income Statement (Profit & Loss)

## What it measures

The income statement measures **flows over a defined period**: how much value the business
created (revenue) and how much it consumed (costs and expenses). The residual is net
income or net loss. Unlike the balance sheet, the income statement tells you nothing about
the state of the business at a moment in time — it tells you what changed between two
moments.

A useful analogy: the balance sheet is a photograph; the income statement is the video
clip between two photographs.

## The five-layer structure

A well-constructed income statement separates different types of value creation and
consumption. The structure below is the standard for a retail business:

```
Revenue (Gross Sales)
  − Sales Returns & Allowances
─────────────────────────────
= Net Revenue

  − Cost of Goods Sold (COGS)
─────────────────────────────
= Gross Profit

  − Operating Expenses (Opex)
─────────────────────────────
= Operating Income (EBIT)

  + Other Income
  − Other Expense
  ± FX Gains / (Losses)
─────────────────────────────
= Net Income Before Tax

  − Income Tax Expense
─────────────────────────────
= Net Income
```

Each line is a subtotal derived from a group of accounts. The mapping between account
codes and line items is what the chart of accounts' classification tells us. An account
tagged as `Revenue` feeds the Revenue section; an account tagged as `COGS` feeds the
COGS section. If an account is misclassified in the COA, it will appear in the wrong
section of the P&L — a Category-1 error in financial reporting.

## Revenue

Revenue accounts have a **natural credit balance**: when a sale is made, the account is
credited. On the income statement, revenue is conventionally displayed as a positive
number, even though in double-entry terms the account holds a credit balance.

**Net Revenue = Gross Sales − Sales Returns − Allowances**

Sales returns (also called contra-revenue accounts) have a natural debit balance. They
reduce net revenue. They must be shown separately so that readers can see the return rate,
not buried inside COGS or treated as an expense.

In a multi-location retail business, revenue is typically broken down by location, product
category, or channel. These are analytical dimensions layered on top of the account
classification — the underlying posting is still to a single revenue account, but the
journal entry carries a dimension tag.

## Cost of Goods Sold (COGS)

COGS represents the book value of the inventory that was sold during the period. In a
perpetual inventory system (as any ERP should maintain), COGS is posted at the moment of
sale:

```
DR  Cost of Goods Sold (5100)     [cost of units sold]
  CR  Merchandise Inventory (1141)    [same amount]
```

The COGS amount depends on the inventory valuation method. Under weighted-average cost
(WAC), COGS per unit is the running average cost at the time of sale. Under FIFO, COGS
per unit is the cost of the oldest units first. The choice of method must be consistent
period over period and disclosed.

**Gross Profit = Net Revenue − COGS**

Gross profit margin (gross profit as a percentage of net revenue) is the most important
single metric for a retail business. A retail business with a 35% gross margin and a 40%
gross margin are fundamentally different businesses, even if they look similar in other
ways.

## Operating Expenses (Opex)

Operating expenses are the costs of running the business that are not directly tied to the
goods sold: salaries, rent, utilities, depreciation, marketing. They are period costs —
incurred to operate in the period, regardless of how many units were sold.

**Operating Income = Gross Profit − Operating Expenses**

Operating income (also called EBIT, earnings before interest and taxes) shows how
profitable the core business operations are, before financing decisions (interest on debt)
and taxes.

For a retail business, the operating expense section typically includes:
- Employee costs (salaries, benefits, GOSI/EPF/PSSF contributions)
- Occupancy costs (rent, service charges, utilities)
- Depreciation (fixed assets spread across their useful life)
- Marketing and advertising
- Software and subscriptions
- General and administrative (G&A)

## Other Income and Other Expense

Items that are real income or cost but not part of core operations go below the operating
income line:

- **Interest income** on cash deposits
- **Interest expense** on loans or credit facilities
- **Gain or loss on disposal of assets** (selling a shop fitting at above or below book value)
- **FX gain or loss** — realized differences when paying or receiving foreign-currency amounts;
  unrealized differences from period-end revaluation of monetary balances (IAS 21)
- **Penalty income** (late-payment fees charged to customers) or penalty expense

The separation matters because it lets readers evaluate core trading performance (operating
income) independently of financing and incidental activities.

## Net Income

**Net Income = Operating Income + Other Income − Other Expense − Income Tax**

Net income is the bottom line. It flows directly into equity: at year-end close, all
income and expense accounts are zeroed and the net result is posted to Retained Earnings
in the equity section of the balance sheet. This is the mechanical link between the income
statement and the balance sheet.

## Period scoping: flows, not balances

The income statement is **period-scoped**: it shows activity between a start date and an
end date, not a running total from inception. For this reason:

- Income and expense account balances are **zeroed at year-end close** (Layer 4, Chapter
  04). The new fiscal year's P&L starts from zero.
- Querying the income statement requires filtering journal-entry lines to `posted_date ≥
  period_start AND posted_date ≤ period_end`.
- For monthly P&L within a fiscal year, the query filters to the calendar month.
- For YTD P&L, the query filters from the fiscal year start to the current date.

If the query does not correctly scope the date range — for example, if it uses account
balances rather than period movements — the P&L will be wrong. A freshly opened account
with a brought-forward debit balance from an opening journal will pollute the income
statement if the period filter is missing.

## Sign conventions

In the general ledger, income accounts have natural credit balances and expense accounts
have natural debit balances. On the income statement, both are conventionally shown as
positive numbers, with expenses subtracted from revenues. This requires the reporting
layer to flip signs for display:

| Account type | GL sign | P&L display |
|--------------|---------|-------------|
| Revenue (credit balance) | negative (credit) | displayed as positive |
| Sales return (debit balance) | positive (debit) | displayed as negative (deduction) |
| COGS (debit balance) | positive (debit) | displayed as negative (deduction) |
| Expense (debit balance) | positive (debit) | displayed as negative (deduction) |
| Other income (credit balance) | negative (credit) | displayed as positive |
| Other expense (debit balance) | positive (debit) | displayed as negative (deduction) |

Getting the sign wrong on even one line produces a report that is materially wrong in a
direction that is hard to spot — a gross profit that is too high or too low by exactly
double the amount of the misclassified account.

## Comparative periods

A P&L without a comparative is half the story. Accountants and managers always want to
see this period against the prior period (prior month or prior year). A useful income
statement shows:

```
                        Current Period    Prior Period    Change (%)
Net Revenue               SAR 180,000      SAR 155,000      +16.1%
COGS                      SAR 117,000      SAR 101,750      +15.0%
Gross Profit               SAR 63,000       SAR 53,250      +18.3%
Gross Margin                    35.0%            34.4%       +0.6pp
Operating Expenses         SAR 38,000       SAR 35,000       +8.6%
Operating Income           SAR 25,000       SAR 18,250      +37.0%
```

The comparative period query runs the same account-group aggregation against the prior
period's date range. Both periods must use the same account classifications and the same
posted-and-non-reversed filter to be comparable.

## Worked example

Zerupt Demo Retail. Fiscal year ending 31 December 2025. Month: June 2025.

| Line | Amount (SAR) |
|------|-------------:|
| Gross Sales (4110) | 138,800 |
| Sales Returns (4200) | (2,100) |
| **Net Revenue** | **136,700** |
| Cost of Goods Sold (5100) | (83,400) |
| **Gross Profit** | **53,300** |
| Gross Margin | 39.0% |
| Salaries (6100) | (12,000) |
| Rent (6210) | (6,000) |
| Depreciation (6310) | (1,500) |
| **Operating Expenses** | **(19,500)** |
| **Operating Income** | **33,800** |
| Bank Charges (7130) | (270) |
| FX Loss (7210) | (500) |
| **Net Income Before Tax** | **33,030** |

The net income of SAR 33,030 must match the net of all income and expense account
balances on the trial balance for June 2025 to the cent. If it does not, the P&L query
has a bug — an account is missing, classified in the wrong section, or filtered
incorrectly.

## The mental model

> The income statement is a period-scoped summary of revenue and cost flows, derived by
> aggregating movements in income and expense accounts over a defined date range. It is
> not a snapshot — it is a video clip between two dates. Every line must tie to the trial
> balance for the same period. Sign conventions must be applied consistently: credit-
> balance income accounts are shown as positive; debit-balance expense accounts are shown
> as negative deductions. A P&L that cannot be reconciled to the TB line by line is not
> a P&L — it is a spreadsheet with numbers on it.

Next: `02-balance-sheet.md`.
