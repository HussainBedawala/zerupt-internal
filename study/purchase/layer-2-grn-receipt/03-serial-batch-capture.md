# Chapter 3 — Serial / Batch / Expiry Capture at Receipt

## Schema Columns (grn_lines)

File: `erp/packages/db/src/schema/purchase.ts:963`

| Column | Type | Purpose |
|--------|------|---------|
| `serial_numbers` | jsonb (`string[]`) | Array of serial numbers for serial-tracked items |
| `batch_number` | varchar(100) | Lot/batch identifier for batch-tracked items |
| `expiry_date` | date | Expiry date for perishables / pharma |
| `warranty_months` | integer | Warranty duration (serial-tracked items) |
| `warranty_terms` | text | Free-text warranty conditions |

## Validation at Confirm (serial items only)

File: `grns.service.ts:822–861`

The `validateSerialCounts` method runs inside the confirm transaction:

1. Resolve tracking type for each distinct `itemId` in the GRN lines.
2. For each serial-tracked line:
   - `receivedQty` must be a whole number (no fractional serial items).
   - `serialNumbers.length === receivedQty` (exact count required).
   - `new Set(serials).size === serials.length` (no duplicates within the line).
3. Non-serial lines are ignored (no validation on `batchNumber` / `expiryDate` at confirm time).

## Serial Unit Creation (at confirm, atomic)

File: `grns.service.ts:869–896`

After `validateSerialCounts`, `createSerialUnits` runs in the **same confirm transaction**:

```ts
await this.serialAllocation.createForReceipt(tx, tenantId, {
  itemId, warehouseId,
  serialNos: line.serialNumbers,
  acquisitionCost: line.unitCost,
  purchaseDocType: "grn",
  purchaseDocId: line.grnId,
  warrantyMonths, warrantyTerms,
});
```

The `(tenant, item, serialNo)` unique constraint is the **collision guard**: if two concurrent GRNs receive the same serial number, the second confirm's INSERT raises `23505` → the entire second GRN confirm rolls back. No partial commit, no orphaned serial record.

Comment: `grns.service.ts:443–447`:
> "Create serial units ATOMICALLY in this same confirm tx (before any financial posting). The (tenant,item,serialNo) unique constraint fires here, so two concurrent GRNs receiving the same serial → the second's INSERT raises 23505 and this whole confirm rolls back."

## Batch Capture (no deep validation at GRN level)

- `batchNumber` and `expiryDate` are stored in the GRN line.
- They are forwarded in the `purchase.grn.confirmed` event `lineItems` array (`grns-events.ts:158–161`).
- The inventory listener (`InventoryDomainEventListener`) performs the actual `item_batches` record find-or-create on its side.
- There is **no server-side validation** at GRN confirm that the batch is non-empty, non-duplicate, or has a future expiry. The GRN service is capture-only for batch.

## Event Fan-Out

`grns-events.ts:150–165` — the `lineItems` in the event payload forward:
- `batchNo` → inventory engine materialises `item_batches` master record if it doesn't exist.
- `expiryDate` → stored on the batch record.
- `serialNumbers` → inventory engine attributes the GRN_RECEIPT movement to the specific serial units that were just created by `createSerialUnits`.

## EXISTS vs REQUIRES

| Feature | Status |
|---------|--------|
| Serial count validation at confirm | EXISTS |
| Serial duplicate guard (unique constraint) | EXISTS |
| Serial unit creation in confirm tx | EXISTS |
| Batch capture (batchNumber + expiryDate) | EXISTS (capture + forward) |
| Batch uniqueness validation at receipt | REQUIRES — the GRN service does not validate if the batch was already received elsewhere |
| Expiry date future-only validation | REQUIRES — no CHECK constraint or service guard |
| Batch-tracked item count validation | REQUIRES — unlike serials, no count check (N batches per line not enforced) |
| Warranty data forwarded to serial unit | EXISTS (warrantyMonths + warrantyTerms threaded via `createForReceipt`) |
| Serial number format validation | REQUIRES — any string accepted; no regex/length guard at service layer |
