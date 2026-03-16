# Zerupt Development SOP

Standard Operating Procedure for working on any Linear issue. Follow this exactly, every time, no shortcuts.

---

## Quick Reference

```
PICK ISSUE ──> READ SPEC ──> /plan ──> /tdd ──> CODE ──> /code-review ──> /verify ──> COMMIT ──> CONTENT
```

---

## Phase 0: Pick Up a Linear Issue

**What you do:**
1. Open Linear, go to Development team
2. Pick the highest-priority issue from your current sprint/cycle
3. Move it to "In Progress"
4. Read the issue description, acceptance criteria, and any linked issues

**What Claude does:** Nothing yet. You drive this.

---

## Phase 1: Read the Spec

**Before writing a single line of code, read the product spec.**

Every module has specs in `agent-os/product/{module}/`. Read them in this order:

1. `README.md` — module overview
2. Numbered spec files (`01-architecture.md`, `02-...`) — detailed design
3. `*-cross-module-contracts.md` — how this module talks to others
4. `*-event-mappings.md` — what events this module emits/consumes

**Also read (if relevant):**
- `agent-os/product/tech-stack.md` — architecture decisions
- `agent-os/user-auth-management/` — if the issue touches auth/RBAC
- `agent-os/product/new-approach.md` — if the issue touches AI/agents/onboarding

**Why:** You are building to a spec, not improvising. The spec is the source of truth. If the spec doesn't cover something, ask before guessing.

---

## Phase 2: Research (search-first skill)

**When:** The issue requires a library, pattern, or integration you haven't used before.

**What happens:**
1. Search npm/PyPI for existing solutions before writing custom code
2. Check if a similar pattern exists in the codebase already
3. Evaluate options (security, maintenance, bundle size, stars)

**ECC skill:** `search-first`
**Command:** None (manual or ask Claude to research)

**Skip this phase if:** The issue is a straightforward CRUD endpoint or UI component using patterns already established in the codebase.

---

## Phase 3: Plan (/plan command)

**When:** Every issue that touches more than 1 file or involves any business logic.

**What happens:**
1. Claude's **planner agent** (Opus model) analyzes the issue
2. Restates requirements in plain English
3. Breaks into implementation phases with dependencies
4. Identifies risks (HIGH/MEDIUM/LOW)
5. Lists specific files to create/modify
6. **WAITS for your confirmation before any code is written**

**Command:** `/plan`
**Agent:** `planner` (auto-invoked)
**ECC skill:** Referenced — `coding-standards`, `backend-patterns`, `frontend-patterns`, `api-design`

**You must say "proceed" or "yes" before Claude writes any code.**

**Skip this phase if:** The issue is a single-file bug fix with an obvious solution.

---

## Phase 4: Write Tests First (/tdd command)

**This is mandatory. No exceptions. Write the test before the implementation.**

**What happens:**
1. Claude's **tdd-guide agent** takes over
2. Defines interfaces/types first
3. Writes failing tests (RED) — tests MUST fail before implementation
4. Runs tests to confirm they fail
5. You confirm the tests look correct
6. Writes minimal implementation to make tests pass (GREEN)
7. Runs tests to confirm they pass
8. Refactors if needed (REFACTOR) — tests must stay green
9. Checks coverage is 80%+

**Command:** `/tdd`
**Agent:** `tdd-guide` (auto-invoked)
**ECC skill:** `tdd-workflow`

**Test types by issue type:**

| Issue Type | Test Types Required |
|-----------|-------------------|
| API endpoint (NestJS) | Unit test (service logic) + Integration test (Supertest) |
| UI component (Next.js) | Unit test (Vitest) + E2E if it's a critical flow |
| Database migration | Integration test (Drizzle test client) |
| AI plugin (FastAPI) | Unit test (pytest) + Integration test |
| Business logic | Unit test (pure function) + Integration test (with DB) |
| Auth/RBAC | Unit + Integration + E2E (critical security flow) |

**Coverage requirements:**
- General code: 80%+
- Financial/accounting logic: 100%
- Auth/security logic: 100%

---

## Phase 5: Implement

**Now you write the actual code.** The tests from Phase 4 guide what you build.

**Rules that are always active (ECC rules auto-enforced):**

