# Roles and Permissions Policy

## Role Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `name` | string | Unique per tenant |
| `description` | string | |
| `isSystemRole` | boolean | Non-deletable |
| `isActive` | boolean | |
| `priority` | integer | Conflict resolution |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

## Permission Grant Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `roleId` | UUID | |
| `permissionKey` | string | `{module}.{entity}.{action}` |
| `scopeType` | enum | `Tenant`, `Branch`, `Own` |
| `branchIds` | array(UUID) | Required for `Branch` |
| `fieldMask` | array(string) | Hidden fields list |
| `constraintJson` | json | Optional conditional constraints |

---

## Permission Key Rules

| Rule | Detail |
|------|--------|
| Naming | Lowercase `{module}.{entity}.{action}` |
| Unknown key | Reject role publish |
| Key deprecation | Soft-deprecate, map to replacement, keep audit trail |
| Ownership key | `settings.owner` cannot be granted or revoked |

## Evaluation Order

| Step | Behavior |
|------|----------|
| 1 | Owner bypass |
| 2 | Aggregate role grants |
| 3 | Apply deny constraints from `constraintJson` |
| 4 | Intersect with user branch scope |
| 5 | Apply field mask |
| 6 | Emit decision audit record for denied critical actions |

## Sensitive Field Visibility

| Field Group | Required Key |
|------------|--------------|
| Inventory costs/margins | `inventory.cost.view` |
| Financial statements/accounts | `reports.viewFinancial` or `accounting.view` |
| Tax detail lines | `reports.viewTax` or `accounting.view` |
| API secrets/webhook secrets | `settings.integrations.manageSecrets` |

## Approval Override Matrix

| Action | Required Key | Extra Gate |
|--------|--------------|------------|
| Permission policy publish | `settings.permissions.publish` | Manager PIN |
| Role delete | `settings.roles.delete` | Block if assigned users > 0 |
| Field mask removal for costs | `settings.permissions.overrideSensitive` | Manager PIN |
| Grant cross-branch all-access | `settings.permissions.overrideBranchScope` | Owner or manager PIN |

## Invariants

| Invariant | Enforcement |
|----------|-------------|
| At least one active role can manage users | Publish blocked otherwise |
| At least one active role can manage permissions | Publish blocked otherwise |
| No circular role templates | Validation error |
| Role change is non-retroactive for past audits | Immutable audit linkage |
