# Tenant Subdomains ({slug}.zerupt.com / {slug}.merpeckw.com)

**Status:** built + reviewed, flag OFF. Branch `phase-5/tenant-subdomains` (erp), 4 commits `6393fe9b..b410e070`. Plan: `~/.claude/plans/majestic-prancing-mist.md`. Memory: `project_tenant_subdomains.md`.

## What shipped (2026-07-14)

- **Phase 0 (infra, done by founder):** zerupt.com + merpeckw.com moved to Vercel nameservers (all DNS records migrated, verified by dig diff; Google MX, ImprovMX, Resend, Railway records intact). Wildcards `*.zerupt.com` / `*.merpeckw.com` live with certs on both Vercel projects.
- **Phase 1:** `tenants.slug` (admin DB, migrations 0025+0026: unique + shape CHECK + reserved-word CHECK). Shared validator `packages/shared/src/tenant-slug.ts` (regex, RESERVED_SLUGS, punycode xn-- rejection, MAX_TENANT_SLUG_LENGTH=50). Backfill CLI `backfill:tenant-slugs` (dry-run default, per-row error isolation, TOCTOU re-check).
- **Phase 2:** `Brand.subdomainBase` ("zerupt.com"/"merpeckw.com"); hardened `extractHost` (bare host:port, trailing-dot FQDN); `tenantSlugForHost` primitive.
- **Phase 3 (API):** optional user-chosen slug at signup (validated, deduped, atomic batch, 409 on user-chosen race / auto-suffix on derived); GET slug-availability (@AuthOnly, throttled, no enumeration); fail-closed `x-tenant-slug` guard check (403 TENANT_HOST_MISMATCH, runs early); CORS callback allowing valid tenant subdomains https-only.
- **Phase 4 (web):** workspace-address field in setup (auto-sync from business name until edited, debounced availability with stale-response guard + abort, aria-live, tooltip ar+en at 8th-grade level, LTR-isolated domain preview); cookie domain env (validated leading-dot + brand match); proxy header inject/strip; api-client header; getTenantUrl (fail-loud in prod); login + (app) layout host-mismatch redirects (network-blip safe via slugKnown).

## Reviews

Two panels, all findings CRITICAL→LOW fixed same-session:
- Phase 1+2: code + database + security. Notables: extractHost bare host:port CRITICAL (WHATWG URL parses host:port as scheme), trailing-dot bypass, backfill error isolation, DB reserved-word CHECK.
- Phase 3+4: code + nestjs/api + security + frontend. Zero criticals; security pass clean (fail-closed verified incl. header smuggling, CORS tricks, open-redirect). Notables: stale-availability race, verify-tenant blip eviction, user-chosen slug silent rename.

## Remaining for go-live (flag flip)

1. Apply migrations 0025+0026 to dev+prod admin DB (manual per `project_manual_tenant_migration.md`).
2. Run backfill CLI (dry-run → review table → --apply) on dev, then prod.
3. Env: `NEXT_PUBLIC_COOKIE_DOMAIN` (`.zerupt.com` zerupt project / `.merpeckw.com` merpec project, PROD ONLY), `NEXT_PUBLIC_SUBDOMAINS_ENABLED=true` (web), `SUBDOMAINS_ENABLED` not used server-side (guard is always-on, fail-closed only when header present).
4. Staging pass of founder verification checklist (signup→subdomain, cookie Domain attr, apex login redirect, wrong-subdomain bounce, 3-location branch gate, reset email, Google OAuth, one-time re-login, brand gate, old merpec.com untouched).
5. Announce one-time re-login to any existing users.

## Gotchas learned

- WHATWG `new URL("host:3000")` treats `host` as a scheme (dots legal in schemes) → hostname "". Always prefix a scheme before parsing bare hosts.
- Node joins duplicate headers with ", " (except set-cookie) → comma fails slug regex → array-smuggling fails closed by construction.
- `tenants.code` is load-bearing for synthetic login emails (`user@{code}.zerupt.local`) — never prettify/rename it; slug is a separate column.
- Tenant connection cache is in-process (per-instance Map), NOT Redis — deploy restarts clear it, so cache-shape changes are deploy-safe.
- Merpec's real domain is merpeckw.com; merpec.com (GoDaddy) is the legacy system.
