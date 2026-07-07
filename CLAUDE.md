# Zerupt - Master Project Configuration

The world's first agentic AI retail ERP. Signup to live with real data in under 2 hours. MENA, Southeast Asia, India. Built by Hussain, solo founder.

- **Website:** zerupt.com (launching June 15, 2026 — MVP) · **Linear:** Zerupt (Development, Marketing) · **Socials:** @hussainbuildswithai (personal), @zerupt.erp (company)

---

## Model & Subagent Policy (CRITICAL — cost control)

**Default to delegating work to subagents, and match the model to the task.** Do NOT do everything inline on the default/Opus model — large models burn cost and main-context budget when a smaller one would do the job. For any non-trivial task or question:

1. **Delegate to a subagent** (via the Agent tool) so the heavy reading/searching stays out of main context — keep the main loop lean.
2. **Pick the cheapest model that can do the job well** by assigning `model` on the Agent call. Match by capability TIER, not by model name — model IDs churn every few months, the tiers don't. Swap only the right-hand column when the lineup changes.

| Capability tier (durable) | Use for | Current model (swap as lineup changes) |
|------|------|------|
| **Cheap/fast** | Search, file lookup, listing, mechanical edits, simple Q&A | `haiku` |
| **Standard** | Standard coding, reviews, docs, multi-file changes, most `/work` steps | `sonnet` |
| **Top** | Hard architecture, tricky debugging, deep reasoning, financial/accounting correctness | `opus` (justify before using) |

3. **Never reach for the top tier by default.** Justify it before using; prefer Standard, fall back to Cheap/fast for trivial work. When unsure, start smaller and escalate only if the smaller model struggles.

---

## How We Build (applies to EVERY coding task — main loop AND subagents)

Default posture for all code in this repo. Not a mode you switch on — it is how we code here, always.

### Lazy-first ladder — understand, then climb to the first rung that holds

Read the code the change touches and trace the real flow FIRST (start at the codemap). Never shorten the reading, only the solution. Then:

1. **Does this need to exist at all?** Speculative = skip it, say so in one line. (YAGNI)
2. **Already in the monorepo? Reuse it.** Look in this order: `erp/docs/CODEMAPS/<module>.md` → `packages/shared` + `packages/ui` → the canonical primitives (`formatMoneyAmount` / `formatQuantity` / `MoneyInput` / `QuantityInput` / shared entity pickers / percent inputs — **NEVER hand-roll these**) → shared domain services (`ApAgingService`, `resolvePackUnit`, `runDurableGated`). Re-implementing what lives a few files over is the most common slop. To find existing code / blast radius fast, query the **code graph** (lens, not dependency): `graphify query "<what>" --graph study/ops/graphify/graph.json` (or `explain`/`affected`/`path`). See `study/ops/graphify/README.md`. Architecture drift (deps must point DOWN toward accounting/inventory) is mechanically enforced by `study/ops/graphify/check-drift.sh` — `/harden` gates on it.
3. **Framework/stdlib does it?** Use it (Next 16, Nest built-ins, Drizzle, date-fns).
4. **Native platform feature?** DB CHECK constraint over app validation, CSS over JS, Postgres over hand-rolled logic, shadcn/ui over a custom component.
5. **Already-installed dependency?** Use it. Never add a dep for what a few lines do — check `package.json` first.
6. **One line?** One line.
7. **Only then:** the minimum code that works.

Bug fix = root cause, not symptom: grep every caller, fix the shared function once, not per-caller. Deletion over addition; boring over clever; many small focused files (200-400 lines, 800 max). Shortest working diff wins — but the smallest change in the wrong place is a second bug, so understand first. Mark deliberate shortcuts `// ponytail: <ceiling>, <upgrade trigger>`. For a focused pass or to dial intensity, invoke the `ponytail` / `ponytail-review` / `ponytail-audit` / `ponytail-debt` skills.

### Delegation mandate (CRITICAL — this is how the ladder reaches the agents that actually write code)

Most code here is written by delegated subagents, and they do NOT reliably inherit this file. So enforcement lives in the delegation prompt, not in hope:

- When you delegate an **implementation** task (writing / refactoring / fixing code — e.g. general-purpose, `build-error-resolver`, `tdd-guide`), you MUST paste the lazy-first ladder + the reuse targets above into the subagent's prompt. Assume the subagent starts blank.
- **Do NOT** put lazy/minimal framing into **reviewer or auditor** subagents (`code-reviewer`, `accounting-reviewer`, `security-reviewer`, `nestjs-reviewer`, `database-reviewer`, etc.). They must stay maximally paranoid. Lazy is for building — never for guarding money / auth / tenant paths.

### Never lazy about (non-negotiable, whatever the rung)

