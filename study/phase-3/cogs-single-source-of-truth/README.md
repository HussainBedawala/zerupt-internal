# COGS: a Single Source of Truth

When a sale happens, two distinct accounting facts must be recorded:

1. **The revenue side** — what the customer paid: `DR Cash/Bank/AR, CR Revenue, CR Output Tax`.
2. **The cost side (COGS)** — what those goods cost us: `DR COGS, CR Inventory`.

The trap: it's tempting to let whichever module raises the sale (POS, Sales) post
*both* halves, because it already knows the quantities. But the selling module does
**not** know the cost. Cost lives in the inventory costing engine — it owns the
weighted-average cost (WAC) / FIFO layers and is the only place that can compute the
correct cost *at the instant of the movement*.

## Why double-posting happens

If the POS module bakes a COGS line into its own journal entry **and** the inventory
engine also emits a COGS entry when it decrements stock, the same cost is booked
twice. The general ledger then shows COGS at 2× and inventory credited at 2× —
silent, compounding, and very hard to spot because each entry individually balances.

## The rule

> The component that **owns the cost** is the only component that posts COGS.

- Selling modules (POS, Sales) emit a domain event describing the sale and post only
  the **revenue** side.
- The inventory engine consumes that event, decrements stock at its own computed
  cost, and posts the **COGS** side (`inventory.sale`), plus the reversal on returns
  (`inventory.sale_return`: `DR Inventory, CR COGS`).

The two journal entries are separate but reconcilable: they share a
`sourceDocumentId` and `correlationId`.

## The consistency invariant for reversals

A return puts goods back into inventory and reverses the original COGS. The amount
credited back to COGS **must equal the value written to the stock ledger for that
same movement** — never a separately recomputed figure (e.g. the post-return average
cost). If the ledger records the inbound at value X but the reversal posts value Y,
the GL inventory account drifts away from the physical stock-ledger valuation over
time. Deriving the reversal from the *same* number the ledger used makes them equal
by construction, regardless of costing method.

## Idempotency when one event fans out to many lines

A single sale event carries N line items, each producing its own stock-ledger row.
The ledger dedupes on a unique `eventId`, so the N rows **cannot** share the parent
event's id — only the first would insert; the rest would look like duplicates.

The fix is a **deterministic** per-line key: derive a UUID v5 from
`(line identifier, parent event id)`. Deterministic means a retry of the whole event
regenerates the exact same per-line keys, so already-committed lines are correctly
skipped and only the failed line re-applies. UUID v5 (a hash of namespace + name) is
collision-free and needs no extra dependency — Node's built-in `crypto` produces it.

## Why event-driven, not a direct call

The inventory engine never imports POS/Sales and vice-versa. They communicate through
named domain events on an outbox → poller → emitter pipeline. The poller establishes
tenant database context (via AsyncLocalStorage) *before* dispatching, so every
listener resolves the correct per-tenant connection. This keeps modules decoupled and
lets the cost side and revenue side evolve independently — at the price of a stringly-
typed contract (the event names and payload shapes must agree on both ends).

_Built in DEV-270. Follow-up architecture refinements: DEV-331._
