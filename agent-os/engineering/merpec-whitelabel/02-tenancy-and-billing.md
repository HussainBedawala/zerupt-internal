# 02 — Tenancy, Brand Dimension, and Merpec Billing

## Brand column

Migration on admin DB (`packages/db-admin/src/schema/tenant.ts`):

- `tenants.brand text NOT NULL DEFAULT 'zerupt'` + CHECK constraint `brand IN ('zerupt','merpec')` (schema `.check()`, per house rule: DB constraint over app validation).
- Backfill: default covers all existing rows.

## Signup flow

`apps/api/src/tenant-signup/`:
- DTO gains optional `brand` (validated against the BrandId union; defaults `zerupt`).
- Frontend sends `brand` from its build-time brand config — the Merpec build always sends `merpec`.
- Server-side sanity: `brand === 'merpec'` requires `countryCode === 'KW'` initially (fail loud; relax when Merpec expands).
- Note: Merpec sales are manual, so most Merpec tenants will be created by us. The signup page still works at `app.merpec.com` for link-based onboarding.

## Where brand is read

- **API:** tenant record is the source of truth (JWT stays brand-free — tenancy is `tenant_id` only, no auth changes). `TenantConnectionService` / tenant cache can expose `brand` alongside the connection so mailers etc. don't re-query.
- **Observability:** `JwtAuthGuard.setSentryUserContext` (`apps/api/src/auth/jwt-auth.guard.ts`) already tags `tenant_id` on Sentry — add `brand`. PostHog: add `brand` as a person/event property at identify time in the web app (it knows its brand at build time — zero lookups).
- **Admin panel:** brand filter/column on the tenants list; no separate dashboard.

## Merpec billing model (manual, yearly AMC)

Merpec deals are one-time implementation + yearly AMC (~120 KWD typical, negotiated per customer). No gateway. Changes:

- `subscriptions` (admin DB): support a custom-priced yearly term. Concretely: nullable `customPriceMinor` + `customCurrency` + `billingInterval ('monthly'|'yearly')` + `renewsAt` on the subscription row (verify against actual current schema before migrating — the standard tiers stay priced from `@zerupt/shared` pricing config; custom fields are the exception path for sales-led deals, used by Merpec first but brand-agnostic on purpose: international enterprise deals will want the same).
- Renewal: no automation. A pg-boss cron emits an internal notification (existing notifications engine) to the founder 30 days before `renewsAt`. Invoicing stays manual.
- Implementation fees are off-system for now (recorded in accounting, not in the subscription).

## Explicit non-changes

- No per-brand admin DB, no brand in JWT claims, no brand-based DB routing. Tenant isolation mechanics are untouched — brand is metadata + presentation only.
