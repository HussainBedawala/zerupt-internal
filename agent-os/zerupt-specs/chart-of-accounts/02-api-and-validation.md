# COA API & Validation

> Controller: `apps/api/src/accounts/accounts.controller.ts`
> Service: `apps/api/src/accounts/accounts.service.ts`
> DTOs: `apps/api/src/accounts/accounts.dto.ts`

## Endpoints

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/tenant/accounts` | `accounting.account.list` | Paginated list with filters |
| GET | `/tenant/accounts/tree` | `accounting.account.list` | Full hierarchy as nested tree |
| GET | `/tenant/accounts/:id` | `accounting.account.read` | Single account + parent stub + children count |
| POST | `/tenant/accounts` | `accounting.account.create` | Create account |
| PATCH | `/tenant/accounts/:id` | `accounting.account.update` | Update account |
| DELETE | `/tenant/accounts/:id` | `accounting.account.delete` | Hard delete (if no children/journals) |
| POST | `/tenant/accounts/seed-template` | `accounting.account.seed` | Seed COA template |

Route order: static paths (`/tree`, `/seed-template`) declared before `/:id` to avoid conflicts.

All mutations are `@Audited()`. All endpoints use `@RequiresPermission()` guard. Tenant context extracted via `getTenantContext()`.

## List Filters

| Param | Type | Notes |
|-------|------|-------|
| `type` | account_type | Filter by account type |
| `subType` | account_sub_type | Filter by sub-type |
| `isActive` | boolean | true = `deactivatedAt IS NULL` |
| `isSystemAccount` | boolean | System-seeded accounts only |
| `rootOnly` | boolean | `depth = 0` accounts only |
| `search` | string | ILIKE on code, name, nameAlt |
| `page`, `limit` | number | Pagination (default limit 50) |

## Create Validation

1. Legal entity must exist for this tenant
2. `type` ↔ `subType` mapping must be valid (see schema enum table)
3. If `parentAccountId` provided: parent must be a header, same account type, depth < 5
4. `normalBalance` auto-derived from type (flipped if `isContra`)
5. Code format: alphanumeric + dots (e.g. `1162.01`)

## Update Rules

| Field | Updatable? | Restrictions |
|-------|-----------|--------------|
| `name`, `nameAlt` | Yes | Always |
| `cashFlowCategory` | Yes | Always |
| `currencyCode` | Yes | Always |
| `parentAccountId` | Yes | Not for system accounts. Circular ref check. Cascades depth recalculation |
| `isActive` (via deactivatedAt) | Yes | System accounts cannot be deactivated. Deactivation blocked if active children exist. Reactivation requires active parent |
| `type`, `subType`, `code` | No | System accounts only restriction (user accounts can change these) |

### Re-parenting Logic

1. Validate new parent is header + same type
2. Check new parent is not a descendant (circular ref via recursive CTE)
3. Calculate depth delta
4. Update target account depth
5. Cascade depth update to all descendants via recursive CTE
6. All within a single transaction (TOCTOU-safe)

## Delete Rules

- System accounts: cannot delete
- Accounts with children: cannot delete
- Accounts with journal entries: cannot delete (placeholder check)
- Otherwise: hard delete

## Tree Operation

`GET /tenant/accounts/tree`

| Param | Type | Notes |
|-------|------|-------|
| `legalEntityId` | uuid | Required |
| `isActive` | boolean | Optional filter |
| `maxDepth` | number | Optional depth limit |

Returns `AccountTreeNode[]` — nested structure built in-memory (O(n) single pass over flat rows using a Map). More flexible than recursive SQL for client-side filtering.

## Seed Template

`POST /tenant/accounts/seed-template`

| Param | Type | Notes |
|-------|------|-------|
| `legalEntityId` | uuid | Required |
| `countryCode` | string | Optional — applies country overlay |

Returns `{ created: number, skipped: number }`. Idempotent — existing codes are skipped. Accounts inserted in topological order (depth-first) for FK safety. System accounts marked with sentinel UUID `00000000-0000-0000-0000-000000000000` as `createdBy`.

## RBAC Permissions

Defined in `packages/shared/src/permissions.ts`:

```
accounting.account.create
accounting.account.read
accounting.account.update
accounting.account.delete
accounting.account.list
accounting.account.export
accounting.account.seed
```
