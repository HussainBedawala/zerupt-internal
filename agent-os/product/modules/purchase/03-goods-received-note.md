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
| `hasSupplierInvoice` | boolean | **DECIDED TARGET, not yet shipped** — a WORKFLOW choice only ("bill it now" vs "bill it when the invoice arrives"). Every receipt accrues into GRN Accrual 2121 the same way; `true` additionally composes the bill through the same shared code in the same step. See "Accrual vs matched" below. |
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

**Accrual vs matched (DECIDED TARGET — implementation in progress, see `study/purchase/_hardening-log.md`):**
As shipped today, `hasSupplierInvoice = true` makes the receipt credit Trade Payables (2111)
directly, and `false` credits GRN Accrual (2121) for a later bill to clear. This made
`hasSupplierInvoice` an accounting axis, and a bill-matched receipt (`true`) can never be billed
(`assertGrnsBillable` refuses it) — so its payable was structurally impossible to pay through
Supplier Payments, which allocates only against `purchaseInvoiceId`.

The decided fix generalises the Direct Purchase pattern: EVERY receipt takes the accrual path
(always credits 2121), and `hasSupplierInvoice = true` additionally composes the bill through the
same shared machinery in one step, so a matched receipt still ends up with a real, payable
`purchase_invoices` row. `hasSupplierInvoice` becomes purely a workflow choice — bill immediately
vs. bill later — never a different ledger path. See `accounting/07-event-mappings.md`.

---

## Document Numbering

| Document | Default Prefix | Example |
|----------|---------------|---------|
| Goods Received Note | `GRN-` | `GRN-0001` |

Sequential, no gaps. Prefix configurable per tenant.
