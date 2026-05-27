# Category Tree Integrity: Depth Limits & Cycle Prevention

_Phase 3 · Inventory · from DEV-263 (item categories CRUD)_

Item categories form a hierarchy (`Electronics > Mobile > Accessories > Cases`)
modelled as an adjacency list: each row stores its own `parentId`, `NULL` for a
root. That single column is enough to represent any tree — but it lets you store
trees that violate two business rules Postgres can't enforce in DDL:

1. **Max depth** — the catalog allows at most 4 levels.
2. **No cycles** — a category must never end up as its own ancestor.

## Why the database can't enforce these

A `CHECK` constraint can only see one row at a time; depth and cycles are
properties of a *path through many rows*. A foreign key stops you pointing at a
non-existent parent, but it happily accepts `A → B → A`. So the invariant has to
live in the service layer, and the service has to reason about the whole path,
not just the row being written.

## The two operations that can break the tree

- **Create under a parent:** the new node sits one level below its parent, so
  `depth(parent) + 1` must be ≤ 4.
- **Re-parent (move a subtree):** the worst case is `depth(newParent) + 1 +
  height(movedSubtree)` — moving a tall subtree under a deep parent can blow the
  limit even if neither alone does. And re-parenting is where cycles appear: if
  the new parent is the node itself, or any of its descendants, the link folds
  the tree back on itself.

**Cycle check = reachability.** "Is the proposed parent inside the subtree I'm
moving?" Walk *up* from the proposed parent following `parentId`; if you reach
the node being moved, that parent is a descendant → reject. Equivalent to asking
whether the node is an ancestor of its would-be parent.

## The N+1 trap (and the fix)

The naive implementation walks the tree by querying one level at a time —
`findFirst(parent)`, then its parent, then its parent… One DB round-trip per
level, per check. On a modestly deep tree with branching that's dozens of
sequential queries, each paying serverless connection latency, with a real risk
of timing out under load. The walk is *correct* but the access pattern is wrong.

The fix is to separate **fetching** from **reasoning**: load the tenant's entire
`(id, parentId)` set in **one** query into a `Map`, then run depth / height /
ancestor checks as pure in-memory functions over that map. Catalogs are small
(hundreds of rows), so the whole graph fits in memory cheaply, and the three
checks collapse to zero extra round-trips. For very large trees the same logic
expresses as a single `WITH RECURSIVE` CTE — push the traversal into Postgres
instead of the app — but in-memory is the right call at this scale.

## Defensive detail: guarding the guard

The in-memory walks keep a `seen` set and bail if they revisit a node. The tree
*shouldn't* contain a cycle (every write goes through these checks), but a
corrupt row from a bad migration or manual edit would otherwise spin the
validator into an infinite loop. The integrity check must itself survive
violating the very invariant it protects — fail closed, not forever.

See also: [[defensive-ux]] — same instinct ("what's the dumbest state the data
could be in?") applied to stored data rather than user input.
