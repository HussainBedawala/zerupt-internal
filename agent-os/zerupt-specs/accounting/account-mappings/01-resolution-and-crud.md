# Account Mappings — Resolution & CRUD

> Services: `apps/api/src/journal-entries/account-mapping.service.ts`, `account-mapping-crud.service.ts`, `account-mapping-seed.service.ts`
> Schema: `packages/db/src/schema/account-mapping.ts`

## Schema: `account_mappings`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenantId, legalEntityId | uuid | FK → legalEntities |
| eventType | varchar(100) | e.g. `sales.invoice.confirmed` |
| lineType | varchar(50) | e.g. `revenue`, `cogs`, `receivable`, `tax` |
| accountId | uuid | FK → accounts |
| scope | enum | system / tenant / warehouse / category / item |
| scopeId | uuid | NULL for system/tenant; required for warehouse/category/item |
| isActive | boolean | |

### Constraints

- **Unique:** `(tenant_id, legal_entity_id, event_type, line_type, scope, scope_id)`
- **CHECK:** `scope IN (system, tenant) → scopeId IS NULL`
- **CHECK:** `scope NOT IN (system, tenant) → scopeId IS NOT NULL`

## Override Hierarchy (ascending priority)

```
system (0) < tenant (1) < warehouse (2) < category (3) < item (4)
```

Most specific match wins. If an item-level mapping exists for a lineType, it overrides tenant/system.

## Resolution Algorithm

### `resolveAccount(tenantId, legalEntityId, eventType, lineType, context?)`

1. Single DB query: all mappings for `(tenantId, legalEntityId, eventType, lineType)` where `isActive = true`
2. `findMostSpecific()`:
   - Scoped mappings (item/category/warehouse) only match if `scopeId` is in the provided `context`
   - System and tenant always match (no scopeId check)
   - Return highest-priority match
3. Throw `NotFoundException` if no applicable mapping

### `resolveAccountsBatch(...)` — same but for multiple lineTypes in one DB query

Returns `Map<lineType, accountId>`. Throws if any lineType has no mapping.

## CRUD Rules

| Operation | Rule |
|-----------|------|
| Create | Validates: account exists, active, not header, correct entity, type matches line rules |
| Update | `scope = system` → `ForbiddenException` (system mappings are read-only) |
| Update | Partial: only `accountId` and/or `isActive` |
| Create via API | Cannot create `system` scope (only `tenant/warehouse/category/item`) |

## Line Type → Account Type Rules (24 entries)

| Line Types | Allowed Account Type |
|------------|---------------------|
| revenue, returns, discount | income |
| cogs, loss, expense, fee, cogs_adjustment | expense |
| over_short | expense or income |
| receivable, cash, cheques_in_hand, transit, inventory, input_tax, inventory_uplift | asset |
| payable, output_tax, accrual, outstanding, landed_cost_payable | liability |
| gain | income or expense |

## Default Seed (27 mappings)

Covers: Sales, Purchase/GRN, POS, Cheques, Inventory (adjustment, transfer, consumption, assembly, landed cost), Banking.

`seedDefaults()` is idempotent: skips existing `system`-scope keys, warns on missing COA accounts, uses `ON CONFLICT DO NOTHING`.

## API Endpoints

| Method | Route | Permission |
|--------|-------|-----------|
| GET | `/tenant/account-mappings` | `accounting.mapping.list` |
| GET | `/tenant/account-mappings/:id` | `accounting.mapping.read` |
| POST | `/tenant/account-mappings` | `accounting.mapping.create` |
| PATCH | `/tenant/account-mappings/:id` | `accounting.mapping.update` |
| POST | `/tenant/account-mappings/seed-defaults` | `accounting.mapping.seed` |

List filters: `legalEntityId`, `eventType`, `lineType`, `scope`, `isActive`. Pagination: page/limit.
