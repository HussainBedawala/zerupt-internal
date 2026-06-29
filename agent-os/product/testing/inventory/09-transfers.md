# Inventory — Stock Transfers Testing Checklist

> Persona: **storekeeper / inventory manager** (Kuwait, functional currency KWD at 3dp). Test every item as that person. Verify the *invariant*, not just that the button works. At every screen ask: **"what's the dumbest thing a storekeeper could do here?"**

- **Routes:** `/inventory/transfers` (list), `/inventory/transfers/new`, `/inventory/transfers/[id]`, `/inventory/transfers/[id]/delivery-note`
- **Feature dir:** `apps/web/src/features/inventory/` (`transfer-form-panel.tsx`, `transfer-detail-panel.tsx`, `transfers-list-panel.tsx`, `delivery-note.tsx`)
- **API:** `stock-transfers.controller.ts` prefix `tenant/inventory/transfers` — `POST /`, `GET /`, `GET /:id`, `POST /:id/send`, `POST /:id/receive`, `POST /:id/cancel`, `POST /:id/cancel-sent`. Service `StockTransfersService`.
- **DB:** `stock_transfers` (status `Draft` / `InTransit` / `Completed` / `PartiallyReceived` / `Cancelled`; source/dest warehouse; `TRF-XXXX` numbering); `stock_transfer_lines` (`sentQty`, `receivedQty`)
- **Depends on:** 01 Items/Catalog, 05 Warehouses/Locations (at least two active warehouses/locations required for a meaningful transfer), 06 Stock Levels (on-hand at source must be verified before testing)

---

## 0. Preconditions

- [ ] At least two active warehouses/locations exist and belong to the current tenant.
- [ ] At least one item has sufficient on-hand stock at the source location (know the exact quantity before starting).
- [ ] Logged in as a user whose role includes `inventory:transfers:write`; separately confirm a user *without* that permission cannot trigger send/receive/cancel actions (server-side check, not just hidden buttons).
- [ ] Fiscal period open (or note if testing locked-period path).

---

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

### Transfers list

- [ ] **List loads** — shows all transfers for this tenant; columns include transfer number (`TRF-XXXX`), date, source warehouse, destination warehouse, status, created-by, and line count.
  - [ ] Empty state (no transfers yet) shows a helpful prompt, not a blank or broken screen.
  - [ ] Pagination is correct and stable across pages; active filters are preserved when navigating pages.
- [ ] **Filter/search** — filter by status, source warehouse, destination warehouse, date range; reset clears all filters.
- [ ] **Status badges** are accurate and visually distinct for `Draft`, `InTransit`, `Completed`, `PartiallyReceived`, `Cancelled`.
- [ ] **Drill-down** — clicking a row opens the transfer detail; back navigation returns to the same page/scroll position.

### Create transfer (Draft)

- [ ] **Source and destination warehouse pickers** are searchable pickers — not free-text. Cannot select the same location as both source and destination (blocked at client and server).
- [ ] **Item picker** is a searchable picker. Selecting an item shows current on-hand at the source location, unit, and current average cost.
  - [ ] Dumbest thing: storekeeper selects an item that has zero stock at the source. System should warn (or block, per setting) before the form can be submitted.
- [ ] **Sent quantity** field: required per line; validated against on-hand at source (cannot exceed on-hand unless flexible-negative is explicitly enabled).
- [ ] **Multiple lines** can be added; each line independently validates qty vs. on-hand.
- [ ] **Save as Draft** — transfer is saved with status `Draft`; no stock movement yet; draft can be edited and deleted.
  - [ ] Loading state shown while saving; button debounced.
  - [ ] Error on save shows a user-friendly message; entered data is NOT cleared.
- [ ] **Warn before navigation** away from an unsaved or partially-filled form (data-loss guard).

### Send transfer (`Draft` → `InTransit`)

- [ ] **Send action** requires confirmation: confirm dialog shows item list, quantities, source, and destination. Cancel returns to detail with all data intact.
- [ ] After confirming send:
  - [ ] Status changes to `InTransit`.
  - [ ] On-hand at **source** decreases by `sentQty` immediately.
  - [ ] In-transit quantity is tracked (the stock is no longer at source, not yet at destination).
  - [ ] Send button is debounced; double-click or rapid re-click does NOT send twice.
  - [ ] `TRF-XXXX` number is assigned on send (if not already on draft creation).
- [ ] **Delivery note** (`/inventory/transfers/[id]/delivery-note`) is printable after send; shows transfer number, date, source, destination, item list with `sentQty`, and a signature line.
  - [ ] Delivery note quantities match the transfer lines exactly.
  - [ ] Delivery note renders correctly in both LTR and RTL layouts.

### Receive transfer (`InTransit` → `Completed` or `PartiallyReceived`)

