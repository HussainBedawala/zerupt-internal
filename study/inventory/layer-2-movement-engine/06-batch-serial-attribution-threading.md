# Chapter 06 — Batch/Serial Attribution Threading (Carried-Forward Layer-0 Gap)

## What was deferred from Layer 0

Layer 0 hardening added `batchId` and `serialNumberId` columns to
`stock_ledger_entries` (`packages/db/src/schema/inventory-costing.ts:87,92`) and the
necessary indexes. The decision was: "the ledger CAN carry the dimension; enforcement is
Layer 2's job." This chapter maps exactly what is and is not threaded today.

## Current state: schema ready, callers silent

### What exists (schema + indexes)

| Column | Table | Layer 0 FK |
|---|---|---|
| `batchId` | `stock_ledger_entries` | → `item_batches.id` RESTRICT |
| `serialNumberId` | `stock_ledger_entries` | → `item_serial_numbers.id` RESTRICT |
| `batchId` | `inventory_cost_layers` | → `item_batches.id` RESTRICT (F7) |

Indexes: `sle_item_warehouse_batch_idx`, `sle_batch_id_idx`, `sle_serial_number_id_idx`.

### What callers actually pass

**GRN receipt (domain listener, `inventory-domain.listener.ts:279`):**
The `StockInboundPayload` built for a GRN line has no `batchId` or `serialNumberId`
field. The `applyInbound` signature accepts them (they flow to `stockLedger.record()`
as `null` by default). Result: every GRN ledger entry has `batchId = NULL`.

**Sale (domain listener, `inventory-domain.listener.ts:168`):**
The `StockOutboundPayload` built for a sale line has no `serialNumberId` or `batchId`.
Result: every sale ledger entry has both NULL.

**Stock adjustment (increase, `stock-adjustments.service.ts:662`):**
`recordMany` is called without `batchId`. Serial rows ARE created, but no
`serialNumberId` is written to the ledger entry.

**Transfer (send/receive):**
`stock_transfer_lines.serialNumbers` captures serial numbers, but the ledger entries
posted for `transfer_out` / `transfer_in` do not carry `serialNumberId` or `batchId`.

### Summary table

| Movement | batchId threaded? | serialNumberId threaded? |
|---|---|---|
| GRN receipt | NO | NO |
| Sale | NO | NO |
| Sale return | NO | NO |
| Purchase return | NO | NO |
| Adjustment increase | NO | NO (serials created but not linked to ledger) |
| Adjustment decrease | NO | N/A |
| Transfer out/in | NO | NO |
| Opening balance | NO | NO |

**Every row.** The `batchId` and `serialNumberId` columns on `stock_ledger_entries` are
always NULL. The Layer-0 reconciliation invariant `item_batches.qtyRemaining ==
Σ ledger.quantity WHERE batch_id` can never hold until this threading is completed.

## What needs to happen

### For batch-tracked items

1. The emitting document (GRN line, sale line, adjustment line, transfer line) must
   include the resolved `batchId` (UUID) — chosen by FEFO/FIFO picker (ch. 07) or
   supplied by the user.
2. The domain listener must forward `batchId` in the `StockInboundPayload` /
   `StockOutboundPayload`.
3. `applyInbound` / `applyOutbound` must forward `batchId` to `stockLedger.record()`.
4. `StockAdjustmentsService.recordMany()` batch must include `batchId`.

### For serial-tracked items

1. The `serialNumberId` must be the item_serial_numbers PK (UUID), not the serial number
   string.
2. Sale fan-out: `cogsSpecificTotalCost` is already computed per serial in the confirm tx —
   the confirm tx also has the serial UUID (it just does not forward it).
3. Adjustment increase: serial row UUID is known at insertion time — write it to the
   ledger entry immediately.

## Chokepoint: trackingType enforcement

`InventoryEventListener.applyInbound/applyOutbound` does NOT currently read
`items.trackingType` to decide whether to require/validate `batchId`. The chokepoint
exists (Layer-0 decision) but is dormant because no caller supplies attribution.
Adding trackingType enforcement before attribution threading will cause every movement
to fail.

**Correct order:** thread attribution in callers FIRST, then add engine-side
`trackingType` validation as a safety net.

## Risk rating: HIGH for 10-year correctness

Without batch attribution:
- `item_batches.qtyRemaining` is a manually-maintained field (updated by service layer),
  NOT derivable from the ledger. These two sources can diverge silently.
- FEFO recall (`SELECT * WHERE batch_id AND movement_type IN (sale, adjustment_decrease)`)
  returns no rows — cannot trace which customers received which batch.
- Expiry-date enforcement and batch recall are operationally impossible.
- Regulatory requirements (pharma, food, MENA) cannot be met.
