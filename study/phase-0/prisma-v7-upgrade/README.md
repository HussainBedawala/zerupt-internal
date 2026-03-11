# Prisma v7 Upgrade — Study Topics (DEV-172)

## 1. Prisma Driver Adapters

**What:** In Prisma v7, the ORM no longer bundles its own database driver. Instead, you provide a "driver adapter" (e.g. `@prisma/adapter-pg` for PostgreSQL) that wraps a standard Node.js database client like `pg`.

**Why it matters:** Zerupt's multi-tenant architecture creates PrismaClient instances dynamically per tenant. With driver adapters, each instance gets its own `pg.Pool` — giving you direct control over pool size, SSL config, and connection lifecycle per tenant.

**How it works:**
```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });
```

The adapter creates a `pg.Pool` internally. You can also pass a pre-configured `pg.Pool` for full control:
```ts
import pg from "pg";
const pool = new pg.Pool({ connectionString: url, max: 5, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
```

**Resources:**
- [Prisma v7 upgrade guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7)
- [Driver adapters overview](https://www.prisma.io/docs/orm/overview/databases/driver-adapters)

## 2. prisma.config.ts — CSS-First Config for Prisma

**What:** Prisma v7 moves CLI configuration (datasource URLs, shadow DB URL) out of `schema.prisma` and into a TypeScript file called `prisma.config.ts`. The `url = env("DATABASE_URL")` line in the datasource block is removed.

**Why it matters:** The schema becomes purely declarative (models + generators), while runtime config lives in code where you can use environment resolution logic, conditional URLs, dotenv loading, etc. For Zerupt's monorepo with two schemas (tenant + admin), each package gets its own `prisma.config.ts` pointing to the correct env var.

**Key concepts:**
```ts
// packages/db/prisma.config.ts
import { defineConfig } from "prisma/config";

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/fallback",
  },
});
```

The `env()` helper from `prisma/config` throws if the variable is missing. Use `process.env` with `??` for optional fallbacks (like the tenant DB URL which is dynamic).

**Resources:**
- [prisma.config.ts docs](https://www.prisma.io/docs/orm/reference/prisma-config-reference)

## 3. The New prisma-client Generator

**What:** Prisma v7 renames the generator from `prisma-client-js` to `prisma-client`. The new generator requires an explicit `output` path and supports `moduleFormat` (`esm` or `cjs`).

**Why it matters:** The old generator put files in `node_modules/.prisma/client` (magic path). The new one generates to your specified output, making it explicit and monorepo-friendly. The `moduleFormat` matters for your test runner — Jest uses CJS, so `moduleFormat = "cjs"` is required.

**Key concepts:**
```prisma
generator client {
  provider     = "prisma-client"          // not prisma-client-js
  output       = "../src/generated/prisma" // required, explicit
  moduleFormat = "cjs"                     // or "esm"
}
```

Import path changes from `@prisma/client` to the generated output:
```ts
import { PrismaClient } from "./generated/prisma/client";
```

**Resources:**
- [New generator docs](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/generating-prisma-client)

## 4. Connection Pool Management in Multi-Tenant Systems

**What:** Each `PrismaPg` adapter creates a `pg.Pool`. In a multi-tenant system where you create one PrismaClient per tenant DB, you're also creating one connection pool per tenant.

**Why it matters:** With 100 tenants, you'd have 100 pools × default 10 connections = 1000 potential database connections. This can exhaust PostgreSQL's `max_connections` or Supabase's connection limits.

**Key concepts:**
- Cache PrismaClient instances by database URL (Zerupt does this in `TenantPrismaService`)
- Set conservative pool sizes: `new PrismaPg({ connectionString: url, max: 3 })`
- For one-shot operations (like provisioning), use `max: 1`
- Always call `$disconnect()` on shutdown to drain pools
- Consider a connection pooler (PgBouncer, Supabase's built-in pooler) for production

**Resources:**
- [Prisma connection management](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections)
- [pg.Pool docs](https://node-postgres.com/apis/pool)

## 5. Single Cache Owner Pattern

**What:** When multiple layers in your app create or cache database clients, exactly one layer should "own" the lifecycle (creation, caching, and disconnection). Other layers should delegate to the owner.

**Why it matters:** During DEV-172, the code review found a dual-cache bug: both `audit.module.ts` (factory closure) and `AuditLogService` cached PrismaClient instances. The module-level cache was never disconnected on shutdown, creating a potential connection leak.

**The fix pattern:**
```
Factory (stateless) → creates new client per call
    ↓
Service (stateful) → caches by URL, owns $disconnect() in onModuleDestroy
```

Never cache in both the factory AND the consumer. Pick one owner.

**Resources:**
- [NestJS lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events)