- **Understanding the problem** before editing.
- **Money / accounting correctness** — double-entry balance, VAT/GST, COGS, multi-currency, period controls. FX fails loud, never silently defaults. 100% test coverage.
- **Multi-tenant isolation** — every query tenant-scoped; never leak across tenants to save a line.
- **Auth / security** — 100% coverage, validate client AND server, never hardcode secrets, immutable audit log for every mutation.
- **Defensive UX** — MENA/India/SEA retail users aren't tech-savvy. Every action needs loading/error/empty/success states; confirm destructive actions; debounce buttons; handle race conditions; warn before data loss. Ask "what's the dumbest thing a user could do here?"
- **Immutability** — return new objects, never mutate in place (mechanics in `~/.claude/rules/common/coding-style.md`).
- **i18n from day one** — ar + en, `en/` is source of truth, never hardcode strings. CSS logical properties only (RTL/LTR), never physical `margin-left`/`padding-right`.
- **No em dashes** in product copy or UI strings.

### House mechanics

pnpm only · conventional commits (all lowercase, body <100 chars) · TypeScript strict everywhere · API-first.

---

## Quick Reference

### Git — Two Repos, Two Remotes

| Repo | Path | Remote | Content |
|------|------|--------|---------|
| `zerupt-erp` | `/Zerupt/erp/` | `github.com/HussainBedawala/zerupt-erp.git` | All code — apps, packages, migrations |
| `zerupt-internal` | `/Zerupt/` (root) | `github.com/HussainBedawala/zerupt-internal.git` | Non-code — CLAUDE.md, study/, agent-os/, .claude/ |

- NEVER mix them. **Always `cd /Users/hus3ain/Development/Zerupt/erp` before branching/committing code.**
- Both push to `origin main`. Root repo is private.
- **Shell:** quote bracket paths (`[locale]` breaks zsh globs): `git add "apps/web/src/app/[locale]/layout.tsx"`
- **Commits:** commitlint enforces all-lowercase subjects; body lines under 100 chars.

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
| Backend | NestJS modular monolith, Drizzle ORM, pg-boss queue on Neon (no Redis), NestJS EventEmitter |
| AI Service | FastAPI (Python), LiteLLM, pgvector |
| Database | Neon Serverless Postgres (admin DB + per-tenant DBs), Supabase Auth |
| Hosting | Vercel (frontend), Railway (API + AI), Neon (Postgres), Supabase (Auth + Storage) |
| Testing | Jest (API), Vitest (web), Playwright (E2E), pytest (AI) |
| CI/CD | GitHub Actions, Turborepo, pnpm workspaces |

## Architecture

- **Modular monolith** — NOT microservices. Solo founder = low ops. Event-driven side effects via NestJS EventEmitter.
- **Multi-tenancy:** Central Admin DB (tenant registry, subscriptions) + per-tenant Postgres DBs. Supabase Auth (centralized), JWT carries tenant_id, TenantContextMiddleware resolves the Drizzle connection.
- **Neon drivers:** Admin DB → `neon-http`; Tenant DBs → `neon-serverless` (WebSocket pooling).
- **NestJS DI tokens:** `TENANT_DB` (per-request), `ADMIN_DB` (singleton).

## Monorepo Structure

```
erp/
  apps/web/ api/ ai/ website/
  packages/shared/ db/ db-admin/ tenant-context/ ui/
  docs/CODEMAPS/   ← module-level file maps (read FIRST before exploring)
```

**Codemaps** (`erp/docs/CODEMAPS/{module}.md`) are pre-computed indexes of routes, services, DB tables, and file paths. Read the relevant codemap before exploring code; `/update-codemaps` regenerates them.

---

## Drizzle Migrations

Schema in `packages/db/src/schema/` (tenant) and `packages/db-admin/src/schema/` (admin); each has its own `drizzle.config.ts`. Env: `DATABASE_TENANT_URL` → `zerupt_tenant_dev`, `DATABASE_ADMIN_URL` → `zerupt_admin`.

```bash
cd /Users/hus3ain/Development/Zerupt/erp/packages/db   # or db-admin
npx drizzle-kit generate   # SQL only (no apply)   ·   migrate   # apply pending
npx drizzle-kit push       # direct push (dev only) ·   check     # validate vs DB
```

Data backfills: `generate` → edit the SQL → `migrate`. CHECK constraints / partial indexes via `.check()` in schema.

---

## Testing

Jest for API (`*.spec.ts` colocated). **`--testPathPatterns` (plural) silently matches 0 files** in Jest 30 — run `npx jest <filename-pattern>` from `erp/apps/api/` instead, and always confirm "Test Suites: N" in output (`pnpm ... test` exits 0 with no matches via passWithNoTests).

```bash
cd /Users/hus3ain/Development/Zerupt/erp/apps/api
npx jest audit --no-coverage         # matches by filename
```

---

## Codebase Gotchas

