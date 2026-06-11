# Database Architecture & Tenant Provisioning

## Architecture

**Dedicated PostgreSQL database per tenant** + **Central Admin Database** for platform metadata.

```
Supabase Auth (centralized) → JWT with tenant_id
        ↓
NestJS API → TenantContextMiddleware → Redis cache lookup → Drizzle instance per tenant
        ↓                    ↓
Central Admin DB         Tenant DBs (isolated)
```

**Why dedicated DBs:** Physical isolation (cross-tenant leakage impossible), independent scaling, zero-downtime migrations, clean per-tenant backups, regulatory compliance, performance isolation.

---

## Central Admin DB Schema

Drizzle schema lives at `packages/db-admin/src/schema/`. Env var: `DATABASE_ADMIN_URL`.

This database stores **platform metadata only** — tenant registry, billing, DB connection routing, and provisioning state. All tenant business data (accounting, inventory, POS, etc.) lives in per-tenant databases managed by `packages/db/`.

### Enums

| Enum | Values | Used by |
|------|--------|---------|
| `TenantStatus` | `PendingProvisioning`, `Active`, `Suspended`, `Archived`, `ProvisioningFailed` | `tenants.status` |
| `SubscriptionStatus` | `Trial`, `Active`, `PastDue`, `Cancelled`, `Expired` | `tenants.subscriptionStatus` |
| `TenantDbStatus` | `Provisioning`, `Ready`, `Migrating`, `Suspended`, `Deleting`, `Deleted` | `tenant_databases.status` |
| `ProvisioningJobStatus` | `Queued`, `InProgress`, `Completed`, `Failed` | `provisioning_jobs.status` |
| `UserTenantRole` | `Owner`, `Member` | `user_tenant_map.role` |
| `UserTenantStatus` | `Active`, `Invited`, `Deactivated` | `user_tenant_map.status` |
| `PaymentProvider` | `Stripe`, `Tap`, `Razorpay` | `subscriptions.paymentProvider` |

### Table: `tenants`

Lean registry record for routing, billing, and provisioning. The rich tenant entity (tradingName, taxRegistrationNumber, industry, inventoryConcept, onboardingState, etc.) lives in each tenant's own database — see `01-organisation-governance.md`.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, default `gen_random_uuid()` | Unique tenant identifier. Referenced by all other admin tables and embedded in JWTs as `tenant_id`. |
| `code` | String | Unique, immutable | Short immutable tenant code (e.g. `acme-retail`). Used in URLs, logs, and support references. Never changes after creation. |
| `name` | String | Required | Display name (company/trading name). |
| `status` | `TenantStatus` | Required, default `PendingProvisioning` | Tenant lifecycle state. Controls access: only `Active` allows full operation. See Status Rules in `01-organisation-governance.md`. |
| `subscriptionStatus` | `SubscriptionStatus` | Required, default `Trial` | Billing lifecycle state. Drives trial expiry, grace periods, and DB deletion scheduling. |
| `planId` | UUID | FK → `plans.id` | Current subscription plan. |
| `trialExpiresAt` | DateTime | Nullable | Set to `now + plan.trialDays` at signup. Null for non-trial tenants. |
| `dbDeletionScheduledAt` | DateTime | Nullable | Set when trial expires without conversion. Tenant data deleted on this date. See Trial Lifecycle section. |
| `ownerUserId` | String | Required | Supabase Auth user ID of the tenant owner. Exactly one owner at all times — see Owner Rules in `01-organisation-governance.md`. |
| `countryCode` | String | Required | ISO 3166-1 alpha-2 country code. Drives tax config, COA templates, and compliance rules. Immutable after first posted transaction (enforced in tenant DB). |
| `createdAt` | DateTime | Default `now()` | When the tenant registered. |
| `updatedAt` | DateTime | Auto-updated | Last modification timestamp. |

**Indexes:** Unique on `code`. Index on `status` (for bulk queries like "all active tenants"). Index on `ownerUserId` (for "my tenants" lookup).

### Table: `tenant_databases`

Stores connection credentials for each tenant's dedicated PostgreSQL database. The `TenantContextMiddleware` reads this table (via Redis cache) to route requests to the correct database.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, default `gen_random_uuid()` | Record identifier. |
| `tenantId` | UUID | FK → `tenants.id`, unique | One DB record per tenant. |
| `dbHost` | String | Required | PostgreSQL host (e.g. `db.xxxx.supabase.co`). |
| `dbPort` | Int | Required, default `5432` | PostgreSQL port. |
| `dbName` | String | Required | Database name (e.g. `zerupt_tenant_acme`). |
| `dbUser` | String | Required | Database user for application connections. Minimal privileges (no SUPERUSER, no CREATE DATABASE). |
| `dbPasswordEnc` | String | Required | **Application-level encrypted** database password. Encrypted using a platform encryption key (env var). Never exposed to frontend or logs. |
| `sslMode` | String | Nullable | PostgreSQL SSL mode (e.g. `require`, `verify-full`). Null for local dev. Required for production (Supabase/Neon). |
| `region` | String | Required | Cloud region identifier (e.g. `us-east-1`, `ap-southeast-1`). Used for latency-aware routing. |
| `provider` | String | Required | DB hosting provider (e.g. `supabase`, `neon`). Used by provisioning pipeline to call the correct API. |
| `status` | `TenantDbStatus` | Required, default `Provisioning` | Database lifecycle state. Only `Ready` allows tenant access. |
| `migrationVersion` | String | Nullable | Last successfully applied Drizzle migration name. Used by batch migration runner to detect drift. |
| `createdAt` | DateTime | Default `now()` | When the DB record was created. |
| `updatedAt` | DateTime | Auto-updated | Last modification timestamp. |

