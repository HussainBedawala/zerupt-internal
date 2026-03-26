# Sub-Ledger Opening Balances — AR/AP/Inventory/Fixed Assets

> Extends: `opening-balance/01-design.md` (GL-level opening balances)
> Related: `product/sales/06-customer-payments.md`, `product/purchase/06-supplier-payments.md`
> Schema: `packages/db/src/schema/journal-entry.ts`

## Status

**Code: Not implemented. Spec: New.** The existing opening balance wizard (01-design.md) only handles GL account totals. This spec covers individual party/item-level opening balances needed for AR aging, AP aging, inventory valuation, and fixed asset registers.

---

## Problem

GL-level opening balances post a single amount to Trade Receivables (1131). But to produce:
- **AR Aging Report** — need individual customer balances with invoice dates
- **AP Aging Report** — need individual supplier balances with bill dates
- **Inventory Valuation** — need item-level quantities and costs (sets initial WAC)
- **Fixed Asset Register** — need asset cost + accumulated depreciation

Without sub-ledger detail, these reports show a single lump sum with no breakdown.

---

## Architecture Decision: Party Context on JE Lines

### Current State

`journal_entry_lines` has no `customer_id` or `supplier_id` column. AR/AP balances are tracked only at the GL account level.

### Required Change

Add optional party context columns to `journal_entry_lines`:

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `party_type` | enum | yes | `customer` / `supplier` / `employee` |
| `party_id` | uuid | yes | References the party record |
| `source_document_date` | date | yes | Original invoice/bill date (for aging) |

**Constraint:** If `party_type` is set, `party_id` must also be set (and vice versa).

**Index:** `(tenant_id, party_type, party_id, posting_date)` — supports aging queries.

These columns are populated by:
1. Opening balance sub-ledger entries (this spec)
2. Sales invoice event listener (sets customer context)
3. Purchase bill event listener (sets supplier context)
4. Payment event listeners (sets party context on settlement lines)

---

## Sub-Ledger Opening Balance Types

### 1. AR Opening Balances (Customer)

**Endpoint:** `POST /tenant/opening-balances/receivables`

**Payload:**

```ts
{
  legalEntityId: string;
  asOfDate: string;
  balances: Array<{
    customerId: string;
    invoiceNumber?: string;      // Reference for identification
    invoiceDate: string;         // Original date (for aging calculation)
    currency: string;            // Transaction currency
    amount: string;              // Outstanding amount in TC
    exchangeRate?: string;       // Rate at invoice date (for FC invoices)
    description?: string;
  }>;
}
```

**Processing:**

1. Validate all customers exist and belong to tenant
2. For each balance line:
   - DR Trade Receivables (1131) with `party_type='customer'`, `party_id=customerId`
   - `source_document_date` = invoiceDate
   - Currency + exchange rate from input (or functional currency if omitted)
3. Sum all debits → CR Opening Balance Equity (3900)
4. Post as JE: `sourceDocumentType='OpeningBalance.AR'`

### 2. AP Opening Balances (Supplier)

**Endpoint:** `POST /tenant/opening-balances/payables`

**Payload:**

```ts
{
  legalEntityId: string;
  asOfDate: string;
  balances: Array<{
    supplierId: string;
    billNumber?: string;
    billDate: string;
    currency: string;
    amount: string;
    exchangeRate?: string;
    description?: string;
  }>;
}
```

**Processing:**

1. Validate all suppliers exist
2. For each balance line:
   - CR Trade Payables (2111) with `party_type='supplier'`, `party_id=supplierId`
   - `source_document_date` = billDate
3. Sum all credits → DR Opening Balance Equity (3900)
4. Post as JE: `sourceDocumentType='OpeningBalance.AP'`

### 3. Inventory Opening Balances

**Endpoint:** `POST /tenant/opening-balances/inventory`

**Payload:**

```ts
{
  legalEntityId: string;
  warehouseId: string;
  asOfDate: string;
  items: Array<{
    itemId: string;
    quantity: string;           // Opening stock quantity
    unitCost: string;           // Cost per unit (sets initial WAC)
    currency: string;           // Typically functional currency
  }>;
}
```

**Processing:**

1. Validate items exist and belong to tenant
2. For each item:
   - `totalCost = quantity × unitCost`
   - DR Inventory (1141) for totalCost
   - Set initial WAC in inventory costing table
   - Create stock movement record (type: `opening_balance`)
3. Sum all debits → CR Opening Balance Equity (3900)
4. Post as JE: `sourceDocumentType='OpeningBalance.Inventory'`

### 4. Fixed Asset Opening Balances

**Endpoint:** `POST /tenant/opening-balances/fixed-assets`

**Payload:**

```ts
{
  legalEntityId: string;
  asOfDate: string;
  assets: Array<{
    assetName: string;
    assetCategory: string;
    acquisitionDate: string;
    originalCost: string;
    accumulatedDepreciation: string;
    currency: string;
  }>;
}
```

**Processing:**

1. For each asset:
   - DR Fixed Asset account (per category) for `originalCost`
   - CR Accumulated Depreciation account for `accumulatedDepreciation`
   - Net book value = originalCost - accumulatedDepreciation
   - Create asset register entry
2. Net balancing amount → DR/CR Opening Balance Equity (3900)
3. Post as JE: `sourceDocumentType='OpeningBalance.FixedAssets'`

---

## Frontend — Extended Wizard

Extends the existing wizard (01-design.md) with sub-ledger tabs:

### Tab Navigation

| Tab | What | When |
|-----|------|------|
| General Ledger | Account-level balances (existing) | Always |
| Receivables | Customer-level AR balances | When AR accounts have balance |
| Payables | Supplier-level AP balances | When AP accounts have balance |
| Inventory | Item-level stock + costs | When inventory accounts have balance |
| Fixed Assets | Asset register opening | When FA accounts have balance |

### Receivables Tab

Table columns: Customer | Invoice # | Invoice Date | Currency | Amount | Rate

- Customer dropdown with search
- "Add Row" button for multiple invoices per customer
- Running total per customer and overall
- Aging preview: shows 30/60/90/120+ day buckets based on invoice dates

### Payables Tab

Same structure as Receivables but for suppliers/bills.

### Inventory Tab

Table columns: Item | Warehouse | Quantity | Unit Cost | Total Cost

- Item dropdown with search (only stocked items)
- Warehouse pre-selected from setup step
- WAC calculated and displayed (read-only)

---

## Defensive UX

- Warn if sub-ledger totals don't match GL-level balance for the same account
- Allow partial entry — user can enter GL balance first, sub-ledger detail later
- Show reconciliation status: "AR sub-ledger total (KWD 50,000) matches GL Trade Receivables (KWD 50,000)"
- Prevent duplicate customer/supplier entries for same invoice/bill number
- Currency defaults to entity's functional currency, changeable for FC invoices

---

## Permissions

Reuses existing permission: `accounting.journal.create` (same as GL opening balance).

---

## Design Decisions

- **Party context on JE lines** — adds minimal columns to existing table rather than creating separate sub-ledger tables. Keeps single source of truth in the GL.
- **Separate endpoints per type** — cleaner validation, clearer error messages, allows phased implementation.
- **Opening Balance Equity** — all sub-ledger entries balance through 3900, same as GL opening balances.
- **Inventory sets WAC** — opening balance is the baseline for WAC calculation. No prior cost history exists.
- **Invoice/bill dates preserved** — `source_document_date` enables aging reports from day one.
