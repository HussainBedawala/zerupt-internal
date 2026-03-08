# Branches Locations Warehouses

## Branch Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `code` | string | Unique branch code |
| `name` | string | |
| `nameAlt` | string | |
| `currencyCode` | string | Optional branch currency |
| `timezone` | string | |
| `taxProfileId` | UUID | Optional override |
| `isActive` | boolean | |
| `openedAt` | date | |

## Warehouse Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `branchId` | UUID | |
| `code` | string | Unique per branch |
| `name` | string | |
| `type` | enum | `Store`, `Warehouse`, `Transit` |
| `isDefault` | boolean | One default per branch |
| `isActive` | boolean | |

## Zone and Bin Entities

| Entity | Required Fields |
|--------|-----------------|
| Zone | `id`, `warehouseId`, `code`, `name`, `isActive` |
| Bin | `id`, `zoneId`, `code`, `name`, `isActive` |

---

## Hierarchy Rules

| Rule | Detail |
|------|--------|
| Structure | Branch -> Warehouse -> Zone -> Bin |
| Parent activity | Child cannot be active if parent inactive |
| Default warehouse | Required for each active branch |
| Transit warehouse | Must be `type=Transit`, not default |

## Activation and Deactivation Rules

| Target | Rule |
|--------|------|
| Branch deactivation | Block if active users, open shifts, or non-zero in-transit stock |
| Warehouse deactivation | Block if non-zero onHand/committed/inTransit |
| Zone/Bin deactivation | Block if contains stock |
| Reactivation | Restores previous relationships, no data loss |

## Branch Override Rules

| Setting | Allowed |
|---------|---------|
| Tax profile override | Yes |
| Timezone override | Yes |
| Currency override | Yes if multi-currency enabled |
| Fiscal period override | No |

## Security Rules

| Rule | Detail |
|------|--------|
| Branch admin action | Requires branch in actor scope |
| Cross-branch move settings | Requires override permission |
| Structural updates | Audit log mandatory |
