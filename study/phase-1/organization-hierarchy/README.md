# Phase 1 — Organization Hierarchy: DEV-40, DEV-41, DEV-42

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

## 10. Key-Based Remounting in React

**What:** Using React's `key` prop to force a component to unmount and remount with fresh state, rather than updating in place.

**Why it matters:** In Zerupt's location dialogs, switching between "create" and "edit" modes reuses the same Dialog component. Without key-based remounting, stale `useState` values from a previous edit persist into the next open — e.g., opening "create" after editing a branch shows the old branch's name.

**How it works / Key concepts:**
- React reconciles components by position in the tree. Same position + same type = same instance (state preserved)
- Changing the `key` prop tells React "this is a different instance" — it unmounts the old and mounts a new one
- Pattern: `<ZoneDialog key={editingZone?.id ?? "create"} ... />`
- Alternative: manually reset state in `useEffect` — more error-prone and verbose
- Trade-off: remounting is slightly more expensive than updating, but for dialogs (low frequency) it's negligible

**Resources:**
- [React docs: Resetting state with a key](https://react.dev/learn/preserving-and-resetting-state#resetting-a-form-with-a-key)

## 11. TanStack Query Mutation Cache Invalidation

**What:** After a mutation (create/update/delete), TanStack Query can automatically refetch related queries by invalidating their cache keys.

**Why it matters:** Zerupt's location hierarchy has parent-child relationships across 4 levels. When a zone is deleted, the zones list for that warehouse must refetch. Without invalidation, the UI shows stale data until the user manually refreshes.

**How it works / Key concepts:**
- Query keys are hierarchical arrays: `["zones", warehouseId]` — invalidating `["zones"]` refetches all zone queries
- `queryClient.invalidateQueries({ queryKey: [...] })` marks cached data as stale and triggers a background refetch
- Place invalidation in the mutation's `onSuccess` callback, not `onSettled` (don't refetch on error)
- Zerupt pattern: each mutation hook calls `invalidateQueries` for its entity type on success
- For cross-level cascades (deactivating a warehouse should refresh zones), invalidate multiple key prefixes

**Resources:**
- [TanStack Query: Invalidation from Mutations](https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations)

## 12. NFC Normalization for Search Filtering

**What:** Unicode Normalization Form C (NFC) ensures that characters with diacritics are represented consistently — as a single code point rather than a base character + combining mark.

**Why it matters:** Zerupt supports Arabic text. Arabic text with diacritical marks (tashkeel) can be encoded in multiple ways. Without normalization, a user searching for "مخزن" might not match "مخزن" if one uses composed and the other decomposed Unicode.

**How it works / Key concepts:**
- `"café".normalize("NFC")` — combines `e` + `◌́` into `é` (single code point)
- Apply `.normalize("NFC")` to both the search term and the data being searched
- Do this client-side for instant filtering, server-side for database queries
- Zerupt applies NFC in `BranchesTable` search: `term.normalize("NFC")` compared against `branch.name.normalize("NFC")`
- Cost: negligible — NFC is the default form for most keyboard input anyway

**Resources:**
- [MDN String.prototype.normalize()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize)

## 13. CSS Logical Properties for RTL Support

**What:** CSS logical properties (`margin-inline-start`, `padding-inline-end`, `ps-4`, `me-1`) replace physical properties (`margin-left`, `padding-right`) to automatically adapt to text direction.

**Why it matters:** Zerupt launches with Arabic (RTL) and English (LTR). Using physical properties means writing separate RTL overrides for every spacing rule. Logical properties flip automatically based on `dir="rtl"`.

**How it works / Key concepts:**
- `margin-inline-start` = left margin in LTR, right margin in RTL
- Tailwind shortcuts: `ps-` (padding-start), `pe-` (padding-end), `ms-` (margin-start), `me-` (margin-end)
- `text-start` instead of `text-left`, `float-start` instead of `float-left`
- Block axis (top/bottom) stays the same: `pt-`, `pb-`, `mt-`, `mb-` are fine
- Zerupt convention: never use `pl-`, `pr-`, `ml-`, `mr-` — always the logical equivalents

**Resources:**
- [MDN CSS Logical Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values)
- [Tailwind Logical Properties](https://tailwindcss.com/blog/tailwindcss-v3-3#logical-properties)

## 14. Intl.supportedValuesOf() for Runtime Validation

**What:** A JavaScript Intl API method that returns all values supported by the runtime for a given category — e.g., `Intl.supportedValuesOf("timeZone")` returns every IANA timezone the engine knows.

**Why it matters:** Zerupt's branch creation form needs a timezone picker. Hardcoding a timezone list means it goes stale as IANA updates. Using `Intl.supportedValuesOf("timeZone")` gives the authoritative list for the current runtime, always up to date.

**How it works / Key concepts:**
- `Intl.supportedValuesOf("timeZone")` → `["Africa/Abidjan", "Africa/Accra", ..., "UTC"]`
- Also works for: `"calendar"`, `"collation"`, `"currency"`, `"numberingSystem"`, `"unit"`
- Browser support: all modern browsers (Chrome 99+, Firefox 93+, Safari 15.4+)
- Zerupt uses it to populate a searchable dropdown and validate the submitted value
- The list is computed once on component mount (memoized) — ~400 entries, negligible cost

**Resources:**
- [MDN Intl.supportedValuesOf()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/supportedValuesOf)
