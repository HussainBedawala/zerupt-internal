# Multi-Entity Architecture

## Why Multi-Entity Exists

A tenant (e.g., "Acme Group") operating in multiple countries typically has **separate legal entities** per country — each with its own company registration, tax ID, functional currency, and regulatory obligations. Each legal entity produces its own financial statements for local regulators. The parent/holding company needs a consolidated view across all entities.

**Single-entity tenants** (the common case at launch) work identically — they just have one auto-created default entity.

---

## Hierarchy

```
Tenant (Acme Group)
├── LegalEntity: Acme UAE LLC       (AED, UAE VAT)
│   ├── Branch: Dubai Store
│   ├── Branch: Abu Dhabi Store
│   │   └── Warehouse → Zone → Bin
│   └── COA (UAE-specific accounts)
├── LegalEntity: Acme Kuwait WLL    (KWD, no VAT)
│   ├── Branch: Kuwait City Store
│   └── COA (Kuwait-specific accounts)
└── LegalEntity: Acme SG Pte Ltd    (SGD, SG GST)
    ├── Branch: Orchard Store
    └── COA (SG-specific accounts)

Consolidated view: group currency (e.g., AED), all entities combined
```

**Key relationships:**
- Tenant 1 → N LegalEntity
- LegalEntity 1 → N Branch
- LegalEntity 1 → 1 COA (Phase 2)
- LegalEntity 1 → N FiscalYear (Phase 2)
- Branch 1 → N Warehouse → Zone → Bin (unchanged)

---

## LegalEntity Model (Tenant DB)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, `uuid(7)` | |
| `tenantId` | UUID | Required | Defense-in-depth (physical isolation already prevents cross-tenant) |
| `code` | String(50) | Unique per tenant, immutable | Short identifier (e.g., `acme-uae`). Used in document prefixes, reports, API filters. Never changes. |
| `name` | String(200) | Required | Legal registered name (e.g., "Acme Trading LLC") |
| `nameAlt` | String(200) | Nullable | Alternate language name (e.g., Arabic name) |
| `countryCode` | String(2) | Required | ISO 3166-1 alpha-2. Immutable after `functionalCurrencyLockedAt` is set. |
| `functionalCurrency` | String(3) | Required | ISO 4217. The entity's reporting currency. Immutable after `functionalCurrencyLockedAt` is set. |
| `functionalCurrencyLockedAt` | DateTime | Nullable | Set by accounting engine when first JE is posted for this entity. Once set, `functionalCurrency` and `countryCode` cannot change. |
| `registrationNumber` | String(100) | Nullable | Company registration / trade license number |
| `taxRegistrationNumber` | String(100) | Nullable | VAT/GST/TRN number |
| `isDefault` | Boolean | Default false | Exactly one `true` per tenant. Enforced via partial unique index: `UNIQUE (tenantId) WHERE isDefault = true`. |
| `isActive` | Boolean | Default true | Cannot deactivate while active branches exist. |
| `createdAt` | DateTime | Timestamptz | |
| `updatedAt` | DateTime | Timestamptz, auto-updated | |

**Indexes:**
- `@@unique([tenantId, code])` — code uniqueness
- `@@index([tenantId])` — list query
- Partial unique: one default per tenant (see above)

---

## Branch Model Update

Add to existing `Branch` model:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `legalEntityId` | UUID | Required, FK → `LegalEntity.id`, onDelete: Restrict | Which legal entity this branch belongs to. |

**Data migration:** All existing branches get assigned to the tenant's default legal entity.

**Validation change:** `Branch.currencyCode` (if set) must exist in the tenant's supported currencies list (enforced after DEV-43).

---

## Auto-Creation Rules

### On tenant provisioning (new tenants)

The provisioning pipeline (DEV-25) creates one default LegalEntity using:

| Field | Source |
|-------|--------|
| `code` | `tenant.code` (same value) |
| `name` | `tenant.name` |
| `countryCode` | `tenant.countryCode` |
| `functionalCurrency` | Derived from `countryCode` via country-to-currency map (e.g., AE → AED, KW → KWD, US → USD) |
| `isDefault` | `true` |

### On migration (existing tenants)

A data migration script:
1. Creates one LegalEntity per tenant (same mapping as above)
2. Sets `isDefault = true`
3. Updates all existing branches to point to this entity

---

## Immutability Rules

| Field | When it locks | Why |
|-------|---------------|-----|
| `code` | On creation | Used as stable identifier in document prefixes, API filters, exports |
| `countryCode` | When `functionalCurrencyLockedAt` is set | Country determines tax regime; changing it after transactions exist would invalidate posted tax calculations |
| `functionalCurrency` | When `functionalCurrencyLockedAt` is set | All JEs for this entity are in this currency; changing it would require recalculating every posted entry |

**Who sets `functionalCurrencyLockedAt`?** The accounting engine, when it posts the first journal entry for this legal entity. Settings/Admin never sets this field directly — it only reads it to enforce immutability.

---

## API Endpoints

Base path: `/api/v1/tenant/legal-entities`