- **next-intl `hasLocale`** — not exported in v4.8.3. Use `routing.locales.includes(value)`
- **next-intl `setRequestLocale`** — call in BOTH `generateMetadata` AND default export
- **next-intl `params`** — must `await params` in Next.js 16
- **Next.js 16 middleware** — file is `proxy.ts`, not `middleware.ts`
- **`suppressHydrationWarning`** — only on `<html>`, NEVER on `<body>`
- **Bidi isolation** — use `apps/web/src/lib/bidi.ts` for user content with unknown direction
- **Translations** — `en/` is source of truth; `pnpm --filter @zerupt/web i18n:check` verifies ar/en parity
- **Code review** — fix all findings (CRITICAL→LOW) same session. Write to `erp/.review-findings.md` (gitignored), fix one by one, delete when done.

---

## Brand

Warm cream `#F9F7F5` (canvas) · Ink `#141310` (text/primary) · Citron `#979C1A` (the one accent) · Olive `#747818`/`#454729` (data viz). Citron is **fill/accent only** — never text on light (fails WCAG); citron-toned text uses olive-deep. Primary actions are ink. Fonts: IBM Plex Sans (Latin + Arabic + Devanagari, same family) + IBM Plex Mono. Dark-first, premium. Do NOT use violet/teal (old palette) or mix with Inter/Noto Sans. **Source of truth: `erp/DESIGN.md`** + tokens in `erp/apps/web/src/app/globals.css`.

---

## Development SOP

- **`/work`** — full dev workflow from a Linear issue: research → plan → TDD → review → verify → commit → study → content check.
- **`/website`** — website issues: design (Stitch MCP), copy (content-engine), build, review (website-review skill), optional Remotion video.
- **`/harden <module>`** — ledger-first module-hardening program (audit → harden backend+frontend → review panel → gate → commit-with-sha → log). Resumable via `study/<module>/_hardening-log.md`. The process behind the accounting/inventory/purchase/sales/POS programs.

### Linear Workflow

Development team → engineering linked to Phase projects. Marketing team → content (Idea > Draft > Ready > Posted > Analyzed). Dev tasks shipping visible features → create a linked Marketing issue.

| Category | Labels | Rules |
|----------|--------|-------|
| **Standalone** | `Frontend`, `Backend`, `Database`, `AI Service`, `Bug`, `Improvement`, `Feature` | Combine freely |
| **Type** (pick ONE) | `Design/UX`, `Documentation`, `Testing`, `Security`, `Infrastructure` | Exclusive |
| **Module** (pick ONE) | `Settings`, `Accounting`, `Inventory`, `POS`, `Sales`, `Purchase`, `Onboarding`, `Dashboard`, `Reports`, `Search`, `AI/Agents` | Exclusive |

### /work Reference Data

| Phase | Spec (`agent-os/product/modules/{path}`) | Also read |
|-------|------|-----------|
| 0 | `agent-os/product/tech-stack.md` | `erp/.env.example` |
| 1 | `settings-admin/` | |
| 2 | `accounting/` | |
| 3 | `inventory/` | |
| 4A/4B/4C | `pos/`, `sales/`, `purchase/` | |
| 5 | `onboarding/` | |
| 6 | `dashboard/` + `reports/` | |
| 7 | `ai-engine/` (canonical 2026-06) | |
| Auth | `agent-os/engineering/authentication/` (as-built) + `modules/settings-admin/` (user/RBAC rules) | any phase |

> Note: module design specs live under `agent-os/product/modules/`; as-built technical specs under `agent-os/engineering/`; the canonical feature list is `agent-os/product/feature-catalog/`.

Always read the spec before building. **Branch:** `<prefix>/<DEV-XX>-<short-kebab>` where prefix is `phase-0`…`phase-8`, `phase-4a/4b/4c`, or `website`.

| Reviewer dispatch (by label) | |
|-------|---------------------|
| Always | `code-reviewer` |
| Frontend | + `frontend-reviewer` |
| Backend/API | + `nestjs-reviewer` + `api-reviewer` |
| Security/auth | + `security-reviewer` |
| Database | + `database-reviewer` + `neon-postgres` skill |
| AI Service/Python | + `python-reviewer` |
| Accounting | + `accounting-reviewer` |

**Coverage:** 80%+ general · 100% financial/accounting · 100% auth/security. **Study topics:** `study/<phase>/<topic-kebab>/README.md` (root repo), grouped by topic.

---

## gstack

Use the `/browse` skill for ALL web browsing — never `mcp__claude-in-chrome__*`. gstack skills (`/office-hours`, `/plan-eng-review`, `/qa`, `/ship`, `/codex`, etc.) self-register and appear in the skills list; don't enumerate them here.

---

## Self-Improvement Protocol

Living document — update when: a gotcha is found (add) or fixed upstream (remove), a convention is set, the `/work` flow changes (update tables, not prose). Keep under 250 lines, prefer tables over prose. Boundary with `~/.claude/rules/common/`: those hold GENERIC mechanics (immutability implementation, generic error handling) — reference them, don't restate. This file owns the Zerupt-SPECIFIC layer: identity, architecture decisions, gotchas, reference data, and **How We Build** (the lazy-first ladder pointing at our real primitives + the delegation mandate + our non-negotiables). One convention lives in exactly one place.
