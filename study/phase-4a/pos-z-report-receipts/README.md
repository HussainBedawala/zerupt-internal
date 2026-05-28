# POS Z-Report & Receipts — Concepts (DEV-276)

Two read-shaped surfaces sit on top of the transaction/shift lifecycle: the
**Z-report** (what happened during a shift) and the **receipt** (proof of one
sale). Plus a small write: **reprint logging**. This is the *why* behind the
design, not a line-by-line of the code.

## 1. Read models are derived, not stored

Neither the Z-report nor the receipt is a table you write at sale time. They are
**projections** computed on demand from rows that already exist (transactions,
lines, payments, the shift, org/tax masters). The alternative — materialising a
Z-report row at shift close, or a receipt blob at payment — would create a second
source of truth that can silently diverge from the transactions it summarises.

The cost of deriving-on-read is a few aggregate queries; the benefit is that the
numbers *cannot* lie, because they are recomputed from the same immutable rows the
GL was posted from. For a financial document this trade is almost always correct.

### Live vs. final

A Z-report works on an **open** shift (live running totals — the cashier checks
"how am I doing so far") and a **closed** shift (final figures for the drawer
count). The only difference is that `actualCash` / `cashOverShort` are null until
the shift is reconciled at close. Same query, two lifecycle moments — no separate
"interim report" concept needed.

## 2. Aggregation must respect transaction *type* and *status*

The headline trap: `netSales = totalSales − totalVoidAmount`. It's tempting to
compute "voids" as *every* voided transaction in the shift. But a voided **return**
is not a reversed sale — returns were never in `totalSales` to begin with, so
subtracting voided returns would understate net sales. The void total must be
scoped to `type = 'sale'` so it only reverses things that were counted as sales.

This is the general principle for POS aggregates: a transaction's `type`
(sale/return) and `status` (completed/voided) are *both* filters, and getting
either wrong corrupts the money math in a way that still "looks plausible". Every
roll-up — sales, payments by method, tax, items sold — filters on completed sales;
voids are counted separately and only voided sales feed netSales.

## 3. Money is summed in SQL, finalised in Decimal

Aggregates use `SUM(...)` in Postgres but return the result as **text**, which is
immediately wrapped in `Decimal` before any arithmetic (e.g. `netSales`,
`changeDue`). Never let a monetary sum touch a JavaScript `number` — IEEE floats
silently lose precision at exactly the scale (sub-fils) that a drawer
reconciliation cares about. The DB does the grouping; Decimal does the maths.

## 4. The receipt is a *bilingual data contract*, not rendered text

The endpoint returns structured data — shop header, lines, tax breakdown,
payments, labels — not an 80mm string. Rendering belongs to the client/printer
driver, which knows the paper width, font, and RTL layout. The server's job is to
hand over *complete, correct* data and let the presentation layer lay it out.

Two bilingual mechanisms matter:

- **Item names** carry an Arabic `nameAlt` alongside the English `description`.
  When `nameAlt` is null the printer collapses to a single English line — the data
  expresses "no Arabic name" as null, the layout decides what that means.
- **Static labels** (Subtotal/Tax/Total/…) ship as `{ en, ar }` pairs from the
  server so every receipt is consistent and translation lives in one place, not
  scattered across print templates.

### Snapshot vs. live join

Line `description` is a **snapshot** frozen at sale time (historical accuracy).
The Arabic `nameAlt`, by contrast, is joined **live** from the item master at
print time. That's a deliberate asymmetry: the legally-meaningful figures (price,
tax, totals) are frozen, but a cosmetic translated name is fine to read fresh —
and we never snapshotted it anyway. Know which fields are history and which are
decoration.

## 5. Reprint: the one write, and why it's a separate permission

Re-printing a receipt is mostly a read, but it has one side effect worth
recording: a `reprintCount`. A reprinted tax invoice is a mild fraud/audit signal
(was a duplicate handed out?), so it gets:

- **Its own permission** (`pos.transaction.reprint`), not a borrowed read key.
  RBAC here is *exact-key match* — there's no wildcard expansion — so a write
  action that should be separately grantable (cashier reprints own shift, manager
  any) must be its own key. Overloading `read` would make it impossible to grant
  reprint without granting all reads, and vice-versa.
- **Audit logging** (`@Audited`), so *who reprinted what, when* is in the trail.

### Lazy tracking + atomic increment

The `pos_receipts` tracking row is created **lazily on the first reprint**, not on
the original print. Why: the original print is a client/printer action with no
server round-trip, and a `GET` of receipt data must stay side-effect-free (a
preview/fetch shouldn't mutate state). So "no row" means "never reprinted"
(count 0); the first reprint inserts at 1; each subsequent reprint increments.

The increment is a single **atomic UPSERT** —
`INSERT … ON CONFLICT (tenant, txn) DO UPDATE SET reprint_count = reprint_count + 1`.
This matters because a cashier double-clicking "reprint" fires two near-simultaneous
requests. A read-modify-write (`read count → +1 → write`) would race and lose an
increment; pushing the `+1` into the database as one statement makes concurrent
clicks serialise correctly. Same defensive-UX reflex as the guarded status UPDATEs
elsewhere in POS: assume the user (and the network) will double-fire.

## 6. Multi-tenant aggregates are tenant-scoped at every level

Every query — the shift lookup, each aggregate, the org/tax joins, the item and
tax-group name lookups — filters on `tenantId`, even when an earlier check already
proved the parent belongs to the tenant. Defence-in-depth: a single missing
`tenantId` predicate on an aggregate is how one tenant's totals could leak into
another's Z-report. Cheap to add everywhere; catastrophic to forget once.

A related efficiency point: lookups (item `nameAlt`, tax-group names) are scoped to
*only the ids present on the transaction* (`IN (…)`), never "all groups for the
tenant". An unbounded master-data fetch to build a small lookup map is a latent
performance cliff as the catalog grows.

---

**See also:** [[pos-transaction-lifecycle]] (the sales these summarise),
[[pos-register-shift-api]] (the shift these report on), [[pos-schema]] (the tables).
