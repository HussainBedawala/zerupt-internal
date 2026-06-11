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

## Specific Identification — For Serial-Tracked Items

Serial-tracked items do NOT use the pool average. Each physical unit carries its
own `acquisition_cost` (captured at receipt). When a serial unit is sold, COGS for
that unit is its OWN acquisition cost — not WAC.

- At sale confirm, the document atomically claims the selected serials
  (`available → sold`) inside its own transaction and sums their acquisition
  costs. That sum is written to `sales_invoice_lines.cost_at_sale` (reporting) AND
  passed through the sale event as `cogsSpecificTotalCost`.
- The cost engine posts THAT exact figure as the COGS journal entry and the stock
  ledger total cost, so **reporting (`cost_at_sale`) === GL COGS by construction**
  for serial lines. Non-serial lines are unchanged (WAC/FIFO).
- A serial unit with a null/zero acquisition cost is rejected at sale confirm
  (never post zero-cost COGS).

```
Receive serial A @ 10.000, serial B @ 20.000 (same item, WAC pool now (10+20)/2 = 15)
Sell serial B:
  COGS = 20.000  (B's own cost — NOT the 15.000 WAC)
  cost_at_sale = 20.000  (ties out to GL)
  WAC pool is untouched (specific-id consumes its own unit, not the average)
```

A serial goods return (`sold → returned`) relocates the unit to the return
warehouse and reverses the original COGS via the sale-return inbound path.

## When COGS Fires

| Event | Entry |
|-------|-------|
| Sales invoice confirmed | DR COGS / CR Inventory (per line item at WAC, FIFO, or — for serial-tracked items — specific identification) |
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
