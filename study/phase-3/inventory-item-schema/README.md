# The Item Master: Schema Decisions That Outlive the MVP

The item master is the spine of a retail ERP — every sale, purchase, stock movement,
and cost layer points back to a row in `items`. Because so much hangs off it, the
schema choices made here are expensive to change later. A few of them are worth
understanding beyond "what the spec said."

## Building the foreign keys *after* the thing they reference

The inventory costing engine (stock ledger, cost layers, materialized stock levels,
costing configs) was built **before** the `items` table existed. Those tables carried
an `itemId` column with a comment: *"no FK until the items table is defined."* That is
a deliberate, honest form of tech debt — the column shape was right, only the
referential constraint was deferred.

When `items` finally landed, wiring the FKs was safe **only because those tables were
empty**. A foreign key constraint added to a populated table forces Postgres to
validate every existing row against the new parent — and if any `itemId` has no
matching `items.id`, the `ALTER TABLE` fails outright. In dev that meant a one-line
check (`SELECT count(*)`) before migrating. In production, after go-live, the same
constraint addition would take an `ACCESS EXCLUSIVE` lock and scan the whole table —
which is why the mature pattern is `ADD CONSTRAINT ... NOT VALID` followed by a
separate `VALIDATE CONSTRAINT` that scans without blocking writes.

The lesson: deferred FKs are fine, but the *order of operations* and the *table's row
count at constraint time* are what determine whether the cleanup is trivial or a
production incident.

## `onDelete` is a business rule, not a technical detail

Every FK has to answer: "what happens to me when my parent is deleted?" The answer
encodes policy:

- **`restrict`** on all four costing tables' `itemId` → *you cannot delete an item that
  has transaction history.* This is the schema enforcing the spec's lifecycle rule
  ("cannot delete if transactions exist") at the database level, where no application
  bug can bypass it. Deletion is blocked by the existence of a ledger row, full stop.
- **`cascade`** on `item_barcodes.itemId` → barcodes are *wholly owned* by their item
  and meaningless without it; deleting the item should sweep them away.
- **`set null`** on `items.categoryId` → a category is a loose classification, not an
  owner. Deleting a category shouldn't delete its products; they just become
  uncategorized.

Three different answers on three FKs, each chosen to match what the relationship
actually *means*. The default (`no action`) would have been a silent abdication of
that decision.

## Nullable `categoryId`: designing for the messy real world

The spec lists `categoryId` as "required." The schema makes it nullable anyway. Why?
Because MENA/India/SEA retail onboarding involves bulk CSV imports of thousands of
SKUs, draft items half-entered at the counter, and quick-add flows where the clerk
hasn't decided on a category yet. A `NOT NULL` constraint would reject all of those at
the worst possible moment.

The rule still exists — but it moves up a layer: the *service* can require a category
on an item before it transitions to `Active`, while the *database* permits the
uncategorized intermediate state. This is a recurring pattern: enforce hard invariants
(money can't go negative, history can't be orphaned) in the DB; enforce
workflow-stage rules (a draft may lack a category) in the service. Putting a
workflow rule in a column constraint freezes the workflow.

## `NULLS NOT DISTINCT`: when two NULLs should collide

Categories are a tree: each has a `parentId`, and top-level categories have
`parentId = NULL`. The natural uniqueness rule is "no two sibling categories share a
name" → a unique constraint on `(tenant_id, parent_id, name)`.

But SQL's default is that **`NULL` is never equal to `NULL`**. So two top-level
categories both named "Electronics" (both with `parent_id = NULL`) would *not* violate
a normal unique constraint — the NULLs are treated as distinct, and the duplicate
slips through exactly at the root of the tree where it's most visible.

Postgres 15+ added `UNIQUE NULLS NOT DISTINCT`, which makes two NULLs count as equal
for uniqueness. That single clause closes the top-level-duplicate hole. (Worth noting:
the ORM first emitted this as an invalid `WITH (nullsNotDistinct=true)` index storage
parameter; the correct form is a constraint modifier. A reminder that generated SQL
still needs a human to read it before it hits the database.)

## Forward-compatible enums vs. premature columns

MVP only sells "flat" items with no serial/batch tracking and weighted-average cost.
Yet the enums ship with the full value set — `item_type` includes `matrix_parent` /
`matrix_variant`, `item_tracking_type` includes `serial` / `batch`. And the table
carries a `parentItemId` self-reference that nothing writes yet.

This is a calculated bet. Adding a *value* to a Postgres enum later is cheap and
non-locking; reshaping a heavily-referenced table to add a column and a self-FK after
millions of rows exist is not. Including the wider enum and the `parentItemId` column
now costs almost nothing and removes a future migration from the critical path. The
guard against this freedom becoming corruption is a CHECK constraint:
`type = 'matrix_variant'` **if and only if** `parent_item_id IS NOT NULL`. The future
feature is unbuilt, but the schema already refuses to represent an incoherent version
of it.

The line to walk: forward-compat is worth it for *cheap, hard-to-reverse* structure
(enum values, a nullable column with a guarding CHECK). It is *not* worth building
matrix-variant generation logic, serial-tracking services, or FIFO plumbing nobody
uses yet. Schema can lean forward; behavior should not.

## Indexing for the constraint you just added

A subtle one surfaced in review. The per-item costing-config table had only *partial*
indexes (`WHERE is_active = true`). That's perfect for the hot read path ("get the
active config"). But the new `onDelete: restrict` FK introduces a *different* query the
database runs on its own: when something tries to delete an item, Postgres scans the
child table for *any* referencing row — active or not. The partial indexes don't cover
inactive rows, so that check would degrade to a full scan as historical configs pile
up. The fix was a plain, non-partial index on `itemId` to back the restrict check.

The general point: adding a foreign key silently creates a new access pattern (the
referential-integrity check) that your existing query-shaped indexes may not serve.
The index that makes your reads fast is not necessarily the index that makes your
constraint cheap.

---

_Built in DEV-262 (item-master schema: `items`, `item_categories`, `item_barcodes`;
resolved the deferred costing-table FKs). Spec: `agent-os/product/inventory/01-item-model.md`._
