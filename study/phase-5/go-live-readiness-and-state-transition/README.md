# Go-Live: Readiness Gating & One-Way State Transition

How an onboarding wizard becomes a *live* production tenant — the concepts behind
the DEV-344 go-live step, independent of the specific code.

## 1. Blockers vs warnings — two classes of readiness

A go-live checklist is not a single boolean. It has two tiers:

- **Blockers** — structural prerequisites without which the ERP cannot function
  correctly at all: a chart of accounts to post against, an *open* fiscal period
  to post *into*, a tax profile so sales aren't silently untaxed, at least one
  branch and one role. If any blocker fails, "Go Live" is disabled. Hard stop.
- **Warnings** — quality/completeness concerns the owner can knowingly accept:
  "you started a data import but didn't finish", "opening balances aren't
  reconciled". These inform but never block — many SMBs migrate partially and
  clean up later. The system's job is to *surface* the risk, not to refuse.

The design lesson: encode the blocker/warning distinction in the data
(`blocker: true|false`), evaluate every check (don't short-circuit on first
failure — the user wants the *full* list to act on), and derive `canGoLive` as
"no blocker failed".

## 2. Separate "gather" from "interpret"

Readiness needs database counts (branches, accounts, periods…). Mixing the I/O
with the rules makes the rules hard to test. Splitting them — a service that
*gathers* raw signals, and a pure function that *interprets* them into a
checklist — means the interpretation logic (the part with real business meaning)
is exhaustively unit-testable with plain objects, no database. The thin gathering
layer is the only part that needs mocking.

## 3. Idempotent, one-way transitions

Going live is irreversible and side-effectful (it emits an event, freezes state).
Two failure modes must be designed against:

- **Double submission** (the user double-clicks, the network retries). The guard:
  the transition records a timestamp (`wentLiveAt`); the write reads that
  timestamp *inside the same transaction* and, if already set, returns the
  existing result without writing or re-firing side effects. The second call is a
  silent no-op, not an error.
- **Time-of-check/time-of-use (TOCTOU)**. Readiness is checked when the page
  loads (GET) but acted on later (POST). A client could submit go-live after a
  blocker silently regressed. The guard: *re-verify blockers server-side* in the
  POST handler — never trust the client's earlier GET.

## 4. Freeze for audit, don't delete

After go-live the wizard state is *frozen* (read-only), not discarded. The
historical answers feed analytics ("time from signup to go-live") and audit.
Freezing is enforced by a flag the mutating endpoints check — a frozen tenant
rejects further wizard edits (409 Conflict). The principle: lifecycle milestones
that matter to analytics/audit deserve first-class, queryable storage (a real
column), not a buried JSON field; transient UI state (a dismissible banner) can
live in a flexible JSON blob.

## 5. Event hooks for deferred consumers

Go-live emits `tenant.went-live` even though nothing listens to it yet (the
Onboarding Coach agent ships later). Emitting the event now — fire-and-forget,
*after* the transaction commits — means the future consumer needs zero changes to
the go-live path. The hook is the contract; the subscriber is plug-in. Emitting
after commit (never inside the transaction) avoids acting on a transition that
might roll back.

## 6. Scope honesty

The original spec assumed "send queued team invitations at go-live". The actual
system never queued any (that questionnaire step was de-scoped to capturing team
*size*). The right move was to recognise the data source didn't exist and make
that part a documented no-op, rather than build an elaborate sender with nothing
to send. Match the implementation to reality, not to a stale spec sentence.
