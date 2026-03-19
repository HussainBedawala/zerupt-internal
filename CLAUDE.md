# Zerupt - Master Project Configuration

The world's first agentic AI retail ERP. Signup to live with real data in under 2 hours. MENA, Southeast Asia, India. Built by Hussain, solo founder.

- **Website:** zerupt.com (launching Eid 2026, March 19)
- **Linear workspace:** Zerupt (teams: Development, Marketing)
- **Socials:** @hussainbuildswithai (personal IG), @zerupt.erp (company IG)

---

## Quick Reference

### Git — Two Repos, Two Remotes

| Repo | Path | Remote | Content |
|------|------|--------|---------|
| `zerupt-erp` | `/Zerupt/erp/` | `github.com/HussainBedawala/zerupt-erp.git` | All code — apps, packages, migrations |
| `zerupt-internal` | `/Zerupt/` (root) | `github.com/HussainBedawala/zerupt-internal.git` | Non-code — CLAUDE.md, study/, agent-os/, .claude/ |

- NEVER mix them. Always `cd` to the correct directory before committing.
- **Always `cd /Users/hus3ain/Development/Zerupt/erp` before creating branches or committing code.**
- Both push to `origin main`. Root repo is private.

### Shell — Quote Paths With Brackets

`[locale]` directory causes zsh glob errors: `git add "apps/web/src/app/[locale]/layout.tsx"`

### Commits — Lowercase Subjects Only

commitlint enforces all-lowercase. Body lines must be under 100 characters.

### Per-App Commands

```bash
pnpm --filter @zerupt/web typecheck    # or test, i18n:check
pnpm --filter @zerupt/api typecheck    # or test
```

---

## Tech Stack (Non-Negotiable)

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.1.6 + React 19, TypeScript strict, shadcn/ui + Tailwind, TanStack Query, Zustand, next-intl v4 (ar/en) |
| Backend | NestJS modular monolith, Drizzle ORM, BullMQ + Upstash Redis, NestJS EventEmitter |
| AI Service | FastAPI (Python), LiteLLM, pgvector |
| Database | Neon Serverless Postgres (admin DB + per-tenant DBs), Supabase Auth |
| Hosting | Vercel (frontend), Railway (API + AI), Neon (Postgres), Supabase (Auth + Storage), Upstash (Redis) |
| Testing | Jest (API), Vitest (web), Playwright (E2E), pytest (AI) |
| CI/CD | GitHub Actions, Turborepo, pnpm workspaces |

## Architecture

- **Modular monolith** — NOT microservices. Solo founder = low ops.
- Event-driven side effects via NestJS EventEmitter. Future extraction possible per-module.
- **Multi-tenancy:** Central Admin DB (tenant registry, subscriptions) + per-tenant Postgres DBs.
- Supabase Auth (centralized), JWT carries tenant_id, TenantContextMiddleware resolves Drizzle connection.
- **Neon drivers:** Admin DB uses `neon-http`, Tenant DBs use `neon-serverless` (WebSocket pooling).
- **NestJS DI tokens:** `TENANT_DB` (per-request), `ADMIN_DB` (singleton).

## Monorepo Structure

```
erp/
  apps/web/ api/ ai/ website/
  packages/shared/ db/ db-admin/ tenant-context/ ui/
```

---

## Drizzle Migrations

Schema: `packages/db/src/schema/` (tenant) and `packages/db-admin/src/schema/` (admin). Config: `drizzle.config.ts` in each package.

| Var | DB | Purpose |
|-----|-----|---------|
| `DATABASE_TENANT_URL` | `zerupt_tenant_dev` | Dev tenant DB |
| `DATABASE_ADMIN_URL` | `zerupt_admin` | Central admin DB |

```bash
cd /Users/hus3ain/Development/Zerupt/erp/packages/db  # or db-admin
npx drizzle-kit generate   # Generate SQL (does NOT apply)
npx drizzle-kit migrate    # Apply pending migrations
npx drizzle-kit push       # Push schema directly (dev only)
npx drizzle-kit check      # Validate schema matches DB
```

For data backfills: `generate` → edit the SQL file → `migrate`. CHECK constraints and partial indexes work via `.check()` in schema definitions.

---

## Testing

Jest for API (`*.spec.ts` colocated). Use `--testPathPatterns` (plural, not singular — Jest changed this).

```bash
# IMPORTANT: --testPathPatterns (plural) silently finds 0 tests.
# Use npx jest <pattern> directly from erp/apps/api/:
cd /Users/hus3ain/Development/Zerupt/erp/apps/api
npx jest audit --no-coverage          # matches by filename
npx jest accounts.service --no-coverage
# Or via pnpm filter (singular --testPathPattern also unreliable in Jest 30):
pnpm --filter @zerupt/api test -- --testPathPatterns='audit' --no-coverage
```

`pnpm --filter @zerupt/api test` exits 0 even with no matches (passWithNoTests). Always verify "Test Suites: N" in output.

---

## Codebase Gotchas

