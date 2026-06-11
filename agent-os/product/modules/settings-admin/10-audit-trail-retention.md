# Audit Trail and Retention

## Audit Log Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `occurredAt` | datetime | |
| `actorUserId` | UUID | |
| `actorType` | enum | `User`, `System`, `ApiKey` |
| `module` | string | |
| `action` | string | `create`, `update`, `delete`, `login`, `export`, `approve` |
| `entityType` | string | |
| `entityId` | string | |
| `summary` | string | |
| `beforeJson` | json | nullable |
| `afterJson` | json | nullable |
| `ipAddress` | string | nullable |
| `traceId` | string | Correlation ID |

## Retention Policy Entity

| Field | Type | Description |
|-------|------|-------------|
| `tenantId` | UUID | |
| `retentionYears` | integer | Min 3 |
| `archiveAfterDays` | integer | |
| `legalHoldEnabled` | boolean | |
| `legalHoldReason` | string | nullable |

---

## Audit Rules

| Rule | Detail |
|------|--------|
| Immutability | No update/delete on audit rows |
| Tamper evidence | Chain hash by tenant + day |
| Redaction | PII masking policy at view time, raw kept |
| Critical actions | Must include reason in metadata |

## Access Rules

| Rule | Detail |
|------|--------|
| View audit logs | `settings.audit.view` |
| Export audit logs | `settings.audit.export` |
| View sensitive diffs | `settings.audit.viewSensitive` |
| Owner override | Owner can view/export all |

## Export Rules

| Rule | Detail |
|------|--------|
| Formats | CSV, JSON |
| Time range | Required |
| Branch filtering | Enforced by branch scope unless owner |
| Export logging | Every export creates audit row |

## Retention Rules

| Rule | Detail |
|------|--------|
| Minimum retention | 3 years |
| Legal hold | Suspends purge jobs |
| Purge mode | Archive then purge by policy window |
| Purge audit | Purge operations self-audited |
