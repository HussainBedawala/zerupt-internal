# Zerupt - Master Project Configuration

## What is Zerupt?

The world's first agentic AI retail ERP. Signup to live with real data in under 2 hours, targeting MENA, Southeast Asia, and India. Built by Hussain, solo founder.

- **Website:** zerupt.com (launching Eid 2026, March 19)
- **Personal IG:** @hussainbuildswithai
- **Company IG:** @zerupt.erp
- **Linear workspace:** Zerupt (teams: Development, Marketing)

---

## Quick Reference (Read This First)

### Git — Two Repos, Two Remotes

| Repo | Path | Remote | What goes here |
|------|------|--------|----------------|
| `zerupt-erp` | `/Zerupt/erp/` | `https://github.com/HussainBedawala/zerupt-erp.git` | All **code** — apps, packages, migrations |
| `zerupt-internal` | `/Zerupt/` (root) | `https://github.com/HussainBedawala/zerupt-internal.git` | **Non-code only** — `CLAUDE.md`, `study/`, `agent-os/`, `.claude/` config |

**Rules (enforce strictly):**
- NEVER commit code to the root repo
- NEVER commit study/config files to `erp/`
- Always `cd` to the correct directory before committing
- Both repos push to `origin main`
- Root repo is **private** on GitHub

**Always `cd /Users/hus3ain/Development/Zerupt/erp` before creating branches or committing code.**

### Shell — Quote Paths With Brackets

The `[locale]` directory causes zsh glob errors. Always quote it:

```bash
git add "apps/web/src/app/[locale]/layout.tsx"   # correct
git add apps/web/src/app/[locale]/layout.tsx       # fails
```

### Commits — Lowercase Subjects Only

commitlint enforces all-lowercase subject lines. Will reject on pre-commit hook:

```
feat(web): add bidi isolation utility   # correct
feat(web): Add Bidi Isolation Utility   # rejected
```

### Per-App Commands

```bash
pnpm --filter @zerupt/web typecheck
pnpm --filter @zerupt/web test
pnpm --filter @zerupt/web i18n:check
pnpm --filter @zerupt/api typecheck
```

---

## Testing — How to Run Tests

Tests use **Jest** (not Vitest) for the API. Config is at `erp/apps/api/jest.config.js`. Test files are colocated with source files as `*.spec.ts`.

```bash
# Run all API tests
pnpm --filter @zerupt/api test

# Run tests matching a pattern (from erp/apps/api/)
cd /Users/hus3ain/Development/Zerupt/erp/apps/api && npx jest --testPathPatterns='audit' --no-coverage

# Run a single test file
npx jest src/audit/audit-log.service.spec.ts --no-coverage

# pnpm filter passes args after --
pnpm --filter @zerupt/api test -- --testPathPatterns='audit' --no-coverage
```

**Important:** `pnpm --filter @zerupt/api test` runs `jest --passWithNoTests`. If no tests match, it exits 0 silently. Always verify test discovery by checking the output for "Test Suites: N" lines.

---

## Drizzle Migrations — How They Work

The tenant DB schema lives at `erp/packages/db/src/schema/` as TypeScript table definitions. Drizzle config is at `erp/packages/db/drizzle.config.ts`.

### Database URLs (from `.env`)

| Var | DB | Purpose |
|-----|-----|---------|
| `DATABASE_TENANT_URL` | `zerupt_tenant_dev` | Dev tenant DB — where migrations apply |
| `DATABASE_ADMIN_URL` | `zerupt_admin` | Central admin DB (separate Drizzle schema at `packages/db-admin/`) |

No shadow database needed — Drizzle validates migrations without one.

### How to run migrations

Always run from `erp/packages/db/` (or `erp/packages/db-admin/` for admin):

```bash
cd /Users/hus3ain/Development/Zerupt/erp/packages/db

# Generate migration SQL from schema changes (does NOT apply)
npx drizzle-kit generate

# Apply pending migrations to the database
npx drizzle-kit migrate

# Push schema directly to dev DB (skips migration files — dev only)
npx drizzle-kit push

# Pull existing DB schema into Drizzle format (introspection)
npx drizzle-kit pull

# Validate schema matches live DB
npx drizzle-kit check

# Open Drizzle Studio (web-based DB browser)
npx drizzle-kit studio
```

### Schema organization

Schemas are TypeScript files in `packages/db/src/schema/`, one file per domain:
- `enums.ts` — all `pgEnum` definitions
- `tenant-identity.ts`, `rbac.ts`, `org-structure.ts`, `currency.ts`, `fiscal.ts`, `tax.ts`, `audit.ts`, `document-sequence.ts`, `notifications.ts`
- `relations.ts` — all Drizzle `relations()` definitions
- `index.ts` — barrel export

