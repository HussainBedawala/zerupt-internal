# Close Management — Concepts

> From DEV-252 (Phase 2, Accounting Engine). The *concepts* behind the period-close
> checklist module — not the implementation steps.

## What "the close" is

At the end of each accounting period (month/quarter/year) a business performs a
sequence of checks and adjustments before the books for that period are considered
final: reconcile bank accounts, clear suspense accounts, revalue foreign-currency
balances, post depreciation, book accruals/prepayments, then lock the period.

Competitors treat this as table stakes: Campfire ships an AI-driven close checklist;
Rillet's whole architecture is built around "close on day zero." A close-management
module turns that ad-hoc ritual into a tracked, repeatable, auditable workflow.

## Template vs. run (the snapshot pattern)

Two layers, deliberately separated:

- **Template** — the reusable *definition* of a checklist for an entity + cadence
  (e.g. "Monthly Close"). Edited over time.
- **Run** — a per-period *instance* generated from a template. At generation the
  template's tasks are **copied (snapshotted)** onto the run.

Why snapshot? Because an audited financial record must reflect *what the process
actually was* when it ran. If editing a template retroactively mutated past runs,
the audit trail would lie. Snapshotting decouples "how we close now" from "how we
closed last March." This is the same reasoning behind storing the tax rate *on* an
invoice line rather than looking it up live.

## Idempotent generation

A period must have exactly one close run. Two safeguards:

1. A **unique constraint** `(tenant_id, fiscal_period_id)` — the database is the
   final arbiter, so even a race can't create duplicates.
2. A **pre-check** (return the existing run) plus **race recovery**: if two requests
   slip past the pre-check, the loser catches the unique-violation error
   (Postgres code `23505`) and returns the winner's run instead of erroring.

The lesson: "check then act" is never atomic under concurrency. The unique
constraint is the real guarantee; the application code just makes the happy path
nice and recovers gracefully from the documented race.

## Optimistic concurrency (the `version` column)

Multiple people close the books together. Two users editing the same task would
otherwise silently overwrite each other (last-write-wins). Instead each task carries
a `version`; an update says "set X where id = ? AND version = ?" and bumps the
version. If zero rows match, someone else changed it first → return 409 Conflict and
make the user refresh. No locks held across a user's "thinking time" — hence
*optimistic*. Use `integer`, not `smallint`, so a long-lived task never overflows the
counter.

## Advisory, not automatic

The module can recommend soft-locking a period once every task is resolved, but it
**never locks automatically**. Locking the books is a deliberate, permissioned,
irreversible-feeling action that a human must own. Automation that silently changes
the state of financial records is how trust (and data) gets lost. The recommendation
is a nudge with a link; the actual lock stays a separate, explicit step.

## "Resolved" vs. "complete" (review gates)

Progress isn't just "done / not done":

- **Skipped** counts as *resolved* — but only with a recorded reason (audit).
- A task that **requires review** is *not* resolved on completion alone; it sits in
  *awaiting review* until a second person signs off. This encodes segregation of
  duties: the person who did the work isn't the one who approves it.
- The lock recommendation fires only when **all** tasks are resolved — so an
  un-reviewed task correctly holds the whole period open.

## Audit trail without bespoke columns

Every mutation goes through an `@Audited` interceptor that records who/what/when/diff
into the central audit log. So "who skipped this task and when" is captured even
without dedicated `skippedBy`/`skippedAt` columns — the domain columns
(`completedBy`, `reviewedBy`) exist for *display*, while the audit log is the
*system of record* for change history. Knowing which layer answers which question
keeps the schema lean.

## Cross-entity safety

A task can link to a journal entry as evidence. That JE must belong to the *same
legal entity* as the close run — validated in the service before linking. Multi-tenant
isolation (every query filtered by `tenant_id`) is the outer boundary; entity-level
checks are the inner one. A linked record from the wrong entity is a data-integrity
bug waiting to surface in a consolidated report.
