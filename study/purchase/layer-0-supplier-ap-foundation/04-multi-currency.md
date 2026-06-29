# 04 — Multi-Currency Supplier Balances

## Accounting Module Rules (spec: `accounting/03-multi-currency.md`)

| Concept | Rule |
|---------|------|
| Functional currency | Set per legal entity on `LegalEntity.functionalCurrency` |
| Transaction currency | Invoice-level; must be in `TenantCurrency` whitelist |
| Exchange rate | Lookup from `exchangeRates` table: most recent prior date if exact date missing |
| JE lines | Store both `amount` (functional) and `amountFC` (transaction) |
| Realized FX | Computed at payment: `allocated_at_payment_rate - allocated_at_original_rate` |
| Unrealized FX | Month-end revaluation of open FC balances; auto-reverses next period |

---

## Supplier Default Currency — MISSING

**Spec (`01-supplier-model.md`):** `defaultCurrency` is a required supplier field.

**Current schema:** No `default_currency` column on `suppliers` table (`purchase.ts` lines 77–134).

**Impact:** When creating a purchase invoice for a foreign-currency supplier, there is no supplier-level default to pre-fill the `currency` field. The UI must prompt every time, increasing data entry error risk.

**REQUIRES:** Add `default_currency varchar(3)` to `suppliers`. FK check against `tenant_currencies` table (or validated at service layer). Null = use tenant functional currency.

---

## Invoice-Level Currency

`purchase_invoices.currency` (varchar 3, NOT NULL) is set at invoice creation. `exchange_rate numeric(18,10)` (CHECK > 0) is set at the same time.

All monetary columns (`total`, `paidAmount`, `balance`) are in the **transaction currency** (not functional currency).

**REQUIRES:** For AP aging and subledger-to-GL reconciliation in functional currency, a `total_fn` / `balance_fn` column is needed. Currently the system must multiply `balance × exchange_rate` at query time, which:
1. Uses the booking rate (correct for historical amounts)
2. Cannot account for unrealized FX revaluation without re-reading the JE

---

## Payment FX (spec: `06-supplier-payments.md`)

On `supplier_payments.posted`:

```
fxGainLoss = allocatedAmountFN_at_payment_rate - allocatedAmountFN_at_original_invoice_rate
```

Favorable: CR Realized FX Gain (4820)  
Unfavorable: DR Realized FX Loss (7210)

The `supplierPaymentAllocations` table (not fully shown in scope reads) carries per-allocation FX gain/loss. This is structurally correct per spec.

---

## Unrealized FX Revaluation

Open AP balances in foreign currencies must be revalued at month-end closing rate.

**CURRENT STATE:** The spec documents month-end revaluation (CR Unrealized FX Gain or DR Unrealized FX Loss). No implementation of this process exists in the purchase module yet.

**REQUIRES (10-year):** A revaluation job that:
1. Fetches all `purchase_invoices WHERE status='confirmed' AND balance > 0 AND currency != functional_currency`
2. Computes `revalued_balance = balance × closing_rate`
3. Compares to `balance × original_booking_rate` (requires `total_fn` column — see above)
4. Posts unrealized FX JE per supplier per currency

---

## Multi-Currency AP Subledger Reconciliation

When invoices are in multiple currencies, the GL reconciliation becomes:

```
SUM(purchase_invoices.balance × exchange_rate) + unrealized_fx_adjustments = GL 2111 balance (in functional currency)
```

This cannot be mechanically enforced without:
- `total_fn` / `balance_fn` columns on `purchase_invoices`
- Unrealized FX postings tracked separately

Both are gaps for a 10-year design.
