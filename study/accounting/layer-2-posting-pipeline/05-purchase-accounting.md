# 05 — Purchase Accounting

## The mirror of sales

Purchase accounting is the mirror of sales accounting. Where a sale creates AR (someone
owes us), a purchase creates AP (we owe someone). Where a sale credits revenue, a
purchase debits inventory or expense. Where a sale posts output VAT (liability), a
purchase posts input VAT (recoverable asset or inventory cost).

## The GRN: goods received, no invoice yet

In many retail and wholesale businesses, physical goods arrive at the warehouse before
the supplier's invoice arrives in the office. This is the "receive now, bill later" flow.
When goods arrive, a Goods Received Note (GRN) is confirmed. The event
`purchase.grn.confirmed` fires.

For SAR 500 of goods received, with no supplier invoice matched yet:

```
DR  Merchandise Inventory (1141)   500.00
      CR  GRN Accrual (2121)                 500.00
```

- **DR Inventory (1141):** The goods are now in our warehouse — an asset has arrived.
  Debit the asset account.
- **CR GRN Accrual (2121):** We haven't received the invoice yet, so we don't know the
  exact amount the supplier will charge. We credit an accrual account (a liability) as a
  placeholder: "we owe something to someone for these goods."

When the supplier invoice later arrives and is confirmed, the accrual is cleared:
```
DR  GRN Accrual (2121)             500.00
      CR  Trade Payables (2111)              500.00
```

The net effect: DR Inventory / CR Trade Payables — exactly as if no GRN had been used.
The GRN accrual is just a staging liability that lets us put the goods on the balance
sheet immediately without waiting for the invoice.

## The purchase invoice (bill)

When a supplier's invoice arrives, it is confirmed as `purchase.invoice.confirmed`.

**Scenario A: manual bill (no prior GRN):**
SAR 500 net + SAR 25 recoverable VAT = SAR 525 total.

```
DR  Merchandise Inventory (1141)   500.00
DR  Input Tax Recoverable (1162)    25.00
      CR  Trade Payables (2111)              525.00
```

- **DR Inventory:** Goods are capitalized into stock.
- **DR Input Tax Recoverable (1162):** Recoverable VAT is an asset — the government will
  refund it (or we'll offset it against output VAT). It is NOT an expense.
- **CR Trade Payables (2111):** The AP control account records that we owe the supplier
  the full amount including VAT.

**Scenario B: bill matched to a prior GRN:**
The accrual amount (SAR 500) is already sitting in 2121 from the GRN entry. Billing
clears the accrual rather than debiting inventory again (the goods are already there):

```
DR  GRN Accrual (2121)             500.00
DR  Input Tax Recoverable (1162)    25.00
      CR  Trade Payables (2111)              525.00
```

Inventory (1141) is not touched — the debit was already booked at GRN time.

## Non-recoverable VAT

Some businesses or purchase types cannot recover their input VAT (e.g., entertainment,
certain services, or businesses below the VAT registration threshold). Non-recoverable
VAT is not an asset — it's a cost that gets capitalized into the inventory cost per
IAS 2 (International Accounting Standard 2 — Inventories):

```
DR  Merchandise Inventory (1141)   525.00   ← includes the VAT amount
      CR  Trade Payables (2111)              525.00
```

The VAT is capitalized into the cost of the item. When the item is sold, the COGS entry
includes the VAT as part of the cost.

## Reverse-charge VAT

Under UAE VAT and similar regimes, certain purchases (imports, specified services) use
the reverse-charge mechanism: the buyer self-assesses the VAT. The effect is a
wash entry — the same amount appears as both input (recoverable) and output (payable):

```
DR  RC Input Tax 1162.10           [VAT amount]   ← recoverable input
      CR  RC Output Tax 2131.10                   [VAT amount]   ← self-assessed output
```

These use dedicated sub-accounts (1162.10 and 2131.10) so they are separately reportable
on the VAT201 return (Box 3 and Box 10). The net cash effect is zero — we owe ourselves
nothing — but both sides must appear on the return.

## Supplier payment

When we pay the supplier, the event `purchase.payment.posted` fires:

```
DR  Trade Payables (2111)          525.00
      CR  Bank (1121)                        525.00
```

- **DR Trade Payables:** The liability is extinguished.
- **CR Bank:** Cash leaves the business.

### Supplier advance payment

When we pay a supplier in advance (before any bill), it goes to Supplier Prepayments
(1161) — an asset, not an expense:

```
DR  Supplier Prepayments (1161)    200.00
      CR  Bank (1121)                        200.00
```

When the bill arrives and the advance is applied:

```
DR  Trade Payables (2111)          200.00
      CR  Supplier Prepayments (1161)        200.00
```

No cash moves — the prepayment asset is reclassified into AP settlement.

### Early payment discount

If the supplier offers a 1% discount for early payment on a SAR 525 bill (discount = SAR
5.25):

```
DR  Trade Payables (2111)          525.00
      CR  Bank (1121)                        519.75
      CR  Purchase Discounts (4810)            5.25
```

The full payable is cleared; the cash paid is less; the discount is income (4810 is an
income account — "we paid less than we owed").

## Purchase return

When we return goods to a supplier, the original receipt entries are reversed. For a
return of SAR 300 of goods (at WAC cost), with recoverable VAT of SAR 15:

```
DR  Trade Payables (2111)          315.00
      CR  Merchandise Inventory (1141)       300.00
      CR  Input Tax Recoverable (1162)        15.00
```

- AP is reduced (we owe less).
- Inventory is reduced at WAC cost.
- Input tax recoverable is reversed (we can no longer claim it).

If there is a price variance (the supplier bill price differs from WAC), a small plug is
posted to a COGS adjustment account to keep the JE balanced.

## Landed costs

Landed costs are additional costs of acquiring goods that are capitalized into inventory:
freight, customs duties, insurance. They are NOT expensed immediately — they increase the
cost of the inventory (per IAS 2). When a landed cost is allocated, the event
`purchase.landedCost.allocated` fires, one JE per cost component:

**Freight from a freight forwarder (AP):**
```
DR  Merchandise Inventory (1141)   [freight amount]
      CR  Trade Payables (2111)              [freight amount]
```

**Insurance paid via bank:**
```
DR  Merchandise Inventory (1141)   [insurance amount]
      CR  Bank (1121)                        [insurance amount]
```

**Duty not yet invoiced (accrual):**
```
DR  Merchandise Inventory (1141)   [duty amount]
      CR  Accrued Expenses (2122)            [duty amount]
```

The landed cost increases the weighted-average cost of the items received, so when those
items are sold, COGS reflects the true all-in cost.

## The mental model

> A purchase creates AP when goods are received or billed. Recoverable VAT is an asset
> (input tax recoverable). Non-recoverable VAT is capitalized into inventory. Landed
> costs increase inventory cost. Paying the supplier extinguishes the AP and reduces
> bank. Returns reverse the inventory and AP. The AP control account (2111) must equal
> the sum of the AP subledger — the same reconciliation invariant as AR, for the other
> direction.

Next: `06-inventory-cogs-accounting.md`.
