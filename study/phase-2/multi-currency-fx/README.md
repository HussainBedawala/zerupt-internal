# Multi-Currency & FX Gain/Loss

## IAS 21 — The Effects of Changes in Foreign Exchange Rates

IAS 21 governs how foreign currency transactions are recorded and how financial statements of foreign operations are translated. Key concepts:

### Functional vs Transaction Currency

- **Functional currency**: The currency of the primary economic environment where the entity operates. Set per legal entity and locked after the first journal entry is posted.
- **Transaction currency**: The currency of a specific business transaction. Can differ from the functional currency.
- **Group currency**: Used for consolidated reporting across multiple entities (future phase).

### Exchange Rate Types

| Type | When Used |
|------|-----------|
| **Spot rate** | Day-to-day transactions (sales, purchases, payments) |
| **Closing rate** | Period-end revaluation of monetary items |
| **Average rate** | P&L translation for foreign operations |
| **Contract rate** | Hedged transactions with forward contracts |

### Rate Lookup Pattern

Exchange rates are stored per currency pair per date. When an exact date match doesn't exist, the system falls back to the most recent prior date. This "waterfall lookup" is standard practice — you don't need a rate for every single day, just the most recent one before the transaction date.

## Realized vs Unrealized FX Gain/Loss

### Realized FX Gain/Loss

Occurs when a foreign currency transaction is **settled** (paid) at a different rate than when it was **booked** (invoiced).

```
Invoice: USD 10,000 @ 0.307 = KWD 3,070.000
Payment: USD 10,000 @ 0.310 = KWD 3,100.000
Realized FX Gain: KWD 30.000
```

The gain/loss is "realized" because cash has changed hands. It's permanent and goes to income statement accounts (4820 Realized FX Gain / 7210 Realized FX Loss).

**Critical implementation detail**: Use the actual posted book value from the original journal entry, not a recomputed value from the rate. Recomputing introduces rounding differences.

### Unrealized FX Gain/Loss

Occurs at period-end when open foreign currency balances are **revalued** to the closing rate. The entity still holds the foreign currency position — the gain/loss is "unrealized" (paper only).

```
Open AR: USD 50,000 booked at KWD 15,350
Closing rate: 0.310 → Revalued: KWD 15,500
Unrealized FX Gain: KWD 150
```

These entries **auto-reverse** on the first day of the next period, so they don't accumulate. Each period gets a fresh revaluation.

## Double-Entry Patterns

### Realized FX (part of payment JE)

```
DR  Bank Account              [received at new rate]
CR  Trade Receivables          [original booking amount]
CR  Realized FX Gain (4820)    [difference]
```

The FX line is part of the same atomic journal entry as the payment — not a separate entry. This ensures the AR balance zeroes out exactly.

### Unrealized FX Revaluation

```
Gain:  DR  AR/AP/Bank         |  CR  Unrealized FX Gain (4830)
Loss:  DR  Unrealized FX Loss (7220)  |  CR  AR/AP/Bank
```

Auto-reversal next period:
```
DR  Unrealized FX Gain (4830)  |  CR  AR/AP/Bank
```

## Inverse Rate Storage

Store one direction only (e.g., 1 USD = 3.6725 AED). The inverse (1 AED = 0.2723 USD) is precomputed and stored alongside for query convenience. This avoids:
- Consistency risk (two independently entered rates could disagree)
- Storage duplication
- Bulk import complexity

The lookup service checks both directions automatically.

## Decimal Precision for Money

Never use floating-point (`float`, `double`) for financial calculations. Use fixed-point decimal arithmetic:

- **Storage**: `numeric(19,6)` for amounts, `numeric(18,10)` for rates
- **Calculation**: Decimal.js with precision 28, ROUND_HALF_EVEN (banker's rounding)
- **Per-currency decimals**: KWD/BHD/OMR = 3, USD/EUR/AED = 2, JPY/KRW = 0

ROUND_HALF_EVEN (banker's rounding) is preferred over ROUND_HALF_UP because it's statistically unbiased — it rounds to the nearest even number when the value is exactly halfway (e.g., 2.5 → 2, 3.5 → 4).
