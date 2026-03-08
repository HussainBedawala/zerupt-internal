# Multi-Currency Design

## Concepts

| Term | Definition |
|------|------------|
| **Functional currency** | Tenant's reporting currency. Set at onboarding. All financial statements use this. |
| **Transaction currency** | Currency of a specific transaction. Can differ from functional currency. |
| **Exchange rate** | Conversion factor: transaction currency → functional currency. |

## Exchange Rate Table

| Field | Type | Description |
|-------|------|-------------|
| `tenantId` | string | |
| `fromCurrency` | string | e.g., `USD` |
| `toCurrency` | string | e.g., `KWD` |
| `rate` | decimal | 1 USD = 0.307 KWD |
| `effectiveDate` | date | |
| `source` | enum | `Manual`, `AutoFetched` |

- One rate per currency pair per date per tenant
- If no rate for exact date, use most recent prior rate

## Journal Entry Lines

Every line stores both amounts:

| Field | Description |
|-------|-------------|
| `amount` | Functional currency (used for all reporting) |
| `amountFC` | Transaction currency (original amount) |
| `currency` | Transaction currency code |
| `exchangeRate` | Rate used |

Same-currency transactions: `amount = amountFC`, `exchangeRate = 1`.

## Decimal Precision

| Currencies | Decimals | Examples |
|-----------|----------|---------|
| KWD, BHD, OMR | 3 | 1,234.567 |
| USD, EUR, GBP, AED, SAR | 2 | 1,234.56 |
| JPY, KRW | 0 | 1,235 |

Use decimal arithmetic library. Never floating-point for money.

## Realized FX Gain/Loss

When payment settles an invoice at a different rate than the invoice was booked:

```
Invoice: USD 10,000 at 0.307 = KWD 3,070.000
Payment: USD 10,000 at 0.310 = KWD 3,100.000
FX Gain: KWD 30.000

DR  Bank Account              3,100.000
CR  Accounts Receivable       3,070.000
CR  Realized FX Gain             30.000
```

Unfavorable rate → debit Realized FX Loss instead.

## Unrealized FX Revaluation (Month-End)

Revalue all open foreign currency balances to closing rate.

1. List all open FC items (unpaid AR, AP, FC bank balances)
2. `revalued = FC_amount × closing_rate`
3. `difference = revalued - current_book_value`
4. Post net entry per currency pair

```
Gain: DR  AR/AP/Bank  |  CR  Unrealized FX Gain
Loss: DR  Unrealized FX Loss  |  CR  AR/AP/Bank
```

Revaluation entries auto-reverse on the first day of the next period.

## Foreign Currency Accounts

Bank/cash accounts can have a `currencyCode` field. If set, the account holds that currency natively. Balance tracked in both the account's currency and functional currency.
