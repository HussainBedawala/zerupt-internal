# Inventory — Items / Catalog Testing Checklist

> Persona: **Storekeeper / inventory manager.** You are the person who knows every SKU in the warehouse by heart. You receive goods, label shelves, and need on-hand numbers to be exactly right. You are NOT an accountant. Ask at every screen: **"what's the dumbest thing a storekeeper could do here?"**

- **Route(s):** `/inventory/items`, `/inventory/items/new`, `/inventory/items/[id]`
- **Feature dir:** `apps/web/src/features/inventory/` — `items-table.tsx`, `item-form-panel.tsx`, `items-list-panel.tsx`, `items-toolbar.tsx`, `items-bulk-bar.tsx`, `item-image-upload.tsx`, `item-stock-display.tsx`; bulk import in `apps/web/src/features/inventory-import/`
- **API:** `apps/api/src/inventory/items/items.controller.ts` prefix `tenant/items` — `GET /`, `GET /search`, `POST /bulk-status`, `GET /barcode/:barcode`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`, `POST /:id/image`, `DELETE /:id/image`
- **Depends on:** 02 Categories (items must be assignable to a category), 05 Warehouses (on-hand display per location requires locations to exist).

## 0. Preconditions

- [ ] Dataset loaded with a realistic mix: at least one Flat item, one MatrixParent with variants, one draft item, one inactive item, and one item with existing stock movements (to exercise the blast-radius guard).
- [ ] Logged in as a user with `inventory:write` permission; separately confirm that a user with only `inventory:read` cannot reach the Add / Edit / Delete actions — the server rejects the mutation, not just the UI hiding it.
- [ ] At least one category and one warehouse/location exist before running this checklist.

## 1. Functional — actions & states

### Item list

- [ ] **List loads** — all items for the tenant appear in the table with name, SKU, type badge, status, and on-hand quantity.
  - [ ] Loading state: skeleton rows shown; table is not blank while data is in flight.
  - [ ] Error state: API failure shows a human-readable message, not a raw stack trace or blank white screen.
  - [ ] Empty state (no items yet): a clear empty-state prompt appears (not a broken table) with a call to action (Add item / Import).
- [ ] **Search** (`GET /search`): typing filters by name, SKU, or barcode; partial match works; clearing restores the full list.
- [ ] **Filter by type** (Flat / MatrixParent / MatrixVariant) returns the correct subset; combining with search works.
- [ ] **Filter by status** (draft / active / inactive) returns the correct subset.
- [ ] **Filter by category** shows only items in that category (or its children if hierarchical).
- [ ] All filters have a clear reset / "All" option.
- [ ] **Pagination**: page 2+ shows correct, stable items (no duplicates or missing rows when a new item was just added).
- [ ] **Bulk status change** (`POST /bulk-status`): selecting multiple items and changing status in bulk updates all of them; confirmation dialog shown before apply; partial-failure handled gracefully.

### Add item

- [ ] Clicking "Add item" opens the item form.
  - [ ] **SKU field**: auto-generated or free-text; duplicate SKU rejected server-side with a clear message.
  - [ ] **Type selector** (Flat / MatrixParent): switching type clears variant-specific fields; storekeeper cannot accidentally choose MatrixVariant directly (it is child-only).
  - [ ] **Tracking type** (none / serial / batch): drives downstream lot/serial fields; changing after the item has stock is blocked or warned.
  - [ ] **Valuation method** (WAC / FIFO / specific): must be consistent with tracking type (specific = serial only); invalid combination rejected.
  - [ ] **Category picker**: searchable dropdown, not a free-text field; selecting a category inherits default tax group and account mappings.
  - [ ] **Bilingual name**: primary name and secondary (alt) name fields; `dir="auto"` on the alt field; neither should be mandatory beyond the primary name for monolingual tenants.
  - [ ] **Base price**: currency precision follows tenant settings (KWD = 3dp) — never hardcoded 2dp.
  - [ ] **Weight**: optional; numeric only; negative weight rejected.
  - [ ] Submit button disabled while save is in flight (no double-submit / double-SKU).
  - [ ] On success: dialog/panel closes, list refreshes, new item visible at correct position.
  - [ ] On error: form stays open, error shown inline, all entered data preserved.

### Edit item

- [ ] Opening an item navigates to `/inventory/items/[id]` and pre-populates all fields correctly.
- [ ] **Blast-radius guard**: if the item has existing transactions, fields that would corrupt history (type, valuation method, tracking type) are disabled with a clear tooltip explaining why.
- [ ] Saving with no changes is harmless (no spurious API call).
- [ ] On success: detail page reflects the update immediately; list view also reflects it on next visit.

### Draft / activate / deactivate lifecycle

- [ ] A **draft** item is not available in POS/Sales/Purchase item pickers.
- [ ] Activating a draft item makes it available in all pickers.
- [ ] **Deactivating** an item with existing stock shows a confirmation: "This item still has stock — deactivate anyway?" (not a silent delete).
- [ ] A deactivated item no longer appears in pickers for new transactions but is still visible in historical documents and inventory reports.

### Delete item

- [ ] Attempting to delete an item that has any stock ledger entries is blocked ("Item has transaction history — deactivate instead").
- [ ] Deleting a MatrixParent that still has live variants is blocked until variants are removed.
- [ ] Deleting an item with no history succeeds after a confirmation dialog; the item disappears from the list.

### Image upload / delete

- [ ] Uploading an image (`POST /:id/image`): progress shown; image appears on item detail after upload.
- [ ] Uploading an oversized or wrong-format file shows a user-friendly error, not an unhandled crash.
- [ ] Deleting the image (`DELETE /:id/image`): confirmation prompt; image removed from display.

### On-hand display

- [ ] On-hand shown on the item detail equals the sum of on-hand quantities across all locations (cross-reference with `06-stock-levels.md`).
- [ ] Items with zero stock show "0" clearly, not blank.
- [ ] Multi-location breakdown is visible per location; totals sum correctly.

### Bulk import (Mira / template)

- [ ] Import dialog opens from the toolbar; file-type validation rejects non-XLSX/CSV before upload.
- [ ] After a successful import, the list refreshes and newly imported items are visible.
- [ ] A failed import (duplicate SKU, bad data) shows per-row errors, not a silent swallow; previously imported rows within the same batch are either all committed or none (no partial import).

## 2. Domain invariants

> Cross-cutting invariants are defined in [`README.md`](README.md). The following are specific to the Items / Catalog submodule.

- [ ] **SKU uniqueness per tenant:** no two active items share the same SKU. The server rejects duplicates; the client surfaces the rejection clearly.
- [ ] **Type hierarchy:** a MatrixVariant can only exist as a child of a MatrixParent. A Flat item has no variants. A MatrixParent has no stock of its own — stock is held by its variants.
- [ ] **Valuation method ↔ tracking type consistency:** FIFO and WAC are valid for any tracking type; "specific identification" is only valid for serial-tracked items. An invalid combination must be rejected server-side.
- [ ] **Draft items are non-transactional:** a draft item cannot appear in a sales order, purchase order, or POS transaction line. Verify the item picker in those modules excludes drafts.
- [ ] **On-hand = Σ ledger per location:** on-hand shown on the item card equals the sum of `stock_ledger_entries.quantity` for that item across all locations (mirrors the cross-cutting ledger-integrity invariant but verify here too).
- [ ] **Blast-radius guard is server-enforced:** even if a client bypasses the UI, a PATCH request that tries to change `type`, `valuationMethod`, or `trackingType` on an item with ledger rows must be rejected with a 409 or 422.
- [ ] **No orphan variants:** deleting a MatrixParent cascades correctly (blocked or variants deleted first) — no MatrixVariant rows can exist without a valid parent.

## 3. Edge cases & defensive UX — "the dumbest thing a storekeeper could do here"

- [ ] **Duplicate SKU on import:** storekeeper pastes a spreadsheet with the same SKU twice — row-level error shown, no partial corruption.
- [ ] **Very long name (200+ chars):** saves correctly; truncated in list view with tooltip showing full name; does not break table layout.
- [ ] **Negative base price:** rejected client-side and server-side with a clear message.
- [ ] **Zero base price:** allowed (some items are free); confirm it does not break valuation math downstream.
- [ ] **Switching item type on an existing item with stock:** blast-radius guard blocks it; UI shows a clear explanation, not just a generic 500 error.
- [ ] **Rapid double-click on Save:** only one create request fires; button disabled after first click.
- [ ] **Stale item:** storekeeper opens an item in two tabs, edits it in one, then saves in the other — last-write-wins or optimistic-lock conflict surfaced clearly, not silently overwritten.
- [ ] **Deleting an item another session just used in a transaction:** API returns a clear conflict error; UI surfaces it without crashing.
- [ ] **RTL rendering:** Arabic item names render right-to-left in the list and on the detail page; SKU and numeric fields remain LTR; `dir="auto"` on alt-name fields.
- [ ] **Large catalog (1000+ items):** list loads without hang; search still feels responsive; pagination is stable.
- [ ] **Image upload on slow connection:** loading indicator shown; cancel is possible; no double-upload on retry.

## 4. Cross-module / integration

- [ ] Items created here appear immediately in the item picker in Sales Orders, Purchase Orders, and POS.
- [ ] Deactivated items no longer appear in those pickers for new transactions.
- [ ] Draft items are excluded from all transaction pickers.
- [ ] The on-hand quantity shown on the item detail matches the quantity shown in the Stock Levels screen (06) for the same item.
- [ ] Editing an item's base price does NOT retroactively change the cost of existing stock ledger entries (WAC is locked at receipt time).
- [ ] Category assignment here flows through to category-level reports in valuation/COGS reports.
- [ ] Account mappings inherited from the category are used when this item's movements auto-post to the GL (verify one movement's journal entry uses the correct inventory control account).

## 5. Known gaps (from recon — verify or track)

- Blast-radius guard logic lives in `blast-radius.guard-helper.ts` — confirm it is wired up as a NestJS guard on all mutation endpoints, not just called ad-hoc in the service (MEDIUM).
- Bulk import error reporting: per-row error detail granularity is unknown — verify errors are row-specific, not just "import failed" (MEDIUM).
- Image storage bucket (`import-files` or similar) — confirm the correct Supabase bucket is used and public/private access policy is intentional (MEDIUM).
- MatrixParent on-hand display: confirm the UI explicitly shows "stock held by variants" and does not show a misleading "0" as if the parent is an independent item (LOW).
- Export / CSV of the item catalog: not confirmed to exist — if missing, track as LOW gap.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
