# 04 — Multi-Currency Reporting

## The problem

A retailer in Saudi Arabia buys from a German supplier in EUR, pays a local logistics
company in SAR, sells to a Kuwaiti wholesaler in KWD, and reports its financials in SAR
(its functional currency). At any moment, the books hold balances denominated in three
currencies. How do these appear on the financial statements?

This is not a cosmetic question. A EUR payable of €50,000 is worth SAR 200,000 when the
rate is 4.00 and SAR 210,000 when the rate moves to 4.20. If the rate moves and nobody
retranslates the balance, the balance sheet understates liabilities. The income statement
misses a real economic loss. The business does not know it is losing money on currency
exposure.

## Functional vs presentation currency

**Functional currency** is the currency of the primary economic environment in which the
business operates — essentially, the currency in which it earns and spends money most
of the time. For a Saudi retailer, this is SAR. For a UAE retailer, this is AED. The
functional currency is determined by the facts of the business; it is not a choice.

**Presentation currency** is the currency in which the financial statements are published.
Usually it is the same as the functional currency. In some cases — a subsidiary preparing
statements for a foreign parent — the presentation currency differs from the functional
currency. This requires a full translation of the financial statements using IAS 21 rules
(translating assets/liabilities at closing rate, income/expenses at average rate, and
recognizing the resulting translation difference in other comprehensive income).

For a single-entity retail ERP in GCC, India, or Southeast Asia, the functional currency
and the presentation currency are almost always the same. Reports present in the functional
currency. **This chapter focuses on that common case.**

## How foreign-currency transactions enter the ledger

When a transaction is denominated in a foreign currency, it is recorded in the GL at the
**spot rate on the transaction date**, converted to the functional currency:

```
Invoice received from German supplier: €50,000
EUR/SAR spot rate on invoice date: 4.00
Posted to ledger:
  DR  Merchandise Inventory (1141)    SAR 200,000
    CR  Trade Payables (2111)             SAR 200,000
```

The journal entry also records the original foreign-currency amount and the rate used, so
the payable's foreign-currency identity is preserved. This is essential for aging,
settlement, and period-end revaluation.

## Period-end revaluation (IAS 21)

At the close of each reporting period, every open **monetary balance** denominated in a
foreign currency must be retranslated at the period-end (closing) spot rate. Monetary
balances include:
- Trade receivables in foreign currency
- Trade payables in foreign currency
- Bank accounts in foreign currency
- Loans in foreign currency

Non-monetary balances (inventory, PP&E booked at historical cost) are NOT retranslated.
They stay at the historical rate used when they were recorded.

The difference between the historical-rate amount and the closing-rate amount is the
**unrealized FX gain or loss**. It is recognized in the income statement for the period
(not deferred to equity, in the case of operating items — IAS 21.28).

```
EUR payable opened at 4.00: SAR 200,000
EUR/SAR closing rate at 30 June: 4.20
Retranslated amount: €50,000 × 4.20 = SAR 210,000
Unrealized FX loss: SAR 10,000

Revaluation journal entry:
  DR  FX Loss — Unrealized (7210)     SAR 10,000
    CR  Trade Payables (2111)             SAR 10,000
```

After this entry, the payable on the balance sheet shows SAR 210,000 — the correct
economic value at the balance sheet date. The P&L includes a SAR 10,000 FX loss.

This is covered in depth in Layer 4, Chapter 05. The point here is its effect on reports:
the balance sheet must show all foreign-currency monetary items at closing rate, and the
P&L must include the resulting unrealized gain or loss.

## Why reports present in functional currency

All three financial statements present in the functional currency. This means:

- Revenue booked in KWD or USD is translated to SAR at the transaction-date rate and
  recorded in SAR. The revenue line on the P&L is in SAR only.
- Trade receivables in KWD are shown on the balance sheet at the SAR equivalent at the
  period-end closing rate (after revaluation).
