# 05 — FX Revaluation (IAS 21)

## Why FX revaluation exists

A company based in Saudi Arabia (reporting currency: SAR) might owe a German supplier
EUR 10,000. When the payable was originally booked, the EUR/SAR rate was 4.00, so the
payable was recorded as SAR 40,000. Three months later, when the accounting period ends,
the EUR/SAR rate is 4.15. The company still owes EUR 10,000 — but in SAR terms, that
obligation is now SAR 41,500. The balance sheet should show SAR 41,500, not SAR 40,000.

The SAR 1,500 difference is not realized. The company has not paid yet. The rate may
move back before payment. But under IAS 21 (The Effects of Changes in Foreign Exchange
Rates), the liability must be stated at the **closing rate** at the balance sheet date.
The SAR 1,500 difference is recognized as an **unrealized FX loss** in the P&L for
the period.

This process — adjusting all open foreign-currency monetary balances to the closing rate
at period end — is called **FX revaluation**.

## Monetary vs non-monetary items

IAS 21 draws a critical distinction:

**Monetary items** are assets or liabilities to be received or paid in a fixed or
determinable number of currency units. Examples:

- Cash and bank accounts denominated in a foreign currency
- Trade receivables (amounts owed to you in a foreign currency)
- Trade payables (amounts you owe in a foreign currency)
- Loans receivable or payable in a foreign currency
- Accrued expenses in a foreign currency

Monetary items are revalued at the **closing rate** at each balance sheet date.

**Non-monetary items** are assets or liabilities not settled in a fixed number of
currency units. Examples:

- Inventory (stated at cost, WAC does not change because exchange rates move)
- Property, plant and equipment (historical cost in functional currency)
- Prepayments (the right to receive a service, not cash)
- Intangible assets

Non-monetary items are **not revalued**. They stay at the rate that applied when the
asset was originally recognized (the **historical rate**). This is why a machine
purchased in EUR three years ago does not get revalued every month even though the EUR
rate has moved.

**Why?** Because a monetary item will ultimately result in a cash inflow or outflow at
the prevailing rate — so the current rate is the economically relevant rate. A
non-monetary item will not produce a cash inflow or outflow at a future rate — the
machine provides services regardless of what the EUR does — so the historical rate is
the economically relevant rate.

## Period-end revaluation: the mechanics

At the end of each period (or at minimum at each balance-sheet date), the system:

1. Identifies every open monetary balance denominated in a foreign currency.
2. Looks up the **closing rate** for that currency pair as at the period-end date.
3. Computes the new SAR (or AED, or INR…) value: FC amount × closing rate.
4. Computes the difference versus the currently-booked SAR value.
5. Posts a revaluation journal entry to adjust the balance and recognize the gain or loss.

**Worked example 1: AP revaluation (unrealized loss)**

Company: Zerupt Demo. Reporting currency: AED.
Supplier invoice: EUR 10,000. Booked 15 October 2025 at EUR/AED = 3.90.
Period-end rate (31 October 2025): EUR/AED = 4.05.

| | EUR amount | EUR/AED rate | AED value |
|---|----------:|:---:|----------:|
| Booked (15 Oct) | 10,000.000 | 3.9000 | 39,000.00 |
| Period-end (31 Oct) | 10,000.000 | 4.0500 | 40,500.00 |
| **Difference** | | | **1,500.00** (liability increased) |

The payable increased by AED 1,500. We owe more in reporting-currency terms. That is a
loss. The revaluation journal entry:

```
DR  Unrealized FX Loss (7215)     1,500.00
      CR  Trade Payables (2111)            1,500.00
```

After this entry, **Trade Payables (2111)** carries AED 40,500 — the EUR 10,000 at the
31 October closing rate. The balance sheet is correctly stated.

**Worked example 2: AR revaluation (unrealized gain)**

Customer invoice: USD 5,000. Booked 20 October 2025 at USD/AED = 3.67.
Period-end rate (31 October 2025): USD/AED = 3.73.

| | USD amount | USD/AED rate | AED value |
|---|----------:|:---:|----------:|
| Booked (20 Oct) | 5,000.000 | 3.6700 | 18,350.00 |
| Period-end (31 Oct) | 5,000.000 | 3.7300 | 18,650.00 |
| **Difference** | | | **300.00** (asset increased) |

The receivable increased by AED 300. We will receive more in reporting-currency terms.
That is a gain. The revaluation journal:

```
DR  Trade Receivables (1131)        300.00
      CR  Unrealized FX Gain (4825)           300.00
```

After this entry, **Trade Receivables (1131)** carries AED 18,650 — the USD 5,000 at
the 31 October closing rate.

## Reversing vs cumulative revaluation

There are two approaches to booking FX revaluation entries over multiple periods:

**Approach A — Reverse-next-period:** at the start of Period 2 (1 November), the
Period 1 revaluation entry is automatically reversed. Period 2's revaluation entry is
then computed fresh from the original booking rate. Only the current-period movement
is in the P&L.

*Effect on Period 2 P&L:* only the rate change during Period 2 is recognized. The
prior-period reversal and current-period entry net out to just the October-to-November
rate movement.

