# COA Schema Design

> Schema: `packages/db/src/schema/chart-of-accounts.ts`
> Enums: `packages/db/src/schema/enums.ts`
> Migration: `packages/db/drizzle/0000_chunky_the_fury.sql`

## Table: `accounts`

Tenant-scoped. Every row belongs to a `(tenantId, legalEntityId)` pair.

### Core Columns

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid v7 | no | generated | PK |
| `tenantId` | uuid | no | — | Tenant isolation |
| `legalEntityId` | uuid | no | — | Multi-entity support |
| `code` | varchar(20) | no | — | Alphanumeric code (e.g. `1131`, `1162.01`) |
| `name` | varchar(200) | no | — | Primary language name |
| `nameAlt` | varchar(200) | yes | null | Alternate language name (bilingual) |
| `type` | account_type | no | — | Asset, Liability, Equity, Income, Expense |
| `subType` | account_sub_type | no | — | 15 sub-categories (see mapping below) |
| `normalBalance` | normal_balance | no | — | Debit or Credit (derived from type, except contra) |
| `parentAccountId` | uuid | yes | null | Self-referential FK (hierarchy) |
| `depth` | smallint | no | 0 | Denormalized depth for O(1) checks |
| `currencyCode` | varchar(3) | yes | null | Null = functional currency |
| `cashFlowCategory` | cash_flow_category | no | `none` | Operating, Investing, Financing, None |

### Flag Columns

| Flag | Type | Default | Meaning |
|------|------|---------|---------|
| `isHeader` | boolean | false | Group/summary account — no postings allowed |
| `isContra` | boolean | false | Opposite normal balance (e.g. Sales Returns) |
| `isControlAccount` | boolean | false | System-only postings (e.g. Trade Receivables) |
| `isSystemAccount` | boolean | false | Seeded by template, immutable |

### Audit Columns

`createdBy`, `updatedBy` (uuid), `createdAt`, `updatedAt` (timestamp), `deactivatedAt` (nullable timestamp for soft-delete).

## Enums

### account_type (5)

`asset` · `liability` · `equity` · `income` · `expense`

### account_sub_type (15)

| Type | Valid Sub-Types |
|------|----------------|
| Asset | `current_asset`, `non_current_asset` |
| Liability | `current_liability`, `non_current_liability` |
| Equity | `share_capital`, `retained_earnings`, `current_year_earnings` |
| Income | `sales_revenue`, `other_income`, `discount_income` |
| Expense | `cost_of_sales`, `operating_expense`, `finance_charge`, `other_expense`, `tax_expense` |

### normal_balance

`debit` (Asset, Expense) · `credit` (Liability, Equity, Income). Contra accounts flip the default.

### cash_flow_category

`operating` · `investing` · `financing` · `none`

## Constraints

| Constraint | Type | Rule |
|------------|------|------|
| Unique code per entity | UNIQUE | `(tenantId, legalEntityId, code)` |
| Headers ≠ control | CHECK | Cannot be both `isHeader` and `isControlAccount` |
| Non-empty code | CHECK | `code <> ''` |
| Depth bounds | CHECK | `depth >= 0 AND depth <= 5` |

## Indexes

| Index | Columns | Notes |
|-------|---------|-------|
| Primary filter | `tenantId, legalEntityId, type, subType` | List/filter queries |
| Active accounts | `tenantId, legalEntityId` WHERE `deactivatedAt IS NULL` | Partial index for active-only queries |
| Parent lookup | `parentAccountId` | Tree traversal |

## Hierarchy Model

```
Depth 0: 1000 Assets
  Depth 1: 1100 Current Assets
    Depth 2: 1110 Cash & Cash Equivalents
      Depth 3: 1112 Cash Register (leaf, system, control)
```

- Max 5 levels deep (enforced by CHECK + service validation)
- `depth` is denormalized — updated via recursive CTE on re-parenting
- Parent must be a header account and same account type
- Circular references prevented by `isDescendantOf()` recursive CTE check
