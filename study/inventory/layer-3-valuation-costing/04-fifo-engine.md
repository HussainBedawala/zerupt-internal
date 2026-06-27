# 04 — FIFO Engine: Current Guarded State, Cost-Layer Model, occurred_at Gap

## Current status: DORMANT

`FifoEngineService.consumeLayers` throws `BadRequestException("FIFO costing is not yet
available; WAC is the supported method.")` at `fifo-engine.service.ts:108`. This is the
ACTIVATION GUARD from Layer 0 hardening. The guard is explicit and loud — any item accidentally
configured as FIFO will fail at point-of-sale rather than produce silent wrong COGS.

The real consumption algorithm is in `consumeLayersInternal` (private, line 117) and remains
UNIT TESTED so it is correct the moment the guard is lifted.

## Cost layer data model

`inventory_cost_layers` (`inventory-costing.ts:288`):

One row per inbound GRN batch. Fields:
- `originalQty` — immutable, set at creation.
- `remainingQty` — decremented on each outbound consumption. CHECK: `0 ≤ remainingQty ≤ originalQty`.
- `unitCost` — mutable: landed-cost adjustments update it via `FifoEngineService.adjustLayerCost`.
- `batchId` — optional FK to `item_batches` (onDelete restrict). For batch-tracked FIFO items.
- `createdAt` — used for FIFO ordering (oldest first). **THE GAP.**
- `sourceDocumentId` — used for landed-cost allocation lookup.

FIFO consumption order (`consumeLayersInternal:130`):
```sql
ORDER BY created_at ASC
```

## GAP — FIFO orders by created_at, not occurred_at

`inventory_cost_layers` has NO `occurred_at` column. The stock ledger (`stock_ledger_entries`)
has `occurred_at` (added in Layer 0 hardening for FIFO and period reports). But the cost layers
use `created_at` (system insert time) as the FIFO ordering key.

Consequence: if a GRN is backdated (e.g., a receipt from last month is entered today),
its cost layer is inserted NOW (`created_at = now`) even though it should be the OLDEST
layer (its goods arrived before the current forward layers). FIFO consumption would consume
today's receipt's cost LAST, when economically it should be FIRST. This produces silently
wrong COGS for any backdated GRN.

This is why the activation guard exists. Fix required before FIFO is enabled:
1. Add `occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()` to `inventory_cost_layers`.
2. Change `consumeLayersInternal` ORDER BY to `occurred_at ASC, created_at ASC` (tiebreak).
3. Populate `occurred_at` from the source GRN's `occurredAt` at `addLayer` time.
4. Lift the guard in `consumeLayers`.
Note: `addLayer` (`fifo-engine.service.ts:65-88`) does not currently accept or write any date
field — the insertion schema is `{tenantId, legalEntityId, itemId, warehouseId, batchId,
sourceDocumentType, sourceDocumentId, originalQty, remainingQty, unitCost, currency, createdBy}`.
`occurred_at` needs to be added to both `AddLayerParams` and the INSERT.

## Layer creation

`FifoEngineService.addLayer` (line 65) — called for FIFO items on inbound via
`CogsCalculatorService.processInbound` (line 101). For WAC items, no layer is created.

FIFO items ALSO update WAC (`processInbound` line 118): WAC is always maintained as a
fallback / for reports. This is correct — WAC is informational for FIFO items.

## Layer restoration on return

`FifoEngineService.restoreLayer` (line 207): for a purchase/sale return where the original
layer is known (`costLayerId` on the ledger row), quantity is restored to that specific layer.
Guard: `newRemainingQty <= originalQty` (line 225-229). SOUND.

Fallback when layer unknown (`processReturn`, `cogs-calculator.service.ts:150-180`):
uses `getMostRecentLayerCost` (last layer by `createdAt`) as the unit cost for a new inbound
layer. This is an approximation — the "most recent" layer may not be the one originally consumed.

## Landed cost and FIFO layers

`FifoEngineService.adjustLayerCost` (line 276) adjusts `unitCost` on remaining (unconsumed)
layers for a source document. Fully consumed layers (remainingQty=0) are skipped. Only
remaining stock gets the cost uplift; sold stock gets the COGS adjustment JE instead.
This is the correct IFRS treatment: capitalize landed costs only for unsold inventory.
