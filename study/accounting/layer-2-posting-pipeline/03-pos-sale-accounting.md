# 03 — POS Sale Accounting

## What the POS module knows vs what accounting needs

The POS module knows:
- Total revenue collected (net of VAT)
- How the customer paid (cash, card, store credit, on account) and how much of each
- What taxes were collected (one or more tax lines, each with a tax code and an amount)
- What items were sold and at what cost (for the COGS entry — handled separately)

The accounting module turns these facts into balanced double-entry journal entries.

## The cash sale

A customer buys SAR 200 worth of goods. VAT is 5% (SAR 10). They pay cash. Total cash
collected: SAR 210.

```
DR  Cash (1112)                    210.00
      CR  Product Sales (4110)                200.00
      CR  Output VAT Payable (2131)            10.00
```

Why:
- Cash is coming **in** → debit the asset account (assets increase with debits)
- Revenue is being **earned** → credit the income account (income increases with credits)
- VAT collected belongs to the government, not to the business → credit the liability

The total debit (210) equals the total credit (200 + 10). Balanced.

## The card sale

A customer pays SAR 210 by card (KNET, Visa, or any card terminal). The money does not
land in the cash drawer — it goes via the card network to the business's bank account.

```
DR  Bank (1121)                    210.00
      CR  Product Sales (4110)                200.00
      CR  Output VAT Payable (2131)            10.00
```

The only difference from a cash sale is the debit account. `card` and `custom` (debit
networks like KNET, Benefit) both map to line type `bank`, which resolves to account 1121.
The card network fee (charged by the bank) is a separate expense recorded via bank
reconciliation, not here.

## Mixed tender

A customer's total is SAR 210. They pay SAR 100 cash and SAR 110 by card.

```
DR  Cash (1112)                    100.00
DR  Bank (1121)                    110.00
      CR  Product Sales (4110)                200.00
      CR  Output VAT Payable (2131)            10.00
```

The POS system emits two payment legs in the payload. The listener loops over all payment
legs and creates a debit line for each. The credits (revenue + tax) are fixed regardless
of how many payment methods are used. The balance check: 100 + 110 = 200 + 10 = 210.

## On-account sale (credit at the POS)

A known customer at the POS pays nothing now — they're buying on account. The POS allows
this via the `on_account` tender method. This is not a cash/card transaction; it creates
a receivable obligation.

```
DR  Trade Receivables (1131)       210.00
      CR  Product Sales (4110)                200.00
      CR  Output VAT Payable (2131)            10.00
```

The `on_account` tender maps to line type `receivable`, which resolves to the AR control
account (1131). This is the same account used for credit invoices in the Sales module
(Chapter 4). The POS on-account path is functionally identical to creating a sales
invoice — the customer now owes the business money, and that debt lives in AR.

## Where COGS comes from

You may have noticed: none of the entries above include COGS. This is intentional.

The POS module does not know the cost of the items sold. The inventory costing engine
(which runs weighted-average cost, WAC) is the authoritative source of COGS truth. When
a sale is confirmed, the inventory engine processes the stock movement, computes the cost
at the WAC rate, and emits its own `accounting.post` event with the COGS entry:

```
DR  Cost of Goods Sold (5100)      [WAC cost]
      CR  Merchandise Inventory (1141)         [WAC cost]
```

This comes from the inventory accounting listener, not the POS listener. The two entries
together give the complete picture for a sale: the POS listener posts revenue and
collection; the inventory listener posts cost and stock reduction.

## A POS return

A customer returns goods and gets a cash refund of SAR 210 (SAR 200 goods + SAR 10 VAT).

The return reverses the revenue and tax, and puts cash back in the drawer:

```
DR  Sales Returns (4200)           200.00
DR  Output VAT Payable (2131)       10.00
      CR  Cash (1112)                         210.00
```

Why `Sales Returns` (4200) instead of reversing the `Product Sales` credit? Because
accountants want to see gross sales and returns separately. `Sales Returns` is a
contra-income account: it lives in the income section of the P&L with a debit normal
balance, and it reduces net revenue on the report. The gross sales line stays intact;
the return is visible as a separate line.

The `returnAmount` in the payload is what goes to the refund method (cash out).
The `taxAmount` is the VAT portion being reversed.

The COGS reversal — putting stock back in inventory — comes from the inventory engine's
`inventory.sale_return` event, not from this entry.

## A POS void

A void is a transaction that was completed but should never have existed — the cashier
made an error, or the transaction was fraudulent. Unlike a return (where goods actually
came back), a void is a full accounting reversal: every leg of the original entry is
swapped.

If the original sale was:
```
DR  Cash          210.00
      CR  Sales           200.00
      CR  Output VAT       10.00
```

The void entry is:
```
DR  Sales Returns         200.00
DR  Output VAT             10.00
      CR  Cash                       210.00
```

This is identical to a return in structure. The key difference is operational: a return
requires a physical goods return and typically creates a separate document; a void cancels
the whole transaction as if it never happened. Both produce the same accounting effect
because accounting only cares about the economic result — cash out, revenue reversed, VAT
reversed.

## Shift close: cash over/short and drawer transfer

When a cashier closes their shift, the expected cash (sum of all cash sales) is compared
to the actual cash counted in the drawer. If they don't match:

**Cash over** (more cash than expected — rare, usually counting error):
```
DR  Cash (1112)                   [over amount]
      CR  Cash Over/Short (6700)              [over amount]
```

**Cash short** (less cash than expected — common, usually change errors or theft):
```
DR  Cash Over/Short (6700)        [short amount]
      CR  Cash (1112)                         [short amount]
```

`Cash Over/Short` (6700) is an expense account (a short increases expense; an over
decreases it, effectively functioning as income — but we post to the same account with
opposite sign). It's a small balance in well-run businesses.

When the cashier transfers the drawer's cash to the safe or bank:
```
DR  Bank (1121)                   [transfer amount]
      CR  Cash (1112)                         [transfer amount]
```

This moves the cash off the "cash at register" asset account and into the bank account
(or petty cash), where it sits until deposited.

## The mental model

> A POS transaction has two accounting events: the revenue side (POS listener: DR
> collection method / CR revenue + tax) and the cost side (inventory listener: DR COGS /
> CR inventory). Returns and voids are revenue-side reversals using contra-income
> accounts. Shift close settles variances and transfers cash between asset accounts.
> Every entry is balanced, immutable, and idempotent.

Next: `04-sales-invoicing-accounting.md`.
