# Database Architecture & Tenant Provisioning

## Architecture

**Dedicated PostgreSQL database per tenant** + **Central Admin Database** for platform metadata.

```
Supabase Auth (centralized) → JWT with tenant_id
        ↓
NestJS API → TenantContextMiddleware → Redis cache lookup → PrismaClient per tenant
        ↓                    ↓
Central Admin DB         Tenant DBs (isolated)
```

**Why dedicated DBs:** Physical isolation (cross-tenant leakage impossible), independent scaling, zero-downtime migrations, clean per-tenant backups, regulatory compliance, performance isolation.

---

## Central Admin DB Schema

| Table | Key Fields |
|-------|------------|
| `tenants` | `id`, `code`, `name`, `status` (PendingProvisioning/Active/Suspended/Archived/ProvisioningFailed), `subscriptionStatus` (Trial/Active/PastDue/Cancelled/Expired), `planId`, `trialExpiresAt`, `dbDeletionScheduledAt`, `ownerUserId`, `countryCode` |
| `tenant_databases` | `tenantId`, `dbHost`, `dbPort`, `dbName`, `dbUser`, `dbPasswordEnc` (encrypted), `region`, `provider`, `status` (Provisioning/Ready/Migrating/Suspended/Deleting/Deleted), `migrationVersion` |
| `plans` | `id`, `name`, `priceMonthly`, `maxUsers`, `maxBranches`, `modules` (json array) |
| `subscriptions` | `tenantId`, `planId`, `status`, `stripeSubscriptionId`, `currentPeriodStart`, `currentPeriodEnd` |
| `user_tenant_map` | `userId`, `tenantId`, `role` (owner/member) — PK: (userId, tenantId) |
| `provisioning_jobs` | `tenantId`, `status` (Queued/InProgress/Completed/Failed), `step`, `errorMessage` |

---

## Tenant DB

Each tenant DB contains all business data (accounting, inventory, sales, POS, etc.) + pgvector for AI. Managed via `packages/db/` Prisma schema.

- `tenantId` columns retained on entities for defense-in-depth
- No RLS — isolation is physical
- Self-contained — exportable as full database dump

---

## Provisioning Pipeline

**Trigger:** Immediately after signup, before onboarding questionnaire.

| Step | Action | On Failure |
|------|--------|------------|
| CreateDB | Call DB provider API | Retry 3x with backoff |
| RunMigrations | Apply Prisma migrations | Retry 3x, then `ProvisioningFailed` |
| SeedConfig | Insert tenant identity record | Retry 3x |
| MarkReady | Set status = Ready/Active, emit `tenant.provisioned` | Alert ops |

**UX:** "Setting up your workspace..." (30-60 sec target). On persistent failure: show error + support contact.

---

## Connection Routing

**TenantContextMiddleware (every request):**
1. Decode JWT → extract `tenant_id`
2. Redis cache lookup (5-min TTL), fallback to Central Admin DB
3. Get/create PrismaClient from LRU cache (max 200, 10-min idle eviction)
4. Attach to request context → all services use `request.prisma`

---

## Migration Strategy

| Aspect | Detail |
|--------|--------|
| Storage | `packages/db/migrations/` |
| Execution | Batch 50 tenant DBs in parallel |
| Circuit breaker | Pause after 3 consecutive failures |
| Pattern | **Expand-contract mandatory** — never drop columns in same migration |
| Rollback | Reversible where possible; breaking changes use blue-green |

---

## Trial Lifecycle

| Day | Event |
|-----|-------|
| 0 | Dedicated DB provisioned, `trialExpiresAt = +14 days` |
| 14 | Trial expires, `dbDeletionScheduledAt = +30 days`, email sent |
| 21 | Grace period reminder email |
| 37 | Final warning email |
| 44 | DB deleted if still `subscriptionStatus != Active` |

Data export available via self-serve during grace period.

---

## Connection Pooling

| Scale | Strategy |
|-------|----------|
| < 100 tenants | Prisma built-in pool (5 connections/tenant) |
| 100-500 | PgBouncer (transaction mode) |
| 500+ | Regional PgBouncer instances |

---

## Security

- DB credentials encrypted at rest, never exposed to frontend/logs
- Minimal tenant DB privileges (no CREATE DATABASE, no SUPERUSER)
- Redis cache entries encrypted
- Cross-tenant access architecturally impossible
- All provisioning/deletion events logged

---

## Monorepo Structure

```
packages/
  db/              # Tenant DB Prisma schema
  db-admin/        # Central Admin DB Prisma schema
  tenant-context/  # TenantConnectionService, TenantContextMiddleware
```

---

## Supabase Services

| Service | Scope |
|---------|-------|
| Auth | Centralized — JWT contains `tenant_id` |
| Storage | Centralized — tenant-prefixed paths (`/{tenantId}/receipts/`) |
| Realtime | Removed — replaced by NestJS WebSocket gateway (Socket.io) |
