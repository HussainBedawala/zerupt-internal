# Accounting — Period Close Management Testing Checklist

> Persona: **accountant**. The close process is a formal checklist that must be auditable: every task completed, skipped, or reviewed by a named user at a recorded time. A close run that can be silently bypassed is a compliance risk.

- **Route(s):** `/accounting/close-management`, `/accounting/close-management/[id]`
- **Feature dir:** `features/close-management/`
- **API:** `GET /api/close-runs`, `POST /api/close-runs`, `GET /api/close-runs/:id`, `POST /api/close-runs/:id/tasks/:tid/complete`, `POST /api/close-runs/:id/tasks/:tid/review`, `POST /api/close-runs/:id/tasks/:tid/skip`, `POST /api/close-runs/:id/tasks/:tid/reopen`, `PATCH /api/close-runs/:id/tasks/:tid`, `GET /api/close-templates`, `POST /api/close-templates/seed`
- **Depends on:** 10-fiscal-years-periods (fiscal period must exist and be open), 02-journal-entries (linked JEs on tasks), 01-chart-of-accounts

## 0. Preconditions

- [ ] At least one legal entity with at least one open fiscal period exists.
- [ ] Logged in as a user with close-management permission; a user without it cannot reach the route.
- [ ] Optionally: a second user account available to test segregation-of-duties (completer vs reviewer must be different people, if the system enforces that).

---

## 1. Functional — close runs list (`/accounting/close-management`)

- [ ] **List close runs** — shows run ID, fiscal period label, periodType, status badge (in_progress / complete), startedBy, startedAt, completedAt.
  - [ ] Loading skeleton shown while fetching; no frozen UI.
  - [ ] Empty state when no runs exist: descriptive message and a "Start New Run" call-to-action.
  - [ ] **Status filter** — filter to `in_progress` shows only in-progress runs; filter to `complete` shows only completed runs; clear filter shows all. Verify counts match.
  - [ ] Pagination (if present) stable across pages.

---

## 2. Functional — start a close run

- [ ] **Start run dialog** (`start-close-dialog`) — opens; accountant selects a fiscal period and a template (monthly/quarterly); submit.
  - [ ] Loading state on submit; button debounced (no double-submit).
  - [ ] On success: navigated to the close-run workspace for the new run; progress bar shows 0%.
  - [ ] Starting a second run for the same fiscal period is rejected (server enforces one active run per period) with a clear message.
  - [ ] Error state if no templates exist: message explains how to seed one.

- [ ] **Seed default template** — trigger "Seed Default Templates" (monthly and quarterly); templates appear in the template selector.
  - [ ] Seeding is idempotent: re-seeding does not create duplicate templates.
  - [ ] Seeded monthly template includes at minimum these task keys: `reconcile_bank`, `review_suspense`, `fx_revaluation`, `post_depreciation`, `review_accruals`, `lock_period`.

---

## 3. Functional — close-run workspace (`/accounting/close-management/[id]`)

- [ ] **Workspace loads** — shows run header (fiscal period, status, startedBy), progress bar, and task checklist.
  - [ ] Loading state; error state if run ID does not exist (404 friendly message).
  - [ ] Progress bar reflects `progressPct` from `RunProgressSummary`.

- [ ] **Progress bar** — `progressPct = (completed + skipped) / total × 100`; bar visually updates as tasks are completed or skipped. Verify the math matches the displayed percentage.

- [ ] **Task row** — each task shows title, description, taskKey, status badge, assignee, dueDate, requiresReview flag.

- [ ] **Complete task** — click "Mark Complete" on a pending task; status transitions to `complete`; completedAt and completedBy populated; progress bar increments.
  - [ ] Cannot complete an already-complete task (action hidden or disabled).
  - [ ] A task with `requiresReview = true` shows as `complete` but also shows an "Awaiting Review" indicator until reviewed.

- [ ] **Mark reviewed** (`requiresReview = true` tasks) — a second user (reviewer) clicks "Mark Reviewed"; reviewedAt and reviewedBy populated; task fully resolved.
  - [ ] Reviewer and completer should ideally be different users (if enforced, verify the server rejects self-review).
  - [ ] Reviewing a task that has not been completed first is blocked (server and/or UI).

- [ ] **Skip task** (`skip-task-dialog`) — click "Skip"; dialog requires a reason (text field); confirm.
  - [ ] Skipping without a reason is rejected client-side (required) and server-side.
  - [ ] On success: task status = `skipped`; skipReason stored; progress bar increments.
  - [ ] Skipped tasks visible in the workspace with their reason text (audit trail on screen).

