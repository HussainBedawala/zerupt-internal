# Multi-Tenancy Foundation — Study Topics

Phase 0 | DEV-24: Central Admin DB schema | DEV-25: Tenant DB provisioning | DEV-26: TenantContextMiddleware | DEV-27: TenantConnectionService | DEV-28: Redis tenant cache | DEV-29: Audit trail spine | DEV-30: Supabase Auth JWT | DEV-122/123/124: Security verification | DEV-118: Duplicate-job guard | DEV-119: Timezone map | DEV-120: Config-driven key rotation | DEV-121: PII minimization | DEV-135: HMAC cache integrity | DEV-136: Configurable TTL

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

---

## 17. Cache-Aside (Lazy Loading) Pattern

**What:** A caching strategy where the application checks the cache first, falls back to the primary data source on a miss, and populates the cache with the fetched data. The cache is a read-through layer — it's never written to by the data source directly.

**Why it matters:** Zerupt's `TenantResolverGuard` runs on every authenticated request, looking up tenant DB connection metadata from the Central Admin DB. Without caching, that's one DB query per request just for routing. Cache-aside with a 5-minute TTL means most requests skip the Admin DB entirely, reducing latency and load. The pattern also supports graceful degradation — if Redis is down, the app falls through to the DB and continues working.

**Key concepts:**
- **Cache hit:** Return cached value, skip the primary source
- **Cache miss:** Query primary source, store result in cache with TTL, return to caller
- **TTL expiry:** Entries automatically expire — provides an upper bound on staleness without active invalidation
- **Explicit invalidation:** For immediate consistency (e.g., tenant suspension), delete the cache key so the next request goes to the source
- **Fire-and-forget writes:** Cache `set()` after a DB read doesn't need to block the response — use `void` to avoid adding latency
- **Graceful degradation:** Wrap all cache operations in try/catch. A dead cache means every request hits the DB — slower but correct.

```ts
async function getWithCache(key: string): Promise<Data> {
  // 1. Try cache
  const cached = await cache.get(key);
  if (cached) return cached;

  // 2. Cache miss — go to source
  const data = await database.find(key);

  // 3. Populate cache (fire-and-forget)
  void cache.set(key, data, { ex: 300 });

  return data;
}
```

**Resources:**
- [AWS — Caching Strategies (Lazy Loading)](https://docs.aws.amazon.com/AmazonElastiCache/latest/mem-ug/Strategies.html#Strategies.LazyLoading)
- [Microsoft — Cache-Aside Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside)

---

## 18. Upstash Redis (HTTP/REST-Based Redis Client)

**What:** Upstash Redis is a serverless Redis service accessed via HTTP REST API rather than TCP connections. The `@upstash/redis` TypeScript SDK sends commands as HTTP requests — no persistent connection needed.

**Why it matters:** Traditional Redis clients (like ioredis) use long-lived TCP connections, which can be problematic in serverless environments (cold starts, connection limits). Upstash's HTTP approach works everywhere — Vercel Edge, Cloudflare Workers, Lambda, and standard Node.js. For Zerupt, it means the tenant connection cache works identically in Railway (long-running) and any future edge deployment.

**Key concepts:**
- **Connectionless:** Each command is an independent HTTP request. No connection pool to manage.
- **`Redis.fromEnv()`:** Reads `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from environment
- **Auto-serialization:** Objects are JSON-serialized on `set()` and deserialized on `get<T>()` — no manual `JSON.parse()`
- **TTL:** `redis.set(key, value, { ex: seconds })` — same semantics as Redis `SET key value EX seconds`
- **Trade-off:** Higher per-command latency than TCP (~1-5ms HTTP overhead vs ~0.1ms TCP), but eliminates connection management complexity

```ts
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: "https://your-redis.upstash.io",
  token: "your-token",
});

