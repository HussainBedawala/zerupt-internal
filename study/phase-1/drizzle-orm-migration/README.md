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