No `generate` step for types — Drizzle infers types directly from the TypeScript schema.

### Hand-editing migrations

When a migration needs data backfill or raw SQL:

1. `npx drizzle-kit generate` — generates SQL file in `drizzle/` (or configured output dir)
2. Edit the generated SQL file
3. `npx drizzle-kit migrate` — applies the edited SQL

### CHECK constraints and partial indexes

Drizzle supports these directly in schema definitions via `.check()` and custom index expressions. No hand-editing needed for most cases.

### Neon driver strategy

- **Admin DB:** `drizzle-orm/neon-http` (stateless, lightweight)
- **Tenant DBs:** `drizzle-orm/neon-serverless` (WebSocket pooling, supports transactions)

### NestJS DI tokens

- `TENANT_DB` — per-request Drizzle instance for tenant database
- `ADMIN_DB` — singleton Drizzle instance for admin database

---

## Codebase Gotchas

Discovered during development — do not re-research these.

### Jest — `--testPathPattern` Is Removed

Jest replaced `--testPathPattern` with `--testPathPatterns` (plural). Use `--testPathPatterns` in all CLI invocations.

### next-intl — `hasLocale` Does Not Exist in v4.8.3

Docs examples show `hasLocale()` but it is not exported in v4.8.3 (current, also latest). Use a type predicate instead:

```ts
function isLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value);
}
if (!isLocale(locale)) notFound();
// locale is now Locale — no cast needed
```

### next-intl — `setRequestLocale` Must Be Called in Both Exports

`generateMetadata` and the default layout export run in separate React trees. Call it in both:

```ts
export async function generateMetadata({ params }) {
  const { locale } = await params;
  setRequestLocale(locale); // required here
  const t = await getTranslations({ locale, namespace: 'common' });
  return { title: t('appName') };
}

export default async function LocaleLayout({ params }) {
  const { locale } = await params;
  setRequestLocale(locale); // required here too
}
```

### next-intl — `params` Must Be Awaited (Next.js 16)

```ts
const { locale } = await params;   // correct
const { locale } = params;          // wrong — silently breaks in Next.js 16
```

### Next.js 16 — `proxy.ts` Not `middleware.ts`

Next.js 16 renamed middleware. The next-intl middleware lives at `apps/web/src/proxy.ts`.

### `suppressHydrationWarning` — `<html>` Only, Never `<body>`

On `<html>`: correct — browser extensions modify its attributes.
On `<body>`: wrong — silences real SSR/CSR mismatch bugs during development.

### Bidi — User Content Needs Isolation

Product names, customer names have unknown direction. Use `apps/web/src/lib/bidi.ts`:

```ts
// Inside a translated string:
t('greeting', { name: isolateText(customer.name) })

// As a JSX container:
<p dir={getContentDir(product.name)}>{product.name}</p>
```

### Translations — `en/` Is Source of Truth

`messages/ar/*.json` must have the same keys as `messages/en/*.json`. Verify with `pnpm --filter @zerupt/web i18n:check`. Fails CI on mismatch.

### Code Review — Fix Everything

All findings (CRITICAL → LOW) get fixed in the same session. Write findings to `erp/.review-findings.md` (gitignored), fix one by one, delete when done. Only create a Linear issue if the fix belongs to a different phase/module. See `/work` Phase 7 for the full workflow.

---

## Directory Structure

```
/Zerupt/
  CLAUDE.md              <- You are here. Master config.
  .claude/               <- All Claude Code config (agents, skills, commands, hooks, rules)
    agents/              <- 11 specialized agents (planner, code-reviewer, tdd-guide, etc.)
    skills/              <- 25 skills (coding-standards, backend-patterns, security-review, etc.)
    commands/            <- Slash commands (/work, /plan, /tdd, /verify, etc.)
    hooks/               <- Auto-triggered hooks (format, typecheck, security warnings)
    rules/               <- Always-active rules (common + typescript + python)
  agent-os/              <- Product specs, roadmap, module designs (CANONICAL source of truth)
  erp/                   <- Codebase monorepo (Phase 0+)
  study/                 <- Auto-generated learning topics per phase/milestone
  content/               <- Build-in-public content assets
```

## Tech Stack (Non-Negotiable)

