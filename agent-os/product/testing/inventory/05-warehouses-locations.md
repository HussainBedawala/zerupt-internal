# Inventory — Warehouses / Zones / Bins Testing Checklist

> Persona: **storekeeper / inventory manager**. You manage the physical layout of the warehouse. You know that bins have codes, warehouses belong to branches, and moving stock to the wrong place (or a deleted place) causes chaos at receiving and picking. Test every item as that person. Verify the *invariant*, not just that the button works.

- **Route(s):** `/settings/locations`
- **Feature dir:** `apps/web/src/features/locations/` — `locations-panel.tsx`, `branches-table.tsx`, `branch-dialog.tsx`, `warehouse-dialog.tsx`, `warehouses-section.tsx`, `zone-dialog.tsx`, `zones-section.tsx`, `bin-dialog.tsx`, `bins-section.tsx`
- **API:** `warehouses.controller.ts` (prefix `tenant/warehouses` — CRUD); `zones.controller.ts` (prefix `tenant/zones` — CRUD); `bins.controller.ts` (prefix `tenant/bins` — CRUD). Branches managed under `org-structure`.
- **Depends on:** Branch must exist before warehouses can be created; zones require a warehouse; bins require a zone.

## 0. Preconditions

- [ ] Dataset loaded; note the branch count, warehouse count, and whether there is exactly one default warehouse per branch.
- [ ] Logged in as a user with Inventory / Settings write permission; separately confirm a read-only or non-inventory user cannot create or edit warehouses.
- [ ] Note which warehouses currently carry on-hand stock (needed for guard tests in section 3).

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

- [ ] **Create warehouse** — warehouse appears in the list under the correct branch; type (store / warehouse / transit) persists; `isDefault` flag toggleable.
  - [ ] Loading state shown while saving (button debounced — no double-submit).
  - [ ] Error (e.g. duplicate name on same branch) shown user-friendly without losing form data.
  - [ ] Empty state (no warehouses on a new branch) shows a clear call-to-action, not a blank panel.
- [ ] **Edit warehouse** — name, type, and active state update correctly; list refreshes.
- [ ] **Deactivate warehouse** — warehouse disappears from movement pickers (receiving, transfer, adjustment) immediately; historical movements still reference the warehouse name in read-only views.
- [ ] **Reactivate warehouse** — warehouse re-appears in movement pickers; existing stock levels still present.
- [ ] **Create zone** — zone appears under the correct warehouse with correct `sortOrder`.
  - [ ] Reordering zones (if drag-and-drop exists) persists `sortOrder` after page refresh.
- [ ] **Edit zone** — name/sort update; correct warehouse association retained.
- [ ] **Delete zone (empty)** — succeeds; zone removed from list and from bin pickers.
- [ ] **Create bin** — bin appears under the correct zone and warehouse; `code` is required.
  - [ ] Bin code is unique within the warehouse (create a duplicate code in the same warehouse — must be rejected server-side).
  - [ ] Same bin code in a *different* warehouse is allowed.
- [ ] **Edit bin** — code, zone, active state update correctly.
- [ ] **Deactivate bin** — bin disappears from receiving/transfer/count bin pickers; stock level for that bin is preserved.
- [ ] Filters / search (if present) return correct subsets by branch, warehouse type, active status; reset restores full list.
- [ ] Pagination (if present) is stable across pages.

## 2. Domain invariants

> The README lists cross-cutting invariants. The ones below are specific to this submodule.

- [ ] **Branch > Warehouse > Zone > Bin hierarchy is enforced:** a zone cannot reference a warehouse that belongs to a different branch; a bin cannot reference a zone/warehouse mismatch (zone.warehouseId = bin.warehouseId).
- [ ] **Exactly one default warehouse per branch:** setting a second warehouse as default on the same branch must flip the previous default off (not error, not leave two defaults). Verify in DB if needed.
- [ ] **No default warehouse deletion:** deleting (or deactivating) the sole default warehouse is blocked with a clear user message; a replacement default must be set first.
- [ ] **Delete guard with stock:** attempting to delete a warehouse, zone, or bin that has any non-zero `stock_ledger_entries` (or non-zero materialized on-hand) is blocked server-side with an explanatory message — never silently succeeds.
- [ ] **Deactivation ≠ deletion:** deactivated locations preserve all historical ledger rows; they simply stop appearing as choices in movement pickers.
- [ ] **Tenant isolation:** no warehouse, zone, or bin from another tenant is visible in any list or picker.

## 3. Edge cases & defensive UX — "the dumbest thing a storekeeper could do here"

- [ ] Create a warehouse with no name — blocked client-side and server-side.
- [ ] Try to delete the only warehouse on a branch — blocked (no default to fall back on; stock may exist).
- [ ] Try to delete a zone that still has bins assigned — blocked server-side.
- [ ] Try to delete a bin that has been used in a ledger entry — blocked server-side with a clear message (not a 500).
- [ ] Set `isDefault = true` on two warehouses in the same branch simultaneously (rapid double-click or two browser tabs) — only one ends up as default; no corrupt state.
- [ ] Enter a bin code with only whitespace — trimmed and rejected, not saved as a blank code.
- [ ] Create 100+ bins in a single zone — list loads and paginates correctly; picker performance acceptable.
- [ ] Switch locale to Arabic mid-flow — all labels, placeholders, and enum values (store / warehouse / transit) render in Arabic; the bin-code field (which is a code, not a label) remains LTR.
- [ ] Warehouse/zone/bin names in Arabic — stored and displayed correctly; `dir="auto"` on name fields.
- [ ] Stale state: open the edit dialog, another session deactivates the warehouse, submit — server returns a meaningful error, not a silent success.
- [ ] Client + server validation both enforce `isActive`, required fields, and hierarchy constraints — disabling JS or calling the API directly with bad data is rejected.

## 4. Cross-module / integration

- [ ] A newly created warehouse appears immediately in:
  - [ ] Stock-transfer "from / to" location pickers (`/inventory/transfers`).
  - [ ] Adjustment location picker (`/inventory/adjustments`).
  - [ ] Stock-count location picker (`/inventory/stock-counts`).
  - [ ] Receiving (GRN) location picker in Purchase.
- [ ] A deactivated warehouse is absent from all the above pickers without a page reload.
- [ ] Bin codes used in ledger entries are displayed correctly in ledger drill-downs (not "Unknown bin").
- [ ] The tenant's branch structure shown here matches the branch list in Settings > Organization, if such a view exists.

## 5. Known gaps (from recon — verify or track)

- **Transit warehouse type** — `type = transit` enum value exists in schema but it is unclear whether the UI exposes it or if any movement flow uses it explicitly. If not exposed, track as MEDIUM gap (in-transit stock needs a home).
- **Zone sort-order UI** — `sortOrder` column exists in schema; whether drag-and-drop or manual ordering is implemented in `zones-section.tsx` is unverified. If absent, LOW gap.
- **Bin picker search** — for warehouses with hundreds of bins, a searchable bin picker is needed; free-text or paginated dropdown on movement forms may be unusable at scale. MEDIUM.
- **Bulk deactivate** — no bulk deactivate or bulk-move-bins-to-zone action observed. LOW for now; becomes MEDIUM as tenant scale grows.
- **No dedicated branch-level warehouse capacity or utilization view** — not critical for MVP, LOW.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
