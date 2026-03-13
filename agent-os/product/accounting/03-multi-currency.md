# Multi-Currency Design

## Concepts

| Term | Definition |
|------|------------|
| **Functional currency** | A legal entity's reporting currency. Set on `LegalEntity.functionalCurrency`. Each entity can have a different one. All financial statements for that entity use this currency. |
| **Transaction currency** | Currency of a specific transaction. Can differ from the entity's functional currency. Must be in the tenant's `TenantCurrency` whitelist. |
| **Exchange rate** | Conversion factor: transaction currency → entity's functional currency. Tenant-wide (shared across entities). |
| **Group currency** | Currency used for consolidated reporting across all entities (future — Phase 6). |

## How Currency Flows Through the System

```
Transaction at Branch (e.g., sale in KWD)
  ↓
Branch → LegalEntity (resolve functional currency: KWD for Kuwait entity)
  ↓
Same currency? → exchangeRate = 1, amount = amountFC
Different currency? → look up rate from ExchangeRate table
  ↓
Journal Entry posted in entity's functional currency
  ↓
Reports filtered by entity show entity's functional currency
  ↓
Consolidated reports (future): translate all entities to group currency
```

## Exchange Rate Table

Tenant-wide — shared across all legal entities.

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
- Rates are shared across entities (no need to enter AED→USD twice for two entities)

## Journal Entry Lines

Every line stores both amounts:

| Field | Description |
|-------|-------------|
| `amount` | Functional currency of the legal entity (used for all reporting) |
| `amountFC` | Transaction currency (original amount) |
| `currency` | Transaction currency code |
| `exchangeRate` | Rate used for conversion |

Same-currency transactions: `amount = amountFC`, `exchangeRate = 1`.

## Decimal Precision

Precision is defined per currency in `TenantCurrency.decimalPlaces`. Standard values:

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

All amounts above are in the **entity's functional currency**.

## Unrealized FX Revaluation (Month-End)

Revalue all open foreign currency balances to closing rate. Scoped per legal entity.

1. List all open FC items for the entity (unpaid AR, AP, FC bank balances)
2. `revalued = FC_amount × closing_rate`
3. `difference = revalued - current_book_value`
4. Post net entry per currency pair

```
Gain: DR  AR/AP/Bank  |  CR  Unrealized FX Gain
Loss: DR  Unrealized FX Loss  |  CR  AR/AP/Bank
```

Revaluation entries auto-reverse on the first day of the next period.

## Foreign Currency Accounts

Bank/cash accounts can have a `currencyCode` field. If set, the account holds that currency natively. Balance tracked in both the account's currency and the entity's functional currency.

## Cross-Reference

| Reference | Alignment |
|-----------|-----------|
| `settings-admin/15-multi-entity-architecture.md` | `functionalCurrency` per entity |
| `settings-admin/05-currency-fiscal-periods.md` | `TenantCurrency` whitelist, `CurrencyPolicy`, exchange rate policy |
| `01-architecture.md` | Event payload carries `currency` and `exchangeRate` |
