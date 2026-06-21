# 04 — Inventory Valuation: Weighted Average Cost

## Perpetual vs periodic inventory

Perpetual inventory means every movement — receipt, sale, adjustment, transfer — updates the stock count and the inventory valuation in real time. The GL account **Merchandise Inventory (1141)** changes on every event, not at the end of the month. Zerupt uses perpetual inventory. All analysis in this chapter assumes perpetual.

Periodic inventory is the alternative: physical counts happen at defined intervals (monthly, quarterly, annually), and cost is computed only at that point. It is simpler to implement but produces no real-time cost data and cannot support live margin reporting or reorder alerts. It is common in very small businesses but unsuitable for a retail ERP.

Because Zerupt is perpetual, every section below describes what happens at the moment of the transaction, not at period end.

## The inventory control account invariant

The invariant is:

**Balance of Merchandise Inventory (1141) = Σ (quantity × unit_cost) across all items across all locations**

This must hold at all times, not just at period end. It is not a reporting approximation; it is a hard correctness requirement. If a system allows inventory movements to happen without corresponding GL postings — or allows GL postings without corresponding stock movements — the invariant breaks, and the balance sheet shows an inventory figure that does not correspond to anything real.

The stock subledger is the detailed register of every SKU at every location. The GL account 1141 is the control account — the single number that aggregates the subledger. Every transaction that touches the subledger must also touch 1141 by the exact same amount.

## Why Weighted Average Cost?

Three costing methods are in common use:

**FIFO (First In, First Out):** the cost of the oldest units is assigned to the goods sold first. During periods of rising costs, FIFO produces the lowest COGS, the highest reported profit, and the highest inventory balance on the balance sheet. This is economically accurate in the sense that old cheap goods "left" the business first, but it requires tracking which specific lots remain.

**LIFO (Last In, First Out):** the newest cost goes to COGS first. During inflation this produces the highest COGS and lowest profit, which reduces taxable income. LIFO is prohibited under IFRS and IndAS. It is not applicable to Zerupt's target markets (MENA, India, Southeast Asia). It will not be discussed further.

**WAC (Weighted Average Cost):** a single blended cost is maintained for every unit of an item regardless of when it arrived. Every receipt re-blends the average. Every issue (sale, adjustment) uses the current WAC. No lot tracking is needed.

WAC is the standard method for retail under IFRS (IAS 2 explicitly permits it) and IndAS 2. It is practical for high-SKU-count retail because it eliminates the need to track purchase lot identifiers. Cost smoothing also prevents dramatic swings in COGS from one day to the next when suppliers reprice. Zerupt uses WAC.

## The WAC formula

The moving WAC is recomputed on every receipt:

```
new_WAC = (existing_qty × existing_WAC + incoming_qty × incoming_cost)
          ÷ (existing_qty + incoming_qty)
```

Issues (sales, transfers out, adjustments) do not change the WAC. They reduce the stock quantity while the WAC stays constant. Only receipts — events that bring new units in at a potentially different cost — cause the WAC to change.

**Precision rule:** WAC is stored internally to 4 to 6 decimal places. The JE amounts use 2 decimal places (3 for KWD). The high-precision WAC is what the system uses to compute the next JE amount. Rounding the WAC prematurely to 2 decimal places and then multiplying by large quantities causes the GL and subledger to drift apart over thousands of transactions.

For KWD (Kuwaiti Dinar, a 3-decimal-place currency): store WAC to 6 decimal places. For example, WAC = KWD 2.456789. For 7 units sold: 7 × 2.456789 = KWD 17.197523, rounded to KWD 17.198 on the JE.

## Worked ledger: full example

Item A, currency SAR, amounts to 2 decimal places, WAC to 4 decimal places.

| Date | Event | Qty In | Qty Out | Unit Cost (WAC) | Stock Qty | Stock Value (SAR) |
|------|-------|:------:|:-------:|:---------------:|:---------:|:-----------------:|
| 01 Jun | Receipt | 100 | — | 10.0000 | 100 | 1,000.00 |
| 05 Jun | Receipt | 50 | — | 12.0000 | 150 | 1,600.00 |
| 08 Jun | Sale | — | 60 | 10.6667 | 90 | 960.00 |
| 12 Jun | Receipt | 30 | — | 14.0000 | 120 | 1,380.00 |
| 15 Jun | Sale | — | 40 | 11.5000 | 80 | 920.00 |

WAC reblend after 05 Jun receipt:

```
new_WAC = (100 × 10.0000 + 50 × 12.0000) ÷ (100 + 50)
        = (1,000.00 + 600.00) ÷ 150
        = 1,600.00 ÷ 150
        = 10.6667
```

The 08 Jun sale takes 60 units at the current WAC of 10.6667. Stock qty = 90. Stock value = 90 × 10.6667 = 960.00.

WAC reblend after 12 Jun receipt:

