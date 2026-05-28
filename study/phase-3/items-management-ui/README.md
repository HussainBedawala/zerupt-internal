# Items Management UI — Concepts

The first large customer-facing CRUD surface in the ERP: items list, create/edit
form, barcodes, and a draggable categories tree. The interesting parts aren't the
forms — they're the decisions that keep a bilingual, multi-tenant UI fast and honest.

## 1. Shape the list endpoint to the screen, not to the table

A naive list returns the raw row (`id, sku, name, sellingPrice, isActive`). But the
screen needs the **category name**, **cost**, and **on-hand stock** too. Two ways to get them:

- **Per-row detail fetches** → N+1: one list call + N calls. Dies at scale.
- **Enrich the list query**: one SQL with a tenant-scoped `LEFT JOIN` for the category
  name and a correlated `SUM(...)::text` subquery for on-hand. One round trip, any page size.

Lesson: the API should answer the *question the screen is asking*, not just expose the
table. The cost is a slightly fatter query; the payoff is no waterfall.

## 2. Atomic bulk > client-side loop

"Select 50 items, deactivate" can be done two ways:
- Frontend loops 50 PATCH calls → 50 audit rows, partial-failure mess, 50× latency.
- One `POST /bulk-status {ids, isActive}` → single transactional `UPDATE`, returns
  `{updated, skipped}`. `skipped = requested − updated` tells the caller how many ids
  were wrong-tenant/missing **without leaking which ones**.

The audit subtlety: a bulk op must still record *which* entities changed. A single audit
entry with `entityId: "unknown"` is useless for compliance — so the service appends one
audit entry per affected id using the `UPDATE ... RETURNING` ids.

## 3. Drag-and-drop trees are a projection problem

dnd-kit doesn't "know" about hierarchy — it reorders a flat list. The tree logic is a
**projection**: given the drop position, derive `(parentId, depth, sortOrder)`.

Two traps:
- **Cycles / depth**: dropping a node into its own descendant, or past 4 levels. Guard
  *client-side before firing* (instant feedback) with the server's 422 as the backstop.
  Filter the dragged node's whole subtree out of valid drop targets.
- **sortOrder must be computed against the *real* sibling set, not the *visible* one.**
  If siblings are collapsed they're absent from the flat list — counting position there
  yields a too-small sortOrder and silent mis-ordering after refetch. Walk the full
  server tree to position the moved node.

## 4. Optimistic UI needs a snapshot and a revert

The tree updates instantly on drop, then persists. If the server rejects (422 depth/cycle,
network error), you must restore the pre-drag state — so snapshot before mutating and
revert on error. Optimism without a rollback path is just a bug you haven't seen yet.

## 5. Bilingual UI is a correctness concern, not a translation chore

- **i18n-first**: zod validation messages, page `<title>` metadata, and every label come
  from message files (`en`/`ar`), not string literals. A hardcoded English error is a bug
  for an Arabic user.
- **Bidi isolation**: a product name of unknown direction (Arabic name in an LTR table,
  or vice-versa) can visually hijack surrounding text. Wrap user content in `<bdi>`.
- **RTL drag math**: logical CSS properties (`padding-inline-start`) make indentation flip
  automatically, but the drag *delta* that drives re-parenting depth must be sign-corrected
  for RTL — "drag toward inline-end = nest deeper" has to hold in both directions.
- Keep indent **off** the element that carries the dnd transform, or the translate and the
  margin fight during a drag.

## 6. Defensive UX is the spec, not a nicety

Non-technical retail users will double-click, navigate away mid-edit, and lose network.
So: disable submit while pending (and guard with an `isPending` early-return, since a
button-disable alone races a fast double-click), confirm destructive actions, warn on
unsaved changes with an in-app dialog (never `window.confirm` — it ignores RTL and app
locale), and give every list/form a loading + empty + error state.

## 7. Feature slice = one folder owns the domain on the client

`features/inventory/` mirrors the backend boundary: `types`, `api` (fetchers +
TanStack Query hooks + query keys), `components`. Query keys carry the resource identity;
mutations invalidate the right key. Tenant scoping here rides on the JWT (every call hits
`/tenant/*`), so keys don't need an explicit entity segment — but that's a *decision to
verify against the API*, not an assumption.
