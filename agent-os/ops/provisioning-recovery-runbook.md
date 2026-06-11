# Provisioning Recovery Runbook

> **Scope:** Zerupt admin DB (Neon — `zerupt_admin`).
> **Driver note:** the admin DB uses `drizzle-orm/neon-http` (stateless HTTP). Run SQL
> via the Neon console SQL editor, `psql $DIRECT_URL_ADMIN`, or `npx drizzle-kit studio`.
> Do NOT use a persistent `psql` session that can idle-expire.

---

## Runbook 1 — Re-trigger a stuck tenant

Use when `provisioning_jobs.status` is `failed` (or stuck `queued`/`in_progress` with
no forward progress), and you want the provisioning pipeline to run again.

### Background

The sweeper in `ProvisioningWorkerService` re-runs provisioning when it finds a job in
`queued` status older than `SWEEP_ORPHAN_GRACE_MS` (~15 s). It also re-dispatches when
the pg-boss job record is missing. Resetting the row below causes the next sweeper tick
(or the next `provisioning-status` poll from the setup screen) to pick it up.

The self-heal path in `TenantSignupService.recoverExistingSignup` also fires when the
user reloads the setup wizard screen (`/setup`): it calls `ProvisioningService.dispatch`
directly if the job is still `queued`.

### Step-by-step

**1. Identify the job**

```sql
SELECT pj.id         AS job_id,
       pj.status,
       pj.step,
       pj.retry_count,
       pj.error_message,
       pj.updated_at,
       t.status      AS tenant_status,
       t.code
FROM   provisioning_jobs pj
JOIN   tenants t ON t.id = pj.tenant_id
WHERE  t.id = '<tenant_id>';
```

**2. (Optional) Inspect the pg-boss job**

```sql
SELECT id, state, retrylimit, retrycount, retrydelay, createdon, completedon
FROM   pgboss.job
WHERE  id = '<job_id>';    -- job_id == provisioning_jobs.id (same UUID)
```

**3. Reset the provisioning_jobs row**

> NOTE: `updated_at` must be set explicitly — it is a Drizzle `$onUpdate` client hook,
> not a DB trigger. The sweeper's stuck-job detection reads `updated_at`.

```sql
UPDATE provisioning_jobs
SET    status        = 'queued',
       step          = NULL,
       error_message = NULL,
       retry_count   = 0,
       completed_at  = NULL,
       updated_at    = now()
WHERE  id = '<job_id>'
  AND  tenant_id = '<tenant_id>';
```

**4. Reset the tenant row**

```sql
UPDATE tenants
SET    status     = 'pending_provisioning',
       updated_at = now()
WHERE  id = '<tenant_id>'
  AND  status     = 'provisioning_failed';
```

**5. Clear the pg-boss job record (if it exists and is terminal)**

A terminal pg-boss row (`failed` / `cancelled`) blocks re-send because pg-boss rejects
duplicate IDs. Delete it so the sweeper's `sendJobSafely` can re-insert.

```sql
-- Only run if state IN ('failed', 'cancelled') from step 2.
DELETE FROM pgboss.job
WHERE  id = '<job_id>';
```

If the pg-boss row is in `retry` or `created` state, skip this step — pg-boss will pick
it up on the next drain.

**6. Trigger re-run**

Either:
- **Auto (preferred):** Wait up to 15 minutes for the sweeper tick, which calls
  `resendOrphanedJobs` → `drain` → runs the pipeline.
- **Faster:** Have the user reload the setup wizard screen (`/setup`). The
  `provisioning-status` poll hits `GET /tenant/provisioning-status`, which calls
  `TenantSignupService.recoverExistingSignup` → `dispatch()` immediately.

**7. Verify**

```sql
SELECT pj.status,
       pj.step,
       pj.error_message,
       pj.updated_at,
       t.status AS tenant_status
FROM   provisioning_jobs pj
JOIN   tenants t ON t.id = pj.tenant_id
WHERE  t.id = '<tenant_id>';
```

Expected progression: `queued` → `in_progress` (step increments) → `completed`,
and `tenant.status` → `active`.

---

## Runbook 2 — Fully clean a user to start fresh

> ⚠️  **DESTRUCTIVE AND IRREVERSIBLE.** This permanently removes the user and all tenant
> data. It CANNOT be undone. Run ONLY against confirmed stuck test data. Never run
> against a real customer.
>
> **Worked example values:**
> - `tenant_id`: `47f89be4-e564-43f4-8c07-d533ce4aee9d`
> - `user_id`: `bd5e6525-5a8d-49e1-9377-21f9bd65778c`
> - `tenant_code`: `al-noor-mobiles-mq6c868v`

### When to use

