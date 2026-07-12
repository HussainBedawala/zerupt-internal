<!-- Merpec white-label — technical spec index | Created: 2026-07-12 -->
# Merpec White-Label — Technical Spec

As-built/to-build engineering spec for running Zerupt as a second brand ("Merpec", Kuwait) from the same codebase and backend. Business decisions, costs, and risks live in `agent-os/product/merpec-kuwait/decisions.md` — read that first; this tree only says HOW.

**The invariant everything here serves:** one repo, one API deployment, one data platform. Brand is a build-time config, never a fork.

## Files

| File | Covers |
|------|--------|
| [01-brand-config.md](01-brand-config.md) | The `@zerupt/shared` brand module, the exact hardcoded-"Zerupt" sweep list, and the anti-leak CI gate |
| [02-tenancy-and-billing.md](02-tenancy-and-billing.md) | `brand` column on tenants, signup flow changes, admin filtering, Sentry/PostHog tagging, custom yearly (AMC) pricing on subscriptions |
| [03-deployment-and-domains.md](03-deployment-and-domains.md) | Second Vercel project, Railway custom domain, DNS, env-var matrix, per-customer custom domains playbook |
| [04-emails.md](04-emails.md) | Brand-aware sender for product emails + Supabase send-email hook for auth emails, Resend domain setup |
| [05-backups-durability.md](05-backups-durability.md) | Nightly per-tenant pg_dump to R2 + secondary provider, retention, restore drills |

## Build order and status

Shipped 2026-07-12 on branch `phase-1/merpec-whitelabel` (repo `zerupt-erp`). One codebase, one API deployment, one data platform — brand is a build-time skin, never a fork.

| # | Step | Spec | Status | Commit |
|---|------|------|--------|--------|
| 1 | Brand config module + string sweep + anti-leak gate | 01 | ✅ shipped | `e73d6c49` |
| — | Schema foundation (`tenants.brand`, `subscriptions.renews_at`, `backup_runs`) + brand in tenant context | 02/05 | ✅ shipped | `434da473` |
| 2 | `brand` column + signup + Sentry tag (+ PostHog wired inert) | 02 | ✅ shipped | `ad0b618f` |
| 3 | Renewal date + reminder (founder alert + customer banner). NO pricing/gateway per founder ruling — Merpec billing stays off-system | 02* | ✅ shipped | `ad0b618f` |
| 5 | Brand-aware emails + Supabase send-email hook | 04 | ✅ shipped | `da2d8b98` |
| 6 | Nightly encrypted backup job to R2 (+ optional B2), `backup_runs` audit, feature-gated OFF | 05 | ✅ shipped | `da2d8b98` |
| — | Review-panel fixes (2 critical brand leaks, DB hardening, migration `0022`) | — | ✅ shipped | `1e82ec2b` |
| 4 | Vercel project #2 + DNS + CORS + Supabase redirects | 03 | ⛳ founder action | — (see FOUNDER-CHECKLIST.md) |

Deviations from the original spec (approved by founder 2026-07-12): no forced Arabic default (users pick locale); no custom-price columns / payment gateway for Merpec (AMC is manual, off-system) — only `renews_at` + reminders; anti-leak gate is a Vitest + turbo `brand:check` (CI is currently disabled), and it now also catches the Arabic transliteration "زيروبت"; renewal/backup use `@nestjs/schedule @Cron`; founder alerts go via `Sentry.captureMessage` (no internal notification channel exists). Migrations `0021` + `0022` are generated but NOT yet applied to Neon — see the checklist.

> Founder manual steps + open items: **[FOUNDER-CHECKLIST.md](FOUNDER-CHECKLIST.md)**.

## Non-goals (deliberately out of scope)

- No runtime brand detection from hostname (build-time env is the mechanism; revisit at 5+ brands).
- No migration of legacy Merpec customers or touching `erp.merpec.com` / `*.merpec.com` legacy subdomains.
- No payment gateway for Merpec (manual invoicing; Razorpay work is a separate Zerupt-international track).
- No separate Supabase project, admin DB, or Railway service per brand.
