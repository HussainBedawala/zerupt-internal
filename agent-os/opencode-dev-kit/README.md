# Zerupt OpenCode Dev Kit

This is a drop-in kit that packages Zerupt's engineering conventions, reviewer
subagents, and workflow commands for use with [OpenCode](https://opencode.ai).
If you are an external contractor working on the Zerupt ERP codebase, this
kit gets you working the same way the core team does: same review checks,
same commands, same non-negotiables (money correctness, tenant isolation,
i18n, immutability).

It contains no model configuration and no secrets. You bring your own model
provider and your own keys.

## Prerequisites

1. Install OpenCode: https://opencode.ai
2. Authenticate a model provider with your own account:
   ```
   opencode auth login
   ```
   This kit is provider-agnostic and deliberately ships no model choice. Use
   whatever provider you already have access to (Anthropic, OpenAI,
   OpenRouter, etc.) — OpenCode stores that credential itself, not in this kit.

## Install steps

1. Copy the contents of this kit into the ROOT of your Zerupt `erp` working
   copy (the git repository you were given access to):
   - `AGENTS.md`
   - `opencode.json`
   - `.opencode/` (agents + commands)
   - `rules/`
   - `.env.example`
   - `.gitignore` (merge with any existing root `.gitignore` instead of
     overwriting it)

   OpenCode automatically reads `AGENTS.md`, `opencode.json`, and everything
   under `.opencode/agent/` and `.opencode/command/` from your project root —
   no extra registration step needed.

2. If the repo already has an `AGENTS.md`, do not overwrite it. Merge the two
   files by hand so you keep both sets of instructions.

3. Copy the env template and fill in anything the founder gave you:
   ```
   cp .env.example .env
   ```
   Most contractors can leave this empty at first. `NEON_API_KEY` is only
   needed if the founder asks you to use the Neon MCP server.

## What's included

### Reviewer / helper agents (`.opencode/agent/`)

| Agent | What it does |
|---|---|
| `code-reviewer` | General code quality, readability, and maintainability review |
| `nestjs-reviewer` | NestJS backend patterns: DI, module boundaries, guards, Drizzle usage, tenant isolation |
| `frontend-reviewer` | Next.js/React frontend patterns: RTL/i18n, shadcn/ui, TanStack Query, Zustand |
| `api-reviewer` | REST API contract review: naming, HTTP semantics, status codes, pagination, error shape |
| `accounting-reviewer` | Double-entry correctness, VAT/GST, multi-currency, COGS, period controls |
| `security-reviewer` | Auth, secrets, injection, OWASP-class vulnerabilities |
| `database-reviewer` | Schema design, query performance, migration safety |
| `build-error-resolver` | Fixes build/type errors with minimal, non-architectural diffs |
| `tdd-guide` | Enforces write-tests-first workflow with 80%+ coverage |

### Commands (`.opencode/command/`)

| Command | What it does |
|---|---|
| `/code-review` | Runs the relevant reviewer agents against your current changes |
| `/verify` | Verification pass before calling a task done |
| `/tdd` | Test-driven development workflow: tests first, then minimal implementation |
| `/test-coverage` | Checks and reports test coverage |
| `/update-codemaps` | Regenerates the module codemaps under `erp/docs/CODEMAPS/` |
| `/harden` | Ledger-first module hardening program (audit, harden, review, gate, commit) |

### Rules (`rules/`)

| File | What it covers |
|---|---|
| `coding-style.md` | Immutability, file organization, error handling, input validation |
| `security.md` | Pre-commit security checklist, secret management, incident response |

Both are wired into `opencode.json` under `instructions`, alongside
`AGENTS.md`, so OpenCode applies them on every request.

## How to use it

- **Commands** become slash commands inside OpenCode. Type the command name
  (for example `/code-review` or `/harden`) in your OpenCode session.
- **Agents** are invoked automatically by commands that need them, or you can
  address one directly if your OpenCode setup supports it. You do not need to
  configure or register them; dropping the markdown files into
  `.opencode/agent/` is enough.
- Always run `/code-review` before you consider a change done, and reach for
  the module-specific reviewer (`nestjs-reviewer`, `frontend-reviewer`,
  `accounting-reviewer`, etc.) when your change touches that area.

## MCP servers

`opencode.json` declares three MCP servers:

- **context7** — enabled out of the box. Fetches current library/framework
  documentation. No secret required.
- **linear** — disabled by default. The founder decides whether to enable
  this; it requires your own Linear authentication.
- **neon** — disabled by default. Only enable this if the founder issues you
  a scoped, dev-branch-only Neon API key, and put it in `.env` as
  `NEON_API_KEY`.

To enable a disabled server, flip its `"enabled"` flag to `true` in
`opencode.json` once you have the required access.

## Conventions that matter most

Read `AGENTS.md` in full before making changes; it is the source of truth.
The things that get flagged hardest in review:

- **Money and accounting correctness** — double-entry balance, VAT/GST,
  COGS, multi-currency. FX must fail loud, never silently default.
- **Multi-tenant isolation** — every query must be tenant-scoped. Never leak
  data across tenants.
- **i18n from day one** — Arabic and English, `en/` is the source of truth,
  never hardcode user-facing strings. Use CSS logical properties, not
  physical `margin-left`/`padding-right`, so layouts work in both RTL and
  LTR.
- **Immutability** — always return new objects, never mutate in place.
- **No em dashes** in product copy or UI strings.

When in doubt, check `AGENTS.md` first, then ask.