**Indexes:** Unique on `tenantId` (1:1 relationship). Index on `status` (for migration batch queries like "all Ready databases").

### Table: `plans`

Subscription plan definitions. Plans are soft-disabled (`isActive = false`) when retired — never deleted, because existing subscriptions reference them.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, default `gen_random_uuid()` | Plan identifier. |
| `slug` | String | Unique | URL-safe plan identifier (e.g. `starter`, `growth`, `enterprise`). Used in API responses and pricing pages. |
| `name` | String | Required | Display name (e.g. "Starter", "Growth", "Enterprise"). |
| `priceMonthly` | Decimal | Required | Monthly price in `priceCurrency`. |
| `priceYearly` | Decimal | Nullable | Annual price in `priceCurrency`. Null if annual billing not offered for this plan. Typically ~20% discount vs 12x monthly. |
| `priceCurrency` | String | Required, default `USD` | ISO 4217 currency code. Zerupt targets MENA (AED/SAR), India (INR), SEA (MYR/IDR) — plans may be priced regionally. |
| `maxUsers` | Int | Required | Maximum users allowed on this plan. |
| `maxBranches` | Int | Required | Maximum branches/locations allowed. |
| `modules` | Json | Required | JSON array of enabled module slugs (e.g. `["pos", "inventory", "accounting"]`). Checked by API middleware for module entitlement. |
| `trialDays` | Int | Required, default `14` | Trial duration in days for new tenants on this plan. Allows longer trials for enterprise plans. |
| `isActive` | Boolean | Required, default `true` | Whether this plan is available for new subscriptions. Set `false` to retire a plan without breaking existing subscribers. |
| `displayOrder` | Int | Required, default `0` | Sort order for pricing page display. Lower = shown first. |
| `createdAt` | DateTime | Default `now()` | When the plan was created. |
| `updatedAt` | DateTime | Auto-updated | Last modification timestamp. |

### Table: `subscriptions`

Billing state per tenant. Links a tenant to a plan and tracks the external payment provider subscription.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, default `gen_random_uuid()` | Subscription record identifier. |
| `tenantId` | UUID | FK → `tenants.id`, unique | One active subscription per tenant. |
| `planId` | UUID | FK → `plans.id` | The plan this subscription is for. |
| `status` | `SubscriptionStatus` | Required, default `Trial` | Billing state. Mirrors `tenants.subscriptionStatus` — kept in sync by subscription webhooks. |
| `paymentProvider` | `PaymentProvider` | Nullable | Which payment provider manages this subscription. Null during trial (no payment method yet). Stripe (global), Tap (GCC), Razorpay (India). |
| `externalSubscriptionId` | String | Nullable | The payment provider's subscription ID (e.g. Stripe `sub_xxx`, Razorpay `sub_xxx`). Null during trial. |
| `currentPeriodStart` | DateTime | Nullable | Start of the current billing period. Null during trial. |
| `currentPeriodEnd` | DateTime | Nullable | End of the current billing period. Null during trial. |
| `cancelledAt` | DateTime | Nullable | When the tenant requested cancellation. Used for grace period calculation. |
| `cancelAtPeriodEnd` | Boolean | Required, default `false` | If true, cancellation takes effect at `currentPeriodEnd`. If false, cancellation is immediate. |
| `createdAt` | DateTime | Default `now()` | When the subscription was created. |
| `updatedAt` | DateTime | Auto-updated | Last modification timestamp. |

**Indexes:** Unique on `tenantId`. Index on `status` (for bulk queries like "all past-due subscriptions").

### Table: `user_tenant_map`

Maps Supabase Auth users to tenants. A user can belong to multiple tenants (e.g. accountant managing several businesses). The composite PK `(userId, tenantId)` prevents duplicate mappings.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `userId` | String | PK (composite) | Supabase Auth user ID (`auth.users.id`). String because Supabase uses UUIDs as strings in JWTs. |
| `tenantId` | UUID | PK (composite), FK → `tenants.id` | Which tenant this user belongs to. |
| `role` | `UserTenantRole` | Required, default `Member` | `Owner` or `Member`. Exactly one Owner per tenant. Owner has bypass permissions. |
| `status` | `UserTenantStatus` | Required, default `Active` | `Active` = can access tenant. `Invited` = invitation sent, not yet accepted. `Deactivated` = access revoked, history retained. |
| `joinedAt` | DateTime | Default `now()` | When the user joined (or was invited to) this tenant. |

