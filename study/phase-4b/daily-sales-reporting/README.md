# Daily Sales Reporting — Concepts

Concepts behind the daily sales summary report (DEV-285). Not a how-to — the *why*.

## What a "daily sales summary" answers

The owner's first morning question: *"How did we do yesterday?"* — across **every
revenue channel**, not just the till. In Zerupt that means two independent sources:

- **POS transactions** — walk-in retail, settled immediately with tenders (cash/card).
- **Sales invoices** — B2B / credit sales, recognised when **confirmed**, settled later
  via receipts (AR).

A daily summary blends both into one row per calendar day so the number matches what
the owner intuitively calls "sales today".

## Why aggregate in the DB, not in app code

Each metric is a `GROUP BY date` over potentially thousands of rows. Pushing
`count`/`sum` into Postgres means the network carries one row per day, not one row per
transaction. The app only merges a handful of small grouped result sets. This is the
core reporting pattern: **aggregate at the source, assemble in the app.**

## The multi-source merge problem

Six independent aggregations (POS headers, voids, payments-by-tender, POS units,
invoice headers, invoice units) each return their own `{date → value}` set. They do
**not** share the same set of dates:

- A day might have invoices but no POS sales (shop closed, B2B order shipped).
- A day might have only a void.

An inner join across sources would silently **drop** such days. The correct mental
model is a **full outer merge keyed by date** — build a `Map<date, bucket>`, let any
source create a date, and default missing metrics to zero. This is why the merge runs
in application code (a Map) rather than one giant SQL join.

## Business-date bucketing & the timezone trap

"Which day does a sale belong to?" is a business decision, not a technical one. A sale
at 1am local time belongs to that local day — but timestamps are stored in UTC. Casting
`timestamptz::date` buckets in the **database session timezone**, so a UTC-stored 1am
local sale can land on the wrong day near midnight. MVP accepts UTC bucketing; true
store-local boundaries require the tenant/branch timezone in the cast. Worth knowing
the report can be off-by-one at day edges until that lands.

## Voids are negative, but tracked separately

A void reverses a completed sale. Rather than net it into `posSales` silently, the
report keeps `totalSales`, `totalVoids`, and `netSales = totalSales − totalVoids` as
distinct columns. Owners want to *see* the void volume (it's a fraud/training signal),
not have it disappear into a smaller top-line. Voids bucket by `voided_at` (when the
reversal happened), not the original sale date.

## Why payment breakdown is POS-only

Tenders (cash, card) exist at the point of sale. A confirmed invoice is a *promise to
pay* (accounts receivable) — no money has changed hands, so it contributes to
`invoiceSales` but to **no** tender bucket. Mixing the two would double-count or imply
cash that isn't in the drawer. The breakdown's keys are dynamic (only methods that
actually occurred appear); a missing key means zero, not "not supported".

## Money as strings, not floats

All monetary output is a fixed-precision decimal **string** (6 dp), computed with
decimal.js. Floating-point sums drift (`0.1 + 0.2 ≠ 0.3`); for money that's a
reconciliation failure. The whole accounting/reporting layer treats money as
arbitrary-precision decimals end to end — the DB stores `numeric(19,6)`, the driver
returns text, and the app never coerces to `number`.

## Defence-in-depth tenant isolation

Every query filters `tenantId` — including on the *driving* table of a join, even when
a foreign-key join would already scope the rows. Relying on the join alone means one
missing/incorrect FK could leak another tenant's revenue. An explicit `tenantId`
predicate on the table you select *from* is cheap insurance in a multi-tenant system
where the blast radius of a leak is someone else's financials.

## read vs view (RBAC taxonomy)

The permission registry distinguishes `read` (retrieve one mutable record) from `view`
(read-only access to **computed/aggregate** data). A report is aggregate data, so the
convention leans `view`. This endpoint shipped as `reports.sales.read` to match the
issue spec — a reminder that permission *naming* encodes intent and is worth getting
consistent before role templates harden around it.
