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

## Prisma Migrations — How They Work

The tenant DB schema lives at `erp/packages/db/prisma/schema.prisma`. Prisma config is at `erp/packages/db/prisma.config.ts` (loads `.env` automatically via dotenv).

### Database URLs (from `.env`)

| Var | DB | Purpose |
|-----|-----|---------|
| `DATABASE_TENANT_URL` | `zerupt_tenant_dev` | Dev tenant DB — where migrations apply |
| `SHADOW_DATABASE_URL` | `zerupt_tenant_shadow` | Shadow DB — Prisma uses this to validate migrations replay from scratch |
| `DATABASE_ADMIN_URL` | `zerupt_admin` | Central admin DB (separate Prisma schema at `packages/db-admin/`) |

### How to run migrations

Always run from `erp/packages/db/`:

```bash
cd /Users/hus3ain/Development/Zerupt/erp/packages/db

# Check current status (no-op, safe)
npx prisma migrate status

# Generate migration SQL WITHOUT applying (for hand-editing)
npx prisma migrate dev --create-only --name descriptive_name_here

# Apply all pending migrations (pipe empty stdin to avoid interactive prompts)
echo "" | npx prisma migrate dev

# Just regenerate the Prisma client (no DB changes)
npx prisma generate
```

### Non-interactive Prisma commands (CRITICAL)

Always pipe empty stdin to `prisma migrate dev` to prevent interactive prompts that hang in CLI:
```bash
echo "" | npx prisma migrate dev
```
Other Prisma commands (`migrate status`, `generate`, `migrate dev --create-only`) are safe without this.

### Migration timestamp ordering (CRITICAL)

Prisma replays all migrations in **alphabetical order by directory name** (which is timestamp-prefixed). A new migration that references a table from a previous migration MUST have a later timestamp. If you use `--create-only`, Prisma auto-generates the timestamp. If you hand-create a migration directory, ensure its timestamp sorts AFTER all migrations it depends on.

**Example:** If `20260314200000_add_warehouse` creates the `warehouses` table, a new migration referencing `warehouses` must use a timestamp > `20260314200000`.

### Hand-editing migrations

When a migration needs data backfill or raw SQL (CHECK constraints, partial indexes), use this flow:

1. `npx prisma migrate dev --create-only --name descriptive_name` — generates SQL shell
2. Edit the SQL file in `prisma/migrations/<timestamp>_<name>/migration.sql`
3. `npx prisma migrate dev` — applies the edited SQL

**Common hand-edits:**
- Adding a non-nullable FK to an existing table: add column as nullable → backfill → set NOT NULL → add FK
- CHECK constraints (Prisma doesn't generate these)
- Partial unique indexes (Prisma generates these correctly with `partialIndexes` preview feature, but verify)

### Shadow database errors

If you see `P3006: Migration failed to apply cleanly to the shadow database`:
- The shadow DB (`zerupt_tenant_shadow`) must exist. Create it: `docker exec zerupt_postgres psql -U zerupt -d postgres -c "CREATE DATABASE zerupt_tenant_shadow;"`
- Check migration timestamp ordering (see above)
- Check that `SHADOW_DATABASE_URL` is set in `.env`

### Never rename a migration directory after it has been applied

Prisma records the migration directory name in `_prisma_migrations`. Renaming the directory creates a mismatch and forces a DB reset. If you must rename, update the `migration_name` column in `_prisma_migrations` to match.

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

All findings (CRITICAL → LOW) need an action: code fix, or explicit comment explaining deferral. Do not skip LOW findings silently.

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
| Backend | NestJS modular monolith, Prisma ORM, BullMQ + Upstash Redis, NestJS EventEmitter |
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
- TenantContextMiddleware resolves DB connection per request

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
    db/               # Prisma schema (tenant DBs)
    db-admin/         # Prisma schema (central admin DB)
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
