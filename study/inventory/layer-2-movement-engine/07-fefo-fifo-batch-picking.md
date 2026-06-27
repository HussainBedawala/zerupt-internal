# Chapter 07 — FEFO/FIFO Batch Picking Wired to the Ledger

## Schema support

`packages/db/src/schema/item-batches.ts:108` — `item_batches_fefo_idx`:

```
INDEX ON (tenantId, itemId, warehouseId, status, expiryDate)
```

This is the FEFO selection index: earliest `expiryDate` among `status='active'` batches
for a given (tenant, item, warehouse). The index exists and is correctly designed.

`item_batches.qtyRemaining` tracks the batch's remaining quantity.

## Current state of FEFO picking

**No automatic FEFO picker runs at sale/GRN time.** There is no service or helper that,
given an outbound movement for a batch-tracked item, selects the earliest-expiry active
batch(es) to fulfill the requested quantity.

`BatchesService` (`apps/api/src/inventory/batches/batches.service.ts`) manages batch
CRUD — creating batches, updating status, expiry management — but does NOT export a
`pickBatchesForMovement(itemId, warehouseId, qty)` function.

The POS sale fan-out (`inventory-domain.listener.ts:168`) does not query batches.
The GRN fan-out does not associate a batch with the receipt movement.

## What FEFO picking requires (design for this layer)

A `BatchPickerService.pick(tenantId, itemId, warehouseId, requestedQty, strategy)`:

```
strategy: 'fefo' | 'fifo'
fefo: ORDER BY expiryDate ASC NULLS LAST, createdAt ASC WHERE status='active' AND qtyRemaining > 0
fifo: ORDER BY createdAt ASC WHERE status='active' AND qtyRemaining > 0
```

Returns a list of `{ batchId, batchNo, expiryDate, allocatedQty }` — multiple batches
if the first batch does not cover the full quantity (partial batch consumption).

The caller (sale fan-out, POS confirm) must:
1. Call `BatchPickerService.pick()` for batch-tracked items.
2. Split one sale line into multiple ledger entries if pick spans multiple batches.
3. Pass `batchId` on each ledger entry.
4. Decrement `item_batches.qtyRemaining` for each consumed batch within the same tx.

## wiring to the ledger (the gap)

Currently: `item_batches.qtyRemaining` is decremented by whatever service posts the
movement — but without attribution on the ledger, the batch quantity and the ledger
quantity are maintained separately. They can diverge.

**Correct design (10-year):**
`item_batches.qtyRemaining` becomes a DERIVED column: `Σ stock_ledger_entries.quantity
WHERE batch_id = item_batches.id`. The service writes the ledger entry with `batchId`;
the batch `qtyRemaining` is either:
- (a) recomputed on demand from the ledger (authoritative, never drifts), or
- (b) maintained as a transactionally-updated materialized value, reconcilable against
  the ledger like `materialized_stock_levels`.

Option (b) is already the Layer-0 locked decision (#2): "batch projection:
`item_batches.qtyRemaining == Σ ledger.quantity per batch`." The reconciliation
detector is the audit check.

## FIFO and cost layers

`inventory_cost_layers` has `batchId` but FIFO is guarded off until Layer 3. When Layer
3 activates FIFO, the FEFO picker must also integrate with cost-layer consumption: the
same batch selected by FEFO must be the batch whose cost layer is consumed. They must
be co-selected atomically.

## Status transitions driven by qty

When a batch's `qtyRemaining` reaches zero (all consumed), its status should transition
to `exhausted`. Currently this is a separate service call or scheduled job — not
automatic on the movement. A post-movement hook inside the tx is safer.

## SOUND vs RISKY

**SOUND:** The FEFO index is correctly designed for a covering scan. Batch status
lifecycle (`active → expiring → expired → exhausted`) is schema-complete.

**RISKY (CRITICAL):**
- No FEFO picker exists → batch selection is ad-hoc or manual in the UI.
- Batch picking is not integrated with the ledger → attribution threading (ch. 06)
  is a prerequisite for FEFO to be meaningful.
- Partial batch consumption (one sale spanning two batches) is not modeled by the
  current fan-out (one line → one ledger entry). This requires a multi-entry split.
- Batch `exhausted` transition is not automatic on last unit consumed.
