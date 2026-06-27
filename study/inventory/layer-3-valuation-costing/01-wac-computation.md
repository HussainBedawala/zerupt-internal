# 01 — WAC Computation + 5-Category Scoping

## Decision: WAC stays at item × warehouse

Locked in Layer 0 (`_hardening-log.md`, decision #2). WAC is maintained in
`materialized_stock_levels` at the (item, warehouse) grain — not per-batch, not per-serial.
Batch/serial dimensions are quantity projections on the ledger only. This decouples lot-level
FEFO/recall/expiry from the cost pool, which is the correct IAS 2 approach for retail.

The accounting-layer-3 reviewer confirmed this in the Layer 0 review:
"WAC stays item×warehouse, batch=quantity projection is CORRECT for 10 years."

## 5-category WAC scoping

DEV-362 scoped the launch COA to five WAC-native retail category templates:
hardware, general merchandise, stationery, electronics, auto-parts.
All five use standard perpetual WAC — no FIFO items in the launch COA. FIFO is an optional
per-item override (`item_costing_configs`) for future use (pharma/perishables with lot-exact
costing). The "5 WAC-native" framing means the COA's account mappings are designed around
WAC semantics; if an item is switched to FIFO, it needs its own mapping audit.

## The WAC formula (code reference)

`wac-engine.service.ts:26-63` (`recalculate`):

```
new_WAC = (existingQty × existingWac + incomingQty × incomingCost)
        / (existingQty + incomingQty)
```

All arithmetic is `Decimal.js` with `ROUND_HALF_EVEN`, 6 decimal places.

Edge cases handled:
- Zero existing stock (first receipt): return `incomingCost` directly (line 48).
- Adjustment increase with `unitCost=0` (H2 — zero-cost gift/write-up): preserve existing
  WAC unchanged (`wac-engine.service.ts:44`; also guarded in `resolveInboundWac` line 678).
- Negative existing stock: compute formula, log warning (line 54-57). WAC is NOT frozen here —
  see chapter 07 for the negative-stock true-up that corrects COGS retroactively on receipt.

## Purchase return WAC recalculation

`wac-engine.service.ts:94-132` (`recalculateForReturn`):

```
new_WAC = (existingQty × existingWac - returnQty × originalUnitCost)
        / (existingQty - returnQty)
```

Uses the ORIGINAL GRN document cost (not current WAC) to remove the cost that was originally
blended in. If the result would be negative (original cost > pool value), clamps to zero and
logs error (line 122-130). This prevents a negative WAC which would corrupt every subsequent
calculation.

SOUND — a negative WAC guard is essential. The clamping is a last-resort defence; the real
protection is the purchase-price-variance JE (chapter 02) which absorbs the doc-cost/WAC gap.

## WAC when stock hits zero

`materialized_stock_levels.averageCost` is preserved when `onHand` reaches zero (not reset).
`totalValue` is set to 0 (line: `stock-level.service.ts`, `decrementOutbound`). This is
correct: the next receipt has a fresh quantity start but the WAC seed is the last known cost.
Schema comment: "When onHand reaches 0: totalValue resets to 0, averageCost preserved."

## GAP — costing method change with no migration path

`item_costing_configs` tracks WAC→FIFO changes with `changedAt/changedBy/changeReason`
(`inventory-costing.ts:570-637`). However there is NO documented migration path for switching
a live WAC item to FIFO: the item has existing stock valued in `materialized_stock_levels`
(totalValue = onHand × averageCost) but no `inventory_cost_layers` rows. If FIFO is activated
mid-life, the next outbound will hit the guarded `consumeLayers` throw (chapter 04 — but once
the guard is lifted, it will attempt to consume from an EMPTY layer set and fail with
"insufficient stock"). Procedure needed: on method change, synthesize one "opening FIFO layer"
at the current WAC for the current on-hand qty. No code or migration implements this today.
