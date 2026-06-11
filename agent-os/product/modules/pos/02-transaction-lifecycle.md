# Transaction Lifecycle

> How a POS transaction moves from cart to completed receipt, including hold, recall, and void.

## Transaction

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Unique transaction identifier |
| `transactionNumber` | String | Yes | `{registerId}-{shiftNumber}-{sequence}` |
| `shiftId` | UUID | Yes | Shift this transaction belongs to |
| `registerId` | UUID | Yes | Register |
| `cashierId` | UUID | Yes | Cashier who processed the transaction |
| `customerId` | UUID | No | Linked customer (for loyalty, store credit) |
| `status` | Enum | Yes | `Draft`, `Held`, `Completed`, `Voided` |
| `type` | Enum | Yes | `Sale`, `Return`, `Exchange` |
| `subtotal` | Decimal | Yes | Sum of line totals before tax |
| `taxTotal` | Decimal | Yes | Sum of line taxes |
| `discountTotal` | Decimal | Yes | Sum of all discounts applied |
| `grandTotal` | Decimal | Yes | `subtotal + taxTotal - discountTotal` |
| `currency` | String | Yes | Transaction currency code |
| `createdAt` | DateTime | Yes | When cart was started |
| `completedAt` | DateTime | No | When payment was finalized |
| `voidedAt` | DateTime | No | When voided |
| `voidedById` | UUID | No | Manager who authorized void |
| `voidReason` | String | No | Required when voiding |
| `originalTransactionId` | UUID | No | For returns/exchanges — links to original sale |
| `notes` | String | No | Cashier notes |

## Transaction Line

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Unique line identifier |
| `transactionId` | UUID | Yes | Parent transaction |
| `lineNumber` | Integer | Yes | Sequential within transaction |
| `itemId` | UUID | Yes | Item from inventory |
| `variantId` | UUID | No | Variant if matrix item |
| `serialNumber` | String | No | If serial-tracked item |
| `batchId` | UUID | No | If batch-tracked item |
| `description` | String | Yes | Item name at time of sale (snapshot) |
| `quantity` | Decimal | Yes | Positive for sales, negative for returns |
| `unitPrice` | Decimal | Yes | Price per unit (resolved from pricing engine) |
| `priceOverride` | Boolean | Yes | Whether price was manually changed |
| `priceOverrideById` | UUID | No | Manager who approved override |
| `discountAmount` | Decimal | Yes | Line-level discount amount |
| `taxGroupId` | UUID | Yes | Tax group applied |
| `taxAmount` | Decimal | Yes | Calculated tax for this line |
| `lineTotal` | Decimal | Yes | `(quantity × unitPrice) - discountAmount + taxAmount` |
| `costAtSale` | Decimal | Yes | Item cost at time of sale (WAC or FIFO) |

## Transaction Status Flow

```
Draft → Completed
Draft → Held → Draft → Completed
Draft → Voided (before payment only)
Completed → Voided (manager PIN required)
```

### Draft (Active Cart)

1. Cashier scans/searches items — lines added to transaction
2. Each line: resolve price (see `inventory/07-pricing-engine.md`), calculate tax (see `accounting/02-tax-model.md`)
3. Transaction stays `Draft` until payment is finalized

### Adding Items

| Method | Behavior |
|--------|----------|
| Barcode scan | Lookup via `inventory/06-serial-batch.md` barcode index → add line |
| Item search | Search by name/SKU → select → add line |
| Quantity change | Update existing line quantity (not a new line) |
| Remove line | Delete line from draft (allowed only in `Draft` status) |
| Price override | Requires manager PIN → sets `priceOverride = true` |

### Hold / Recall

1. **Hold**: Transaction status → `Held`, assigned a hold label (cashier enters or auto-generated)
2. Held transactions are visible on the register that held them
3. **Recall**: Select from held list → status back to `Draft` → continue editing
4. Maximum 10 held transactions per register
5. Held transactions do not reserve stock
6. Held transactions must be recalled or voided before shift close

### Checkout → Payment → Complete

1. Cashier initiates checkout
2. System displays grand total
3. One or more payments applied (see `03-payment-methods.md`)
4. When total payments >= grand total:
   - Status → `Completed`
   - `completedAt` timestamp set
   - Change calculated and returned (cash only)
   - Receipt generated (see `07-receipt-model.md`)
   - System emits `pos.transaction.completed`
   - Cash drawer opens (if cash payment)
5. Transaction is now immutable

### Void

| Scenario | Rule |
|----------|------|
| Void before payment | Cashier can void own transaction, no PIN needed |
| Void after completion | Manager PIN required |
| Void timing | Within same shift only (cross-shift voids use Returns) |
| Void action | Status → `Voided`, `voidedAt` + `voidedById` + `voidReason` set |
| Void event | System emits `pos.void.completed` (reverses accounting + inventory) |
| Void receipt | Void receipt printed with "VOID" watermark |

## Rules

1. Transaction number is unique per tenant, sequential per shift
2. Completed transactions are immutable — no field can be edited
3. Voided transactions are immutable — void adds metadata but doesn't delete
4. Line prices are snapshots — if the price list changes after the line is added, the line keeps its original price
5. `costAtSale` is captured at completion time from the cost engine
6. Serial items: one serial per line, quantity must be 1
7. Offline transactions get a local UUID; server assigns final `transactionNumber` on sync (see `06-offline-mode.md`)
