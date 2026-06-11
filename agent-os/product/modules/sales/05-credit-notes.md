# Credit Notes

## Credit Note Header

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `number` | string | Sequential: `CN-0001` |
| `invoiceId` | string | Linked invoice (required) |
| `customerId` | string | From invoice |
| `branchId` | string | |
| `status` | enum | `Draft`, `Confirmed` |
| `type` | enum | `GoodsReturn`, `PriceAdjustment` |
| `currency` | string | From invoice |
| `exchangeRate` | decimal | Rate at confirmation |
| `reason` | string | Required |
| `subtotal` | decimal | |
| `taxTotal` | decimal | |
| `total` | decimal | |
| `confirmedAt` | datetime | |
| `confirmedBy` | string | |
| `approvedBy` | string | Manager PIN |
| `createdAt` | datetime | |

## Credit Note Line

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `creditNoteId` | string | |
| `invoiceLineId` | string | |
| `itemId` | string | |
| `creditQty` | decimal | Quantity credited |
| `unitPrice` | decimal | Original invoice price |
| `warehouseId` | string | Return destination (GoodsReturn only) |
| `taxGroupId` | string | |
| `taxAmount` | decimal | |
| `lineTotal` | decimal | |
| `returnCost` | decimal | Cost for COGS reversal (GoodsReturn only) |
| `serialNumbers` | array | If serial-tracked (GoodsReturn only) |

---

## Credit Note Types

| Type | Stock Effect | COGS Effect | Revenue Effect |
|------|-------------|-------------|----------------|
| **GoodsReturn** | +stock (SALE_RETURN) | DR Inventory / CR COGS | DR Sales Returns / CR Trade Receivables |
| **PriceAdjustment** | None | None | DR Sales Returns / CR Trade Receivables |

---

## State Machine

```
Draft → Confirmed
```

No reversal of credit note. If credit was incorrect, create a new invoice.

| Transition | Guard |
|-----------|-------|
| Draft → Confirmed | `validatePeriod(confirmedAt)` must return `OPEN` or `SOFT_LOCKED` (see `accounting/08-period-control.md`). At least one line with `creditQty > 0`. Manager PIN required (`approvedBy`). Credit qty per line ≤ invoice qty minus previously credited qty. |

---

## Partial Credits

- An invoice can have multiple credit notes
- Each credit line's `creditQty` validated against: `invoiceLine.quantity - sum(previousCredits.creditQty)`
- Invoice `balance` updated on confirmation

---

## Return Cost

For `GoodsReturn` type:
- WAC items → current WAC at time of return
- FIFO items → original cost layer if identifiable, else most recent cost
- See `accounting/05-cogs-logic.md`

---

## Confirm Side Effects

On `Draft → Confirmed`:

1. Emit `sales.creditNote.confirmed` (see `08-event-mappings.md`)
2. If `GoodsReturn`: Inventory — SALE_RETURN movement (see `inventory/05-stock-movements.md` → Sale Return)
3. Accounting: journal entry (see `accounting/07-event-mappings.md` → `sales.creditNote.confirmed`)
4. Update invoice `paidAmount` (credit applied) and `balance`

---

## Document Numbering

| Document | Default Prefix | Example |
|----------|---------------|---------|
| Credit Note | `CN-` | `CN-0001` |

Sequential, no gaps. Prefix configurable per tenant.
