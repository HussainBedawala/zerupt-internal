# Sales Order Lifecycle

## SO Header

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `number` | string | Sequential: `SO-0001` |
| `customerId` | string | |
| `branchId` | string | |
| `quotationId` | string | If converted from quotation |
| `status` | enum | See state machine |
| `currency` | string | Transaction currency |
| `exchangeRate` | decimal | Rate at confirmation |
| `paymentTermsId` | string | Copied from customer default, editable |
| `taxGroupId` | string | Default for new lines |
| `subtotal` | decimal | |
| `taxTotal` | decimal | |
| `total` | decimal | |
| `notes` | string | |
| `approvedBy` | string | Manager who approved (if threshold exceeded) |
| `confirmedAt` | datetime | |
| `createdAt` | datetime | |

## SO Line

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `salesOrderId` | string | |
| `itemId` | string | |
| `description` | string | Free text override |
| `orderedQty` | decimal | |
| `invoicedQty` | decimal | Updated by invoice confirmations |
| `unitPrice` | decimal | In transaction currency |
| `warehouseId` | string | Source warehouse for this line |
| `taxGroupId` | string | |
| `taxAmount` | decimal | Calculated per `accounting/02-tax-model.md` |
| `lineTotal` | decimal | `(orderedQty × unitPrice) + taxAmount` |

---

## State Machine

```
Draft → Confirmed → PartiallyInvoiced → Invoiced → Closed
                  ↘                                ↗
Draft → Cancelled
Confirmed → Cancelled (if no invoices exist)
```

| Transition | Guard |
|-----------|-------|
| Draft → Confirmed | At least one line. Customer active. Credit limit check (see `01-customer-model.md`). If total > approval threshold → manager PIN required. Emits `sales.order.confirmed`. |
| Confirmed → PartiallyInvoiced | Auto-transition when first invoice confirmed and `invoicedQty < orderedQty` on any line. |
| PartiallyInvoiced → Invoiced | Auto-transition when `invoicedQty ≥ orderedQty` on all lines. |
| Invoiced → Closed | Manual action. Locks SO from further invoices. |
| Confirmed → Closed | Manual short-close. Remaining uninvoiced qty cancelled. Releases committed stock. |
| Draft → Cancelled | No side effects. |
| Confirmed → Cancelled | Only if zero invoices exist for this SO. Emits `sales.order.cancelled`. |

---

## Stock Reservation

On `Draft → Confirmed`:
- Inventory increases `committed` qty for each line item at the specified warehouse
- Committed stock is not available for other orders (reduces available qty)

On `Confirmed → Cancelled`:
- Inventory decreases `committed` qty (releases reservation)

On invoice confirmation:
- Committed qty decreases by invoiced qty (stock physically deducted)

---

## Approval Threshold

| Setting | Description |
|---------|-------------|
| `so.approvalThreshold` | Tenant-configurable. SOs with `total` above this value require manager PIN on confirmation. |

---

## Events Emitted

| Event | When | Ref |
|-------|------|-----|
| `sales.order.confirmed` | Draft → Confirmed | Inventory increases `committed` qty |
| `sales.order.cancelled` | Confirmed → Cancelled | Inventory decreases `committed` qty |

---

## Document Numbering

| Document | Default Prefix | Example |
|----------|---------------|---------|
| Sales Order | `SO-` | `SO-0001` |

Sequential, no gaps. Prefix configurable per tenant.
