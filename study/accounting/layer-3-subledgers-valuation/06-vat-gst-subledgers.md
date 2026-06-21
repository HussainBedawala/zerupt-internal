# 06 — VAT and GST Subledgers

## Tax accounts as control accounts

Two GL accounts hold the tax position at any moment:

**Output VAT Payable (2131)** is a liability. Every time a sale carries VAT, this account increases (CR) by the tax amount collected from the customer. The business collected the tax on behalf of the government and now owes it. When the business files its VAT return and remits payment to the tax authority, the account decreases (DR). The running balance is what the business currently owes in output tax.

**Input Tax Recoverable (1162)** is an asset. Every qualifying purchase that carries input VAT increases this account (DR). The business has paid tax to its supplier and can recover that amount by offsetting it against output tax. When the net payment is made at filing time, 1162 decreases (CR).

Net tax position at any date: Output VAT Payable (2131) minus Input Tax Recoverable (1162) = the amount owed to (or refundable from) the tax authority for that period. If 2131 exceeds 1162, the business owes the difference. If 1162 exceeds 2131 (unusual, but possible for exporters with zero-rated sales), the business is owed a refund.

The subledger behind each control account is the full list of individual taxable transactions: invoice number, date, counterparty, net amount, tax rate, tax amount. The control account total must equal the sum of this subledger at every moment — the same invariant that applies to AR and inventory.

## Tax categories

Four categories determine how VAT/GST is handled on any given supply. Getting the category right is a legal requirement; miscategorising a transaction causes an incorrect return and potential penalties.

**Standard-rated:** the normal VAT or GST rate applies. Output tax is charged on the sale and must be remitted. Input tax paid on related purchases is fully recoverable. This is the default for most retail sales.

**Zero-rated:** the VAT rate is 0%. The sale is taxable — it must be reported on the VAT return — but no tax is collected from the customer. The critical point: because the supply is taxable (just at 0%), the business CAN still recover input VAT on costs attributable to zero-rated sales. Exports are typically zero-rated. Do not confuse zero-rated with no-VAT or untaxed.

**Exempt:** VAT is not charged, and the business CANNOT recover input VAT on costs attributable to exempt supplies. This is the meaningful difference from zero-rated. A business that has both taxable and exempt sales must apportion its input VAT — only the portion relating to taxable sales is recoverable. In GCC, financial services and residential property are commonly exempt. In India, certain agricultural goods are exempt.

**Out-of-scope:** entirely outside the VAT system. Salary payments, dividends, intra-group capital transfers. No output or input tax. Not reported on the return at all.

**Reverse charge:** the buyer self-assesses both the output tax and the input tax. It is used for cross-border B2B services and certain imports where the supplier is not registered in the buyer's jurisdiction. The net cash effect is zero (the business owes SAR 75.00 to the government and simultaneously claims SAR 75.00 back), but both legs must be reported on the return. Omitting the reverse charge output leg understates the declared tax base, which is a filing error.

## GCC VAT: UAE and KSA specifics

GCC VAT was introduced across the Gulf Cooperation Council beginning in 2018, modelled broadly on the EU VAT directive. The standard rates are UAE = 5% and KSA = 15% (raised from 5% in 2020). Both jurisdictions use a single standard rate plus zero-rated and exempt categories.

### KSA standard-rated sale

Sale of goods: SAR 1,000.00 net, 15% VAT.

```
DR  Trade Receivables (1131)       1,150.00
      CR  Product Sales (4110)               1,000.00
      CR  Output VAT Payable (2131)            150.00
```

On the ZATCA VAT return: Box 1 (standard-rated sales, net) = SAR 1,000.00. Box 1 tax = SAR 150.00.

### KSA reverse-charge (imported B2B service)

A KSA-registered business receives a consulting service from a foreign supplier. Service fee = SAR 500.00. No VAT was charged by the foreign supplier (they are not KSA-registered). The KSA buyer self-assesses at 15%.

```
DR  RC Input VAT (1162.10)            75.00
      CR  RC Output VAT (2131.10)              75.00
```

Both sub-accounts are tagged "reverse charge" so the return can separate them. Box 3 of the ZATCA return (reverse charge output): SAR 75.00. Box 10 (reverse charge input): SAR 75.00. Net position: zero cash owed on this transaction, but both figures appear on the return.

### ZATCA e-invoicing requirement

ZATCA (the Saudi tax authority) mandates that every tax invoice include a QR code and be reported electronically. The tax subledger must carry sufficient detail — invoice number, counterparty NIN (National ID or tax number), line-level tax amounts — to generate the ZATCA-compliant XML. The subledger is not optional; it is the source of the electronic filing.

## India GST: CGST, SGST, IGST

India's GST, introduced in 2017, has three components. Which components apply depends on whether the supply crosses a state boundary.

**Intra-state supply (seller and buyer in the same state):** the tax splits equally between Central GST (CGST) and State GST (SGST). An 18% GST rate means 9% CGST + 9% SGST. Both are owed — CGST goes to the central government, SGST goes to the state government.

**Inter-state supply (seller and buyer in different states, or exports):** Integrated GST (IGST) applies at the full combined rate (e.g., 18% IGST). There is no split. IGST is collected by the central government and later apportioned between central and state.

