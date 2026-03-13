---
description: "Pick up the next Linear issue and orchestrate the full development SOP. Delegates to existing commands at each phase."
---

You are the Zerupt development orchestrator. You pick up one Linear issue and walk through each phase. Pause after each phase for user approval before proceeding.

## PHASE 1: PICK ISSUE

Find the next issue using this priority order:

1. Check for any "In Progress" issue in the Development team → resume it
2. Otherwise: find the active project (status = "In Progress") → its first incomplete milestone (by sortOrder, lowest first) → first "Todo" or "New" issue (by priority ascending, then identifier number ascending)

**Milestone completeness rule:** A milestone is incomplete if any issue in it has status other than "Done" or "Cancelled". Skip milestones where all issues are Done/Cancelled.

**Issue status precedence for selection:** Todo > New > Soon (in that order). "Soon" is a backlog state — only pick it if no Todo/New issues exist in the milestone.

Use Linear MCP in this order: `list_projects` → `list_milestones` → `list_issues` (filter by project) → `get_issue` for full description.

Present a summary table:
- Issue: DEV-XX — Title
- Milestone: name
- Priority: Urgent/High/Medium/Low
- Labels: list
- Description: 2-3 line summary

Ask: "Start this issue? (yes / skip / pick different)"

If yes → `save_issue` to set status "In Progress"

## PHASE 2: BRANCH

**IMPORTANT:** Always run `git checkout -b <branch>` from inside the `erp/` directory (the git repo root is at `/Users/hus3ain/Development/Zerupt/erp/`). The `/Zerupt/` root is a separate local-only git repo with no remote.

**NOTE:** Make sure `main` is upto date and no unmerged branches exist before proceeding to creating a new branch.

Branch format: `phase-0/<DEV-XX>-<short-kebab-description>`

Phase prefixes: phase-0, phase-1, phase-2, phase-3, phase-4a, phase-4b, phase-4c, phase-5, phase-6, phase-7, phase-8, website

Run: `cd /Users/hus3ain/Development/Zerupt/erp && git checkout -b <branch>`

Confirm the branch was created with `git branch`. Ask: "Branch created. Continue?"

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
- Auth/security issues → also read `user-auth-management/`

For Phase 0 infra issues, also check: `erp/.env.example` to understand the current env var state.

Summarize what's relevant to this specific issue (not the whole spec). Ask: "Spec reviewed. Additional context? (continue / add context)"

## PHASE 4: FETCH DOCS

Scan the issue title + description for external packages (e.g. next-intl, Prisma, BullMQ, Sentry, Supabase, etc.).

For each relevant package, use context7 MCP:
1. `resolve-library-id` with the package name + a task-specific query
2. `query-docs` with the exact task (e.g. "NestJS setup with JWT validation") — be specific

Fetch in parallel when possible. Only fetch what's directly needed for this issue.

Tell the user: "Docs fetched for: [package list]. Continue to planning?"

## PHASE 5: PLAN

Present a clear implementation plan before writing any code. Include:
- What files will be created/modified
- What packages will be installed
- What the user needs to do manually (e.g. cloud console setup, credentials)
- What credentials/values to provide back (if applicable)
- Any risks or blockers
- In case designing API, use `api-design` skill to plan it.
- In case designing / updating database, use `database-reviewer` agent.

**Give your own recommendations and improvements also. Even if it is missing from the spec, or you have any thoughts, please add those.**
**Do NOT write any code until the user approves the plan.**

Ask: "Approve this plan? (yes / adjust)"

## PHASE 6: TDD

Run the `/tdd` command behavior. The tdd-guide agent writes tests first (RED → GREEN → REFACTOR).

**Coverage targets:**
- General code: 80%+
- Financial/accounting code: 100%
- Auth/security code: 100%

**Exception:** Pure infrastructure/provisioning issues (no business logic, just SDK init + env vars) do not require tests. Document this exception explicitly when skipping.

## PHASE 7: CODE REVIEW [VERY IMPORTANT TO DO THIS ACCURATELY]

Run the `/code-review` command behavior.

Additionally invoke based on issue labels:
- Security / auth labels → `security-reviewer` agent
- Database label → `database-reviewer` agent
- AI Service / Python label → `python-reviewer` agent
- API / Backend labels → `api-reviewer` agent

Fix ALL findings at every severity level (CRITICAL, HIGH, MEDIUM, LOW) before continuing. Never skip or defer any finding — every issue gets resolved in the same session.

### After fixing — log findings to Linear

**Step A: Comment on the current issue** using `save_comment` with this exact structure so future AI sessions have full context:

```
## Code Review Findings

**Reviewer:** code-reviewer [+ security-reviewer if invoked]
**Issue:** DEV-XX — <title>
**Date:** <YYYY-MM-DD>

### Fixed in this session
| Severity | Finding | File | Fix applied |
|----------|---------|------|-------------|
| HIGH | <title> | <file>:<line> | <one-line description> |

### Deferred (out of milestone scope only)
| Severity | Finding | Follow-up |
|----------|---------|-----------|
| MEDIUM | <title> | DEV-YY |

### No findings
(write this row if review was clean)
```

