<!-- Merpec white-label — founder manual steps + open items | 2026-07-12 -->
# Merpec White-Label — Founder Checklist

All CODE is shipped on branch `phase-1/merpec-whitelabel` (repo `zerupt-erp`). The items below are dashboard/infra actions only you can do (accounts, DNS, secrets), plus the migration apply. Nothing here needs more code.

## 0. Database migrations — AUTO-APPLIED on deploy (no manual step needed)
Two admin-DB migrations ship on this branch: `0021_orange_vanisher` (brand column, `renews_at`, `backup_runs`) and `0022_acoustic_gambit` (brand index, `backup_runs` FK → set null). Railway's `preDeployCommand` (`migrate-all.cli`) applies admin migrations FIRST (before traffic switches); a failure aborts the deploy and keeps the old version live. So merging to `main` + Railway auto-deploy applies them to prod automatically.
- These are **admin-DB only** (the tenants/subscriptions registry + `backup_runs`). No per-tenant schema changed, so existing tenants need no per-tenant migration.
- Backfill is automatic: existing subscriptions get `renews_at = created_at + 1 year`; existing tenants get `brand = 'zerupt'`.
- Optional pre-merge dev check: `cd erp/packages/db-admin && DIRECT_URL_ADMIN=<dev-admin-url> npx drizzle-kit migrate`, then verify `\d tenants` / `\d subscriptions` / `\d backup_runs`.

## 1. DNS (merpec.com zone — recommend Cloudflare free tier; do NOT touch legacy `erp.merpec.com` / `kb.merpec.com`)
- `app.merpec.com`  CNAME → Vercel (from the new Vercel project below).
- `api.merpec.com`  CNAME → Railway (custom domain on the existing API service).
- Resend DKIM/SPF/DMARC records for `mail.merpec.com` (Resend gives exact records in step 4).

## 2. Vercel — second frontend project (same repo, same `main`)
- New project `merpec-web`, same team (no seat cost), root `apps/web`, prod domain `app.merpec.com`.
- Env = copy of `zerupt-web` with these overrides:
  | Var | Value |
  |---|---|
  | `NEXT_PUBLIC_BRAND` | `merpec` |
  | `NEXT_PUBLIC_APP_URL` | `https://app.merpec.com` |
  | `NEXT_PUBLIC_API_URL` | `https://api.merpec.com` |
  | `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_WEBSITE_URL` | Merpec marketing site (legacy until refreshed) |
  | `NEXT_PUBLIC_PRINT_AGENT_DOWNLOAD_URL` | Merpec print-agent URL if/when it differs (else leave Zerupt default) |
  | everything else | identical to `zerupt-web` |
- `NEXT_PUBLIC_BRAND` MUST be set — the build fails loud if unset (that is intentional: a wrong default is a brand leak).

## 3. Railway — one API service, second domain
- Add `api.merpec.com` as a custom domain on the existing `@zerupt/api` service.
- Extend `CORS_ORIGINS` env with `https://app.merpec.com`.

## 4. Resend — verify the Merpec sending domain
- Verify `mail.merpec.com` (add the DKIM/SPF records to the merpec.com DNS zone). Second domain needs Resend Pro; free tier is fine until Merpec actually sends.
- Set API env: `RESEND_FROM_MERPEC="Merpec <no-reply@mail.merpec.com>"` (and optionally `RESEND_FROM_ZERUPT` — else it falls back to the brand config sender). Decide the human-reply/support address with Dad.

## 5. Supabase — auth redirects + send-email hook
- Add `https://app.merpec.com/**` to the auth redirect allowlist.
- Configure the **Send Email Hook** → point it at `https://api.merpec.com/auth/email-hook` (the brand-aware endpoint). Copy the signing secret into API env `SUPABASE_SEND_EMAIL_HOOK_SECRET` (`v1,whsec_...`). This routes all auth emails through our brand-aware sender; verify with the spec-04 test matrix (Merpec reset → Merpec sender/template/app.merpec.com link; Zerupt unchanged).

## 6. Backups — provision R2, then flip the flag
Backups ship OFF (`BACKUP_ENABLED=false`). To turn on:
- Create a Cloudflare R2 bucket (e.g. `zerupt-backups`); create an S3 API token.
- Generate a NEW 64-hex key for `BACKUP_ENCRYPTION_KEY_V1` (MUST differ from `DB_ENCRYPTION_KEY_V1`).
- Set API env: `BACKUP_ENABLED=true`, `BACKUP_ENCRYPTION_KEY_V1`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Optional second copy: `B2_*` (Backblaze).
- Ensure the Railway image has a `pg_dump` client whose major version ≥ Neon's Postgres major (pin in the Dockerfile). The job runs nightly ~02:00 UTC (~05:00 Gulf).
- Do a first manual restore drill within a month (restore a random tenant's dump to a scratch Neon branch, check row counts + trial balance). Log it in `study/ops/`.

## 7. Neon — durability settings (already on your to-do list)
- Set PITR retention to the plan maximum; enable branch protection on the prod branch.

## 8. Latency gate (before the first Kuwaiti customer)
- Confirm the Railway region + Neon region for prod. Target Amsterdam (~120ms from Kuwait); if prod sits in a US region, move it BEFORE onboarding, not after. Re-check Railway's region list near launch.

## 9. Platform-admin access (for the new admin endpoints)
- The brand filter (`GET /admin/tenants?brand=merpec`) and renewal-date edit (`PATCH /admin/tenants/:id/subscription` body `{ "renewsAt": "2027-07-12" }`) sit behind the platform-admin guard. Ensure your user id is in `PLATFORM_ADMIN_USER_IDS`. There is no admin UI (consistent with today); use an authenticated API call. Renewal reminders fire to Sentry at 30/7/1 days before `renews_at`, and the customer sees an in-app banner within 30 days.

---

## Open items (waiting on Dad)
- **Merpec assets** — real logo mark + PWA icons are already wired in (`apps/web/public/brand/merpec/`, from the 2025 branding pack). If a higher-res 512px "M" master exists, drop it in to replace the upscaled-from-200px icons; the wordmark (`logo.png`) is in place. No code change needed to swap any of them.
- **Email sender + support address** — confirm the final `no-reply@mail.merpec.com` sender and a human support/reply address (e.g. `support@merpec.com`); update `RESEND_FROM_MERPEC` and the brand config `emailFrom` in `packages/shared/src/brand/merpec.ts` if different.

## Known non-goals (deliberately not done)
- No migration of legacy Merpec customers; legacy `*.merpec.com` untouched.
- No payment gateway for Merpec (manual invoicing, off-system).
- No separate Supabase project / admin DB / Railway service per brand.
- Second Vercel project auto-deploys from `main` (brands in lockstep). At ~10 paying Merpec customers, pause auto-deploy on `merpec-web` and promote soaked builds manually (tripwire from decisions.md §10).
