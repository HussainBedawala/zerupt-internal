# db-admin Package — Admin Database

**Path:** `erp/packages/db-admin/`
**Neon DB:** `zerupt_admin`
**Purpose:** Central registry — tenants, plans, subscriptions, user-tenant mappings, provisioning jobs.
**Driver:** `neon-http` (stateless, singleton connection)
**NestJS token:** `ADMIN_DB`

## Directory Structure

```
db-admin/
├── drizzle.config.ts        # Drizzle CLI config (reads DATABASE_ADMIN_URL from .env)
├── package.json             # Scripts: db:generate, db:migrate, db:push, db:seed, db:studio
├── tsconfig.json            # Extends root, excludes seed-dev.ts from compilation
├── src/
│   ├── constants.ts         # Runtime enum objects (TenantStatus, UserTenantRole, etc.)
│   ├── drizzle.ts           # AdminDatabase type export (typed Drizzle instance)
│   ├── index.ts             # Barrel export — all schemas + inferred TS types
│   ├── seed-dev.ts          # Dev seed script — populates BOTH admin + tenant DBs
│   └── schema/
│       ├── index.ts         # Schema barrel export
│       ├── enums.ts         # 8 pgEnum definitions (tenant_status, subscription_status, etc.)
│       ├── tenant.ts        # tenants table + tenantDatabases table (encrypted DB credentials)
│       ├── plan.ts          # plans table (subscription tiers) + subscriptions table
│       ├── user-tenant.ts   # userTenantMap — composite PK (userId, tenantId), profile prefs
│       ├── provisioning.ts  # provisioningJobs — tracks multi-step tenant DB provisioning
│       └── relations.ts     # Drizzle relations() for relational query API
```

## Tables

| Table | Purpose |
|-------|---------|
| `tenants` | Tenant registry (code, name, status, country, plan, owner) |
| `tenant_databases` | Per-tenant DB connection details (host, port, encrypted password, key version) |
| `plans` | Subscription tiers (Starter, Pro, Enterprise) with module access |
| `subscriptions` | Tenant-to-plan binding with billing period tracking |
| `user_tenant_map` | Maps Supabase Auth users to tenants with role + locale prefs |
| `provisioning_jobs` | Tracks async tenant provisioning pipeline (queued → completed/failed) |

## Key Design Decisions

- **No user table** — users live in Supabase Auth. `user_tenant_map` links them to tenants.
- **Encrypted DB credentials** — `tenantDatabases.dbPasswordEnc` uses AES-256-GCM with versioned keys for rotation.
- **Idempotent seed** — `seed-dev.ts` uses stable UUIDs + `onConflictDoNothing()` for safe re-runs.
- **constants.ts vs enums.ts** — enums are for DB schema layer, constants are runtime objects with TypeScript types.
