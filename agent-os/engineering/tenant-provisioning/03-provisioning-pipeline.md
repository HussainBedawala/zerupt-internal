# Provisioning Pipeline — The 4-Step Database Factory

## Overview

When a customer signs up, BullMQ runs this pipeline in the background:

```
CreateDB → RunMigrations → SeedConfig → MarkReady
```

Total time: ~2-5 seconds. Each step is idempotent (safe to re-run) and resumable (on retry, completed steps are skipped).

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  ProvisioningService (public API)                         │
│  • enqueueProvisioning() — creates job record, adds to   │
│    BullMQ queue                                          │
│  • getJobStatus() — query by job ID                      │
│  • getJobsForTenant() — query by tenant ID               │
└──────────────┬───────────────────────────────────────────┘
               │ BullMQ queue (Upstash Redis)
               │ Payload: { tenantId, jobId } — UUIDs only, no PII
               ▼
┌──────────────────────────────────────────────────────────┐
│  ProvisioningProcessor (BullMQ worker, concurrency: 2)   │
│                                                          │
│  1. Re-fetches full context from admin DB (no PII in     │
│     Redis — if Redis is compromised, only UUIDs leak)    │
│  2. Determines resume point (skip completed steps)       │
│  3. Executes remaining steps in order                    │
│  4. On final failure: marks tenant as ProvisioningFailed │
└──────────────────────────────────────────────────────────┘
```

## Step 1: CreateDB

**File:** `apps/api/src/provisioning/steps/create-db.step.ts`
**Duration:** ~500ms

What it does:
1. Connects to Neon as superuser (`POSTGRES_SUPERUSER_URL`)
2. Runs `CREATE DATABASE zerupt_tenant_{code}` (sanitized: hyphens → underscores, lowercase)
3. Creates a dedicated application user (`zerupt_tenant_{code}_app`) with:
   - Random 32-byte password
   - `NOCREATEDB NOCREATEROLE NOINHERIT` — cannot create databases or roles
   - `CONNECTION LIMIT 20` — prevents connection exhaustion
4. Grants minimal privileges:
   - `CONNECT ON DATABASE` — can connect
   - `USAGE ON SCHEMA public` — can access the schema
   - `SELECT, INSERT, UPDATE, DELETE ON ALL TABLES` — can read/write data
   - `USAGE, SELECT ON ALL SEQUENCES` — can use auto-increment IDs
   - `REVOKE CREATE ON SCHEMA public FROM PUBLIC` — cannot create tables
   - `ALTER DEFAULT PRIVILEGES` — future tables also get the same grants
5. Encrypts the password with AES-256-GCM (key version from `DB_ENCRYPTION_KEY_CURRENT_VERSION`)
6. Stores connection details in `tenant_databases` table (status: `Provisioning`)

**Security model:** The app user can only read and write data. It cannot create tables, drop databases, or modify schema. Only the superuser (used during migrations) can alter schema. This limits blast radius if a tenant's credentials are somehow compromised.

**Idempotency:** Handles PostgreSQL error code `42P04` (database already exists) and `42710` (role already exists) gracefully.

## Step 2: RunMigrations

**File:** `apps/api/src/provisioning/steps/run-migrations.step.ts`
**Duration:** ~2-3 seconds (15 migrations)

What it does:
1. Reads encrypted credentials from `tenant_databases`
2. Decrypts password using AES-256-GCM (reads key version from ciphertext prefix)
3. Builds PostgreSQL connection URL using `buildPostgresUrl()`
4. Shells out to `npx drizzle-kit migrate --config=packages/db/drizzle.config.ts`
5. Redacts any URLs in stdout/stderr before logging (prevents credential leaks in logs)
6. Updates `tenant_databases.migration_version` with the last applied migration name

This creates all tables in the tenant database:
- `tenant_identity` — self-record
- `audit_log` — immutable mutation log
- `roles`, `role_permissions`, `user_roles` — RBAC
- `legal_entities`, `branches`, `warehouses`, `zones`, `bins` — org hierarchy
- `currency_policies`, `tenant_currencies` — currency config
- `fiscal_settings`, `fiscal_years`, `fiscal_periods` — accounting calendar
- `tax_codes`, `tax_rates`, `tax_groups`, `tax_group_components` — tax config
- `document_sequences`, `sequence_reservations` — auto-numbering

**Idempotency:** `drizzle-kit migrate` only applies pending migrations. If all are applied, it's a no-op.

**Timeout:** 60 seconds hard limit on the `execFile` call.

## Step 3: SeedConfig

**File:** `apps/api/src/provisioning/steps/seed-config.step.ts`
**Duration:** ~100ms

What it does:
1. Creates a temporary Drizzle instance pointing at the tenant's database
2. Derives locale defaults from country code:
   - Arabic countries (AE, SA, KW, QA, BH, OM, etc.) → Arabic language, RTL, local timezone
   - India → English, LTR, Asia/Kolkata
   - Malaysia → English, LTR, Asia/Kuala_Lumpur
   - etc.
3. Upserts a `TenantIdentity` record with: id, code, name, countryCode, timezone, languageDefault, isRtlDefault, status=Active
4. Closes the temporary Drizzle instance

**Note:** This only seeds the minimal identity record. Full seeding (Chart of Accounts templates, default roles, system accounts) is handled by the Onboarding Configuration Pipeline in Phase 5.

**Idempotency:** Uses upsert — insert if not exists, update if exists.

## Step 4: MarkReady

**File:** `apps/api/src/provisioning/steps/mark-ready.step.ts`
**Duration:** ~100ms

What it does — in a **single database transaction**:
1. `tenant_databases.status` → `Ready` (the TenantResolverGuard now allows access)
2. `tenants.status` → `Active` (the tenant is live)
3. `provisioning_jobs.status` → `Completed` (job tracking)

Then (non-transactional, non-blocking):
4. Calls Supabase Admin API to set `app_metadata.tenant_id` on the owner user — this is how their JWT gets the `tenant_id` claim on next token refresh
5. Emits `tenant.provisioned` event via NestJS EventEmitter — downstream listeners can send welcome email, trigger analytics, etc.

**Why the Supabase call is non-blocking:** The primary mechanism for `tenant_id` in the JWT is a Supabase custom_access_token_hook (database function). The Admin API call is a secondary guarantee so the owner's very first token refresh works even before the hook is configured.

## Failure Handling

```
Retry config:
  attempts: 3
  backoff: exponential (1s, 2s, 4s)
