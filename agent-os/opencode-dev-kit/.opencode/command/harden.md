---
description: Run a self-contained, layer-by-layer quality-hardening pass on a module (audit -> harden -> review -> verify)
agent: build
---
# /harden $ARGUMENTS - Module Hardening Pass

Runs a layer-by-layer module-hardening pass: audit -> harden backend and frontend -> review -> gate -> commit. This is a self-contained quality program for the module named in `$ARGUMENTS` (e.g. `/harden inventory`).

---

## 0. Set up the pass (once, before any layer)

1. Read the module's spec/design docs if any exist in this repo, and read its codemap at `docs/CODEMAPS/<module>.md` if present.
2. Write a short working log (in a scratch file or your own notes) covering:
   - **Program description** - one paragraph on what this hardening pass covers.
   - **What makes `<module>` different** - the module-specific invariant framing (is it a ledger, or a front end that must tie out to a ledger elsewhere? is it money-adjacent, auth-adjacent, or purely operational?).
   - **Guiding principles** - persona-framed (think like the person who actually uses this module), always including: tie-out to any source of truth it derives from, backend AND frontend fixed together every layer, no tech debt left behind, dependencies pointing DOWN only (never introduce an upward import from a foundational module into a higher-level one).
   - **Process gates** - reviewer roster, build/boot gate, coverage bar.
3. Decide the **layer plan** (see Section 1) and write it as a short table with a Progress checklist.

## 1. Default layer plan (adapt to the module)

Start from this default; split a layer into sub-layers only if its audit shows it's too large.

| # | Layer | Core scope |
|---|-------|-----------|
| 0 | Foundation / master data | Core data model and dimensionality decisions |
| 1 | Primary lifecycle / intake | Main creation/lifecycle flow. Lock any dual-path here (e.g. two ways to create the same record) so both paths reuse the same underlying engine. |
| 2 | Core engine + downstream handoff | The engine that other systems depend on (ledger postings, stock movement, reservations, etc.) |
| 3 | Document confirmation / invoice + discounts | Confirmation flows, balance integrity, discounts/promotions |
| 4 | Reversal-heavy | Returns, adjustments, reversals, corrections |
| 5 | Settlement / sync + aging + period close | Payments, receipts, offline sync, period close |
| last | Reporting + close | Always last; should tie out to the source of truth by construction |

## 2. Correctness invariants - every layer must state and prove these

- **Derived data is DERIVED, never stored redundantly.** Any balance/aggregate (AR, AP, stock value, etc.) is computed from an immutable underlying ledger, not a denormalized running total. Reconciliation must hold after every mutating operation (create/confirm/void/return/reversal/close).
- **Tie-out.** Every module record ties to its downstream effect (ledger journal, stock movement, cash movement) atomically, in the same transaction.
- **Full reversal coverage, no dead ends.** Every forward action has a correct, atomic, net-zero contra path.
- **Correct by construction** - reviewers should be able to prove balance/correctness, not just assert it.
- **Idempotency / exactly-once** for any event-driven or offline-replay path; locks around header rows to prevent double/partial processing.
- **Period or state integrity** - never allow posting into an already-closed period or invalid state.
- **Immutable documents / append-only ledgers** where relevant.
- **Fail loud over silently wrong** - reject bad input (e.g. non-1 FX where not expected) rather than silently mis-posting it.
- **Money uses exact/decimal types everywhere**, never floating point.
- **No time-of-check-to-time-of-use races** on hard blocks (e.g. credit limits, stock availability).
- **Dependencies point DOWN only** - re-verify every layer; invert any upward violation into an event or interface.

## 3. Per-layer loop

1. Write or update a short layer study note (what this layer does and why, for future readers).
2. Run a full audit of the layer and list every gap found.
3. **Harden backend AND frontend** together - the UI must actually expose the hardened behavior.
4. **Migrations**: generate the migration, apply it to a dev database. Never hand-edit a migration's generated metadata/journal file.
5. **Reviewer panel** (dispatch by what the layer touches): always run `code-reviewer`; backend changes -> `nestjs-reviewer` + `api-reviewer` (or your stack's equivalents); anything GL/tax/money -> `accounting-reviewer`; auth/PIN/security -> `security-reviewer`; migrations -> `database-reviewer`; frontend -> `frontend-reviewer`. Fix all CRITICAL/HIGH/MEDIUM findings in the same session; none deferred silently.
6. **Gates**: a real production-mode boot/start of the app (not just unit tests, to catch wiring/DI issues) · 100% coverage on money/critical-path/reversal code, 80%+ general coverage · confirm the test runner actually ran tests (watch for coverage tools that pass green on zero matched tests) · re-check that no new upward dependency was introduced this layer.
7. Commit the layer's changes with a clear message once gates pass.
8. Optionally pre-run the next layer's read-only audit while this one is being reviewed.

## 4. Deferrals - track, never drop

- Name each deferral explicitly (what was skipped and why). Distinguish deliberate scope cuts (a feature genuinely out of scope) from open TODOs that need a human to verify something in a live environment.
- At the point of deferral in code, drop a short comment naming the ceiling and what would trigger picking it back up.
- Before declaring the module production-ready, do one final pass over the codebase for such comments to make sure nothing was silently dropped.

## 5. Non-negotiables

- Backend and frontend hardened together, every layer.
- Any dual path (two ways to reach the same outcome) audited together, sharing one engine.
- Work through layers systematically; report only at layer or program boundaries, not on every small step.
- Any new scheduled/background job must correctly carry tenant/request context if this is a multi-tenant codebase.
- Keep any CI guards that exist because of a past incident.

## 6. Close-out

When all layers ship: write a short roll-up of what was hardened, what was deferred (scope cuts vs TODOs), and do one final sweep for dropped-corner comments before calling the module production-ready.
