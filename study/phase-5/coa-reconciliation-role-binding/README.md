# COA Reconciliation & Semantic Role Binding

*Phase 5 (Onboarding) · DEV-346 · the backbone of the Merpec migration*

## The problem

A retail business migrating to a new ERP already has a chart of accounts: their own
codes, their own names (often Arabic), their own hierarchy. But our accounting engine
hard-codes ~20 accounts — COGS is 5100, Trade Receivables is 1131, Opening Balance
Equity is 3900. Every auto-generated journal entry resolves these by code/id. So we
face a contradiction:

- If we **replace** our chart with the customer's, the posting engine breaks (no 5100).
- If we **force** our chart on the customer, they don't recognize their own books.

## The resolving idea: two layers, role over code

Separate *what the owner sees* from *what the engine posts to*.

- **Layer 2 — the customer's chart** is the visible source of truth. Their codes,
  names, depth. This is what every screen and report shows.
- **Layer 1 — system roles** live underneath. A *role* (e.g. `cogs`,
  `trade_receivables`) is an abstract slot the engine needs filled. It is identified
  by **role, not code**. Each role binds to exactly one account — whichever account
  currently plays that part.

The key insight that makes this safe: the posting engine resolves accounts by
**immutable UUID**, not by code. So when a customer's chart adopts a system account,
you **rename/recode it in place** — same row, same UUID, new code and name. Every
journal mapping that pointed at it still points at it. The binding survives because
the identity never moved. Delete-and-recreate would sever it; in-place update preserves
it. That single distinction is the whole trick.

## Why a binding must be a database invariant, not a convention

"Each role resolves to exactly one account" is the property the entire general ledger
depends on. If a role were bound to zero accounts, postings fail. To two, postings are
ambiguous. The temptation is to enforce this in application code. The stronger move is
to make the database refuse to represent the broken state: a binding table with a
`UNIQUE(tenant, entity, roleKey)` constraint means Postgres itself guarantees one
account per role. Invariants you can't violate beat invariants you remember to check.

## Deterministic core, AI advisory shell

The reconciliation has an AI-shaped problem (fuzzy-matching "ذمم مدينة" to "Trade
Receivables" across languages) wrapped around a correctness-critical core. The
discipline is to keep them strictly separated:

- **AI proposes** matches (name similarity, code proximity, type agreement) with a
  confidence score. It is allowed to be wrong.
- **Deterministic code validates.** The VALIDATE gate — every role bound to exactly
  one active, postable-*leaf* account of the correct type and normal balance — contains
  **no AI at all**. It is the wall that protects the ledger. A control account match
  below high confidence is never auto-applied; a human confirms.

This is "AI for the judgement call, determinism for the guarantee." The LLM widens what
you can match; it never decides what commits.

## The ordering lesson: a gate must validate the final state

A subtle and dangerous bug class: a validation gate that runs on a *snapshot taken
before later mutations*. If you validate, then "heal" an unbound role by re-pointing it,
then commit — the heal was never validated. The gate must be the **last** thing before
commit, reading the actual post-everything state, and any repair step must itself prove
the new binding is a valid postable leaf of the right type or fail the whole transaction.
A gate that runs early is theatre. The transaction boundary and the validation boundary
have to be the same boundary.

## Don't let anything fall into the void

When two customer accounts both look like "Cash", a naive greedy matcher binds one and
silently discards the other. In an accounting migration, a discarded account can carry an
opening balance — so "silently dropped" means "money with no home," which surfaces later
as an unexplained trial-balance imbalance. The invariant worth testing explicitly:
**every input account lands somewhere** — matched, customer-only, or flagged for
confirmation — never nowhere. Conservation of accounts is conservation of balances.

## Idempotency for a destructive, resumable step

Onboarding is interrupted, retried, double-clicked. A reconciliation that recodes
accounts must produce the same result when run twice on the same input and do no further
damage. Two mechanisms combine: a content fingerprint of the input chart that
short-circuits an already-applied run, and a per-entity advisory lock that serializes
concurrent attempts so two runs can't interleave their recodes. Deterministic apply +
fingerprint short-circuit + serialization = safe to re-run.

## Hierarchy: their structure wins for sight, our roles win for posting

Charts vary in depth — some flat, some four levels deep. The engine only cares that each
role binds to a *leaf* (postable) account; it is indifferent to how deep that leaf sits.
So: adopt the customer's hierarchy as-is, no flattening. The one edge case is a customer
who posts directly to a header/parent account. The engine can't post to a parent, so the
gate forces a resolution — treat it as a leaf or create a child to carry the balance —
before binding. Depth is cosmetic; postable-leaf-ness is structural.

## See also

- `agent-os/product/accounting/04-chart-of-accounts.md` — the seeded template + system accounts
- `agent-os/product/accounting/06-account-mappings.md` — how events resolve to accounts by id
- `agent-os/product/onboarding/03-ai-import-assistant.md` — the reconciliation spec
- `study/phase-5/ai-import-resolution-ladder` — the column-resolution sibling (DEV-342)
