# COGS Calculation Logic

## Weighted Average Cost (WAC) — Default

Single cost per item. Recalculates on each purchase.

**Formula:**
```
New WAC = (Existing Qty × Existing WAC + Incoming Qty × Incoming Cost)
          ÷ (Existing Qty + Incoming Qty)
```

**Recalculation triggers:**

| Event | Effect |
|-------|--------|
| GRN received | New stock at purchase price → WAC recalculates |
| Landed cost allocated | Additional cost on existing stock → WAC recalculates |
| Purchase return | Stock exits at return cost → WAC recalculates |
| Stock adjustment (increase with cost) | WAC recalculates |
| Assembly completed | Finished goods at component cost sum → WAC recalculates |

**Does NOT recalculate on:** Sales, stock decreases, transfers.

**Example:**
```
Start: 100 units @ 10.000
GRN:   50 units @ 12.000
WAC  = (100 × 10.000 + 50 × 12.000) ÷ 150 = 10.667

Sale:  30 units
COGS = 30 × 10.667 = 320.010
Remaining: 120 units @ 10.667 (WAC unchanged on sale)
```

## FIFO — For Batch-Tracked Items

Tracks cost layers. Oldest consumed first.

```
Layer 1: 50 units @ 10.000
Layer 2: 30 units @ 11.000
Layer 3: 40 units @ 10.500

Sale: 60 units
  Layer 1: 50 @ 10.000 = 500.000
  Layer 2: 10 @ 11.000 = 110.000
  COGS = 610.000

Remaining:
  Layer 2: 20 @ 11.000
  Layer 3: 40 @ 10.500
```

## When COGS Fires

| Event | Entry |
|-------|-------|
| Sales invoice confirmed | DR COGS / CR Inventory (per line item at WAC or FIFO) |
| POS transaction completed | DR COGS / CR Inventory (per line item) |
| Credit note confirmed | DR Inventory / CR COGS (reversal) |
| POS return completed | DR Inventory / CR COGS (reversal) |

COGS calculated at cost **when the sale occurs**, not when the draft was created.

**Returns cost:**
- WAC items → current WAC at time of return
- FIFO items → original cost layer if identifiable, else most recent cost

## Retroactive COGS Adjustment

When landed cost is allocated after some goods were already sold:

1. Recalculate WAC/FIFO as if landed cost was included from the start
2. Calculate difference between original COGS and recalculated COGS
3. Post adjustment:
```
DR  COGS          [difference]
CR  Inventory     [difference]
```

## Assembly / Production

```
Finished goods cost = sum(component qty × component WAC/FIFO cost)
```

Entry:
```
DR  Inventory — Finished Good     [total]
CR  Inventory — Component A       [cost A]
CR  Inventory — Component B       [cost B]
```

No P&L impact (inventory reclassification). COGS recognized only when finished goods are sold.

Scrap during production:
```
DR  Inventory — Finished Good     [cost minus scrap]
DR  Production Costs (5500)       [scrap cost]
CR  Inventory — Components        [full component cost]
```
