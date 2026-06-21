# 05 — COGS and Inventory Movements

## COGS is the cost side of every sale

Revenue and COGS are recognized at the same moment under accrual accounting. This is the matching principle: the cost of selling a good is an expense in the same period as the revenue from selling it. You cannot post a sale to **Product Sales (4110)** without simultaneously posting the cost of those units to **Cost of Goods Sold (5100)** and reducing **Merchandise Inventory (1141)**.

COGS is always computed using the current WAC at the instant the sale is posted, not the WAC from when the goods were originally purchased, and not the WAC at the end of the month. In a perpetual system the calculation is per-transaction.

Revenue and COGS produce two separate journal entries in practice (or two pairs of lines on one JE):

```
DR  Trade Receivables (1131)       1,150.00
      CR  Product Sales (4110)              1,000.00
      CR  Output VAT Payable (2131)           150.00

DR  Cost of Goods Sold (5100)        640.00
      CR  Merchandise Inventory (1141)         640.00
```

The first pair is the revenue side. The second pair is the COGS side. Both are required for every sale.

## Movement taxonomy

Eight distinct events change inventory. Each has a defined effect on stock quantity, the GL, and the P&L.

### 1. Sale

Stock quantity decreases. **Merchandise Inventory (1141)** decreases by qty × WAC. The cost flows to the P&L as COGS.

```
DR  Cost of Goods Sold (5100)        640.00
      CR  Merchandise Inventory (1141)         640.00
```

The revenue JE is separate (covered in Layer 2). Never combine the revenue and COGS sides into a net entry.

### 2. Sales return (customer returns goods)

Stock quantity increases. 1141 increases. The cost basis used is the WAC at the time the return is processed (the current WAC). If the original sale WAC is known and material, some systems reverse at the original WAC — this is more precise but operationally complex; WAC systems typically use the current WAC for simplicity under IFRS.

```
DR  Merchandise Inventory (1141)       320.00
      CR  Cost of Goods Sold (5100)              320.00
```

The revenue reversal (credit note to the customer) is a separate JE against 1131 and 4110. The inventory JE handles only the stock cost side.

### 3. Purchase receipt (GRN — Goods Received Note)

Stock quantity increases. 1141 increases by qty × purchase unit cost. WAC reblends at the moment of receipt.

Two variants depending on whether a supplier bill is matched at GRN time or later:

**Matched at GRN (three-way match complete):**

```
DR  Merchandise Inventory (1141)     1,000.00
      CR  Trade Payables (2111)                  1,000.00
```

**GRN before bill (accrual):**

```
DR  Merchandise Inventory (1141)     1,000.00
      CR  GRN Accrual (2121)                     1,000.00
```

When the supplier bill arrives and is matched, 2121 is cleared:

```
DR  GRN Accrual (2121)               1,000.00
      CR  Trade Payables (2111)                  1,000.00
```

### 4. Purchase return

Stock quantity decreases. 1141 decreases. The debit goes to 2111 to reduce the liability to the supplier.

If the purchase price matches the current WAC exactly:

```
DR  Trade Payables (2111)              300.00
      CR  Merchandise Inventory (1141)             300.00
```

If the purchase price differs from the current WAC (common when prices have moved since the original receipt), the difference is a purchase price variance:

```
DR  Trade Payables (2111)              310.00
      CR  Merchandise Inventory (1141)             300.00
      CR  Purchase Price Variance (5190)            10.00
```

The inventory credit must always be at WAC (the book cost of those units). The difference between what the supplier credits and the WAC is a variance, not an inventory adjustment.

### 5. Positive adjustment (count finds more stock)

Stock quantity increases. 1141 increases. This is a gain, not revenue — it reflects goods that existed but were not recorded.

Example: 5 units found at a stock count; current WAC = SAR 10.00.

```
DR  Merchandise Inventory (1141)        50.00
      CR  Inventory Surplus Gain (4900)             50.00
```

The gain account (4900 or a designated other income sub-account) captures windfalls from counting variances. It is income, not product sales.

### 6. Negative adjustment or write-down (damage, spoilage, count shortage)

Stock quantity decreases. 1141 decreases. The debit goes to an expense account.

Example: 3 units damaged and written off; current WAC = SAR 10.00.

```
DR  Inventory Write-Down Expense (6210)   30.00
      CR  Merchandise Inventory (1141)             30.00
```

The expense account (6xxx) ensures the loss flows through the P&L, reducing gross margin. It must not go to COGS (5100) because this is not a sale.

### 7. Inter-branch transfer (same legal entity, different locations)

