# Settings & Admin

> Rules for how tenants configure organization, access, governance, and system-wide controls. Each file is self-contained.

## Files

| File | What It Covers |
|------|---------------|
| `01-organisation-governance.md` | Tenant profile, legal identity, localization defaults, owner controls |
| `02-team-user-lifecycle.md` | User invitation, activation, suspension/deactivation, branch assignment |
| `03-roles-permissions-policy.md` | Permission key model, branch scope, field-level visibility, approval overrides |
| `04-branches-locations-warehouses.md` | Branch/location/warehouse governance boundaries and activation rules |
| `05-currency-fiscal-periods.md` | Base/transaction currency controls, exchange-rate governance, fiscal period settings |
| `06-tax-configuration-controls.md` | Tax code/group/rate administration controls and change safety rules |
| `07-document-numbering.md` | Sequence policies, prefix/suffix/padding rules, lock/edit constraints |
| `08-notifications-alert-policy.md` | Notification events, channels, thresholds, recipient and escalation policy |
| `09-integrations-api-webhooks.md` | API key scopes, webhook subscriptions, retries, secret rotation, status |
| `10-audit-trail-retention.md` | Immutable audit model, access/export restrictions, retention and legal hold |
| `11-data-import-migration-controls.md` | Import templates, validation, preview/confirm workflow, rollback policy |
| `12-cross-module-contracts.md` | Settings/Admin data contracts and policy boundaries with all modules |
| `13-database-architecture.md` | Multi-tenant database strategy, provisioning, tenant isolation |
| `14-internationalization.md` | Full i18n/L10n spec: locales, RTL/LTR, translations, formatting, fonts, bilingual data |

## Design Rules

| Rule | Detail |
|------|--------|
| Module boundary | Settings/Admin is policy + configuration only; no direct journal entries or stock movements |
| Owner access | Owner access is unrestricted |
| Non-owner access | All non-owner access is explicit assignment |
| Security change control | Security-critical changes require actor, reason, and immutable audit record |
| Branch isolation | Applies to users, permissions, notifications, and integrations |
| Financial configuration alignment | Fiscal/tax/currency settings align with accounting engine contracts |
| Location alignment | Warehouse governance aligns with inventory hierarchy contracts |
| Period control alignment | Accounting enforces period locks; Settings/Admin defines policy values |
| Config versioning | Configuration changes are versioned/effective-dated where applicable |