The same email address needs to sign up fresh (e.g. dev/QA re-test, a stuck test
account that can't be recovered). This removes every trace from the admin DB and
Supabase Auth.

### Execution order (respect FK constraints)

FKs in the admin DB:
- `user_tenant_map.tenant_id → tenants.id` (ON DELETE CASCADE)
- `provisioning_jobs.tenant_id → tenants.id`
- `tenant_databases.tenant_id → tenants.id` (ON DELETE CASCADE)
- `subscriptions.tenant_id → tenants.id`

**Step 1 — Remove user_tenant_map row**

```sql
DELETE FROM user_tenant_map
WHERE  user_id  = 'bd5e6525-5a8d-49e1-9377-21f9bd65778c'
  AND  tenant_id = '47f89be4-e564-43f4-8c07-d533ce4aee9d';
```

**Step 2 — Remove provisioning_jobs row**

```sql
DELETE FROM provisioning_jobs
WHERE  tenant_id = '47f89be4-e564-43f4-8c07-d533ce4aee9d';
```

**Step 3 — Remove tenant_databases row (if it exists)**

```sql
DELETE FROM tenant_databases
WHERE  tenant_id = '47f89be4-e564-43f4-8c07-d533ce4aee9d';
```

Note: if the physical Neon tenant database (`zerupt_tenant_al_noor_mobiles_mq6c868v`)
was created, it must be dropped separately via the Neon console or superuser connection —
`DROP DATABASE zerupt_tenant_al_noor_mobiles_mq6c868v;` — before the next provisioning
run recreates it. The `CREATE DATABASE` step handles "already exists" idempotently
(error code `42P04`), so this is optional but recommended for a clean slate.

**Step 4 — Remove subscriptions row**

```sql
DELETE FROM subscriptions
WHERE  tenant_id = '47f89be4-e564-43f4-8c07-d533ce4aee9d';
```

**Step 5 — Remove tenants row**

```sql
DELETE FROM tenants
WHERE  id   = '47f89be4-e564-43f4-8c07-d533ce4aee9d'
  AND  code = 'al-noor-mobiles-mq6c868v';   -- belt-and-suspenders guard
```

**Step 6 — Remove pg-boss job record**

```sql
DELETE FROM pgboss.job
WHERE  id = '<job_id_from_provisioning_jobs>';   -- get from step 1 SELECT before deleting
```

Retrieve the job ID before running the deletes above:

```sql
SELECT id FROM provisioning_jobs
WHERE  tenant_id = '47f89be4-e564-43f4-8c07-d533ce4aee9d';
```

**Step 7 — Delete the Supabase Auth user**

The Supabase Auth user is NOT in the Neon admin DB; it lives in Supabase's own
`auth.users` table (a separate managed Postgres). Deleting it also removes:
- The user's session tokens (all devices sign out)
- `app_metadata` (including `tenant_id` claim written by `MarkReadyStep`)
- `user_metadata` (`full_name` stamped at signup)

**Method A — Supabase Dashboard (recommended for one-offs):**
1. Go to [Supabase Dashboard](https://supabase.com) → Project → Authentication → Users.
2. Search for the user by email or UID `bd5e6525-5a8d-49e1-9377-21f9bd65778c`.
3. Click the user → "Delete user".

**Method B — Supabase Admin API (scripted):**
```typescript
// Uses the service_role key (never the anon key)
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
await supabase.auth.admin.deleteUser("bd5e6525-5a8d-49e1-9377-21f9bd65778c");
```

The `SupabaseAdminService` in `apps/api/src/supabase/supabase-admin.service.ts` wraps
this client if you want to invoke it from a one-off script.

### Verification

After all steps, confirm no rows remain:

```sql
SELECT 'tenants'          AS tbl, count(*) FROM tenants          WHERE id   = '47f89be4-e564-43f4-8c07-d533ce4aee9d'
UNION ALL
SELECT 'provisioning_jobs',        count(*) FROM provisioning_jobs WHERE tenant_id = '47f89be4-e564-43f4-8c07-d533ce4aee9d'
UNION ALL
SELECT 'tenant_databases',         count(*) FROM tenant_databases  WHERE tenant_id = '47f89be4-e564-43f4-8c07-d533ce4aee9d'
UNION ALL
SELECT 'user_tenant_map',          count(*) FROM user_tenant_map   WHERE tenant_id = '47f89be4-e564-43f4-8c07-d533ce4aee9d'
UNION ALL
SELECT 'subscriptions',            count(*) FROM subscriptions     WHERE tenant_id = '47f89be4-e564-43f4-8c07-d533ce4aee9d';
```

All counts should be `0`. Then verify the Supabase user is gone via the dashboard or:
```
GET /auth/v1/admin/users/<user_id>   (expect 404)
```

The same email address can now sign up fresh.
