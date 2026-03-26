# COGS Returns & Negative Stock Policy — Design

> Status: **Implemented.** Code exists in `cogs-calculator.service.ts` and `inventory-event.listener.ts`. This spec documents the implemented logic and fills remaining gaps.
> Priority: **P1** — blocks POS returns and sales credit notes.
> Depends on: `cogs-engine/01-design.md`

## What Exists in Code

### Returns (implemented in `CogsCalculatorService.processReturn`)

The return handler supports two costing methods:

**WAC returns:**
- Uses `WacEngineService.recalculateForReturn(existingQty, existingWac, returnQty, originalUnitCost)`
- Returns at the **original unit cost** passed by the caller, not current WAC
- Recalculates WAC: `newWac = (existingQty × existingWac + returnQty × originalUnitCost) / (existingQty + returnQty)`

**FIFO returns:**
- If `costLayerId` provided → restores quantity to the original cost layer (`FifoEngineService.restoreLayer`)
- If `costLayerId` not provided → creates a new cost layer at `originalUnitCost` (original layer unknown)
- Always recalculates WAC for reporting/fallback

### Negative Stock (implemented in `InventoryEventListener.handleOutbound`)

```ts
if (payload.blockNegativeStock !== false) {
  const wouldGoNegative = new Decimal(payload.quantity).gt(new Decimal(onHand));
  if (wouldGoNegative) {
    throw new BadRequestException('Insufficient stock...');
  }
}
```

- Default: **block** negative stock (throws `BadRequestException`)
- Override: `blockNegativeStock: false` in payload allows overselling
- WAC remains unchanged when stock goes negative (per `01-design.md`)

## Decision Record: Return Cost Policy

### POS Returns → Current WAC

Per `event-listeners/02-je-mappings-per-event.md` (line 92):

> **Decision: Returns use current WAC**, not original sale cost. This is standard for perpetual WAC systems — the original cost is absorbed into the weighted average.

**JE for POS return:**

| DR/CR | Line Type | Amount |
|-------|-----------|--------|
| DR | Inventory (1141) | returnQty × current WAC |
| CR | COGS (5100) | same |

The `InventoryEventListener.handleInbound` handles sale returns by calling `processReturn` with `originalUnitCost` from the event payload. The event emitter (POS module) must decide what cost to pass:

| Return scenario | `originalUnitCost` value | Rationale |
|----------------|------------------------|-----------|
| POS return (same day) | Current WAC at return time | Standard perpetual WAC — no cost lookup needed |
| POS return (different day) | Current WAC at return time | WAC may have changed, but this is accepted practice |
| Sales credit note (goods returned) | Current WAC at return time | Same policy |
| Sales credit note (price adjustment only) | N/A — no inventory movement | No COGS reversal |
| Purchase return | Original purchase cost from GRN | Supplier refund matches original cost |

### Why Current WAC (not Original Sale Cost)?

1. **Practical:** Original sale cost is not stored on POS transaction lines (only revenue and quantity)
2. **Standard:** Perpetual WAC systems absorb cost into the average — reversing at original cost would create artificial variance
3. **Simple:** No cost lookup required — current WAC is always available on `stock_levels`

### Gap: FIFO Returns in POS

POS returns for FIFO items have no way to identify the original cost layer (POS doesn't track which layer was consumed). The fallback behavior (create a new layer at current WAC) is acceptable for POS. For sales returns with known invoice references, the credit note could carry the `costLayerId` from the original sale's stock ledger entry.

**Action needed:** When the Sales module is built, `sales.creditNote.confirmed` event should include `costLayerId` when the original invoice's stock ledger entry is available.

## Decision Record: Negative Stock Policy

### Default: Block

Most Zerupt tenants (MENA/India/SEA retailers) should never oversell. Blocking negative stock prevents:
- Negative COGS (selling inventory that doesn't exist)
- WAC contamination (negative qty breaks the formula)
- Phantom revenue (selling air)

### Override: Allow (with flag)

Some scenarios require allowing negative stock temporarily:

| Scenario | `blockNegativeStock` | Resolution |
|----------|---------------------|------------|
| Normal POS sale | `true` (default) | Block if insufficient |
| Backorder / pre-sale | `false` | Stock will arrive via GRN later |
| Kit/assembly component shortage | `false` | Assembly in progress, components arriving |
| System migration (opening balances) | `false` | Temporary negative during import |

### When Stock Goes Negative (Override Enabled)

| Aspect | Behavior |
|--------|----------|
| WAC | **Unchanged** — last known WAC is used for COGS |
| COGS JE | Posts normally at last WAC × qty |
| Stock level | Goes negative (e.g., onHand = -5) |
| Next inbound | WAC recalculates: `(negativeQty × existingWac + incomingQty × incomingCost) / (negativeQty + incomingQty)` |
| Alert | Future: emit `inventory.negativeStock.detected` event for monitoring |

### Edge Case: WAC with Negative Quantity

```
Existing: qty = -5, WAC = 10.00
Inbound:  qty = 20, cost = 12.00
New WAC = (-5 × 10 + 20 × 12) / (-5 + 20) = (-50 + 240) / 15 = 12.6667
```

This is mathematically correct — the negative balance is "filled" at the old WAC, and the surplus gets the new cost.

**Risk:** If WAC was stale or zero when stock went negative, the recalculation may produce an unreasonable WAC. This is acceptable because:
1. Negative stock should be rare (opt-in only)
2. The next GRN will correct the WAC
3. An alert (future) flags the situation for review

## Landed Cost Impact on Returns

When landed cost arrives **after** goods have been returned:

```
1. GRN: 100 units @ 10 → WAC = 10
2. Return: 5 units @ WAC 10 → qty = 95, WAC unchanged
3. Landed cost: 500 allocated to original 100 units
   → New WAC = (95 × 10 + 500) / 95 = 15.2632 (if applying to remaining)
   → Retroactive COGS: (newWac - oldWac) × unitsSoldSinceGRN
   → Returned units: no adjustment needed (they're already out of inventory)
```

The `CogsCalculatorService` handles this via `getRetroactiveCOGSAdjustment` in the parent spec. Returned units are excluded from the "sold since GRN" count because they re-entered inventory.

## Summary of Gaps Filled by This Spec

| Gap from review | Resolution |
|----------------|------------|
| Returns — original COGS or current WAC? | Current WAC for POS/sales, original cost for purchase returns |
| Negative stock — block or allow? | Block by default, allow via `blockNegativeStock: false` |
| FIFO returns without layer ID | Create new layer at return cost (acceptable for POS) |
| Landed cost after return | Returned units excluded from retroactive COGS |
| WAC with negative quantities | Mathematically valid, alert recommended |
