# Roles and Permissions Policy

## Role Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `tenantId` | UUID | Defense-in-depth (physical isolation already exists) |
| `name` | string | Composite unique with `tenantId` — same name allowed across tenants |
| `description` | string? | Optional — not every role needs a description |
| `isSystemRole` | boolean | Non-deletable, non-editable (Owner, Admin) |
| `isActive` | boolean | Default `true` |
| `priority` | integer | Conflict resolution — lower value = higher priority |
| `createdAt` | datetime | Timestamptz |
| `updatedAt` | datetime | Timestamptz |

**Indexes:** `@@unique([tenantId, name])`, `@@index([tenantId])`

## Permission Grant Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `roleId` | UUID | FK → Role, cascade delete |
| `permissionKey` | string | `{module}.{entity}.{action}` — validated against `PERMISSION_KEY_SET` at publish time |
| `scopeType` | enum | `Tenant`, `Branch`, `Own` |
| `fieldMask` | string[] | Hidden fields list (default `{}`, max 100 entries) |
| `constraintJson` | json? | Optional conditional deny constraints (max 10KB, must be object) |
| `createdAt` | datetime | Timestamptz |
| `updatedAt` | datetime | Timestamptz |

**Indexes:** `@@unique([roleId, permissionKey])` (one grant per key per role), `@@index([permissionKey])`

**Branch scoping:** Normalized into `RolePermissionBranch` junction table (not an array column). Each row maps a permission grant to a specific branch. Only valid when `scopeType = Branch` (enforced by DB trigger).

### Role Permission Branch Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `rolePermissionId` | UUID | FK → RolePermission, cascade delete |
| `branchId` | UUID | FK → Branch (future), indexed |
| `createdAt` | datetime | Timestamptz |

**Indexes:** `@@unique([rolePermissionId, branchId])`, `@@index([branchId])`

## User Role Assignment Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `tenantId` | UUID | Defense-in-depth |
| `userId` | string | Supabase Auth user ID |
| `roleId` | UUID | FK → Role, cascade delete |
| `assignedAt` | datetime | When the role was assigned (Timestamptz) |
| `assignedBy` | string | User ID of who granted the role — compliance audit trail (ZATCA/GST). Nil UUID for system-initiated. |
| `expiresAt` | datetime? | Optional expiry for time-bounded assignments (must be after assignedAt) |
| `updatedAt` | datetime | Timestamptz |

**Indexes:** `@@unique([tenantId, userId, roleId])`, `@@index([tenantId, userId])`, `@@index([roleId])`, `@@index([assignedBy])`, `@@index([tenantId, userId, expiresAt])`

**Invariant:** At least one active (non-expired) Owner assignment must exist per tenant — enforced by DB trigger.

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