**Approach B — Cumulative (no reversal):** the Period 1 revaluation remains on the
books. Period 2 revaluation computes the difference between the current carrying value
(which already includes Period 1's revaluation) and the new closing rate. Only the
incremental change appears in Period 2.

Both approaches are correct under IAS 21 — they produce the same cumulative numbers.
The difference is presentation: under Approach A, each period's FX P&L impact is the
full amount attributable to that period viewed from the opening rate. Under Approach B,
each period's FX P&L impact is only the incremental movement from the prior period-end
rate.

Approach A is more common in practice because it keeps the revaluation entries tidy —
each month is self-contained. Approach B requires tracking cumulative adjustments
per-balance and is harder to audit.

## Realized vs unrealized: the settlement moment

When the monetary item is finally settled (the EUR payable is paid, the USD receivable
is collected), the accounting:

1. **Reverse the unrealized entry** (it is no longer unrealized — it is about to be
   realized or the difference from the original rate is captured as realized).
2. **Post the settlement** using the actual payment-date rate.
3. The difference between the original booking rate and the settlement rate is the
   **realized FX gain or loss**.

Continuing from Worked Example 1 (the EUR 10,000 payable):

The payable was booked at 3.90 (AED 39,000). Period-end revaluation at 4.05
(AED 40,500) created an unrealized loss entry. Now suppose the payable is paid on
15 November at EUR/AED = 4.02:

Actual AED paid: 10,000 × 4.02 = AED 40,200.

If using Approach A (reversal on 1 November): the 31 October unrealized entry is
reversed on 1 November, so **Trade Payables (2111)** is back at AED 39,000 at the
start of November. The payment entry then:

```
DR  Trade Payables (2111)         39,000.00   ← clears at original booking rate
DR  Realized FX Loss (7210)        1,200.00   ← 39,000 vs 40,200 paid
      CR  Bank (1121)                         40,200.00   ← actual AED outflow
```

The 31 October unrealized loss (AED 1,500) reversed on 1 November, and a realized loss
of AED 1,200 is recognized on 15 November. The net October–November FX impact is:
unrealized +1,500 in October, −1,500 reversal + 1,200 realized in November = net AED
1,200 loss for the item overall — exactly the difference between the booking rate (3.90)
and the payment rate (4.02).

**Summary of FX treatment per event:**

| Event | Entry type | Rate used | P&L account |
|-------|-----------|-----------|------------|
| Invoice booked | Initial | Transaction date rate | — (balance sheet only) |
| Period-end | Unrealized revaluation | Period-end closing rate | Unrealized FX Gain/Loss |
| Settlement | Realized + clear revaluation | Settlement date rate | Realized FX Gain/Loss |

## Exchange rate sourcing and precision

**Which rate to use:** IAS 21 requires the **closing rate** — the spot rate at the
balance sheet date. In practice this is the mid-market rate published by the central
bank or a recognized financial data provider. For MENA: Saudi Central Bank (SAMA),
UAE Central Bank, Central Bank of Kuwait (KWD). For India: RBI reference rate. For
Southeast Asia: respective central banks.

**Precision:** exchange rates have 4–6 decimal places (e.g., EUR/SAR = 4.051732). The
FX revaluation computation is:

```
revalued_amount = fc_amount × closing_rate
gain_loss = revalued_amount − carrying_amount
```

Both computations use the full-precision rate; only the final AED/SAR/INR JE amount is
rounded to the currency's decimal places (2 for SAR, AED, INR; 3 for KWD).

**KWD example (3 decimal places):**
Invoice: KWD 2,500.000 payable. Booked at EUR/KWD = 0.340123. Carrying: KWD 850.308.
Period-end rate: 0.341500. Revalued: 2,500 × 0.341500 = KWD 853.750.
Revaluation entry: KWD 853.750 − 850.308 = KWD 3.442 (3 decimal places).

```
DR  Unrealized FX Loss (7215)       3.442
      CR  Trade Payables (2111)              3.442
```

## Presentation currency translation (brief note)

IAS 21 also covers translating the entire financial statements of a subsidiary with a
different **functional currency** into the parent's **presentation currency**. This is
distinct from transactional FX.

Rules for translation to presentation currency:
- **Assets and liabilities** (all items on the balance sheet): translate at the
  **closing rate** at the period-end date.
- **Income and expenses**: translate at the **exchange rate at the date of each
  transaction** (or a weighted-average rate for the period as a practical approximation).
- **Equity items** (share capital, retained earnings): translate at historical rates
  (the rates that applied when those equity items arose).

The difference that arises from using different rates for the balance sheet (closing)
and the income statement (average) is not a gain or loss — it is a translation
adjustment. It goes to **Other Comprehensive Income (OCI)** as the **Cumulative
Translation Adjustment (CTA)**. CTA lives in equity, not in P&L.

For Zerupt's typical single-tenant, single-functional-currency retailer, presentation
currency translation is rarely required. It becomes relevant when a multi-entity tenant
consolidates subsidiaries reporting in different currencies (a UAE-based group that
owns a Saudi subsidiary reporting in SAR, and a consolidated group report in AED).

## The mental model

> Under IAS 21, every open monetary balance in a foreign currency is a moving target —
> its reporting-currency value changes every time the exchange rate moves. At period end
> you must stop the clock, look up the closing rate, and restrate every open FC monetary
> balance to that rate. The difference is unrealized: it flows through P&L (not OCI) for
> transactional items but may reverse if the rate moves back before settlement. At
> settlement, you clear the unrealized entry and post the true realized gain or loss.
> Non-monetary items (inventory, fixed assets, prepayments) are never revalued — they
> stay at the historical rate forever.

Next: `06-the-close-checklist.md`.
