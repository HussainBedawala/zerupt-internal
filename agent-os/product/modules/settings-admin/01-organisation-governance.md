# Organisation Governance

## Two-Level Identity Model

Zerupt separates **tenant-level identity** (the group/platform account) from **legal-entity-level identity** (each registered company). See `15-multi-entity-architecture.md` for the full multi-entity design.

```
Tenant (Acme Group)          ← platform account, billing, users
├── LegalEntity: Acme UAE    ← legal identity, functional currency, COA, tax reg
├── LegalEntity: Acme Kuwait ← legal identity, functional currency, COA, tax reg
└── LegalEntity: Acme SG     ← legal identity, functional currency, COA, tax reg
```

---

## Tenant Entity (Tenant DB: `tenant_identity`)

The tenant record holds **group-level** identity and platform configuration. It does NOT hold legal/financial identity — that belongs to `LegalEntity`.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Matches the tenant ID in Central Admin DB |
| `code` | string | Immutable tenant code (e.g., `acme-group`) |
| `name` | string | Group display name |
| `tradingName` | string | Optional public-facing name |
| `nameAlt` | string | Alternate language name |
| `industry` | string | Retail vertical (e.g., Fashion/Apparel, Electronics, Grocery). Free-form string from onboarding. |
| `inventoryConcept` | enum | `Serialized`, `BatchTracked`, `SimpleSKU`, `WeightedMeasured`, `Mixed`. Immutable after first item created. |
| `countryCode` | string | ISO 3166-1 alpha-2. Primary country of the group. Used for default LegalEntity creation. |
| `timezone` | string | IANA timezone (group default) |
| `languageDefault` | string | IETF BCP 47 locale. Launch: `ar`, `en`. See `14-internationalization.md`. |
| `isRtlDefault` | boolean | Auto-derived from `languageDefault` script |
| `status` | enum | `PendingProvisioning`, `Active`, `Suspended`, `Archived`, `ProvisioningFailed` |
| `ownerUserId` | UUID | Current owner (Supabase Auth user ID) |
| `onboardingState` | json | `{ currentStep, completedSteps[], answers, startedAt, lastUpdatedAt }`. Null if created outside onboarding. |
| `onboardingCompletedAt` | datetime | Null until go-live step completes |
| `onboardingVersion` | string | Questionnaire version (e.g., `v1`) |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

## LegalEntity Entity (Tenant DB: `legal_entities`)

Each legal entity represents a **separately registered company** within the tenant. Holds legal identity, functional currency, and tax registration. See `15-multi-entity-architecture.md` for full schema.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `tenantId` | UUID | Defense-in-depth |
| `code` | string(50) | Unique per tenant, immutable (e.g., `acme-uae`) |
| `name` | string(200) | Legal registered name |
| `nameAlt` | string(200) | Alternate language name |
| `countryCode` | string(2) | ISO 3166-1 alpha-2. Immutable after first posted transaction. |
| `functionalCurrency` | string(3) | ISO 4217 reporting currency. Immutable after first posted transaction. |
| `functionalCurrencyLockedAt` | datetime | Set by accounting engine on first JE post |
| `registrationNumber` | string(100) | Company registration / trade license |
| `taxRegistrationNumber` | string(100) | VAT/GST/TRN number |
| `isDefault` | boolean | Exactly one per tenant (partial unique index) |
| `isActive` | boolean | Cannot deactivate with active branches |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

## Address Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `legalEntityId` | UUID | Which legal entity this address belongs to |
| `type` | enum | `Primary`, `Billing`, `Shipping`, `RegisteredOffice` |
| `line1` | string | |
| `line2` | string | |
| `city` | string | |
| `state` | string | |
| `postalCode` | string | |
| `countryCode` | string | |
| `isDefault` | boolean | One default per type per entity |

---

## Status Rules

| Status | Effect |
|--------|--------|
| `PendingProvisioning` | Dedicated database being created. User sees provisioning progress screen. |
| `ProvisioningFailed` | Database creation failed after retries. User sees retry/support option. |
| `Active` | Full system operation |
| `Suspended` | Login blocked except owner + platform support |
| `Archived` | Read-only mode, integrations disabled. Irreversible in tenant UI. |

## Owner Rules

| Rule | Detail |
|------|--------|
| Single owner | Exactly one active owner at all times |
| Owner transfer | Requires current owner confirmation + manager PIN |
| Owner transfer constraints | No pending critical approvals, no unresolved security alerts |
| Owner permissions | Bypass role/branch restrictions. Access all legal entities. |
| Owner deactivation | Blocked while owner role is assigned |

## Configuration Change Classes

| Class | Examples | Requirement |
|-------|----------|-------------|
| `Identity` | name, trading name | Audit log with before/after |
| `LegalIdentity` | registration number, tax number (on LegalEntity) | Audit log with before/after |
| `Localization` | timezone, language, date format | Effective immediately |
| `Critical` | owner transfer, suspension, archive | Manager PIN + reason |
| `Onboarding` | onboardingState, onboardingCompletedAt | Append-only during flow; read-only after completion |

## Validation Rules

| Rule | Detail |
|------|--------|
| Tenant `countryCode` | Used for default LegalEntity creation; not immutable on tenant (entity-level country is what locks) |
| LegalEntity `countryCode` immutability | Cannot change after `functionalCurrencyLockedAt` is set |
| LegalEntity `functionalCurrency` immutability | Cannot change after `functionalCurrencyLockedAt` is set |
| LegalEntity `code` immutability | Cannot change after creation |
| Timezone change | Not allowed in hard-locked accounting period close window |
| Tax registration format | Must satisfy country regex policy (on LegalEntity) |
| Duplicate registration | Unique per legal entity + jurisdiction |
| Onboarding state | Can only be updated while `onboardingCompletedAt` is null |
| Inventory concept immutability | Cannot change after first item is created |

## Cross-Reference

| Reference | Alignment |
|-----------|-----------|
| `15-multi-entity-architecture.md` | Full multi-entity design, hierarchy, API, events |
| `05-currency-fiscal-periods.md` | Functional currency per entity; policy settings per tenant |
| `13-database-architecture.md` | LegalEntity lives in tenant DB |