**Indexes:** Index on `userId` (for "which tenants does this user belong to?" — the login flow query). Index on `tenantId` (for "which users are in this tenant?" — the team management query).

### Table: `provisioning_jobs`

Tracks the multi-step database provisioning pipeline. Each step (CreateDB → RunMigrations → SeedConfig → MarkReady) updates this record. A tenant can have multiple provisioning attempts (e.g. first attempt fails, user retries).

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, default `gen_random_uuid()` | Job identifier. Own PK because a tenant can have multiple provisioning attempts. |
| `tenantId` | UUID | FK → `tenants.id` | Which tenant is being provisioned. |
| `status` | `ProvisioningJobStatus` | Required, default `Queued` | Current job state. |
| `step` | String | Nullable | Current provisioning step name (e.g. `CreateDB`, `RunMigrations`, `SeedConfig`, `MarkReady`). Null when queued. |
| `errorMessage` | String | Nullable | Error details if the job failed. Null on success. |
| `retryCount` | Int | Required, default `0` | Number of retry attempts. Max 3 per step (see Provisioning Pipeline section). |
| `startedAt` | DateTime | Nullable | When provisioning execution began. Null while queued. Used for timeout detection. |
| `completedAt` | DateTime | Nullable | When provisioning finished (success or final failure). With `startedAt`, gives provisioning duration metrics. |
| `createdAt` | DateTime | Default `now()` | When the job was queued. |

**Indexes:** Index on `tenantId` (for "provisioning history for this tenant"). Index on `status` (for "all queued jobs" — the worker pickup query).

### Relationships (Drizzle)

```
tenants 1──1 tenant_databases   (tenantId unique FK)
tenants 1──1 subscriptions      (tenantId unique FK)
tenants 1──* provisioning_jobs  (tenantId FK)
tenants 1──* user_tenant_map    (tenantId composite PK)
plans   1──* tenants            (planId FK)
plans   1──* subscriptions      (planId FK)
```

### Deferred Tables (not in scope for DEV-24)

| Table | Reason for deferral | When needed |
|-------|--------------------|----|
| `admin_audit_logs` | Provisioning/deletion events handled by structured application logging (Sentry) for now. Dedicated audit table needed when admin UI operations exist. | Phase 1 (Settings & Admin) |
| `invitations` | Invitation flow handled via `user_tenant_map.status = Invited` + Supabase Auth metadata for now. Full invitation table with tokens, expiry, and resend logic deferred. | Phase 1 (Team & User Lifecycle — `02-team-user-lifecycle.md`) |
| `feature_flags` | PostHog handles feature flags (per tech stack spec). No need to store in admin DB. | Not planned |

---

## Tenant DB

Each tenant DB contains all business data (accounting, inventory, sales, POS, etc.) + pgvector for AI. Managed via `packages/db/` Drizzle schema.

- `tenantId` columns retained on entities for defense-in-depth
- No RLS — isolation is physical
- Self-contained — exportable as full database dump

---

## Provisioning Pipeline

**Trigger:** Immediately after signup, before onboarding questionnaire.

| Step | Action | On Failure |
|------|--------|------------|
| CreateDB | Call DB provider API | Retry 3x with backoff |
| RunMigrations | Apply Drizzle migrations | Retry 3x, then `ProvisioningFailed` |
| SeedConfig | Insert tenant identity record | Retry 3x |
| MarkReady | Set status = Ready/Active, emit `tenant.provisioned` | Alert ops |

**UX:** "Setting up your workspace..." (30-60 sec target). On persistent failure: show error + support contact.

---

## Connection Routing

**TenantContextMiddleware (every request):**
1. Decode JWT → extract `tenant_id`
2. Redis cache lookup (5-min TTL), fallback to Central Admin DB
3. Get/create Drizzle instance from LRU cache (max 200, 10-min idle eviction)
4. Attach to request context → all services use `request.db`

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
| < 100 tenants | Drizzle built-in pool (5 connections/tenant) |
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
  db/              # Tenant DB Drizzle schema
  db-admin/        # Central Admin DB Drizzle schema
  tenant-context/  # TenantConnectionService, TenantContextMiddleware
```

---

## Supabase Services

| Service | Scope |
|---------|-------|
| Auth | Centralized — JWT contains `tenant_id` |
| Storage | Centralized — tenant-prefixed paths (`/{tenantId}/receipts/`) |
| Realtime | Removed — replaced by NestJS WebSocket gateway (Socket.io) |
