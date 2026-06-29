# Chapter 2 — Stock Handoff to Inventory

## How the Handoff Works

GRN confirm does NOT call inventory directly. It emits `purchase.grn.confirmed` via:
1. **Outbox insert** (inside the tx — durable, survives crash): `grns.service.ts:457–463`
2. **Post-commit fast-path emit** (in-process, same request): `grns.service.ts:484–493`

The inventory domain listener (`InventoryDomainEventListener`) consumes the event and writes stock ledger entries. The purchase service never touches inventory tables directly.

## Event Payload: lineItems

File: `grns-events.ts:150`

```ts
lineItems: lines.map((line) => ({
  itemId: line.itemId,
  warehouseId: line.warehouseId,
  quantity: line.receivedQty,          // BASE units
  unitCost: line.unitCost,             // per-base cost seed
  sourceDocumentLineId: line.id,       // GRN line id for attribution
  // F6 lot/serial forwarding:
  batchNo?: line.batchNumber,
  expiryDate?: line.expiryDate,
  serialNumbers?: line.serialNumbers,
}))
```

## Inventory Ledger Dimensions (per GRN line)

| Dimension | Source | EXISTS? |
|-----------|--------|---------|
| itemId | grn_lines.item_id | EXISTS |
| warehouseId | grn_lines.warehouse_id (per-line, overridable from PO default) | EXISTS |
| quantity (base units) | grn_lines.received_qty | EXISTS |
| unitCost | grn_lines.unit_cost (receipt-time, may differ from PO price) | EXISTS |
| batchNumber | grn_lines.batch_number | EXISTS (capture) |
| expiryDate | grn_lines.expiry_date | EXISTS (capture) |
| serialNumbers | grn_lines.serial_numbers (jsonb[]) | EXISTS (capture) |
| binId | NOT in grn_lines schema | REQUIRES |

## Pack Unit Conversion

File: `grns.service.ts:207–248`

`receivedQty` in DB is always **base units**. When a user enters a pack quantity (e.g., 5 cartons of 12), `resolvePackUnit()` computes `baseQty = unitQty × conversionFactor` before insert. The pack-unit snapshot columns (`unitPackId`, `unitName`, `unitQty`, `conversionFactor`) are stored on the line for display/audit but the inventory engine only sees base units.

## Cost at Receipt

- `unitCost` on the GRN line defaults from `purchaseOrderLine.unitPrice` but is **editable** (`addLine` lets the user override via `input.unitCost`).
- This cost is the seed for the inventory cost layer (WAC numerator or FIFO layer opening cost).
- The accounting DR Inventory uses `grn.subtotal` = Σ(receivedQty × unitCost) — `grns-events.ts:124`.

## Idempotency of the Stock Handoff

The `purchase.grn.confirmed` event carries a **deterministic eventId**:
```ts
eventId: deterministicUuidV5(grn.id, GRN_CONFIRMED_NS)
```
(`grns-events.ts:131`)

The inventory engine and accounting listener both deduplicate on `eventId`. A retry (outbox re-play or fast-path re-emit after partial failure) is a no-op — no double-stock credit.

The outbox insert and the fast-path emit share the same pre-built payload (`buildGrnConfirmedPayload` called once inside the tx, returned, then passed to `emitGrnConfirmed`), so both use the identical `eventId`. `grns.service.ts:453–493`

## Transactional Safety

| Risk | Mitigation |
|------|-----------|
| GRN confirmed but inventory not updated (process crash) | Outbox row inside tx → poller retries delivery |
| Stock updated twice (duplicate event) | Deterministic `eventId`; inventory engine deduplicates |
| Serial unit created but GRN rolled back | `createSerialUnits` runs inside the confirm tx — it rolls back with the GRN |
| Concurrent GRNs inflating stock twice | Inventory engine serialises per item; WAC is recalculated on each inbound |

## REQUIRES / Gaps

| Gap | Detail |
|-----|--------|
| Bin-level receipt | `warehouseId` per line exists; `binId` column absent from grn_lines schema. REQUIRES. |
| Inventory engine stock ledger details | Listener details are in the inventory module — beyond scope of this layer. |
| Cost override validation | No guard preventing negative `unitCost` on a GRN line at the service layer (DB CHECK `>= 0` is the only guard). REQUIRES service-layer minimum. |
| Multiple warehouses in one GRN | EXISTS (per-line warehouseId). Works. |
