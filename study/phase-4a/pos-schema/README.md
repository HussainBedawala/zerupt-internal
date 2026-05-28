# POS Schema: Cash Accountability & Sale Immutability

_Phase 4A · POS · from DEV-273 (POS tables)_

The POS engine's data model is six tables: `pos_registers`, `pos_shifts`,
`pos_transactions`, `pos_transaction_lines`, `pos_payments`,
`pos_cash_movements`. The interesting design decisions aren't the columns —
they're the invariants the schema is shaped to protect: **cash accountability**
(every cent in the drawer is traceable to a shift) and **sale immutability**
(a completed receipt can never be silently rewritten).

## Why shifts exist at all

A register is just a checkout point. The unit of *accountability* is the
**shift** — one cashier's session from opening float to closing count. Everything
that moves cash hangs off a shift: transactions, and the non-sale `pay_in` /
`pay_out` movements (supplier paid from the till, petty cash). At close you can
compute **expected cash** = opening float + cash sales + pay-ins − pay-outs, and
compare it to the **actual** counted cash. The difference (`cashOverShort`) is
the shrinkage signal. None of that is computable unless every cash event is tied
to exactly one shift.

Two rules the schema enforces with **partial unique indexes** (a plain unique
index can't, because closed shifts must be allowed to pile up):

- One open shift per register — `UNIQUE (register_id) WHERE status <> 'closed'`.
- One open shift per cashier across all registers — `UNIQUE (tenant_id,
  cashier_id) WHERE status <> 'closed'`.

The `WHERE status <> 'closed'` predicate is the whole trick: it makes the
uniqueness apply only to live sessions, so history accumulates freely while the
"only one active session" invariant holds.

## Snapshots: why lines copy data instead of pointing at it

A transaction line stores `description`, `unitPrice`, `taxAmount`, and
`costAtSale` as **values**, not as joins back to the item master. This is
deliberate. If a line pointed at `items.sellingPrice`, then changing an item's
price tomorrow would silently rewrite yesterday's receipts and last quarter's
margin reports. A sale is a historical fact; it must freeze the numbers that were
true at the moment of sale. `costAtSale` in particular is captured at completion
from the cost engine (WAC/FIFO) so gross-margin reporting is stable even as the
moving-average cost drifts.

## The total that must NOT be constrained

An obvious-looking guard is `CHECK (grand_total = subtotal + tax_total -
discount_total)`. It's wrong. The payment spec applies **cash rounding** to the
grand total (KWD to the nearest 5 fils, etc.), so the rounded `grandTotal`
legitimately differs from the arithmetic sum, and the rounding delta is absorbed
into cash over/short. A strict equality CHECK would reject every rounded cash
sale. Lesson: a schema invariant is only valid if it's true for *every* legal
state, including the ones introduced by downstream rules like rounding.

## What's a FK and what's just a uuid

Multi-tenancy here is one Postgres DB per tenant, so FKs only make sense for
tables that live in the *same* tenant DB. `branchId`, `warehouseId`, `itemId`,
`taxGroupId`, and the intra-POS links (shift → register, line → transaction) are
real foreign keys. But **user references** (`cashierId`, `closedById`,
`voidedById`, `priceOverrideById`, `approvedById`) are plain `uuid` with no FK —
users live in the central/Supabase DB, not the tenant DB, so a cross-database FK
is impossible. Same for `customerId`, `giftCardId`, `storeCreditId`, `batchId`:
those tables don't exist yet, so they're plain uuids today and become FKs when
their modules land. The schema documents each of these so a future reader knows
the missing FK is intentional, not an oversight.

## onDelete: cascade vs restrict, and why it encodes ownership

- **cascade** on `pos_transaction_lines` and `pos_payments` → these are wholly
  *owned* by their transaction; they have no meaning without it.
- **restrict** on shifts, registers, items, tax groups → these are *referenced*,
  not owned. Deleting a register that has shifts, or an item that has sales
  history, would orphan financial records — so the delete is blocked. This is the
  same pattern the costing tables use to make items with stock movements
  undeletable.

## Forward-compat enums

The enums carry values the MVP doesn't write yet — `posTransactionType` has
`exchange`, `posPaymentMethod` has `store_credit`/`gift_card`/`custom`. Postgres
enum changes mean a migration applied across every tenant DB, so defining the
full value set now (from the spec) trades a slightly looser enum today for not
having to run a fleet-wide `ALTER TYPE` when Returns/Exchange and gift cards ship.
