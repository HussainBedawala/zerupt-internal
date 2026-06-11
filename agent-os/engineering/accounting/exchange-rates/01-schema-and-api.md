# Exchange Rate Management — Schema & API

> Schema: `packages/db/src/schema/currency.ts`
> Enums: `packages/db/src/schema/enums.ts`
> Service: `apps/api/src/currency-config/currency-config.service.ts`
> Controller: `apps/api/src/currency-config/currency-config.controller.ts`
> Product spec: `agent-os/product/accounting/03-multi-currency.md`
> Product spec: `agent-os/product/settings-admin/05-currency-fiscal-periods.md`

## Overview

Exchange rates are the foundation of multi-currency accounting. Every foreign-currency journal entry, FX gain/loss calculation, and month-end revaluation depends on looking up a rate from the `exchange_rates` table. The schema is fully built; the service layer needs rate CRUD and the critical `lookupRate()` function.

---

## Table: `exchange_rates`

Tenant-scoped. One rate per (tenant, baseCurrency, quoteCurrency, rateDate, rateType). Stores one direction only; inverse is precomputed.

### Core Columns

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid | no | random | PK |
| `tenant_id` | uuid | no | — | Tenant isolation (no FK — admin DB separation) |
| `base_currency` | varchar(3) | no | — | ISO 4217 — "1 base = rate quote" |
| `quote_currency` | varchar(3) | no | — | ISO 4217 |
| `rate_date` | date | no | — | Effective date |
| `rate_type` | enum | no | `spot` | `spot` / `closing` / `average` / `contract` (IAS 21) |
| `rate` | numeric(18,10) | no | — | 1 base = X quote |
| `inverse_rate` | numeric(18,10) | no | — | Precomputed 1/rate for reverse lookups |
| `source` | enum | no | `manual` | `manual` or `api` |
| `provider_name` | varchar(100) | yes | — | Provider name for API-fetched rates |

### Audit Columns

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `created_by` | uuid | no | — | User who entered/imported the rate |
| `created_at` | timestamp(tz) | no | now() | — |
| `updated_at` | timestamp(tz) | no | now() | Auto-updated |

## Constraints

| Constraint | Type | Rule |
|-----------|------|------|
| `er_rate_positive_check` | CHECK | `rate > 0` |
| `er_inverse_rate_positive_check` | CHECK | `inverse_rate > 0` |
| `er_base_currency_format_check` | CHECK | `base_currency ~ '^[A-Z]{3}$'` |
| `er_quote_currency_format_check` | CHECK | `quote_currency ~ '^[A-Z]{3}$'` |
| `er_base_ne_quote_check` | CHECK | `base_currency != quote_currency` |
| `er_tenant_base_quote_date_type_key` | UNIQUE | One rate per pair per date per type per tenant |

## Indexes

| Index | Columns | Notes |
|-------|---------|-------|
| `er_tenant_pair_date_type_idx` | `(tenant_id, base_currency, quote_currency, rate_date, rate_type)` | Primary lookup path |

## Enums

### exchange_rate_type (4)

`spot` · `closing` · `average` · `contract`

- **spot** — used for transaction-date conversions (default)
- **closing** — month-end revaluation (IAS 21)
- **average** — P&L translation
- **contract** — hedged/fixed rates

### exchange_rate_source (2)

`manual` · `api`

### exchange_rate_frequency (3)

`manual` · `daily` · `monthly`

---

## Supporting Tables

### `currency_policies` (singleton per tenant)

Controls multi-currency behavior. Already implemented in `CurrencyConfigService`.

| Column | Type | Purpose |
|--------|------|---------|
| `is_multi_currency_enabled` | boolean | Master toggle |
| `rounding_mode` | enum | `half_up` / `half_even` / `half_down` |
| `exchange_rate_source` | enum | `manual` / `api` |
| `exchange_rate_provider` | varchar(100) | Provider name (e.g., `exchangerate.host`) |
| `exchange_rate_frequency` | enum | `manual` / `daily` / `monthly` |
| `allow_backdated_rate` | boolean | Allow rates for past dates |
| `approval_required_for_manual_rate` | boolean | Require approval workflow |

### `tenant_currencies` (whitelist per tenant)

| Column | Type | Purpose |
|--------|------|---------|
| `currency_code` | varchar(3) | ISO 4217 |
| `name` | varchar(100) | Display name |
| `symbol` | varchar(10) | e.g., `$`, `AED` |
| `decimal_places` | smallint | KWD=3, JPY=0, USD=2 |
| `symbol_position` | enum | `before` / `after` |
| `is_active` | boolean | Soft-disable |

---

## API — Exchange Rate CRUD

**Status: Not implemented.** Schema exists, service methods do not.

All endpoints scoped to authenticated tenant via `TenantContextMiddleware`.

### `POST /currency-config/exchange-rates`

Create a single exchange rate.