### TypeScript (Next.js + NestJS)
- **Immutability:** Always create new objects, never mutate (spread operator)
- **Strict mode:** TypeScript strict everywhere
- **Validation:** Zod schemas at API boundaries
- **Error handling:** async/await + try-catch, never swallow errors
- **File size:** <800 lines per file, <50 lines per function
- **No console.log** in production code (hooks will warn you)
- **CSS logical properties** only (for RTL support)

### Python (FastAPI)
- **Type hints** on all public functions
- **PEP 8** via black + ruff
- **Dataclasses** (frozen=True) for DTOs
- **Specific exceptions** (never bare `except:`)

### Database (PostgreSQL + Drizzle)
- **Parameterized queries** always (never string concatenation)
- **Indexes** on WHERE/JOIN columns
- **RLS** on tenant tables
- **timestamptz** for all dates
- **bigint** for IDs
- **CREATE INDEX CONCURRENTLY** for production migrations

**ECC rules auto-active:**
- `common/coding-style.md` — immutability, file organization
- `common/security.md` — no secrets, input validation
- `common/patterns.md` — repository pattern, API envelope
- `typescript/coding-style.md` — TS-specific patterns
- `typescript/patterns.md` — API response format, custom hooks
- `python/coding-style.md` — PEP 8, type hints, frozen dataclasses
- `python/patterns.md` — protocols, context managers

**ECC skills referenced:**
- `coding-standards` — universal code quality
- `backend-patterns` — NestJS API design, services, middleware
- `frontend-patterns` — React component composition, hooks, state
- `api-design` — REST conventions, status codes, pagination
- `postgres-patterns` — indexes, data types, RLS, anti-patterns
- `database-migrations` — safe schema changes, zero-downtime

---

## Phase 6: Auto-Hooks (Happen Automatically)

**These fire without you doing anything.** They are the ECC hooks system.

### PreToolUse Hooks (fire BEFORE Claude uses a tool)

| Hook | Trigger | What It Does |
|------|---------|-------------|
| Block dev server outside tmux | Bash command matches `dev`, `start`, `serve` | Blocks the command, reminds you to use tmux |
| Long command reminder | Bash command looks long-running | Reminds you to run in tmux |
| Git push review | Bash command is `git push` | Reminds you to review changes before pushing |
| Doc file warning | Write tool creates a `.md` file | Warns that you didn't ask for documentation files |
| Strategic compact | ~50 tool calls reached | Suggests manual `/compact` at a logical boundary |

### PostToolUse Hooks (fire AFTER Claude uses a tool)

| Hook | Trigger | What It Does |
|------|---------|-------------|
| Prettier auto-format | Edit/Write to `.js`, `.ts`, `.tsx`, `.jsx` | Auto-runs Prettier on the file |
| TypeScript check | Edit/Write to `.ts`, `.tsx` | Runs `tsc --noEmit` on the file |
| console.log warning | Edit/Write adds `console.log` | Warns you to remove it |
| Black/ruff auto-format | Edit/Write to `.py` | Auto-runs black + ruff |
| mypy/pyright check | Edit/Write to `.py` | Runs type checker |
| print() warning | Edit/Write adds `print()` | Warns to use `logging` instead |
| PR URL logger | `gh pr create` completes | Logs the PR URL |
| Build analyzer | Build command completes | Analyzes build output for issues |

### Session Hooks

| Hook | Trigger | What It Does |
|------|---------|-------------|
| Session start | New Claude session | Loads previous session summary, checks for stale tasks |
| Session end | Session closes | Persists session state for next time |
| Stop | Claude stops responding | Evaluates session for extractable patterns (continuous learning) |
| Pre-compact | Before context compaction | Saves critical context before compression |

---

## Phase 7: Code Review (/code-review command)

**Run this after implementation is complete, before committing.**

**What happens:**
1. Claude's **code-reviewer agent** reads all changed files via `git diff`
2. Checks for:
   - **Security:** Hardcoded secrets, SQL injection, XSS, missing input validation, missing auth
   - **Quality:** Large functions, deep nesting, missing error handling, code duplication
   - **React/Next.js:** Missing keys, inline functions in render, missing error boundaries
   - **NestJS:** Missing guards, missing validation pipes, missing error filters
   - **Performance:** N+1 queries, missing indexes, unnecessary re-renders