- [ ] **Reopen task** — click "Reopen" on a completed or skipped task; task returns to `pending`; progress bar decrements.
  - [ ] Reopen action is audited (completedBy/completedAt cleared or a new audit record created).
  - [ ] Cannot reopen a task on a `complete` run (run is finalized — action disabled).

- [ ] **Update task** (`PATCH task`) — edit assignee, reviewer, dueDate, linkedJournalEntryId, notes; save.
  - [ ] `version` field sent with the update (optimistic concurrency); stale-version conflict (another session updated the task) returns an error with guidance to reload.
  - [ ] Notes field accepts multi-line text; Arabic text renders correctly (RTL).
  - [ ] linkedJournalEntryId must resolve to a real JE; invalid ID rejected by server.

- [ ] **Run status badge** — `in_progress` badge changes to `complete` badge when all required tasks are resolved; badge color consistent with close-management design.

---

## 4. Accounting / domain invariants

- [ ] **Progress = (completed + skipped) / total.** Spot-check: 4 complete, 1 skipped, 1 pending out of 6 → 83%. Verify displayed percentage matches.
- [ ] **Skip requires a reason — no silent bypass.** A skipped task with no reason must be rejected. The reason is stored and visible in the workspace; it is the audit evidence that the task was intentionally skipped.
- [ ] **Reviewed != completed.** A task with `requiresReview = true` is not "done" until both complete AND reviewed. The progress bar must not count a merely-completed, unreviewed required task as fully resolved in `allRequiredResolved`.
- [ ] **`allRequiredResolved` gates run completion.** The run cannot be marked `complete` while any `requiresReview` task is completed but not yet reviewed.
- [ ] **Close run ties to one fiscal period.** Each run has exactly one `fiscalPeriodId`; a single fiscal period should have at most one active (in_progress) run. A second start attempt for the same period is rejected.
- [ ] **Run completion should align with period locking.** When a close run completes, the linked fiscal period should transition to HardLocked (or at minimum the `lock_period` task in the checklist handles this). Verify the period is HardLocked after a run with `lock_period` task completes.
- [ ] **Reopening a task is audited.** After reopening: the run `status` reverts to `in_progress` if it was `complete`; the progress bar reflects the new incomplete count.
- [ ] **Tasks cannot be silently bypassed.** Every task in the run has a visible, recorded final state (complete, skipped with reason, or pending/in_progress). There is no path to marking a run complete while tasks are in an unresolved state.

---

## 5. Edge cases & defensive UX

- [ ] Close run with zero tasks (empty template) — system handles gracefully; either blocks creation or shows a clear "no tasks" state.
- [ ] Two browser sessions updating the same task simultaneously — the second update detects a version conflict and prompts the user to reload before re-saving.
- [ ] Completing a task on a `complete` run — server rejects with a clear message (run is finalized).
- [ ] Skip reason field: very long reason (500+ chars) does not break UI layout; server stores full text.
- [ ] Deleting an assignee's user account mid-run — the task row still shows the assigneeId or a "deleted user" placeholder; no crash.
- [ ] RTL: Arabic task titles, notes, and reason text render correctly; progress bar direction logical in RTL layout.
- [ ] Rapid double-click "Mark Complete" does not create two complete events (button disabled on first click).
- [ ] Filter by `in_progress` on the list page and navigate into a run that was just completed by another session — stale-data scenario: handle gracefully (run shows `complete` after re-fetch).

---

## 6. Cross-module / integration

- [ ] A close run's `lock_period` task, when completed, actually locks the fiscal period in the fiscal-years module — verify the period status changes.
- [ ] `linkedJournalEntryId` on a task — clicking the link navigates to the journal-entry detail and resolves to the correct entry.
- [ ] A `reconcile_bank` task in a close run — completing it should correspond to a fully reconciled bank statement for the period (manual cross-check with bank-reconciliation module).
- [ ] After a close run completes and the period is HardLocked, auto-posted JEs from Sales/Purchase/POS for transactions dated in that period are rejected and appear in the dead-letter queue.

---

## 7. Known gaps

- **No template edit UI — MEDIUM.** Templates can be seeded via the "Seed Default Templates" action, but there is no UI to create a custom template or edit an existing template's task list (add, remove, reorder tasks). Accountants who need a non-standard close checklist must use the API directly. Track until a template management screen is built.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Every skipped task has an auditable reason; every reviewed task was completed first.
- [ ] Findings logged in `_findings.md`.
