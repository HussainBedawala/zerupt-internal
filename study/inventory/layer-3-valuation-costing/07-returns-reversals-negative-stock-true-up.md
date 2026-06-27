# 07 — Valuation Under Returns, Reversals, and Negative-Stock True-Up

## Sale return

`applyInbound` routes sale returns at `resolveInboundWac` (line 688-699):
Stock re-enters at CURRENT WAC (not original sale WAC):

```typescript
// Using current WAC — not originalUnitCost
await this.cogsCalculator.processInbound(... existingWac, existingWac, ...);
```

WAC math: `(existingQty × existingWac + returnQty × existingWac) / (existingQty + returnQty) = existingWac`
WAC is unchanged after the return. SOUND for WAC semantics.

COGS reversal JE: `DR Inventory / CR COGS` at `qty × currentWac`. Outbox-backed. SOUND.

See chapter 02 for the gap where reversal amount may differ from original COGS amount if WAC
changed between sale and return.

## Purchase return

Handled in `applyOutbound` with `movementType = 'purchase_return'` (lines 470-487):
1. Standard outbound: `calculateOutbound` returns COGS at current WAC.
2. 3-leg JE: `DR 1192 Clearing / CR 1141 Inventory / DR/CR 5210 Variance` (chapter 02).
3. WAC recalculated using `wacEngine.recalculateForReturn` at ORIGINAL document cost (line 476-484).

The purchase return is the only movement that calls `updateAverageCost` directly after
`decrementOutbound` — all other movements derive the new WAC purely from the inbound formula.

## Reversal (correction movements)

Layer 2c wired `InventoryReversalService` to create compensating entries. The reversal writes
a new ledger row with `reversesEntryId` pointing to the original, and `movementType` opposite
to the original. The reversal cost is the original `totalCost` (not recomputed from current WAC).

For WAC: the reversal inbound (restoring previously issued units) re-enters stock at the
REVERSAL totalCost, which is the original issue cost. This will DILUTE the current WAC if
the original cost differs from the current pool WAC. This is correct accounting — a reversed
sale correctly puts back the cost that was originally debited.

For FIFO: the reversal should restore the original layer (chapter 04, `restoreLayer`). If
the costLayerId is carried on the original ledger entry and threaded to the reversal, the
restoration is exact.

## Negative-stock true-up (HIGH-1)

`computeNegativeStockTrueUp` (`inventory-event.listener.ts:560-599`):

When `onHand < 0` at the time of a cost-establishing receipt (`grn_receipt` or
`adjustment_increase`), the units already sold were costed at the STALE WAC (existingWac,
often 0 for a never-received item). This receipt establishes the real cost. The true-up
charges the additional COGS for the units now back-covered:

```
trueUpUnits = min(|existingOnHand|, receiptQty)
trueUpCogs  = trueUpUnits × (receiptUnitCost − existingWac)   [only if > 0]
```

True-up JE: `DR COGS / CR Inventory` (line 607-636). Outbox-backed + in-process emit.
Deterministic `eventId = uuid_v5("negstock-trueup", originalEventId)` to avoid collision.

The `trueUpReduction` is also subtracted from `materialized_stock_levels.totalValue` in
the same transaction (`upsertInbound`, line 219-230) so the materialized value is corrected
by the same amount as the GL — invariant maintained.

SOUND — this is a genuinely important COGS accuracy mechanism for businesses that allow
negative stock (common in retail when goods arrive after the sale).

## GAP — true-up excluded for sale_return

`computeNegativeStockTrueUp` returns `undefined` for `movementType !== 'grn_receipt' && !== 'adjustment_increase'`.
Sale returns are excluded. If stock was negative (sold without receipt) and a sale return
brings it toward zero, no true-up fires. This means if the original sale was at WAC=0 (never
received), the return reversal also posts at WAC=0 (current pool), and the subsequent receipt
still sees the negative qty and fires a true-up correctly. The exclusion is intentional and
documented in the comment at line 568-570. SOUND for the common case; edge case: if stock
reaches exactly 0 from returns before the receipt arrives, no negative remains for the
receipt's true-up to cover. Minor gap, not blocking.

## Rounding: last unit close-out

No "last unit plug" is implemented (zero out totalValue when onHand → 0). WAC × qty rounding
over thousands of transactions can leave a residual cent in totalValue when onHand=0. Schema
comment at `materialized_stock_levels:418`: "When onHand reaches 0: totalValue resets to 0."
`StockLevelService.decrementOutbound` must implement this explicitly. Audit required:
does `decrementOutbound` reset `totalValue` to 0 when `newOnHand <= 0`?
