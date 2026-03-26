# Legal Entity Management — Schema & API

> Schema: `packages/db/src/schema/org-structure.ts`
> Enums: `packages/db/src/schema/enums.ts`
> Service: `apps/api/src/legal-entities/legal-entities.service.ts`
> Controller: `apps/api/src/legal-entities/legal-entities.controller.ts`
> Product spec: `agent-os/product/settings-admin/15-multi-entity-architecture.md`
> Product spec: `agent-os/product/settings-admin/04-branches-locations-warehouses.md`

## Overview

A legal entity represents a registered business within a tenant. Every accounting feature — JEs, COA, fiscal periods, tax — is scoped to `legalEntityId`. A tenant starts with one default legal entity (created during onboarding) and can add more for multi-entity operations (e.g., head office + retail branch company).

**Status: Fully implemented.** Schema, service, controller, DTOs, and tests are all in place.

---

## Table: `legal_entities`

Tenant-scoped. One default per tenant (enforced by partial unique index).

### Core Columns

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid | no | random | PK |
| `tenant_id` | uuid | no | — | Tenant isolation |
| `code` | varchar(50) | no | — | Short code, unique per tenant |
| `name` | varchar(200) | no | — | Legal name |
| `name_alt` | varchar(200) | yes | — | Alternate name (Arabic/Hindi) |
| `country_code` | varchar(2) | no | — | ISO 3166-1 alpha-2 |
| `functional_currency` | varchar(3) | no | — | ISO 4217 — base currency for all accounting |
| `functional_currency_locked_at` | timestamp(tz) | yes | — | Set when first JE posts — immutable after |
| `registration_number` | varchar(100) | yes | — | Company registration |
| `tax_registration_number` | varchar(100) | yes | — | VAT/GST/TRN number |
| `tax_system` | enum | no | `vat` | `vat` / `gst` / `none` |

### Flag Columns

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `is_default` | boolean | no | false | Exactly one per tenant |
| `is_active` | boolean | no | true | Soft-disable |

### Audit Columns

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `created_at` | timestamp(tz) | no | now() | — |
| `updated_at` | timestamp(tz) | no | now() | Auto-updated |

## Constraints

| Constraint | Type | Rule |
|-----------|------|------|
| `legal_entities_tenant_id_code_key` | UNIQUE | One code per tenant |
| `legal_entities_one_default_per_tenant` | UNIQUE (partial) | `ON (tenant_id) WHERE is_default = true` — exactly one default |

---

## API

### `GET /legal-entities`

List all legal entities for the tenant with pagination.

**Query params:**

| Param | Type | Notes |
|-------|------|-------|
| `page` | number | Default: 1 |
| `limit` | number | Default: 20 |

**Response:** Paginated list. Each entity includes `branchCount` (aggregated from `branches` table via LEFT JOIN + COUNT).

### `GET /legal-entities/:id`

Single entity by ID. Includes `branchCount`.

### `POST /legal-entities`

Create a new legal entity.

**Request body:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `code` | string | yes | Unique per tenant, max 50 chars |
| `name` | string | yes | Max 200 chars |
| `nameAlt` | string | no | Alternate language name |
| `countryCode` | string(2) | yes | ISO 3166-1 alpha-2 |
| `functionalCurrency` | string(3) | yes | Must exist in `tenant_currencies` |
| `registrationNumber` | string | no | — |
| `taxRegistrationNumber` | string | no | — |
| `isDefault` | boolean | no | Default: false |

**Service logic:**

1. If `isDefault = true` and another default exists: atomically transfer default (set old default to false, new to true) in a transaction
2. `taxSystem` is auto-set to `vat` (hardcoded in v1 — future: derive from `countryCode`)
3. Emit `settings.legal-entity.created`

### `PATCH /legal-entities/:id`

Update entity fields.

**Immutability rules (enforced by service):**

| Field | Mutable? | Condition |
|-------|----------|-----------|
| `code` | yes | Always |
| `name` / `nameAlt` | yes | Always |
| `countryCode` | no | Once `functional_currency_locked_at` is set |
| `functionalCurrency` | no | Once `functional_currency_locked_at` is set |
| `isDefault` | partial | Cannot set to `false` if currently the only default |
| `isActive` | partial | Cannot deactivate if entity has active branches |

**Events emitted:**

| Condition | Event |
|-----------|-------|
| General update | `settings.legal-entity.updated` |
| `isActive` set to false | `settings.legal-entity.deactivated` |

### `DELETE /legal-entities/:id`

**Status: Not implemented.** Intentional — legal entities should never be hard-deleted once they have accounting data. Deactivation via `PATCH` is the supported path.

---

## Hierarchy

```
Tenant
  └── Legal Entity (functional currency, tax system)
        └── Branch (location, timezone, optional currency override)
              └── Warehouse
                    └── Zone
                          └── Bin
```

Every JE carries `legalEntityId`. Every COA account is scoped to a legal entity. Fiscal periods are per-entity. Tax configuration is per-entity (via `taxSystem` + `countryCode`).

---

## Currency Lock Mechanism

The `functional_currency_locked_at` timestamp prevents changing the functional currency after accounting data exists.

**Trigger (not yet wired):** When `JournalPostingService.post()` creates the first JE for a legal entity, it should call:

```typescript
// In JournalPostingService, after successful post:
if (!legalEntity.functionalCurrencyLockedAt) {
  await legalEntitiesService.lockFunctionalCurrency(legalEntity.id);
}
```

This sets `functional_currency_locked_at = now()` and also locks `country_code` (both are immutable after this point, per IAS 21 — changing functional currency retroactively would invalidate all posted JEs).

---

## Design Decisions

- **No hard delete:** Legal entities with accounting data cannot be removed — it would orphan JEs, break the audit trail, and violate accounting standards.
- **Atomic default transfer:** Only one default at a time. Transferring default uses a transaction to avoid race conditions.
- **`taxSystem` hardcoded to `vat`:** v1 simplification. GCC, MENA, and SEA all use VAT variants. India GST support will require exposing this field in a future update.
- **`functional_currency_locked_at` pattern:** Soft lock instead of schema constraint. The lock is set by the JE posting pipeline, not by the legal entity service — separation of concerns.
- **Branch count on list:** Avoids N+1 queries. Aggregated via LEFT JOIN in the list query.
