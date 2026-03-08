# Cost Engine

## Valuation Methods

| Method | Default For | How It Works |
|--------|------------|--------------|
| **WAC** (Weighted Average Cost) | All items | One cost per item. Recalculates on every inbound. |
| **FIFO** (First In, First Out) | Batch-tracked items | Separate cost layers. Oldest consumed first. |

Set at company level during onboarding. Item-level override allowed (batch items auto-FIFO).

Changing an item's valuation method after transactions exist requires admin confirmation and a recalculation.

---

## WAC Mechanics

### Formula

```
New WAC = (Existing Qty × Existing WAC + Incoming Qty × Incoming Unit Cost)
          ÷ (Existing Qty + Incoming Qty)
```

### Recalculation Triggers

| Event | What Happens |
|-------|-------------|
| GRN received | New stock at purchase price → WAC recalculates |
| Landed cost allocated | Additional cost on existing stock → WAC recalculates |
| Purchase return | Stock exits at return cost → WAC recalculates |
| Adjustment increase (with cost) | WAC recalculates |
| Assembly completed | Finished goods at component cost sum → WAC recalculates |

### Does NOT Change WAC

- Sale (stock exits at current WAC)
- Adjustment decrease (stock exits at current WAC)
- Transfer (stock moves at current WAC)

### Edge Case: Zero Stock + New Receipt

When on-hand = 0 and new stock arrives, WAC = incoming unit cost (fresh start).

### Edge Case: Negative Stock + New Receipt

If system allows negative stock (flexible mode) and on-hand is negative:
```
New WAC = (negative_qty × old_WAC + incoming_qty × incoming_cost)
          ÷ (negative_qty + incoming_qty)
```
This can produce unexpected WAC values. Flag for review.

---

## FIFO Mechanics

### Cost Layers

Each inbound movement creates a cost layer:

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `itemId` | string | |
| `warehouseId` | string | |
| `sourceDocumentType` | string | `GRN`, `Adjustment`, `Assembly`, `Return` |
| `sourceDocumentId` | string | |
| `batchId` | string | If batch-tracked |
| `originalQty` | decimal | Qty when layer was created |
| `remainingQty` | decimal | Qty not yet consumed |
| `unitCost` | decimal | Cost per unit |
| `createdAt` | datetime | Used for FIFO ordering |

### Consumption

On sale or outbound movement:
1. Order layers by `createdAt` ascending (oldest first)
2. Consume from oldest layer until quantity fulfilled
3. If a layer is partially consumed, update `remainingQty`
4. COGS = sum of (consumed qty × layer unit cost) across all layers touched

### Example

```
Layer 1: 50 remaining @ 10.000 (Jan 5)
Layer 2: 30 remaining @ 11.000 (Jan 20)
Layer 3: 40 remaining @ 10.500 (Feb 3)

Sale: 60 units
  Layer 1: consume 50 @ 10.000 = 500.000 (layer exhausted)
  Layer 2: consume 10 @ 11.000 = 110.000 (20 remaining)
  COGS = 610.000
```

---

## Landed Cost Impact on Cost

When landed costs are allocated to a GRN after receipt:

**WAC items:**
```
Additional cost per unit = allocated_landed_cost ÷ received_qty
New WAC recalculated as if items arrived at (purchase_price + landed_cost_per_unit)
```

**FIFO items:**
```
The cost layer created by the GRN is updated:
new_unit_cost = original_unit_cost + (allocated_landed_cost ÷ layer_qty)
```

**Retroactive adjustment:** If items from this GRN were already sold, see `accounting/05-cogs-logic.md` for COGS adjustment entries.

---

## Cost Rounding

- All costs stored in functional currency
- Precision: same as functional currency (3 decimals for KWD, 2 for USD, etc.)
- WAC recalculation: compute to full precision, then round to currency precision
- COGS: `qty × unit_cost`, rounded per line item (not per unit)
