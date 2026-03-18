# Chart of Accounts Schema Design

## Why COA Matters

The Chart of Accounts is the backbone of double-entry accounting. Every financial transaction in the system — POS sales, invoices, purchase receipts, inventory adjustments, cheque movements — ultimately posts to accounts in the COA. If the COA is wrong, every financial statement is wrong.

## Double-Entry Accounting Equation

```
Assets = Liabilities + Equity + (Income - Expenses)
```

- **Left side** (Assets, Expenses): increases with **Debit**, decreases with Credit
- **Right side** (Liabilities, Equity, Income): increases with **Credit**, decreases with Debit

This is why every account has a `normalBalance` (debit or credit) — it determines which side increases the account.

## Account Types and Sub-Types

| Type | Sub-Types | Normal Balance | Financial Statement |
|------|-----------|---------------|-------------------|
| Asset | Current, Non-Current | Debit | Balance Sheet |
| Liability | Current, Non-Current | Credit | Balance Sheet |
| Equity | Share Capital, Retained Earnings, Current Year Earnings | Credit | Balance Sheet |
| Income | Sales Revenue, Other Income, Discount Income | Credit | P&L (Income Statement) |
| Expense | Cost of Sales, Operating, Finance Charge, Other, Tax | Debit | P&L (Income Statement) |

Sub-types drive reporting granularity. A balance sheet separates current vs non-current assets/liabilities. A P&L separates cost of sales from operating expenses.

## Contra Accounts

Some accounts have the opposite normal balance of their type:
- **Sales Returns** (Income type, but Debit normal balance) — reduces revenue
- **Accumulated Depreciation** (Asset type, but Credit normal balance) — reduces asset value
- **Sales Discounts** (Income type, but Debit normal balance)

The `isContra` flag marks these accounts so the engine knows their balance direction is intentionally reversed.

## Account Hierarchy

Accounts form a tree structure:

```
1000 ASSETS (header)
├── 1100 Current Assets (header)
│   ├── 1110 Cash and Cash Equivalents (header)
│   │   ├── 1111 Petty Cash (posting)
│   │   └── 1112 Cash Register (posting, control, system)
│   └── 1130 Accounts Receivable (header)
│       └── 1131 Trade Receivables (posting, control, system)
└── 1200 Non-Current Assets (header)
    └── 1210 Property and Equipment (posting)
```

Key distinctions:
- **Header accounts**: Grouping nodes. Cannot receive journal entry postings. Used in reports for subtotals.
- **Posting accounts**: Leaf nodes where actual transactions are recorded.
- **Control accounts**: Posting accounts that only the engine can post to (e.g., Trade Receivables, Merchandise Inventory). Users cannot create manual journal entries against these.
- **System accounts**: Seeded by the COA template. Cannot be deleted, renamed, or retyped. The accounting engine's account mappings reference these by code.

## Per Legal Entity

Each legal entity has its own COA because:
1. Different countries have different regulatory requirements (UAE VAT accounts vs India GST accounts)
2. Each entity produces independent financial statements
3. Account codes may differ by jurisdiction

At launch (single-entity tenants), this is invisible to the user — they see one COA.

## How the COA Connects to Everything

```
Business Event (e.g., POS sale)
  → Accounting Engine receives event
  → Resolves legal entity from branch
  → Looks up account mapping (event type → account codes)
  → Creates journal entry with debit/credit lines
  → Each line references an account in this COA
  → Lines must balance (total debits = total credits)
  → Posted to the entity's general ledger
```

The account mapping configuration (a separate table) maps event types like `pos.transaction.completed` to specific account codes like `1112` (Cash Register) and `4110` (Product Sales).

## Key Design Decisions

1. **`code` is VARCHAR(30), not INTEGER** — Indian GST sub-accounts use dot notation (`1162.01`, `1162.02`). Codes are business identifiers, not database IDs.

2. **`normalBalance` stored explicitly** — Could be derived from type, but contra accounts break the derivation. Explicit storage prevents bugs.

3. **No `depth`/`level` column** — Derivable from parent chain via recursive CTE. Storing it creates a denormalization risk where the depth doesn't match the actual tree position.

4. **`tenantId` as defense-in-depth** — The tenant DB is already isolated per tenant, but `tenantId` on every row provides a safety net for queries that might accidentally cross tenant boundaries.

5. **Soft-delete only** — Accounts with transactions can never be hard-deleted. `isActive = false` hides them from dropdowns but preserves historical data integrity.

## MENA/India/SEA Specifics

- **UAE/Saudi (GCC)**: Single-rate VAT. Standard template accounts (`1162 Input VAT`, `2131 Output VAT`)
- **India**: Dual GST structure requires sub-accounts (`1162.01 Input CGST`, `1162.02 Input SGST`, `1162.03 Input IGST`)
- **Singapore**: Single-rate GST (9%)
- **Malaysia**: Sales and Service Tax (SST)
- **Cheque management**: Heavily used in MENA/India. Dedicated accounts for cheques in hand, in transit, issued, and bounced
