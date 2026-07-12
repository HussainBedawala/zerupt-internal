<!-- How Zerupt and Merpec are separated | 2026-07-13 -->
# How Zerupt and Merpec Are Separated (and why Merpec changes can't break Zerupt)

Plain-language + technical explanation of the white-label architecture. Read alongside `decisions.md` (the business rules) and `FOUNDER-CHECKLIST.md` (the setup steps).

## The one-sentence model

**There is ONE codebase, ONE API server, and ONE database platform. "Zerupt" and "Merpec" are two skins of the same product, chosen by a single setting. Nothing is copied or forked.**

A brand is decided in exactly two places:
- **Frontend:** a build-time environment variable `NEXT_PUBLIC_BRAND` = `zerupt` or `merpec`.
- **Backend/data:** a `brand` column on each customer (tenant) record = `zerupt` or `merpec`.

Everything else is derived from those two facts.

## Why not just copy the code for Merpec?

That's exactly how the OLD Merpec business ended up with dozens of separate, un-maintainable customer systems. A bug fix had to be applied N times; features drifted apart. The core rule of this project (decisions.md §2): **never fork. One codebase, forever.** Every "Merpec difference" is either config or a switch, never a copy.

---

## Layer by layer: where the separation actually lives

### 1. The brand config module — `packages/shared/src/brand/`
The single source of truth for everything brand-facing:
- `types.ts` — the `Brand` shape (name, appUrl, logo path, PWA icons, theme color, email sender).
- `zerupt.ts` — Zerupt's values.
- `merpec.ts` — Merpec's values (name "Merpec", `app.merpeckw.com`, blue `#1fbafd`, Merpec logo, `no-reply@mail.merpeckw.com`).
- `index.ts` — `resolveBrand(id)` returns the right one, and **throws loudly if the id is missing or unknown** (a silent default would be a brand leak).

To change anything about how Merpec looks or is named, you edit `merpec.ts`. Zerupt reads `zerupt.ts` and is physically a different file, so it cannot be affected.

### 2. Frontend (Vercel) — two projects, same repo, same branch
- `zerupt-web` project → `app.zerupt.com`, built with `NEXT_PUBLIC_BRAND=zerupt`.
- `merpec-web` project → `app.merpeckw.com`, built with `NEXT_PUBLIC_BRAND=merpec`.
- **Both build from the same `main` branch of the same repo.** The only difference is that one env var. At build time, `apps/web/src/lib/brand.ts` runs `resolveBrand(process.env.NEXT_PUBLIC_BRAND)` and the whole UI reads the resulting brand (logo component, page titles, PWA manifest, receipt footers).
- Text/translations never hardcode "Zerupt" or "Merpec". They contain a `{brand}` placeholder that is filled in centrally (`apps/web/src/i18n/request.ts`) with the current brand's name. So one set of translation files serves both brands.
- A safety test (`brand-anti-leak.test.ts`) fails the build if the word "Zerupt" (Latin or Arabic) ever appears in a user-visible string in a Merpec build.

Result: `app.merpeckw.com` and `app.zerupt.com` are the identical application, wearing different skins, deployed as two Vercel projects that happen to share code.

### 3. Backend (Railway) — ONE API service, two front doors
- The single `@zerupt/api` service answers on BOTH `api.zerupt.com` and `api.merpeckw.com` (two custom domains on one service).
- The API does not care which door a request came through. It reads the caller's **tenant** from the login token (JWT), looks up that tenant's `brand` in the admin database, and uses it only where branding matters (which email sender/template to use, the welcome-voice script).
- Brand is **not** in the login token and **never** taken from the request — it's read server-side from the tenant record. That means a user cannot spoof a brand, and there's no way for a Merpec request to accidentally be treated as Zerupt or vice-versa.

### 4. Data (Neon) — same multi-tenant model, brand is just a tag
- Every customer (Zerupt or Merpec) gets their **own private database**. This was already true and is unchanged.
- The central admin database has a `tenants` table; we added a `brand` column (`zerupt` or `merpec`, enforced by a DB constraint) plus an index.
- **Tenant isolation is identical for both brands.** Brand is metadata + presentation only — it does NOT change which database a customer uses or who can see what. A Merpec customer's data is exactly as isolated as a Zerupt customer's.

