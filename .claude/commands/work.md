---
description: "Pick up the next Linear issue and orchestrate the full development SOP. Delegates to existing commands at each phase."
---

You are the Zerupt development orchestrator. You pick up one Linear issue and walk through each phase, delegating to existing commands. Pause after each phase for user approval.

## PHASE 1: PICK ISSUE

Find the next issue using this priority:

1. Check for any "In Progress" issue in Development team → resume it
2. Otherwise: find the active project (status "In Progress") → its first incomplete milestone (by sortOrder) → first "Todo" issue (by priority then identifier number)

Use Linear MCP: `list_projects` → `list_milestones` → `list_issues` → `get_issue`

Present the issue summary. Ask: "Start this issue? (yes / skip / pick different)"

If yes → `save_issue` to set status "In Progress"

## PHASE 2: BRANCH

Create branch: `<phase>/<DEV-XX>-<short-kebab-description>`

Phase prefixes: phase-0, phase-1, phase-2, phase-3, phase-4a, phase-4b, phase-4c, phase-5, phase-6, phase-7, phase-8, website

Run `git checkout -b <branch>`. Ask: "Branch created. Continue?"

## PHASE 3: READ SPEC

Read the relevant spec from `agent-os/product/{module}/` based on the issue's project:
- Phase 0 → `tech-stack.md` + `roadmap.md`
- Phase 1 → `settings-admin/`
- Phase 2 → `accounting/`
- Phase 3 → `inventory/`
- Phase 4A/4B/4C → `pos/`, `sales/`, `purchase/`
- Phase 5 → `onboarding/`
- Phase 6 → `dashboard/` + `reports/`
- Phase 7 → `agents/`
- Auth issues → also read `user-auth-management/`

Summarize what's relevant. Ask: "Spec reviewed. Additional context? (continue / add context)"

## PHASE 4: FETCH DOCS

Scan the issue for external packages (NestJS, Prisma, Supabase, next-intl, BullMQ, etc.). For each, use context7 MCP (`resolve-library-id` → `query-docs`) to fetch latest docs.

Only fetch what's directly relevant. Ask: "Docs fetched for [list]. Continue to planning?"

## PHASE 5: PLAN

Run the `/plan` command behavior. The planner agent creates the implementation plan.

**Do NOT write code until user approves the plan.**

## PHASE 6: TDD

Run the `/tdd` command behavior. The tdd-guide agent writes tests first (RED → GREEN → REFACTOR).

Coverage: 80%+ general, 100% for financial/auth code.

## PHASE 7: CODE REVIEW

Run the `/code-review` command behavior.

Additionally invoke based on issue labels:
- Security/auth labels → `security-reviewer` agent
- Database label → `database-reviewer` agent
- AI Service/Python label → `python-reviewer` agent

Fix CRITICAL/HIGH findings before continuing.

## PHASE 8: VERIFY

Run the `/verify` command behavior (build → types → lint → tests → security → git status).

Do not proceed until all checks pass.

## PHASE 9: COMMIT + PR + LINEAR SYNC

1. Stage specific files (not `git add .`)
2. Commit:
```
<type>(<scope>): <description>

[body]

Closes DEV-XX

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```
Type from labels: Feature→feat, Bug→fix, Infrastructure→chore, Database→chore(db), Security→feat(security)
Scope from app: web, api, ai, shared, db, db-admin, ui

3. Push: `git push -u origin <branch>`
4. Create PR:
```
gh pr create --title "<type>(<scope>): <description> [DEV-XX]" --body "Closes DEV-XX ..."
```
Include: summary bullets, files changed, test coverage, test plan checklist.

5. Comment PR URL on the Linear issue via `save_comment`
6. Ask: "PR created. Merge now? (yes / later)"
   - If yes → `gh pr merge --squash` → Linear auto-moves to Done
   - If later → stays open, auto-completes on future merge

## PHASE 10: STUDY TOPICS

Generate study topics at `study/<phase>/<milestone-kebab>/README.md`. Topics = concepts behind what was just built, with 2-3 resource links each.

## PHASE 11: CONTENT CHECK

If the issue is content-worthy (shipped visible feature, hit milestone, interesting technical problem):
- Create issue in Linear Marketing team with labels `dev-triggered` + format + pillar
- Reference `agent-os/content-style-guide.md`

If not content-worthy, skip.

## PHASE 12: NEXT

Ask: "DEV-XX done. Next issue? (yes / done for today)"
- If yes → restart from PHASE 1
- If done → run `/learn-eval` to extract session patterns
