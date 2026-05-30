# Onboarding Configuration Pipeline — Concepts

> The system that turns 7 screens of answers into a fully configured, accounting-correct retail business. Built in DEV-292.

This note is about the *ideas*, not the code. Why the pipeline is shaped the way it is, and the trade-offs behind each decision.

---

## The core problem

A new tenant answers a 7-step questionnaire (business info, locations, accounting, tax, team, POS, data sources). Those answers are inert JSON. Somebody has to translate them into **real entities**: branches, warehouses, a chart of accounts, tax codes wired to GL accounts, fiscal periods, document number sequences, POS registers, notification rules.

That translation is the "configuration pipeline." Get it wrong and the tenant's books are wrong from day one — before they've recorded a single sale.

## Why answers-only, then materialize later

Each wizard step saves **only the answers** into a `onboardingState` JSON blob. Nothing real is created until the user hits "finish" (`POST /complete`). This separation matters:

- **Editing is free.** The user can go back and change step 3 without us having to un-create and re-create accounts. Answers are cheap to overwrite; entities are expensive and dangerous to delete.
- **One validated source of truth.** The pipeline reads a complete, internally-consistent set of answers in one shot, rather than reacting to each keystroke.
- **The expensive, risky work happens once**, at a moment the user explicitly chose.

## Checkpointed, not atomic — and why that's the *right* call

The instinct for "create a bunch of related records" is one big database transaction: all-or-nothing. We deliberately did **not** do that. Two reasons:

1. **The spec demands resumability.** If step 6 (tax) fails, the user shouldn't lose the 5 steps of entities that succeeded. The pipeline records per-step status (`pending → running → done / failed`), stops at the first failure, and **resumes from where it left off** on a retry. An atomic transaction would throw all that work away on any hiccup.
2. **Atomicity would've forced a massive refactor.** Each domain service (branches, COA, tax…) manages its own transaction. Threading one outer transaction through all of them is a large, fragile change. The checkpoint model lets each service stay self-contained.

The price you pay: a tenant can end up **partially configured**. We make that safe with the next idea.

## Idempotency is what makes "resume" actually work

"Resume on retry" only works if re-running a step that partly succeeded doesn't create duplicates. So every materializer is **idempotent**: it checks "does this already exist (by code)?" before inserting. Re-run the whole pipeline ten times → same result as running it once.

This is the same principle behind idempotency keys in payment APIs: the *effect* of an operation must not depend on how many times it's applied. It's the difference between a retry being safe and a retry doubling someone's chart of accounts.

## The progress signal: a pipeline as a visible state machine

Because status is persisted per step (not just held in memory during the request), the frontend can render a live "Setting up your system… ✓ 4 branches ✓ 67 accounts ⟳ tax…" screen. The pipeline isn't a black box that returns success/failure — it's a **state machine whose state is durable and observable**. That observability is a feature, not an afterthought.

## Accounting correctness: where "mostly right" isn't acceptable

Most of the pipeline tolerates being approximately right. The financial steps do not. A few concepts that drove 100% test coverage there:

- **Tax accounts have a direction.** Output VAT (what you owe the government) is a **liability**; input VAT (what you can reclaim) is an **asset**. The pipeline maps each tax code to the correct *type* of GL account (`2131` liability / `1162` asset). Swap them and every VAT return is wrong.
- **A fiscal year must cover *today*.** The subtle bug: a tenant in a country with an April–March fiscal year (India) who onboards in *January* belongs to the fiscal year that **started last calendar year**. Naively using "this year" creates a year that doesn't contain today's date → the first sale has no open period to post into → go-live fails. The fix is a one-line conditional, but the *concept* — "the current fiscal year is anchored on the start month, not the calendar year" — is the thing to internalize.
- **Some accounts are sacred.** System and control accounts (the ones the posting engine references by code) cannot be renamed, reparented, or deleted by a user's COA customizations. The pipeline guards every mutation path and flags blocked changes for manual review rather than silently applying or silently dropping them.
- **Functional currency is immutable.** It's locked at legal-entity creation. The pipeline can add *transaction* currencies and toggle multi-currency, but it never touches the functional currency — because changing it after any journal entry exists would corrupt historical reporting.

## Auditability beats convenience

There was a tempting shortcut for fiscal-period creation: write the rows directly with raw SQL and skip the service layer (which drags in a heavy dependency chain). We rejected the raw-write version *as shipped* because it skipped the **audit log** and the **domain event**. The principle: every financial mutation must leave an immutable trail and notify the rest of the system. A convenience that breaks the audit guarantee isn't a convenience — it's a liability. (We kept the lightweight write but added the audit row *inside the same transaction* and emitted the event *after commit*.)

## Conservative reconfiguration

When a user changes answers and re-runs, the safe default is **never destroy financial data automatically**. Re-running creates what's missing and updates what's safe, but anything that would delete an account or branch is *flagged for a human*, not executed. The asymmetry is deliberate: creating an extra account is annoying; deleting one with transactions behind it is catastrophic. When in doubt, the pipeline refuses and asks.

## Honest gaps over fake completeness

Pipeline step 10 (dashboard widget defaults) had no persistence layer to write to. Rather than invent a schema mid-pipeline to make the step "pass," it ships as a documented no-op with a tracked follow-up (DEV-348). A no-op you understand is safer than a feature you faked. Same with the two tax-model nuances deferred to DEV-349 — surfaced, written down, scheduled, not buried.

---

## Transferable takeaways

1. **Separate "capture intent" from "apply intent."** Cheap, reversible answers; expensive, deliberate materialization.
2. **For multi-step side-effectful work, prefer checkpoint+resume+idempotency over one giant transaction** — unless true atomicity is cheap.
3. **Idempotency is the enabler of safe retries.** Design every write to be "check-then-insert."
4. **Make long-running processes observable** by persisting their state, not just returning a final verdict.
5. **In financial code, "approximately correct" is a bug.** Direction of accounts, fiscal-year anchoring, immutable functional currency, sacred system accounts — these are non-negotiable.
6. **Never trade away the audit trail for convenience.**
7. **A documented gap with a ticket beats a faked feature.**
