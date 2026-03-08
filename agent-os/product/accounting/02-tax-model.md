# Tax Configuration Model

## Entities

### TaxCode

A single tax component.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `code` | string | Short code: `VAT5`, `CGST9`, `ST-CA` |
| `name` | string | Display name: "Standard VAT", "Central GST 9%" |
| `rate` | decimal | Percentage: `5.00` = 5% |
| `type` | enum | `Exclusive` (added on top) or `Inclusive` (embedded in price) |
| `category` | enum | `Standard`, `ZeroRated`, `Exempt`, `ReverseCharge`, `NonRecoverable` |
| `outputAccountId` | string | Liability account for tax collected on sales |
| `inputAccountId` | string | Asset account for tax paid on purchases |
| `jurisdiction` | string | Free text: "UAE", "California", "Maharashtra" |
| `isActive` | boolean | |

### TaxGroup

Bundle of tax codes applied together (e.g., India GST = CGST + SGST).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `name` | string | "Standard GST 18%", "UAE VAT" |
| `components` | array | `[{ taxCodeId, isCompound }]` |
| `isDefault` | boolean | Default for new items |

`isCompound = true` → this component is calculated on base + all prior non-compound components.

### TaxRate

Versioned rates (rates change over time).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `taxCodeId` | string | |
| `rate` | decimal | |
| `effectiveFrom` | date | |
| `effectiveTo` | date | null = still active |

Rate lookup always uses the **transaction date**, not today.

## Calculation

**Exclusive** (tax added on top of base amount `B`):
```
Non-compound: tax = B × rate / 100
Compound:     tax = (B + sum of prior non-compound taxes) × rate / 100
Line total = B + sum of all taxes
```

**Inclusive** (tax embedded in price, all non-compound):
```
combinedRate = sum of all component rates
netAmount = lineTotal / (1 + combinedRate / 100)
Each tax = netAmount × rate / 100
```

## Exemptions

| Level | Effect |
|-------|--------|
| Item-level | Override tax group to zero-rate |
| Customer-level | No output tax on sales to this customer |
| Category-level | All items in category inherit exemption |
| Transaction-type | e.g., exports are zero-rated |

Priority: Item > Customer > Category > Default tax group.

## Journal Entry Flow

**Sales:**
```
DR  Accounts Receivable          [total incl. tax]
CR  Sales Revenue                [net before tax]
CR  Output Tax Payable           [tax per component]
```

**Purchases:**
```
DR  Inventory/Expense            [net before tax]
DR  Input Tax Recoverable        [recoverable tax]
DR  Expense                      [non-recoverable tax, if any]
CR  Accounts Payable             [total incl. tax]
```

**Reverse charge:**
```
DR  Input Tax Recoverable        [tax]
CR  Output Tax Payable           [tax]
```
Net zero, but both reported on tax return.

## Country Examples

| Country | Setup |
|---------|-------|
| Kuwait (no VAT) | No tax codes. Default group = "No Tax" at 0%. |
| UAE | One code: "VAT" 5% exclusive. |
| Saudi Arabia | One code: "VAT" 15% exclusive. |
| India | CGST 9% + SGST 9% (intra-state), IGST 18% (inter-state), Cess varies. |
| USA | Codes per state/county/city. Rate by customer shipping address. |
