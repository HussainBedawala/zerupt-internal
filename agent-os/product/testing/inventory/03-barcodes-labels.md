# Inventory — Barcodes & Label Printing Testing Checklist

> Persona: **Storekeeper / inventory manager.** You are the person who physically labels the shelves and scans items at the goods-receiving dock. A wrong barcode or a garbled label wastes real time and causes mis-picks. Ask at every screen: **"what's the dumbest thing a storekeeper could do here?"**

- **Route(s):** Within item detail (`/inventory/items/[id]`) — `barcodes-section.tsx`; label print dialog accessible from item detail and item list toolbar — `apps/web/src/features/inventory/labels/` (`label-print-dialog.tsx`, `label-renderer.tsx`, `label-agent-print.ts`, `label-sizes.ts`)
- **Feature dir:** `apps/web/src/features/inventory/` (barcodes-section within item detail); `apps/web/src/features/inventory/labels/`
- **API:** `apps/api/src/inventory/items/items.controller.ts` — `POST /barcodes/generate-missing`, `POST /:id/barcodes/generate`, `POST /:id/barcodes`, `DELETE /:id/barcodes/:barcodeId`, `PATCH /:id/barcodes/:barcodeId/primary`, `GET /barcode/:barcode`; barcode generator: `apps/api/src/inventory/barcode-generator.ts` (EAN-13 prefix 2, atomic sequence reservation; Code128; thermal raster + A4 grid)
- **Depends on:** 01 Items (barcodes are attached to items; items must exist before barcodes can be generated or assigned).

## 0. Preconditions

- [ ] Dataset contains: at least one item with no barcode (to test generation), one item with a manually entered barcode, one item with multiple barcodes (to test primary-flag logic), and one item with stock movements (to test that barcode changes do not corrupt history).
- [ ] Logged in as a user with `inventory:write` permission; confirm a read-only user cannot add or delete barcodes (server rejects, not just UI hidden).
- [ ] A label printer or PDF viewer is available to visually verify rendered labels.

## 1. Functional — actions & states

### Barcode list on item detail

- [ ] **Barcodes section loads** on the item detail page showing all barcodes for the item, with the primary barcode clearly marked.
  - [ ] Loading state: skeleton or spinner shown; section not blank mid-load.
  - [ ] Error state: API failure shows a human-readable message.
  - [ ] Empty state (item has no barcodes): clear prompt to generate or add one manually.

### Generate barcode (single item)

- [ ] Clicking "Generate barcode" (`POST /:id/barcodes/generate`) generates a valid EAN-13 barcode for the item.
  - [ ] The generated barcode has the correct EAN-13 check digit (verify manually or via a barcode scanner app).
  - [ ] The generated barcode is globally unique — no other item in the tenant carries the same code.
  - [ ] Sequence reservation is atomic: two simultaneous generate requests for different items should not produce the same barcode (test with parallel tabs if possible).
  - [ ] Loading state shown during generation; button debounced so a double-click does not generate two barcodes.
  - [ ] On success: new barcode appears in the list; if this is the first barcode for the item it is automatically set as primary.

### Generate missing barcodes (bulk)

- [ ] `POST /barcodes/generate-missing` assigns a barcode to every item in the tenant that currently has none.
  - [ ] Confirmation prompt shown before bulk operation: "X items have no barcode. Generate for all?"
  - [ ] Progress indicator shown; operation does not time out silently on large catalogs.
  - [ ] After completion, a summary shows how many barcodes were generated vs skipped.
  - [ ] No existing barcodes are overwritten.
  - [ ] Items that already had barcodes are not touched.

### Add barcode manually

- [ ] `POST /:id/barcodes` accepts a manually entered barcode string.
  - [ ] Duplicate barcode (same code already on another item) is rejected server-side with a clear message; the UI surfaces it without crashing.
  - [ ] Empty barcode string rejected client-side and server-side.
  - [ ] Very long barcode strings (beyond standard EAN-13/Code128 limits) rejected with a clear message.
  - [ ] On success: barcode appears in the list.

### Set primary barcode

- [ ] `PATCH /:id/barcodes/:barcodeId/primary` changes the primary flag.
  - [ ] After the PATCH, exactly one barcode for the item is marked primary; the previous primary is demoted automatically (not left orphaned as a second primary).
  - [ ] Loading indicator shown during the PATCH.

### Delete barcode

- [ ] `DELETE /:id/barcodes/:barcodeId` removes the barcode after a confirmation prompt.
  - [ ] Deleting the primary barcode: UI warns "You are deleting the primary barcode. Another will be promoted automatically, or the item will have no primary barcode." — confirm behavior is safe.
  - [ ] Deleting the last barcode on an item: UI warns that the item will be unidentifiable by scan; operation allowed but warned.
  - [ ] Deleted barcode is no longer returned by `GET /barcode/:barcode`.

### Barcode lookup

- [ ] `GET /barcode/:barcode` resolves the barcode to the correct item.
  - [ ] Unknown barcode returns a clear 404 / "Not found" response; UI shows a graceful "Barcode not recognized" state (not a crash).
  - [ ] Barcode belonging to an inactive item: the endpoint still resolves but the UI flags the item as inactive.
  - [ ] Barcode lookup is used correctly by POS / receiving flows (cross-reference those modules).

