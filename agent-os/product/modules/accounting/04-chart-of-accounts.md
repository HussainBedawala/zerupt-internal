# Chart of Accounts

## COA Scope: Per Legal Entity

Each legal entity has its own COA instance. This is required because:
- Different countries have different regulatory account requirements (UAE VAT vs India GST vs SG GST)
- Each entity produces independent financial statements
- Account codes and names may differ by jurisdiction

**At launch (single-entity tenants):** One COA, auto-seeded from the general retail template. Indistinguishable from a "per-tenant" COA for the user.

**Multi-entity tenants:** Each new legal entity gets its own COA seeded from the same template. Entities can then diverge (add country-specific tax accounts, rename accounts, etc.).

## Account Properties

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `legalEntityId` | UUID | FK to LegalEntity. Every account belongs to one entity. |
| `tenantId` | UUID | Defense-in-depth |
| `code` | string | Hierarchical numeric code (e.g., `1131`). Unique per entity. |
| `name` | string | Primary language |
| `nameAlt` | string | Alternate language (bilingual support) |
| `type` | enum | `Asset`, `Liability`, `Equity`, `Income`, `Expense` |
| `subType` | enum | See sub-types below |
| `normalBalance` | enum | `Debit` or `Credit` |
| `currencyCode` | string? | For FC accounts (null = entity's functional currency) |
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

Seeded per legal entity during entity creation. Country-specific tax accounts are added based on `LegalEntity.countryCode`.

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

## Country-Specific Tax Account Variants

Seeded based on `LegalEntity.countryCode` during COA creation:

| Country | Tax accounts seeded | Notes |
|---------|--------------------|-------|
| AE, SA, BH, OM, QA (GCC) | `1162 Input VAT Recoverable`, `2131 Output VAT Payable`, `2132 VAT Settlement` | Single-rate VAT (5% for UAE/SA/BH/OM, 0% for KW) |
| IN (India) | `1162.01 Input CGST`, `1162.02 Input SGST`, `1162.03 Input IGST`, `2131.01 Output CGST`, `2131.02 Output SGST`, `2131.03 Output IGST` | Dual GST structure |
| SG (Singapore) | `1162 Input GST Recoverable`, `2131 Output GST Payable` | Single-rate GST (9%) |
| MY (Malaysia) | `1162 Input SST Recoverable`, `2131 Output SST Payable` | Sales and Service Tax |

## System Accounts (Non-Deletable)

Required for auto-generated journal entries. Seeded in every entity's COA:

`1112` Cash Register, `1129` Cheques in Transit, `1131` Trade Receivables, `1141` Merchandise Inventory, `1142` Inventory in Transit, `1150` Cheques in Hand, `1161` Supplier Prepayments, `1162` Input Tax Recoverable, `2111` Trade Payables, `2121` GRN Accrual, `2131` Output Tax Payable, `2140` Cheques Issued, `2151` Customer Deposits, `3200` Retained Earnings Prior, `3300` Retained Earnings Current, `3900` Opening Balance Equity, `4110` Product Sales, `4200` Sales Returns, `5100` COGS, `6700` Cash Over/Short

## Opening Balances

1. Tenant enters balances as of a cutoff date (per legal entity)
2. System creates journal entry of type `OpeningBalance` in that entity's ledger
3. Each account balance → debit or credit line
4. Balancing entry → `Opening Balance Equity (3900)`
5. After all balances entered, 3900 should be zero (imbalance = migration error)

## Cross-Reference

| Reference | Alignment |
|-----------|-----------|
| `settings-admin/15-multi-entity-architecture.md` | COA belongs to LegalEntity |
| `settings-admin/06-tax-configuration-controls.md` | Tax profiles determine which tax accounts are used |
| `01-architecture.md` | Engine resolves entity → COA for account mapping |
| `06-account-mappings.md` | Maps event types to specific accounts in the entity's COA |
