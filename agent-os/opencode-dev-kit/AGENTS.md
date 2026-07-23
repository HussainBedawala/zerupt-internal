# Zerupt Engineering Conventions

Zerupt is a retail ERP for MENA, Southeast Asia, and India, built as a modular monolith with an AI-first ingestion and agent layer. This file is the engineering rulebook for anyone (human or agent) working in this codebase.

---

## Subagent Use

Delegate heavy search/reading/multi-file exploration to subagents to keep the main context lean. Reviewer/auditor subagents (code review, security review, accounting review) must stay maximally strict and paranoid, never given "lazy" or "minimal" framing.

When delegating implementation work (writing, refactoring, fixing code) to a subagent, paste the full lazy-first ladder below into its prompt. Assume the subagent starts blank and will not otherwise see these conventions.

---

## How We Build

Default posture for all code in this repo, always on, not a mode you switch in and out of.

### Lazy-first ladder

Read the code the change touches and trace the real flow FIRST (start at the codemap). Never shorten the reading, only the solution. Then:

1. **Does this need to exist at all?** Speculative = skip it, say so in one line. (YAGNI)
2. **Already in the monorepo? Reuse it.** Look in this order: `erp/docs/CODEMAPS/<module>.md` -> `packages/shared` + `packages/ui` -> canonical primitives (`formatMoneyAmount` / `formatQuantity` / `MoneyInput` / `QuantityInput` / shared entity pickers / percent inputs, NEVER hand-roll these) -> shared domain services. Re-implementing what lives a few files over is the most common source of slop.
3. **Framework/stdlib does it?** Use it (Next 16, Nest built-ins, Drizzle, date-fns).
4. **Native platform feature?** DB CHECK constraint over app validation, CSS over JS, Postgres over hand-rolled logic, shadcn/ui over a custom component.
5. **Already-installed dependency?** Use it. Never add a dep for what a few lines do, check `package.json` first.
6. **One line?** One line.
7. **Only then:** the minimum code that works.

Bug fix = root cause, not symptom: grep every caller, fix the shared function once, not per-caller. Deletion over addition; boring over clever; many small focused files (200-400 lines typical, 800 max). Shortest working diff wins, but the smallest change in the wrong place is a second bug, so understand first.

Mark deliberate shortcuts inline as `// ponytail: <ceiling>, <upgrade trigger>`.

### Never lazy about (non-negotiable, whatever rung you land on)

- **Understanding the problem** before editing.
- **Money / accounting correctness**: double-entry balance, VAT/GST, COGS, multi-currency, period controls. FX fails loud, never silently defaults. 100% test coverage.
- **Multi-tenant isolation**: every query tenant-scoped; never leak across tenants to save a line.
- **Auth / security**: 100% coverage, validate client AND server, never hardcode secrets, immutable audit log for every mutation.
- **Defensive UX**: MENA/India/SEA retail users aren't always tech-savvy. Every action needs loading/error/empty/success states; confirm destructive actions; debounce buttons; handle race conditions; warn before data loss.
- **Immutability**: return new objects, never mutate in place (see `rules/coding-style.md`).
- **i18n from day one**: ar + en, `en/` is source of truth, never hardcode strings. CSS logical properties only (RTL/LTR), never physical `margin-left` / `padding-right`.
- **No em dashes** in product copy or UI strings.

### House mechanics

pnpm only. Conventional commits (all lowercase, body lines under 100 chars). TypeScript strict everywhere. API-first.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.1.6 + React 19, TypeScript strict, shadcn/ui + Tailwind, TanStack Query, Zustand, next-intl v4 (ar/en) |
| Backend | NestJS modular monolith, Drizzle ORM, pg-boss queue on Neon (no Redis), NestJS EventEmitter |
| AI Service | FastAPI (Python), LiteLLM, pgvector |
| Database | Neon Serverless Postgres (admin DB + per-tenant DBs), Supabase Auth |
| Hosting | Vercel (frontend), Railway (API + AI), Neon (Postgres), Supabase (Auth + Storage) |
| Testing | Jest (API), Vitest (web), Playwright (E2E), pytest (AI) |
| CI/CD | GitHub Actions, Turborepo, pnpm workspaces |

## Architecture

