# Multi-Tenancy Foundation — Study Topics

Phase 0 | DEV-24: Design and create Central Admin DB schema | DEV-25: Implement tenant DB provisioning pipeline | DEV-26: Build TenantContextMiddleware (JWT → tenant → DB resolution) | DEV-27: Build TenantConnectionService (pool, LRU cache, eviction)

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

---

## 7. BullMQ Job Queues and Worker Patterns

**What:** BullMQ is a Redis-backed job queue for Node.js. It supports delayed jobs, retries with exponential backoff, rate limiting, concurrency control, and job lifecycle events (`completed`, `failed`, `stalled`).

**Why it matters:** Tenant provisioning is a multi-step, potentially slow operation (creating a database, running migrations). It must happen asynchronously so the signup API returns immediately. BullMQ provides retry semantics — if a step fails, the job retries with exponential backoff rather than losing the tenant's provisioning request.

**Key concepts:**
- **Queue:** Named channel where jobs are added. `tenant-provisioning` in Zerupt.
- **Worker (Processor):** Consumes jobs from the queue. `@Processor(QUEUE_NAME)` in NestJS.
- **Retry config:** `{ attempts: 3, backoff: { type: 'exponential', delay: 5000 } }` → retries at 5s, 10s, 20s.
- **`@OnWorkerEvent("failed")`:** Fires on every failed attempt. Check `attemptsMade` to distinguish intermediate vs final failure.
- **Job ID correlation:** Use the same ID for the DB record and BullMQ job so you can correlate status in both systems.
- **Concurrency:** `@Processor(QUEUE, { concurrency: 2 })` — processes up to 2 jobs in parallel per worker instance.

```ts
// NestJS BullMQ pattern
@Processor('tenant-provisioning', { concurrency: 2 })
export class ProvisioningProcessor extends WorkerHost {
  async process(job: Job<ProvisioningContext>): Promise<void> {
    // Pipeline logic here
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error): void {
    // Handle failure (intermediate or final)
  }
}
```

