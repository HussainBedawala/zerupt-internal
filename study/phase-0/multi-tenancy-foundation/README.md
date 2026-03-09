# Multi-Tenancy Foundation — Study Topics

Phase 0 | DEV-24: Design and create Central Admin DB schema

---

## 1. Multi-Tenant Database Architectures

**What:** The three main approaches to multi-tenancy in databases: shared database with shared schema (RLS), shared database with separate schemas, and dedicated database per tenant.

**Why it matters:** Zerupt uses dedicated-database-per-tenant, which is the strongest isolation model. Understanding the tradeoffs helps justify why this approach was chosen over row-level security (RLS) — and what operational costs it introduces (connection management, batch migrations, provisioning pipeline).

**Key concepts:**
- **Shared DB + RLS:** Cheapest, easiest to manage, but cross-tenant data leakage is possible via policy bugs. PostgreSQL RLS policies add latency to every query. One bad query can affect all tenants.
- **Shared DB + Separate Schemas:** Middle ground. Schema-level isolation but shared resources. Migration complexity grows linearly with tenants.
- **Dedicated DB per Tenant:** Physical isolation makes cross-tenant leakage architecturally impossible. Independent scaling, backups, and compliance. But requires connection pooling strategy, batch migration tooling, and a provisioning pipeline.

