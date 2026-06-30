# 04 — Multi-Currency

## Exchange Rate on Invoices

`sales_invoices.exchange_rate` — `sales.ts` line ~218:
```
numeric(18,10) — booking rate, functional-currency units per transaction-currency unit.
Default "1" (functional currency). NOT NULL.
CHECK: exchange_rate > 0
```
Mirrors `purchase_invoices.exchange_rate` exactly (per schema comment line 212).

## Exchange Rate on Receipts

`sales_receipt_vouchers.exchange_rate` — same pattern (booking rate at receipt date).
Realized FX (gain/loss) is computed at receipt time against the invoice booking rate.
The `sales.listener.ts` receipt handler uses per-allocation `fxGainLoss` supplied by the emitter — not re-derived from the cash/AR difference.

---

## Missing: `defaultCurrency` on Customer

**Spec (`01-customer-model.md`):** `defaultCurrency` — "Default transaction currency for new documents."

**Schema:** NO `default_currency` column on `sales_customers`.
**DTO (`customers.dto.ts`):** `CreateCustomerInput` and `UpdateCustomerInput` do not include `defaultCurrency`.
**Frontend types (`types.ts`):** `Customer`, `CreateCustomerPayload`, `UpdateCustomerPayload` all omit `defaultCurrency`.

**Effect:**
- When creating a new sales invoice for a customer, the invoice currency cannot be pre-filled from the customer master. The user must manually select the currency each time.
- For multi-currency tenants (e.g. a Kuwait company dealing in KWD and USD), this is a usability gap and a data-entry error risk.
- The purchase side has the same gap: no `default_currency` on `suppliers`.

---

## Multi-Currency AR Balance

The `outstandingReceivables` KPI in `sales-overview.service.ts` (line ~71) sums ALL confirmed invoice balances regardless of currency — it returns a single number. For multi-currency tenants, this SUM mixes currencies and is meaningless as a total.

**The overview service resolves a single functional currency** (via `resolveCurrency()` from the first branch's legal entity) and presents that as the currency label — but the balance sum is NOT converted to functional currency. Invoices in foreign currencies are summed at their `balance` column value (which is in the transaction currency, not functional).

This is a structural gap in the overview KPI that will become a correctness bug when any customer pays in a non-functional currency.

---

## Per-Currency AR Aging

The AR aging in `sales-overview.service.ts` lines ~131–175 has the same issue: it buckets `SUM(balance)` without currency conversion. For a single-functional-currency tenant this is fine; for multi-currency it will be wrong.

Compare: the spec-compliant approach (used in accounting for period-close) would compute balances per (customerId, currency) and apply exchange rates to functional before summing.

---

## FX Gain/Loss on Receipts

The receipt listener (`sales.listener.ts`) correctly posts realized FX using the emitter-supplied `fxGainLoss` per allocation (`receipt-fx.ts` computes it). This is correct IAS 21 mechanics. The GL side of FX is correct; the dashboard summary side is not (see above).
