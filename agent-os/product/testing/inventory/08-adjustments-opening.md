# Inventory — Adjustments & Opening Stock Testing Checklist

> Persona: **storekeeper / inventory manager** (Kuwait, functional currency KWD at 3dp). Test every item as that person. Verify the *invariant*, not just that the button works. At every screen ask: **"what's the dumbest thing a storekeeper could do here?"**

- **Routes:** `/inventory/adjustments` (list), `/inventory/adjustments/new`, `/inventory/opening-stock` (redirects to bulk import)
- **Feature dir:** `apps/web/src/features/inventory/` (`adjustment-form-panel.tsx`, `adjustments-list-panel.tsx`, `adjustments-table.tsx`, `adjustment-confirm-dialog.tsx`, `adjustment-item-search.tsx`); opening import in `apps/web/src/features/inventory-import/` (`inventory-stock-preview.tsx`, `inventory-batch-stock-preview.tsx`, `inventory-valuation-preview.tsx`)
- **API:** `stock-adjustments.controller.ts` prefix `tenant/stock-adjustments` — `POST /`, `POST /opening-balance`, `POST /:id/reverse`, `GET /`, `GET /:id`. Service `StockAdjustmentsService`.
- **DB:** `stock_adjustments` (`inventory-adjustments.ts`)
- **Depends on:** 01 Items/Catalog, 05 Warehouses/Locations (items and locations must exist before any adjustment can be created)

---

## 0. Preconditions

- [ ] At least one item and one warehouse/location exist and are active.
- [ ] Logged in as a user whose role includes `inventory:adjustments:write`; separately confirm a user *without* that permission cannot reach `/inventory/adjustments/new` (server-side, not just hidden in the UI).
- [ ] Know the current on-hand quantity and average cost for at least two test items (one with stock, one at zero) before starting — you need a baseline to verify after.
- [ ] Fiscal period is open (or note if testing locked-period rejection path).

---

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

### Adjustments list

- [ ] **List loads** — shows all adjustments for this tenant; columns include adjustment number, date, type (increase/decrease), item, qty, cost, reason, status, and who created it.
  - [ ] Empty state (no adjustments yet) shows a helpful prompt, not a blank/broken screen.
  - [ ] Pagination is correct; navigating pages does not lose filter state.
- [ ] **Filter/search** — filter by date range, type (increase/decrease/opening), item, and reason; reset clears all filters and restores full list.
- [ ] **Drill-down** — clicking a row opens the adjustment detail; back navigation returns to the same page/scroll position.
- [ ] **Export / print** (if present) matches what is on screen for the active filter set.

### Create adjustment (increase / decrease)

- [ ] **Item picker is a searchable picker** — not a free-text field. Search by name and barcode. Selecting returns item name, SKU, current on-hand, current average cost.
  - [ ] Dumbest thing: storekeeper types a random string hoping the system accepts it. It must not.
- [ ] **Location picker** is a searchable picker; only locations belonging to this tenant appear.
- [ ] **Adjustment type** (increase / decrease) changes which fields are required:
  - [ ] Increase: quantity and **cost** (per-unit, in tenant currency, 3dp for KWD) are both required.
  - [ ] Decrease: quantity required; cost field is read-only (uses current WAC).
- [ ] **Reason** field is required; system may offer a dropdown of standard reasons (damaged, found, write-off, etc.) or free text — confirm which; blank reason must be blocked.
- [ ] **Notes** field optional but preserved on save.
- [ ] **Confirm dialog** appears before posting; shows a summary of the change (item, qty delta, cost impact, GL accounts). Storekeeper cannot accidentally post without seeing the summary.
  - [ ] Cancel on the confirm dialog returns to the form with all entered data intact — no data loss.
  - [ ] Confirm button debounced / disabled after first click; double-click does NOT create two adjustments.
- [ ] **Success** — on post: adjustment list refreshes, on-hand for the item/location updates, success toast shown with adjustment number.
- [ ] **Error** — API failure shows a user-friendly message; entered data is NOT cleared.
- [ ] **Loading** — form shows a loading indicator while submitting; inputs are disabled to prevent edits mid-flight.

### Reverse an adjustment

- [ ] **Reverse action** is present on the adjustment detail for posted, non-reversed adjustments. Requires confirmation with a reason.
  - [ ] After reversal: a new mirrored adjustment record is created (`reverses_entry_id` populated), NOT the original deleted or edited.
  - [ ] On-hand returns to pre-adjustment value; ledger has two entries (original + reversal).
  - [ ] Attempting to reverse an already-reversed adjustment is blocked with a clear message.
  - [ ] Dumbest thing: storekeeper clicks reverse twice rapidly. Only one reversal created.

### Opening stock import (`/inventory/opening-stock`)

- [ ] Route redirects to the bulk import flow; no dead-end or 404.
- [ ] Import preview (`inventory-stock-preview.tsx`, `inventory-batch-stock-preview.tsx`) shows item, location, qty, cost per line before committing.
- [ ] **Valuation preview** (`inventory-valuation-preview.tsx`) shows Σ(qty × cost) total before and after; storekeeper can see the impact before confirming.
- [ ] On confirmation, all lines are written as `OPENING_BALANCE` ledger entries; no partial commits (atomic).
- [ ] If any line fails validation (unknown item, zero cost, negative qty), the whole batch is rejected with a clear per-line error report — not silently skipped.
- [ ] Re-importing opening stock for items that already have opening-balance entries: system either blocks duplicates or warns and asks for confirmation (no silent double-post).

---

## 2. Accounting / domain invariants

> Cross-cutting invariants are in `README.md`. Submodule-specific invariants below.

