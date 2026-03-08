# Cross Module Contracts

## Ownership Boundary

| Area | Settings/Admin Owns | Domain Modules Own |
|------|---------------------|--------------------|
| Access | Users, roles, permission policies | Runtime authorization checks per action |
| Organization | Tenant profile, branch/warehouse configuration policy | Transactional use of selected branch/warehouse |
| Financial config | Currency/tax/period policy settings | Posting behavior and JE generation |
| Numbering | Sequence definitions and controls | Number consumption during document creation |
| Notifications | Event routing policy and recipients | Event emission with payload |
| Audit/import/integrations | Governance and lifecycle policies | Domain data semantics |

---

## Modules Reading Settings/Admin

| Consumer | Reads |
|----------|-------|
| POS | active register branch policy, receipt numbering sequence, user branch scope |
| Sales | user/role permissions, customer-doc numbering, branch/tax/currency policy |
| Purchase | approval thresholds, supplier-doc numbering, branch/tax/currency policy |
| Inventory | branch/warehouse hierarchy policy, cost visibility permissions |
| Accounting | fiscal settings, period policy, currency policy, tax profile mappings |
| Reports | permission and field-visibility policy, branch scope rules |

## Externalized Read Contracts

| Contract Key | Response Shape |
|--------------|----------------|
| `settings.permissions.resolve` | `{ userId, grantedKeys[], branchScope[], fieldMask[] }` |
| `settings.branches.active` | `{ branches[], defaultWarehouseByBranch{} }` |
| `settings.currency.policy` | `{ functionalCurrency, allowedCurrencies[], ratePolicy }` |
| `settings.tax.profile` | `{ profileId, components[], rates[] }` |
| `settings.numbering.getSequence` | `{ documentType, branchId, format, nextNumber }` |
| `settings.period.policy` | `{ fiscalYearStartMonth, lockPolicy, softLockRoles[] }` |

---

## Settings/Admin Events Emitted

| Event | Trigger | Primary Consumers |
|-------|---------|-------------------|
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

---

## Constraints

| Constraint | Enforcement |
|-----------|-------------|
| No JE generation in Settings/Admin | Accounting only |
| No stock movement in Settings/Admin | Inventory only |
| No policy bypass for non-owner users | Permission resolver |
| Cross-module write access | Blocked except defined events |
