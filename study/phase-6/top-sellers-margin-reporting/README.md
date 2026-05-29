# Top Sellers & Margin Reporting

Concepts behind the top-sellers report (DEV-286) — how to rank items by sales
performance *and* report margin without lying about either number.

## What the report answers

"Which items made me the most money over this period?" — ranked by **net revenue**
or **units sold**, with cost of goods, gross margin, and margin % per item.

## The three accounting traps

### 1. Revenue must be net of tax

A line's stored total is **tax-inclusive** (`lineTotal = qty×price − discount + tax`).
The item's cost is **tax-exclusive** (you don't pay VAT to your supplier as part of
COGS — input VAT is reclaimed separately). If you compute margin as
`tax_inclusive_revenue − cost`, you fold the customer's VAT into "profit" and every
margin looks fatter than it is.

So **revenue = `lineTotal − taxAmount`**. VAT is a liability you collect on the
government's behalf, never your revenue. This is the single most common margin-report
bug in retail ERPs.

### 2. Cost is a *snapshot*, not today's price

COGS uses `costAtSale` — the **weighted-average cost (WAC) frozen at the moment of
sale**, per unit. You must never recompute margin against *current* cost, because the
purchase price drifts: an item bought at 30 and now costing 35 still cost *you* 30 when
it sold. Snapshotting cost at sale/confirmation time is what makes historical margin
reproducible. COGS = `costAtSale × quantity`.

### 3. Returns must reduce the ranking, two different ways

A "top seller" that is heavily returned is not a top seller. Returns enter through two
channels, and they behave differently:

- **POS returns** — recorded as **signed quantities** (negative qty, negative line
  total) inside completed transactions. A plain `SUM` nets them automatically. Nothing
  special to do.
- **Sales-invoice credit notes** — a *separate* document type. Two sub-types:
  - `goods_return` — physical stock comes back. Reduces **revenue, quantity, AND COGS**
    (the cost of returned goods is reversed via `returnCost`, the WAC at return time).
  - `price_adjustment` — a discount after the fact, no goods move. Reduces **revenue
    only**; quantity and COGS are untouched (no units returned, `returnCost` is null).

Forgetting credit notes overstates both revenue and COGS for any item with invoice
returns — and the error is invisible because the report still "balances" internally.

## Margin % is sometimes undefined

`marginPercent = grossMargin / revenue × 100`. But when **revenue ≤ 0** (an item given
away free, or returns exceeding sales in the period), the percentage is meaningless or
misleading — a near-zero denominator explodes the ratio, and "0%" on a loss-making line
reads as break-even. The honest answer is **null → "N/A"**, not a fabricated number.
Guard the divide-by-zero *and* the negative-revenue case.

## Ranking is a read-model concern

The report fans out three independent aggregations (POS, invoice, credit-note),
merges them per item in memory, then sorts/limits. Two design notes:

- The aggregations have no data dependency, so they run **concurrently**.
- Sorting + top-N in application code is fine at MVP volumes, but the scalable shape is
  to push `UNION ALL → GROUP BY → ORDER BY → LIMIT` into Postgres so only the top N
  rows ever leave the database. Tracked as a `TODO(scale)`.

## Multi-tenant defence in depth

Every driving table carries `tenant_id`, and the report filters on it at **each** table
in a join chain — not just the root. A branch filter that joins to `posRegisters` still
adds `posRegisters.tenant_id = $tenant`, so a crafted cross-tenant `branchId` can never
widen the result set. Cheap, and it makes the isolation property local to each query
rather than an emergent property of the join graph.

## See also

- `agent-os/product/reports/03-report-templates.md` — the original Top Sellers / Slow
  Movers spec
- `agent-os/product/accounting/05-cogs-logic.md` — WAC, COGS posting, credit-note reversal
- DEV-285 daily-sales report — sibling read-model with the same net-of-tax discipline