- [ ] **Receive action** is available only in `InTransit` or `PartiallyReceived` status.
- [ ] Receiver enters `receivedQty` per line. System pre-fills `sentQty` as the expected value.
  - [ ] `receivedQty` cannot exceed `sentQty` per line (server-side validation, not just client).
  - [ ] Dumbest thing: storekeeper types a larger number than was sent, hoping to conjure extra stock.
- [ ] **Full receipt** (`receivedQty = sentQty` on all lines): status becomes `Completed`; on-hand at destination increases by `receivedQty`; in-transit balance returns to zero.
- [ ] **Partial receipt** (`receivedQty < sentQty` on at least one line): status becomes `PartiallyReceived`; destination on-hand increases by received amounts; remaining qty stays in-transit.
  - [ ] A subsequent receive action on a `PartiallyReceived` transfer allows receiving the remainder; cumulative `receivedQty` still cannot exceed `sentQty`.
- [ ] **Shortfall at receive** (received less than sent with no further receives planned — if "close transfer" option exists): shortfall qty posts a write-down JE (DR Inventory Write-Down / CR Inventory in Transit); confirm the inventory in-transit account returns to zero.
- [ ] Receive confirmation dialog shows per-line expected vs. received; confirm button debounced.
- [ ] Success: transfer status updates, on-hand at destination updates, success toast shown.
- [ ] Error: user-friendly message; `receivedQty` values entered are preserved.

### Cancel transfer

- [ ] **Cancel a Draft** — transfer is deleted or status becomes `Cancelled`; no stock movement occurred, so nothing to reverse.
- [ ] **Cancel-sent** (`POST /:id/cancel-sent`) — cancels an `InTransit` transfer: stock returns to source; in-transit balance zeroes out; status becomes `Cancelled`.
  - [ ] Requires confirmation with a reason.
  - [ ] Cannot cancel-sent a `Completed` or `PartiallyReceived` transfer (blocked at server with a clear message).
  - [ ] After cancel-sent: on-hand at source is restored to the pre-send value; no GL entry for a same-branch cancel (or correct in-transit reversal for inter-branch).

---

## 2. Accounting / domain invariants

> Cross-cutting invariants are in `README.md`. Submodule-specific invariants below.

- [ ] **Same-location/same-branch transfer: zero GL impact.** If source and destination are in the same branch, no journal entry is created. The transfer is cost-neutral.
- [ ] **Inter-branch send posts balanced JE:** DR Inventory in Transit / CR Inventory (source warehouse account). Amount = `sentQty × WAC` in tenant currency at 3dp.
- [ ] **Inter-branch receive posts balanced JE:** DR Inventory (destination warehouse account) / CR Inventory in Transit. Amount = `receivedQty × WAC` (WAC carried unchanged from source — no P&L on a standard transfer).
- [ ] **Inventory in-transit account nets to zero on full receipt:** after a `Completed` transfer, the in-transit account balance attributable to that transfer is exactly zero.
- [ ] **WAC carried unchanged:** the average cost of items at the destination after receipt equals the WAC at the source at the time of send. No P&L is recognised on a cost-neutral transfer.
- [ ] **Shortfall write-down:** if a transfer closes with a shortfall (received < sent, no further receipts), the unrecovered amount `(sentQty - receivedQty) × WAC` posts DR Inventory Write-Down / CR Inventory in Transit. In-transit account nets to zero.
- [ ] **No negative on-hand at source after send:** source on-hand after send must equal pre-send on-hand minus `sentQty`. If this would go negative, send is blocked (or requires flexible-negative setting).
- [ ] **total_value = on_hand × average_cost** at both source and destination after every lifecycle event (send and receive), to currency precision with no rounding drift.
- [ ] **Immutable ledger:** each send and receive creates new `stock_ledger_entries` rows; no rows are edited or deleted on cancellation — a cancel-sent creates reversal entries.

---

## 3. Edge cases & defensive UX — "the dumbest thing a storekeeper could do here"

