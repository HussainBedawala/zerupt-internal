# Inventory — Serial Numbers Testing Checklist

> Persona: **storekeeper / inventory manager**. You receive units with serial numbers stamped on the box, you sell them one by one, and you expect the system to track exactly which physical unit went to which customer — and to use that unit's actual purchase cost for COGS, not a pooled average. At every step ask: **"what's the dumbest thing a storekeeper could do with a serial number?"**

- **Route(s):** `/inventory/serial-numbers`
- **Feature dir:** `apps/web/src/features/inventory/` — `serial-numbers-list-panel.tsx`, `serial-number-detail-drawer.tsx`, `serial-number-add-dialog.tsx`, `serial-number-status-badge.tsx`, `serial-numbers-kpi-strip.tsx`
- **API:** `serial-numbers.controller.ts` prefix `tenant/inventory/serial-numbers` — `GET /`, `GET /kpis`, `GET /warranty`, `GET /warranty/expiring`, `GET /:id`, `POST /`, `POST /:id/mark-defective`, `PATCH /:id/warranty`
- **Depends on:** Items/Catalog (01), Warehouses/Locations (05), Stock Levels/On-Hand (06), Stock Ledger (07) — serial allocation is exercised through GRN (Purchase) and sale (Sales/POS) confirm flows, not standalone

---

## 0. Preconditions

- [ ] At least one item is configured as serial-tracked in the item catalog.
- [ ] Dataset includes serials in multiple statuses: `available`, `sold`, `returned`, at least one `defective`.
- [ ] A GRN and a sale/POS transaction for a serial-tracked item are posted, so allocation history is real.
- [ ] Logged in as a user with serial-number read and write permissions; verify a user without write permission cannot mark-defective or edit warranty (server-side check).

---

## 1. Functional — actions & states

### 1.1 Serial numbers list

- [ ] **List loads** with all serials for the tenant; columns: serial number, item, status badge, warehouse, acquisition cost, purchase document link, sale document link.
  - [ ] Loading skeleton shown while fetching; error state shows a user-friendly message, not a raw stack trace.
  - [ ] Empty state (no serial-tracked items yet) is clear, not a blank screen.
- [ ] **Filter** by status (`available`, `reserved`, `sold`, `returned`, `defective`, `in_transit`), item, warehouse — correct subset returned; filter reset works.
- [ ] **Search** by serial number string (partial match acceptable); returns correct results.
- [ ] Pagination stable across pages; filter state persists across page navigation.

### 1.2 KPI strip

- [ ] `GET /kpis` returns counts: total, available, sold, defective. KPI strip renders values in tenant functional currency precision where values are monetary; counts are integers.
- [ ] KPI values match the count of rows with matching statuses in the list; no off-by-one.

### 1.3 Serial detail drawer

- [ ] Clicking a serial opens the detail drawer; all fields populated: serial number, item, status, warehouse, acquisition cost, purchase document (with link), sale document (with link if sold), warranty start/end.
- [ ] Drill-down links resolve: purchase document link navigates to the correct GRN; sale document link navigates to the correct sale/POS receipt.
- [ ] Drawer closes without side effects; list does not reload unnecessarily.

### 1.4 Add serial manually

- [ ] **Add serial** dialog (`POST /`) — accepts item (picker, not free text), serial number, warehouse, acquisition cost; on success the serial appears in the list with status `available`.
  - [ ] Loading state on submit; button debounced — double-click does not create two serials.
  - [ ] Error on duplicate serial number for the same item: user-friendly message, data not lost.
  - [ ] Error on missing required fields inline, not after form wipe.

### 1.5 Mark defective

- [ ] **Mark defective** (`POST /:id/mark-defective`) — confirmation dialog required ("this unit will be removed from sellable stock — are you sure?"); after confirm, status changes to `defective`; serial no longer appears in available-stock pickers for sales/POS.
  - [ ] Loading state; error state if request fails.
  - [ ] Cannot mark an already-defective or sold serial as defective again; button hidden or disabled with a tooltip.
  - [ ] Marking defective does NOT post a write-off GL entry automatically (verify: no unexpected journal appears); a manual adjustment/write-off is needed separately.

### 1.6 Warranty management

- [ ] **Edit warranty** (`PATCH /:id/warranty`) — accepts warranty start and end dates; saved values appear in the detail drawer.
- [ ] `GET /warranty` returns all serials with warranty data; `GET /warranty/expiring` returns serials whose warranty expires within the configured threshold (e.g. 30 days).
- [ ] Warranty expiring list is correct: only serials with expiry ≤ threshold; sold/defective serials with expiring warranties still appear (warranty tracks the unit, not its sellability).

---

## 2. Accounting / domain invariants

> Cross-cutting invariants are in `README.md`. The following are specific to serial numbers.

