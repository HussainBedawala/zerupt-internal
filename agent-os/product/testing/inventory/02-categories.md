# Inventory — Categories Testing Checklist

> Persona: **Storekeeper / inventory manager.** You organize the warehouse by grouping items into meaningful buckets — Electronics, Spare Parts, Consumables. You care that every item has a home and that deleting a category never silently orphans products. Ask at every screen: **"what's the dumbest thing a storekeeper could do here?"**

- **Route(s):** `/inventory/categories`
- **Feature dir:** `apps/web/src/features/inventory/` — `categories-panel.tsx`, `category-tree.tsx`, `category-tree-node.tsx`, `category-dialog.tsx`, `category-delete-dialog.tsx`
- **API:** `apps/api/src/inventory/items/item-categories.controller.ts` prefix `tenant/item-categories` — `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`, `POST /:id/image`, `DELETE /:id/image`
- **Depends on:** None (categories are foundational — run this before 01 Items).

## 0. Preconditions

- [ ] Logged in as a user with `inventory:write` permission; confirm that a user with only `inventory:read` cannot see Add / Edit / Delete controls (server must also reject the mutation — not just the UI hiding it).
- [ ] Know the rough tree structure your dataset should have (number of root categories, any nested children).
- [ ] At least one item should be assigned to a category to exercise the delete-guard and inheritance paths.

## 1. Functional — actions & states

### Category tree

- [ ] **Tree loads** — all categories for the tenant appear as a hierarchical tree, parent nodes expandable.
  - [ ] Loading state: skeleton or spinner shown; tree is not blank/broken mid-load.
  - [ ] Error state: API failure shows a human-readable message, not a raw stack trace or blank screen.
  - [ ] Empty state: if no categories exist, a clear empty-state prompt appears (not a broken panel), with a call to action (Add category).
- [ ] Expanding a parent node reveals its child categories; collapsing hides them.
- [ ] Leaf categories (no children) show no expand toggle; visually distinguished from parent nodes.
- [ ] Sort order (`sortOrder`) is respected within each level; manually dragging/reordering (if supported) updates sort positions without corrupting the tree.

### Add category

- [ ] Clicking "Add category" opens the category dialog.
  - [ ] **Name (primary):** required; blank submission blocked client-side and server-side.
  - [ ] **Secondary name (nameAlt):** optional bilingual field; `dir="auto"` ensures Arabic renders RTL; hidden for monolingual tenants.
  - [ ] **Parent category:** searchable picker (not a free-text field); selecting a parent nests the new category correctly.
  - [ ] **Default tax group:** optional picker; the selected group will be inherited by all items assigned to this category (test that inheritance happens — see section 2).
  - [ ] **Default account mappings:** optional; inherited by items in this category.
  - [ ] Submit button disabled while save is in flight (no double-submit).
  - [ ] On success: dialog closes, tree refreshes, new category appears in the correct position under its parent.
  - [ ] On error: dialog stays open, error shown inline, entered data preserved.

### Edit category

- [ ] Opening a category opens the dialog pre-populated with current values.
- [ ] Changing the parent (re-parenting): the category moves to its new position in the tree; existing items assigned to this category are not orphaned.
- [ ] Changing the default tax group or account mappings: new items added to the category will inherit the new defaults; confirm existing items are NOT retroactively changed (this is an item-level decision).
- [ ] Saving with no changes is harmless.

### Delete category

- [ ] Attempting to delete a category that still has items assigned shows the `category-delete-dialog.tsx` reassignment flow: storekeeper must either reassign items to another category or confirm removal of the assignment before the category is deleted. Silent orphan creation is not allowed.
- [ ] Attempting to delete a parent category that still has child categories is blocked until children are removed or re-parented.
- [ ] Deleting a category with no items and no children succeeds after a confirmation prompt; the category disappears from the tree.

### Image upload / delete

- [ ] Uploading a category image (`POST /:id/image`): progress shown; image appears on the category node after upload.
- [ ] Uploading an oversized or wrong-format file shows a user-friendly error.
- [ ] Deleting the image (`DELETE /:id/image`): confirmation prompt; image removed.

## 2. Domain invariants

> Cross-cutting invariants are defined in [`README.md`](README.md). The following are specific to Categories.

- [ ] **No cycles:** a category cannot be set as its own ancestor. The API must reject any PATCH that would create a circular parent reference (parent → child → grandchild → parent).
- [ ] **No orphan categories after parent delete:** deleting a parent cascades correctly — either blocked until children are handled, or children are promoted to root. No category can have a non-existent `parentCategoryId` in the database.
- [ ] **Items are not silently orphaned on delete:** any category delete that would leave items without a category must surface the reassignment dialog. The server must also enforce this (not just the UI).
- [ ] **Default tax group inheritance:** when a new item is assigned to a category that has a `defaultTaxGroupId`, the item's tax group pre-fills with that value. Changing the category's default does NOT retroactively alter existing items.
- [ ] **Default account mappings inheritance:** same pattern as tax group — new items inherit; existing items are unaffected.
- [ ] **Bilingual name stored correctly:** both `name` and `nameAlt` are stored and returned as distinct fields; they are not merged or overwritten.
- [ ] **Tenant isolation:** all categories returned belong to the current tenant only; switching tenants (if multi-entity) shows a completely separate category tree.

## 3. Edge cases & defensive UX — "the dumbest thing a storekeeper could do here"

- [ ] **Self-parent:** storekeeper tries to set a category as its own parent — rejected client-side (not shown in the picker) and server-side.
- [ ] **Circular reparent:** category A is parent of B; storekeeper tries to make B the parent of A — rejected with a clear message.
- [ ] **Delete a category with 500 items:** confirmation dialog must show the item count so the storekeeper understands the scope before reassigning; not just "Are you sure?".
- [ ] **Duplicate category name:** two categories with the same name at the same level — confirm whether this is allowed or blocked. If allowed, document it; if blocked, verify the error message is clear.
- [ ] **Very long name (200+ chars):** saves correctly; truncated in the tree with tooltip showing full name.
- [ ] **Rapid double-click on Save:** only one create request fires.
- [ ] **Stale tree:** storekeeper opens the category tree in two tabs, adds a category in one, then tries to nest under it in the other tab — the picker in the second tab refreshes or the server resolves correctly.
- [ ] **RTL rendering:** Arabic category names in the tree render right-to-left; the tree indentation is mirrored correctly in RTL layout (start/end logical properties, not left/right).
- [ ] **Deep nesting (5+ levels):** tree renders without UI overflow; indent is visually sensible.

## 4. Cross-module / integration

- [ ] Categories created here appear immediately in the category filter on the Items list (`/inventory/items`).
- [ ] Items assigned to a category reflect the category's default tax group in Sales Order and POS line items.
- [ ] Category-level account mappings drive the inventory and COGS accounts used in auto-GL posting for items in that category — verify one item movement posts to the correct accounts.
- [ ] Category appears in inventory valuation and COGS reports as a grouping dimension.

## 5. Known gaps (from recon — verify or track)

- Drag-and-drop reordering of categories (`sortOrder`): unknown if implemented in the UI; if not present, track as LOW gap.
- Bulk category reassignment (moving many items from one category to another): unknown endpoint — confirm or track as MEDIUM gap.
- Category-level account mapping UI: confirm the form fields for `defaultAccountMappings` are exposed in the dialog and not just stored as backend defaults (MEDIUM).
- Category image display: confirm images are displayed on item cards or category list views, not just stored (LOW).

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
