# 05 — Serial-Tracked Specific-Identification Cost

## Mechanism

For serial-tracked items, the caller can supply `cogsSpecificTotalCost` on the outbound
payload (`StockOutboundPayload`). When present, the event listener intercepts the standard
WAC/FIFO path at `inventory-event.listener.ts:388-399`:

```typescript
if (payload.cogsSpecificTotalCost !== undefined) {
  costResult = this.buildSpecificCostResult(payload.cogsSpecificTotalCost, payload.quantity);
} else {
  costResult = await this.cogsCalculator.calculateOutbound(...);
}
```

`buildSpecificCostResult` (`inventory-event.listener.ts:528-539`):
- `totalCost` = `cogsSpecificTotalCost` (exact acquisition cost of the claimed serials).
- `unitCost` = `totalCost / quantity` (per-unit average of that specific lot — ledger only).
- `costingMethod` = `"wac"` (the POOL method, not the specific-ID path).

The ledger row is written at `(specificUnitCost, specificTotalCost)`.
The COGS JE posts `DR COGS / CR Inventory` at `specificTotalCost`.

## What the caller must supply

The calling service (sales confirm, POS confirm) is responsible for:
1. Looking up the `serial_number_id`s of the claimed units.
2. Finding their acquisition costs (from the ledger: `SUM(total_cost) WHERE serial_number_id IN (...) AND movementType='grn_receipt'`).
3. Summing those costs and passing the total as `cogsSpecificTotalCost`.

This is a calling-convention contract. If the caller omits `cogsSpecificTotalCost`, the COGS
falls back to WAC — wrong for specific-identification. No validation enforces this for
serial-tracked items.

## GAP — WAC pool not adjusted for specific-cost COGS

`costingMethod` is reported as `"wac"` in `buildSpecificCostResult`. The standard outbound flow
then calls `stockLevel.decrementOutbound` which reduces `materialized_stock_levels.totalValue`
by `costResult.totalCost = specificTotalCost`.

But `materializedStockLevels.averageCost` is NOT recalculated here. The formula for WAC
adjustment on outbound in `StockLevelService.decrementOutbound` is:
```
new_totalValue = old_totalValue - costResult.totalCost
new_averageCost = new_totalValue / new_onHand   (if new_onHand > 0)
```

If the specific cost of the serial unit differs from the current pool WAC, the WAC CHANGES
as a side-effect of specific-identification COGS — which is semantically wrong. Specific-ID
should consume only its own acquisition cost from the pool; the remaining units should remain
at the original WAC. Example:

- Pool: 10 units at WAC = 100 → totalValue = 1000
- Serial #5 was acquired at 150 (an expensive batch)
- Specific-ID COGS: post DR COGS 150 / CR Inventory 150
- After decrement: totalValue = 850, onHand = 9, new WAC = 850/9 = 94.44

The remaining 9 units now have WAC 94.44 instead of 100. The pool WAC was CORRUPTED by the
specific-ID COGS. This cannot be fixed without tracking each serial unit's acquisition cost
as a separate pool (essentially FIFO by serial) or by storing and subtracting the serial's
exact acquisition cost from totalValue without re-averaging.

This is a known design tension: specific-identification and WAC pool maintenance are
conceptually incompatible at the same grain. The correct fix is to use FIFO method (with
per-serial layers) for serial-tracked items, or to maintain `totalValue` at the exact
ledger sum of all remaining units' acquisition costs (a full recalculation, expensive).

Severity: MEDIUM. For high-value serial items (electronics, appliances) where serial WAC
and pool WAC diverge significantly, the pool WAC will drift after each specific-ID sale.

## Layer 0 carry-forward confirmed

`_hardening-log.md` Layer 0 decisions note:
"Serial-tracked specific-cost valuation (WAC pool incompatible w/ specific-ID COGS for serials)
— Deferred to Layer 3."
This is the deferred gap. It is now documented above.