- [ ] **Serial number unique per item:** no two `item_serial_numbers` rows share the same (`itemId`, `serialNumber`) pair; `POST /` with a duplicate is rejected with a clear error.
- [ ] **Status transitions valid — no illegal jumps:** `available → reserved → sold` (normal sale path); `sold → returned → available` (credit note / return); `available → defective`; `in_transit → available` (transfer arrival). Transitions that skip states (e.g. `available → returned` without ever being sold) should not be possible through the UI; verify API also rejects them.
- [ ] **No double-allocation (claim-at-confirm):** two concurrent sessions attempt to sell the same serial; only the first confirm succeeds; the second receives a conflict error — the serial is not double-allocated; test by confirming two sales with the same serial number in rapid succession.
- [ ] **COGS = acquisitionCost, not WAC:** when a serial is sold and COGS is posted, the journal entry Dr COGS uses `acquisitionCost` for that specific serial, not the item's weighted-average cost. Verify by deliberately making `acquisitionCost` differ from current WAC and confirming the sale; COGS entry must use the serial's own cost.
- [ ] **Serial-tracked items cannot go negative:** issuing / selling a serial-tracked item without an `available` serial in the system is blocked; the POS / sale confirmation returns a clear error ("no available serial for this item").
- [ ] **On-hand for serial-tracked items = count of `available` serials** for that item/warehouse; this matches the stock level shown in `/inventory/stock` and the ledger sum.
- [ ] **Returned serial becomes available again:** after a credit note / return is confirmed, the serial's status is `returned → available`; it reappears in the available-stock picker for future sales.
- [ ] **Defective serial excluded from normal picking:** a `defective` serial does not appear in the POS serial selector or sale serial selector; blocked at the API level, not just hidden in UI.
- [ ] **Warranty dates stored and retrieved correctly:** warranty start ≤ warranty end; system does not allow end < start.

---

## 3. Edge cases & defensive UX — "the dumbest thing a storekeeper could do with a serial number"

- [ ] **Enter a serial number that is all spaces or empty** — blocked client-side and server-side; trimmed input still triggers the required-field error.
- [ ] **Enter an acquisition cost of zero** — allowed (consignment, gift), but UI should show a warning if cost is zero for a non-zero-cost item type.
- [ ] **Enter a future acquisition date / manufacture date** — system should accept it (pre-receipt for pre-orders) but flag it visually.
- [ ] **Scan the same barcode twice in the serial add dialog** — second scan should not create a duplicate; show "already added to this GRN" or "already exists" message.
- [ ] **Mark a sold serial as defective** — should be blocked (a sold unit is the customer's problem); server returns a 4xx; UI shows "this serial has already been sold."
- [ ] **Edit warranty on a defective serial** — allowed (warranty may outlast defect reporting); verify no 500.
- [ ] **Search for a serial with special characters** (slashes, spaces, Arabic numerals) — no crash; results are correct or empty with a clear empty state.
- [ ] **Very large acquisition cost** (e.g. KWD 99,999.999) — accepted; stored and displayed at 3dp without rounding or truncation.
- [ ] **Navigate away mid-add-dialog** — dialog closes; no partial serial record created; re-opening the dialog shows a fresh form.
- [ ] **RTL / Arabic:** serial numbers (always LTR), item names (dir="auto"), status badges — all render correctly in Arabic locale with no overlap or truncation.
- [ ] **Currency precision:** acquisition cost displayed at tenant currency precision (3dp for KWD); never hardcoded 2dp.
- [ ] **Bilingual item names** in the list and picker use the primary/secondary language pair from the tenant's supported-languages config; no hardcoded "English" or "Arabic" labels.

---

## 4. Cross-module / integration

- [ ] **GRN (Purchase):** confirming a GRN for a serial-tracked item creates `item_serial_numbers` rows with status `available`, `acquisitionCost` from the GRN line, and `purchaseDocumentId` pointing to the GRN. Verify row count matches quantity on the GRN line.
- [ ] **Sale / Sales Order confirm:** confirming a sale claims the selected serial (`available → sold`); `saleDocumentId` populated; COGS journal entry uses `acquisitionCost` of that serial.
- [ ] **POS confirm:** same as sale — serial claimed atomically in the confirm transaction; status `sold`; COGS correct.
- [ ] **Credit note / return:** serial transitions `sold → returned → available`; a new `available` serial appears in the picker; COGS reversal uses the same `acquisitionCost` (not current WAC).
- [ ] **Stock count (10):** serial scan on the stock count worksheet increments the correct line; after approve-post, if variance creates a new available serial (found extra unit), a new `item_serial_numbers` row is created with an appropriate source.
- [ ] **Stock levels (06):** on-hand shown for a serial-tracked item = count of `available` serials; matches after every state change.
- [ ] **Valuation (13):** inventory valuation for serial-tracked items uses Σ acquisitionCost of `available` serials (specific identification), not WAC. Verify the valuation report uses this method and the total agrees with the GL Inventory account balance for that item.
- [ ] **Drill-down links:** purchase document link in the detail drawer resolves to the correct GRN; sale document link resolves to the correct sale or POS receipt; no 404.

---

## 5. Known gaps (from spec — verify or track)

- **No bulk serial import via CSV / scan list:** storekeepers must add serials one at a time through the dialog or via GRN line entry; for large shipments this is painful. MEDIUM.
- **No inter-warehouse serial transfer tracking:** transferring a serial-tracked item between warehouses via Transfers (09) should update `warehouseId` on the serial; verify this happens or flag if the serial is orphaned from its location. HIGH — verify.
- **No serial-level write-off flow:** marking defective does not auto-post a write-down; a separate manual adjustment is needed. This is intentional per design but must be communicated clearly in the UI. MEDIUM.
- **Warranty expiry alerts:** no push notification or banner when a sold serial's warranty is about to expire; storekeepers must proactively check `/warranty/expiring`. LOW.
- **Returned-to-defective path:** a serial returned as damaged goes `sold → returned`; then requires a separate mark-defective action. No single "return as defective" flow. LOW.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Double-allocation race condition tested (two sessions, same serial, concurrent confirm).
- [ ] COGS verified against acquisitionCost for at least one sale (not WAC).
- [ ] Findings logged in `_findings.md`.