**Step B: For any finding that is out of scope for the current milestone** → `save_issue` to create a standalone follow-up issue (NOT linked to any project — it lives in the team backlog):
- Title: `[Tech Debt] <short description> (from DEV-XX)`
- Description: severity, file:line, full finding text, recommended fix, link to parent DEV-XX
- Priority: Normal
- Labels: same labels as parent + `tech-debt`
- Status: New
- Do NOT assign to a project or milestone — keep it in the team backlog for triage

All findings within the current milestone's scope MUST be fixed in-session. Only defer if the fix genuinely belongs to a different milestone or phase.

**Step C: For any SECURITY finding** (any severity, fixed or not) → always create a follow-up issue for permanent audit trail:
- Title: `[Security] <short description> (from DEV-XX)`
- Description: severity, file:line, full finding, fix applied (if any), verification steps
- Priority: HIGH findings → Urgent; MEDIUM → High; LOW → Normal
- Labels: `Security` + `tech-debt`
- Milestone: same milestone as parent
- Status: New (even if fixed — so it can be verified independently)

## PHASE 8: VERIFY

Run the following checks in order:
1. `pnpm --filter @zerupt/api typecheck`
2. `pnpm --filter @zerupt/web typecheck`
3. `pnpm turbo lint` (or per-app lint)
4. `pnpm turbo test` (or per-app test)
5. `git status` — confirm no unintended files staged

Do not proceed until all checks pass. If a check fails, fix it before moving on.

## PHASE 9: COMMIT + LINEAR SYNC

**Commit rules:**
- Stage specific files only — never `git add .` or `git add -A`
- All commits go to `erp/` repo (has GitHub remote): `cd /Users/hus3ain/Development/Zerupt/erp`
- Study files go to root `/Zerupt/` repo (local-only, no remote): commit there separately
- Commit message subject MUST be all lowercase (commitlint enforces this)

**Commit format:**
```
<type>(<scope>): <lowercase description>

- bullet point details
- what was added/changed and why

Closes DEV-XX
```

Type from labels: Feature→feat, Bug→fix, Infrastructure→chore, Database→chore(db), Security→feat(security)
Scope from app: web, api, ai, shared, db, db-admin, ui

**Push + PR:**
1. Push the feature branch: `git push -u origin <branch-name>`
2. Create a PR using `gh pr create` with:
   - Title: `<type>(<scope>): <lowercase description> (DEV-XX)`
   - Body format:
     ```
     ## Summary
     - bullet points of what changed and why

     ## Test plan
     - [ ] tests passing (X tests, Y suites)
     - [ ] typecheck clean
     - [ ] lint clean

     Closes DEV-XX
     ```
   - Base branch: `main`
3. Return the PR URL to the user

**Linear sync:**
- `save_issue` → set status to "Done"
- `save_comment` on the issue with: commit hash, PR URL, files changed, env vars added, notes for future issues

## PHASE 10: STUDY TOPICS

**Location:** `study/<phase>/<topic-kebab>/README.md` — in the root `/Zerupt/` repo (not `erp/`)

Each high-level topic gets its own folder under the phase directory. Do NOT group by milestone — group by topic.

**Example structure:**
```
study/
  phase-1/
    multi-entity-architecture/README.md   ← DEV-195
    rbac-permissions/README.md            ← DEV-36
    organization-hierarchy/README.md      ← DEV-40, DEV-41
```

**If the folder already exists** (same topic from a previous issue): append new sections to the existing README.md.

**If it doesn't exist:** create the folder and README.md.

**Format per topic:**
```markdown
## N. Topic Name

**What:** one sentence definition

**Why it matters:** why this is relevant to Zerupt specifically

**How it works / Key concepts:** code snippet or bullet list

**Resources:**
- [Link title](url)
- [Link title](url)
```

Topics should cover the *concepts behind what was built* — not implementation steps, but the "why" and "how it works under the hood." Write for a smart developer who is new to the specific technology.

Commit study file to root `/Zerupt/` repo after writing.

## PHASE 11: CONTENT CHECK

Check if the issue is content-worthy for Instagram/X:
- Shipped a visible feature users will see?
- Hit a milestone (100% complete)?
- Solved an interesting technical problem?
- Good "build in public" moment?

If yes: read `agent-os/content-style-guide.md` → create issue in Linear **Marketing** team with:
- Labels: `dev-triggered` + relevant format + pillar + platform
- Description: what was shipped, why it matters to the audience

If not content-worthy: skip silently (do not mention the skip).

## PHASE 12: NEXT ISSUE PREP + WRAP

1. Move the next logical issue to "Todo" status in Linear (`save_issue` with `state: "Todo"`)
2. Ask: "DEV-XX done. Next issue? (yes / done for today)"
   - If yes → restart from PHASE 1
   - If done → run `/learn-eval` to extract session patterns
