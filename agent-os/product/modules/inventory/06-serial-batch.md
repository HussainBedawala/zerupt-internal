# Serial & Batch Tracking

## When to Use

| Tracking | Use Case | Examples |
|----------|---------|---------|
| **None** | Most items | Clothing, food, stationery |
| **Serial** | Individual unit tracking | IMEI, electronics, high-value items |
| **Batch** | Group tracking with shared attributes | Food lots, pharmaceuticals, chemicals |

Configured per item. Cannot change after transactions exist (would require data migration).

---

## Serial Numbers

### Serial Number Record

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `itemId` | string | |
| `serialNumber` | string | The actual serial/IMEI value. Unique within tenant. |
| `status` | enum | See lifecycle below |
| `warehouseId` | string | Current location |
| `purchaseDocumentId` | string | GRN that brought this in |
| `saleDocumentId` | string | Invoice/POS transaction that sold this |
| `cost` | decimal | Acquisition cost of this specific unit |
| `notes` | string | |
| `createdAt` | datetime | |

### Serial Lifecycle

```
Available → Reserved → Sold
                         ↓
                      Returned → Available
```

| Status | Description |
|--------|-------------|
| `Available` | In stock, can be sold |
| `Reserved` | Reserved by a sales order (not yet delivered) |
| `Sold` | Sold to a customer |
| `Returned` | Returned from customer, back in stock → becomes `Available` |
| `Defective` | Marked defective, removed from sellable stock |
| `InTransit` | Being transferred between locations |

### Serial Rules

| Rule | Detail |
|------|--------|
| Cannot sell without selecting serial | POS/Sales must specify which serial numbers |
| Cannot sell same serial twice | Blocked at DB level |
| Negative stock impossible | Each serial is one physical unit |
| FIFO not applicable | Each serial has its own cost |
| COGS = serial's individual cost | Not WAC |
| Return must reference the original serial | Validated against sale document |

### Claim-at-Confirm Lifecycle (authoritative)

Serial create / claim / return happens **atomically inside the document's own
confirm transaction**, before any financial posting — NOT in an async event
listener. This is the single source of truth for "who owns this unit".

| Document confirm | Serial transition (in the SAME tx as the doc + stock move) |
|------------------|------------------------------------------------------------|
| GRN confirm | INSERT one `Available` unit per serial (cost = line unit cost). The `(tenant,item,serialNo)` unique constraint fires here, so two concurrent GRNs of the same serial → the second rolls back. |
| Sales invoice confirm | Guarded UPDATE `Available/Reserved → Sold`, asserting rows-affected === qty. Two concurrent invoices for the same serial → exactly one commits, the other rolls back with **no financial posting**. Sums acquisition costs for specific-id COGS. |
| Credit-note (goods return) confirm | Guarded UPDATE `Sold → Returned`, **relocating the unit to the return warehouse** and clearing the sale link. A never-sold serial rolls the confirm back. |
| POS sale / return | Same claims, inside the POS confirm tx (`PosSerialNumbersService`). |

The async inventory fan-out listener moves stock + posts the JE only; it **never
mutates serials**. This eliminates double-sell, poison-retries, and partial
commits that arise when serial state lives in a separate async transaction.

Imported opening stock (CSV) creates `Available` serial rows inside the posting
transaction (`purchaseDocType = 'opening'`), so imported serial stock is
immediately sellable.

### Serial Number Entry

**On GRN receipt:** Enter serial numbers one by one (manual) or scan (barcode/IMEI scanner). Count of serials must match received quantity.

**On sale:** Select from available serials for the item at that location. POS shows a serial picker when the item is added to cart.

---

## Batch / Lot Tracking

### Batch Record

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `itemId` | string | |
| `batchNumber` | string | Supplier's batch/lot number |
| `warehouseId` | string | |
| `expiryDate` | date | null if not applicable |
| `manufacturingDate` | date | null if not applicable |
| `supplierBatchRef` | string | Supplier's own reference |
| `remainingQty` | decimal | Qty still in this batch |
| `unitCost` | decimal | Cost of this batch (FIFO layer) |
| `grnId` | string | GRN that created this batch |
| `status` | enum | `Active`, `Expired`, `Exhausted` |

### Batch Consumption (FIFO)

When selling or consuming batch-tracked items:
1. Order batches by `expiryDate` ascending (earliest expiry first — FEFO)
2. If no expiry, order by `createdAt` ascending (standard FIFO)
3. Consume from oldest batch first
4. Partial batch consumption: update `remainingQty`
5. COGS = sum of (consumed qty × batch unit cost)

### Batch Rules

| Rule | Detail |
|------|--------|
| Auto-uses FIFO | Batch items always use FIFO valuation |
| Expiry alerts | System alerts when batch is within X days of expiry (configurable) |
| Expired batches | Status set to `Expired`. Blocked from sale. Requires adjustment (write-off). |
| Cannot mix batches in one sale line | Each sale line consumes from one or more batches (tracked) |
| Return to original batch | If identifiable; otherwise to a new batch |

### Expiry Handling

Daily job checks all active batches:
- Within threshold (e.g., 30 days of expiry) → alert: "Expiring Soon"
- Past expiry date → status = `Expired`, alert: "Expired — Action Required"
- Expired items require stock adjustment (write-off or disposal) to remove from sellable stock