This is the most nuanced movement. No sale has occurred. No cost has been incurred. The goods are merely moving between bins or stores within the same entity.

**Step 1 — Send (source location posts the shipment):**

```
DR  Inventory in Transit (1142)        500.00
      CR  Merchandise Inventory (1141)             500.00
```

Stock quantity leaves the source location. The value parks in the in-transit staging account.

**Step 2 — Receive (destination location confirms receipt):**

```
DR  Merchandise Inventory (1141)       500.00
      CR  Inventory in Transit (1142)              500.00
```

Stock quantity enters the destination location. The staging account clears.

Net effect on all inventory accounts combined: zero. Total inventory on the balance sheet is unchanged. The WAC of the item at the receiving location does not change — these are the same goods at the same cost. If the destination had existing stock at a different WAC and the system blends them, that is a WAC reblend, not a cost change caused by the transfer.

If goods are confirmed lost in transit after Step 1 but before Step 2:

```
DR  Inventory Write-Down Expense (6210)   500.00
      CR  Inventory in Transit (1142)              500.00
```

### 8. Shrinkage (systematic loss discovered at count)

Shrinkage — retail industry term for accumulated theft, breakage, and evaporation discovered only at a periodic count — is treated as a negative adjustment. The JE is identical to movement type 6:

```
DR  Inventory Write-Down Expense (6210)   150.00
      CR  Merchandise Inventory (1141)             150.00
```

Shrinkage is an operating expense. It flows through the P&L and reduces operating profit. High shrinkage rates signal a controls problem and warrant investigation, but the accounting treatment is straightforward: the goods are gone, so remove them from inventory and expense the cost.

### 9. Write-down to net realisable value (NRV)

IAS 2 requires inventory to be valued at the lower of cost and NRV. NRV is the estimated selling price in the ordinary course of business minus the estimated costs to sell. If market prices fall below WAC, inventory must be written down.

Example: Item B has WAC = SAR 50.00 per unit. Current NRV (estimated selling price minus selling costs) = SAR 35.00 per unit. 20 units on hand.

Write-down per unit: 50.00 - 35.00 = 15.00. Total write-down: 20 × 15.00 = 300.00.

```
DR  Inventory Write-Down Expense (6210)   300.00
      CR  Merchandise Inventory (1141)             300.00
```

After this entry, the effective cost in the sub-ledger is SAR 35.00 per unit. If the NRV subsequently recovers, IAS 2 permits reversing the write-down — but only up to the original cost. The reversal goes to the P&L as income (DR 1141 / CR Inventory Write-Down Recovery). You cannot write inventory back above original cost, even if NRV exceeds it.

## Transfers must not change total valuation

This is a system-level correctness rule. An inter-branch transfer changes which location the stock sits in, not how much it is worth or what it costs. A correct transfer implementation must satisfy all three of these conditions:

First, the net effect on total inventory (1141 + 1142 combined, or 1141 across all locations) is zero. If a transfer JE has a non-zero net on inventory accounts, there is a bug.

Second, the WAC of the item is not altered by the transfer itself. The goods did not change; only their location did.

Third, no COGS entry is created. COGS requires a sale to an external party. Moving goods between your own locations is not a sale.

If you find a COGS entry in the JE log for a transfer transaction, or a non-zero net on 1141 after a transfer pair, the posting logic has an error that will silently inflate or deflate gross margin over time.

## The matched-pair rule

Every movement that changes stock quantity produces a corresponding and immediate change in the GL. This is the perpetual guarantee.

If quantity goes down: the JE credits Merchandise Inventory (1141) by qty × WAC. If quantity goes up: the JE debits Merchandise Inventory (1141) by qty × cost. The sub-ledger and the GL move together on every event. There is no batch, no deferred sync, no end-of-day rollup. Each transaction is atomic: the stock quantity update and the GL posting happen in the same database transaction. If one fails, both roll back.

This matched-pair discipline is what makes the inventory tie-out (covered in chapter 07) a confirmatory check rather than a repair exercise.

## The mental model

> Every event that changes stock quantity falls into one of two categories: it either moves
> units out (sale, return to supplier, negative adjustment, shrinkage) with a credit to 1141
> and a debit to a P&L or payable account, or it moves units in (receipt, customer return,
> positive adjustment) with a debit to 1141 and a credit to a payable or gain account.
> Transfers are a matched pair that net to zero. COGS belongs only to sales. Any other
> debit to 1141 without a matching stock increase, or credit to 1141 without a matching
> stock decrease, is a posting error.

Next: `06-vat-gst-subledgers.md`.