- [ ] **Same source and destination.** Form blocks it at client; server also rejects — a transfer to itself is meaningless.
- [ ] **Send with qty = 0 on a line.** Blocked at client and server; zero-qty line is meaningless.
- [ ] **Send more than on-hand at source.** Negative-stock guard: blocked (or explicit confirmation required if `flexible-negative` is on). Never silently creates negative stock.
- [ ] **Receive more than sent.** Server rejects `receivedQty > sentQty` per line; client should disable or cap the input. Conjuring stock is not allowed.
- [ ] **Double-send:** storekeeper clicks "Send" in two browser tabs simultaneously. Only one send completes; second gets a clear "already sent" error.
- [ ] **Double-receive on a completed transfer.** Blocked at server; status `Completed` does not allow further receives.
- [ ] **Cancel after partial receive.** System should clearly define and enforce the allowed state transitions (e.g., cannot cancel-sent a `PartiallyReceived` transfer without first handling the received portion).
- [ ] **Stale form data:** storekeeper opens the send form, another session cancels the draft. Submitting the stale form returns a clear "transfer no longer exists" error; data is not corrupted.
- [ ] **Deactivated location after form loaded.** Storekeeper picks a location that is then deactivated before they submit. Server rejects with "location inactive"; form data preserved.
- [ ] **Transfer from/to a location the storekeeper's role cannot access.** Server enforces location-level permissions; not just UI hiding.
- [ ] **RTL / Arabic UI:** all labels, location names, item names, and status text render correctly in RTL layout. Quantity inputs and currency values remain LTR. Delivery note renders correctly in RTL.
- [ ] **Currency display:** all cost and value fields use the tenant's currency at correct precision (3dp for KWD); never hardcoded 2dp or USD symbol.
- [ ] **Large transfer (many lines):** form and confirmation dialog remain usable and performant with 50+ lines; no UI freeze.

---

## 4. Cross-module / integration

- [ ] **Stock levels (`/inventory/stock`)** update at source and destination immediately after send and after receive — no stale on-hand displayed at either location.
- [ ] **Stock ledger** has entries for send (source decrease, in-transit increase) and receive (in-transit decrease, destination increase); each entry has `source_document_type = 'stock_transfer'` and `source_document_id` resolving to the correct transfer record.
- [ ] **Drill-down from GL:** for inter-branch transfers, navigating from the journal entry's source link opens the correct transfer record — no 404.
- [ ] **Delivery note** (`/inventory/transfers/[id]/delivery-note`) is accessible after send, renders all lines correctly, and prints cleanly (no layout overflow, correct RTL/LTR, no hardcoded currency).
- [ ] **GL accounts:** for inter-branch transfers, the Inventory in Transit account is used; source and destination inventory accounts are updated. Confirm both accounts are correct for the tenant's chart of accounts (not hardcoded).
- [ ] **Valuation report** (`/reports/inventory-valuation`) shows correct totals at both source and destination locations after a completed transfer; total value across all locations is unchanged (no value created or destroyed).
- [ ] **Pack units:** if an item is transferred in a pack unit, the base-unit qty stored in the ledger is correct (`resolvePackUnit` applied); on-hand at source and destination is in base units.
- [ ] **Permissions:** a user with `inventory:transfers:read` only can view the list and detail but cannot trigger send/receive/cancel — all action buttons are hidden AND the API endpoints reject the request with 403.

---

## 5. Known gaps (from recon — verify or track)

- **Partial-receipt close path** (HIGH): the spec describes `PartiallyReceived` as a status but the flow for "closing" a partially-received transfer with a write-down is not explicitly documented in the controller. Verify whether `POST /:id/receive` with a final partial quantity automatically triggers the shortfall write-down JE or if a separate action is needed. If no close mechanism exists, the in-transit account will never zero out for partial receipts.
- **Cancel-sent on PartiallyReceived** (HIGH): cancelling after a partial receive creates a complex state — some stock is already at the destination. Confirm the system either blocks this or handles the reversal correctly (destination on-hand reduced, in-transit zeroed, source restored only for the unreceived portion).
- **Same-branch detection** (MEDIUM): confirm the "same-branch = no GL entry" logic is correctly triggered by a backend check, not just by the UI preventing same-source/same-destination selection. A savvy storekeeper (or a bad API caller) could craft a same-location transfer and accidentally trigger spurious GL entries.
- **In-transit account per-branch vs. shared** (MEDIUM): verify whether a single global "Inventory in Transit" account is used or per-branch accounts. A shared account means concurrent transfers could make reconciliation difficult. Confirm with the chart of accounts setup.
- **Delivery note locale** (LOW): confirm the delivery note (`delivery-note.tsx`) reads the tenant's primary/secondary language pair for labels (warehouse names, item names, headings) rather than hardcoding English. Check `useBilingualLabels()` usage.
- **Audit trail on cancel-sent** (MEDIUM): confirm cancelling an in-transit transfer writes an audit-trail record with before/after state, actor, and timestamp — not just the ledger reversal entries.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Full-transfer recon verified: source on-hand reduced, destination on-hand increased, in-transit nets to zero, GL balanced.
- [ ] Partial-receipt flow tested: `PartiallyReceived` status correct, subsequent receive completes correctly.
- [ ] WAC carried unchanged to destination confirmed (no P&L on transfer).
- [ ] Delivery note prints correctly (correct qty, correct locale, correct currency precision).
- [ ] Findings logged in `_findings.md`.
