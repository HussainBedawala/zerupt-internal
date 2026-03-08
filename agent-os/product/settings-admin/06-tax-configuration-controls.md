# Tax Configuration Controls

## Tax Profile Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `name` | string | |
| `countryCode` | string | |
| `isDefault` | boolean | |
| `isActive` | boolean | |

## Tax Component Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `taxProfileId` | UUID | |
| `code` | string | |
| `name` | string | |
| `type` | enum | `Exclusive`, `Inclusive` |
| `category` | enum | `Standard`, `ZeroRated`, `Exempt`, `ReverseCharge`, `NonRecoverable` |
| `outputAccountId` | string | |
| `inputAccountId` | string | |
| `isActive` | boolean | |

## Tax Rate Version Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `taxComponentId` | UUID | |
| `rate` | decimal | |
| `effectiveFrom` | date | |
| `effectiveTo` | date | nullable |
| `approvedByUserId` | UUID | |

---

## Control Rules

| Rule | Detail |
|------|--------|
| Effective dating | New rate versions only, no overwrite |
| Overlap | Block overlapping effective ranges |
| Deactivation | Block if active assignments exist |
| Account mapping | Component must map to valid tax accounts |
| Jurisdiction switch | Block after first posted transaction under profile |

## Applicability Rules

| Dimension | Supported |
|----------|-----------|
| Item category | Yes |
| Customer type | Yes |
| Transaction type | Yes |
| Branch override | Yes |

| Resolution priority | `Item > Customer > Category > Branch > Tenant default` |

## Approval Matrix

| Action | Required |
|--------|----------|
| Add new component | `settings.tax.manage` |
| Change tax rate | `settings.tax.rate.change` + manager PIN |
| Deactivate default tax profile | Owner or explicit override key |

## Cross-Reference

| Reference | Alignment |
|-----------|-----------|
| `accounting/02-tax-model.md` | Tax code/group/rate structure and categories |
| `accounting/07-event-mappings.md` | Journal impact owned by accounting event processing |