```

On each failure:
- BullMQ logs the sanitized error (no credentials in logs)
- On non-final attempt: BullMQ schedules retry with backoff

On final failure:
- `provisioning_jobs.status` → `Failed` (with sanitized error message)
- `tenants.status` → `ProvisioningFailed`
- If the status update itself fails: logs an ALERT for manual intervention (zombie state)

## Duplicate Protection

Before enqueuing, `ProvisioningService` checks for existing `Queued` or `InProgress` jobs for the same tenant. Throws `ConflictException` if found. This prevents accidental double-provisioning if the user clicks "retry" rapidly.

Note: This is a TOCTOU check (non-atomic). For Phase 1+, add a partial unique index on `(tenant_id) WHERE status IN ('Queued', 'InProgress')` for database-level enforcement.

## Code Location

```
apps/api/src/provisioning/
├── provisioning.constants.ts         # Queue name, step order, retry config
├── provisioning.module.ts            # NestJS module wiring
├── provisioning.service.ts           # Public API (enqueue, query status)
├── provisioning.service.spec.ts      # Tests
├── provisioning.processor.ts         # BullMQ worker (orchestrates pipeline)
├── provisioning.processor.spec.ts    # Tests
└── steps/
    ├── provisioning-step.interface.ts  # Contract: ProvisioningStep, Context, Result
    ├── create-db.step.ts               # Step 1: CREATE DATABASE + user + encrypt
    ├── create-db.step.spec.ts
    ├── run-migrations.step.ts          # Step 2: drizzle-kit migrate
    ├── run-migrations.step.spec.ts
    ├── seed-config.step.ts             # Step 3: TenantIdentity upsert
    ├── seed-config.step.spec.ts
    ├── mark-ready.step.ts              # Step 4: status → Ready + Active + Completed
    └── mark-ready.step.spec.ts
```