// Objects auto-serialized
await redis.set("key", { foo: "bar" }, { ex: 300 });
const data = await redis.get<{ foo: string }>("key");
// data = { foo: "bar" } — already parsed
```

**Resources:**
- [Upstash Redis — Getting Started](https://upstash.com/docs/redis/overall/getstarted)
- [Upstash Redis JS SDK](https://github.com/upstash/redis-js)

---

## 19. NestJS Optional Dependency Injection (@Optional)

**What:** The `@Optional()` decorator in NestJS marks a constructor dependency as optional. If the provider resolves to `null` or is not registered, NestJS injects `undefined` instead of throwing a missing dependency error.

**Why it matters:** The tenant connection cache is optional — it's only available when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. In local dev without Upstash, the cache provider factory returns `null`. Without `@Optional()`, NestJS would throw on startup because the `TENANT_CONNECTION_CACHE` token resolves to `null`.

**Key concepts:**
- **`@Optional()`** must be placed before the `@Inject()` decorator
- The injected parameter type should be `T | undefined` (or `T?` shorthand)
- Guards and services must null-check before using: `this.cache?.get(...)` (optional chaining)
- Factory providers can return `null` to signal "not available" — combine with `@Optional()` on the consumer

```ts
// Provider — returns null when config is missing
{
  provide: "TENANT_CONNECTION_CACHE",
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const url = config.get("UPSTASH_REDIS_REST_URL");
    if (!url) return null;
    // ...
  },
}

// Consumer — @Optional prevents startup crash
@Injectable()
class MyGuard {
  constructor(
    @Optional() @Inject("TENANT_CONNECTION_CACHE")
    private readonly cache?: TenantConnectionCache,
  ) {}

  async doWork() {
    const cached = await this.cache?.get(key); // safe with ?.
  }
}
```

**Resources:**
- [NestJS — Optional Providers](https://docs.nestjs.com/providers#optional-providers)
- [NestJS — Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers)

---

## 20. URL Injection Attacks in Database Connection Strings

**What:** A URL injection attack occurs when user-controlled input is embedded into a URL without proper encoding. In database connection strings (`postgresql://user:pass@host:port/dbname`), special characters like `@`, `?`, `#`, `/` have structural meaning. If a field like `dbHost` or `dbName` contains these characters, the resulting URL may route to a different host, database, or include unintended parameters.

**Why it matters:** Zerupt constructs database URLs dynamically during tenant provisioning. The `dbHost`, `dbUser`, `dbName`, and `password` come from the admin DB. If an attacker could influence these values (e.g., via a compromised admin record), they could redirect a tenant's connection to an attacker-controlled database. `buildPostgresUrl()` prevents this by validating hosts and encoding all other fields.

**Key concepts:**
- **Host validation:** Reject `@` (would create a new user:pass section), `/` (path traversal), `?` (query injection), `#` (fragment), whitespace (URL parsing ambiguity)
- **Port validation:** Must be integer 1-65535 — non-integer or out-of-range ports cause undefined behavior
- **`encodeURIComponent()`:** Encodes all reserved URL characters. A `dbName` of `mydb?sslmode=disable` becomes `mydb%3Fsslmode%3Ddisable` — the `?` is treated as literal data, not a query separator
- **Defense-in-depth:** Combine input validation (reject bad hosts) with output encoding (encode all fields) — either alone is insufficient

```ts
// WITHOUT encoding — injection possible
const url = `postgresql://${user}:${pass}@${host}:${port}/${dbName}`;
// If dbName = "db?sslmode=disable", the sslmode parameter is interpreted

// WITH encoding — injection prevented
const url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${encodeURIComponent(dbName)}`;
// dbName = "db?sslmode=disable" → "db%3Fsslmode%3Ddisable"
```

