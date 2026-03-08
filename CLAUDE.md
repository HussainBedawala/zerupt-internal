# Zerupt - Master Project Configuration

## What is Zerupt?

The world's first agentic AI retail ERP. Signup to live with real data in under 2 hours, targeting MENA, Southeast Asia, and India. Built by Hussain, solo founder.

- **Website:** zerupt.com (launching Eid 2026, March 19)
- **Personal IG:** @hussainbuildswithai
- **Company IG:** @zerupt.erp
- **Linear workspace:** Zerupt (teams: Development, Marketing)

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
  website/               <- Landing page (static, Vercel)
```

## Tech Stack (Non-Negotiable)

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 + React 19, TypeScript strict, shadcn/ui + Tailwind, TanStack Query, Zustand, next-intl (ar/en) |
| Backend | NestJS modular monolith, Prisma ORM, BullMQ + Upstash Redis, NestJS EventEmitter |
| AI Service | FastAPI (Python), LiteLLM, pgvector |
| Database | PostgreSQL (one DB per tenant + Central Admin DB), Supabase Auth + Storage |
| Search | Meilisearch |
| Hosting | Vercel (frontend), Railway (API + AI), Supabase/Neon (DBs), Upstash (Redis) |
| Testing | Vitest/Jest (unit), Supertest (integration), Playwright (E2E), k6 (load), pytest (AI service) |
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
    web/              # Next.js frontend
    api/              # NestJS modular monolith
    ai/               # FastAPI AI service
  packages/
    shared/           # Shared types/constants/zod schemas
    db/               # Prisma schema (tenant DBs)
    db-admin/         # Prisma schema (central admin DB)
    tenant-context/   # Tenant router + request context utilities
    ui/               # Shared UI components (shadcn/ui based)
  turbo.json
  package.json
  docker-compose.yml  # Local: Postgres, Redis, Meilisearch
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
| Heading font | IBM Plex Sans |
| Body font | IBM Plex Sans |
| Mono font | IBM Plex Mono |
| Logo | Two upward-pointing triangles (violet gradient) + circle dot |
| Theme | Dark-first, premium feel |

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

## Study Guide

Auto-generated learning topics at `study/`. Each completed issue adds topics for what you should understand as the solo CTO. Study between dev sessions.

## Claude Code Config (.claude/)

All agents, skills, commands, hooks, and rules live in `.claude/`. Tuned for Zerupt's stack (TypeScript + Python only).

**Agents (11):** planner, architect, code-reviewer, security-reviewer, build-error-resolver, e2e-runner, refactor-cleaner, database-reviewer, python-reviewer, tdd-guide, doc-updater

**Key commands:** /work (full SOP), /plan, /tdd, /build-fix, /code-review, /e2e, /verify, /learn

**Hooks:** Auto-format (Prettier/black), auto-typecheck (tsc/mypy), console.log warnings, session persistence, continuous learning

**Rules:** Always active — common (immutability, security, patterns), typescript (Zod, async/await), python (PEP 8, type hints, frozen dataclasses)

## Working Conventions

- Always use pnpm (not npm/yarn)
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- TypeScript strict mode everywhere
- CSS logical properties only (RTL/LTR support)
- i18n from day one: ar + en at launch
- Immutable audit logs for every mutation
- Never hardcode secrets — use environment variables
- API-first: frontend is a consumer of backend APIs
- JSON metadata for configurable behavior (reports, dashboards, permissions)

## Linear Workflow

- **Development team:** All engineering work. Issues linked to Phase projects.
- **Marketing team:** All content work. Statuses: Idea > Draft > Ready > Posted > Analyzed.
- When a dev task completes, create a linked content issue in Marketing if it's content-worthy.
