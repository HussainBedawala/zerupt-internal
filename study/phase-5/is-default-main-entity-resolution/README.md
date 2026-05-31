# DEV-351: isDefault — Main Entity Resolution via Partial Unique Index

**Phase:** 5 — Onboarding  
**File touched:** `apps/api/src/modules/onboarding/services/onboarding-complete.service.ts`  
**Schema context:** `packages/db/src/schema/legal-entities.ts`

---

## The Problem with Insertion-Order Lookups

When a table stores multiple rows per tenant and exactly one of them is the "main" record, a common shortcut is:

```sql
SELECT * FROM legal_entities WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1;
```

This is fragile in several ways:

- **Timestamp collisions** — two rows inserted in the same millisecond (e.g., bulk seed scripts) produce a non-deterministic result.
- **Clock skew** — distributed systems or DB replicas can reorder timestamps.
- **Silent drift** — if a later row is inserted with an earlier `created_at` (backfills, migrations, data imports), the "first" row silently changes.
- **No enforcement** — nothing in the schema guarantees only one row is actually the intended default. A bug in a provisioning script could leave zero or two "defaults" without any DB error.

Relying on insertion order conflates "oldest record" with "primary record". These are not the same concept.

---

## The Explicit Boolean Flag Pattern

A dedicated `is_default BOOLEAN` column makes the intent explicit and queryable:

```sql
SELECT * FROM legal_entities WHERE tenant_id = $1 AND is_default = true;
```

This succeeds deterministically because:

1. The column carries **semantic meaning** — it says "this row is the main entity", not "this row happened to be inserted first".
2. The result is the same regardless of insertion order, timestamp precision, or clock drift.
3. It is **enforceable at the DB level** via a partial unique index.

---

## Partial Unique Indexes in Drizzle ORM

A partial unique index applies uniqueness only to rows that satisfy a WHERE predicate. For `is_default`, the predicate is `is_default = true`, which means the index enforces: **at most one row per tenant can have `is_default = true`**.

Drizzle ORM definition:

```ts
// packages/db/src/schema/legal-entities.ts
import { uniqueIndex, boolean, pgTable, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const legalEntities = pgTable(
  'legal_entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    // ...other columns
  },
  (table) => ({
    // Enforces: only one isDefault=true per tenantId
    oneDefaultPerTenant: uniqueIndex('legal_entities_one_default_per_tenant_idx')
      .on(table.tenantId)
      .where(sql`${table.isDefault} = true`),
  }),
);
```

The generated SQL partial index:

```sql
CREATE UNIQUE INDEX legal_entities_one_default_per_tenant_idx
  ON legal_entities (tenant_id)
  WHERE (is_default = true);
```

Rows where `is_default = false` are invisible to the index — a tenant can have any number of non-default entities. The DB raises a unique violation if a second `is_default = true` row is inserted for the same tenant.

---

## Why This Beats a Full Unique Index or Application-Level Guards

| Approach | Enforced by | Race-condition safe |
|---|---|---|
| `ORDER BY created_at LIMIT 1` | Nothing | No |
| Application checks before insert | App code | No (TOCTOU) |
| Full unique index on `(tenant_id, is_default)` | DB | Yes — but allows only one `false` row per tenant too |
| **Partial unique index on `is_default = true`** | **DB** | **Yes — only constrains the true row** |

The partial index is the only option that is both race-condition safe and allows unlimited non-default rows.

---

## Multi-Entity Tenants — Future Readiness

Today every tenant has exactly one legal entity (seeded by `seed-config.step.ts` with `isDefault: true`). The schema already anticipates tenants with multiple entities (e.g., a holding company with subsidiaries):

- The partial unique index allows **many** `is_default = false` rows per tenant.
- Changing which entity is the default requires two operations: set old row to `false`, set new row to `true`. The index enforces at most one true per tenant at any point, making invalid intermediate states a DB error rather than a silent data bug.
- `resolveMainLegalEntityId` finds the default with a single equality filter — no application-level sorting or ranking needed, and no changes required when new entities are added.

The fix in DEV-351 aligns the service lookup with the schema guarantee that was already there from initial design. The schema was right; the query needed to catch up.

---

## Key Takeaways

- **Explicit flags beat implicit ordering** — `is_default = true` is a fact about business meaning; `MIN(created_at)` is an accident of history.
- **Push invariants to the DB** — a partial unique index makes "exactly one default" unbreakable, not a convention held together by discipline.
- **Drizzle partial indexes** use `.where(sql`...`)` on an `uniqueIndex` builder — the predicate accepts any SQL expression.
- **Design for the future row count** — even when today there is one entity per tenant, the schema should not assume that, and the query should not depend on it.
