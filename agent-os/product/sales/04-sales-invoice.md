# Sales Invoice

## Invoice Header

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `number` | string | Sequential: `INV-0001` |
| `customerId` | string | |
| `branchId` | string | |
| `salesOrderId` | string | If invoicing from SO (nullable for standalone) |
| `status` | enum | `Draft`, `Confirmed` |
| `currency` | string | Transaction currency |
| `exchangeRate` | decimal | Rate at confirmation |
| `paymentTermsId` | string | |
| `dueDate` | date | Calculated: `confirmedAt + paymentTerms.dueDays` |
| `subtotal` | decimal | |
| `taxTotal` | decimal | |
| `total` | decimal | |
| `paidAmount` | decimal | Updated by receipt voucher postings |
| `balance` | decimal | `total - paidAmount` |
| `notes` | string | |
| `confirmedAt` | datetime | |
| `confirmedBy` | string | |
| `createdAt` | datetime | |

## Invoice Line

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `invoiceId` | string | |
| `salesOrderLineId` | string | If from SO |
| `itemId` | string | |
| `description` | string | Item name snapshot |
| `quantity` | decimal | |
| `unitPrice` | decimal | In transaction currency |
| `priceOverride` | boolean | If manually changed |
| `priceOverrideById` | string | Manager PIN if overridden |
| `warehouseId` | string | Source warehouse |
| `taxGroupId` | string | |
| `taxAmount` | decimal | |
| `lineTotal` | decimal | |
| `costAtSale` | decimal | WAC or FIFO cost at confirmation (see `inventory/04-cost-engine.md`) |

---

## State Machine

```
Draft → Confirmed
```

No reversal of invoice. Corrections via credit note (`05-credit-notes.md`).

| Transition | Guard |
|-----------|-------|
| Draft → Confirmed | `validatePeriod(confirmedAt)` must return `OPEN` or `SOFT_LOCKED` (see `accounting/08-period-control.md`). At least one line with `quantity > 0`. Customer active. Credit limit check. If price override → manager PIN. |

---

## Confirm Side Effects

On `Draft → Confirmed`:

1. Capture `costAtSale` per line from inventory cost engine
2. Emit `sales.invoice.confirmed` (see `08-event-mappings.md`)
3. Inventory: SALE movement — decrease stock, decrease committed qty (see `inventory/05-stock-movements.md` → Sale)
4. Accounting: journal entry — DR Trade Receivables / CR Product Sales + Output Tax + DR COGS / CR Inventory (see `accounting/07-event-mappings.md`)
5. If from SO: update SO line `invoicedQty` += invoice line `quantity`; SO status auto-transitions
6. Calculate `dueDate` from payment terms

---

## Standalone Invoice

Invoices can be created without a Sales Order. In this case:
- `salesOrderId` is null
- No stock reservation exists — stock deducted directly on confirmation
- Credit limit still enforced

---

## Price Override

If `unitPrice` differs from the pricing engine resolution:
- `priceOverride = true`
- Manager PIN required (`priceOverrideById`)

---

## Document Numbering

| Document | Default Prefix | Example |
|----------|---------------|---------|
| Sales Invoice | `INV-` | `INV-0001` |

Sequential, no gaps. Prefix configurable per tenant.
