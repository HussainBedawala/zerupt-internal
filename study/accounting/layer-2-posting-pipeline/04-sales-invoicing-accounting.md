# 04 — Sales Invoicing Accounting

## Credit sales vs cash sales

A POS cash sale is complete the moment the money changes hands. A sales invoice (B2B
credit sale) is different: the business delivers goods or performs a service and issues
an invoice. The customer pays later — in 30, 60, or 90 days. In the meantime, the
business has earned the revenue but hasn't received the cash. This is a **credit sale**,
and it creates an **accounts receivable** (AR) — the customer's debt to the business.

## Confirming a sales invoice

When a sales invoice is confirmed (status transitions to "confirmed"), the event
`sales.invoice.confirmed` fires.

Suppose the invoice is for SAR 1,000 net + SAR 50 VAT (5%) = SAR 1,050 gross:

```
DR  Trade Receivables (1131)     1,050.00
      CR  Product Sales (4110)              1,000.00
      CR  Output VAT Payable (2131)            50.00
```

- **DR Trade Receivables (1131):** The customer owes us the full amount including VAT.
  AR is an asset — it increases with a debit.
- **CR Product Sales (4110):** Revenue is recognized at the point the goods are delivered
  (accrual accounting) — even though cash hasn't arrived yet.
- **CR Output VAT Payable (2131):** VAT is collected on behalf of the government. At
  confirmation it becomes a liability even if the customer hasn't paid yet.

The receivable line type is `"receivable"` in the payload; the posting engine resolves it
to account 1131 (the AR control account, which is a control account — no manual posting
allowed).

## AR control account vs AR subledger

Account 1131 in the GL holds the total of everything all customers owe, combined. If you
have 500 customers, you can't see individual balances in the GL. That's what the **AR
subledger** is for: a separate table that tracks the balance per customer. Every time an
invoice posts to 1131, a corresponding row is written to the AR subledger for that
specific customer. When a payment comes in, both 1131 and the subledger entry are
reduced. At any moment: SUM(all customer subledger balances) must equal the balance of
account 1131. This reconciliation invariant is what Layer 3 is about.

## Customer receipt (payment against an invoice)

The customer pays their SAR 1,050 invoice in full by bank transfer:

```
DR  Bank (1121)                  1,050.00
      CR  Trade Receivables (1131)          1,050.00
```

- **DR Bank:** Cash arrives in the business's bank account → asset increases.
- **CR Trade Receivables:** The customer's debt is extinguished → AR decreases.

The posting uses event `sales.receipt.posted`. The payload includes the payment method
(`bank_transfer` → line type `bank`), the total amount, and an `allocations` array
linking the payment to the specific invoices it settles.

## Advance payment (receipt before invoice)

Sometimes a customer pays in advance — before any invoice exists. The money can't go to
AR (there's nothing to offset) and can't go to revenue (the goods haven't been delivered
yet). It parks in **Customer Deposits** (2151), a liability account. The business owes
the customer goods or a refund.

```
DR  Bank (1121)                    500.00
      CR  Customer Deposits (2151)           500.00
```

When the invoice is later confirmed and the deposit is applied, the deposit is drawn down
and AR is cleared in a matching receipt transaction.

## Early payment discount

If the customer pays early under a "2/10 net 30" term (2% discount if paid within 10
days), the business gives up some revenue as the cost of getting cash sooner. The
discount is posted to a contra-revenue account:

```
DR  Bank (1121)                    1,029.00   ← actual cash received
DR  Sales Discounts (4300)            21.00   ← 2% of 1,050
      CR  Trade Receivables (1131)          1,050.00
```

Total debit (1,029 + 21) = Total credit (1,050). Balanced. The gross AR is fully cleared;
the discount is visible as a separate cost of sale.

## Overpayment

If the customer sends more than they owe, the excess is not revenue — it's a liability
(the business must either refund it or apply it to future invoices). The overage goes to
Customer Deposits (2151):

```
DR  Bank (1121)                    1,100.00
      CR  Trade Receivables (1131)          1,050.00
      CR  Customer Deposits (2151)             50.00
```

## Credit note (sales return / price adjustment)

When a customer returns goods or the business agrees to reduce the invoice amount, a
credit note is issued. The event `sales.creditNote.confirmed` fires.

For a full return of the SAR 1,000 invoice + SAR 50 VAT:

```
DR  Sales Returns (4200)          1,000.00
DR  Output VAT Payable (2131)        50.00
      CR  Trade Receivables (1131)          1,050.00
```

- **DR Sales Returns (4200):** Contra-income account. Gross sales stays intact; the
  return is visible as its own line on the P&L.
- **DR Output VAT Payable (2131):** The government no longer needs to be paid for goods
  that were returned. The tax liability is reduced.
- **CR Trade Receivables (1131):** The customer no longer owes us — the debt is wiped.

The COGS side (returning the goods to inventory) is handled by the inventory engine's
`inventory.sale_return` event, exactly as in the POS case.

## Multi-rate VAT

In India, GST has multiple rates (CGST + SGST, or IGST). A single invoice might have
goods at 5% GST and goods at 12% GST. The payload carries an array of tax lines, each
with its own `taxCodeId` and amount. The listener posts one credit line per tax component:

```
DR  Trade Receivables (1131)       [total incl. all tax]
      CR  Product Sales (4110)              [net revenue]
      CR  Output GST 5% (2131.01)          [5% component]
      CR  Output GST 12% (2131.02)         [12% component]
```

Each tax line has its own account (resolved by `taxCodeId` via the tax configuration),
so the VAT return can correctly report tax at different rates.

## The mental model

> A credit sale creates a receivable when the invoice is confirmed, and extinguishes it
> when the customer pays. Cash doesn't touch revenue accounting — revenue is recognized
> at delivery (accrual). Tax becomes a liability at confirmation, paid to the government
> when settled. Credit notes reverse revenue and tax. The AR control account (1131) must
> always equal the sum of the AR subledger — that's the Layer 3 reconciliation invariant.

Next: `05-purchase-accounting.md`.
