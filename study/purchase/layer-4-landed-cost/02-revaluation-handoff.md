# Chapter 02 — Inventory Revaluation Handoff

Handler: `apps/api/src/inventory/landed-cost.listener.ts`
Event: `inventory.landed_cost.applied` (one per GRN line)

---

## Event Payload

```typescript
// landed-costs.events.ts:62
interface LcInventoryPayload {
  eventId: string;          // random UUID (deduplicated by stock ledger)
  correlationId: string;    // parentEventId (same across all lines of one LC post)
  tenantId, legalEntityId, branchId, warehouseId, itemId, createdBy: string;
  sourceDocumentId: string; // grnId — the ORIGINAL receipt
  allocatedCostDelta: string; // sum of all component allocations for this GRN line
  currency: string;
}
```

---

## Split Calculation (H3)

The listener knows:
- `totalReceived` = sum of `quantity` on `grn_receipt` stock ledger entries for this GRN
  (`landed-cost.listener.ts:88`)
- `remainingQty` = current `materializedStockLevels.onHand`
- `soldQty` = `max(totalReceived − remainingQty, 0)`

Then:

| Scenario | Inventory Uplift | COGS Adjustment |
|----------|-----------------|-----------------|
| Nothing sold (`soldQty = 0`) | `allocatedCostDelta` | none |
| All sold (`remainingQty = 0`) | none | `allocatedCostDelta` |
| Partial sale | `delta × (remainingQty / totalReceived)` | `delta − uplift` (derived, not re-rounded) |

"Compute one side, derive the other" pattern ensures `uplift + cogs === allocatedCostDelta` exactly.

---

## WAC Update (EXISTS)

When `remainingQty > 0` and `inventoryUplift` is set:

```
newWac = (remainingQty × existingWac + inventoryUplift) / remainingQty
```

Written to `materializedStockLevels.averageCost` via `stockLevel.upsertInbound` with
`quantity = 0` (cost-only update) (`landed-cost.listener.ts:189`).

---

## FIFO Layer Adjustment (EXISTS)

When costing method is `fifo` and `remainingQty > 0`:

```
costDeltaPerUnit = allocatedCostDelta / totalReceived
fifoEngine.adjustLayerCost(sourceDocumentId, legalEntityId, costDeltaPerUnit, tx)
```

File: `landed-cost.listener.ts:131`. Only on-hand layers are updated (layers already
consumed cannot be adjusted in FIFO mode). The COGS split handles the sold portion via
an accounting JE (see ch 04).

---

## Idempotency (EXISTS)

`stockLedger.record(...)` returns `null` on duplicate `eventId`. When `null`:
- `cogsAdjustment` and `inventoryUplift` are cleared
- Outbox insert and post-commit emit are both skipped
- Handler logs a warning and returns cleanly

(`landed-cost.listener.ts:180`)

---

## Stock Ledger Entry

A `landed_cost_adjustment` movement is recorded with:
- `quantity = "0"` (no stock quantity change)
- `unitCost = allocatedCostDelta / totalReceived` (per-unit landed cost)
- `totalCost = allocatedCostDelta`
- `sourceDocumentType = "grn"` + `sourceDocumentId = grnId`
- `occurredAt = new Date()` (real-time, not the LC document date — noted as F4 in code)

**REQUIRES (GAP):** The stock ledger entry uses `occurredAt = new Date()` (wall clock) rather
than the LC's `documentDate`. This means if a landed cost is posted with a backdated
`documentDate` (e.g. posting June charges in July), the stock ledger timestamp does not
align with the accounting period. The JE posts to the `documentDate` period, but the
inventory ledger reflects the posting wall time. This can cause period-end inventory
valuation discrepancies.

---

## Atomicity

The WAC update, FIFO layer adjustment, stock ledger insert, and outbox JE insert all happen
inside a single DB transaction (`landed-cost.listener.ts:64`). If any step fails, the entire
cost uplift is rolled back. The outbox poller retries delivery, and the listener deduplicates
on `eventId`.

---

## Multiple Landed Costs on Same Item

Each LC post fires a separate `inventory.landed_cost.applied` event. Each is processed
independently. WAC is recalculated incrementally each time. Correct as long as events are
processed in order (EventEmitter2 is synchronous within a Node.js event loop turn, so
order is deterministic within a single post). Concurrent LC posts from different sessions
are serialized by the `SELECT ... FOR UPDATE` on stock level (`stockLevel.getLevelForUpdate`).
