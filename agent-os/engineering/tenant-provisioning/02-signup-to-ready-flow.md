# Signup to Ready — The Complete Customer Journey

## Timeline

The entire flow from "click Start Free Trial" to "answer first onboarding question" takes **3-5 seconds**. For context: Shopify takes 10-15s, Xero takes 30s+, QuickBooks can take a minute.

## Step-by-Step Flow

### Step 1: Customer Visits zerupt.com (0s)

Customer clicks "Start Free Trial" on the marketing website (`apps/website/`, Next.js on Vercel).

### Step 2: Customer Creates Account (~1s)

The signup page (`apps/web/`) collects:
- Business name (e.g. "Ahmed's Electronics")
- Email
- Password
- Country (e.g. UAE)

The frontend calls **Supabase Auth** to create the user. Supabase handles:
- Email/password signup
- Email verification
- Password hashing + storage
- Session management (access token + refresh token)
- JWT signing with ES256 (asymmetric keys)

At this point, the user exists in Supabase but has **no tenant yet**. Their JWT has no `tenant_id`. They're authenticated but homeless.

### Step 3: API Creates Tenant Record (~500ms)

The frontend calls the NestJS backend: `POST /api/tenants/signup` with business name, country code, plan selection.

The API writes to the **Central Admin DB** (`zerupt_admin` on Neon):

```sql
-- 1. Create tenant (status = pending_provisioning)
INSERT INTO tenants (code, name, status, plan_id, owner_user_id, country_code, trial_expires_at)
VALUES ('ahmed-electronics', 'Ahmed''s Electronics', 'pending_provisioning',
        <plan-id>, <user-uuid>, 'AE', NOW() + INTERVAL '14 days');

-- 2. Create user-tenant mapping (owner role)
INSERT INTO user_tenant_map (user_id, tenant_id, role, status)
VALUES (<user-uuid>, <tenant-uuid>, 'owner', 'active');

-- 3. Create subscription (trial)
INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end)
VALUES (<tenant-uuid>, <plan-id>, 'trial', NOW() + INTERVAL '14 days');
```

Then enqueues a provisioning job to BullMQ and returns immediately.

### Step 4: Provisioning Runs in Background (~2-5s)

See `03-provisioning-pipeline.md` for the 4-step pipeline.

The API returns a `jobId` immediately. The frontend shows a loading screen.

### Step 5: Frontend Shows Progress Screen

```
┌─────────────────────────────────────┐
│      PROVISIONING SCREEN            │
│                                     │
│     ⏳ Setting up your workspace    │
│                                     │
│     ✓ Account created               │
│     ✓ Database provisioned          │
│     ◌ Configuring your system...    │
│                                     │
│     This takes a few seconds        │
└─────────────────────────────────────┘
```

The frontend polls `GET /api/provisioning/{jobId}/status` every 1-2 seconds. When the status returns `Completed`, it redirects.

### Step 6: JWT Gets tenant_id

During the MarkReady step, the provisioning pipeline calls the Supabase Admin API to set `app_metadata.tenant_id` on the user. The next token refresh includes the claim:

```json
{
  "sub": "8886fe55-...",
  "email": "ahmed@example.com",
  "app_metadata": {
    "tenant_id": "1c3bdc3a-..."
  }
}
```

### Step 7: Customer Lands on Onboarding Wizard

The customer is redirected to the onboarding questionnaire — their database is fully provisioned and ready. See `onboarding/` spec for the questionnaire flow (Phase 5).

```
┌─────────────────────────────────────┐
│      ONBOARDING WIZARD              │
│                                     │
│  Step 1 of 7: Business Details      │
│                                     │
│  Trading name: [Ahmed Electronics]  │
│  Industry:     [Retail - Electronics]│
│  Tax reg #:    [_______________]    │
│                                     │
│              [ Next → ]             │
└─────────────────────────────────────┘
```

The onboarding steps (Phase 5, future):
1. Business Info — Trading name, industry, tax registration
2. Locations — Branches, warehouses
3. Accounting — Fiscal year start, functional currency
4. Tax Setup — Auto-selected by country (VAT for UAE, dual GST for India, SST for Malaysia)
5. Team — Invite members with roles
6. Data Import — Products, customers, suppliers via CSV/Excel
7. Go-Live Checklist — Verify all config is complete

Each step writes to the tenant's own database. Templates are seeded based on country + industry.

## Why Async (BullMQ) Instead of Synchronous

Three reasons:

1. **Reliability.** If migration fails halfway, BullMQ retries with exponential backoff. Synchronous = user gets a 500 error and a half-created database.

2. **Timeout safety.** Railway/Vercel HTTP timeout is 30-60s. If Neon is slow (cold start, network hiccup), synchronous times out. BullMQ has no timeout limit.

3. **Scale.** 50 simultaneous signups: synchronous holds 50 API connections for 5s each. BullMQ processes with `concurrency: 2`, queuing the rest — API stays responsive for normal requests.

## What If Provisioning Fails?

- BullMQ retries up to 3 times with exponential backoff
- Steps are **idempotent** — `CREATE DATABASE` handles "already exists", upserts handle duplicate rows
- Steps are **resumable** — on retry, completed steps are skipped (step-level resume)
- If all 3 attempts fail: tenant marked `ProvisioningFailed`, needs manual intervention
- The frontend shows: "Something went wrong setting up your workspace. Our team has been notified. [Retry] [Contact Support]"

```
Retry example:
  Attempt 1: CreateDB ✓ → RunMigrations ✗ (Neon timeout)
  Attempt 2: CreateDB (skipped) → RunMigrations ✓ → SeedConfig ✓ → MarkReady ✓
```
