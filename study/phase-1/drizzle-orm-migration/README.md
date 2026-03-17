# Drizzle ORM Migration (from Prisma)

Study topics from DEV-225: Replace Prisma schemas with Drizzle table definitions.

---

## 1. Drizzle ORM Schema-as-Code

**What:** Drizzle defines database schemas as plain TypeScript objects using `pgTable()`, `pgEnum()`, and helper functions — no codegen step required.

**Why it matters:** Unlike Prisma (which uses a `.prisma` DSL and generates a client), Drizzle schemas are just TypeScript. This means your IDE understands them natively, types are inferred directly from table definitions via `$inferSelect`/`$inferInsert`, and there's no build step between schema changes and type availability.

**Key concepts:**
```typescript
// Drizzle: schema IS the type system
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
});
type User = typeof users.$inferSelect; // { id: string; name: string }

// Prisma: schema generates types
// model User { id String @id @default(uuid()) }
// → prisma generate → @prisma/client types
```

**Resources:**
- [Drizzle ORM docs — PostgreSQL schema](https://orm.drizzle.team/docs/sql-schema-declaration)
- [Drizzle vs Prisma comparison](https://orm.drizzle.team/docs/prisma)

---

## 2. Foreign Key References in Drizzle

**What:** Drizzle separates two concerns: `.references()` (creates real FK constraints in DDL) and `relations()` (ORM-level query helpers). You need both.

**Why it matters:** `relations()` alone generates zero DDL — the database has no FK constraints. Without `.references()`, deleting a parent row silently orphans child rows. This was the critical review finding in DEV-225.

**How it works:**
```typescript
// Creates actual FK in PostgreSQL DDL
roleId: uuid("role_id")
  .notNull()
  .references(() => roles.id, { onDelete: "cascade" }),

// ORM-level only — enables db.query.rolePermissions.findMany({ with: { role: true } })
export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
}));
```

**Resources:**
- [Drizzle docs — Foreign keys](https://orm.drizzle.team/docs/indexes-constraints#foreign-key)
- [Drizzle docs — Relations](https://orm.drizzle.team/docs/rqb)

---

## 3. Partial Unique Indexes and CHECK Constraints

**What:** PostgreSQL supports indexes with `WHERE` clauses (partial indexes) and column-level `CHECK` constraints. Drizzle supports both natively.

**Why it matters:** Zerupt uses partial unique indexes extensively for "exactly one default per tenant" patterns (legal entities, tax groups, document sequences). CHECK constraints enforce domain rules (fiscal month 1-12, tax rate 0-100) at the database level.

**How it works:**
```typescript
// Partial unique index: one default legal entity per tenant
uniqueIndex("legal_entities_one_default_per_tenant")
  .on(table.tenantId)
  .where(sql`"is_default" = true`),

// CHECK constraint: fiscal year start month must be 1-12
check("fiscal_settings_start_month_check",
  sql`${table.fiscalYearStartMonth} >= 1 AND ${table.fiscalYearStartMonth} <= 12`),
```

**Resources:**
- [PostgreSQL partial indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
- [Drizzle docs — Indexes and constraints](https://orm.drizzle.team/docs/indexes-constraints)

---

## 4. Drizzle-Kit Migration Tooling

**What:** `drizzle-kit` is the CLI companion for schema management — generates SQL migrations from schema diffs, applies them, introspects existing databases, and validates schema-DB consistency.

**Why it matters:** Unlike Prisma Migrate (which manages migration state in a `_prisma_migrations` table), Drizzle-Kit generates plain SQL files that you can hand-edit. The `pull` command enables adopting Drizzle on an existing database by introspecting the current schema.

**Key commands:**
```bash
drizzle-kit generate  # Diff schema vs last migration → new SQL file
drizzle-kit migrate   # Apply pending migrations
drizzle-kit push      # Push schema directly to DB (dev only, skips migration files)
drizzle-kit pull      # Introspect DB → generate Drizzle schema
drizzle-kit check     # Validate schema matches live DB
drizzle-kit studio    # Web-based DB browser
```

**Resources:**
- [Drizzle-Kit overview](https://orm.drizzle.team/docs/kit-overview)
- [Drizzle-Kit config](https://orm.drizzle.team/docs/drizzle-config-file)

---

## 5. `$onUpdate` vs Database Triggers for `updatedAt`

**What:** Prisma's `@updatedAt` automatically sets a timestamp on every update. Drizzle has no built-in equivalent — you use `.$onUpdate(() => new Date())` which runs at the ORM layer, or a PostgreSQL trigger for DB-level enforcement.

**Why it matters:** ORM-level `$onUpdate` only works when updates go through Drizzle. Raw SQL updates, migration scripts, or other tools bypassing the ORM won't trigger it. For defense-in-depth, consider adding a DB trigger for critical tables (like audit_log).

**How it works:**
```typescript
// ORM-level (current approach)
updatedAt: timestamp("updated_at", { withTimezone: true })
  .defaultNow()
  .notNull()
  .$onUpdate(() => new Date()),

// DB-level trigger (future hardening)
// CREATE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
// BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
// CREATE TRIGGER set_updated_at BEFORE UPDATE ON table_name
//   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Resources:**
- [Drizzle docs — $onUpdate](https://orm.drizzle.team/docs/sql-schema-declaration#on-update)
- [PostgreSQL trigger functions](https://www.postgresql.org/docs/current/plpgsql-trigger.html)

---

## 6. Drizzle Query Builder vs Prisma Client

**What:** Drizzle's query builder uses a SQL-like fluent API (`db.select().from().where()`) and a relational query API (`db.query.table.findMany()`). Prisma uses a model-centric API (`prisma.model.findMany()`).

**Why it matters:** Drizzle's SQL-like API maps 1:1 to the SQL it generates — you can predict the query by reading the code. Prisma abstracts the SQL, which can lead to unexpected N+1 queries or inefficient joins. For a solo founder, predictable SQL = easier debugging.

**Key patterns:**
```typescript
// Prisma: model-centric, hides SQL
const users = await prisma.user.findMany({
  where: { tenantId },
  include: { role: true },
});

// Drizzle SQL-like: explicit joins
const users = await db
  .select()
  .from(usersTable)
  .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
  .where(eq(usersTable.tenantId, tenantId));

// Drizzle relational: Prisma-like convenience
const users = await db.query.users.findMany({
  where: eq(usersTable.tenantId, tenantId),
  with: { role: true },
});
```

**Resources:**
- [Drizzle — Select query](https://orm.drizzle.team/docs/select)
- [Drizzle — Relational queries](https://orm.drizzle.team/docs/rqb)

---

## 7. Mocking Drizzle in Unit Tests

**What:** Drizzle's query builder returns chainable objects (`select → from → where → execute`). Mocking requires setting up each chain method to return the mock object, with the final method resolving to test data.

**Why it matters:** Prisma's flat API (`prisma.model.findMany()`) is trivial to mock. Drizzle's chainable API needs mock factories that return `{ from: () => ({ where: () => ({ ...}) }) }`. Getting this wrong causes cryptic "X is not a function" errors.

**Key pattern:**
```typescript
// Mock factory for select chains
function makeSelectChain<T>(data: T[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    then: jest.fn((resolve) => resolve(data)),
  };
  return chain;
}

// Usage in test
const mockDb = { select: jest.fn(() => makeSelectChain(testData)) };
```

**Resources:**
- [Jest mock functions](https://jestjs.io/docs/mock-functions)
- [Drizzle testing patterns (community)](https://github.com/drizzle-team/drizzle-orm/discussions/1591)

---

## 8. CI Without Code Generation

**What:** Prisma requires a `prisma generate` step in CI before builds/tests (it generates the client library). Drizzle has no codegen — types are inferred directly from TypeScript schema files.

**Why it matters:** Removing the generate step simplifies CI pipelines, eliminates a class of "forgot to regenerate" bugs, and speeds up builds. The `db:generate` script in Drizzle means generating migration SQL files (committed to git), not runtime code.

**Resources:**
- [Drizzle-Kit generate](https://orm.drizzle.team/docs/drizzle-kit-generate)