**Resources:**
- [OWASP — Server-Side Request Forgery (SSRF)](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [MDN — encodeURIComponent](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent)

---

## 21. Credential Leakage Prevention in Error Handling

**What:** When database operations fail, error messages and stack traces often contain the connection URL — including credentials. If these messages are logged, stored in a database, or returned to users, the credentials are leaked. Sanitization functions must intercept error messages before they reach any output channel.

**Why it matters:** Zerupt's provisioning pipeline retries on failure and stores the error message in `provisioning_jobs.error_message`. Without sanitization, a connection failure like `"connection to postgresql://tenant_app:s3cret@db.host:5432/mydb failed"` would store the password in the admin DB in plaintext. Anyone with admin DB read access could extract tenant credentials.

**Key concepts:**
- **Regex redaction:** Replace `postgresql://` and `postgres://` URLs with a redacted placeholder. The `gi` flags handle case-insensitive matching and global replacement.
- **Multiple patterns:** Also redact `password=` key-value pairs from log-style messages
- **Apply early:** Sanitize at the point of capture (in `onFailed` handler), not at the point of display. This ensures no code path accidentally uses the raw message.
- **Stack traces:** `error.stack` may also contain credentials if the error message does. Consider sanitizing stack traces too.

```ts
export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "postgresql://***REDACTED***")
    .replace(/password[=:\s]+\S+/gi, "password=***REDACTED***");
}
```

**Resources:**
- [OWASP — Error Handling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html)
- [OWASP — Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

---

## 22. Append-Only Audit Logs for Regulatory Compliance

**What:** An append-only audit log is a database table where records can only be inserted — never updated or deleted. This immutability guarantees a tamper-proof record of every mutation in the system. Regulatory frameworks (ZATCA for Saudi VAT, GST for India, PDPA for Southeast Asia) require such logs for financial transactions.

**Why it matters:** Zerupt is a retail ERP handling POS transactions, inventory adjustments, and accounting entries. Regulators can audit "who changed what, when." If records can be modified, the audit trail is untrustworthy. The append-only constraint must be enforced at the database level (not just application code) to survive both bugs and malicious actors with DB access.

**Key concepts:**
- **DB trigger enforcement:** A `BEFORE UPDATE OR DELETE` trigger that raises an exception is the strongest guarantee. Application code can't bypass it.
- **Privilege hardening:** `REVOKE UPDATE, DELETE ON audit_log FROM app_role` adds a second layer — even without the trigger, the app role can't mutate rows.
- **No `updatedAt` column:** The absence of an `updatedAt` field signals intent — this table never updates.
- **GDPR tension:** "Right to erasure" conflicts with append-only. Solution: store only identifiers and non-PII metadata in audit rows, not full personal data.

```sql
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: UPDATE and DELETE are not permitted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
```

**Resources:**
- [OWASP — Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [PostgreSQL — CREATE TRIGGER](https://www.postgresql.org/docs/current/sql-createtrigger.html)

---

## 23. NestJS Interceptors — Aspect-Oriented Side Effects

**What:** A NestJS interceptor wraps the route handler execution. It has access to both the request (before the handler) and the response (after the handler via RxJS Observable). This makes interceptors ideal for cross-cutting concerns like logging, caching, and audit trails.

**Why it matters:** The audit log interceptor needs to capture both request metadata (IP, user-agent, HTTP method) and response data (the entity returned after creation/update). Guards can't do this — they run before the handler and don't see the response. Middleware runs too early. Interceptors sit at exactly the right point in the lifecycle.

**Key concepts:**
- **`intercept(context, next)`:** `context` gives access to the HTTP request. `next.handle()` returns an `Observable` of the handler's response.
- **RxJS `tap` operator:** Executes a side effect (audit write) without modifying the response stream. The response reaches the client unchanged.
- **Decorator-gated:** Use `Reflector.get()` to check for a custom decorator (`@Audited('EntityType')`). Only fire for decorated handlers.
- **Fire-and-forget:** Audit writes happen asynchronously. Failures are caught and logged but don't break the API response.
- **Request lifecycle position:** `Middleware → Guards → Interceptors (pre) → Pipes → Handler → Interceptors (post)`

```typescript
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    return next.handle().pipe(
      tap((responseBody) => {
        // Side effect: write audit log entry
        void this.auditService.append(databaseUrl, { ... });
      }),
    );
  }
}
```

**Resources:**
- [NestJS — Interceptors](https://docs.nestjs.com/interceptors)
- [RxJS — tap operator](https://rxjs.dev/api/operators/tap)

---

## 24. PII Scrubbing in Audit Snapshots

**What:** When storing before/after state in audit logs, the response body must be filtered to exclude personally identifiable information (PII) and secrets. An allowlist approach (explicitly list safe fields) is more secure than a denylist approach (list fields to exclude) because new sensitive fields are excluded by default.

**Why it matters:** Zerupt's audit log is append-only — data stored there can never be deleted. If a response body contains a password hash, API token, tax ID, or full customer address, that data is permanently captured. This creates GDPR/PDPA compliance risk and a high-value target for attackers who gain DB read access.

**Key concepts:**
- **Allowlist > Denylist:** An allowlist (`id`, `status`, `name`, `updatedAt`) means a new field `socialSecurityNumber` is automatically excluded. A denylist would miss it.
- **Defense-in-depth:** Use both — an allowlist of safe fields AND a denylist of known-dangerous fields (`password`, `token`, `secret`, `apiKey`).
- **Per-entity allowlists (Phase 1+):** The `@Audited('Product')` decorator can carry metadata about which fields are safe for that entity type.

```typescript
const SAFE_KEYS = new Set(["id", "code", "status", "name", "updatedAt"]);
const DENIED_KEYS = new Set(["password", "token", "secret", "apiKey"]);

function scrub(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body).filter(([k]) => SAFE_KEYS.has(k) && !DENIED_KEYS.has(k))
  );
}
```

**Resources:**
- [OWASP — Logging Cheat Sheet (sensitive data)](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#data-to-exclude)
- [GDPR — Right to Erasure](https://gdpr-info.eu/art-17-gdpr/)

---

## 25. Connection Pool Management for Multi-Tenant Prisma

**What:** Creating a new `PrismaClient` on every database operation opens a fresh connection pool, which exhausts PostgreSQL's `max_connections` under any real load. The solution is to cache one `PrismaClient` per database URL and reuse it across requests.

**Why it matters:** The audit log service writes to the tenant DB on every mutation. If each write creates a new PrismaClient (opening ~5 connections, then immediately closing them), a burst of 50 requests opens 250 connections — likely exceeding the tenant DB's connection limit on Railway/Supabase. Caching one client per URL reuses the same pool.

**Key concepts:**
- **`Map<string, PrismaClient>` cache:** Key = databaseUrl, Value = client instance. Check before creating.
- **No `$disconnect()` per request:** With a cached client, calling `$disconnect()` in a `finally` block kills the shared pool for every concurrent request. Only disconnect on application shutdown.
- **`OnModuleDestroy`:** NestJS lifecycle hook — iterate all cached clients and disconnect gracefully.
- **Memory bound:** For 100-200 tenants (Zerupt Phase 0-2 scale), a simple `Map` is sufficient. For 10K+ tenants, use an LRU eviction strategy.

```typescript
const clientCache = new Map<string, PrismaClient>();

function getOrCreate(url: string): PrismaClient {
  const existing = clientCache.get(url);
  if (existing) return existing;

  const client = new PrismaClient({ datasources: { db: { url } } });
  clientCache.set(url, client);
  return client;
}

// On shutdown
async onModuleDestroy() {
  await Promise.allSettled(
    [...clientCache.values()].map(c => c.$disconnect())
  );
  clientCache.clear();
}
```

**Resources:**
- [Prisma — Connection Management](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections)
- [PostgreSQL — max_connections](https://www.postgresql.org/docs/current/runtime-config-connection.html)

## 26. Supabase Custom Access Token Hooks

**What:** A PL/pgSQL function that Supabase Auth calls before issuing every JWT (login and refresh), allowing you to inject custom claims into the token.

**Why it matters:** Zerupt uses this hook to inject `tenant_id` from `user_tenant_map` into `app_metadata` on every token issuance. This is the primary mechanism ensuring every JWT carries the correct tenant scope — the NestJS guard then validates it. Without this, you'd rely solely on `app_metadata` set via the Admin API, which can become stale.

**Key concepts:**
- The hook receives a JSONB `event` containing `user_id`, `claims`, and `authentication_method`
- You modify `claims` and return the event — Supabase signs the modified claims into the JWT
- The function MUST never throw — if it does, Supabase Auth fails the entire token issuance
- Use `SECURITY DEFINER` so the function runs as its owner, bypassing RLS on lookup tables
- Use `VOLATILE` (not `STABLE`) since you read from tables whose contents change
- Set `search_path = public` explicitly to prevent search path injection attacks
- Exception handlers should be **fail-closed**: strip sensitive claims rather than returning them unchanged

```sql
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  claims jsonb;
begin
  claims := event->'claims';
  -- Modify claims...
  event := jsonb_set(event, '{claims}', claims);
  return event;
exception when others then
  -- Fail-closed: strip custom claims
  return jsonb_set(event, '{claims}', (event->'claims') #- '{app_metadata, tenant_id}');
end;
$$;
```

**Resources:**
- [Supabase — Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)
- [Supabase — Custom Claims and RBAC](https://supabase.com/docs/guides/auth/custom-claims-and-role-based-access-control-rbac)

## 27. SECURITY DEFINER vs SECURITY INVOKER in PostgreSQL Functions

**What:** PostgreSQL functions can run as either the calling user's role (`SECURITY INVOKER`, the default) or as the function owner's role (`SECURITY DEFINER`).

**Why it matters:** The custom_access_token_hook is called by `supabase_auth_admin`, which has limited permissions. Using `SECURITY DEFINER` ensures the function can always read `user_tenant_map` regardless of RLS policies or future permission changes. But it introduces a privilege escalation surface — you must lock down the function's search path and revoke execute from untrusted roles.

**Key concepts:**
- `SECURITY INVOKER`: function runs with caller's privileges. Safe by default, but the caller needs all necessary grants.
- `SECURITY DEFINER`: function runs with owner's privileges. Powerful but dangerous — any caller with EXECUTE can do whatever the owner can do within that function.
- Always pair `SECURITY DEFINER` with `SET search_path = public` (or the specific schema) to prevent search path injection — where an attacker creates a schema with malicious functions that shadow your intended tables/functions.
- Always `REVOKE EXECUTE FROM PUBLIC` on SECURITY DEFINER functions.

**Resources:**
- [PostgreSQL — CREATE FUNCTION Security](https://www.postgresql.org/docs/current/sql-createfunction.html)
- [PostgreSQL — Writing SECURITY DEFINER Functions Safely](https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY)

## 28. Fail-Closed vs Fail-Open in Auth Systems

**What:** When an auth component encounters an error, it can either deny access (fail-closed) or allow access (fail-open). In security-critical paths, fail-closed is almost always correct.

**Why it matters:** The custom_access_token_hook's exception handler was initially fail-open — on error, it returned the original JWT claims unchanged, which could contain a stale `tenant_id` from a previous session. This means a user whose tenant access was revoked could keep accessing the system if the hook crashed during the revocation check. Changing to fail-closed (strip `tenant_id` on error) ensures the NestJS guard rejects the token.

**Key concepts:**
- **Fail-closed:** On error, deny access. Users may be temporarily locked out, but no unauthorized access occurs. Correct for: authentication, authorization, encryption, tenant isolation.
- **Fail-open:** On error, allow access. Users aren't disrupted, but unauthorized access is possible. Correct for: rate limiting (maybe), feature flags, non-security analytics.
- In a layered auth system (hook → guard → resolver), each layer should independently fail-closed. Don't rely on a downstream layer to catch an upstream failure.
- Exception handlers in auth code should explicitly strip/deny rather than pass through unchanged state.

**Resources:**
- [OWASP — Fail Securely](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html)

## 29. Supabase Admin API and app_metadata vs user_metadata

**What:** Supabase distinguishes between `app_metadata` (server-controlled, included in JWT) and `user_metadata` (user-editable, also in JWT but not trusted for authorization).

**Why it matters:** Zerupt stores `tenant_id` in `app_metadata` because only the server (via Admin API or the custom hook) can modify it. If it were in `user_metadata`, users could change their own tenant_id via the client SDK — a critical privilege escalation vulnerability.

**Key concepts:**
- `app_metadata`: Only modifiable via `auth.admin.updateUserById()` (requires service role key). Included in JWT claims. Used for: tenant_id, roles, permissions, subscription tier.
- `user_metadata`: Modifiable by the user via `auth.updateUser({ data: {...} })`. Included in JWT. Used for: display name, avatar URL, preferences.
- `updateUserById` with `app_metadata` does a **shallow merge** — existing keys are preserved, only specified keys are added/updated.
- Never use the service role key on the client. It bypasses all RLS and has full admin access.

```typescript
// Server-side only (service role key)
const { error } = await supabase.auth.admin.updateUserById(userId, {
  app_metadata: { tenant_id: tenantId }, // merged with existing app_metadata
});
```

**Resources:**
- [Supabase — User Management](https://supabase.com/docs/guides/auth/managing-user-data)
- [Supabase — Admin API](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)

---

## 30. HMAC-SHA256 for Cache Integrity Verification

**What:** HMAC (Hash-based Message Authentication Code) uses a secret key + a hash function (SHA-256) to produce a fixed-length tag over data. Only someone with the secret can produce a valid tag, so it proves both integrity (data wasn't modified) and authenticity (data was written by someone with the key).

**Why it matters:** Zerupt caches tenant DB connection metadata in Upstash Redis. The `dbPasswordEnc` field is protected by AES-GCM's auth tag, but `dbHost`, `dbPort`, `dbUser`, and `sslMode` are plain strings. If Redis is compromised, an attacker could modify these fields to redirect connections to a malicious database. HMAC-SHA256 computed over all fields on write, verified on read, detects any tampering and falls through to the authoritative DB lookup.

**Key concepts:**
- **Compute on write:** `hmac = HMAC-SHA256(secret, JSON.stringify(allFields))`
- **Verify on read:** Recompute HMAC from the retrieved data. If it doesn't match the stored HMAC, reject the cache entry.
- **Constant-time comparison:** Use `crypto.timingSafeEqual()`, NOT `===` or `!==`. String comparison short-circuits on the first mismatched byte, leaking information about which bytes are correct. An attacker who can measure response latency can brute-force the HMAC byte-by-byte.
- **Canonical serialization:** Use `JSON.stringify` with explicit key order, not pipe-delimited strings. Pipe delimiters break if any field value contains a `|`, causing two different data combinations to produce the same HMAC input (canonicalization attack).
- **Graceful degradation:** If HMAC verification fails, return `null` and let the caller fall through to the DB — don't crash.

```ts
import { createHmac, timingSafeEqual } from "crypto";

function computeHmac(data: CachedData, secret: string): string {
  const payload = JSON.stringify({ field1: data.field1, field2: data.field2 });
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function hmacEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
```

**Resources:**
- [Node.js — crypto.createHmac](https://nodejs.org/api/crypto.html#cryptocreatehmacalgorithm-key-options)
- [Node.js — crypto.timingSafeEqual](https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b)
- [OWASP — Testing for Timing Attacks](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/10-Business_Logic_Testing/04-Test_for_Process_Timing)

---

## 31. TOCTOU Race Conditions in Database Operations

**What:** TOCTOU (Time of Check to Time of Use) is a class of race condition where the state changes between when you check it and when you act on it. In database operations: you `SELECT` to check if a record exists, then `INSERT` based on the result — but another transaction can `INSERT` between your check and your action.

**Why it matters:** Zerupt's duplicate-job guard checks for existing Queued/InProgress provisioning jobs before creating a new one. Two simultaneous API requests for the same tenant can both pass the `findFirst` check before either `create` completes, creating two competing provisioning jobs. While the pipeline is idempotent (both jobs will succeed), they race on password rotation and status updates.

**Key concepts:**
- **Non-atomic check-then-act:** `SELECT` + `INSERT` in separate statements is inherently racy under concurrent access.
- **Fix 1 — Unique partial index:** `CREATE UNIQUE INDEX ON provisioning_jobs (tenant_id) WHERE status IN ('Queued','InProgress')`. The DB enforces at most one active job per tenant atomically. Catch the unique violation (`P2002`) and convert to `409 Conflict`.
- **Fix 2 — Advisory locks:** `SELECT pg_advisory_xact_lock(hashtext(tenant_id))` serializes operations per tenant within a transaction. Heavier, but works without schema changes.
- **Fix 3 — Serializable isolation:** `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` makes the entire transaction behave as if no other transactions ran concurrently. Highest correctness but highest contention.
- **Risk assessment:** Acceptable in single-instance Phase 0 (owner-only trigger, idempotent pipeline). Must be addressed before multi-instance deployment.

**Resources:**
- [PostgreSQL — Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
- [PostgreSQL — Advisory Locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS)
- [CWE-367: TOCTOU Race Condition](https://cwe.mitre.org/data/definitions/367.html)

---

## 32. IANA Timezone Database and Multi-Region SaaS

**What:** The IANA Time Zone Database (often called "tz" or "zoneinfo") is the authoritative source for timezone rules worldwide. Timezone identifiers like `Asia/Dubai`, `Africa/Cairo`, `Asia/Kolkata` are IANA names. Node.js and PostgreSQL both use this database internally via the operating system or ICU.

**Why it matters:** Zerupt serves Arabic-speaking countries (18 countries), India, and Southeast Asia — spanning UTC+0 (Morocco) to UTC+8 (Malaysia/Singapore). When provisioning a tenant, the system must assign the correct timezone based on country code. Using `UTC` as a fallback for unmapped countries silently produces wrong local times for billing cutoffs, report dates, and scheduled jobs.

**Key concepts:**
- **One country, one primary timezone:** Most of Zerupt's target markets have a single timezone. Exceptions: Indonesia (3 zones), but `Asia/Jakarta` covers the majority (Java, Sumatra).
- **Morocco's irregular DST:** `Africa/Casablanca` observes DST but suspends it during Ramadan. The IANA database tracks this — Node's `Intl.DateTimeFormat` handles it automatically.
- **Country → timezone mapping is not in any standard library.** You must maintain your own map or use a package like `country-timezone`. For Zerupt's 23 target countries, a static map is simpler and has zero dependencies.
- **Store IANA names, not offsets:** `Asia/Dubai` is stable. `UTC+4` breaks when DST rules change. Always store the IANA name and let the runtime compute the current offset.

**Resources:**
- [IANA Time Zone Database](https://www.iana.org/time-zones)
- [MDN — Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)

---

## 33. PII Minimization in Message Queue Payloads

**What:** PII (Personally Identifiable Information) minimization means storing only the minimum data needed for a process to function. In message queues like BullMQ (backed by Redis), job payloads persist in memory and on disk. If Redis is compromised, every queued, active, and completed job payload is exposed.

**Why it matters:** Zerupt's provisioning pipeline originally sent `tenantName`, `tenantCode`, `ownerUserId`, and `countryCode` in the BullMQ payload. If Redis were breached, an attacker would see every tenant's name, their database username pattern (`tenantCode_app`), and which user owns each tenant. By sending only opaque UUIDs (`tenantId`, `jobId`), the blast radius is reduced to meaningless identifiers.

**Key concepts:**
- **Store references, not data:** Send an ID, have the consumer re-fetch the full record from the authoritative database.
- **Tradeoff — extra DB read:** The consumer makes one extra `findUnique` call per job. For a provisioning pipeline that runs once per tenant signup, this is negligible.
- **Redis persistence:** BullMQ uses Redis, which can persist to disk (RDB snapshots, AOF logs). Payloads aren't just in memory — they're on disk too. Treat Redis as a data store, not ephemeral cache.
- **Completed job retention:** BullMQ keeps completed jobs by default (`removeOnComplete: false`). Even after processing, PII in the payload remains in Redis until explicitly cleaned up.
- **Pair with audit logging:** If you need an audit trail of what was processed, log it in the database (which has proper access controls), not in the queue payload.

**Resources:**
- [OWASP — Data Minimization](https://owasp.org/www-project-developer-guide/draft/design/web_app_checklist/data_minimization/)
- [BullMQ — Job Options (removeOnComplete)](https://docs.bullmq.io/guide/jobs/removing-jobs)