3. Outputs findings by severity: CRITICAL > HIGH > MEDIUM > LOW
4. Verdict: APPROVE / WARNING / BLOCK

**Command:** `/code-review`
**Agent:** `code-reviewer` (auto-invoked)

**Rules:**
- CRITICAL or HIGH issues = fix before committing
- MEDIUM = fix if quick, otherwise create a follow-up issue
- LOW = note and move on

**If the issue touches auth, payments, or tenant isolation, also run:**
- **Agent:** `security-reviewer` — deep OWASP Top 10 scan
- **ECC skill:** `security-review` — 10-point security checklist

**If the issue touches database schemas or queries, also run:**
- **Agent:** `database-reviewer` — SQL optimization, RLS, index analysis

**If the issue is Python (FastAPI), also run:**
- **Agent:** `python-reviewer` — PEP 8, type hints, security, bandit

---

## Phase 8: Verify (/verify command)

**Final check before committing. This runs everything.**

**What happens (in order):**
1. Build check (`npm run build` / `turbo build`)
2. Type check (`tsc --noEmit` / `pyright`)
3. Lint check (`eslint` / `ruff`)
4. Test suite with coverage (must be 80%+)
5. Console.log audit (grep for stray logs)
6. Git status review

**Command:** `/verify`
**Variants:**
- `/verify quick` — build + types only (for tiny fixes)
- `/verify full` — all checks (default)
- `/verify pre-commit` — commit-relevant checks
- `/verify pre-pr` — full + security scan

**Output:** `Ready for PR: YES/NO` with specific failure details.

**Do not commit if verify fails.** Fix the failures first.

---

## Phase 9: Commit

**Only after /verify passes.**

**Commit format (conventional commits):**
```
<type>(<scope>): <description>

[body: what was done and why]

Closes DEV-XX

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

The `Closes DEV-XX` line is a **Linear magic word**. It auto-links the commit to the issue and moves it to "Done" when the PR merges.

**Types:** `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`
**Scopes:** `web`, `api`, `ai`, `shared`, `db`, `db-admin`, `ui`

**Command:** `/checkpoint` (optional — creates a named rollback point)

---

## Phase 10: PR + Linear Sync

**Every issue gets a PR. The PR is the link between GitHub and Linear.**

1. Push: `git push -u origin <branch>`
2. Create PR with `gh pr create`:
   - **Title:** `<type>(<scope>): <description> [DEV-XX]`
   - **Body must include:** `Closes DEV-XX` (this is the Linear magic word)
   - Summary (1-3 bullets)
   - Test plan (checklist)
   - Files changed
3. Add PR URL as comment on the Linear issue

**How Linear-GitHub auto-sync works:**
- Branch name contains `DEV-XX` → Linear detects and links it
- PR description contains `Closes DEV-XX` → Linear moves issue to "In Progress" on PR open
- PR merged → Linear moves issue to "Done" automatically
- No manual status updates needed in Linear

**Magic words reference:**
- `Closes DEV-XX` / `Fixes DEV-XX` / `Resolves DEV-XX` → auto-completes issue on merge
- `Refs DEV-XX` / `Part of DEV-XX` → links without auto-completing

**After PR creation, squash-merge:** `gh pr merge --squash`

**ECC rule:** `common/git-workflow.md`

---

## Phase 11: Content Extraction (if content-worthy)

**After shipping, check if this is content-worthy:**

| Content-worthy | Not content-worthy |
|---------------|-------------------|
| Shipped a visible feature | Routine bug fix |
| Hit a milestone | Config change |
| Solved interesting problem | Dependency update |
| Made non-obvious decision | Internal refactor |
| Something failed and you learned | Typo fix |

**If yes:**
1. Create a new issue in Linear **Marketing team**
2. Label: `dev-triggered` + format (`tweet`, `carousel`, `reel`) + pillar
3. Status: `Idea` or `Draft`
4. Link it to the Development issue

**Reference:** `agent-os/content-style-guide.md`
**ECC skill:** `content-engine` (for multi-platform content generation)

---

## Phase 12: Learn (/learn command)

**At the end of a significant session (not every session).**

**What happens:**
1. Reviews the session for extractable patterns
2. Finds: error resolutions, debugging techniques, workarounds, project-specific conventions
3. Saves as instincts (continuous-learning-v2) or skills (continuous-learning)
4. Requires your confirmation before saving

**Commands:**
- `/learn` — extract patterns, save as skills
- `/learn-eval` — extract with quality gate (evaluates before saving)
- `/instinct-status` — see what's been learned so far
- `/evolve` — cluster instincts into higher-level structures

**When to use which:**
- After a hard debugging session → `/learn`
- After completing a full feature → `/learn-eval`
- Weekly check on accumulated knowledge → `/instinct-status`
- Monthly → `/evolve` (promote patterns to commands/skills)

---

## Special Workflows

### Database Migration Issue

```
READ SPEC → /plan → Write migration file → /tdd (integration tests) →
  database-reviewer agent → /verify → COMMIT
