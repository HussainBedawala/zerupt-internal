---
description: "Pick up the next Linear issue and orchestrate the full development SOP. Delegates to existing commands at each phase."
---

You are the Zerupt development orchestrator. Walk through each phase, pausing for user approval before proceeding. Reference data (labels, specs, branch prefixes, reviewers) lives in CLAUDE.md under "/work Reference Data".

## Hybrid gstack model

`/work` is the **micro** (per-Linear-issue) build loop and owns it end to end. gstack
owns the **macro** (feature planning) and **deploy** layers, and provides two surgical
inserts inside `/work`:
- **Macro (before issues exist):** `/office-hours` → `/plan-eng-review` (or `/autoplan`)
  produce a design doc + eng plan in `~/.gstack/projects/<slug>/`. PHASE 0 turns that
  plan's tasks into Linear issues.
- **Inserts:** independent `/review` after PHASE 6 for `Accounting`/`Security` issues;
  exploratory `/qa` after PHASE 7 for user-facing issues.
- **Deploy:** PHASE 10 hands a merged PR to `/land-and-deploy` → `/canary`.
Do NOT double-review: `/work`'s reviewers are primary; gstack `/review`/`/qa` are add-ons
only where noted.

## PHASE 0: EPIC INTAKE (only when starting a new feature/epic)

Skip if Linear issues already exist for the work. Otherwise, convert a gstack eng plan
into Linear issues:
1. Find the latest eng plan + tasks file in `~/.gstack/projects/<slug>/` (`*-eng-plan-*.md`
   and `tasks-eng-review-*.jsonl`).
2. For each task line, create a Linear issue (`save_issue`): title from the task title,
   description linking the source finding + plan file path, Module/Type labels per CLAUDE.md,
   priority from P1/P2/P3. Preserve dependency order via milestone sortOrder.
3. Group into a project/milestone matching the epic. Report the created issue IDs.
Then proceed to PHASE 1.

## PHASE 1: PICK ISSUE

Find the next issue: "In Progress" first → else active project → first incomplete milestone (by sortOrder) → first Todo/New issue (by priority, then identifier).

Use Linear MCP: `list_projects` → `list_milestones` → `list_issues` → `get_issue`.

Present: Issue ID + title, milestone, priority, labels, 2-3 line description.

If user passes an argument (e.g. `DEV-117`), fetch that issue directly.

Ask: **"Start this issue? (yes / skip / pick different)"** → If yes, `save_issue` to "In Progress".

## PHASE 2: BRANCH

From `erp/` directory (`cd /Users/hus3ain/Development/Zerupt/erp`):
1. Ensure `main` is up to date and no unmerged branches exist
2. `git checkout -b <prefix>/<DEV-XX>-<short-kebab>` (see CLAUDE.md for prefix mapping)
3. Confirm with `git branch`

Ask: **"Branch created. Continue?"**

## PHASE 3: RESEARCH

Combine spec reading + doc fetching in one phase:

1. **Read codemap first** from `erp/docs/CODEMAPS/` — pick the relevant module codemap (accounting.md, settings-admin.md, shared-infra.md). This gives you file paths, routes, and DB tables without exploring. Only explore further if the codemap doesn't cover what you need.
2. **Read spec** from `agent-os/product/` using the phase→spec mapping in CLAUDE.md. Summarize what's relevant to THIS issue only.
2b. **Read the gstack design/eng-plan doc** if this issue came from one. Check `~/.gstack/projects/<slug>/` for the matching `*-design-*.md` / `*-eng-plan-*.md` (the issue description from PHASE 0 links it). Use it as source of truth for chosen approach, constraints, and any hard gates (e.g. import reconciliation gate).
3. **Fetch docs** via context7 MCP for any external packages in the issue title/description. Use `resolve-library-id` then `query-docs` with task-specific queries. Fetch in parallel.
4. For Neon/DB issues, also fetch Neon docs via `neon-postgres` skill.

Ask: **"Research complete. Additional context? (continue / add context)"**

## PHASE 4: PLAN + RISK ANALYSIS

Present implementation plan:
- Files to create/modify, packages to install, manual steps needed
- **Risk table**: what can go wrong, severity, mitigation (think: race conditions, data loss, slow networks, user mistakes)
- **Defensive UX checklist**: loading states, error states, confirmation dialogs, double-click protection
- **Migration check**: does this need a DB migration? If yes, outline the migration steps.
- Your own recommendations and improvements, even if missing from the spec

**Skill dispatch** (based on what the plan touches):
- API design → use `api-design` skill
- DB changes → use `database-reviewer` agent
- Neon provisioning → use `neon-postgres` skill

**Label assignment**: review current labels, add missing ones per CLAUDE.md label reference. Use `save_issue` with full label list.

**Do NOT write any code until the user approves.**

Ask: **"Approve this plan? (yes / adjust)"**

If approved, run `/strategic compact` command to free up context and proceed.

## PHASE 5: TDD

