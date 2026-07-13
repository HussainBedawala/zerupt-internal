# 03 — Deployment, Domains, Env Matrix

## Topology

```
app.zerupt.com  → Vercel project "zerupt-web"   (NEXT_PUBLIC_BRAND=zerupt)  ┐ same repo,
app.merpec.com  → Vercel project "merpec-web"   (NEXT_PUBLIC_BRAND=merpec)  ┘ same main branch
api.zerupt.com  ┐
api.merpec.com  ┘ → ONE Railway API service (two custom domains)
```

Legacy Merpec (`erp.merpec.com`, `kb.merpec.com`, GoDaddy VPS) is untouched and stays on its current DNS records.

## Steps

1. **DNS** (merpec.com zone — recommend moving DNS hosting to Cloudflare free tier, registrar can stay GoDaddy): `app` CNAME → Vercel, `api` CNAME → Railway, plus Resend DKIM/SPF records for `mail.merpec.com` (see 04). Do NOT touch existing records.
2. **Vercel:** second project on the same team (no extra seat cost), same repo, root `apps/web`, prod domain `app.merpec.com`. Env = copy of zerupt-web's env with the brand-specific overrides below.
3. **Railway:** add `api.merpec.com` as a custom domain on the existing API service; extend `CORS_ORIGINS` with `https://app.merpec.com`.
4. **Supabase:** add `https://app.merpec.com/**` to auth redirect allowlist (dashboard setting).

## Env matrix (merpec-web project, deltas only)

| Var | Value |
|---|---|
| `NEXT_PUBLIC_BRAND` | `merpec` |
| `NEXT_PUBLIC_APP_URL` | `https://app.merpec.com` |
| `NEXT_PUBLIC_API_URL` | `https://api.merpec.com` |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_WEBSITE_URL` | Merpec marketing site (legacy site until refreshed) |
| `NEXT_PUBLIC_CAL_LINK` | unset/Merpec link (config handles null) |
| Sentry/PostHog keys | same projects; separation is via the `brand` tag (02). Revisit separate projects only if dashboards get noisy |
| Everything else (Supabase publishable key, etc.) | identical to zerupt-web |

API service env additions: `CORS_ORIGINS` += merpec origin; per-brand `RESEND_FROM` map (04).

## Release control

Both Vercel projects auto-deploy from `main`, so brands stay in lockstep by default. When Merpec has ~10 paying customers (tripwire from decisions.md §10): pause auto-deploy on merpec-web and promote soaked builds manually (Vercel "promote to production"), and evaluate a second Railway environment for the API pinned the same way. Until then, shared releases + the existing boot drift-guard are the protection.

## Per-customer custom domains (paid implementation perk)

For `customer.merpec.com`: add DNS record ourselves + add domain to the merpec-web Vercel project (no cost, auto-TLS). For a customer-owned domain (`erp.customer.com`): they add a CNAME per Vercel's instructions; we add the domain to the project. Then append the origin to `CORS_ORIGINS` and the Supabase redirect allowlist. ~30 minutes total. Optional later polish: login page reads `window.location.hostname` to show the customer's name pre-login (cosmetic only — tenancy remains JWT-based).

Ops note: keep a small table in this folder (or the admin panel later) listing custom domains → tenant, since CORS/redirect allowlists must be updated when one is added or removed.

## Latency check (pre-launch gate)

Verify current Railway region and Neon region for prod. Railway Metal regions as of 2026-07: US-West, US-East, Amsterdam, Singapore — no Middle East. Target Amsterdam (~120ms from Kuwait) or better; if prod sits in a US region, plan the region move BEFORE the first Kuwaiti customer, not after. Re-check Railway's region list near launch.
