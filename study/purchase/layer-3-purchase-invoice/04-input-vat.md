# 04 — Input VAT / GST

## Tax Recognition Point

Input tax is recognised at bill confirm (`purchase.invoice.confirmed` event), not at GRN receipt — unless the GRN was matched at receipt (`hasSupplierInvoice = true`), in which case the GRN listener recognises tax then.

| GRN path | Tax recognised at |
|----------|------------------|
| `hasSupplierInvoice = false` (typical) | Bill confirm |
| `hasSupplierInvoice = true` (simultaneous match) | GRN confirm |

## Tax Computation

`recompute()` in `purchase-invoices-totals.ts` calls `TaxCalcService` per line using the line's `taxGroupId` and the bill date as the rate-effective date. This ensures:
- Tax rates frozen at bill date (not draft creation date)
- Same tax pass used for totals stored in DB and amounts emitted to GL (no divergence)

## Tax Line Schema (listener payload)

```typescript
{
  taxCodeId: string,
  amount: string,          // tax amount TC
  isRecoverable: boolean,
  isReverseCharge: boolean,
  taxableAmountTC?: string
}
```

## Three Tax Cases

### Case 1: Recoverable VAT (standard)

```
DR Input Tax 1162       amount
  lineType: "input_tax"
  taxClassification: "recoverable"
```

UAE 5% standard-rated purchases, Saudi VAT, Singapore GST.

### Case 2: Non-Recoverable VAT (capitalized)

```
DR Inventory 1141       amount
  lineType: "inventory"
  taxClassification: "capitalised_non_recoverable"
  taxCodeId retained
```

Per IAS 2: non-recoverable tax is part of cost. Posts to the `inventory` lineType (same account 1141). `taxCodeId` is retained on the line so `TaxSummaryService` can reconstruct the non-recoverable box (Box 9 equivalent) without scanning JE history.

Listener code: `purchase-accounting.listener.ts:306-319`

### Case 3: Reverse Charge (import/B2B)

Self-assessed tax: the buyer both pays and (potentially) recovers the tax.

```
DR rc_input_tax 1162.10      amount   (taxClassification: "reverse_charge_input")
CR rc_output_tax 2131.10     amount   (taxClassification: "reverse_charge_output")
```

Net JE impact = zero, but both legs appear on the VAT return:
- UAE VAT201: Box 3 (RC output) + Box 10 (RC input)
- Routed to import sub-accounts 1162.10 / 2131.10 (DEV-360) — separately reportable

`isReverseCharge` takes precedence over `isRecoverable` (listener:272).

## Decision Tree

```
tax.isReverseCharge?
  YES → DR rc_input_tax + CR rc_output_tax
  NO → tax.isRecoverable?
         YES → DR input_tax 1162
         NO  → DR inventory 1141 (capitalize)
```

## Tax on GRN (hasSupplierInvoice = true)

When the GRN is matched at receipt, the `grnConfirmed` listener handles tax (lines 406-449). Same three-case logic applies. When `hasSupplierInvoice = false`, `taxLines` is empty at GRN — tax is deferred to the bill.

## Tax on Bill Confirm vs GRN Confirm (Double-Count Risk)

If a GRN is confirmed with `hasSupplierInvoice = false` → no tax at GRN. Bill confirm → tax posted. No double-count.

If `hasSupplierInvoice = true` → tax at GRN. GRN-linked bill confirm sets `taxLines = buildTaxLines(summary)` again → this WOULD double-count if the bill emits tax for GRN-matched lines. This is a potential gap (see EXISTS/REQUIRES below).

## India TDS (Withholding Tax)

TDS is handled in a separate `withholding-tax` module (`supplierTdsConfig`, `tdsDeductions`). Not part of the `taxLines` array in this event. Not in scope for Layer 3 study.

## EXISTS vs REQUIRES

| Feature | Status |
|---------|--------|
| Recoverable VAT posting (1162) | EXISTS |
| Non-recoverable VAT capitalized to inventory (IAS 2) | EXISTS |
| Reverse-charge dual legs (1162.10/2131.10) | EXISTS |
| Tax frozen at bill date via recompute() | EXISTS |
| taxCodeId retained on capitalised line for reporting | EXISTS |
| Input tax NOT doubled for GRN-matched lines | REQUIRES verification — bill always rebuilds taxLines from recompute(); if GRN already posted input tax, bill confirm may double-post |
| Non-recoverable partial recovery (split recoverable/non-recoverable in same tax code) | REQUIRES |
| GST ITC blocked categories (India) | REQUIRES |