- **Modular monolith**, NOT microservices. Event-driven side effects via NestJS EventEmitter.
- **Multi-tenancy**: Central Admin DB (tenant registry, subscriptions) + per-tenant Postgres DBs. Supabase Auth (centralized), JWT carries `tenant_id`, `TenantContextMiddleware` resolves the Drizzle connection.
- **Neon drivers**: Admin DB uses `neon-http`; Tenant DBs use `neon-serverless` (WebSocket pooling).
- **NestJS DI tokens**: `TENANT_DB` (per-request), `ADMIN_DB` (singleton).
- Architecture drift (dependencies must point DOWN toward accounting/inventory) is mechanically enforced; check for a drift-checking script before adding cross-module imports.

## Monorepo Structure

```
erp/
  apps/web/ api/ ai/ website/
  packages/shared/ db/ db-admin/ tenant-context/ ui/
  docs/CODEMAPS/   <- module-level file maps (read FIRST before exploring)
```

**Codemaps** (`erp/docs/CODEMAPS/{module}.md`) are pre-computed indexes of routes, services, DB tables, and file paths. Read the relevant codemap before exploring code.

---

## Drizzle Migrations

Schema lives in `packages/db/src/schema/` (tenant) and `packages/db-admin/src/schema/` (admin); each has its own `drizzle.config.ts`. Env vars: `DATABASE_TENANT_URL` -> `zerupt_tenant_dev`, `DATABASE_ADMIN_URL` -> `zerupt_admin`.

```bash
cd erp/packages/db   # or db-admin
npx drizzle-kit generate   # SQL only (no apply)
npx drizzle-kit migrate    # apply pending
npx drizzle-kit push       # direct push (dev only)
npx drizzle-kit check      # validate vs DB
```

Data backfills: `generate` then edit the SQL then `migrate`. CHECK constraints / partial indexes via `.check()` in schema. Never hand-edit the migration journal or retype a `when` timestamp; always regenerate.

---

## Testing

Jest for API (`*.spec.ts` colocated). **`--testPathPatterns` (plural) silently matches 0 files** in Jest 30, run `npx jest <filename-pattern>` from `erp/apps/api/` instead, and always confirm "Test Suites: N" in the output (`pnpm ... test` exits 0 with no matches via `passWithNoTests`).

```bash
cd erp/apps/api
npx jest audit --no-coverage         # matches by filename
```

Coverage targets: 80%+ general, 100% financial/accounting, 100% auth/security.

---

## Codebase Gotchas

- **next-intl `hasLocale`**: not exported in v4.8.3. Use `routing.locales.includes(value)`.
- **next-intl `setRequestLocale`**: call in BOTH `generateMetadata` AND the default export.
- **next-intl `params`**: must `await params` in Next.js 16.
- **Next.js 16 middleware**: the file is `proxy.ts`, not `middleware.ts`.
- **`suppressHydrationWarning`**: only on `<html>`, NEVER on `<body>`.
- **Bidi isolation**: use `apps/web/src/lib/bidi.ts` for user content with unknown direction.
- **Translations**: `en/` is source of truth; run the web app's i18n-check script to verify ar/en parity.
- **Code review**: fix all findings (CRITICAL to LOW) in the same session before moving on.

---

## Brand

Warm cream `#F9F7F5` (canvas), Ink `#141310` (text/primary), Citron `#979C1A` (the one accent), Olive `#747818` / `#454729` (data viz). Citron is fill/accent only, never text on light background (fails WCAG); citron-toned text uses olive-deep instead. Primary actions are ink. Fonts: IBM Plex Sans (Latin + Arabic + Devanagari, same family) + IBM Plex Mono. Dark-first, premium. Do NOT use violet/teal or mix with Inter/Noto Sans. Source of truth for full tokens: `erp/DESIGN.md` and `erp/apps/web/src/app/globals.css`.

---

## Workflow Commands

This dev kit ships focused slash commands under `.opencode/command/` instead of the founder-only end-to-end `/work` flow:

- `harden` — module-hardening pass (audit, harden, review, gate).
- `verify` — verification loop before calling work done.
- `code-review` — structured review checklist.
- `tdd` — write tests first, then minimal implementation.
- `test-coverage` — coverage gate check.
- `update-codemaps` — regenerate `erp/docs/CODEMAPS/`.

Use the relevant command for the phase of work you're in rather than improvising an ad hoc process.
