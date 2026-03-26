# Database Operations Reference — Signup Flow

Exact database targets, tables, and column values for every step of the signup-to-ready flow. Use this to verify correctness during testing and debugging.

## Neon Infrastructure

| Property | Value |
|----------|-------|
| Project | Zerupt (`restless-hill-33464873`) |
| Region | `ap-southeast-1` (Singapore) |
| PG version | 17 |
| Production branch | `production` (`br-red-term-a1vs9ndl`) — primary, default |
| Development branch | `development` (`br-old-recipe-a1d3dw26`) — forked from production |

### Databases per Branch

| Database | Purpose | Driver |
|----------|---------|--------|
| `zerupt_admin` | Central registry (tenants, plans, subscriptions, routing) | `neon-http` (singleton) |
| `zerupt_tenant_dev` | Dev tenant for local testing | `neon-serverless` (WebSocket pooling) |
| `zerupt_tenant_{code}` | Dynamically created per signup (provisioning step 1) | `neon-serverless` |

## Prerequisites — Plans Table Must Be Seeded

The signup flow does a `SELECT` on `plans` to find the default plan. **If `plans` is empty, signup fails at step 1a.**

Seed SQL for development:

```sql
INSERT INTO plans (slug, name, price_monthly, price_yearly, price_currency, max_users, max_branches, modules, trial_days, is_active, display_order)
VALUES ('starter', 'Starter', 0, NULL, 'USD', 3, 1, '["settings","accounting","inventory"]', 14, true, 1);
```

## Plan vs Subscription

| | Plan | Subscription |
|---|------|-------------|
| What | A product tier definition (the menu item) | A tenant's active purchase of a plan (the order) |
| Cardinality | Few rows (starter, growth, enterprise) | One per tenant |
| Changes | Rarely (pricing/limits updates) | Often (trial → active → cancelled → expired) |
| Key columns | `slug`, `price_monthly`, `max_users`, `max_branches`, `modules` | `tenant_id`, `plan_id` (FK), `status`, `current_period_end`, `external_subscription_id` |
| Stripe link | None | `external_subscription_id` populated when tenant pays |

## Step-by-Step Database Operations

### Step 0: Supabase Auth (external, not Neon)

| Action | System | Table |
|--------|--------|-------|
| `supabase.auth.signUp()` | Supabase | `auth.users` — INSERT |
| Email click → code exchange | Supabase | `auth.users` — UPDATE (confirmed) |

No Neon writes.

### Step 1: Tenant Signup (`POST /tenant-signup`)

**Target:** `zerupt_admin` — single transaction

| Order | Table | Op | Columns Written |
|-------|-------|----|----------------|
| 1a | `plans` | SELECT | Read `starter` plan to get `id` |
| 1b | `user_tenant_map` | SELECT | Conflict check — verify user doesn't already own a tenant |
| 1c | `tenants` | INSERT | `id` (uuid auto), `code` ("business-name-{timestamp}"), `name`, `status='pending_provisioning'`, `subscription_status='trial'`, `plan_id` (from 1a), `owner_user_id` (from JWT), `country_code`, `trial_expires_at` (now + 14 days), `created_at`, `updated_at` |
| 1d | `user_tenant_map` | INSERT | `user_id` (from JWT), `tenant_id` (from 1c), `role='owner'`, `status='active'`, `joined_at` |
| 1e | `subscriptions` | INSERT | `id` (uuid auto), `tenant_id` (from 1c), `plan_id` (from 1a), `status='trial'`, `current_period_end` (now + 14 days), `created_at`, `updated_at` |
| 1f | `provisioning_jobs` | INSERT | `id` (uuid auto), `tenant_id` (from 1c), `status='queued'`, `retry_count=0`, `created_at`, `updated_at` |

Then enqueues BullMQ job to Redis (payload: `{ tenantId, jobId }` — UUIDs only). Returns `{ tenantId, jobId }` to frontend.

### Step 2a: Provisioning — CreateDB

**Targets:** Neon cluster (superuser) + `zerupt_admin`

