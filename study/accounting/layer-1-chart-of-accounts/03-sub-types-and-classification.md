# 03 — Sub-Types and Classification

## Why five types aren't enough

The five types (Asset, Liability, Equity, Income, Expense) are essential but coarse. Every
real Balance Sheet and P&L groups accounts into finer sections. A Balance Sheet doesn't
just say "here are all the assets" — it separates *current* assets from *non-current*
assets. A P&L doesn't just say "here are all expenses" — it separates the *cost to produce
goods* from the *cost to run the office* from *interest on loans*.

These finer groupings are controlled by **sub-types**. The sub-type is the second
classification dimension on every account, after the type.

## Why sub-types matter: report grouping and ordering

Sub-types do two things:

1. **Group accounts into report sections.** The Balance Sheet renders Current Assets before
   Non-Current Assets. The P&L renders Cost of Sales before Operating Expenses. The report
   generator doesn't know anything about account codes or hierarchy — it queries by sub-type.
2. **Signal liquidity and urgency to the reader.** A current liability is due within a year;
   a non-current liability is long-term debt. A current asset can be converted to cash within
   a year; a non-current asset cannot. Knowing this at a glance is essential for anyone
   evaluating the business.

If sub-types are wrong, the Balance Sheet will show long-term assets as current, or short-term
liabilities as long-term, and anyone reading it will draw the wrong conclusions.

## The complete valid sub-type map

Only certain sub-types are valid per type. The pairing is strictly enforced. Here is the
full valid set (these are the exact values in Zerupt's `accountSubType` enum):

### Asset sub-types

| Sub-type | What it contains | Examples |
|----------|-----------------|---------|
| `current_asset` | Converts to cash within ~12 months | Cash, Bank, Receivables, Inventory, Prepaid Rent, VAT Recoverable |
| `non_current_asset` | Held long-term; not easily liquidated | Property, Equipment, Vehicles, Leasehold Improvements, Long-term deposits |

> **Rule of thumb:** if you'd consume, collect, or sell it within a normal operating cycle
> (usually a year), it's current.

### Liability sub-types

| Sub-type | What it contains | Examples |
|----------|-----------------|---------|
| `current_liability` | Due within ~12 months | Trade Payables, VAT Payable, Short-term loans, Customer deposits |
| `non_current_liability` | Due after 12 months | Long-term bank loans, Lease obligations |

### Equity sub-types

| Sub-type | What it contains | Examples |
|----------|-----------------|---------|
| `share_capital` | Invested capital from owners | Owner's capital, Share capital |
| `retained_earnings` | Accumulated profits from prior years | Prior-year retained earnings |
| `current_year_earnings` | P&L balance for the active fiscal year | Current year net income/loss |

> Note: the `retained_earnings_current` and `retained_earnings_prior` system accounts in
> Zerupt both use appropriate equity sub-types to support the year-end close flow.

### Income sub-types

| Sub-type | What it contains | Examples |
|----------|-----------------|---------|
| `sales_revenue` | Primary business income — selling goods | Product sales, Service revenue |
| `other_income` | Secondary or non-trading income | Rental income, Interest received, FX gains |
| `discount_income` | Income from supplier discounts | Purchase discounts earned |

### Expense sub-types

| Sub-type | What it contains | Examples |
|----------|-----------------|---------|
| `cost_of_sales` | Direct cost of goods sold (COGS) | Merchandise cost, COGS |
| `operating_expense` | Overhead to run the business | Rent, Salaries, Utilities, Marketing |
| `finance_charge` | Cost of borrowing | Bank interest, Loan fees |
| `other_expense` | Non-operating expenses | Penalties, Losses on disposal |
| `tax_expense` | Tax provisions | Income tax provision, withholding tax |

## How the report uses sub-types

The Profit & Loss statement queries and renders in this order:

```
  4. Income
     4a. sales_revenue          → Revenue section
     4b. other_income           → Other Income section
     4c. discount_income        → Discount Income section
     ─────────────────────────────
     Gross Revenue (sum 4a + 4b + 4c)

  5. Expenses
     5a. cost_of_sales          → Cost of Sales section
     ─────────────────────────────
     Gross Profit = Revenue − Cost of Sales

     5b. operating_expense      → Operating Expenses section
     ─────────────────────────────
     Operating Profit = Gross Profit − Operating Expenses

     5c. finance_charge         → Finance Charges section
     5d. other_expense          → Other Expenses section
     5e. tax_expense            → Tax section
     ─────────────────────────────
     Net Profit = Operating Profit − Finance/Other/Tax
```

The Balance Sheet queries in this order:

```
  ASSETS
    current_asset accounts        → Current Assets
    non_current_asset accounts    → Non-Current Assets

  LIABILITIES
    current_liability accounts    → Current Liabilities
    non_current_liability accounts→ Long-Term Liabilities

  EQUITY
    share_capital accounts        → Share Capital
    retained_earnings accounts    → Prior Year Retained Earnings
    current_year_earnings accounts→ Current Year P&L
```

## Enforced in the database

The `accounts_type_sub_type_valid_check` DB constraint in `chart-of-accounts.ts` rejects
any account where the (type, sub-type) combination is not in the valid list. You cannot
create an asset account with sub-type `cost_of_sales`. The error will come from the
database, not just the application layer.

## The mental model

> Sub-types are the second classification dimension. They control which *section* of a
> report an account lands in, and in what *order*. Getting them right is not just about
> presentation — it's about telling the truth to anyone who reads the financials.

Next: `04-normal-balance-and-contra-accounts.md`.
