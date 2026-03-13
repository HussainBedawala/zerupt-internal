# Cross Module Contracts

## Ownership Boundary

| Area | Settings/Admin Owns | Domain Modules Own |
|------|---------------------|--------------------|
| Access | Users, roles, permission policies | Runtime authorization checks per action |
| Organization | Tenant profile, legal entities, branch/warehouse configuration policy | Transactional use of selected branch/warehouse |
| Financial config | Currency/tax/period policy settings, legal entity identity | Posting behavior and JE generation |
| Numbering | Sequence definitions and controls | Number consumption during document creation |
| Notifications | Event routing policy and recipients | Event emission with payload |
| Audit/import/integrations | Governance and lifecycle policies | Domain data semantics |

---

## Modules Reading Settings/Admin

| Consumer | Reads |
|----------|-------|
| POS | Branch → legal entity mapping, receipt numbering sequence, user branch scope |
| Sales | User/role permissions, customer-doc numbering, branch/tax/currency policy, legal entity for invoicing (registration number, tax number on invoice header) |
| Purchase | Approval thresholds, supplier-doc numbering, branch/tax/currency policy, legal entity for PO/GRN |
| Inventory | Branch/warehouse hierarchy policy, cost visibility permissions |
| Accounting | Legal entity → functional currency + COA, fiscal settings, period policy, currency policy, tax profile mappings |
| Reports | Permission and field-visibility policy, branch scope rules, legal entity filter for financial reports |

## Externalized Read Contracts

| Contract Key | Response Shape | Scope |
|--------------|----------------|-------|
| `settings.permissions.resolve` | `{ userId, grantedKeys[], branchScope[], fieldMask[] }` | Tenant |
| `settings.branches.active` | `{ branches[], defaultWarehouseByBranch{} }` | Tenant |
| `settings.legal-entity.resolve` | `{ legalEntityId, code, name, countryCode, functionalCurrency, isDefault }` | Per entity |
| `settings.legal-entity.forBranch` | `{ branchId } → { legalEntityId, functionalCurrency, countryCode }` | Per branch |
| `settings.currency.policy` | `{ isMultiCurrencyEnabled, roundingMode, allowedCurrencies[], ratePolicy }` | Tenant |
| `settings.currency.forEntity` | `{ legalEntityId } → { functionalCurrency, decimalPlaces }` | Per entity |
| `settings.tax.profile` | `{ profileId, components[], rates[] }` | Per entity/branch |
| `settings.numbering.getSequence` | `{ documentType, branchId, format, nextNumber }` | Per branch |
| `settings.period.policy` | `{ legalEntityId, fiscalYearStartMonth, lockPolicy, softLockRoles[] }` | Per entity |

---

## Settings/Admin Events Emitted

| Event | Trigger | Primary Consumers |
|-------|---------|-------------------|
| `settings.legal-entity.created` | New legal entity created | Accounting (seed COA), all modules |
| `settings.legal-entity.updated` | Entity details changed | All modules referencing entity |
| `settings.legal-entity.deactivated` | Entity set inactive | All modules — block new transactions for this entity |
| `settings.user.updated` | User status/branch/role changed | Auth, all modules |
| `settings.role.policyPublished` | Role/permission publish | Auth, Reports |
| `settings.branch.updated` | Branch/warehouse activation or config change | POS, Inventory, Sales, Purchase |
| `settings.currency.policyChanged` | Currency/rate policy changed | Accounting, Sales, Purchase |
| `settings.tax.profileChanged` | Tax structure or rate version changed | Accounting, Sales, Purchase, POS |
| `settings.numbering.sequenceChanged` | Sequence format/state changed | All document modules |
| `settings.period.policyChanged` | Period/fiscal policy changed | Accounting |
| `settings.notification.policyChanged` | Notification routing changed | Notification service |
| `settings.integration.endpointChanged` | Webhook/API key changed | Integration dispatcher |

## Event Envelope Rules

| Rule | Detail |
|------|--------|
| Idempotency | `eventId` required, duplicate ignored by consumer |
| Ordering | Best effort ordering per aggregate key |
| Source document | Must include `sourceDocumentType` and `sourceDocumentId` |
| Audit linkage | Include `actorUserId` and `traceId` |
| Legal entity context | Events affecting financial data must include `legalEntityId` |

---

## Constraints

| Constraint | Enforcement |
|-----------|-------------|
| No JE generation in Settings/Admin | Accounting only |
| No stock movement in Settings/Admin | Inventory only |
| No policy bypass for non-owner users | Permission resolver |
| Cross-module write access | Blocked except defined events |
| Legal entity isolation | Financial data (COA, JEs, fiscal periods) scoped to legal entity |