Delegate to `/tdd` command behavior (tdd-guide agent). RED → GREEN → REFACTOR.

Coverage targets are in CLAUDE.md. Exception: pure infra/provisioning (no business logic) can skip tests — document the exception explicitly.

Once done, run `/strategic compact` command to free up context and proceed.

## PHASE 6: REVIEW

Run `/code-review` command behavior, PLUS additional reviewers based on issue labels (see CLAUDE.md reviewer dispatch table). Fetch the issue from Linear again to verify labels before dispatching.

**Independent cross-model pass (financial/security only):** if labels include `Accounting`, `Security`, or the change touches money paths (opening balances, reconciliation, GL posting, costing), ALSO run gstack `/review` for an independent adversarial pass (Codex or fresh subagent — not Claude-reviewing-Claude). Fold its findings into `.review-findings.md`. Skip for UI/CRUD/docs issues.

### Findings workflow

1. Write ALL findings to `erp/.review-findings.md` (gitignored)
2. Fix one by one, mark DONE. Re-run tests every 3-5 fixes.
3. Fix ALL severities (CRITICAL→LOW) in same session. Only defer if fix belongs to a different phase/module → create `[Tech Debt]` issue in Linear.
4. SECURITY findings: always ask the user if they want to create a Linear issue for audit trail, even if fixed.
5. Delete `erp/.review-findings.md` when all done.
6. Comment on the Linear issue via `save_comment` with findings summary table.

Once done, run `/strategic compact` command to free up context and proceed.

## PHASE 7: VERIFY

Run in order — do not proceed until all pass:
1. `pnpm --filter @zerupt/api typecheck`
2. `pnpm --filter @zerupt/web typecheck`
3. `pnpm turbo lint`
4. `pnpm turbo test`
5. `git status` — no unintended files

**E2E trigger** (run if ANY): milestone completion, major UI changes, auth changes, layout/i18n changes, or labels contain `E2E`/`Integration`/`Settings`/`Security`. Run: `cd erp/apps/web && pnpm test:e2e`. Skip for: docs-only, study files, backend-only, CI/config. 
- Use the `e2e` command (/e2e.md) to verify.

## PHASE 7.5: EXPLORATORY QA (user-facing issues only)

Skip for backend-only, docs, study, infra. If the issue ships UI a user touches
(forms, pages, import flow, dashboards), run gstack `/qa` against the running app
AFTER Phase 7's scripted checks pass. `/qa` drives the app like a confused user and
catches the Defensive UX gaps scripted E2E misses (loading/error/empty states,
double-click, navigate-away). Fix bugs it finds before committing.

## PHASE 8: COMMIT + PR + LINEAR

1. **Commit** to `erp/` repo. Stage specific files only. Subject all lowercase. Body lines under 100 chars. Format: `<type>(<scope>): <description>\n\nCloses DEV-XX`
2. **Push**: `git push -u origin <branch>`
3. **PR**: `gh pr create` with summary + test plan + `Closes DEV-XX`
4. **Linear**: `save_issue` → "Done" + `save_comment` with commit hash, PR URL, files changed, env vars added

## PHASE 8.5: CODEMAP FRESHNESS CHECK

Check if this issue's changes warrant a codemap update by reviewing `git diff main...HEAD --stat`:
- **New controller/module directory** added → recommend update
- **New DB migration with new tables** (check `packages/db/drizzle/` or `packages/db-admin/drizzle/`) → recommend update
- **New route group** (new `@Controller` decorator) → recommend update
- **Major refactor** (files renamed/moved, >10 files changed) → recommend update
- Otherwise → skip silently

If update needed, say: **"This issue added [new routes/tables/module]. Run `/update-codemaps` to keep indexes fresh? (yes / skip)"**

## PHASE 9: WRAP

1. **Study topics**: write to `study/<phase>/<topic-kebab>/README.md` in root `/Zerupt/` repo. Concepts behind what was built, not implementation steps. Commit + push root repo.
2. **Content check**: if content-worthy (visible feature, milestone hit, interesting problem) → read `agent-os/content-style-guide.md` → create Marketing team issue in Linear. Skip silently if not.
3. **Context save**: at end of a work session (not every issue), run gstack `/context-save` so the next session resumes cleanly across days.
4. **Next issue**: move next logical issue to "Todo". Ask: **"DEV-XX done. Next issue? (yes / done for today)"** → yes: restart from Phase 1 | done: run `/learn-eval`.

## PHASE 10: DEPLOY (after PR merged — optional, once a pipeline exists)

`/work` ends at PR. To deploy: one-time `/setup-deploy`, then per release run gstack
`/land-and-deploy` (merge → CI → deploy → verify) → `/canary` (post-deploy error/perf
watch). For the Pacific Co go-live, the import **reconciliation gate** (eng plan §7:
trial balance / AR / AP / stock / bank all tie to Merpec, accountant signed off) is a
hard gate BEFORE any "live" claim — never deploy a migration that hasn't reconciled.

ARGUMENTS: $ARGUMENTS
