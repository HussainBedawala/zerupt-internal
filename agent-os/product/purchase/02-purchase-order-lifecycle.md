# Purchase Order Lifecycle

## PO Header

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `number` | string | Sequential: `PO-0001` |
| `supplierId` | string | |
| `branchId` | string | |
| `warehouseId` | string | Destination warehouse for receiving |
| `status` | enum | See state machine |
| `currency` | string | Transaction currency |
| `exchangeRate` | decimal | Rate to functional currency at confirmation |
| `paymentTermsId` | string | Copied from supplier default, editable |
| `taxGroupId` | string | Default for new lines |
| `subtotal` | decimal | Sum of line net amounts |
| `taxTotal` | decimal | Sum of line tax amounts |
| `total` | decimal | `subtotal + taxTotal` |
| `notes` | string | |
| `approvedBy` | string | Manager who approved (if threshold exceeded) |
| `confirmedAt` | datetime | |
| `createdAt` | datetime | |

## PO Line

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `purchaseOrderId` | string | |
| `itemId` | string | |
| `description` | string | Free text override |
| `orderedQty` | decimal | |
| `receivedQty` | decimal | Updated by GRN confirmations |
| `returnedQty` | decimal | Updated by return confirmations |
| `unitPrice` | decimal | In transaction currency |
| `taxGroupId` | string | |
| `taxAmount` | decimal | Calculated per `accounting/02-tax-model.md` |
| `lineTotal` | decimal | `(orderedQty × unitPrice) + taxAmount` |

---

## State Machine

```
Draft → Confirmed → PartiallyReceived → Received → Closed
                  ↘                                ↗
Draft → Cancelled
Confirmed → Cancelled (if no GRNs exist)
```

| Transition | Guard |
|-----------|-------|
| Draft → Confirmed | At least one line. Supplier active. If total > approval threshold → manager PIN required. Emits `purchase.order.confirmed`. |
| Confirmed → PartiallyReceived | Auto-transition when first GRN confirmed and `receivedQty < orderedQty` on any line. |
| PartiallyReceived → Received | Auto-transition when `receivedQty ≥ orderedQty` on all lines. |
| Received → Closed | Manual action. Locks PO from further GRNs. |
| Confirmed → Closed | Manual short-close. Remaining unrecieved qty cancelled. |
| Draft → Cancelled | No side effects. |
| Confirmed → Cancelled | Only if zero GRNs exist for this PO. Emits `purchase.order.cancelled`. |

---

## Approval Threshold

| Setting | Description |
|---------|-------------|
| `po.approvalThreshold` | Tenant-configurable. POs with `total` above this value require manager PIN on confirmation. |

---

## Events Emitted

| Event | When | Ref |
|-------|------|-----|
| `purchase.order.confirmed` | Draft → Confirmed | Inventory increases `onOrder` qty |
| `purchase.order.cancelled` | Confirmed → Cancelled | Inventory decreases `onOrder` qty |

---

## Document Numbering

| Document | Default Prefix | Example |
|----------|---------------|---------|
| Purchase Order | `PO-` | `PO-0001` |

Sequential, no gaps. Prefix configurable per tenant.
