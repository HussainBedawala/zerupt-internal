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

## GRN Cost-Correction Attribution

When a supplier bill reprices a GRN after receipt, the signed cost delta (D) splits between an inventory uplift (1141, units still on hand) and a retroactive COGS reclass (5100, units already sold). The two slices always sum to D exactly. What differs across costing methods is the population the split is computed over.

**FIFO items:** split per receipt line. `inventory_cost_layers.source_document_line_id` ties each layer to the grn line it came from, so the still-on-hand numerator, the denominator, and the layer uplift all key on the corrected line. A correction on line 1 never reprices line 2.

**Serial items:** split per receipt line, same mechanism, via `item_serial_numbers.purchase_doc_line_id`.

**WAC items:** split per (receipt, item, warehouse) pool, not per line. This is a genuine limitation and not fixable: a WAC pool is one blended average in a single `materialized_stock_levels` row (`on_hand` + `average_cost`). WAC items create no cost layers at all, and stock ledger entries record the line of the movement's own document, not which receipt line was consumed. No stored data anywhere could attribute a per-line still-on-hand quantity under WAC. The pool is the only computable answer; reconstructing a synthetic FIFO-style attribution would invent a costing method never applied to the GL, which is more wrong than the honest pool.

**Legacy fallback:** a FIFO or serial receipt whose records are not fully line-tagged (received before those columns existed, or a partially tagged pool) also falls back to the pool. This is deliberately all-or-nothing: half-attributing would price a line against a population that is partly invisible.

**Consequence for WAC:** if one GRN receives the same item into the same warehouse on two lines at different prices, a correction on one line is split using the pool's blended on-hand ratio rather than that line's own. The total delta and the GL tie-out are unaffected and always exact, only the 1141-vs-5100 attribution between the two lines is approximate.

**Transferred units (FIFO and serial):** a unit moved to another warehouse after receipt drops out of the corrected receipt's on-hand slice, so its share of the delta lands in the COGS reclass even though the unit is still physically on hand. FIFO behaves the same way (a transfer consumes the source warehouse's layer and opens a new one under the transfer document), so the two costing paths agree, but the period COGS is overstated until those units sell. Across a year-end close this misstates retained earnings.

**Known defect, serial acquisition cost basis:** `item_serial_numbers.acquisition_cost` is written in the document currency and as entered (tax inclusive on an inclusive line) at receipt, while GL 1141 is debited functional and ex-tax, and the sale path consumes the stored cost as if it were functional ex-tax COGS. On a foreign currency or taxed serial receipt those three disagree and 1141 never fully relieves. This is invisible while every stored row is at rate 1 with no tax, which is true of current live data. It must be fixed (store functional ex-tax at receipt, and write the functional corrected cost on correction) before the first foreign currency or taxed serial tracked receipt, because after that a data backfill is also required.

**Example:**
```
GRN, same item/warehouse, two lines:
  Line 1: 60 units @ 10.000
  Line 2: 40 units @ 12.000
Pool: 100 received, 50 still on hand (blended, not line-attributed)

Correction: +100 booked on line 1
  Pool on-hand ratio = 50 / 100 = 50%
  Inventory uplift (1141) = 100 × 50% = 50.000
  Retroactive COGS (5100) = 100 × 50% = 50.000

Line 1's own remaining quantity is not used, the pool ratio applies
regardless of which line the correction lands on.
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
