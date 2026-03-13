# Phase 1 — Organization Hierarchy: DEV-40, DEV-41

Study topics from implementing Branch model CRUD with multi-branch support.

## 1. TOCTOU Race Conditions in CRUD Operations

**What:** Time-of-check-to-time-of-use (TOCTOU) — a race condition where the state verified in a check changes before the subsequent action uses it.

**Why it matters:** In multi-tenant ERP systems, concurrent requests can cause a `findFirst` check to pass, but by the time `update` or `delete` executes, the record may have been modified or deleted by another request — leading to 500 errors instead of clean 404s.

**How it works / Key concepts:**
- **Bad pattern:** `findFirst()` then `update({ where: { id } })` — two separate queries with a gap
- **Good pattern for update:** Single `update({ where: { id, tenantId } })` and catch P2025 (record not found)
- **Good pattern for delete:** Wrap ownership check + business rule check + delete in `$transaction`
- Prisma error codes: P2002 = unique constraint violation, P2025 = record not found

**Resources:**
- [OWASP Race Conditions](https://owasp.org/www-community/vulnerabilities/Time_of_check_to_time_of_use)
- [Prisma Error Reference](https://www.prisma.io/docs/orm/reference/error-reference)

## 2. HTTP Status Codes for REST APIs

**What:** Proper HTTP status codes communicate the outcome of an API request semantically — not just success/failure, but the nature of the result.

**Why it matters:** Zerupt's API serves frontend clients that rely on status codes for control flow. Returning 200 for everything forces clients to inspect the body to determine what happened.

**How it works / Key concepts:**
- `200 OK` — successful read or update (body contains data)
- `201 Created` — successful resource creation (POST). Optionally includes `Location` header
- `204 No Content` — successful deletion (no response body needed)
- `404 Not Found` — resource doesn't exist (or tenant scoping filtered it out — same to the client)
- `409 Conflict` — business rule violation (duplicate code, RBAC reference blocks delete)
- NestJS default: POST returns 200 unless `@HttpCode(HttpStatus.CREATED)` is explicitly set

**Resources:**
- [MDN HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [NestJS HTTP Code Decorator](https://docs.nestjs.com/controllers#status-code)

## 3. ON DELETE CASCADE vs RESTRICT in Foreign Keys

**What:** PostgreSQL FK constraints control what happens when a parent row is deleted. CASCADE deletes child rows automatically; RESTRICT blocks the deletion.

**Why it matters:** The Branch → RolePermissionBranch FK determines whether deleting a branch silently removes all RBAC scope assignments or forces the user to clean up first. For an ERP, silent cascading deletions of permission data is dangerous.

**How it works / Key concepts:**
- `ON DELETE CASCADE` — parent delete cascades to children (use for owned-lifecycle: deleting a role deletes its permissions)
- `ON DELETE RESTRICT` — blocks parent delete if children exist (use for cross-aggregate references)
- **Rule of thumb:** CASCADE within an aggregate boundary, RESTRICT across aggregate boundaries
- Even with RESTRICT at DB level, add application-layer checks for better error messages
- Prisma schema: `@relation(... onDelete: Restrict)` maps to `ON DELETE RESTRICT` in SQL

**Resources:**
- [PostgreSQL Foreign Key Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK)

## 4. Pagination Patterns: Offset vs Cursor

**What:** Two main approaches to paginating database results — offset-based (`page/limit` → `OFFSET/LIMIT`) and cursor-based (`after: lastId` → `WHERE id > cursor LIMIT n`).

**Why it matters:** Zerupt uses offset pagination (`page/limit`) for settings CRUD where datasets are small (<1000 branches). Cursor pagination is needed for large datasets (audit logs, transactions) where offset becomes slow.

**How it works / Key concepts:**
- **Offset:** `skip: (page - 1) * limit, take: limit` — simple, supports "jump to page N", but `O(n)` for deep pages
- **Cursor:** `cursor: { id: lastId }, take: limit` — `O(1)` for all pages, but can't jump to arbitrary pages
- Always return a `meta` object: `{ total, page, limit }` for offset or `{ hasNextPage, endCursor }` for cursor
- Use `Promise.all([findMany, count])` to parallelize the data query and count query

**Resources:**
- [Prisma Pagination](https://www.prisma.io/docs/orm/prisma-client/queries/pagination)

## 5. Immutable Business Identifiers

**What:** Some fields (like branch `code`, tenant `code`, `countryCode` after first transaction) should never change after creation because other systems reference them.

**Why it matters:** Branch codes appear in document sequences (INV-HQ-0001), audit logs, and cross-module contracts. Changing a code would break all historical references.

**How it works / Key concepts:**
- **Schema level:** Exclude the field from the update Zod schema entirely (not just validate — omit it)
- **DB level:** Add a trigger that raises an exception if the column changes (belt-and-suspenders)
- **API level:** PATCH only accepts fields in the update schema — unknown fields are stripped by Zod
- This is different from soft-delete (`isActive = false`) which preserves the record

**Resources:**
- [Zod strip vs strict](https://zod.dev/?id=strip)

## 6. Warehouse Hierarchy in Retail ERP

**What:** A multi-level location hierarchy (Branch → Warehouse → Zone → Bin) that models where physical inventory lives.

**Why it matters:** Zerupt's inventory engine (Phase 3) will deduct stock from specific locations. Without this hierarchy, stock tracking is a flat list per branch — fine for a single-counter shop, unusable for a retailer with back-of-store, multiple aisles, or inter-branch transfers.

**How it works / Key concepts:**
- **Warehouse types:** `Store` (selling floor), `Warehouse` (storage), `Transit` (virtual — goods in flight between locations)
- **Default warehouse:** Every active branch needs exactly one. POS transactions deduct from here automatically. Enforced by a partial unique index: `CREATE UNIQUE INDEX ... ON warehouses (tenant_id, branch_id) WHERE is_default = true`
- **Zone/Bin:** Optional granularity. Zones are areas (e.g., "Frozen"), bins are shelf slots (e.g., "A-01-03"). Small retailers skip these entirely.
- **Transit warehouse:** Enables stock transfer workflows. Stock leaves source warehouse → enters transit → arrives at destination warehouse. Cannot be the default (enforced by DB CHECK constraint).

**Resources:**
- [Warehouse Management Concepts (Oracle)](https://docs.oracle.com/en/cloud/saas/warehouse-management/22d/owmgs/warehouse-management-concepts.html)

## 7. Cascade Deactivation vs Cascade Deletion

**What:** Two different approaches to handling parent-child lifecycle — deactivating a parent can cascade deactivation to children (soft), while deleting is blocked if children exist (hard).

**Why it matters:** In an ERP, deleting a warehouse that has zones and bins would orphan inventory references. Deactivating it (setting `isActive: false`) is reversible and preserves all data for reactivation later.

**How it works / Key concepts:**
- **Cascade deactivation:** When a warehouse is deactivated, all its zones and bins are also deactivated in the same transaction. Implemented via `updateMany` inside `$transaction`.
- **Delete protection:** Deletion is blocked at the application level if children exist (`count > 0`). At the DB level, `ON DELETE RESTRICT` on FKs provides a safety net.
- **Reactivation guard:** A child cannot be reactivated if its parent is still inactive. This prevents orphaned active bins under an inactive zone.
- **Why not CASCADE on delete?** Silently deleting zones/bins/inventory when a warehouse is removed would be catastrophic for an ERP. RESTRICT forces explicit cleanup.

**Resources:**
- [Soft Delete Pattern](https://www.prisma.io/docs/orm/prisma-client/queries/crud#soft-delete)

## 8. Partial Unique Indexes in PostgreSQL

**What:** A unique index with a `WHERE` clause that only enforces uniqueness on a subset of rows.

**Why it matters:** The "one default warehouse per branch" rule cannot be expressed with a standard unique constraint. A partial unique index on `(tenant_id, branch_id) WHERE is_default = true` ensures at most one default exists per branch at the database level — even if the application has a bug.

**How it works / Key concepts:**
```sql
CREATE UNIQUE INDEX warehouses_single_default_idx
  ON warehouses (tenant_id, branch_id)
  WHERE is_default = true;
```
- Only rows where `is_default = true` are included in the index
- Multiple rows with `is_default = false` are allowed (not indexed)
- This is a PostgreSQL-specific feature (not standard SQL)
- Combines with application-level `updateMany` (unset previous default) for belt-and-suspenders enforcement

**Resources:**
- [PostgreSQL Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)

## 9. Defense-in-Depth: tenantId on Every Query

**What:** Including `tenantId` in every database query's WHERE clause, even when FK chains already scope the data to a tenant.

**Why it matters:** Zerupt uses per-tenant databases, so cross-tenant access is theoretically impossible at the connection level. But defense-in-depth means adding `tenantId` to every query anyway — if the tenant routing layer has a bug, or if the architecture changes to shared databases later, each query is independently safe.

**How it works / Key concepts:**
- Every model carries a `tenantId` column, even when it's "redundant" given the FK chain (Bin → Zone → Warehouse → Branch all have tenantId)
- Every `findFirst`, `findMany`, `update`, `updateMany`, `delete` includes `tenantId` in the WHERE clause
- The code review caught cases where `updateMany` (cascade deactivation) and `update` (final write) were missing `tenantId` — these were CRITICAL security findings
- Cost: slightly larger indexes and marginally more query complexity. Benefit: bulletproof tenant isolation.

**Resources:**
- [OWASP Multi-Tenancy Security](https://cheatsheetseries.owasp.org/cheatsheets/Multi-Tenancy_Security_Cheat_Sheet.html)
