# Financial Statements — Design

> Status: **Not implemented.** Phase 6 per roadmap.
> Routes: `/accounting/income-statement`, `/accounting/balance-sheet`, `/accounting/cash-flow`

## Three Core Reports

### Income Statement (P&L)

Shows revenue minus expenses for a period.

```
Revenue (type=income)
  Product Sales (4110)                    XX,XXX
  Other Income (4800+)                     X,XXX
  Less: Sales Returns (4200)              (X,XXX)
  Less: Sales Discounts (4300)              (XXX)
Total Revenue                             XX,XXX

Cost of Sales (subType=cost_of_sales)
  COGS (5100)                            (XX,XXX)
Gross Profit                              XX,XXX

Operating Expenses (subType=operating_expense)
  Rent, Salaries, Utilities, etc.        (XX,XXX)
Total Operating Expenses                 (XX,XXX)

Other Income/Expense
  FX Gains/Losses, Bank Charges, etc.      X,XXX

Net Profit / (Loss)                        X,XXX
```

**Query:** Sum JE lines grouped by account, filtered by `type IN (income, expense)` and date range. Posted entries only.

### Balance Sheet

Shows assets = liabilities + equity at a point in time.

```
Assets (type=asset)
  Current Assets                          XX,XXX
  Non-Current Assets                      XX,XXX
Total Assets                             XXX,XXX

Liabilities (type=liability)
  Current Liabilities                     XX,XXX
  Non-Current Liabilities                 XX,XXX
Total Liabilities                         XX,XXX

Equity (type=equity)
  Share Capital                           XX,XXX
  Retained Earnings                       XX,XXX
  Current Year Earnings                    X,XXX  ← computed from P&L
Total Equity                              XX,XXX

Total Liabilities + Equity               XXX,XXX  ← must = Total Assets
```

**Query:** Sum ALL posted JE lines from inception to report date, grouped by account. Balance sheet is cumulative, not period-based.

### Cash Flow Statement

Groups cash movements by activity.

```
Operating Activities                      XX,XXX
Investing Activities                      (X,XXX)
Financing Activities                       X,XXX
Net Change in Cash                         X,XXX

Opening Cash Balance                      XX,XXX
Closing Cash Balance                      XX,XXX
```

**Uses:** `cashFlowCategory` field on each account (operating/investing/financing/none). Sum JE lines grouped by category for the period.

## Backend — Shared Report Endpoint Pattern

```
GET /tenant/reports/:reportType?legalEntityId=&fromDate=&toDate=
Permission: accounting.reports.read
```

Response includes: `sections[]` with `accounts[]` with `balance`, `sectionTotal`, `reportTotal`.

## Frontend — Shared Layout

1. **Filter bar:** Legal entity + date range (P&L, Cash Flow) or "as of" date (Balance Sheet)
2. **Hierarchical table:** account sections → sub-sections → accounts → amounts
3. **Comparison mode:** side-by-side current period vs prior period (future enhancement)
4. **Export:** PDF + CSV + Excel
5. **Print-friendly:** full-width, no sidebar, page breaks between sections

## Implementation Notes

- Deferred to Phase 6 per roadmap — do NOT build before then
- Trial Balance + GL Drill-Down (Phase 2) provide the foundation queries
- `cashFlowCategory` already exists on accounts schema — no schema changes needed
- Current Year Earnings on balance sheet = live P&L calculation, not from RE account
