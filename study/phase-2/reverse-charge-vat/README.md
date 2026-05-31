# Reverse-Charge VAT — Concepts

## What is reverse charge?

In a normal purchase, the supplier charges VAT and remits it to the tax authority. Under **reverse charge**, the buyer self-assesses — the supplier charges nothing, but the buyer must declare both the input tax (recoverable) and the output tax (payable) on their own VAT return. Net cash effect: zero. Reporting effect: both legs appear.

Common triggers: imports, cross-border services (UAE/Saudi), India Reverse Charge Mechanism (RCM) on specified services.

## Journal entry pattern

```
Standard purchase (supplier charges VAT):
  DR  Inventory/Expense         100
  DR  Input Tax Recoverable       5
  CR  Accounts Payable          105   ← supplier billed 105

Reverse-charge purchase (supplier charges nothing):
  DR  Inventory/Expense         100
  DR  Input Tax Recoverable      15   ← self-assessed input
  CR  Output Tax Payable         15   ← self-assessed output
  CR  Accounts Payable          100   ← supplier only billed 100
```

The reverse-charge legs are net-zero on the AP side, but both appear on the VAT return (Box 6 input / Box 1 output in UAE terminology).

## Why `payableTotal` must exclude reverse-charge tax

The supplier's invoice does not include reverse-charge tax. If you include it in the AP credit you overstate the liability — you'd owe the supplier money they never billed. The `payableTotal` passed to the journal entry must equal what the supplier actually charged.

## Implementation pattern

Three-way branch in the purchase accounting listener:

```
if isReverseCharge:
    DR input_tax + CR output_tax (isRecoverable ignored — RC always self-assessed)
elif isRecoverable:
    DR input_tax
else:
    DR inventory (capitalise the cost)
```

`isReverseCharge` takes precedence because reverse-charge is a mechanism decision, not a recoverability decision. A regime could theoretically have non-recoverable reverse charge (very rare), but the accounting treatment is still the self-assessed pair — you'd just have a separate entry to expense the disallowed input. This is a deferred edge case.

## Event payload design

`EventTaxLine` carries both flags so the listener is stateless (no DB lookup at JE time):

```typescript
interface EventTaxLine {
  taxCodeId: string;
  amount: string;
  isRecoverable: boolean;
  isReverseCharge: boolean;   // sourced from TaxCode.category === 'reverse_charge'
}
```

`payableTotal` is computed at emission time: `bill.total − sum(reverseChargeTax)`.

## VAT return implications

The tax return needs both the taxable base and the tax amount per component. This requires `taxableAmountTC` on each JE tax line — currently missing and tracked as DEV-355. Without it, the VAT report must back-derive the base from `amount / rate`, which breaks for bills dated before a rate change.

## Key files

- `apps/api/src/accounting-events/listeners/purchase-accounting.listener.ts` — three-way branch
- `apps/api/src/purchase/invoices/purchase-invoices-events.ts` — `EventTaxLine`, `payableTotal` exclusion
- `agent-os/product/accounting/02-tax-model.md` — canonical spec