```
new_WAC = (90 × 10.6667 + 30 × 14.0000) ÷ (90 + 30)
        = (960.00 + 420.00) ÷ 120
        = 1,380.00 ÷ 120
        = 11.5000
```

The 15 Jun sale takes 40 units at the current WAC of 11.5000. Stock qty = 80. Stock value = 80 × 11.5000 = 920.00.

### Journal entries for each event

**01 Jun — Receipt of 100 units at SAR 10.00 (on credit from supplier):**

```
DR  Merchandise Inventory (1141)     1,000.00
      CR  Trade Payables (2111)                  1,000.00
```

**05 Jun — Receipt of 50 units at SAR 12.00 (on credit from supplier):**

```
DR  Merchandise Inventory (1141)       600.00
      CR  Trade Payables (2111)                    600.00
```

WAC updates to 10.6667 as computed above. No JE is needed for the WAC change itself; it is a subledger calculation only.

**08 Jun — Sale of 60 units (COGS portion; revenue JE is separate):**

```
DR  Cost of Goods Sold (5100)          640.00
      CR  Merchandise Inventory (1141)             640.00
```

Amount: 60 × 10.6667 = 640.00.

**12 Jun — Receipt of 30 units at SAR 14.00:**

```
DR  Merchandise Inventory (1141)       420.00
      CR  Trade Payables (2111)                    420.00
```

WAC updates to 11.5000.

**15 Jun — Sale of 40 units (COGS portion):**

```
DR  Cost of Goods Sold (5100)          460.00
      CR  Merchandise Inventory (1141)             460.00
```

Amount: 40 × 11.5000 = 460.00.

### Final verification

Net movement in 1141:

```
+1,000.00  (01 Jun receipt)
+  600.00  (05 Jun receipt)
-  640.00  (08 Jun COGS)
+  420.00  (12 Jun receipt)
-  460.00  (15 Jun COGS)
─────────
   920.00
```

Stock subledger: 80 units × 11.5000 = 920.00. The GL and subledger tie exactly.

## Rounding and precision dangers

If the WAC is truncated to 2 decimal places after each reblend, two problems emerge. First, rounding errors in the WAC feed into every subsequent JE amount. Second, over thousands of transactions the accumulated error grows and the GL diverges from the subledger in a way that is difficult to trace.

The correct approach:

- Store WAC to 4-6 decimal places in the database (a NUMERIC(20,6) column, not FLOAT).
- Compute JE amounts as ROUND(qty × WAC, decimal_places_of_currency).
- For the last unit of an item (when bringing stock to zero), use the remaining GL balance as the JE amount rather than recomputing from WAC. This prevents the balance from going to a small non-zero residual from rounding.

KWD example with 3 decimal places: WAC = KWD 2.456789. Selling 7 units: JE amount = ROUND(7 × 2.456789, 3) = ROUND(17.197523, 3) = KWD 17.198. If those were the last 7 units and the GL balance was KWD 17.197, use KWD 17.197 (the plug) rather than 17.198, to close the account to zero cleanly.

## Negative inventory danger

Negative inventory occurs when a sale is posted for more units than the system believes are in stock. In a perpetual WAC system this produces absurd results. Suppose current stock is 0 units and a sale of 5 is processed: the stock ledger shows -5 units. The WAC formula then requires dividing by -5, which is mathematically undefined in context and produces a negative inventory asset on the balance sheet — a balance sheet that is wrong.

A system can handle this in two ways:

1. Block: reject any movement that would take a location below zero units. The sale cannot proceed until stock is confirmed or received.
2. Allow with a locked WAC: permit negative inventory (some businesses need it for operational continuity) but freeze the WAC at its last valid value until a receipt brings the count back to positive. At that point, WAC reblends normally using the frozen value as the "existing" cost.

Never allow the WAC formula to execute with a negative denominator. The resulting number is meaningless and will corrupt every subsequent calculation.

## Brief contrast with FIFO

Under FIFO, the 08 Jun sale of 60 units would be costed entirely from the 01 Jun lot (100 units at SAR 10.00 each), giving COGS of 60 × 10.00 = SAR 600.00. Under WAC, the COGS for the same sale is SAR 640.00. In this case of rising purchase costs, FIFO gives lower COGS and higher reported gross profit.

FIFO is more granular — it tracks exactly which lot each unit came from — but requires a lot-level sub-ledger for every item. For a retailer with tens of thousands of SKUs and multiple suppliers per item, WAC is dramatically simpler to maintain and audits just as cleanly under IFRS. The tradeoff is that WAC smooths cost fluctuations rather than reflecting the precise economic order of stock depletion.

## The mental model

> WAC is a single running average that absorbs every new receipt and spreads the blended cost
> across all units on hand. Issues never change the WAC; they just consume units at the current
> rate. The GL account 1141 and the stock subledger must always agree: every receipt debits
> both, every sale credits both, and the rounding is done once at the JE level — not during
> the WAC calculation itself.

Next: `05-cogs-and-inventory-movements.md`.
