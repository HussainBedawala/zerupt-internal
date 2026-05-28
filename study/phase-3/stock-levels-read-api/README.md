# Stock Levels Read API (DEV-265)

The concepts behind exposing inventory stock as a read API over a transactional
materialized view. Not a how-to — the reasoning that shaped the design.

## Why a materialized view, and what "read API" means here

`materialized_stock_levels` is not an eventually-consistent cache. It is updated
in the **same transaction** as the `stock_ledger_entries` row that caused the
movement (see `inventory-costing.ts`). That means a read endpoint can trust it as
the current truth without replaying the ledger — the whole point of materializing
on-hand + weighted-average cost is O(1) reads at point-of-sale instead of an
aggregate scan over every historical movement.

So the "read API" is genuinely just a projection + join. There is no recomputation,
no locking, no business rule beyond deriving a display status. The hard accounting
work already happened at write time in the costing engine.

## Derived status vs stored value

Two values in the response are *not* stored — they are derived per request:

- **`status`** (OK / Low / OutOfStock) — a function of `onHand` and the item's
  `reorderLevel`. Storing it would mean recomputing and rewriting rows whenever a
  reorder level changes, for zero benefit. Derive on read.
- **`totalValue`** — this one *is* stored (kept consistent incrementally by the
  costing engine) and we return the stored column rather than recomputing
  `onHand × averageCost`. Recomputing risks drift from the engine's rounding
  (Decimal.js, 6dp, ROUND_HALF_EVEN). Trust the writer.

The lesson: derive cheap, presentation-only values; never recompute money the
authoritative writer already maintains — you'll diverge on rounding.

## Status thresholds and the null reorder level

`reorderLevel` is nullable — most items never get a low-stock alert configured.
The status logic has to treat "no threshold" as "never Low", not "always Low".
Order of checks matters:

1. `onHand <= 0` → OutOfStock (regardless of threshold; out is out)
2. `reorderLevel != null && onHand < reorderLevel` → Low
3. otherwise → OK

Quantities are `numeric(19,6)` strings (items sold by weight/volume), so the
comparison runs through Decimal, never IEEE floats — `19.5 < 20` must be reliable.

## Empty state vs 404 — the existence oracle

For "stock of one item across warehouses", returning **404 when no rows exist**
conflates two things: the item has no stock yet (valid, common) vs the item id is
bogus. A 404 that fires only for valid-but-empty also becomes an *existence oracle*
— a caller can map which ids are real by watching for 200 vs 404. Returning an
empty array for "no stock" is both the correct REST empty-state and removes the
oracle. 404 is for "this collection's parent doesn't exist", which a read endpoint
gated by tenant auth doesn't need to assert here.

## Bounded alert feeds

The low-stock endpoint is an unpaginated feed for dashboards/alerts. Unpaginated
is acceptable *only* because it is bounded by a sane reality (a shop with 200+
simultaneously-below-reorder SKUs has a bigger problem than pagination). Encoding
that assumption as an explicit cap (`LIMIT 200`) is the difference between a
documented invariant and a latent full-table-scan waiting for the one tenant who
violates the assumption. The general list endpoint stays paginated for the
unbounded case.

## Route ordering: static before param

`GET /low-stock` and `GET /:itemId` share a prefix. A `:itemId` param route can
swallow `/low-stock` as "an item called low-stock". Declaring the static route
first is the defensive habit; here `ParseUUIDPipe` on `:itemId` would also reject
"low-stock", but relying on two safeguards beats relying on framework match order.

## Typed predicates over raw SQL

A column-to-column comparison (`onHand < reorderLevel`) is expressible as raw
`sql\`...\`` or as Drizzle's `lt(a, b)` / `isNotNull(c)`. The raw form has no
injection risk (operands are column refs) but is invisible to the type checker —
a schema rename slips through silently. The typed builder is the same query with
a compile-time tripwire. Prefer it unless the predicate genuinely can't be
expressed structurally.
