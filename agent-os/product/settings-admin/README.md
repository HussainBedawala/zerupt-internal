# Settings & Admin

> Rules for how tenants configure organization, access, governance, and system-wide controls. Each file is self-contained.

## Files

| File | What It Covers |
|------|---------------|
| `01-organisation-governance.md` | Tenant profile (group-level), legal entity identity, localization defaults, owner controls |
| `02-team-user-lifecycle.md` | User invitation, activation, suspension/deactivation, branch assignment |
| `03-roles-permissions-policy.md` | Permission key model, branch scope, field-level visibility, approval overrides |
| `04-branches-locations-warehouses.md` | Branch/location/warehouse governance boundaries and activation rules |
| `05-currency-fiscal-periods.md` | Supported currencies (tenant-wide), currency policy, exchange rate governance, fiscal period settings (per entity) |
| `06-tax-configuration-controls.md` | Tax code/group/rate administration controls and change safety rules |
| `07-document-numbering.md` | Sequence policies, prefix/suffix/padding rules, lock/edit constraints |
| `08-notifications-alert-policy.md` | Notification events, channels, thresholds, recipient and escalation policy |
| `09-integrations-api-webhooks.md` | API key scopes, webhook subscriptions, retries, secret rotation, status |
| `10-audit-trail-retention.md` | Immutable audit model, access/export restrictions, retention and legal hold |
| `11-data-import-migration-controls.md` | Import templates, validation, preview/confirm workflow, rollback policy |
| `12-cross-module-contracts.md` | Settings/Admin data contracts and policy boundaries with all modules |
| `13-database-architecture.md` | Multi-tenant database strategy, provisioning, tenant isolation |
| `14-internationalization.md` | Full i18n/L10n spec: locales, RTL/LTR, translations, formatting, fonts, bilingual data |
| `15-multi-entity-architecture.md` | **Multi-entity foundation:** LegalEntity model, hierarchy (Tenant → Entity → Branch), functional currency per entity, COA per entity, API, events, future consolidation |

## Key Architectural Decision: Multi-Entity

Zerupt supports **multiple legal entities per tenant**. This is the foundation for multi-country operations where each country has a separate company registration. See `15-multi-entity-architecture.md`.

```
Tenant (group) → LegalEntity (registered company) → Branch (location) → Warehouse → Zone → Bin
```

Single-entity tenants (most at launch) have one auto-created default entity. The architecture is identical — just one entity instead of many.

**What scopes to which level:**

| Tenant-wide | Per legal entity | Per branch |
|-------------|-----------------|------------|
| Users, roles, permissions | Functional currency | Default transaction currency |
| Supported currencies whitelist | COA | Warehouses, zones, bins |
| Currency policy (rounding, rates) | Fiscal year/periods | Tax profile override |
| Exchange rate table | Financial statements | Document numbering |
| Notification policy | Registration/tax numbers | |

## Design Rules

| Rule | Detail |
|------|--------|
| Module boundary | Settings/Admin is policy + configuration only; no direct journal entries or stock movements |
| Owner access | Owner access is unrestricted across all legal entities |
| Non-owner access | All non-owner access is explicit assignment |
| Security change control | Security-critical changes require actor, reason, and immutable audit record |
| Branch isolation | Applies to users, permissions, notifications, and integrations |
| Entity isolation | Financial data (COA, JEs, fiscal periods) scoped to legal entity |
| Financial configuration alignment | Fiscal/tax/currency settings align with accounting engine contracts |
| Location alignment | Warehouse governance aligns with inventory hierarchy contracts |
| Period control alignment | Accounting enforces period locks per entity; Settings/Admin defines policy values |
| Config versioning | Configuration changes are versioned/effective-dated where applicable |