**Request body:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `baseCurrency` | string(3) | yes | Must exist in `tenant_currencies` |
| `quoteCurrency` | string(3) | yes | Must exist in `tenant_currencies` |
| `rateDate` | date (ISO) | yes | — |
| `rateType` | enum | no | Default: `spot` |
| `rate` | number | yes | Must be > 0 |
| `source` | enum | no | Default: `manual` |
| `providerName` | string | no | Required if source = `api` |

**Service logic:**

1. Validate both currencies are in `tenant_currencies` and active
2. Validate `rateDate` is not in the future (unless `allow_backdated_rate` is true — which also implies forward-dating should be blocked)
3. Compute `inverseRate = 1 / rate` (use Decimal.js, precision 18 scale 10)
4. Upsert: if `(tenant, base, quote, date, type)` already exists, update rate + inverseRate + updatedAt
5. Emit `settings.exchangeRate.created` event (for audit trail)

**Response:** Created/updated rate object.

### `GET /currency-config/exchange-rates`

List rates with filtering and pagination.

**Query params:**

| Param | Type | Notes |
|-------|------|-------|
| `baseCurrency` | string | Filter by base |
| `quoteCurrency` | string | Filter by quote |
| `rateType` | enum | Filter by type |
| `dateFrom` | date | Start of date range |
| `dateTo` | date | End of date range |
| `source` | enum | `manual` or `api` |
| `page` | number | Default: 1 |
| `limit` | number | Default: 50, max: 200 |

**Response:** Paginated list with `data`, `total`, `page`, `limit`.

### `GET /currency-config/exchange-rates/:id`

Single rate by ID.

### `PUT /currency-config/exchange-rates/:id`

Update rate and/or rateType. Recomputes inverseRate. Cannot change currency pair or date (delete and recreate instead).

### `DELETE /currency-config/exchange-rates/:id`

Soft-delete or hard-delete. If any posted JE references this rate date/pair, block deletion and return 409 Conflict.

### `POST /currency-config/exchange-rates/bulk`

Bulk import rates (CSV upload or API feed sync).

**Request body:**

| Field | Type | Notes |
|-------|------|-------|
| `rates` | array | Max 500 per request |
| `source` | enum | `manual` or `api` |
| `providerName` | string | Required if source = `api` |

Each rate in array: `{ baseCurrency, quoteCurrency, rateDate, rateType, rate }`.

**Service logic:** Validate all, then bulk upsert in a single transaction.

---

## API — Rate Lookup (Critical)

### `lookupRate(baseCurrency, quoteCurrency, rateDate, rateType)`

**Status: Not implemented.** This is the most critical missing function — called by:
- `JournalPostingService` (convert transaction currency to functional currency)
- `FxGainLossService` (realized gain/loss on payment)
- FX revaluation (unrealized gain/loss at month-end)
- Any report showing FC amounts in functional currency

**Algorithm:**

```
1. Query: exact match on (tenant, base, quote, date, type)
2. If no match: try reverse pair (quote→base), use inverseRate
3. If no match: fallback to most recent prior date for same pair+type
   ORDER BY rate_date DESC LIMIT 1 WHERE rate_date <= :rateDate
4. If no match on reverse either: triangulate via USD
   rate(A→USD) × rate(USD→B) = rate(A→B)
5. If still no match: throw RateNotFoundError with pair + date
```

**Return type:** `{ rate: Decimal, inverseRate: Decimal, rateDate: Date, source: string, isExact: boolean }`

`isExact` = false when fallback to prior date was used. Callers can decide whether to warn the user.

**Performance:** The composite index `er_tenant_pair_date_type_idx` supports all lookups efficiently. Fallback query uses `<=` on indexed `rate_date`.

---

## Events Emitted

| Event | When | Payload |
|-------|------|---------|
| `settings.exchangeRate.created` | New rate added | `{ id, baseCurrency, quoteCurrency, rateDate, rateType, rate }` |
| `settings.exchangeRate.updated` | Rate changed | `{ id, oldRate, newRate }` |
| `settings.exchangeRate.deleted` | Rate removed | `{ id }` |
| `settings.exchangeRate.bulkImported` | Bulk import completed | `{ count, source, providerName }` |

---

## Design Decisions

- **One direction only:** Store `USD→AED` but not `AED→USD`. Precompute `inverseRate` for convenience. Avoids conflicting rates.
- **Precomputed inverse:** Avoids division at query time. Service layer must keep it in sync on every write.
- **Fallback to prior date:** Real-world: rates aren't entered for weekends/holidays. Using the most recent prior rate is standard accounting practice.
- **Triangulation via USD:** Common in multi-currency systems. If direct rate doesn't exist, go through USD as intermediate. Only as last resort.
- **numeric(18,10):** Accommodates extreme ratios like IDR/KWD (0.0000196...) without loss of precision.
- **No approval workflow in v1:** `approval_required_for_manual_rate` flag exists in `currency_policies` but approval workflow is deferred. v1 = direct create.
