# Default Chart of Accounts Template

## Account Properties

| Field | Type | Description |
|-------|------|-------------|
| `code` | string | Hierarchical numeric code (e.g., `1131`) |
| `name` | string | Primary language |
| `nameAlt` | string | Alternate language (bilingual support) |
| `type` | enum | `Asset`, `Liability`, `Equity`, `Income`, `Expense` |
| `subType` | enum | See sub-types below |
| `normalBalance` | enum | `Debit` or `Credit` |
| `currencyCode` | string? | For FC accounts (null = functional currency) |
| `isControlAccount` | boolean | Posted to by engine only, not directly |
| `isSystemAccount` | boolean | Cannot be deleted or type-changed |
| `cashFlowCategory` | enum | `Operating`, `Investing`, `Financing`, `None` |
| `isActive` | boolean | Accounts with transactions can only be deactivated |
| `parentAccountId` | string? | Parent in hierarchy |

## Sub-Types

**Income:** `SalesRevenue`, `OtherIncome`, `DiscountIncome`
**Expense:** `CostOfSales`, `OperatingExpense`, `FinanceCharge`, `OtherExpense`, `TaxExpense`
**Asset:** `CurrentAsset`, `NonCurrentAsset`
**Liability:** `CurrentLiability`, `NonCurrentLiability`
**Equity:** `ShareCapital`, `RetainedEarnings`, `CurrentYearEarnings`

## General Retail Template

