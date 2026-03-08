# Goods Received Note (GRN)

## GRN Header

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `number` | string | Sequential: `GRN-0001` |
| `purchaseOrderId` | string | Linked PO |
| `supplierId` | string | From PO |
| `branchId` | string | |
| `warehouseId` | string | Receiving warehouse (from PO, editable) |
| `status` | enum | `Draft`, `Confirmed` |
| `currency` | string | From PO |
| `exchangeRate` | decimal | Rate at GRN confirmation |
| `hasSupplierInvoice` | boolean | If false → accrual posting |
| `supplierInvoiceNumber` | string | If matched |
| `subtotal` | decimal | |
| `taxTotal` | decimal | |
| `total` | decimal | |
| `confirmedAt` | datetime | |
| `confirmedBy` | string | |
| `approvedBy` | string | Manager PIN if over-receipt |
| `createdAt` | datetime | |

## GRN Line

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `grnId` | string | |
| `purchaseOrderLineId` | string | |
| `itemId` | string | |
| `receivedQty` | decimal | |
| `unitPrice` | decimal | From PO line (or supplier invoice if matched) |
| `taxGroupId` | string | |
| `taxAmount` | decimal | |
| `lineTotal` | decimal | |
| `serialNumbers` | array | If serial-tracked (see `inventory/06-serial-batch.md`) |
| `batchInfo` | object | `{ batchNumber, expiryDate }` if batch-tracked |

---

## State Machine

```
Draft → Confirmed
```

No reversal of GRN. Corrections via `05-purchase-returns.md`.

| Transition | Guard |
|-----------|-------|
| Draft → Confirmed | `validatePeriod(confirmedAt)` must return `OPEN` or `SOFT_LOCKED` (see `accounting/08-period-control.md`). At least one line with `receivedQty > 0`. Over-receipt check (see below). |

---

## Over-Receipt Tolerance

| Setting | Description |
|---------|-------------|
| `grn.overReceiptTolerancePercent` | Tenant-configurable. Default: `0` (exact match). |

| Rule | Detail |
|------|--------|
| `receivedQty ≤ orderedQty` | Always allowed. |
| `receivedQty ≤ orderedQty × (1 + tolerance%)` | Allowed. |
| `receivedQty > orderedQty × (1 + tolerance%)` | Requires manager PIN (`approvedBy`). |

Check is per line against remaining unreceived qty: `remainingQty = orderedQty - previouslyReceivedQty`.

---

## Confirm Side Effects

On `Draft → Confirmed`:

1. Emit `purchase.grn.confirmed` (see `08-event-mappings.md`)
2. Inventory: GRN_RECEIPT movement (see `inventory/05-stock-movements.md` → GRN Receipt)
3. Accounting: journal entry (see `accounting/07-event-mappings.md` → `purchase.grn.confirmed`)
4. Update PO line `receivedQty` += GRN line `receivedQty`
5. PO status auto-transitions if applicable

**Accrual vs matched:** If `hasSupplierInvoice = false`, accounting posts to GRN Accrual (2121). When invoice arrives later, accrual is reversed and Trade Payables (2111) is credited. See `accounting/07-event-mappings.md`.

---

## Document Numbering

| Document | Default Prefix | Example |
|----------|---------------|---------|
| Goods Received Note | `GRN-` | `GRN-0001` |

Sequential, no gaps. Prefix configurable per tenant.