| Layer | Technology |
|-------|-----------|
| Frontend | **Next.js 16.1.6** + React 19, TypeScript strict, shadcn/ui + Tailwind, TanStack Query, Zustand, next-intl v4 (ar/en) |
| Backend | NestJS modular monolith, Drizzle ORM, BullMQ + Upstash Redis, NestJS EventEmitter |
| AI Service | FastAPI (Python), LiteLLM, pgvector |
| Database | Neon Serverless Postgres (admin DB + per-tenant DBs + pgvector), Supabase Auth |
| Search | Meilisearch |
| Hosting | Vercel (frontend), Railway (API + AI), Neon (all PostgreSQL), Supabase (Auth + Storage), Upstash (Redis) |
| Testing | Vitest (unit/integration, web+api), Playwright (E2E), k6 (load), pytest (AI service) |
| CI/CD | GitHub Actions, Turborepo, pnpm workspaces |
| Observability | Sentry, PostHog, Uptime Kuma, Resend (email) |

## Architecture: Modular Monolith

- NOT microservices. Solo founder = low ops complexity.
- Per-module pricing is entitlement/RBAC, not service boundaries.
- Event-driven side effects between modules via NestJS EventEmitter.
- Future extraction possible module-by-module via event contracts.

## Multi-Tenancy Model

- Central Admin DB: tenant registry, subscriptions, user-tenant mapping
- Per-tenant PostgreSQL DBs: all business data + pgvector + audit trail
- Supabase Auth (centralized): JWT carries tenant_id
- TenantContextMiddleware resolves Drizzle DB connection per request

## Monorepo Structure (Target)

```
erp/
  apps/
    web/              # Next.js ERP frontend
    api/              # NestJS modular monolith
    ai/               # FastAPI AI service
    website/          # Next.js marketing site (zerupt.com)
  packages/
    shared/           # Shared types/constants/zod schemas
    db/               # Drizzle schema (tenant DBs)
    db-admin/         # Drizzle schema (central admin DB)
    tenant-context/   # Tenant router + request context utilities
    ui/               # Shared UI components (shadcn/ui based)
  turbo.json
  package.json
  docker-compose.yml  # Local: Redis, Meilisearch (DBs are on Neon)
```

## Development Phases (Linear Projects)

| Phase | Project | Status | Priority |
|-------|---------|--------|----------|
| 0 | Dev Environment & Infrastructure | In Progress | Urgent |
| 1 | Settings & Admin | Backlog | Urgent |
| 2 | Accounting Engine | Backlog | Urgent |
| 3 | Inventory Engine | Backlog | Urgent |
| 4A | POS Engine | Backlog | High |
| 4B | Sales Module | Backlog | High |
| 4C | Purchase Module | Backlog | High |
| 5 | Onboarding System | Backlog | High |
| 6 | Dashboard, Reports & Search | Backlog | Medium |
| 7 | AI Layer | Backlog | Medium |
| 8 | GTM & Launch | Backlog | Medium |

**Dependency order:** Settings -> Accounting -> Inventory -> POS/Sales/Purchase (parallel) -> Onboarding -> Dashboard/Reports -> AI -> GTM

## Product Specs Reference

All canonical product specs live in `agent-os/product/`. When building any module:

1. Read the module's README first: `agent-os/product/{module}/README.md`
2. Read numbered spec files in order: `01-architecture.md`, `02-...`, etc.
3. Check cross-module contracts: `*-cross-module-contracts.md`
4. Check event mappings: `*-event-mappings.md`
5. For auth/RBAC: `agent-os/user-auth-management/`
6. For tech decisions: `agent-os/product/tech-stack.md`

**agent-os is the canonical source for domain logic. Never guess — always read the spec first.**

## Content & Build-in-Public

Hussain builds in public on Instagram (personal + company) and X (planned).

- Content style guide: `agent-os/content-style-guide.md`
- Build-in-public plan: `agent-os/build-in-public-plan.md`
- Content tracked in Linear Marketing team
- Dev work IS content — extract content from what gets shipped
- Max 30-45 min/day on content

## Brand

