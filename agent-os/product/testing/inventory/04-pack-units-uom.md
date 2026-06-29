# Inventory — Pack Units / UOM Testing Checklist

> Persona: **Storekeeper / inventory manager.** You buy goods in cartons of 12 and sell them by the piece. You need the system to convert between carton and piece automatically, and you never want to see stock in "cartons" when the warehouse runs on pieces. Ask at every screen: **"what's the dumbest thing a storekeeper could do here?"**

- **Route(s):** Within item detail (`/inventory/items/[id]`) — `pack-units-section.tsx`
- **Feature dir:** `apps/web/src/features/inventory/` (pack-units-section within item detail)
- **API:** `apps/api/src/inventory/items/items.controller.ts` — `GET /:id/pack-units`, `POST /:id/pack-units`, `PATCH /:id/pack-units/:packUnitId`, `DELETE /:id/pack-units/:packUnitId`; backend resolver: `resolvePackUnit` (shared across POS, Sales, Purchase, Stock); service: `ItemPackUnitsService`
- **Depends on:** 01 Items (pack units are a property of an item; the item must exist first).

> **Known risk:** pack unit conversions are a recurring source of stock discrepancies. A wrong conversion factor silently inflates or deflates on-hand quantities across every module. Treat every invariant in section 2 as CRITICAL.

## 0. Preconditions

- [ ] Dataset note: the Asala test tenant currently has **0 pack units defined**. Begin this checklist by adding at least one pack unit to an existing item before testing the remaining cases.
- [ ] Choose a test item with known on-hand stock (e.g., 24 units) so you can verify that a movement entered in a pack unit (e.g., "2 cartons of 12") correctly records 24 base units in the ledger.
- [ ] Logged in as a user with `inventory:write` permission; confirm a read-only user cannot add or modify pack units (server rejects, not just UI hidden).

## 1. Functional — actions & states

### Pack units list on item detail

- [ ] **Pack units section loads** on the item detail page showing all pack units for the item, with the conversion factor and unit name visible for each.
  - [ ] Loading state: skeleton or spinner shown; section not blank mid-load.
  - [ ] Error state: API failure shows a human-readable message.
  - [ ] Empty state (item has no pack units): clear prompt — "No pack units defined. Add one to sell or receive in cases, cartons, etc."

### Add pack unit

- [ ] Clicking "Add pack unit" opens the form / inline row.
  - [ ] **Unit name:** free text (e.g., "Carton", "Box", "Dozen"); required; bilingual alt-name optional (`dir="auto"` on alt field).
  - [ ] **Conversion factor:** number of base units per pack (e.g., 12 for a carton of 12 pieces); required; must be > 0; zero or negative rejected client-side and server-side.
  - [ ] **Conversion factor precision:** fractional factors allowed (e.g., 0.5 for a half-unit); verify the stored value is not rounded or truncated.
  - [ ] Duplicate unit name on the same item rejected with a clear message.
  - [ ] Submit button disabled while save is in flight (no double-submit).
  - [ ] On success: new pack unit appears in the list.
  - [ ] On error: form stays open, error shown inline, entered data preserved.

### Edit pack unit

- [ ] Opening an existing pack unit pre-populates name and conversion factor.
- [ ] **Editing the conversion factor on an item with existing stock:** UI warns that changing the conversion factor will affect how future movements are interpreted; past ledger entries (already stored in base units) are not altered — confirm this is true.
- [ ] Saving with no changes is harmless.

### Delete pack unit

- [ ] Deleting a pack unit after a confirmation prompt removes it from the list.
- [ ] **Deleting a pack unit that is referenced by open documents** (open sales orders, purchase orders, or transfer lines that use that pack unit): behavior must be safe — either blocked with a clear message, or the open lines are converted back to base unit. Silent data corruption is not acceptable.
- [ ] **Base unit cannot be deleted:** the item's base unit (defined on the item itself, not in `item_pack_units`) is the foundation for all conversions; confirm there is no delete path for it.

### `resolvePackUnit` — shared resolver

- [ ] In every module that uses pack units (POS line items, Sales Order lines, Purchase Order lines, Stock Adjustment, Transfer), selecting a pack unit from the unit picker:
  - [ ] Shows the pack unit name (not the base unit name).
  - [ ] Accepts quantity in pack units (e.g., "2 cartons").
  - [ ] On save, the ledger records the correct base-unit quantity (2 × 12 = 24 pieces), NOT 2.
  - [ ] On-hand display after the movement shows the correct base-unit total (e.g., if on-hand was 0 and you received 2 cartons of 12, on-hand is now 24 pieces — not 2).

## 2. Domain invariants

> Cross-cutting invariants are defined in [`README.md`](README.md). The following are specific to Pack Units / UOM and are **CRITICAL** — errors here silently corrupt stock quantities across the entire product.