Common GST rates in Indian retail: 0%, 5%, 12%, 18%, 28%. Every item is classified under the Harmonised System of Nomenclature (HSN) code that determines its rate. Getting the HSN code wrong means filing at the wrong rate.

Each component has its own GL account:

- **Output CGST (2131.01)**, **Output SGST (2131.02)**, **Output IGST (2131.03)**
- **Input CGST (1162.01)**, **Input SGST (1162.02)**, **Input IGST (1162.03)**

The offset rules at filing time are specific: IGST can be used to offset CGST first, then SGST. CGST can offset CGST only. SGST can offset SGST only. CGST and SGST cannot offset each other. If a business has surplus IGST credit, it has flexibility; if it has surplus CGST but a SGST liability, it cannot cross-apply.

### Intra-state sale (CGST + SGST)

Sale of INR 10,000.00 net, 18% GST (9% CGST + 9% SGST):

```
DR  Trade Receivables (1131)      11,800.00
      CR  Product Sales (4110)              10,000.00
      CR  Output CGST (2131.01)                900.00
      CR  Output SGST (2131.02)                900.00
```

### Inter-state sale (IGST)

Sale of INR 10,000.00 net, 18% IGST:

```
DR  Trade Receivables (1131)      11,800.00
      CR  Product Sales (4110)              10,000.00
      CR  Output IGST (2131.03)              1,800.00
```

### Intra-state purchase (input CGST + SGST)

Purchase of INR 5,000.00 net, 18% GST (9% + 9%):

```
DR  Merchandise Inventory (1141)   5,000.00
DR  Input CGST (1162.01)             450.00
DR  Input SGST (1162.02)             450.00
      CR  Trade Payables (2111)              5,900.00
```

The input tax is an asset (recoverable). It does not increase the cost of the inventory because it will be reclaimed.

## Credit notes reversing tax

When a credit note is issued for a sales return or price adjustment, the tax on the original invoice must be reversed. The credit note reduces the customer's balance and reverses the sales revenue and VAT.

**KSA credit note** for a return of goods worth SAR 200.00 net (15% VAT):

```
DR  Product Sales (4110)             200.00
DR  Output VAT Payable (2131)         30.00
      CR  Trade Receivables (1131)             230.00
```

The credit note also appears on the next ZATCA return as a negative adjustment to Box 1 (reducing declared sales by SAR 200.00 and reducing declared output tax by SAR 30.00).

**India credit note** for an intra-state return, INR 1,000.00 net, 18% GST:

```
DR  Product Sales (4110)           1,000.00
DR  Output CGST (2131.01)             90.00
DR  Output SGST (2131.02)             90.00
      CR  Trade Receivables (1131)           1,180.00
```

The inventory reinstatement (DR 1141 / CR COGS) is a separate JE handled by the inventory movement (see chapter 05).

## Per-line vs per-invoice rounding

Tax can be computed in two ways: calculate tax on each line item and round each line, or calculate tax on the invoice net total and round once. The two methods can produce different totals when amounts do not divide evenly.

**Per-line:** each line is multiplied by the tax rate and rounded to the currency's decimal places. The invoice tax total is the sum of rounded line taxes. A five-line invoice might accumulate up to SAR 0.05 of rounding difference compared to per-invoice calculation.

**Per-invoice:** compute tax on the sum of all net line amounts, then round once. More common in GCC. Simpler but can produce a one-unit difference (SAR 0.01, INR 0.01, KWD 0.001) from what per-line calculation would give.

Both are legally valid in most jurisdictions, but a given system must apply one method consistently to every transaction. Mixing methods across invoices produces return figures that are impossible to reconcile back to individual invoices.

KWD note: KWD has 3 decimal places (fils). Tax on KWD 100.000 at 5% = KWD 5.000 exactly. Tax on KWD 33.333 at 5% = KWD 1.66665, which rounds to KWD 1.667. For KWD, use 3 decimal place rounding throughout — on the JE, on the invoice, and in the subledger.

## How subledger detail maps to return boxes

The VAT return is an aggregation of the tax subledger. Each row in the subledger carries: transaction date, transaction type (invoice or credit note), tax category (standard/zero/exempt/reverse charge), net amount, tax rate, and tax amount. The return is produced by grouping rows by category and summing net amounts and tax amounts per group.

If the subledger carries insufficient detail — for example, if it records only the control account total and not the per-transaction category — the return cannot be produced from the system. The finance team must prepare the return manually from original invoices, which is slow, error-prone, and unauditable.

A subledger designed for filing has a one-to-one relationship between every posted invoice line and a tax subledger row. The GL control account (2131 or 1162) is always the sum of those rows.

## The mental model

> Output VAT Payable (2131) and Input Tax Recoverable (1162) are control accounts whose
> subledger is every taxable transaction, tagged by category and rate. The VAT return is
> a group-by query on that subledger — nothing more. The zero-rated vs exempt distinction
> is not cosmetic: zero-rated supplies allow input tax recovery on related costs, exempt
> supplies do not. India GST splits every supply into up to three component taxes with
> strict offset rules between them. Rounding method and currency precision must be
> consistent across every transaction or the return will not reconcile to the books.

Next: `07-reconciliation-and-tie-outs.md`.
