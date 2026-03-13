# Multi-Entity Architecture — DEV-195

## 1. Partial Unique Indexes in PostgreSQL

**What:** A unique index that only enforces uniqueness for rows matching a `WHERE` predicate.

**Why it matters:** Zerupt uses this to guarantee exactly one default legal entity per tenant. A regular unique index on `(tenant_id, is_default)` would prevent having multiple non-default entities. The partial index only constrains rows where `is_default = true`.

**How it works:**
```sql
CREATE UNIQUE INDEX legal_entities_one_default_per_tenant
  ON legal_entities (tenant_id)
  WHERE (is_default = true);
```
- PostgreSQL only indexes rows where the predicate is true
- Two rows with `is_default = false` for the same tenant: allowed
- Two rows with `is_default = true` for the same tenant: rejected
- Swapping the default requires clearing the old one first (within a transaction)

**Prisma syntax:**
```prisma
@@unique([tenantId], where: raw("\"is_default\" = true"))
```
Requires `previewFeatures = ["partialIndexes"]` in the generator block.

**Resources:**
- [PostgreSQL Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
- [Prisma Partial Indexes](https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes#partial-indexes)

## 2. Data Migration with Non-Nullable FK Addition

**What:** Adding a required (NOT NULL) foreign key column to an existing table that already has rows.

**Why it matters:** If you add a NOT NULL column without a default, the migration fails on any table with existing data. This pattern comes up every time you introduce a new parent entity (like LegalEntity) that existing children (branches) must reference.

**How it works:**
```sql
-- Step 1: Add column as NULLABLE
ALTER TABLE branches ADD COLUMN legal_entity_id UUID;

-- Step 2: Backfill from known data
UPDATE branches b
SET legal_entity_id = le.id
FROM legal_entities le
WHERE le.tenant_id = b.tenant_id AND le.is_default = true;

-- Step 3: Now enforce NOT NULL
ALTER TABLE branches ALTER COLUMN legal_entity_id SET NOT NULL;

-- Step 4: Add FK constraint
ALTER TABLE branches ADD CONSTRAINT branches_legal_entity_id_fkey
  FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id)
  ON DELETE RESTRICT;
```

**Key insight:** Prisma generates the column as NOT NULL in one step. You must use `--create-only` to generate the migration, then hand-edit the SQL to split it into the 4-step pattern above.

**Resources:**
- [Prisma Migrate: Customizing Migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations)

## 3. CHECK Constraints for Domain Validation

**What:** Database-level constraints that validate column values beyond type/length (e.g., regex patterns, non-empty strings).

**Why it matters:** Application-level validation can be bypassed (direct DB access, migrations, seeds). CHECK constraints are defense-in-depth — they guarantee data integrity regardless of how data enters the database.

**How it works:**
```sql
ALTER TABLE legal_entities
  ADD CONSTRAINT legal_entities_code_format
    CHECK (code ~ '^[a-z0-9][a-z0-9_-]*$'),
  ADD CONSTRAINT legal_entities_country_code_format
    CHECK (country_code ~ '^[A-Z]{2}$');
```

**Key insight:** Prisma doesn't generate CHECK constraints — you must add them manually in the migration SQL. They survive schema changes as long as you don't drop/recreate the table.

**Resources:**
- [PostgreSQL CHECK Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS)

## 4. Immutability Patterns in Financial Systems

**What:** Certain fields become immutable after a business event (e.g., first posted journal entry), not at creation time.

**Why it matters:** In Zerupt, `functionalCurrency` and `countryCode` on a legal entity can be changed freely during setup. But once the accounting engine posts the first journal entry, these fields lock permanently — changing them would invalidate all posted financial data.

**How it works:**
- `functionalCurrencyLockedAt` is `NULL` initially
- Accounting engine sets it to `NOW()` when posting the first JE
- Settings module checks: if `functionalCurrencyLockedAt IS NOT NULL`, reject updates to `functionalCurrency` and `countryCode`
- The lock is a timestamp (not a boolean) for audit trail — you know exactly when it locked

**Pattern name:** "Soft immutability" or "event-driven field locking" — the field is mutable until a domain event makes it immutable.

## 5. Shadow Database in Prisma Migrate

**What:** A temporary database that Prisma uses to validate that all migrations can replay from scratch.

**Why it matters:** Without a shadow DB, `prisma migrate dev` tries to auto-create one (needs DB superuser privileges) or fails. In Docker-based dev setups, you should pre-create it.

**How it works:**
- Prisma drops the shadow DB, recreates it, replays all migrations in order
- If any migration fails on the shadow DB, Prisma reports the error before touching your real DB
- Configured via `shadowDatabaseUrl` in `prisma.config.ts` or `SHADOW_DATABASE_URL` env var

**Resources:**
- [Prisma Shadow Database](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database)
