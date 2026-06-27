# Chapter 09 — Open Questions & Decisions for the Layer-2 Audit

## Confirmed gaps (require decisions)

### G1 — Batch/Serial attribution threading (CRITICAL)

Every movement type posts `batchId = NULL` and `serialNumberId = NULL` on the ledger.
The Layer-0 reconciliation invariant (`item_batches.qtyRemaining == Σ ledger.quantity
WHERE batch_id`) can never hold. Batch recall, expiry reporting, and serial transaction
history are broken.

**Decision needed:** Thread attribution now (this layer) or defer to a dedicated
traceability sprint? Threading is a prerequisite for FEFO picking and batch recall.
Recommended: thread now. It touches every movement caller but is mechanical.

### G2 — No formal reversal workflow (HIGH)

`reversesEntryId` on `stock_ledger_entries` is never written. No
`POST /stock-adjustments/:id/reverse` endpoint. Stockkeepers must create compensating
entries manually with no audit link between the original and the correction.

**Decision needed:** Implement a reversal service that:
1. Reads the original adjustment's ledger entries.
2. Creates equal-and-opposite entries with `reversesEntryId` pointing to the originals.
3. Prevents double-reversal (the partial unique index on `reversesEntryId` enforces
   one reversal per entry at DB level).

### G3 — No reservation / ATP system (HIGH for multi-order)

No `stock_reservations` table, no `reserved_qty` on materialized levels.

**Decision needed:** Is the June 15 MVP target single-register POS only? If yes, defer.
If B2B or layaway are in scope, this must be built. Design is in ch. 08.

### G4 — No automatic FEFO batch picker (HIGH for batch-tracked items)

No `BatchPickerService.pick()`. Users must manually specify which batch to issue from,
or the UI picks arbitrarily.

**Decision needed:** Build FEFO picker as part of this layer's hardening? Prerequisite:
G1 (attribution threading) must land first so picked batches are recorded.

### G5 — Transit-loss write-off on short receipts (MED)

Transfer short-receipt (qtyReceived < qtySent) has no automated write-off ledger entry.
The transit loss is implicitly absorbed into the "sent but not received" gap without
a formal posting.

**Decision needed:** Auto-generate an `adjustment_decrease` with reason `transit_loss`
when qtyReceived < qtySent on transfer receive? Or leave to manual correction?

### G6 — Assembly/consumption movement types (MED)

`assembly_in`, `assembly_out`, `consumption` are in the enum but no module emits them.
The `isReclassificationMovement()` guard silently skips COGS for these — safe for now.
No assembly module is planned for MVP.

**Decision needed:** Add explicit guard: if movementType is `assembly_*` or `consumption`,
throw a NotImplementedException rather than silently accepting it. Prevents future callers
from accidentally posting uncosted movements.

### G7 — POS void vs return indistinguishable in ledger (LOW)

Both post `sale_return` from `sourceDocumentType='pos'`. A void of a sale and a genuine
customer return look identical in the ledger.

**Decision needed:** Add `void_correction` movement type or use the
`sourceDocumentType` field to distinguish? Or is this acceptable for the retail context?

### G8 — Soft-locked period override on adjustments (LOW, deferred)

`assertPeriodOpen` in `StockAdjustmentsService` throws `ConflictException` on
soft-locked periods. The accounting module's engine supports a
`softLockOverride` pattern. Adjustments do not.

**Decision needed:** Wire the same `softLockOverride` pattern to adjustments so a
manager can post a correction to a soft-locked month without unlocking the period?
Or keep as-is (the accounting reviewer approved the same restriction for adjustments).

## Questions for the audit

1. Does `item_batches.qtyRemaining` have a CHECK >= 0 constraint? (Not visible in the
   schema comment — verify in migration.) If not, a decrement race can corrupt it.

2. `stock_transfer_lines.status` is varchar with a CHECK constraint — should it be a
   Postgres enum for type safety and migration tracking?

3. When a serial is transferred (`in_transit` status), and the transfer is cancelled
   (only from `draft` — so this cannot happen post-send), what resets serial status?
   Verify `StockTransfersService` handles all serial state transitions correctly.

4. The `deriveLineEventId` fallback to `lineIndex` on missing `sourceDocumentLineId`
   (ch. 01 note): which emitters omit it? Audit all `InventoryDomainEvent` emitters.

5. `item_batches` post-Layer-1 has a unique key on `(tenantId, itemId,
   lower(btrim(batchNo)))` — warehouseId dropped. Does every caller that creates batches
   use the new key? Are there callers that still create one batch row per warehouse?

## Audit scope checklist

- [ ] Verify all movement caller payloads for batchId/serialNumberId fields (G1)
- [ ] Verify `StockTransfersService.receive()` serial status transitions
- [ ] Verify `item_batches.qtyRemaining >= 0` CHECK constraint
- [ ] Verify `deriveLineEventId` callers that omit `sourceDocumentLineId`
- [ ] Verify `isReclassificationMovement()` covers all future-proofed types
- [ ] Verify transfer status is Postgres enum (not just varchar CHECK)
- [ ] Check if `assembly_*` / `consumption` needs a NotImplemented guard
