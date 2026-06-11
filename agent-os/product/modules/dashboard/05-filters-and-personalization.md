# Filters and Personalization

## Global Filter Schema

| Field | Type | Description |
|-------|------|-------------|
| `dateRange` | object | `{preset|from|to}` |
| `branchIds` | array(UUID) | Branch scope |
| `currency` | string | display currency |
| `comparison` | enum | `None`, `PreviousPeriod`, `PreviousYear` |
| `tags` | array(string) | optional widget tags |

## Saved View Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `ownerUserId` | UUID | |
| `name` | string | |
| `filtersJson` | json | global filters |
| `layoutJson` | json | widget placement and visibility |
| `isDefault` | boolean | |
| `shareMode` | enum | `Private`, `Role`, `Team`, `Tenant` |

## Filter Rules

| Rule | Detail |
|------|--------|
| Branch scope enforcement | User cannot apply branches outside allowed scope |
| Date range limit | Max 24 months for interactive views |
| Currency display | Conversion uses configured rate policy |
| Sticky filters | Persist per user session and saved default |

## Personalization Rules

| Rule | Detail |
|------|--------|
| Per-user layout | Supported |
| Per-role default | Applied for first login or reset |
| Shared view edit | Allowed only by owner or permitted role |
| Reset layout | Reverts to role default template |
