# Inventory — Stock Levels / On-Hand Testing Checklist

> Persona: **storekeeper / inventory manager**. You stare at this screen every morning to know what you have, what is running low, and what is in transit. You expect the numbers to be real — not stale caches, not rounded wrong, not mixed with another branch's stock. Test every item as that person. Verify the *invariant*, not just that the button works.

- **Route(s):** `/inventory/stock`
- **Feature dir:** `apps/web/src/features/inventory/` — `stock-levels-panel.tsx`, `stock-levels-table.tsx`, `stock-levels-toolbar.tsx`, `stock-status-badge.tsx`
- **API:** `stock-levels.controller.ts` (prefix `tenant/stock-levels`) — `GET /` (paginated), `GET /low-stock`, `GET /:itemId`. Core: `StockLevelService` (`upsertInbound`, `updateAverageCost`, `decrementOutbound`, `increment/decrementInTransit`, `getLevelForUpdate`).
- **Depends on:** Items / Catalog (05), Warehouses / Zones / Bins (05), and at least one stock movement (GRN, adjustment, or opening balance) must have been posted.

## 0. Preconditions

- [ ] Dataset loaded with known quantities per item per warehouse; note at least one item that is below reorder level (for low-stock filter test).
- [ ] Logged in as a user with Inventory read permission; separately confirm a user without inventory access cannot reach `/inventory/stock`.
- [ ] Know the tenant functional currency and its decimal precision — never assume a fixed number of decimal places.

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

- [ ] **List / paginated table** — loads all items with on-hand, committed, in-transit, on-order, available, average cost, total value per warehouse.
  - [ ] Pagination is stable (navigating to page 2 and back returns to the same position; no duplicate rows).
  - [ ] Empty state (no items, or all items at zero) is a clear message, not a blank table.
- [ ] **Low-stock filter (`GET /low-stock`)** — returns only items where available quantity ≤ reorder-point configured on the item; no false positives or negatives.
- [ ] **Item drill-down (`GET /:itemId`)** — clicking an item shows per-warehouse breakdown; quantities sum correctly to the item total shown in the list.
- [ ] **Warehouse / location filter** — filtering by warehouse shows only that warehouse's rows; totals update accordingly.
- [ ] **Search by item name / SKU / barcode** — returns correct matches; partial match works; Arabic name search works.
- [ ] **Export / print** (if present) — exported data matches what is on screen (correct quantities, costs, currency, precision).
- [ ] Refresh / polling (if present) — stale data is not shown after a movement is posted in another tab.

## 2. Domain invariants

> The README lists cross-cutting invariants. The ones below are specific to this submodule.

- [ ] **Materialized snapshot agrees with ledger:** for any item/warehouse, `on_hand` in `materialized_stock_levels` equals `Σ quantity` in `stock_ledger_entries` for that item/warehouse. Spot-check at least three items after a GRN and after a sale.
- [ ] **available = on_hand − committed** (minus any reserved quantity if the setting is on). Displayed available must match this formula to currency/quantity precision.
- [ ] **total_value = on_hand × average_cost** to the tenant currency precision (no rounding leak). Check for items with fractional average costs.
- [ ] **Multi-location quantities sum to item total:** wherever the UI shows an item-level on-hand (item list, item detail header, stock screen item total), it must equal the sum of that item's per-warehouse rows on this screen.
- [ ] **average_cost never goes negative:** issuing stock at WAC cannot produce a negative average cost (guard exists in `StockLevelService`).
- [ ] **No negative on-hand unless explicitly permitted:** if the tenant "allow negative stock" setting is OFF, no row should show negative `on_hand`. If it is ON, negative rows must be visually distinguished (e.g. `stock-status-badge.tsx` variant).
- [ ] **Currency display uses tenant precision:** cost and value columns display in the tenant functional currency at the currency's configured decimal precision — never hardcoded 2dp or 3dp.

## 3. Edge cases & defensive UX — "the dumbest thing a storekeeper could do here"

- [ ] Open the stock levels screen with zero items in the catalog — empty state is friendly, not a spinner or 500.
- [ ] An item exists in the catalog but has never had a movement — its stock level row shows zero, not "missing row" / crash.
- [ ] A warehouse is deactivated mid-session — on the next load (or refresh), its rows are either hidden or clearly marked inactive; totals recompute.
- [ ] Rapidly refresh the page or open in two tabs simultaneously — no duplicate rows, no stale snapshot visible.
- [ ] Filter by warehouse, then change the warehouse mid-request (rapid picker change) — no race condition leaves the table in a mixed state.
- [ ] Item with a very large on-hand quantity (e.g. 1,000,000 units at 3dp cost) — total value renders without truncation or scientific notation.
- [ ] Item with average cost that is a repeating decimal (e.g. 1/3 of a KWD) — stored and displayed to currency precision without silent rounding that violates `total_value = on_hand × avg_cost`.
- [ ] Low-stock badge appears/disappears correctly as quantities change without a full page reload (if reactive).
- [ ] Searching in Arabic returns the same item found by its English name.
- [ ] Tenant with a single warehouse vs. tenant with many warehouses — the per-warehouse breakdown is the same component; test both layouts.
- [ ] Permission escalation: a read-only user cannot trigger any mutation from this screen even if they craft a direct API call.

## 4. Cross-module / integration

- [ ] **Ledger consistency:** after posting a GRN (Purchase → Receiving), the on-hand on this screen increases by the received quantity; after posting a sale, it decreases by the sold quantity. No delay or manual refresh required beyond normal query invalidation.
- [ ] **committed quantity:** after creating a sales order that reserves stock, the committed column increases and available decreases — before the goods are shipped.
- [ ] **in_transit quantity:** after posting a stock transfer out, the source warehouse shows the quantity in `in_transit` (not yet reduced from on-hand, not yet added to destination); after transfer receipt, in-transit clears and destination on-hand increases.
- [ ] **Inventory valuation report agrees:** Σ total_value across all stock levels on this screen must equal the Inventory Control GL account balance visible in the Inventory Valuation report (`/reports/inventory-valuation`).
- [ ] **Reorder alert / low-stock:** if a low-stock notification or dashboard widget references this data, its count matches the `GET /low-stock` endpoint result.
- [ ] Drill-down link from an item row navigates to the correct item detail screen and back-navigation returns to the correct page/filter state.

## 5. Known gaps (from recon — verify or track)

- **No real-time push / SSE on stock changes** — if stock changes in another session (sale, GRN), the screen does not auto-update without a manual refresh. MEDIUM gap for a busy storekeeper; track as enhancement (SSE already used for other flows).
- **Committed quantity source not visible** — the screen shows `committed` but does not link to the open sales/transfer orders causing the commitment. A drill-down would help. MEDIUM UX gap.
- **In-transit drill-down** — similarly, `in_transit` shows a number but no link to the transfer in flight. MEDIUM.
- **Per-zone / per-bin breakdown** — `materialized_stock_levels` is per item × warehouse; if bins are in use, the storekeeper cannot see which bin holds what from this screen. LOW for MVP, grows as bin usage increases.
- **No bulk reorder trigger from this screen** — low-stock filter is read-only; storekeeper cannot create purchase orders from here directly. LOW for now (handled via Purchase module).
- **Export on low-stock filter** — whether CSV export respects the active low-stock filter is unverified. LOW.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
