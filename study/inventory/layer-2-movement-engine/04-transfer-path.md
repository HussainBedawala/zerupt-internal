# Chapter 04 — Transfer Path (Two-Legged, In-Transit)

## Schema

`packages/db/src/schema/stock-transfers.ts`

- **Header** (`stock_transfers`): fromWarehouseId, toWarehouseId, status lifecycle
  (`draft → sent → received | cancelled`), sentAt/sentBy, receivedAt/receivedBy.
- **Lines** (`stock_transfer_lines`): itemId, qtySent, qtyReceived (nullable until
  received), outboundUnitCost (WAC captured at send time), discrepancyReason,
  serialNumbers (jsonb), pack-unit snapshot columns.

Status check constraint: `IN ('draft', 'sent', 'received', 'cancelled')`.
Warehouse check: `fromWarehouseId <> toWarehouseId`.

## Two-legged posting logic

### Leg 1 — Send (transfer_out)

`StockTransfersService.send()`:

1. Validates status is `draft`.
2. For each line: reads current WAC from materialized level.
3. Emits `inventory.stock.outbound` with `movementType='transfer_out'`.
   Engine's `applyOutbound` runs — decrements source warehouse on-hand, writes
   negative-qty ledger entry.
4. Captures `outboundUnitCost` (the WAC at send time) on each transfer line row.
5. Updates `materialized_stock_levels.inTransit` (+qty) at the **destination**
   warehouse — informational only, does not affect WAC or ledger value.
6. Status → `sent`.

### Leg 2 — Receive (transfer_in)

`StockTransfersService.receive()`:

1. Validates status is `sent`.
2. For each line: uses the stored `outboundUnitCost` (NOT re-reading current WAC) —
   this is the cost-neutral design: the same cost that left the source enters the
   destination, so no P&L impact.
3. Emits `inventory.stock.inbound` with `movementType='transfer_in'` at the
   `outboundUnitCost`.
4. Decrements `inTransit` at destination.
5. Status → `received`.

The `isReclassificationMovement()` guard in `applyOutbound` and `applyInbound` ensures
no COGS JE is emitted for `transfer_out` / `transfer_in`. Instead, `StockTransfersService`
emits its own GL JEs (DR Inventory-in-Transit / CR Inventory at send; reverse on receive)
via the transactional outbox.

## Short receipt / discrepancy

`stock_transfer_lines.qtyReceived` can be less than `qtySent`. The shortfall was already
decremented from source at send time (transfer_out was for `qtySent`). On receive, only
`qtyReceived` is posted as transfer_in. The missing units are a transit loss — currently
no automatic write-off movement is generated. The caller must post a manual
`adjustment_decrease` for the shortfall.

**GAP:** No automatic write-off or transit-loss movement for discrepancies. A warehouse
operator expecting an automated reconciliation entry will be confused.

## Batch/serial on transfers

`stock_transfer_lines.serialNumbers` stores the serial numbers being transferred (jsonb
array). However:

1. The serial row's `status` and `warehouseId` must be updated at send and receive —
   this needs verification in `StockTransfersService` (not read here).
2. `batchId` is NOT a column on `stock_transfer_lines`. Batch-tracked transfers have no
   batch attribution on the ledger (same gap as GRN/sale).

## Cross-entity guard

`applyOutbound:681` — `assertSameLegalEntityForTransfer()` rejects transfers across
legal entities. This is enforced at the engine level (pre-DB check), not at the
transfer service level. The transfer service should also enforce this at document
creation time, not just at movement posting.

## In-transit quantity

`materialized_stock_levels.inTransit` tracks expected stock en route to a warehouse.
It is informational — not part of WAC, not in the ledger. Displayed in stock-levels UI
as "incoming." Source quantity is fully decremented at send (not held as reserved).

## SOUND vs RISKY

**SOUND:** Cost-neutral carry (outboundUnitCost → transfer_in) is correct: no spurious
P&L on intra-warehouse moves. Two separate ledger entries (transfer_out, transfer_in) give
clear audit trail per warehouse.

**RISKY:**
- No automated transit-loss write-off for short receipts.
- Batch ID not tracked on transfer lines → batch movement history is broken for transfers.
- Cross-entity guard is engine-level but not enforced at document creation (TOCTOU: a
  transfer can be created cross-entity and only fail at send time).
- Transfer status field is a free varchar, not a Postgres enum → any typo bypasses the
  CHECK constraint at the application layer (though the CHECK constraint exists at DB level).
