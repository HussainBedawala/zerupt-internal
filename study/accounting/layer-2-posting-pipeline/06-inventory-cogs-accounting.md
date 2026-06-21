# 06 — Inventory and COGS Accounting

## Two ledgers, one truth

Inventory has two parallel records that must always agree:

1. **The stock subledger** — the operational record: how many units of each item are in
   each location, at what cost, and what movements have happened. This is what purchasing,
   POS, and picking work from.

2. **The GL inventory control account (1141)** — the accounting record: a single number
   on the balance sheet that says "our inventory is worth SAR X." Every movement that
   changes the physical stock quantity at a cost must produce a JE that moves account 1141
   by the same amount.

**The invariant:** Balance of account 1141 = sum of (quantity × WAC cost) across all
items and locations.

If this invariant is broken, the balance sheet is wrong. A physical stock count that
shows SAR 800,000 in inventory while the GL shows SAR 750,000 means SAR 50,000 of stock
is invisible to the books — and the P&L is overstated by the same amount.

## How a sale triggers COGS

When an item is sold, two things happen simultaneously:
- A unit leaves the warehouse (stock goes down)
- Cost flows from Inventory to COGS (the expense of that inventory sold)

The cost is computed at the **Weighted Average Cost (WAC)**: total cost of all units in
stock divided by total units. If we bought 10 units at SAR 100 and 10 more at SAR 120,
WAC = (10×100 + 10×120) / 20 = SAR 110 per unit.

When one unit is sold, the inventory accounting listener (via `inventory.sale` or the
POS transaction's COGS event) posts:

```
DR  Cost of Goods Sold (5100)      110.00
      CR  Merchandise Inventory (1141)       110.00
```

- **DR COGS (5100):** The cost of the item sold is now an expense on the P&L.
- **CR Inventory (1141):** The balance sheet inventory value decreases by the same amount.

The business sold the unit for SAR 200. Revenue is SAR 200 (posted by the POS/sales
listener). Cost is SAR 110 (posted here). Gross profit = SAR 90. The P&L tells that
story correctly because both entries happened.

## Why COGS is the inventory engine's job, not the POS listener's

The POS listener doesn't know the WAC cost. It knows the selling price. The inventory
costing engine is the single source of WAC truth — it maintains the weighted average,
applies it to movements, and posts the COGS JE. The POS listener explicitly comments:
"COGS/inventory lines are NOT posted here. The inventory engine owns COGS truth."

This separation means there's one authoritative source of cost data. If the POS listener
also tried to post COGS, we'd need to keep WAC costs synchronized between two places —
a recipe for reconciliation errors.

## Stock adjustments

Sometimes inventory adjustments are needed outside of sales or purchases:
- Goods are found damaged and written off
- A count finds more stock than expected
- Goods expire

**Write-down (decrease):** SAR 150 of goods are written off as damaged:

```
DR  Inventory Write-Down (expense)  150.00
      CR  Merchandise Inventory (1141)       150.00
```

The inventory account decreases; the loss flows to an expense account. It appears on the
P&L as an operational cost.

**Write-up (increase):** SAR 50 of goods are found (e.g., a counting error discovered
surplus stock):

```
DR  Merchandise Inventory (1141)    50.00
      CR  Inventory Gain (income)             50.00
```

The inventory account increases; the gain flows to an income account. This is uncommon
but happens during physical count corrections.

## Inter-branch transfers

When stock is transferred between branches (different locations owned by the same business),
there is a two-step accounting process using an **Inventory in Transit** account (1142):

**Step 1 — Send (source branch):**
```
DR  Inventory in Transit (1142)    300.00
      CR  Merchandise Inventory (1141)       300.00
```

The goods leave Branch A but haven't arrived at Branch B yet. They're "in transit" — an
asset that is neither at the source nor the destination.

**Step 2 — Receive (destination branch):**
```
DR  Merchandise Inventory (1141)   300.00
      CR  Inventory in Transit (1142)        300.00
```

When the goods arrive, transit is cleared and inventory is reinstated at the destination.

At any point, the total of inventory + transit across all branches should still equal
account 1141. If there are missing items at receive (lost or damaged in transit):

```
DR  Inventory Write-Down           [missing cost]
      CR  Inventory in Transit (1142)        [missing cost]
```

The transit account is cleared; the loss goes to expense.

**Same-branch transfer:** If both source and destination are the same physical location
(just a sub-location reorganization), no JE is posted. The stock subledger updates its
location records, but the GL value is unchanged.

## The GL inventory account as the control account

Just as AR (1131) is the control account for the AR subledger, Inventory (1141) is the
control account for the stock subledger. The invariant must hold:

```
Balance of 1141 = Σ(qty × WAC_cost) across all items × all locations
```

This reconciliation is verified in Layer 3. The reason it must be a control account (no
manual posting allowed) is the same as AR: if someone posts manually to 1141 without
going through the inventory engine, the GL and the subledger diverge, and the
reconciliation breaks.

## The mental model

> Every time stock quantity changes at a cost, account 1141 moves by the same amount.
> Sales trigger COGS (DR COGS / CR Inventory). Adjustments are expense or income.
> Transfers flow through an in-transit staging account. The GL inventory balance must
> always equal the stock subledger total — if they diverge, the balance sheet is wrong.
> The inventory engine, not the domain modules, owns the COGS calculation.

Next: `07-cheques-and-fx-accounting.md`.
