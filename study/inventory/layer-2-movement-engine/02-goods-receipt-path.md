# Chapter 02 — Goods Receipt Path

## Entry points

Two routes bring goods in via `grn_receipt`:

1. **GRN document confirmed** → `purchase.grn.confirmed` event →
   `InventoryDomainEventListener.handlePurchaseGrnConfirmed` (`inventory-domain.listener.ts:103`)
2. **Purchase invoice confirmed (no GRN)** → `purchase.invoice.confirmed` event →
   `handlePurchaseInvoiceConfirmed` (`inventory-domain.listener.ts:94`)

GRN-linked bill lines are SKIPPED (`if (line.grnLineId !== undefined) continue` at
`inventory-domain.listener.ts:273`) — the GRN already moved the stock; the bill only
settles the 2121 AP accrual. This prevents double-receipt.

## The inbound engine path (per line)

`InventoryEventListener.applyInbound` (`inventory-event.listener.ts:81`):

1. **Pessimistic lock** — `stockLevel.getLevelForUpdate()` — `SELECT FOR UPDATE` on the
   materialized row for (itemId, warehouseId).
2. **Non-recoverable tax capitalisation (C1)** — if `taxCategory === 'non_recoverable'`,
   adds `nonRecoverableTaxAmount` to unitCost so import duties land in inventory value.
3. **WAC recalculation** — `cogsCalculator.processInbound()` — blends receipt cost into
   the existing pool: `newWac = (existingQty×existingWac + qty×cost) / (existingQty+qty)`.
4. **Ledger INSERT** — `stockLedger.record()` with `movementType='grn_receipt'`, positive
   quantity, deterministic `eventId`. Idempotent: returns `null` on duplicate (skip step 5+).
5. **Negative-stock COGS true-up (HIGH-1)** — if `onHand` was negative before this
   receipt, the prior sale was undercosted. Engine computes
   `trueUp = min(|negUnits|, receiptQty) × (receiptCost − priorWac)` and inserts an outbox
   row for a DR COGS / CR Inventory JE. (`inventory-event.listener.ts:163–205`)
6. **Materialized level upsert** — `stockLevel.upsertInbound()` — increments `onHand`,
   recomputes `totalValue`, sets new `averageCost`.

## Batch/serial creation at GRN (Layer-0 gap, this layer's carry-forward)

Serials are created inside the GRN confirm transaction in `GrnsService.createSerialUnits`
(NOT in the domain listener — the comment at `inventory-domain.listener.ts:48` is
explicit). The serial row carries `acquisitionCost`, `purchaseDocType='grn'`,
`purchaseDocId`.

**GAP — batch attribution NOT yet threaded into the ledger:**
The `applyInbound` call at `inventory-domain.listener.ts:299` passes `payload` that has
NO `batchId` field. The stock_ledger_entries schema has `batchId` column (Layer-0 addition)
but the GRN domain listener fan-out does not populate it. This is the Layer-0 carried-forward
gap: the ledger CAN carry the batch dimension; the caller does NOT yet supply it.
Consequence: batch on-hand (`Σ ledger.quantity WHERE batch_id`) returns zero even when
the item is batch-tracked. FEFO picking therefore has no ledger-reconcilable basis.

## GL handoff

GRN receipt does NOT post a COGS JE. The purchase module handles its own GL (DR Inventory /
CR AP accrual). The engine only moves quantity and updates WAC. The only engine-owned GL
for a GRN is the negative-stock true-up (if triggered).

## SOUND vs RISKY

**SOUND:** Double-receipt prevention via grnLineId skip is explicit and logged.
Non-recoverable tax capitalisation is a correct IAS 2 treatment.

**RISKY:** Batch ID not threaded through GRN fan-out → ledger batch dimension is
always NULL for GRN-originated stock. Calls `Σ ledger.quantity WHERE batch_id`
reconciliation returns zero, making the batch quantity audit unreliable.
