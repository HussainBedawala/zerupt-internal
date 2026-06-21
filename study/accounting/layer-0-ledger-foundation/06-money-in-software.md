# 06 — Money in Software

Accounting is correct only if the *numbers* are correct to the last fraction. This chapter is
about how money must be represented in code and storage. Get this wrong and the books drift by
pennies that compound into real discrepancies an accountant will catch.

## Rule 1: NEVER use floating-point for money

A `float`/`double` cannot represent most decimal fractions exactly. The classic:

```
0.1 + 0.2 === 0.30000000000000004   // in floating point
```

If you store money as floats, a thousand transactions accumulate tiny errors and your trial
balance fails to balance by a cent — a Layer 0 catastrophe. **Money is never a float. Ever.**

## The two correct representations

**Option A — Decimal type (what Zerupt uses).** Store amounts as a database `NUMERIC`/`DECIMAL`
with fixed precision and scale, and do arithmetic with a decimal library (we use **Decimal.js**,
configured to precision 28 with banker's rounding). Our ledger columns are `numeric(19,6)` — up to
19 total digits, 6 after the decimal point. Six decimals comfortably covers 3-decimal currencies
(like Kuwaiti Dinar, KWD) plus intermediate precision for tax and FX math.

**Option B — Integer minor units.** Store amounts as whole numbers of the smallest unit (cents,
fils), e.g. $1.00 = `100`, KWD 1.000 = `1000`. Stripe and Square do this. It makes float errors
*impossible* because there are no fractions to lose. The cost: you must always know each
currency's scale (USD=2, KWD=3) to interpret the integer.

Both are valid. We chose decimals. The audit noted that integer minor-units would be even more
bulletproof for multi-currency, since it removes any chance of application code rounding a
3-decimal currency to 2 — a trade-off to weigh for the 10-year design, not a bug today.

## Rule 2: rounding must be deliberate and consistent

When you compute 5% VAT on 33.33 you get 1.6665 — which must be rounded to display precision.
*How* you round matters:

- **Half-up** ("round half away from zero"): 1.6665 → 1.67. Intuitive, common in retail/tax.
- **Banker's rounding** (round-half-to-even): 1.665 → 1.66, 1.675 → 1.68. Reduces systematic bias
  when rounding many numbers; common in finance.

The danger is *inconsistency*: if one code path rounds half-up and another banker's, two
computations of "the same" number disagree and an entry fails to balance. The rounding mode must
be a single, tenant-configured policy applied everywhere. (Our engine uses banker's rounding in
Decimal.js; the tenant currency policy also records a rounding mode — these must agree.)

## Rule 3: every amount carries a currency

A number without a currency is meaningless. "100" is not money; "100 AED" is. Every monetary
column must travel with a 3-letter ISO currency code (AED, SAR, KWD, INR…), validated to the
`^[A-Z]{3}$` shape. Our ledger enforces this with a CHECK constraint on the currency column.

## Rule 4: dual-currency for multi-currency businesses (IAS 21)

A business in the UAE (functional currency AED) might buy from a US supplier in USD. The entry
must record **both**:

- the **transaction currency (TC)** amount — what actually changed hands (e.g., USD 100)
- the **functional currency** amount — translated to the books' currency at the exchange rate
  (e.g., AED 367.30 at rate 3.673)

Our schema stores both on every line: `debit/credit` (functional) and `debit_tc/credit_tc`
(transaction), plus `exchange_rate` and `exchange_rate_date`. This follows **IAS 21** (the
international standard for foreign-currency accounting) and lets us:

1. Keep the books balanced in the functional currency (what the TB and reports use).
2. Remember the original foreign amounts (for supplier reconciliation).
3. Later compute FX gains/losses when the rate moves between invoice and payment.

A subtle correctness point the audit raised: the engine asserts balance in the **functional**
currency. For mixed-rate multi-currency entries you also want the **TC** side to balance
(`Σ debit_tc = Σ credit_tc`). That's a watch-point for the bulletproofing work.

## Rule 5: precision for rates, not just amounts

Exchange rates need *more* decimals than amounts. Converting between, say, Indonesian Rupiah and
Kuwaiti Dinar involves tiny per-unit ratios. We store rates as `numeric(18,10)` — ten decimal
places — so the conversion doesn't lose precision before it's applied to the amount.

## The mental model

> Money = (exact decimal amount) + (currency) + (when foreign: the rate and the date).
> Never a float. Round once, consistently. Keep both the foreign and home amounts.

Next: `07-immutability-audit-and-reversals.md`.
