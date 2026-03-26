# COGS Calculation Engine — Design

> Status: **Not implemented.** Schema exists (`inventory-costing.ts`), no service.
> Product spec: `product/accounting/05-cogs-logic.md`

## Two Costing Methods

| Method | When | How |
|--------|------|-----|
| **WAC** (default) | All non-batch items | Single cost per item, recalculates on purchase events |
| **FIFO** | Batch-tracked items | Cost layers, oldest consumed first |

## WAC Formula

```
New WAC = (Existing Qty × Existing WAC + Incoming Qty × Incoming Cost) ÷ (Existing Qty + Incoming Qty)
```

### Recalculation Triggers

| Event | Effect |
|-------|--------|
| `purchase.grn.confirmed` | New stock at purchase price → WAC recalculates |
| `purchase.landedCost.allocated` | Additional cost on existing stock → WAC recalculates |
| `purchase.return.confirmed` | Stock exits at return cost → WAC recalculates |
| `inventory.adjustment.posted` (increase with cost) | WAC recalculates |
| `inventory.assembly.completed` | FG at component cost sum → WAC recalculates |

**Does NOT recalculate on:** sales, stock decreases, transfers.

## FIFO Layer Tracking

```
Layer 1: 50 units @ 10.000
Layer 2: 30 units @ 11.000
Sale 60 units → consume Layer 1 (50), then Layer 2 (10)
COGS = 50×10 + 10×11 = 610.000
```

Returns: original cost layer if identifiable, else most recent cost.

## Schema: `inventory_costing`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenantId, legalEntityId | uuid | |
| itemId | uuid | FK → items |
| warehouseId | uuid | FK → warehouses |
| costingMethod | enum | wac / fifo |
| currentWac | numeric(19,6) | Current WAC (null for FIFO items) |
| quantityOnHand | numeric(19,6) | Current stock qty |

### `inventory_cost_layers` (FIFO only)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| costingId | uuid | FK → inventoryCosting |
| batchId | uuid | FK → batches (nullable) |
| unitCost | numeric(19,6) | Layer cost |
| originalQty, remainingQty | numeric(19,6) | |
| sourceDocumentType, sourceDocumentId | varchar/uuid | GRN, adjustment, etc. |
| createdAt | timestamp | For FIFO ordering |

## Backend — New Service: `CostingService`

### Core Methods

| Method | Purpose |
|--------|---------|
| `recalculateWac(itemId, warehouseId, incomingQty, incomingCost)` | Update WAC on purchase events |
| `consumeStock(itemId, warehouseId, qty)` | Returns COGS amount (WAC × qty or FIFO layers consumed) |
| `addFifoLayer(itemId, warehouseId, qty, unitCost, source)` | Add new cost layer |
| `getRetroactiveCOGSAdjustment(itemId, warehouseId, oldWac, newWac, qtySoldSince)` | Landed cost adjustment |

### Integration with Accounting Engine

COGS service is called by event listeners, NOT directly by modules:

```
Module emits event → Event Listener calls CostingService.consumeStock()
  → Gets COGS amount → Adds COGS lines to JE payload
  → Calls JournalPostingService.postFromEvent()
```

## Retroactive COGS Adjustment

When landed cost arrives after goods already sold:

1. Recalculate WAC as if landed cost was included from start
2. `difference = (newWac - oldWac) × qtySoldSinceGRN`
3. Post adjustment: `DR COGS / CR Inventory [difference]`

## Edge Cases

- **Zero stock + new purchase:** WAC = incoming cost (no average needed)
- **Negative stock (oversold):** WAC unchanged, flag for review
- **Assembly:** FG cost = sum(component qty × component cost). No P&L impact until FG sold.
- **Scrap:** DR Production Costs (5500) for scrap portion
