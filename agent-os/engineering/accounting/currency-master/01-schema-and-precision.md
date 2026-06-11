# Currency Master & Precision — Schema & Configuration

> Schema: `packages/db/src/schema/currency.ts`
> Service: `apps/api/src/currency-config/currency-config.service.ts`
> Controller: `apps/api/src/currency-config/currency-config.controller.ts`
> Seed data: `apps/api/src/currency-config/currency-config.seed.ts`
> Country map: `apps/api/src/common/country-currency.ts`
> Permissions: `packages/shared/src/permissions.ts` → `settings.currency.*`
> Product spec: `agent-os/product/settings-admin/05-currency-fiscal-periods.md`
> Product spec: `agent-os/product/accounting/03-multi-currency.md`

## Status

**Code: Fully implemented.** Schema, service, controller, DTOs, seed data, frontend types, and API client all exist. This spec documents what was built and identifies gaps for hardening.

---

## Architecture

Three tables form the currency master:

```
currency_policies (singleton per tenant)
  └── Controls: multi-currency toggle, rounding mode, rate source, rate frequency

tenant_currencies (whitelist per tenant)
  └── Each row: ISO 4217 code, name, symbol, decimal places, symbol position, isActive

exchange_rates (per pair per date per type)
  └── See exchange-rates/01-schema-and-api.md
```

Legal entities reference currencies via `functional_currency` (locked after first FX transaction). Branches optionally override with `currency_code`.

---

## Table: `currency_policies`

