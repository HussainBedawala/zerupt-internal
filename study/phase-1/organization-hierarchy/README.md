# Phase 1 — Organization Hierarchy: DEV-40

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