### 5. Auth (Supabase) — one system, brand-aware emails
- One Supabase project for both brands. The login token carries `tenant_id`, not brand (auth stays brand-agnostic).
- Login emails (confirm, reset) are routed through our own API endpoint (`/auth/email-hook`), which looks up the user's brand and sends a Merpec-branded or Zerupt-branded email accordingly. So a Merpec user never gets an email that says Zerupt.

### 6. Observability — separated by a tag
- Errors (Sentry) are tagged with `brand`, so you can filter Merpec issues from Zerupt issues in one dashboard without separate projects.

---

## How you make changes to Merpec without touching Zerupt

### A) Branding (name, logo, colors, copy, sender)
Edit `merpec.ts` (or the Merpec Vercel project's env). Zerupt is a different file / different project — unaffected. Redeploy `merpec-web` only.

### B) Custom features / modules for Merpec customers — the important part
The old way was "copy the system and bolt it on for that customer." We do NOT do that. Three levels (decisions.md §5), from cheapest to rarest:

1. **Settings, not code (aim for ~80%):** custom invoice layouts, extra fields, print styles, report tweaks — things configured inside the product per customer. No code change, so nothing to affect any other customer.

2. **Optional modules behind an entitlement switch:** a bigger feature (e.g. the garage / auto-parts module) is built INTO the main codebase, but hidden behind a per-customer switch. Only a customer who paid for it — whose tenant has that entitlement — can see or use it. For everyone else (all Zerupt customers, all other Merpec customers) the feature is **dark**: the code ships but never runs for them. Mechanically this is done with:
   - the subscription `modules` list and the `@RequiresModule("x")` guard, and/or
   - the per-tenant **feature-flags** system (`/admin/feature-flags`, global or per-tenant).
   Because the gate is checked per-tenant at request time, a Merpec-only module is invisible and inert for Zerupt. Bonus: that module becomes a product you own and can later sell to similar businesses in any country — instead of a one-off copy you must maintain.

3. **Truly one-off request:** still built in the main codebase, behind that one customer's switch. If it genuinely can't be done that way, you reshape it or say no. **Never fork.**

Key point: "a Merpec feature" is **additive code guarded by a per-tenant switch**, not a separate codebase. Adding it cannot change behavior for any tenant that doesn't have the switch on. That is what keeps Zerupt safe.

### C) Bringing in a customized Merpec client (their own address)
For `customer.merpeckw.com` or a customer-owned `erp.customer.com` (~30 minutes, no code):
1. Add a DNS record for the subdomain.
2. Add that domain to the `merpec-web` Vercel project (auto-TLS).
3. Append the origin to the API's `CORS_ORIGINS` and to Supabase's redirect allowlist.
Their users then log in, their tenant is resolved from the token, and they see Merpec branding. Any custom features they paid for are entitlements (level 2/3 above).

---

## The one thing to be aware of: shared backend

Because there is ONE API and ONE database platform, a **bad code release** could break Zerupt AND Merpec at the same time. That's the deliberate trade-off for "one codebase, low maintenance." Mitigations (decisions.md §10):
- Pre-deploy checks (typecheck, migrations, health gate) already abort a broken deploy and keep the old version live.
- No deploys during Gulf business hours.
- Once Merpec has ~10 paying customers, give it its OWN deployment of the same code, which only receives releases after they've proven stable internationally. Still one codebase — just a second, more conservative deploy lane.

By contrast, **data is never shared** (per-tenant DBs) and **branding is never shared** (separate config), so those classes of problem can't cross between brands.

---

## Quick mental map

| Concern | Zerupt | Merpec | Shared? |
|---|---|---|---|
| Source code | same repo | same repo | ✅ one codebase |
| Frontend deploy | zerupt-web | merpec-web | separate projects, same code |
| Brand values | `zerupt.ts` | `merpec.ts` | ❌ separate files |
| API server | `@zerupt/api` | `@zerupt/api` | ✅ one service, two domains |
| Customer databases | per-tenant | per-tenant | ❌ fully isolated |
| Auth | Supabase | Supabase | ✅ one project, brand-aware emails |
| Custom features | entitlements | entitlements | ✅ code shared, gated per-tenant |
| A bad release | affected | affected | ⚠️ shared (mitigated) |
| A data leak | impossible across tenants | impossible across tenants | ❌ isolated |