| Element | Value |
|---------|-------|
| Primary color | Violet (#7C3AED / Tailwind violet-600) |
| Secondary color | Teal (#14B8A6 / Tailwind teal-500) |
| Neutral | Zinc (#27272A / Tailwind zinc-800 for dark backgrounds) |
| Heading font | IBM Plex Sans (Latin) |
| Body font | IBM Plex Sans (Latin) |
| Arabic font | IBM Plex Sans Arabic (same family — harmonizes with Latin) |
| Devanagari font | IBM Plex Sans Devanagari (same family — for Hindi/IN market) |
| Mono font | IBM Plex Mono |
| Logo | Two upward-pointing triangles (violet gradient) + circle dot |
| Theme | Dark-first, premium feel |

**Font rationale:** IBM Plex Sans, IBM Plex Sans Arabic, and IBM Plex Sans Devanagari are cuts from the same type family — same x-height, weight scale, proportions. Harmonious across Arabic, Latin, and Devanagari. Do NOT mix with Inter or Noto Sans (different design origins = visual inconsistency in mixed-script UI).

## Development SOP

**Run `/work` to execute the full development workflow. It handles everything.**

The `/work` command:
1. Picks the next Linear issue (by phase → milestone → priority → order)
2. Creates a branch (`<phase>/<DEV-XX>-<short-description>`)
3. Reads the relevant product spec from agent-os
4. Fetches latest package docs via context7 MCP
5. Plans the implementation (planner agent, pauses for approval)
6. Writes tests first (tdd-guide agent, RED → GREEN → REFACTOR)
7. Runs code review (code-reviewer + security-reviewer + database-reviewer as needed)
8. Verifies (build, types, lint, tests, security)
9. Commits and pushes with conventional commit format
10. Updates Linear (status → Done, adds implementation comment)
11. Generates study topics in `study/<phase>/<milestone>/`
12. Creates content issue in Marketing team if content-worthy
13. Asks if you want to start the next issue

Command file: `.claude/commands/work.md`
Detailed SOP reference: `agent-os/development-sop.md`

## Website Development SOP

**Run `/website` to execute the website development workflow.**

The `/website` command handles zerupt.com landing page and marketing site work:
1. Picks the next website issue from Linear (Website project or label)
2. Creates a branch (`website/<DEV-XX>-<description>`)
3. Reads context (mission, content-style-guide, design tokens, existing pages)
4. Fetches docs for Next.js, Tailwind, GSAP, shadcn/ui, etc.
5. Designs via Stitch MCP (new pages) or frontend-design skill (edits)
6. Generates copy using content-engine skill (with SEO patterns)
7. Builds with TDD (Playwright E2E tests)
8. Reviews using website-review skill (SEO, a11y, perf, copy, brand)
9. Verifies (build, lint, test, Lighthouse 90+)
10. Offers optional Remotion video generation for social content
11. Commits, pushes, updates Linear
12. Creates Marketing issue if content-worthy
13. Prepares next website issue

**Website skills available:**
- `stitch-design-md` — Extract design system from Stitch screens
- `stitch-enhance-prompt` — Optimize prompts for Stitch generation
- `stitch-react-components` — Convert Stitch HTML to React
- `stitch-loop` — Iterative autonomous website building
- `stitch-remotion` — Generate walkthrough videos
- `shadcn-ui` — shadcn/ui component integration
- `frontend-design` — Distinctive UI design patterns
- `video-to-website` — Scroll-driven animated websites
- `content-engine` — Marketing copy + SEO patterns
- `website-review` — Quality assurance checklist
- `nano-banana-images` — AI image generation via Kie.ai

Command file: `.claude/commands/website.md`

## Study Guide

Auto-generated learning topics at `study/`. Each completed issue adds topics for what you should understand as the solo CTO. Study between dev sessions.

## Claude Code Config (.claude/)

All agents, skills, commands, hooks, and rules live in `.claude/`. Tuned for Zerupt's stack (TypeScript + Python only).

**Agents (11):** planner, architect, code-reviewer, security-reviewer, build-error-resolver, e2e-runner, refactor-cleaner, database-reviewer, python-reviewer, tdd-guide, doc-updater

**Key commands:** /work (full SOP), /website (website SOP), /plan, /tdd, /build-fix, /code-review, /e2e, /verify, /learn

**Hooks:** Auto-format (Prettier/black), auto-typecheck (tsc/mypy), console.log warnings, session persistence, continuous learning

**Rules:** Always active — common (immutability, security, patterns), typescript (Zod, async/await), python (PEP 8, type hints, frozen dataclasses)

## Working Conventions

- Always use pnpm (not npm/yarn)
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- **Commit message subjects must be all lowercase** — commitlint enforces this
- TypeScript strict mode everywhere
- CSS logical properties only (RTL/LTR support) — never physical `margin-left`, `padding-right` etc.
- i18n from day one: ar + en at launch
- Immutable audit logs for every mutation
- Never hardcode secrets — use environment variables
- API-first: frontend is a consumer of backend APIs
- JSON metadata for configurable behavior (reports, dashboards, permissions)

## Linear Workflow

- **Development team:** All engineering work. Issues linked to Phase projects.
- **Marketing team:** All content work. Statuses: Idea > Draft > Ready > Posted > Analyzed.
- When a dev task completes, create a linked content issue in Marketing if it's content-worthy.
