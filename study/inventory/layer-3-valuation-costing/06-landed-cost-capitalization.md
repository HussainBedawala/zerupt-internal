# 06 — Landed Cost Capitalization

## What is a landed cost?

Freight, insurance, customs duties, and other import charges incurred to bring inventory to
its present location are capitalizable under IAS 2.10. They increase the cost of the goods
received, not the period expense. In Zerupt, landed costs are allocated post-GRN against a
specific GRN (source document). This is retroactive cost allocation.

## Split logic

`landed-cost.listener.ts:36-264` (`handleLandedCost`):

The listener divides `allocatedCostDelta` between sold and remaining stock:

```
totalReceived = Σ grn_receipt ledger entries for sourceDocumentId (step 86-90)
remainingQty  = materialized_stock_levels.onHand (step 92)
soldQty       = max(totalReceived − remainingQty, 0) (step 97)

inventoryUplift = allocatedDelta × remainingQty / totalReceived
cogsAdjustment  = allocatedDelta − inventoryUplift
```

The split is computed inventory-uplift-first and COGS derived as remainder — this guarantees
`cogsAdjustment + inventoryUplift = allocatedCostDelta` exactly with no rounding residual
(comment at line 96-110). SOUND.

## WAC update for remaining stock

`inventoryUplift` is applied to WAC via `StockLevelService.upsertInbound` with `quantity="0"`
and `newAverageCost = (existingTotalValue + inventoryUplift) / remainingQty` (step 137-147).
This correctly lifts WAC for remaining units without changing on-hand quantity.

## FIFO layer adjustment

For FIFO items: `FifoEngineService.adjustLayerCost` updates `unitCost` on all unconsumed
layers for the source document (`costDeltaPerUnit = allocatedDelta / totalReceived`, step 122-
133). Only remaining layers are adjusted (skips fully consumed layers). SOUND.

## Ledger entry

A `landed_cost_adjustment` ledger entry is written with `quantity = 0` and
`totalCost = allocatedCostDelta` (step 149-176). The CHECK constraint in the schema exempts
`landed_cost_adjustment` from the `qty != 0` and `totalCost = round(|qty| × unitCost, 6)`
constraints (`inventory-costing.ts:181-199`). Idempotent: duplicate `eventId` returns null
and skips the emit.

## GAP (CRITICAL) — No outbox for landed-cost JE

`landed-cost.listener.ts:204-207`:
```typescript
if (cogsAdjustment || inventoryUplift) {
  this.emitLandedCostJe(payload, cogsAdjustment, inventoryUplift);
}
```

`emitLandedCostJe` at line 211 uses:
```typescript
this.eventEmitter.emit(ACCOUNTING_EVENTS.POST, { ... });
```

This is a DIRECT EventEmitter call with NO outbox row. The DB transaction commits (ledger
entry + WAC update written). Then post-commit, the JE is emitted in-process. If the process
dies between the DB commit and this line, the JE is permanently lost. The stock ledger shows
the cost adjustment; the GL (1141 and COGS adjustment) does not. The GL/subledger invariant
is broken until a manual correction or a re-emit.

All other JE paths (`applyInbound`, `applyOutbound`) write the outbox row INSIDE the
transaction before the commit. `LandedCostListener` does not. This is an oversight.

Fix: move `OutboxService.insert(...)` inside the `db.transaction(...)` block (step 7),
passing the landed-cost JE payload. Then do the in-process fast-path emit post-commit as a
secondary optimistic path. Matches the pattern of the other listeners.

## GAP — `totalReceived` includes ALL GRN lines for the document, not just the item

`findBySourceDocument` returns all ledger entries for the `sourceDocumentId` and
`legalEntityId`. The `receiptEntries` filter at line 77 keeps only `movementType = 'grn_receipt'`.
But if the GRN has multiple items, `totalReceived` sums ALL items' quantities. When the landed
cost payload targets a single `itemId` (line 67), the split ratio uses `remainingQty / totalReceived`
where `totalReceived` may include other items' quantities. This produces an INCORRECT split for
multi-item GRNs where landed cost is allocated per item separately.

For single-item GRNs (common in retail): no impact.
For multi-item GRNs with per-item landed cost allocation: the split ratio is wrong.
Correct fix: filter `receiptEntries` to `entry.itemId === payload.itemId` when computing
`totalReceived` for the split. Or accept that `allocatedCostDelta` is already the
item-level allocation (pre-split by the Purchase module) and `totalReceived` should only count
this item's received quantity.
