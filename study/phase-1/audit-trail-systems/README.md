## 1. Append-Only Audit Logs

**What:** An immutable record of every data mutation in the system — who changed what, when, and from what state.

**Why it matters:** Zerupt targets regulated retail markets (MENA, India, SEA). Tax authorities and auditors require a tamper-proof trail of financial transactions. An append-only audit log (no UPDATE, no DELETE) provides that guarantee at the database level.

**How it works / Key concepts:**
- The `audit_log` table has no UPDATE or DELETE operations exposed via the service layer
- Every mutation triggers the `AuditLogInterceptor` which captures the response body as the "after" snapshot
- The service uses fire-and-forget semantics — audit failures are logged but never block business operations
- Prisma's `$transaction` pipelines `findMany` + `count` into a single DB round-trip for read performance

**Resources:**
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [PostgreSQL Append-Only Tables](https://www.postgresql.org/docs/current/rules-update.html)

## 2. PostgreSQL Trigram Search (pg_trgm)

**What:** A PostgreSQL extension that enables efficient substring matching using trigram decomposition and GIN indexes.

**Why it matters:** The audit log viewer needs `ILIKE '%search%'` across entity_type, entity_id, and user_email. Without an index, this causes a full table scan. With pg_trgm + a GIN index, PostgreSQL decomposes the search term into 3-character trigrams and uses the index to find matching rows in O(log n).

**How it works / Key concepts:**
```sql
-- Enable the extension (available by default on Neon)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create a GIN index on a concatenated expression
CREATE INDEX audit_log_search_trgm_idx
  ON audit_log USING GIN (
    (entity_type || ' ' || entity_id || ' ' || user_email) gin_trgm_ops
  );
```
- Trigrams for "Widget" = {"  W", " Wi", "Wid", "idg", "dge", "get", "et "}
- The GIN index maps each trigram to the rows that contain it
- On query, PostgreSQL intersects the trigram sets to find matches
- Works with `ILIKE`, `LIKE`, `~`, and similarity operators

**Resources:**
- [PostgreSQL pg_trgm docs](https://www.postgresql.org/docs/current/pgtrgm.html)
- [Neon Extensions](https://neon.tech/docs/extensions/pg_trgm)

## 3. Composite Index Design for Time-Series Filters

**What:** Multi-column indexes ordered to match the most common query patterns, with the time column sorted descending.

**Why it matters:** Audit logs are always queried with a time component (newest first). A single-column index on `created_at` works, but when combined with filters like `user_id` or `entity_type`, PostgreSQL must choose one index and filter the rest in memory. A composite index like `(user_id, created_at DESC)` serves both the filter and sort in a single index scan.

**How it works / Key concepts:**
```prisma
// In schema.prisma — Prisma supports sort direction in indexes
@@index([userId, createdAt(sort: Desc)])
@@index([entityType, createdAt(sort: Desc)])
@@index([entityType, action, createdAt(sort: Desc)])
```
- Put the equality filter column(s) first, range/sort column last
- `DESC` on `created_at` matches the default sort order (newest first)
- PostgreSQL can do an index-only backward scan if the sort matches
- Three indexes cover the four most common filter combos

**Resources:**
- [Use The Index, Luke — Partial Indexes](https://use-the-index-luke.com/sql/where-clause/partial-and-filtered-indexes)
- [PostgreSQL Multi-Column Indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html)

## 4. Offset vs Cursor Pagination Trade-offs

**What:** Two strategies for paginating large result sets — offset-based (`SKIP N TAKE M`) vs cursor-based (`WHERE id > $last ORDER BY id LIMIT M`).

**Why it matters:** Zerupt's audit log can grow to millions of rows per tenant. Offset pagination degrades linearly — page 1000 requires PostgreSQL to scan and discard 25,000 rows. Cursor pagination is O(1) regardless of page depth because it seeks directly to the cursor position via an index.

**How it works / Key concepts:**
- **Offset (current):** Simple, supports "jump to page 42", but slow at depth. Mitigated by capping `page` at 1,000.
- **Cursor (future):** Uses `(created_at, id)` as a composite cursor. Client sends `?cursor=2026-03-16T12:00:00Z_uuid&limit=25`. Server does `WHERE (created_at, id) < ($cursor_ts, $cursor_id)`. Requires the `(tenant_id, created_at)` index.
- Trade-off: cursor doesn't support "jump to page N" — only next/previous. Fine for audit logs (users scroll sequentially), but not for reports where page jumps are common.

**Resources:**
- [Prisma Pagination Docs](https://www.prisma.io/docs/orm/prisma-client/queries/pagination)
- [Slack Engineering — Evolving API Pagination](https://slack.engineering/evolving-api-pagination-at-slack/)