- **next-intl `hasLocale`** — not exported in v4.8.3. Use type predicate: `routing.locales.includes(value)`
- **next-intl `setRequestLocale`** — must call in BOTH `generateMetadata` AND default export
- **next-intl `params`** — must `await params` in Next.js 16
- **Next.js 16 middleware** — file is `proxy.ts`, not `middleware.ts`
- **`suppressHydrationWarning`** — only on `<html>`, NEVER on `<body>`
- **Bidi isolation** — use `apps/web/src/lib/bidi.ts` for user content with unknown direction
- **Translations** — `en/` is source of truth. Run `pnpm --filter @zerupt/web i18n:check` to verify ar/en parity.
- **Jest 30 test path** — `--testPathPatterns` (plural) silently matches 0 files. Use `npx jest <filename-pattern>` from `erp/apps/api/` instead. Always check "Test Suites: N" in output to confirm tests actually ran.
- **Code review** — all findings (CRITICAL→LOW) fixed same session. Write to `erp/.review-findings.md` (gitignored), fix one by one, delete when done.

---

## Defensive UX (CRITICAL)

Assume users will break everything. MENA/India/SEA retail users are not tech-savvy.

- Every action needs: loading state, error state, empty state, success feedback
- Destructive actions MUST have confirmation dialogs
- Warn before data loss (unsaved changes, navigation away)
- Debounce/disable buttons after click
- Handle race conditions (double-clicks, concurrent edits, stale data)
- Validate client-side AND server-side
- Test with: "what's the dumbest thing a user could do here?"

---

## Working Conventions

- pnpm only (not npm/yarn)
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:` — all lowercase
- TypeScript strict mode everywhere
- CSS logical properties only (RTL/LTR) — never physical `margin-left`, `padding-right`
- i18n from day one: ar + en
- Immutable audit logs for every mutation
- Never hardcode secrets — use environment variables
- API-first: frontend consumes backend APIs

## Brand

| Element | Value |
|---------|-------|
| Primary | Violet #7C3AED | Secondary | Teal #14B8A6 | Neutral | Zinc #27272A |
| Fonts | IBM Plex Sans (Latin + Arabic + Devanagari — same family), IBM Plex Mono |
| Theme | Dark-first, premium |

Do NOT mix with Inter or Noto Sans (different design origins = visual inconsistency in mixed-script UI).

---

## Development SOP

**Run `/work` to execute the full development workflow.** It picks up a Linear issue and walks through: research → plan → TDD → review → verify → commit → study → content check.

**Run `/website` for website issues.** Handles design (Stitch MCP), copy (content-engine), build, review (website-review skill), and optional Remotion video.

## Linear Workflow

- **Development team:** engineering work linked to Phase projects
- **Marketing team:** content work. Statuses: Idea > Draft > Ready > Posted > Analyzed
- Dev tasks that ship visible features → create linked Marketing issue

### Linear Labels

| Category | Labels | Rules |
|----------|--------|-------|
| **Standalone** | `Frontend`, `Backend`, `Database`, `AI Service`, `Bug`, `Improvement`, `Feature` | Combine freely |
| **Type** (pick ONE) | `Design/UX`, `Documentation`, `Testing`, `Security`, `Infrastructure` | Exclusive group |
| **Module** (pick ONE) | `Settings`, `Accounting`, `Inventory`, `POS`, `Sales`, `Purchase`, `Onboarding`, `Dashboard`, `Reports`, `Search`, `AI/Agents` | Exclusive group |

---

## /work Reference Data

### Phase → Spec Path

| Phase | Spec | Also read |
|-------|------|-----------|
| 0 | `tech-stack.md` + `roadmap.md` | `erp/.env.example` |
| 1 | `settings-admin/` | |
| 2 | `accounting/` | |
| 3 | `inventory/` | |
| 4A/4B/4C | `pos/`, `sales/`, `purchase/` | |
| 5 | `onboarding/` | |
| 6 | `dashboard/` + `reports/` | |
| 7 | `agents/` | |
| Auth | any | `user-auth-management/` |

All specs at `agent-os/product/{path}`. Always read the spec before building.

### Phase → Branch Prefix

`phase-0` through `phase-8`, `phase-4a/4b/4c`, `website`. Format: `<prefix>/<DEV-XX>-<short-kebab>`

### Reviewer Dispatch (by label)

| Label | Additional reviewers |
|-------|---------------------|
| Always | `code-reviewer` |
| Frontend | + `frontend-reviewer` |
| Backend/API | + `nestjs-reviewer` + `api-reviewer` |
| Security/auth | + `security-reviewer` |
| Database | + `database-reviewer` + `neon-postgres` skill |
| AI Service/Python | + `python-reviewer` |
| Accounting | + `accounting-reviewer` |

### Coverage Targets

General: 80%+ | Financial/accounting: 100% | Auth/security: 100%

### Study Topics

`study/<phase>/<topic-kebab>/README.md` in root repo. Group by topic, not milestone.

---

## Self-Improvement Protocol

This file is a living document. Update it when:

1. **A gotcha is discovered** — add to Codebase Gotchas (e.g. library version quirks, Next.js behavior)
2. **A convention is established** — add to Working Conventions (e.g. "always use X pattern for Y")
3. **A gotcha is fixed upstream** — remove it (don't keep stale workarounds)
4. **A phase completes** — update Development Phases status if tracked here
5. **Tech stack changes** — update the table (e.g. Jest → Vitest migration)
6. **The /work flow changes** — update the reference data tables, not prose descriptions

**Rules for updating:**
- Keep under 250 lines. If it grows beyond, something should move to `.claude/rules/` or `agent-os/`.
- Prefer tables over prose. Tables are faster for AI to parse.
- Never duplicate what's in `.claude/rules/` (coding style, security, testing patterns are there).
- Never duplicate what's in command files (the `/work` and `/website` commands own their own logic).
- This file owns: identity, architecture decisions, gotchas, reference data, and conventions.
