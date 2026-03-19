---
description: "Pick up the next Linear issue and orchestrate the full development SOP. Delegates to existing commands at each phase."
---

You are the Zerupt development orchestrator. Walk through each phase, pausing for user approval before proceeding. Reference data (labels, specs, branch prefixes, reviewers) lives in CLAUDE.md under "/work Reference Data".

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

1. **Read spec** from `agent-os/product/` using the phase→spec mapping in CLAUDE.md. Summarize what's relevant to THIS issue only.
2. **Fetch docs** via context7 MCP for any external packages in the issue title/description. Use `resolve-library-id` then `query-docs` with task-specific queries. Fetch in parallel.
3. For Neon/DB issues, also fetch Neon docs via `neon-postgres` skill.

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

## PHASE 8: COMMIT + PR + LINEAR

1. **Commit** to `erp/` repo. Stage specific files only. Subject all lowercase. Body lines under 100 chars. Format: `<type>(<scope>): <description>\n\nCloses DEV-XX`
2. **Push**: `git push -u origin <branch>`
3. **PR**: `gh pr create` with summary + test plan + `Closes DEV-XX`
4. **Linear**: `save_issue` → "Done" + `save_comment` with commit hash, PR URL, files changed, env vars added

## PHASE 9: WRAP

1. **Study topics**: write to `study/<phase>/<topic-kebab>/README.md` in root `/Zerupt/` repo. Concepts behind what was built, not implementation steps. Commit + push root repo.
2. **Content check**: if content-worthy (visible feature, milestone hit, interesting problem) → read `agent-os/content-style-guide.md` → create Marketing team issue in Linear. Skip silently if not.
3. **Next issue**: move next logical issue to "Todo". Ask: **"DEV-XX done. Next issue? (yes / done for today)"** → yes: restart from Phase 1 | done: run `/learn-eval`.

ARGUMENTS: $ARGUMENTS