```

Extra checks:
- Use `CREATE INDEX CONCURRENTLY` for indexes
- Test rollback
- Verify RLS policies
- Check tenant isolation (every table must have tenant context)

### Security-Sensitive Issue (auth, payments, tenant isolation)

```
READ SPEC → /plan → /tdd → CODE →
  security-reviewer agent → /code-review → /verify pre-pr → COMMIT
```

Extra: 100% test coverage required. No exceptions.

### UI Component Issue

```
READ SPEC → /plan (if complex) → /tdd (Vitest) → CODE →
  code-reviewer agent → /e2e (if critical flow) → /verify → COMMIT
```

Extra: Test RTL layout. Test with `ar` and `en` locales.

### FastAPI/AI Service Issue

```
READ SPEC → /plan → /tdd (pytest) → CODE →
  python-reviewer agent → /code-review → /verify → COMMIT
```

Extra: Type hints on all functions. Use `black` + `ruff` formatting.

### Bug Fix

```
READ the bug report → Reproduce → Write a failing test that proves the bug →
  Fix with minimal change → /code-review → /verify quick → COMMIT
```

No /plan needed for simple bugs. The failing test IS the plan.

### Refactoring Issue

```
/plan → /verify (baseline) → /checkpoint "before-refactor" →
  refactor-cleaner agent (if removing dead code) →
  CODE → /tdd (ensure no regression) → /code-review → /verify → COMMIT
```

Extra: `/refactor-clean` command finds dead code automatically.

---

## Maintenance Commands (use periodically)

| Command | When | What |
|---------|------|------|
| `/test-coverage` | Weekly or before PR | Find files below 80% and generate missing tests |
| `/update-codemaps` | After major feature ships | Regenerate architecture documentation |
| `/update-docs` | After API changes | Sync README/docs with actual code |
| `/quality-gate` | On demand | Run formatters + linters + type checks |
| `/sessions` | When you need to recall past work | List/load previous session context |
| `/setup-pm` | Once (project setup) | Confirm pnpm is configured |
| `/checkpoint` | Before risky changes | Create a named rollback point |
| `/instinct-status` | Weekly | Check what patterns have been learned |
| `/promote` | Monthly | Promote project instincts to global scope |
| `/evolve` | Monthly | Cluster instincts into higher-level structures |

---

## Architecture Decision: When to Use Which Agent

| Situation | Agent | Model |
|-----------|-------|-------|
| Planning a feature | `planner` | Opus |
| System design question | `architect` | Opus |
| Writing new code | `tdd-guide` | Sonnet |
| After writing code | `code-reviewer` | Sonnet |
| Auth/payments/secrets code | `security-reviewer` | Sonnet |
| Build fails | `build-error-resolver` | Sonnet |
| Critical user flow testing | `e2e-runner` | Sonnet |
| Removing dead code | `refactor-cleaner` | Sonnet |
| Schema/query work | `database-reviewer` | Sonnet |
| Python code | `python-reviewer` | Sonnet |
| Docs need updating | `doc-updater` | Haiku |

---

## The One Rule

**If you're unsure about anything, read the spec first. If the spec doesn't cover it, ask before building.**

The specs live in `agent-os/product/`. They are the source of truth. Not your memory, not a guess, not "what makes sense." The spec.