### Label print dialog

- [ ] Opening the label print dialog from an item shows the item's primary barcode pre-selected.
- [ ] **Label size selector** (`label-sizes.ts`): switching between sizes (thermal / A4 grid) re-renders the preview immediately.
- [ ] **Quantity input**: storekeeper can enter how many label copies to print; zero or negative rejected; very large quantities warned ("Printing 500 labels — confirm?").
- [ ] **Rendered label** (`label-renderer.tsx`) shows: barcode graphic, barcode number in human-readable text, item name, and price in tenant currency with correct precision.
- [ ] **Thermal raster output**: renders correctly for a connected thermal printer (or PDF fallback); label is not blank or garbled.
- [ ] **A4 grid output**: multiple labels tile across the A4 page at correct dimensions; no labels bleed off the page edge.
- [ ] Print button triggers the actual print/download; `label-agent-print.ts` fires without error.
- [ ] Loading state shown while the label is being rendered; not a frozen dialog.

## 2. Domain invariants

> Cross-cutting invariants are defined in [`README.md`](README.md). The following are specific to Barcodes & Labels.

- [ ] **Exactly one primary barcode per item at all times:** after any create, update, or delete operation, querying `item_barcodes` for the item must return exactly one row with `isPrimary = true` (or zero rows if the item has no barcodes at all — not two primaries simultaneously).
- [ ] **Global barcode uniqueness per tenant:** no two items share the same barcode string. The server enforces this with a unique constraint; the client surfaces the error clearly.
- [ ] **EAN-13 check digit validity:** every system-generated EAN-13 barcode passes the standard check digit algorithm. Invalid check digits cause real-world scanner failures.
- [ ] **Atomic sequence reservation:** the EAN-13 prefix-2 sequence counter is incremented atomically; no two concurrent generation calls produce the same sequential number (prevents duplicate barcodes under load).
- [ ] **Barcode lookup resolves to correct item:** `GET /barcode/:barcode` always returns the item that currently holds that barcode. If the barcode was transferred to a different item (not currently supported — confirm), the lookup reflects the latest assignment.
- [ ] **Label content matches item data:** the barcode number on the label matches the barcode in the database; the price on the label matches the item's current base price at tenant currency precision.

## 3. Edge cases & defensive UX — "the dumbest thing a storekeeper could do here"

- [ ] **Scan a barcode that belongs to another tenant:** `GET /barcode/:barcode` must return 404 (not the other tenant's item). Tenant isolation is enforced server-side on this public-facing lookup endpoint.
- [ ] **Print labels for an item with no barcode:** UI prompts to generate a barcode first, not a blank label.
- [ ] **Print 0 labels:** rejected client-side with a clear message ("Quantity must be at least 1").
- [ ] **Generate barcode then immediately delete and regenerate:** the old barcode is fully removed from the unique index before the new one is reserved; no transient uniqueness violation.
- [ ] **Bulk generate-missing on a large catalog (500+ items):** operation does not time out silently; partial success (some generated, some failed) is reported accurately — never reports success for a failed generation.
- [ ] **Manually enter a barcode that is already the primary on the same item:** rejected as a duplicate (same-item duplicate), not silently added as a second copy.
- [ ] **Label with Arabic item name:** the label renderer displays Arabic text correctly (RTL) without character rendering artifacts; mixed LTR (barcode digits) and RTL (name) on the same label are handled.
- [ ] **Thermal printer offline:** print dialog shows a clear error, not a silent failure or frozen dialog.
- [ ] **Very long item name on label:** truncated gracefully on the label — the barcode graphic is not pushed off the label edge.
- [ ] **Rapid double-click on "Generate":** only one barcode generated; button disabled after first click.

## 4. Cross-module / integration

- [ ] Barcodes generated or assigned here are immediately scannable in POS (item lookup by barcode at the sales terminal).
- [ ] Barcodes are usable in the goods-receiving flow (Purchase / GRN) to identify items being received.
- [ ] `GET /barcode/:barcode` is the canonical lookup used by all modules; no module should do its own barcode resolution outside this endpoint.
- [ ] Label price shown is the item's `basePrice` from the Items catalog — if the price is updated on the item, newly printed labels must reflect the new price (old printed labels on shelves are a physical problem, not a software bug — but the software should always show current price).

## 5. Known gaps (from recon — verify or track)

- Code128 barcode support: generator supports Code128 for labels but it is unclear if manually entered Code128 barcodes are validated for format (vs EAN-13) — confirm or track as MEDIUM.
- Barcode reassignment (moving a barcode from one item to another): not confirmed as a supported flow; if a storekeeper needs to re-label items, the process should be explicit — confirm or track as MEDIUM.
- Multi-barcode label print (print labels for a selection of items from the list, not just one): unknown if supported from the items list toolbar — confirm or track as LOW.
- Thermal printer driver integration details: `label-agent-print.ts` behavior on different OS/browser combinations is unknown; track as LOW (verify on target hardware).
- Barcode display in the item list table: unknown if a barcode column or tooltip is shown — confirm or track as LOW.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
