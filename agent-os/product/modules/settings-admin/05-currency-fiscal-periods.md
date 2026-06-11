# Currency and Fiscal Periods

## Currency Architecture Overview

Currency configuration spans two levels:

| Level | What lives here | Why |
|-------|----------------|-----|
| **LegalEntity** | `functionalCurrency` (reporting currency) | Each legal entity files financial statements in its own currency |
| **Tenant** | `CurrencyPolicy` (rounding, exchange rate source), `TenantCurrency` (supported currencies whitelist) | Shared across all entities — one exchange rate table, one currency list |
| **Branch** | `currencyCode` (optional override) | Branch can default to a different transaction currency than its entity's functional currency |

```
Tenant: Acme Group
├── CurrencyPolicy: { roundingMode: HALF_UP, exchangeRateSource: Manual }
├── TenantCurrency: [AED, KWD, SGD, USD, EUR]  ← shared whitelist
│
├── LegalEntity: Acme UAE    → functionalCurrency: AED
│   ├── Branch: Dubai        → currencyCode: null (inherits AED)
│   └── Branch: Abu Dhabi    → currencyCode: null (inherits AED)
├── LegalEntity: Acme Kuwait → functionalCurrency: KWD
│   └── Branch: Kuwait City  → currencyCode: null (inherits KWD)
└── LegalEntity: Acme SG     → functionalCurrency: SGD
    └── Branch: Orchard      → currencyCode: null (inherits SGD)
```

---

## Currency Policy Entity (Tenant-Wide, Singleton)

One row per tenant. Controls global currency behavior.

| Field | Type | Description |
|-------|------|-------------|
| `tenantId` | UUID | PK (singleton per tenant) |
| `isMultiCurrencyEnabled` | boolean | Controls whether multi-currency UI features are shown. Even if false, each entity's functional currency is always set. |
| `roundingMode` | enum | `HALF_UP`, `BANKERS` |
| `changedAt` | datetime | Last policy change |

## Supported Currencies (Tenant-Wide)

`TenantCurrency` table — one row per allowed currency. Shared across all legal entities.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `tenantId` | UUID | FK |
| `currencyCode` | string(3) | ISO 4217 code (e.g., `AED`, `KWD`) |
| `name` | string | Display name (e.g., "UAE Dirham") |
| `symbol` | string | Currency symbol (e.g., "د.إ", "$", "ر.س") |
| `decimalPlaces` | int | Precision: 0 (JPY), 2 (USD, AED), or 3 (KWD, BHD) |
| `symbolPosition` | enum | `Before` (`$100`) or `After` (`100 ر.س`). Critical for MENA locales. |
| `isActive` | boolean | Soft-disable without removal |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

**Unique constraint:** `(tenantId, currencyCode)`

## Exchange Rate Policy (Tenant-Wide)

Stored on `CurrencyPolicy` or as a separate singleton.

| Field | Type | Description |
|-------|------|-------------|
| `source` | enum | `Manual`, `AutoFetched` |
| `provider` | string | Optional provider key (for auto-fetched rates) |
| `updateFrequency` | enum | `Manual`, `Daily`, `Hourly` |
| `allowBackdatedRate` | boolean | Whether users can enter rates for past dates |
| `approvalRequiredForManualRate` | boolean | Require manager approval for manual rate entry |

## Fiscal Settings Entity (Per Legal Entity)

Each legal entity can have its own fiscal year configuration.

| Field | Type | Description |
|-------|------|-------------|
| `legalEntityId` | UUID | FK to LegalEntity |
| `fiscalYearStartMonth` | integer | 1-12 |
| `periodClosePolicy` | enum | `Open`, `SoftLocked`, `HardLocked` |
| `allowSoftLockOverride` | boolean | |
| `softLockOverrideRoles` | array(UUID) | Role IDs allowed to override soft lock |

---

## Currency Rules

| Rule | Detail |
|------|--------|
| Functional currency source | Lives on `LegalEntity.functionalCurrency`, not on CurrencyPolicy |
| Functional currency lock | Cannot change after first posted transaction (`functionalCurrencyLockedAt` set by accounting engine) |
| Supported currency enforcement | Every `LegalEntity.functionalCurrency` must exist in `TenantCurrency` |
| Branch currency enforcement | `Branch.currencyCode` (if set) must exist in `TenantCurrency` |
| Transaction currency | Must be in `TenantCurrency` whitelist |
| Precision | Must match the `decimalPlaces` defined in `TenantCurrency` |
| Same-currency rate | Enforced as `1` |
| Cannot remove functional currency | If a currency is any entity's `functionalCurrency`, it cannot be removed from `TenantCurrency` |
| Cannot remove used currency | If a currency has been used in posted transactions, it can be deactivated but not deleted |

## Exchange Rate Rules

| Rule | Detail |
|------|--------|
| Date lookup | Uses transaction date, then falls back to most recent prior rate |
| Manual rate update | Requires reason; optional manager approval per policy |
| Missing rate | Block posting in financial modules |
| Rate correction | New effective-dated rate only; no in-place edit |
| Rate scope | Exchange rates are tenant-wide (shared across all legal entities). Rate is always relative to each entity's functional currency. |

## Fiscal Period Rules

| Rule | Detail |
|------|--------|
| Fiscal settings scope | Per legal entity (each entity can have different fiscal year start) |
| Policy ownership | Settings/Admin sets policy; accounting enforces at posting |
| Hard lock transition | Owner or privileged role only |
| Reopen hard-locked period | Manager PIN + reason + audit |
| Soft lock override | Allowed only for permitted roles |
| Future period operations | Controlled by accounting period validation |

---

## Cross-Reference

| Reference | Alignment |
|-----------|-----------|
| `15-multi-entity-architecture.md` | `functionalCurrency` per entity; country-to-currency defaults |
| `01-organisation-governance.md` | LegalEntity model definition |
| `accounting/03-multi-currency.md` | Exchange rate table, JE line amounts, FX gain/loss |
| `accounting/08-period-control.md` | Period lock enforcement and validation flow |