| Method | Path | Permission Key | Description |
|--------|------|----------------|-------------|
| `GET` | `/` | `settings.legal-entity.list` | List all entities (with branch count) |
| `GET` | `/:id` | `settings.legal-entity.read` | Get entity details |
| `POST` | `/` | `settings.legal-entity.create` | Create new entity |
| `PATCH` | `/:id` | `settings.legal-entity.update` | Update mutable fields |
| `DELETE` | `/:id` | `settings.legal-entity.delete` | Soft-deactivate (set `isActive = false`) |

### Response shape

```json
{
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "code": "acme-uae",
    "name": "Acme Trading LLC",
    "nameAlt": "شركة أكمي للتجارة ذ.م.م",
    "countryCode": "AE",
    "functionalCurrency": "AED",
    "functionalCurrencyLockedAt": null,
    "registrationNumber": "123456",
    "taxRegistrationNumber": "100234567890003",
    "isDefault": true,
    "isActive": true,
    "branchCount": 2,
    "createdAt": "2026-03-13T00:00:00Z",
    "updatedAt": "2026-03-13T00:00:00Z"
  }
}
```

### Business rules enforced by API

| Rule | Behavior |
|------|----------|
| Create with locked fields | `code`, `countryCode`, `functionalCurrency` set at creation, then immutability rules apply |
| Delete default entity | 409 Conflict — cannot deactivate the default entity |
| Delete entity with active branches | 409 Conflict — deactivate or reassign branches first |
| Change `functionalCurrency` after lock | 409 Conflict — field is locked after first posted transaction |
| Change `countryCode` after lock | 409 Conflict — same as above |

---

## Events Emitted

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `settings.legal-entity.created` | New entity created | Accounting (may need to seed COA) |
| `settings.legal-entity.updated` | Entity details changed | All modules referencing entity |
| `settings.legal-entity.deactivated` | Entity set inactive | All modules — block new transactions for this entity |

---

## Country-to-Currency Default Map

Used during auto-creation. The user can override during manual entity creation.

| Country | Currency | Decimals |
|---------|----------|----------|
| AE (UAE) | AED | 2 |
| SA (Saudi) | SAR | 2 |
| KW (Kuwait) | KWD | 3 |
| BH (Bahrain) | BHD | 3 |
| OM (Oman) | OMR | 3 |
| QA (Qatar) | QAR | 2 |
| IN (India) | INR | 2 |
| MY (Malaysia) | MYR | 2 |
| SG (Singapore) | SGD | 2 |
| ID (Indonesia) | IDR | 0 |
| TH (Thailand) | THB | 2 |
| PH (Philippines) | PHP | 2 |
| US | USD | 2 |
| GB | GBP | 2 |
| EU members | EUR | 2 |

---

## Impact on Other Specs

| Spec | Change needed |
|------|--------------|
| `01-organisation-governance.md` | `registrationNumber` and `taxRegistrationNumber` move from TenantIdentity to LegalEntity. TenantIdentity retains only tenant-level fields (name, timezone, language, status). |
| `05-currency-fiscal-periods.md` | `functionalCurrency` is per LegalEntity, not per CurrencyPolicy. CurrencyPolicy retains tenant-wide settings (rounding, exchange rate source, multi-currency toggle). Supported currencies (whitelist) remains tenant-wide. |
| `06-tax-configuration-controls.md` | Tax profiles can be scoped to a legal entity (entity-level tax registration determines applicable tax regime). |
| `12-cross-module-contracts.md` | New contract: `settings.legal-entity.resolve`. Updated contracts: `settings.currency.policy` includes `legalEntityId`. Events table gains legal entity events. |
| `accounting/01-architecture.md` | Event payload gains `legalEntityId`. JE numbering is per legal entity. COA belongs to legal entity. |
| `accounting/03-multi-currency.md` | Functional currency is per legal entity. Exchange rates are tenant-wide (shared across entities). |
| `accounting/04-chart-of-accounts.md` | COA is seeded per legal entity, not per tenant. |

---

## What Is NOT In Scope (Future)

| Feature | Why deferred | When |
|---------|-------------|------|
| Consolidated financial statements | Requires currency translation engine (current rate for BS, average rate for P&L) | Phase 6 (Reports) |
| Inter-company transactions | Requires matching engine + elimination entries | Phase 6 or later |
| Group currency | Separate from functional currency; used for consolidated reporting only | Phase 6 |
| Multi-entity onboarding | Onboarding creates one entity; additional entities added via Settings UI | Phase 5 |
| Per-entity user access control | Users currently scoped by branch; entity-level scoping is implicit via branch membership | Future |

---

## Cross-Reference

| Reference | Alignment |
|-----------|-----------|
| `01-organisation-governance.md` | TenantIdentity is tenant-level; LegalEntity handles legal/financial identity |
| `04-branches-locations-warehouses.md` | Branch gains `legalEntityId` FK |
| `05-currency-fiscal-periods.md` | `functionalCurrency` per entity; policy settings per tenant |
| `12-cross-module-contracts.md` | New contracts and events for LegalEntity |
| `13-database-architecture.md` | LegalEntity lives in tenant DB (not admin DB) |
| `accounting/01-architecture.md` | Event payload includes `legalEntityId` |
| `accounting/04-chart-of-accounts.md` | COA belongs to LegalEntity |