Singleton per tenant. Lazy-loaded with defaults on first access.

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `id` | uuid | random | PK |
| `tenant_id` | uuid | — | Tenant isolation |
| `is_multi_currency_enabled` | boolean | false | Master toggle — when false, only functional currency allowed |
| `rounding_mode` | enum | `half_up` | `half_up` / `bankers` (IAS 21 recommends banker's rounding) |
| `exchange_rate_source` | enum | `manual` | `manual` / `auto_fetched` |
| `exchange_rate_provider` | varchar(100) | null | Provider name when source = auto_fetched |
| `exchange_rate_frequency` | enum | `manual` | `manual` / `daily` / `hourly` |
| `allow_backdated_rate` | boolean | true | Allow entering rates for past dates |
| `approval_required_for_manual_rate` | boolean | false | Future: approval workflow for manual rate entry |

## Table: `tenant_currencies`

Whitelist of currencies the tenant works with. One row per currency code per tenant.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `id` | uuid | no | PK |
| `tenant_id` | uuid | no | Tenant isolation |
| `currency_code` | varchar(3) | no | ISO 4217 (immutable after creation) |
| `name` | varchar(100) | no | Display name (e.g., "UAE Dirham") |
| `symbol` | varchar(10) | no | Display symbol (e.g., "AED", "$") |
| `decimal_places` | smallint | no | Precision: KWD=3, JPY=0, USD=2, BHD=3 |
| `symbol_position` | enum | no | `before` / `after` |
| `is_active` | boolean | no | Soft-disable (cannot hard-delete if referenced) |
| `created_at` | timestamp(tz) | no | — |
| `updated_at` | timestamp(tz) | no | — |

**Unique constraint:** `(tenant_id, currency_code)`

---

## Decimal Precision Rules

Precision is critical for financial correctness. The system uses three precision levels:

| Context | Precision | Source |
|---------|-----------|--------|
| Display / rounding | `tenant_currencies.decimal_places` | Per-currency (KWD=3, JPY=0, USD=2) |
| Internal calculation | Decimal.js precision 28 | Hardcoded in services |
| Exchange rate storage | numeric(18,10) | Schema CHECK constraint |
| JE line amounts | numeric(18,6) | Journal entry line schema |

### Rounding Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `half_up` | 0.5 rounds up (standard commercial) | Default for most MENA/SEA |
| `bankers` | 0.5 rounds to nearest even (IAS 21) | Recommended for financial reporting |

### Where Rounding Applies

1. **JE line amounts** — rounded to 6 decimal places before storage
2. **FX conversion** — `amount_tc × rate` rounded per `currency_policies.rounding_mode`
3. **Tax calculation** — rounded to currency's `decimal_places` before adding to total
4. **Display** — formatted to `decimal_places` in frontend

---

## API Endpoints

### Currency Policy

| Method | Path | Permission | Status |
|--------|------|------------|--------|
| `GET` | `/tenant/currency-policy` | `settings.currency.read` | Implemented |
| `PATCH` | `/tenant/currency-policy` | `settings.currency.update` | Implemented |

### Tenant Currencies

| Method | Path | Permission | Status |
|--------|------|------------|--------|
| `GET` | `/tenant/currencies` | `settings.currency.list` | Implemented |
| `GET` | `/tenant/currencies/seed-list` | `settings.currency.read` | Implemented |
| `GET` | `/tenant/currencies/:id` | `settings.currency.read` | Implemented |
| `POST` | `/tenant/currencies` | `settings.currency.create` | Implemented |
| `PATCH` | `/tenant/currencies/:id` | `settings.currency.update` | Implemented |
| `DELETE` | `/tenant/currencies/:id` | `settings.currency.delete` | Implemented |

---

## Seed Data

`currency-config.seed.ts` provides ~30 pre-populated currencies covering MENA, SEA, India, and major global currencies:

AED, SAR, KWD, BHD, OMR, QAR, EGP, JOD, INR, PKR, BDT, LKR, MYR, SGD, IDR, THB, PHP, USD, GBP, EUR, etc.

`country-currency.ts` maps ISO 3166-1 country codes to default currency + decimal places via `getDefaultCurrency(countryCode)`.

---

## Integration Points

| System | How | Direction |
|--------|-----|-----------|
| Legal Entity | `functional_currency` column references tenant_currencies | Read |
| Branch | `currency_code` optional override | Read |
| JE Posting | Validates transaction currency exists in tenant_currencies | Read |
| FX Gain/Loss | Uses `decimal_places` for rounding | Read |
| FX Revaluation | Uses functional currency from legal entity | Read |
| Exchange Rates | Both currencies must exist in tenant_currencies | Validate |

---

## Gaps to Address

### 1. Downstream Reference Checks (Not Yet Implemented)

Service has `// Note: downstream reference checks...` comments. These are needed:

| Action | Blocked When |
|--------|-------------|
| Delete currency | Currency is legal entity's `functional_currency` |
| Delete currency | Currency appears in posted JE lines |
| Delete currency | Currency appears in exchange rates |
| Deactivate currency | Same as delete (deactivation = soft delete) |
| Change `decimal_places` | Currency has posted transactions (would break amounts) |

### 2. Auto-Fetch Integration (Partial)

`exchange-rate-fetch.processor.ts` exists as BullMQ job but external API integration is incomplete. Needs:
- API provider adapter (exchangerate.host, ECB, or similar)
- Scheduling based on `exchange_rate_frequency` policy
- Error handling + retry for failed fetches
- Notification when auto-fetch fails

### 3. Functional Currency Lock Enforcement

`legalEntities.functionalCurrencyLockedAt` timestamp exists. The lock fires on first multi-currency JE posting. But there's no validation preventing:
- Changing functional currency after lock
- Removing the functional currency from tenant_currencies after lock

---

## Design Decisions

- **Immutable currency codes** — `currency_code` cannot change after creation (would invalidate all historical references)
- **Soft-disable, not hard-delete** — `is_active = false` prevents new transactions but preserves history
- **Singleton policy** — one policy per tenant, lazy-created with sane defaults
- **Seed list as static data** — ISO 4217 reference list served from code, not DB (no migration needed for new currencies)
- **Decimal.js everywhere** — never use JavaScript floating-point for financial math
- **numeric(18,10) for rates** — handles extreme ratios like IDR/KWD without precision loss