**Resources:**
- [Prisma — Multi-tenancy](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections#multi-tenancy)
- [AWS — SaaS Tenant Isolation Strategies](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/tenant-isolation.html)

---

## 2. TIMESTAMP vs TIMESTAMPTZ in PostgreSQL

**What:** PostgreSQL has two timestamp types: `TIMESTAMP` (without timezone) and `TIMESTAMPTZ` (with timezone). Despite the name, `TIMESTAMPTZ` does NOT store a timezone — it converts to UTC on write and converts back to the session timezone on read.

**Why it matters:** Zerupt serves MENA, India, and Southeast Asia — users in different timezones. Using `TIMESTAMP` (without timezone) means the stored value is ambiguous: is "2026-03-10 14:00:00" in UTC, IST, or GST? Trial expiry dates, billing period ends, and audit timestamps would silently produce wrong results if the app server, database, or webhook sender uses a different timezone.

**Key concepts:**
- `TIMESTAMPTZ` always stores in UTC internally
- On read, PostgreSQL converts to the session's `timezone` setting
- Prisma maps `DateTime` to `TIMESTAMP(3)` by default — you must add `@db.Timestamptz` to override
- Best practice: always use `TIMESTAMPTZ` and always work in UTC in application code

```sql
-- These are equivalent when session timezone is UTC:
SELECT '2026-03-10 14:00:00+05:30'::timestamptz;
-- Result: 2026-03-10 08:30:00+00 (converted to UTC)

SET timezone = 'Asia/Kolkata';
SELECT '2026-03-10 08:30:00+00'::timestamptz;
-- Result: 2026-03-10 14:00:00+05:30 (displayed in IST)
```

**Resources:**
- [PostgreSQL — Date/Time Types](https://www.postgresql.org/docs/current/datatype-datetime.html)
- [Don't Do This — PostgreSQL wiki (timestamp without timezone)](https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_timestamp_.28without_time_zone.29)

---

## 3. Prisma Schema Design Patterns

**What:** Prisma uses a declarative schema language (PSL) to define models, relations, enums, and indexes. The schema generates both the TypeScript client and SQL migrations.

**Why it matters:** The Central Admin DB schema uses several Prisma patterns that you'll reuse across the tenant DB schema and future models: `@map` for column naming, `@db.Timestamptz` for type overrides, composite primary keys (`@@id`), and enum mapping.

**Key concepts:**

```prisma
// @map — control the database column name while keeping camelCase in TypeScript
model Tenant {
  planId String @map("plan_id") @db.Uuid
  // TypeScript: tenant.planId
  // PostgreSQL: SELECT plan_id FROM tenants
}

// @@map — control the table name
model UserTenantMap {
  @@map("user_tenant_map")
}

// Composite primary key
model UserTenantMap {
  userId   String @db.Uuid
  tenantId String @db.Uuid
  @@id([userId, tenantId])
}

// Enum with database mapping
enum TenantStatus {
  PendingProvisioning @map("pending_provisioning")
  @@map("tenant_status")
}

// Relation with cascade delete
model TenantDatabase {
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}
```

**Resources:**
- [Prisma Schema Reference](https://www.prisma.io/docs/orm/reference/prisma-schema-reference)
- [Prisma — Indexes](https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes)

---

## 4. Encryption Key Versioning

**What:** When encrypting sensitive data at rest (like database passwords), the encryption key must eventually be rotated. Key versioning stores which key version encrypted each value, so the application knows which key to use for decryption.

**Why it matters:** The `tenant_databases.db_password_enc` column stores encrypted database passwords. Without a `key_version` column, rotating the encryption key would require decrypting and re-encrypting every row in a single migration — risky and slow. With key versioning, you can rotate gradually: new writes use the new key, old values are re-encrypted lazily or in a background job.

**Key concepts:**
- Store a `key_version` integer alongside every encrypted value
- Application reads `key_version`, looks up the corresponding key (e.g. `DB_ENCRYPTION_KEY_V1`, `DB_ENCRYPTION_KEY_V2`)
- Envelope encryption: use a data encryption key (DEK) per row, encrypted by a key encryption key (KEK) from a key management service
- Ciphertext format prefix (e.g. `enc:v1:base64data`) provides an additional safety net — plaintext values are immediately detectable

**Resources:**
- [AWS — Envelope Encryption](https://docs.aws.amazon.com/kms/latest/developerguide/concepts.html#enveloping)
- [OWASP — Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

---

## 5. Foreign Key CASCADE vs RESTRICT Behaviors

**What:** PostgreSQL foreign key constraints support several referential actions: `RESTRICT` (block the delete), `CASCADE` (delete child rows too), `SET NULL`, `SET DEFAULT`, and `NO ACTION`.

**Why it matters:** The Central Admin DB uses different behaviors for different relationships. Getting this wrong means either orphaned data (missing RESTRICT) or blocked operations (over-restricting).

**Key concepts:**

| Behavior | Effect on child rows | When to use |
|----------|---------------------|-------------|
| `RESTRICT` | Block parent delete if children exist | Billing/financial records that must be retained |
| `CASCADE` | Delete children when parent is deleted | Dependent records meaningless without parent |
| `SET NULL` | Set FK to NULL when parent is deleted | Optional relationships |
| `NO ACTION` | Like RESTRICT but checked at end of transaction | When you need deferred constraint checking |

Zerupt's choices:
- `tenant_databases` → `CASCADE` (DB record is meaningless without the tenant)
- `user_tenant_map` → `CASCADE` (membership mapping is meaningless without the tenant)
- `subscriptions` → `RESTRICT` (billing records must be retained for accounting/legal)
- `provisioning_jobs` → `RESTRICT` (audit history should not be silently deleted)

**Resources:**
- [PostgreSQL — Foreign Key Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK)
- [Prisma — Referential Actions](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/referential-actions)

---

## 6. Central Admin DB vs Tenant DB — Data Boundary Design

**What:** In a dedicated-DB-per-tenant architecture, you must carefully decide what data lives in the central platform database vs each tenant's database. Getting this boundary wrong creates coupling, performance, or security issues.

**Why it matters:** Zerupt's `tenants` table in the Central Admin DB is intentionally lean (id, code, name, status, billing state, owner). The rich tenant entity (trading name, tax registration, industry, inventory concept, onboarding state) lives in the tenant's own DB. This split determines what the platform can query globally vs what requires connecting to a specific tenant DB.

**Key concepts:**
- **Central Admin DB:** Platform metadata only — who are the tenants, where are their databases, what's their billing state, which users belong to which tenants
- **Tenant DB:** All business data — the tenant's own view of themselves, their customers, inventory, transactions, audit logs
- **Denormalization tradeoff:** `tenants.subscription_status` is duplicated from `subscriptions.status` for routing performance (avoids a JOIN on every request). This requires transactional sync in the billing webhook handler.
- **The login flow query:** `SELECT * FROM user_tenant_map WHERE user_id = $1` → returns all tenants a user belongs to → user picks one → `SELECT * FROM tenant_databases WHERE tenant_id = $1` → route to that DB

**Resources:**
- [Microsoft — Multi-tenant SaaS database tenancy patterns](https://learn.microsoft.com/en-us/azure/azure-sql/database/saas-tenancy-app-design-patterns)