- [ ] **On-hand is always stored and displayed in base units:** no matter what pack unit was used to enter a movement, the `stock_ledger_entries.quantity` and the materialized on-hand value are always in base units. Never stored in pack units.
- [ ] **Conversion is applied at the point of movement entry:** `resolvePackUnit(packUnitId, quantity)` returns `quantity × conversionFactor` in base units. This resolved value is what is written to the ledger. Verify by reading the ledger entry directly after a pack-unit movement.
- [ ] **Conversion factor > 0 is enforced at the database level (or at minimum API level):** a zero or negative conversion factor must never reach the database; if it did, it would cause division-by-zero or negative-stock bugs.
- [ ] **No duplicate pack unit names per item:** two pack units on the same item cannot have the same name (the server enforces this; the client surfaces the rejection clearly).
- [ ] **Pack unit deletion does not corrupt existing ledger entries:** ledger entries already written with a base-unit quantity are not affected by the deletion of the pack unit that was used to enter them.
- [ ] **Pack unit changes do not retroactively alter the ledger:** editing a conversion factor from 12 to 24 must not change any existing ledger entry. Only future movements use the new factor.
- [ ] **All modules use `resolvePackUnit` consistently:** no module should implement its own ad-hoc unit conversion. Verify the shared resolver is called by checking that on-hand balances agree across POS, Sales, Purchase, and the stock screen after pack-unit movements.
- [ ] **Multi-location totals remain in base units:** if a transfer is entered in pack units (e.g., move 1 carton from Warehouse A to Warehouse B), the source location decreases by 12 base units and the destination increases by 12 base units — not 1.

## 3. Edge cases & defensive UX — "the dumbest thing a storekeeper could do here"

- [ ] **Conversion factor = 0:** storekeeper types 0 in the factor field — rejected client-side immediately with "Conversion factor must be greater than 0", not after a server round-trip.
- [ ] **Conversion factor = 1:** valid (pack unit is the same as base unit); no error, but UI might warn "A factor of 1 is the same as the base unit — are you sure?".
- [ ] **Very large conversion factor (e.g., 10000):** accepted; on-hand arithmetic with large factors must not overflow or lose precision.
- [ ] **Fractional conversion (e.g., 0.5 for a half-piece pack):** accepted; `resolvePackUnit(packUnitId, 3)` returns 1.5 base units — confirm the ledger accepts fractional quantities (or that the item type does not allow fractions and the UI blocks it).
- [ ] **Entering a movement of 0 in pack units:** should be blocked the same way a 0 base-unit movement would be.
- [ ] **Entering a negative quantity in pack units:** blocked the same as a negative base-unit movement (or allowed only for returns if the module supports it — confirm behavior is intentional and consistent).
- [ ] **Pack unit name in Arabic only:** alt-name works; `dir="auto"` on the field; the name renders correctly in the unit picker dropdown in POS and Sales (RTL label in LTR form).
- [ ] **Rapid double-click on Save:** only one create request fires; button disabled after first click.
- [ ] **Stale data:** storekeeper opens the pack unit form in two tabs, edits the factor in one, then saves in the other — last-write-wins is acceptable, but must not silently create two conflicting rows.
- [ ] **Delete a pack unit that is in the current POS session's line item:** the POS line must either convert back to base units or show a clear error — it must not silently show the deleted pack unit name.

## 4. Cross-module / integration

- [ ] **POS:** the unit picker on a POS line item shows the item's pack units alongside the base unit; selecting a pack unit and entering a quantity stores the correct base-unit quantity in the sale line and the stock ledger.
- [ ] **Sales Orders:** same as POS — unit picker on order lines; base-unit quantity stored in the order and ledger.
- [ ] **Purchase Orders / GRN:** receiving in pack units (e.g., 10 cartons) creates a ledger entry for `10 × conversionFactor` base units; the stock level increases by the correct base-unit amount.
- [ ] **Stock Adjustments:** adjustment entered in pack units records the correct base-unit delta in the ledger.
- [ ] **Stock Transfers:** transfer entered in pack units decreases source and increases destination by the correct base-unit amount.
- [ ] **Valuation / costing:** WAC recomputation uses base-unit quantities; a receipt entered in pack units does not distort the average cost calculation (confirm by comparing WAC before and after a pack-unit receipt against the expected arithmetic).
- [ ] **Inventory import (Mira):** if the import template allows specifying a pack unit, the imported quantities must be converted to base units before being written to the ledger.

## 5. Known gaps (from recon — verify or track)

- Asala test tenant has 0 pack units — the full pack-unit code path is **untested on this tenant** as of 2026-06-29. Adding a pack unit and running through section 1 + section 4 is mandatory before sign-off (CRITICAL — must test).
- Fractional base-unit quantity support: unknown if `stock_ledger_entries.quantity` is `numeric` (allows fractions) or `integer` (does not). If integer, fractional conversion factors are dangerous. Confirm the column type (CRITICAL).
- Unit picker in POS: confirm the unit picker dropdown is visually distinct from the quantity field and that it does not default to a random pack unit when the item is first added to a sale line (MEDIUM).
- Pack unit usage in Inventory Import template (DEV-430 xlsx): unknown if the import template columns map to pack units or always base units — confirm alignment with `resolvePackUnit` (MEDIUM).
- Deleting a pack unit that is referenced on open PO/SO lines: behavior not confirmed; if not blocked, this is a data-integrity gap (HIGH).

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