| Order | Target | Op | Details |
|-------|--------|----|---------|
| 2a.1 | Neon cluster | `CREATE DATABASE` | `zerupt_tenant_{sanitized_code}` (hyphens → underscores) |
| 2a.2 | Neon cluster | `CREATE USER` | `{dbname}_app`, random 32-byte password, NOCREATEDB NOCREATEROLE, CONNECTION LIMIT 20 |
| 2a.3 | Neon cluster | `GRANT/REVOKE` | Revoke PUBLIC, grant CONNECT + CRUD-only to app user, ALTER DEFAULT PRIVILEGES for future tables |
| 2a.4 | `zerupt_admin` → `tenant_databases` | INSERT | `id`, `tenant_id`, `db_host`, `db_host_pooled`, `db_port=5432`, `db_name`, `db_user`, `db_password_enc` (AES-256-GCM), `key_version=1`, `ssl_mode='require'`, `region='ap-southeast-1'`, `provider='neon'`, `status='provisioning'` |
| 2a.5 | `zerupt_admin` → `provisioning_jobs` | UPDATE | `step='CreateDB'`, `started_at`, `updated_at` |

### Step 2b: Provisioning — RunMigrations

**Targets:** `zerupt_admin` (read creds) + new tenant DB (apply schema)

| Order | Target | Op | Details |
|-------|--------|----|---------|
| 2b.1 | `zerupt_admin` → `tenant_databases` | SELECT | Read encrypted creds for tenant |
| 2b.2 | New tenant DB | `drizzle-kit migrate` | Creates all 37 tables (same schema as `zerupt_tenant_dev`) |
| 2b.3 | `zerupt_admin` → `tenant_databases` | UPDATE | `migration_version` (last applied migration name) |
| 2b.4 | `zerupt_admin` → `provisioning_jobs` | UPDATE | `step='RunMigrations'`, `updated_at` |

### Step 2c: Provisioning — SeedConfig

**Targets:** `zerupt_admin` (read creds + tenant info) + new tenant DB (write identity)

| Order | Target | Op | Details |
|-------|--------|----|---------|
| 2c.1 | `zerupt_admin` → `tenant_databases` | SELECT | Read encrypted creds |
| 2c.2 | `zerupt_admin` → `tenants` | SELECT | Read `code`, `name`, `country_code` |
| 2c.3 | New tenant DB → `tenant_identity` | UPSERT | `id` (=tenantId), `code`, `name`, `country_code`, `timezone` (derived), `language_default` ('ar'/'en'), `is_rtl_default` (true/false), `status='active'` |
| 2c.4 | `zerupt_admin` → `provisioning_jobs` | UPDATE | `step='SeedConfig'`, `updated_at` |

Country-to-locale derivation:

| Country codes | Language | RTL | Timezone |
|---------------|----------|-----|----------|
| AE, SA, KW, QA, BH, OM | `ar` | `true` | Country-specific (e.g. AE → Asia/Dubai) |
| IN | `en` | `false` | Asia/Kolkata |
| MY | `en` | `false` | Asia/Kuala_Lumpur |
| SG | `en` | `false` | Asia/Singapore |
| ID | `en` | `false` | Asia/Jakarta |

### Step 2d: Provisioning — MarkReady

**Target:** `zerupt_admin` — single transaction, then external calls

| Order | Target | Op | Details |
|-------|--------|----|---------|
| 2d.1 | `zerupt_admin` → `tenant_databases` | UPDATE | `status='ready'` |
| 2d.2 | `zerupt_admin` → `tenants` | UPDATE | `status='active'` |
| 2d.3 | `zerupt_admin` → `provisioning_jobs` | UPDATE | `status='completed'`, `completed_at`, `step='MarkReady'` |
| 2d.4 | Supabase (external) | Admin API | Sets `app_metadata.tenant_id` on owner user |
| 2d.5 | NestJS EventEmitter | Event | Emits `tenant.provisioned` (welcome email, analytics) |

### Step 3: Frontend Polling

| Target | Op | Details |
|--------|----|---------|
| `zerupt_admin` → `provisioning_jobs` | SELECT (every 1.5s) | Reads `status`, `step`, `error_message` |

On `completed` → frontend refreshes JWT (now has `tenant_id`) → redirects to `/onboarding`.

## Optimization Note

The provisioning pipeline reads `tenant_databases` credentials 3 times (steps 2a.4 insert, 2b.1 read, 2c.1 read). Since all steps run sequentially in the same BullMQ job, these could be consolidated into a single read passed through the step context. Low priority — each read is ~1ms against a primary key index.

## Admin DB Column Reference

### `tenants`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid | `gen_random_uuid()` | PK |
| `code` | varchar | — | Unique, derived from business name + timestamp |
| `name` | varchar | — | Business name as entered |
| `status` | enum `tenant_status` | `'pending_provisioning'` | pending_provisioning → active / provisioning_failed |
| `subscription_status` | enum `subscription_status` | `'trial'` | trial → active → cancelled → expired |
| `plan_id` | uuid | — | FK → plans.id |
| `trial_expires_at` | timestamptz | — | now + plan.trial_days |
| `db_deletion_scheduled_at` | timestamptz | — | Set when tenant is deactivated |
| `owner_user_id` | varchar | — | Supabase Auth user ID |
| `country_code` | varchar | — | ISO 3166-1 alpha-2 (AE, SA, IN, MY, etc.) |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