- The cash flow statement shows cash movements in SAR, regardless of which currency bank
  account they touched.

There is no multi-currency display in the primary statements. Each amount appears once,
in the functional currency.

## Multi-currency in sub-reports

Sub-reports (like AR aging, supplier statements, or open purchase orders) may be
presented in both the original foreign currency and the functional currency equivalent.
This is useful for operations — a buyer managing EUR payables wants to see EUR balances,
not just SAR equivalents. But any such sub-report that shows functional-currency totals
must tie to the GL control account at the closing rate.

A common mistake: showing a customer's USD receivable balance at a "live" or month-old
rate on an aging report, while the GL holds the period-end revalued rate. The two numbers
do not match, and a confused accountant starts investigating a phantom discrepancy. The
rule: always use the same rate in sub-reports that was used in the GL revaluation.

## Translation adjustments (brief)

When a parent company consolidates a foreign subsidiary that uses a different functional
currency, IAS 21 requires a full translation:
- Assets and liabilities: closing rate
- Income and expenses: average rate for the period
- The difference: recognized in **Other Comprehensive Income (OCI)** — NOT in P&L

This translation difference accumulates in a separate equity reserve called the Foreign
Currency Translation Reserve (FCTR). It is not income or loss; it is a valuation
adjustment waiting to be recycled to P&L when the subsidiary is sold.

For a single-entity retail ERP (which is where Zerupt operates), this complexity does not
apply. It matters only when the system later needs to handle group consolidation.

## Key rules for multi-currency reports

| Rule | Consequence of breaking it |
|------|---------------------------|
| Always revalue open FX monetary balances at closing rate before running the balance sheet | Liabilities/receivables understated or overstated; equity wrong |
| Always use the same period-end rate in both the GL and sub-reports | Phantom reconciliation differences |
| Non-monetary assets (inventory, PP&E) stay at historical rate | If translated at closing rate, COGS and asset values are wrong and not comparable across periods |
| FX gain/loss from revaluation goes to P&L, not equity | Misstating net income |
| Revenue in foreign currency: use transaction-date rate, not period-end rate | Revenue does not reflect what was actually earned; rates change |

## Worked example

Zerupt Demo Retail (SAR functional). Quarter ended 30 September 2025.

Two foreign-currency exposures at quarter-end:

| Item | Foreign Amount | Historical Rate | SAR at Cost | Closing Rate | SAR at Close | Gain/(Loss) |
|------|---------------:|----------------:|------------:|-------------:|-------------:|------------:|
| EUR Payable (Supplier A) | €50,000 | 4.00 | 200,000 | 4.15 | 207,500 | (7,500) |
| USD Receivable (Customer B) | $20,000 | 3.75 | 75,000 | 3.78 | 75,600 | 600 |
| **Net FX loss** | | | | | | **(6,900)** |

Period-end revaluation journals:
```
DR  FX Loss — Unrealized (7210)      7,500
  CR  Trade Payables (2111)              7,500

DR  Trade Receivables (1131)           600
  CR  FX Gain — Unrealized (7220)         600
```

After revaluation:
- Balance sheet: Payables include SAR 207,500 (correct closing value); Receivables include
  SAR 75,600 (correct closing value).
- P&L: Net FX loss of SAR 6,900 recognized for the quarter.
- These amounts are included in the TB; the balance sheet and P&L tie to the TB.

## The mental model

> Financial reports present in the functional currency. Every foreign-currency monetary
> balance must be retranslated at the period-end closing rate before the balance sheet and
> P&L are run. If revaluation is skipped, the balance sheet is wrong and the P&L is wrong
> in ways that compound over time as exchange rates move. The only items that do NOT
> retranslate are non-monetary items (inventory, PP&E) — they stay at historical cost.
> Multi-currency is not a display feature; it is an accounting requirement that must be
> enforced in the close process before any report is generated.

Next: `05-ar-ap-aging.md`.
