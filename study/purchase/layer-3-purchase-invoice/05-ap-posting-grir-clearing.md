# 05 — AP Posting and GR/IR Clearing

## Full JE: Bill Confirmed (3-way match)

```
DR GRN Accrual 2121          accrualClearedAmount     (clears Layer 2 GRN credit)
DR Inventory 1141             inventoryRemainder        (manual/unmatched lines only)
DR Input Tax 1162             Σ recoverable tax         (per tax line)
DR rc_input_tax 1162.10       Σ reverse-charge input    (RC only)
CR rc_output_tax 2131.10      Σ reverse-charge output   (RC only, same amount)
CR Trade Payables 2111        payableTotal              (supplier-tagged, AP subledger)
```

Where:
- `inventoryAmount = accrualClearedAmount + inventoryRemainder`
- `payableTotal = subtotal + recoverableVAT + reverseChargeVAT` (balance is `total - RCvat`)
- Non-recoverable VAT → DR Inventory 1141 (not shown separately)

Listener: `purchase-accounting.listener.ts:236-353`

## GR/IR Clearing Mechanics

GR/IR (Goods Received / Invoice Received) is the 2121 account.

### Layer 2 posts the credit

When GRN confirmed with `hasSupplierInvoice = false`:
```
DR Inventory 1141     (cost)
CR GRN Accrual 2121   (cost)
```
Stock is capitalised. Liability is to 2121 (not yet a real AP — supplier invoice not received).

### Layer 3 clears it

When bill confirmed (GRN-matched lines):
```
DR GRN Accrual 2121   accrualClearedAmount   ← clears the 2121 credit
CR Trade Payables 2111  payableTotal          ← real AP now recognised
```

The `accrualClearedAmount` = net subtotal of all GRN-linked lines. If bill price = GRN cost, 2121 nets to zero exactly. If there is a price difference, a residual sits in 2121 — this is a **purchase price variance** that accumulates in 2121 without a separate variance account (potential gap).

### No Double-Count of Inventory

The inventory engine handles stock quantity/cost layers for `grn_receipt` movements but does NOT post an inventory JE. The GRN listener is the sole source of the 1141 debit at receipt (listener comment line 7-11). At bill confirm, the listener only debits 1141 for `inventoryRemainder` (unmatched lines) — not again for matched lines. So no double-debit of 1141.

## AP Subledger (Party Tagging)

The CR Trade Payables 2111 line MUST carry `partyType: "supplier"` + `partyId: supplierId`. This tags the GL line to the AP sub-ledger for aging reports.

```typescript
lines.push({
  lineType: "payable",
  creditTC: payload.payableTotal,
  partyType: "supplier",
  partyId: payload.supplierId,
  sourceDocumentDate: payload.billDate,  // AP aging date
  dueDate: payload.dueDate,             // AP aging bucket
});
```

Listener: line 325-333. `dueDate` populates the aging bucket. `billDate` = `invoiceDate` (the supplier's date, not system date).

Rules:
- 2121 (GRN Accrual) is NOT a control account → no party tag allowed (listener rejects it)
- 1161 (Supplier Prepayments) is NOT a control account → no party tag
- Only 2111 carries supplier party tags

## Payment Settlement (Layer 4)

On `purchase.payment.posted` (standard):
```
DR Trade Payables 2111    gross (= totalAmount + discount + fx)   supplier-tagged
CR Cash/Bank              totalAmount
CR purchase_discount 4810 discountAmount                           (if early-payment discount)
CR fx_gain 4820 / DR fx_loss 7210                                 (if multi-currency)
```

The DR 2111 must equal exactly what was credited at bill confirm so the supplier balance zeroes out at full settlement.

## Advance Payments

On `purchase.payment.posted` (advance):
```
DR Supplier Prepayments 1161   totalAmount   (NOT supplier-tagged — not a control account)
CR Cash/Bank                   totalAmount
```

On `purchase.payment.advanceApplied`:
```
DR Trade Payables 2111         appliedTotal   (supplier-tagged)
CR Supplier Prepayments 1161   appliedTotal − fx
FX plug if needed
```

## Multi-Currency AP

Bills can be in a non-functional currency (`currency` column). The listener receives amounts in transaction currency (TC); the JE engine converts to functional currency using the bill's `exchangeRate`. At payment, `fxGainLoss` captures the realized FX difference between the invoice rate and the payment rate.

`totalFn` / `balanceFn` columns on `purchase_invoices` freeze the functional equivalents at booking rate for AP aging in functional currency (schema:289-291).

## Balance Integrity

DB CHECK constraint enforces:
```sql
balance = total - paidAmount
```
(`purchase.ts:339`). Partial service writes cannot corrupt AP aging.

## EXISTS vs REQUIRES

| Feature | Status |
|---------|--------|
| AP subledger party tag on 2111 | EXISTS |
| GR/IR 2121 clearing (accrualClearedAmount) | EXISTS |
| No double-count of inventory (sole-source guard) | EXISTS |
| AP aging dates (billDate, dueDate) on JE line | EXISTS |
| balance integrity DB CHECK | EXISTS |
| totalFn/balanceFn functional-currency columns | EXISTS |
| Purchase price variance account when bill price ≠ GRN cost | REQUIRES (residual sits in 2121 uncoded) |
| Early-payment discount (4810) | EXISTS (payment layer) |
| Realized FX on payment | EXISTS |
| Realized FX on advance application | EXISTS |