### `user_tenant_map`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `user_id` | uuid | — | Composite PK with tenant_id |
| `tenant_id` | uuid | — | FK → tenants.id (CASCADE delete) |
| `role` | enum `user_tenant_role` | `'member'` | Set to `'owner'` for signup |
| `status` | enum `user_tenant_status` | `'active'` | |
| `joined_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |
| `full_name` | varchar | — | Optional, set later in profile |
| `phone` | varchar | — | Optional |
| `locale` | varchar | — | Optional (ar/en) |
| `date_format` | enum | — | Optional preference |
| `time_format` | enum | — | Optional preference |
| `timezone` | varchar | — | Optional override |

### `subscriptions`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid | `gen_random_uuid()` | PK |
| `tenant_id` | uuid | — | Unique FK → tenants.id (one subscription per tenant) |
| `plan_id` | uuid | — | FK → plans.id |
| `status` | enum `subscription_status` | `'trial'` | trial → active → cancelled → expired |
| `payment_provider` | enum | — | null during trial, set to 'stripe' on payment |
| `external_subscription_id` | varchar | — | Stripe subscription ID |
| `current_period_start` | timestamptz | — | null during trial |
| `current_period_end` | timestamptz | — | trial_expires_at initially |
| `cancelled_at` | timestamptz | — | |
| `cancel_at_period_end` | boolean | `false` | |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

### `provisioning_jobs`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid | `gen_random_uuid()` | PK, returned to frontend as jobId |
| `tenant_id` | uuid | — | FK → tenants.id |
| `status` | enum `provisioning_job_status` | `'queued'` | queued → in_progress → completed / failed |
| `step` | varchar | — | Current step name (CreateDB, RunMigrations, SeedConfig, MarkReady) |
| `error_message` | varchar | — | Sanitized error on failure |
| `retry_count` | integer | `0` | Max 3 |
| `started_at` | timestamptz | — | Set when worker picks up job |
| `completed_at` | timestamptz | — | Set on completed/failed |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

### `tenant_databases`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid | `gen_random_uuid()` | PK |
| `tenant_id` | uuid | — | Unique FK → tenants.id (CASCADE delete) |
| `db_host` | varchar | — | Neon direct host |
| `db_host_pooled` | varchar | — | Neon pooled connection host |
| `db_port` | integer | `5432` | |
| `db_name` | varchar | — | `zerupt_tenant_{sanitized_code}` |
| `db_user` | varchar | — | `{db_name}_app` |
| `db_password_enc` | varchar | — | AES-256-GCM encrypted |
| `key_version` | integer | `1` | Encryption key version for rotation |
| `ssl_mode` | varchar | — | `'require'` |
| `region` | varchar | — | `'ap-southeast-1'` (extracted from Neon host) |
| `provider` | varchar | — | `'neon'` |
| `status` | enum `tenant_db_status` | `'provisioning'` | provisioning → ready |
| `migration_version` | varchar | — | Last applied Drizzle migration name |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

### `plans`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid | `gen_random_uuid()` | PK |
| `slug` | varchar | — | Unique (starter, growth, enterprise) |
| `name` | varchar | — | Display name |
| `price_monthly` | numeric | — | 0 for starter |
| `price_yearly` | numeric | — | null if no yearly option |
| `price_currency` | varchar | `'USD'` | |
| `max_users` | integer | — | Limit per plan |
| `max_branches` | integer | — | Limit per plan |
| `modules` | jsonb | — | Array of enabled module slugs |
| `trial_days` | integer | `14` | |
| `is_active` | boolean | `true` | Soft-disable old plans |
| `display_order` | integer | `0` | Pricing page sort |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

### Tenant DB: `tenant_identity`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid | — | PK, same as tenantId (not auto-generated) |
| `code` | varchar | — | Unique, same as tenants.code |
| `name` | varchar | — | Business name |
| `country_code` | varchar | — | ISO 3166-1 alpha-2 |
| `timezone` | varchar | `'UTC'` | Derived from country |
| `language_default` | varchar | `'en'` | `'ar'` for Arabic countries |
| `is_rtl_default` | boolean | `false` | `true` for Arabic countries |
| `status` | enum `tenant_identity_status` | `'active'` | |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |
