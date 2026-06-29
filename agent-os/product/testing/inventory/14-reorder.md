# Inventory — Reorder / Min-Max Testing Checklist

> Persona: **storekeeper / inventory manager** — someone who checks the shelf, sees a product running low, and needs the system to tell them what to order and how much. They are not configuring accounting; they want one screen that says "order this, from this supplier, this many." At every step ask: **"what's the dumbest thing a storekeeper could do here?"**

- **Route(s):** `/inventory/reorder`
- **Feature dir:** `apps/web/src/features/inventory/` — `reorder-suggestions-panel.tsx`, `reorder-kpi-strip.tsx`, `reorder-status-badge.tsx`, `reorder-toolbar.tsx`
- **API:** `GET /tenant/inventory/reorder/suggestions`, `GET /tenant/inventory/reorder/kpis`, `PUT /tenant/inventory/reorder/config`, `GET /tenant/inventory/reorder/config/:itemId`, `POST /tenant/inventory/reorder/generate-po`
- **Depends on:** `06-stock-levels.md` (available qty must be accurate), `01-items-catalog.md` (items must exist), `05-warehouses-locations.md` (warehouse filter context)

---

## 0. Preconditions

- [ ] At least three items configured with reorder parameters in `item_reorder_config`: one below its reorderLevel (should appear in suggestions), one above (should NOT appear), one exactly at reorderLevel (boundary — define whether inclusive or exclusive and test it).
- [ ] At least one item has a `preferredSupplierId` set; at least one does NOT (to test the no-preferred-supplier path).
- [ ] Stock levels are current (run after `06-stock-levels.md` passes).
- [ ] Logged in as a user with `inventory:reorder:read` and `inventory:reorder:write` permissions. Separately confirm a user WITHOUT those permissions cannot reach the route or call the API (403, not a blank).
- [ ] A draft Purchase Order does NOT already exist for the test item (or note its existence to confirm generate-PO creates a new one, not a duplicate).

---

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

- [ ] **Suggestions list loads** — items below reorderLevel appear; items above do NOT appear; the list matches the KPI strip count.
  - [ ] Loading spinner shown while fetching; no frozen UI.
  - [ ] Error state on API failure shows a user-friendly message; does not show a raw error or blank screen.
  - [ ] Empty state (no items below reorderLevel) shows a clear "all stocked up" message — not a broken table.

- [ ] **KPI strip** — "Items to reorder" count matches the number of rows in the suggestions list. If the list is filtered (by warehouse), the KPI updates to reflect the filtered view.

- [ ] **Reorder status badge** — each item row shows the correct badge (e.g. "Low Stock", "Out of Stock") consistent with its available qty vs. reorderLevel. Badge updates without full-page reload after a config change.

- [ ] **Configure reorder params (PUT /config)** — storekeeper can set reorderLevel, reorderQty, maxLevel, safetyStock, leadTimeDays, preferredSupplierId for an item.
  - [ ] Loading state shown during save; button debounced (no double-submit).
  - [ ] Success feedback shown (toast or inline); item list/KPI refreshes to reflect new config.
  - [ ] Error state on save failure is user-friendly; form data is NOT lost.
  - [ ] Validation: reorderLevel ≥ 0, maxLevel ≥ reorderLevel, reorderQty > 0, leadTimeDays ≥ 0 — all enforced client-side AND server-side. If any rule is violated, a clear, field-level error is shown.

- [ ] **Read config per item (GET /config/:itemId)** — pre-fills the config form correctly; stale data is not shown after an edit.

- [ ] **Generate PO (POST /generate-po)** — creates a draft Purchase Order to the `preferredSupplier` for the suggested quantity; navigating to the Purchase module shows the new draft.
  - [ ] Loading state shown; button debounced; no double-submit creates two POs.
  - [ ] Success: user is shown a link or confirmation referencing the new PO number.
  - [ ] Error: if no preferredSupplierId is set, the user is warned BEFORE attempting to generate — not after a failed API call.
  - [ ] Destructive note: generating a PO is irreversible in the sense that a draft PO now exists. Confirm dialog (or at minimum clear success message) so the storekeeper knows what happened.

- [ ] **Toolbar filters** — filtering by warehouse narrows suggestions to stock levels in that warehouse only; reorderLevel/reorderQty config is per-item-per-warehouse (if applicable) or global (confirm which and test accordingly).

- [ ] **Pagination (if present)** — correct and stable; page 2 does not repeat page 1 items.

---

## 2. Inventory / reorder invariants

> These must hold for any dataset. README covers ledger/GL/UOM invariants; the ones below are specific to reorder.

- [ ] **Suggestion threshold.** An item appears in suggestions if and only if its available quantity (onHand − reserved/committed, per warehouse if filtered) is ≤ reorderLevel. Items above reorderLevel must NEVER appear.

- [ ] **Suggested order quantity.** The qty proposed by the suggestion equals `max(reorderQty, maxLevel − available)` respecting safetyStock as a floor — or whatever the spec defines. Verify the formula for at least two items manually.

- [ ] **maxLevel constraint.** Suggested qty never causes projected onHand (available + suggested) to exceed maxLevel. If available + reorderQty > maxLevel, the suggestion should be capped at `maxLevel − available`.

- [ ] **safetyStock floor.** If available is below safetyStock (a more urgent sub-threshold), the suggestion is at least enough to bring stock back to safetyStock + reorderQty. Confirm this is not silently ignored.

- [ ] **Config validation server-side.** PUT /config must reject: reorderLevel < 0, maxLevel < reorderLevel, reorderQty ≤ 0, leadTimeDays < 0. A crafted API call with bad values must get a 422 with a clear error — not a 500 or silent acceptance.

- [ ] **KPI matches suggestions.** The count shown in the KPI strip must equal the number of rows in the unfiltered suggestions list. Mismatch at any moment is a bug.

- [ ] **No ghost suggestions.** After an item's stock is replenished (GRN posted), it must disappear from suggestions on next load (no stale cache showing it still needing reorder).

- [ ] **No suggestion without config.** An item with no `item_reorder_config` row must never appear in suggestions. The absence of config = no threshold = no alert.

- [ ] **preferredSupplierId on generate-PO.** The generated PO is addressed to the item's preferredSupplier. If multiple items are batched into one PO, only items sharing the same preferredSupplier go on the same PO; items with different suppliers get separate POs (or system prevents batching — verify the behavior and confirm it is consistent).

- [ ] **Currency & precision.** Any cost or value shown in the reorder screen (e.g. estimated reorder value = suggestedQty × lastCost) uses the tenant functional currency at the tenant's precision (KWD = 3dp) — never hardcoded.

---

## 3. Edge cases & defensive UX — "the dumbest thing a storekeeper could do"

- [ ] **Set reorderLevel > maxLevel.** Form must reject this with a clear error ("Reorder level cannot exceed max level") both client-side and server-side.
- [ ] **Set all thresholds to zero.** reorderLevel = 0, reorderQty = 0, maxLevel = 0, safetyStock = 0 — system should either reject (reorderQty must be > 0) or handle gracefully without dividing by zero or producing nonsense suggestions.
- [ ] **Generate PO with no preferred supplier.** Warn before attempting; do not send a blank supplier PO to the Purchase module.
- [ ] **Generate PO twice rapidly.** Double-click the button in quick succession — second call is rejected or idempotent; only one draft PO is created.
- [ ] **Generate PO for an item already on a pending PO.** System should warn that an open PO already exists for this item (or at minimum note it), rather than silently creating a duplicate.
- [ ] **Item deleted / deactivated mid-session.** If another session deletes an item while the storekeeper is looking at it in suggestions, clicking "generate PO" or "configure" should return a user-friendly error, not a crash.
- [ ] **Very large reorderQty.** Entering reorderQty = 999,999 — system accepts it without overflow; the generated PO line shows the correct quantity.
- [ ] **leadTimeDays = 0.** Allowed (items with immediate delivery); suggestions still appear correctly; no division-by-zero in any lead-time calculation.
- [ ] **RTL rendering.** In Arabic locale, the suggestions table renders correctly; numeric columns are left-to-right numerals; status badges translate; config form labels are in Arabic; no truncation of bilingual item names.
- [ ] **Item with no secondary-language name.** Secondary name column is blank — not "undefined", not a crash.
- [ ] **Stale filter state.** Navigating away and back to `/inventory/reorder` resets or correctly restores filter state — no ghost filters showing data that does not match the visible filter chips.

---

## 4. Cross-module / integration

- [ ] **Stock levels drive suggestions.** After posting a GRN (Purchase module) that brings an item above its reorderLevel, that item disappears from the reorder suggestions list on next load.
- [ ] **Generate PO → Purchase module.** The created draft PO appears in `/purchase/orders` with the correct supplier, item, quantity, and currency. The PO line unit matches the item's purchase UOM (base unit or pack unit per `resolvePackUnit`).
- [ ] **UOM / pack unit.** If an item is ordered in a pack unit (e.g. "case of 12"), the suggested quantity is expressed in pack units on the PO; the underlying base-unit quantity is correct.
- [ ] **Supplier link.** The `preferredSupplierId` resolves to a real supplier in the Suppliers module; the generated PO supplier name is correct.
- [ ] **Permission boundary.** A storekeeper with `inventory:reorder:read` but NOT `inventory:reorder:write` can view suggestions and KPIs but cannot save config or generate a PO (buttons are either hidden or disabled with a clear "permission required" tooltip — not a silent 403 with no feedback).

---

## 5. Known gaps (from recon — verify or track)

- **AI EOQ suggestions noted as "Weeks 3-6" future.** The current engine uses static min-max config only; there is no AI-driven economic order quantity calculation yet. If the UI hints at AI suggestions that are not yet wired, flag as MEDIUM (misleading UX).
- **No lead-time demand forecasting.** The `leadTimeDays` field is stored and displayed but may not be used in the suggested quantity calculation (demand × lead time). Verify whether it is used; if not, the field is cosmetic — flag as LOW until the feature is built.
- **Batch generate-PO for multiple items.** The spec implies single-item PO generation via `POST /generate-po`. If the UI allows selecting multiple items and generating one PO, verify supplier-grouping logic (different suppliers → separate POs). If not implemented, note as a usability gap (MEDIUM) — storekeepers will want to bulk-order.
- **No reorder history / audit trail.** There is no log of when reorder suggestions were generated or acted upon. A storekeeper cannot see "I generated a PO for this item last Tuesday." Flag as LOW for now; becomes MEDIUM when lead-time tracking matters.
- **Warehouse-level config disambiguation.** `item_reorder_config` has a `warehouseId` field, but it is unclear from the current spec whether suggestions are per-warehouse or per-item-global. If filtering by warehouse changes suggestions incorrectly (shows items from other warehouses), flag as HIGH.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Suggestion threshold verified manually: at least one item at/below reorderLevel appears, one above does not.
- [ ] Suggested quantity formula verified manually for at least two items.
- [ ] Generate PO tested end-to-end: draft PO visible in Purchase module with correct supplier and quantity.
- [ ] Config validation confirmed server-side (direct API call with bad values returns 422, not 500).
- [ ] Report renders correctly in both English (LTR) and Arabic (RTL) locales.
- [ ] Findings logged in `_findings.md`.