**Resources:**
- [BullMQ — What is BullMQ](https://docs.bullmq.io/)
- [NestJS — Queues (BullMQ)](https://docs.nestjs.com/techniques/queues)

---

## 8. AES-256-GCM Authenticated Encryption

**What:** AES-256-GCM is an authenticated encryption algorithm. It encrypts data (confidentiality) AND produces an authentication tag (integrity/tamper detection) in a single operation. The "256" means a 256-bit (32-byte) key. The "GCM" (Galois/Counter Mode) provides both encryption and authentication.

**Why it matters:** Tenant database passwords are stored encrypted in the Central Admin DB. If someone gains read access to the admin DB, they should not be able to read tenant passwords. AES-256-GCM ensures both secrecy (can't read the password) and integrity (can't silently modify the ciphertext without detection).

**Key concepts:**
- **IV (Initialization Vector):** 12 bytes, randomly generated per encryption. MUST be unique per key+plaintext pair. Reusing an IV with the same key completely breaks GCM security.
- **Auth Tag:** 16 bytes. Verified during decryption — if the ciphertext or auth tag is tampered with, decryption throws an error instead of returning garbage.
- **Key validation:** Must be exactly 32 bytes (64 hex chars). Shorter keys are insecure, longer keys are invalid for AES-256.
- **Ciphertext format:** `enc:v{keyVersion}:{iv}:{ciphertext}:{authTag}` — self-describing, parseable, versioned.

```ts
// Encrypt
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', keyBuffer, iv);
const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const authTag = cipher.getAuthTag(); // MUST call after final()

// Decrypt
const decipher = createDecipheriv('aes-256-gcm', keyBuffer, iv);
decipher.setAuthTag(authTag); // MUST call before update()
const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
```

**Resources:**
- [NIST SP 800-38D — Recommendation for GCM](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [Node.js — Crypto (createCipheriv)](https://nodejs.org/api/crypto.html#cryptocreatecipherivalgorithm-key-iv-options)

---

## 9. Idempotent Pipeline Design

**What:** An idempotent operation produces the same result whether it runs once or multiple times. In a multi-step pipeline with retries, each step must be idempotent — running it again after a partial failure should not create duplicate data or leave the system in an inconsistent state.

**Why it matters:** The provisioning pipeline retries on failure. If the `CreateDB` step succeeds but `RunMigrations` fails, the retry will re-execute `CreateDB`. Without idempotency, it would try to create the same database again and crash. With idempotency, it detects "already exists" and skips to the next step.

**Key concepts:**
- **Check-then-act:** Query for existing state before creating. `IF NOT EXISTS` in SQL, `findUnique` then skip in application code.
- **Upsert:** `INSERT ... ON CONFLICT DO UPDATE` — atomically creates or updates. Prisma: `prisma.model.upsert()`.
- **PostgreSQL error codes:** `42P04` = database already exists, `42710` = duplicate object. Catch and skip instead of crashing.
- **Step-level resume:** Store which step completed last. On retry, skip completed steps: `PROVISIONING_STEP_ORDER.indexOf(lastCompleted) + 1`.
- **Prisma `migrate deploy`:** Already idempotent — only applies pending migrations, skips already-applied ones.

```ts
// Pattern: catch "already exists" for idempotency
try {
  await client.query(`CREATE DATABASE ${escapedDbName}`);
} catch (error) {
  if (error.code === '42P04') {
    // Already exists — idempotent skip
  } else {
    throw error; // Real error — propagate
  }
}
```

**Resources:**
- [Designing Data-Intensive Applications — Chapter 11 (Idempotence)](https://dataintensive.net/)
- [PostgreSQL — Error Codes](https://www.postgresql.org/docs/current/errcodes-appendix.html)

---

## 10. PostgreSQL Role and Privilege Hardening

**What:** PostgreSQL uses a role-based access control system. Every connection authenticates as a role. Roles can own objects, have privileges granted, and be restricted from creating databases or other roles. The default `PUBLIC` role grants certain privileges to every role automatically.

**Why it matters:** Each tenant gets a dedicated database user. If that user has excessive privileges (e.g., can `CREATE DATABASE` or `CREATE ROLE`), a compromised application credential could escalate to full server compromise. Defense-in-depth means restricting tenant users to the minimum privileges needed.

**Key concepts:**
- **NOCREATEDB:** Prevents the role from creating new databases
- **NOCREATEROLE:** Prevents creating or modifying other roles
- **NOINHERIT:** Role does not automatically inherit privileges from roles it's a member of
- **CONNECTION LIMIT N:** Limits concurrent connections (prevents resource exhaustion)
- **REVOKE CREATE ON SCHEMA public FROM PUBLIC:** The `PUBLIC` pseudo-role has CREATE on `public` schema by default in PostgreSQL ≤13 and some configurations of 14+. This means any authenticated user can create tables. Always revoke this.
- **GRANT on existing vs future tables:** `GRANT ... ON ALL TABLES` grants on tables that exist now. `ALTER DEFAULT PRIVILEGES` grants on tables created in the future. You need both.

```sql
-- Hardened tenant user creation
CREATE USER zerupt_tenant_acme_app
  WITH PASSWORD '...'
  NOCREATEDB NOCREATEROLE NOINHERIT
  CONNECTION LIMIT 20;

-- Revoke dangerous defaults
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE zerupt_tenant_acme FROM PUBLIC;

-- Grant minimal application privileges
GRANT USAGE ON SCHEMA public TO zerupt_tenant_acme_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO zerupt_tenant_acme_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO zerupt_tenant_acme_app;
```

**Resources:**
- [PostgreSQL — GRANT](https://www.postgresql.org/docs/current/sql-grant.html)
- [PostgreSQL — ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html)
- [PostgreSQL — Database Roles](https://www.postgresql.org/docs/current/user-manag.html)

---

## 11. JWKS (JSON Web Key Set) and ES256 JWT Verification

**What:** JWKS is a JSON document containing a set of public keys used to verify JWT signatures. ES256 is an ECDSA signature algorithm using the P-256 (secp256r1) curve with SHA-256. Unlike HS256 (symmetric — shared secret), ES256 is asymmetric: the auth server signs with a private key, and your API verifies with the public key from JWKS.

**Why it matters:** Zerupt uses Supabase Auth, which publishes its signing keys at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`. By verifying against JWKS instead of a shared secret, the API never holds the signing key — it only holds public keys. This is fundamentally more secure: even if the API server is compromised, the attacker cannot forge tokens.

**Key concepts:**
- **JWKS endpoint:** `.well-known/jwks.json` — contains an array of JWK (JSON Web Key) objects with `kty`, `crv`, `x`, `y`, `kid`, `use`
- **Key ID (`kid`):** JWTs include a `kid` in the header. The verifier looks up the matching key in the JWKS. This enables key rotation without downtime.
- **jose library:** The `createRemoteJWKSet()` function auto-fetches and caches the JWKS. `jwtVerify()` validates signature, expiry, issuer, audience.
- **Algorithm pinning:** Always specify `algorithms: ["ES256"]` to prevent algorithm confusion attacks (e.g., attacker sends HS256 token using the public key as the HMAC secret).
- **ES256 vs RS256:** Both are asymmetric. ES256 (ECDSA P-256) produces smaller signatures (~64 bytes vs ~256 for RS256) and is faster to verify. Supabase recommends ES256 for new signing keys.

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

const jwks = createRemoteJWKSet(
  new URL("https://project.supabase.co/auth/v1/.well-known/jwks.json")
);

const { payload } = await jwtVerify(token, jwks, {
  issuer: "https://project.supabase.co/auth/v1",
  audience: "authenticated",
  algorithms: ["ES256"], // CRITICAL: pin the algorithm
});
```

**Resources:**
- [RFC 7517 — JSON Web Key (JWK)](https://datatracker.ietf.org/doc/html/rfc7517)
- [jose — jwtVerify](https://github.com/panva/jose/blob/main/docs/functions/jwt_verify.jwtVerify.md)
- [Supabase — Auth: new signing keys](https://supabase.com/docs/guides/auth/jwts)

---

## 12. AsyncLocalStorage for Request-Scoped Context

**What:** `AsyncLocalStorage` (ALS) is a Node.js API (`node:async_hooks`) that provides a context store that propagates automatically through the async call chain. Unlike thread-local storage in Java, ALS follows the continuation (callbacks, promises, async/await) rather than a specific thread.

**Why it matters:** In a multi-tenant NestJS API, every request needs to know which tenant it belongs to. Passing `tenantContext` through every function parameter is invasive. ALS lets you store the context once (in middleware/guard) and read it from anywhere in the call chain — services, repositories, interceptors — without prop drilling.

**Key concepts:**
- **`run(store, callback)`:** Creates a new async scope. Everything inside `callback` (and its continuations) can access `store` via `getStore()`.
- **`enterWith(store)`:** Replaces the current scope's store. Useful in guards (which run inside a `run()` boundary set by middleware). The store persists for all subsequent async continuations within the same scope.
- **Isolation:** Each `run()` creates an isolated scope. Concurrent requests each have their own scope — Request A's context is invisible to Request B.
- **Pattern:** Middleware calls `run()` to create the boundary. Guard calls `enterWith()` to populate the context. Services call `getStore()` to read it.

```ts
// Middleware — create the ALS boundary
tenantStore.run(undefined as never, next);

// Guard — populate the context
tenantStore.enterWith({ tenantId, userId, email, databaseUrl });

// Service — read the context
const ctx = tenantStore.getStore();
if (!ctx) throw new Error("Not in tenant scope");
```

**Resources:**
- [Node.js — AsyncLocalStorage](https://nodejs.org/api/async_context.html#class-asynclocalstorage)
- [NestJS — Execution Context](https://docs.nestjs.com/fundamentals/execution-context)

---

## 13. NestJS Guard Execution Order and APP_GUARD

**What:** NestJS guards (`CanActivate`) run before route handlers. When registered as `APP_GUARD` via `{ provide: APP_GUARD, useClass: MyGuard }`, they apply globally to every route. The execution order of multiple APP_GUARDs follows the module import order in `AppModule`.

**Why it matters:** Zerupt has two global guards: `JwtAuthGuard` (validates JWT) and `TenantResolverGuard` (resolves tenant DB). The tenant guard depends on `request.user` being populated by the JWT guard. If the import order is wrong, the tenant guard runs first and fails because there's no JWT payload.

**Key concepts:**
- **Module import order = guard execution order.** `imports: [AuthModule, TenantModule]` means JWT guard runs first.
- **Middleware vs Guard:** Middleware runs before guards. The `TenantContextMiddleware` establishes the ALS boundary, then guards populate it.
- **`@Public()` decorator:** Custom decorator using `SetMetadata`. Both guards check for it and skip their logic, allowing unauthenticated endpoints (health checks, webhooks).
- **Request lifecycle:** `Middleware → Guards → Interceptors (pre) → Pipes → Handler → Interceptors (post) → Exception filters`

```ts
// AppModule — order matters
@Module({
  imports: [
    AuthModule,       // JwtAuthGuard registered as APP_GUARD here
    TenantModule,     // TenantResolverGuard registered as APP_GUARD here
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes("*");
  }
}
```

**Resources:**
- [NestJS — Guards](https://docs.nestjs.com/guards)
- [NestJS — Middleware](https://docs.nestjs.com/middleware)

---

## 14. Supabase New API Keys (Publishable vs Secret)

**What:** Supabase is transitioning from legacy API keys (`anon` / `service_role`) to a new key format: `sb_publishable_...` (replaces anon) and `sb_secret_...` (replaces service_role). The new keys are tied to the new JWT signing keys and are functionally equivalent but use the updated key infrastructure.

**Why it matters:** Zerupt migrated to the new key format during DEV-26. The publishable key is safe to expose in client-side code (browser, mobile). The secret key has full admin access and must never be exposed. Using the new keys ensures compatibility with ES256 JWT signing and Supabase's evolving security model.

**Key concepts:**
- **Publishable key (`sb_publishable_...`):** Used by the frontend (Next.js). Embeds the `anon` role. Subject to RLS policies. Safe for client-side use.
- **Secret key (`sb_secret_...`):** Used by the backend only. Bypasses all RLS. Has `service_role` privileges. Never expose in client code.
- **JWT connection:** New keys are signed with the new JWT signing key (ES256). Old keys were signed with the legacy JWT secret (HS256).
- **Migration:** Rename env vars (`SUPABASE_ANON_KEY` → `SUPABASE_PUBLISHABLE_KEY`, etc.) and update Railway/Vercel env vars.

**Resources:**
- [Supabase — API Keys](https://supabase.com/docs/guides/api/api-keys)

---

## 15. LRU Cache Design for Connection Pooling

**What:** An LRU (Least Recently Used) cache evicts the entry that hasn't been accessed for the longest time when the cache reaches capacity. In JavaScript, `Map` preserves insertion order — delete+re-insert on access moves an entry to the "most recently used" position. The first key in iteration order is always the LRU candidate.

**Why it matters:** Zerupt creates a PrismaClient per tenant database URL. Without eviction, memory grows unbounded as tenants accumulate. An LRU cache bounds memory at `maxPoolSize` clients while keeping hot tenants (frequent requests) cached and evicting cold tenants.

**Key concepts:**
- **Map insertion order:** JavaScript `Map` iterates in insertion order. `map.keys().next().value` returns the oldest (LRU) key.
- **Access refresh:** On cache hit, delete the entry and re-insert it — this moves it to the end (most recently used).
- **Concurrent dedup:** Use a `pending` Map of in-flight creation promises to prevent duplicate PrismaClient creation when two requests arrive simultaneously for the same uncached tenant.
- **Stale detection:** Track `lastAccessedAt` per entry. After a configurable timeout, health-check the connection (`SELECT 1`) before returning it. Evict and recreate if the check fails.
- **Graceful shutdown:** On app shutdown, iterate all pool entries and call `$disconnect()` on each. Drain in-flight creations first with `Promise.allSettled()`.

```ts
// LRU refresh — delete + re-insert moves to end of Map
const existing = pool.get(key);
pool.delete(key);
pool.set(key, { ...existing, lastAccessedAt: Date.now() });

// LRU eviction — first key is oldest
const lruKey = pool.keys().next().value;
pool.delete(lruKey);
await client.$disconnect();
```

**Resources:**
- [MDN — Map iteration order](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map#description)
- [Wikipedia — Cache replacement policies](https://en.wikipedia.org/wiki/Cache_replacement_policies#Least_recently_used_(LRU))

---

## 16. Prisma Dynamic Datasource URL

**What:** Prisma supports overriding the database URL at runtime by passing `datasources: { db: { url } }` to the `PrismaClient` constructor. This creates a client connected to a specific database rather than the one in the schema's `env("DATABASE_URL")`.

**Why it matters:** In a per-tenant database architecture, each request targets a different database. The `TenantConnectionService` creates `PrismaClient` instances dynamically with the tenant's database URL. Without this feature, you'd need a separate Prisma schema per tenant or resort to raw SQL.

**Key concepts:**
- The `datasources` option overrides the `url` in `schema.prisma`'s `datasource db` block
- Prisma lazy-connects on first query (no `$connect()` needed upfront)
- Each `PrismaClient` instance maintains its own connection pool (default 5 connections via `connection_limit` in the URL)
- `$disconnect()` must be called to release connections — otherwise they leak until process exit

```ts
import { PrismaClient } from "@zerupt/db";

const client = new PrismaClient({
  datasources: {
    db: { url: "postgresql://user:pass@host:5432/tenant_acme" },
  },
});

// Use the client...
await client.tenantIdentity.findFirst();

// Clean up
await client.$disconnect();
```

**Resources:**
- [Prisma — Programmatically override a datasource URL](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections#programmatically-override-a-datasource-url)
- [Prisma — Connection management](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections)