```
1000  ASSETS
├── 1100  Current Assets
│   ├── 1110  Cash and Cash Equivalents
│   │   ├── 1111  Petty Cash                          [Asset, CurrentAsset, DR]
│   │   ├── 1112  Cash Register                       [Asset, CurrentAsset, DR]
│   │   └── 1119  Cash in Transit                     [Asset, CurrentAsset, DR]
│   ├── 1120  Bank Accounts
│   │   ├── 1121  Primary Bank Account                [Asset, CurrentAsset, DR]
│   │   └── 1129  Bank — Cheques in Transit           [Asset, CurrentAsset, DR]
│   ├── 1130  Accounts Receivable
│   │   ├── 1131  Trade Receivables                   [Asset, CurrentAsset, DR]  CONTROL
│   │   └── 1132  Employee Receivables                [Asset, CurrentAsset, DR]
│   ├── 1140  Inventory
│   │   ├── 1141  Merchandise Inventory               [Asset, CurrentAsset, DR]  CONTROL
│   │   ├── 1142  Inventory in Transit                [Asset, CurrentAsset, DR]
│   │   └── 1143  Raw Materials                       [Asset, CurrentAsset, DR]
│   ├── 1150  Cheques in Hand                         [Asset, CurrentAsset, DR]
│   ├── 1160  Prepayments and Advances
│   │   ├── 1161  Supplier Prepayments                [Asset, CurrentAsset, DR]
│   │   └── 1162  Input Tax Recoverable               [Asset, CurrentAsset, DR]
│   └── 1190  Other Current Assets
├── 1200  Non-Current Assets
│   ├── 1210  Property and Equipment                  [Asset, NonCurrentAsset, DR]
│   ├── 1220  Accumulated Depreciation                [Asset, NonCurrentAsset, CR]
│   └── 1230  Intangible Assets                       [Asset, NonCurrentAsset, DR]

2000  LIABILITIES
├── 2100  Current Liabilities
│   ├── 2111  Trade Payables                          [Liability, CurrentLiability, CR]  CONTROL
│   ├── 2121  GRN Accrual                             [Liability, CurrentLiability, CR]
│   ├── 2122  Accrued Expenses                        [Liability, CurrentLiability, CR]
│   ├── 2131  Output Tax Payable                      [Liability, CurrentLiability, CR]
│   ├── 2132  Tax Settlement Account                  [Liability, CurrentLiability, CR]
│   ├── 2140  Cheques Issued — Outstanding            [Liability, CurrentLiability, CR]
│   ├── 2151  Customer Deposits                       [Liability, CurrentLiability, CR]
│   ├── 2152  Gift Card Liability                     [Liability, CurrentLiability, CR]
│   ├── 2153  Store Credit Liability                  [Liability, CurrentLiability, CR]
│   └── 2190  Other Current Liabilities
├── 2200  Non-Current Liabilities
│   ├── 2210  Long-Term Loans                         [Liability, NonCurrentLiability, CR]
│   └── 2220  Bank Overdraft                          [Liability, NonCurrentLiability, CR]

3000  EQUITY
├── 3100  Share Capital                               [Equity, ShareCapital, CR]
├── 3200  Retained Earnings — Prior Years             [Equity, RetainedEarnings, CR]
├── 3300  Retained Earnings — Current Year            [Equity, CurrentYearEarnings, CR]
└── 3900  Opening Balance Equity                      [Equity, RetainedEarnings, CR]

4000  INCOME
├── 4110  Product Sales                               [Income, SalesRevenue, CR]
├── 4120  Service Revenue                             [Income, SalesRevenue, CR]
├── 4200  Sales Returns and Allowances                [Income, SalesRevenue, DR]  contra
├── 4300  Sales Discounts                             [Income, SalesRevenue, DR]  contra
├── 4810  Purchase Discount Income                    [Income, DiscountIncome, CR]
├── 4820  Realized FX Gain                            [Income, OtherIncome, CR]
├── 4830  Unrealized FX Gain                          [Income, OtherIncome, CR]
└── 4900  Interest Income                             [Income, OtherIncome, CR]

5000  COST OF SALES
├── 5100  Cost of Goods Sold                          [Expense, CostOfSales, DR]
├── 5200  Inventory Write-Down                        [Expense, CostOfSales, DR]
├── 5300  Inventory Gain/Loss on Count                [Expense, CostOfSales, DR]
├── 5400  Freight and Delivery (Cost)                 [Expense, CostOfSales, DR]
└── 5500  Production / Assembly Costs                 [Expense, CostOfSales, DR]

6000  OPERATING EXPENSES
├── 6110  Salaries and Wages                          [Expense, OperatingExpense, DR]
├── 6120  Employee Benefits                           [Expense, OperatingExpense, DR]
├── 6130  End of Service Indemnity                    [Expense, OperatingExpense, DR]
├── 6210  Rent                                        [Expense, OperatingExpense, DR]
├── 6220  Utilities                                   [Expense, OperatingExpense, DR]
├── 6300  Marketing and Advertising                   [Expense, OperatingExpense, DR]
├── 6410  Office Supplies                             [Expense, OperatingExpense, DR]
├── 6420  Professional Fees                           [Expense, OperatingExpense, DR]
├── 6500  Depreciation and Amortization               [Expense, OperatingExpense, DR]
├── 6600  Insurance                                   [Expense, OperatingExpense, DR]
├── 6700  Cash Over / Short                           [Expense, OperatingExpense, DR]
└── 6800  Internal Consumption                        [Expense, OperatingExpense, DR]

7000  OTHER INCOME AND EXPENSE
├── 7110  Bank Charges                                [Expense, FinanceCharge, DR]
├── 7120  Interest Expense                            [Expense, FinanceCharge, DR]
├── 7130  Cheque Bounce Fees                          [Expense, FinanceCharge, DR]
├── 7210  Realized FX Loss                            [Expense, OtherExpense, DR]
├── 7220  Unrealized FX Loss                          [Expense, OtherExpense, DR]
└── 7900  Other Expenses                              [Expense, OtherExpense, DR]
```

## System Accounts (Non-Deletable)

These are required for auto-generated journal entries:

`1112` Cash Register, `1129` Cheques in Transit, `1131` Trade Receivables, `1141` Merchandise Inventory, `1142` Inventory in Transit, `1150` Cheques in Hand, `1161` Supplier Prepayments, `1162` Input Tax Recoverable, `2111` Trade Payables, `2121` GRN Accrual, `2131` Output Tax Payable, `2140` Cheques Issued, `2151` Customer Deposits, `3200` Retained Earnings Prior, `3300` Retained Earnings Current, `3900` Opening Balance Equity, `4110` Product Sales, `4200` Sales Returns, `5100` COGS, `6700` Cash Over/Short

## Opening Balances

1. Tenant enters balances as of a cutoff date
2. System creates journal entry of type `OpeningBalance`
3. Each account balance → debit or credit line
4. Balancing entry → `Opening Balance Equity (3900)`
5. After all balances entered, 3900 should be zero (imbalance = migration error)
