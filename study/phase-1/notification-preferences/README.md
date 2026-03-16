## 1. User-Level Notification Preferences vs Tenant-Level Policy

**What:** A two-layer notification system where tenant admins define *what* events exist and how they route (policy layer), and individual users control *how* they receive those notifications (preference layer).

**Why it matters:** Zerupt targets multi-role teams — cashiers, accountants, owners — who need different notification profiles. A one-size-fits-all approach creates noise fatigue. The preference layer gives users control without undermining admin-defined escalation rules (e.g., Critical alerts always reach the owner regardless of preferences).

**How it works:**
- `NotificationPreference` stores per-user overrides keyed by `(tenantId, userId, category)`
- `NotificationPreferenceDefault` stores role-based defaults keyed by `(tenantId, roleId, category)`
- At delivery time: check user preference → fallback to highest-priority role default → fallback to system defaults
- Categories group events by domain concern, not by module — this decouples user UX from internal architecture

**Resources:**
- [NestJS Guards and Decorators](https://docs.nestjs.com/guards)
- [Prisma Upsert](https://www.prisma.io/docs/orm/prisma-client/queries/crud#update-or-create-records)

## 2. Upsert Pattern for User Settings

**What:** Using database upsert (INSERT ... ON CONFLICT UPDATE) to atomically create-or-update a settings row, avoiding race conditions between "check if exists" and "insert/update."

**Why it matters:** When multiple browser tabs or API calls try to update the same preference simultaneously, a naive "read then write" approach can lose updates. Upsert is atomic at the database level — Prisma translates it to `INSERT ... ON CONFLICT DO UPDATE`.

**How it works:**
```typescript
prisma.notificationPreference.upsert({
  where: { tenantId_userId_category: { tenantId, userId, category } },
  create: { tenantId, userId, category, ...defaults, ...data },
  update: data,
});
```

Key insight: the `create` block must include explicit defaults for all fields, not rely on Prisma schema `@default()`. This makes the code self-documenting and resilient to schema changes.

**Resources:**
- [PostgreSQL ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT)
- [Prisma Upsert docs](https://www.prisma.io/docs/orm/prisma-client/queries/crud#update-or-create-records)

## 3. Route Ordering in NestJS Controllers

**What:** NestJS resolves routes in declaration order within a controller. Literal path segments (`/reset`, `/defaults`) must be declared before parameterised segments (`/:category`) to prevent the parameter from swallowing literal paths.

**Why it matters:** If `@Patch(":category")` is declared before `@Get("defaults")`, a GET request to `/defaults` would never reach the `getDefaults()` handler — NestJS would try to match `"defaults"` as a category value. This is a subtle bug that only manifests when routes share the same HTTP method prefix.

**How it works:**
```typescript
// Correct order — literals first
@Post("reset")        // matches /reset exactly
@Get("defaults")      // matches /defaults exactly
@Patch(":category")   // matches anything else as a param
```

This applies to Express and Fastify under the hood — both use first-match routing. NestJS doesn't re-order routes for you.

**Resources:**
- [NestJS Controllers — Route wildcards](https://docs.nestjs.com/controllers#route-wildcards)
- [Express Route Matching](https://expressjs.com/en/guide/routing.html)