- [ ] **Increase posts balanced JE:** DR Inventory / CR Inventory Gain. Both sides equal `qty × cost` in tenant currency at 3dp.
- [ ] **Decrease posts balanced JE:** DR Inventory Write-Down / CR Inventory. Both sides equal `qty × WAC` at 3dp.
- [ ] **Reversal is a true contra:** the reversal JE flips DR and CR (DR Inventory Gain / CR Inventory for a reversed increase; DR Inventory / CR Inventory Write-Down for a reversed decrease). P&L impact is negated. The original JE is NEVER deleted or modified.
- [ ] **No grossing-up on reversal:** net P&L after reversal = 0; no phantom income/loss remaining on either account.
- [ ] **Opening balance JE:** all opening-stock entries post as `OPENING_BALANCE` ledger entries; the sum of all opening-balance inventory entries equals the inventory control account opening balance.
- [ ] **Recon check — Σ(qty × cost) = inventory control account balance** after all opening entries. This must hold before any post-opening movements.
- [ ] **Negative stock guard:** a decrease that would take on-hand below zero is blocked (or requires the `flexible-negative` tenant setting to be explicitly enabled). It must never silently go negative.
- [ ] **Cost required on increase:** posting an increase without a unit cost is blocked at both client and server — a zero-cost increase would destroy WAC accuracy.
- [ ] **WAC recalculates correctly after increase:** after posting an increase at a given cost, `average_cost = (old_qty × old_wac + new_qty × new_cost) / (old_qty + new_qty)` to 3dp. Verify against the stock level record.
- [ ] **total_value = on_hand × average_cost** to currency precision after every adjustment (no rounding drift).

---

## 3. Edge cases & defensive UX — "the dumbest thing a storekeeper could do here"

- [ ] **Storekeeper submits an increase with cost = 0.** System blocks it server-side with a clear message.
- [ ] **Storekeeper submits a decrease of 999,999 units when on-hand is 10.** Negative-stock guard fires; blocked (or prompts confirmation if flexible-negative is on, never silent).
- [ ] **Storekeeper enters qty = 0.** Blocked at client and server; adjustment of zero quantity is meaningless.
- [ ] **Storekeeper enters a fractional qty that exceeds the item's UOM precision.** Validated server-side; error shown.
- [ ] **Storekeeper opens the form in two tabs and submits both.** Idempotency / double-submit guard: only one adjustment created.
- [ ] **Storekeeper leaves the form half-filled and navigates away.** Warn before data loss (unsaved-changes guard) or persist draft state.
- [ ] **Storekeeper adjusts an item in a location that was deactivated after the form loaded.** Server rejects with a clear "location inactive" message; form data preserved.
- [ ] **Storekeeper tries to reverse an adjustment from a locked period.** Server rejects; error message explains why (period locked, not a generic failure).
- [ ] **RTL / Arabic UI:** all labels, item names, reason text, and error messages render correctly in RTL layout; currency amounts and qty numbers stay LTR with correct grouping (KWD 1,234.500 not 1.234,500).
- [ ] **Currency display:** cost and value fields always show the tenant's currency symbol and use 3dp when functional currency is KWD — never hardcoded 2dp or USD sign.
- [ ] **Opening stock re-import:** importing the same CSV a second time does not silently double the opening stock. System detects duplicates or blocks.

---

## 4. Cross-module / integration

- [ ] **Stock levels (`/inventory/stock`)** update immediately after a posted adjustment — no stale on-hand shown.
- [ ] **Stock ledger** has a new entry for the adjustment; `source_document_type = 'stock_adjustment'`, `source_document_id` resolves to the correct adjustment record.
- [ ] **GL journal entry** is created in the accounting module for the correct accounts (Inventory Gain/Write-Down and Inventory Control); the JE links back to the stock adjustment as its source document.
- [ ] **Drill-down from GL:** navigating from the journal entry's source link opens the correct adjustment record — no 404.
- [ ] **Valuation / costing report** (`/reports/inventory-valuation`) reflects the updated total value after adjustment.
- [ ] **Opening stock → TB recon:** after the opening stock import, the inventory control account balance in the GL matches the valuation total shown in the import preview.
- [ ] **Pack units:** if an item has pack units, the adjustment qty can be entered in a pack unit; the base-unit qty stored in the ledger is correct (`resolvePackUnit` applied).

---

## 5. Known gaps (from recon — verify or track)

- **Opening-balance double-post risk** (HIGH): if the operator runs the opening stock import twice without clearing the first run, on-hand and the GL opening balance will be doubled. Confirm the system either blocks re-import or warns with a prominent confirmation step. Tracked in project memory (`project_import_recon_suspense_2026-06-18.md`).
- **Zero-cost increase** (HIGH): confirm the server rejects `cost = 0` on an increase — a zero-cost increase sets WAC to zero for all existing stock. Check `StockAdjustmentsService` validation, not just the form.
- **Reversal during locked period** (MEDIUM): behavior when reversing an adjustment whose original period is now locked is undefined in spec. Confirm the server rejects cleanly rather than posting to the wrong period.
- **Currency precision on reversal JE** (MEDIUM): verify that the reversal JE amounts match the original JE amounts exactly (same rounding, no off-by-one from re-computing `qty × cost`). The stored cost on the original should be used, not recomputed.
- **Audit trail completeness** (MEDIUM): confirm every adjustment (create, reverse) writes an audit-trail record with `before`/`after` state, `actor_id`, and timestamp.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Opening stock Σ(qty × cost) reconciles to the inventory control account balance.
- [ ] Reversal correctness verified: net P&L = 0, ledger has two entries, original untouched.
- [ ] Findings logged in `_findings.md`.
