# Inventory — Batch / Lot Tracking Testing Checklist

> Persona: **storekeeper / inventory manager**. You receive goods with batch numbers and expiry dates printed on the packaging. You need the system to sell the oldest batches first (FEFO), warn you before anything expires, and stop you from accidentally selling or distributing expired stock. At every step ask: **"what's the dumbest thing a storekeeper could do with a batch?"**

- **Route(s):** `/inventory/batches`
- **Feature dir:** `apps/web/src/features/inventory/` — `batches-list-panel.tsx`, `batch-kpi-strip.tsx`, `batch-status-badge.tsx`
- **API:** `batches.controller.ts` prefix `tenant/inventory/batches` — `GET /`, `GET /kpis`, `GET /expiring`, `GET /:id`, `POST /:id/write-off`. Services: `BatchesService`, `BatchPickerService` (FEFO), `BatchExpirySchedulerService` (daily job)
- **Depends on:** Items/Catalog (01), Warehouses/Locations (05), Stock Levels/On-Hand (06), Stock Ledger (07) — batch creation and consumption are exercised through GRN (Purchase) receive and sales/POS/issue flows

---

## 0. Preconditions

- [ ] At least one item is configured as batch-tracked in the item catalog.
- [ ] Dataset includes batches in multiple statuses: `active`, `expiring`, `expired`, at least one `exhausted`; batches with different expiry dates for the same item/warehouse.
- [ ] A GRN posting created at least two batch layers for one item (different expiry dates) so FEFO ordering can be verified.
- [ ] The daily expiry scheduler has run (or can be triggered manually) to set status transitions.
- [ ] Logged in as a user with batch read and write permissions; verify a user without write permission cannot write-off (server-side check, not just hidden button).

---

## 1. Functional — actions & states

### 1.1 Batches list

- [ ] **List loads** with all batches for the tenant; columns: batch number, item, status badge, warehouse, expiry date, manufacturing date, remaining qty, unit cost, GRN link.
  - [ ] Loading skeleton shown while fetching; error state shows a user-friendly message, not a raw stack trace.
  - [ ] Empty state (no batch-tracked items yet) is clear, not a blank screen.
- [ ] **Filter** by status (`active`, `expiring`, `expired`, `exhausted`), item, warehouse, expiry date range — correct subset returned; filter reset works.
- [ ] **Search** by batch number or supplier batch reference — partial match; correct results.
- [ ] Pagination stable across pages; filter state persists across page navigation.
- [ ] Default sort is by expiry date ascending (soonest first) — matching FEFO priority; verify this is the initial sort order.

### 1.2 KPI strip

- [ ] `GET /kpis` returns counts/values: total active batches, expiring batches count, expired batches count, total value at risk (expiring + expired remaining qty × unit cost).
- [ ] KPI strip renders monetary values at tenant functional currency precision; counts are integers.
- [ ] KPI values agree with the list counts when applying the same status filter.

### 1.3 Batch detail

- [ ] Clicking a batch opens the detail view or drawer; all fields populated: batch number, item, status, warehouse, expiry date, manufacturing date, supplier batch ref, remaining qty, unit cost, GRN link.
- [ ] GRN drill-down link resolves to the correct purchase document.

### 1.4 Expiring report

- [ ] `GET /expiring` returns batches whose expiry is within the configured threshold; correct subset (no batches expiring beyond threshold; no already-expired batches unless threshold includes today).
- [ ] Expiring list is sorted soonest-first.

### 1.5 Write-off

- [ ] **Write-off** (`POST /:id/write-off`) — confirmation dialog required ("this will zero this batch and post an inventory write-down — are you sure?"); after confirm:
  - `remainingQty` set to 0.
  - Batch status transitions to `exhausted`.
  - A write-down GL journal entry is posted: Dr Inventory Write-Down, Cr Inventory, amount = remaining qty × unit cost at time of write-off.
  - [ ] Loading state on submit; button debounced — double-click does not post two journal entries.
  - [ ] Error state shows user-friendly message; batch status unchanged if write-off fails.
  - [ ] Cannot write off an already-exhausted batch; button hidden or disabled with tooltip.

---

## 2. Accounting / domain invariants

> Cross-cutting invariants are in `README.md`. The following are specific to batch tracking.

- [ ] **FEFO consumption (earliest expiry first):** when a sale, issue, or POS confirms an item pull from a batch-tracked item, `BatchPickerService` selects the batch with the earliest expiry date first; verify by having two batches (A: expires next month, B: expires next year) and confirming a sale — batch A's `remainingQty` decrements first.
- [ ] **remainingQty never negative:** any consumption that would reduce `remainingQty` below 0 is blocked; the picker must not over-allocate a single batch; if one batch is exhausted, it moves to the next oldest-expiry batch. Verify: try to sell more than one batch's `remainingQty` when a second batch covers the difference.
- [ ] **Σ batch remainingQty = on-hand for batch-tracked items:** for every batch-tracked item in every warehouse, the sum of `remainingQty` across all `active`/`expiring` batches must equal the on-hand quantity shown in `/inventory/stock` and in the ledger sum. Exhausted and written-off batches contribute 0.
- [ ] **Expired batches excluded from normal picking:** a batch with status `expired` must not be selected by `BatchPickerService`; verify by attempting a sale when only an expired batch has remaining qty — sale is blocked with a clear "no available stock" or "stock is expired" message.
- [ ] **Expiry scheduler transitions status correctly:** the daily job (`BatchExpirySchedulerService`) must:
  - Set status to `expiring` when expiry is within the configured threshold (e.g. 30 days).
  - Set status to `expired` when expiry date has passed.
  - Not touch `exhausted` or written-off batches.
  - Not double-transition a batch that is already `expired`.
- [ ] **Write-off GL entry is balanced:** Dr Inventory Write-Down = Cr Inventory = remaining qty × unit cost; no rounding discrepancy; entry date is the write-off date; source document links to the batch.
- [ ] **Write-off is atomic:** if the GL posting fails, `remainingQty` is not zeroed and status is not changed; no partial state.
- [ ] **Manufacturing date ≤ expiry date:** enforced at batch creation (GRN receive) and in the write-off or edit flow; a batch with manufacturing date after expiry date is rejected with a clear error.
- [ ] **Unit cost immutable after receipt:** `unitCost` on a batch layer is the cost at time of GRN receipt and must not be retroactively updated by subsequent GRNs or WAC recalculations; FEFO consumption uses each layer's own `unitCost`.
- [ ] **COGS on batch consumption:** COGS journal entry when a batch-tracked item is sold uses `unitCost` from the consumed batch layer(s) (FIFO/FEFO stack), not the current WAC.

---

## 3. Edge cases & defensive UX — "the dumbest thing a storekeeper could do with a batch"

- [ ] **Enter an expiry date in the past at GRN receipt** — system should accept it (a supplier may ship stock that is already near expiry) but immediately flag the batch as `expiring` or `expired` via the scheduler or at creation; storekeeper sees a warning at receive time.
- [ ] **Enter an expiry date before the manufacturing date** — blocked client-side and server-side; clear message "expiry date must be after manufacturing date."
- [ ] **Enter remaining qty of zero at GRN receipt** — blocked; a batch must be created with qty > 0.
- [ ] **Write off a batch that was partially consumed** — write-off applies to the current `remainingQty`, not the original received qty; confirm the GL entry amount uses the current remaining, not the original.
- [ ] **Write off an exhausted batch** — button hidden or server returns 4xx; no duplicate GL entry.
- [ ] **Two sessions write-off the same batch simultaneously** — only one succeeds; second receives a conflict error; one GL entry posted, not two.
- [ ] **Sell exactly the remaining qty of a batch** — `remainingQty` goes to 0; batch status transitions to `exhausted`; no negative result; the next batch in FEFO order is used if more qty is requested in the same transaction.
- [ ] **Item has no active batches but has exhausted ones** — sale is blocked with "no stock available" message; exhausted batches are not re-allocated.
- [ ] **Batch number with special characters or Arabic text** — accepted and stored; displayed correctly in both LTR and RTL context; `dir="auto"` on the batch number field.
- [ ] **Very large unit cost** (e.g. KWD 9,999.999) — accepted; stored and displayed at 3dp without rounding or truncation.
- [ ] **Batch number collision across items** — two different items can share the same batch number (supplier assigns batch per product line); verify the system scopes batch numbers per item, not globally, and no cross-item confusion.
- [ ] **RTL / Arabic:** expiry dates, batch numbers, status badges all render correctly in Arabic locale; numbers remain LTR; no truncation.
- [ ] **Currency precision:** unit cost and value-at-risk amounts displayed at tenant currency precision (3dp for KWD); never hardcoded 2dp.
- [ ] **Bilingual item names** in the list and picker use the primary/secondary language pair; no hardcoded "English" or "Arabic" labels.

---

## 4. Cross-module / integration

- [ ] **GRN (Purchase):** confirming a GRN for a batch-tracked item creates `item_batches` row(s) with correct `batchNumber`, `expiryDate`, `manufacturingDate`, `supplierBatchRef`, `remainingQty` = received qty, `unitCost` from the GRN line, `grnId` populated, status `active` (or `expiring` if already within threshold). Ledger entry created.
- [ ] **Sale / Sales Order confirm:** `BatchPickerService` selects the earliest-expiry batch; `remainingQty` decremented atomically in the confirm transaction; COGS journal uses that batch's `unitCost`.
- [ ] **POS confirm:** same as sale — FEFO batch selected and consumed atomically.
- [ ] **Credit note / return:** returned qty added back to the same batch (if batch-level tracking is supported) or creates a new batch layer; `remainingQty` increases; status re-evaluated.
- [ ] **Stock count (10):** if a batch-tracked item is counted and a variance posted, the variance is applied to batch layers (earliest expiry first for reductions, or a new layer for increases); `Σ remainingQty` still equals on-hand after posting.
- [ ] **Expiry scheduler (daily job):** after the scheduler runs (or is manually triggered in test), `expiring` and `expired` batches are correctly flagged; KPI strip and expiring report reflect the updated statuses without a manual page refresh (or with a clear stale-data indicator and refresh trigger).
- [ ] **Write-off GL entry (Accounting):** after write-off, the Inventory Write-Down journal entry appears in the GL with the correct date, amount (remaining qty × unit cost), and source-document link pointing to the batch.
- [ ] **Valuation (13):** inventory valuation for batch-tracked items uses Σ (remainingQty × unitCost) per active/expiring batch layer; the total agrees with the GL Inventory account balance for that item.
- [ ] **Stock levels (06):** on-hand shown for a batch-tracked item = Σ remainingQty of active + expiring batches; updates after every GRN, sale, write-off, and stock count.
- [ ] **Drill-down links:** GRN link in batch detail resolves to the correct GRN; GL source-document link from the write-off entry resolves to the batch detail.

---

## 5. Known gaps (from spec — verify or track)

- **No batch recall / quarantine flow:** when a supplier issues a recall for a batch number, there is no dedicated "quarantine batch" action; storekeeper must manually write it off. This leaves stock in limbo between discovery and write-off. HIGH — verify workaround is documented.
- **No partial batch write-off:** `POST /:id/write-off` zeros the entire remaining qty; there is no way to write off a subset of a batch (e.g. 10 of 50 units are damaged). MEDIUM.
- **FEFO picker exposed only through backend service:** there is no UI to preview which batch will be consumed before confirming a sale; a storekeeper cannot see "this sale will pull from Batch X." LOW — informational improvement.
- **No batch-level transfer tracking:** when a batch-tracked item is transferred between warehouses via Transfers (09), verify `warehouseId` on the batch row is updated correctly; if not, on-hand per location will be wrong while Σ total is correct. HIGH — verify.
- **Expiry scheduler is a daily job:** batches that expire intraday are not flagged until the next scheduler run; a batch that expires at midnight is sellable until the scheduler runs the next day. LOW — document the behavior so storekeepers know to check before selling near-expiry stock.
- **No barcode scanning for batch assignment at GRN:** batch numbers must be typed manually; scanning from a supplier label is not supported. MEDIUM.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] FEFO order verified across at least two batches (different expiry dates, same item/warehouse).
- [ ] Σ remainingQty = on-hand verified for at least one batch-tracked item after GRN, sale, and write-off.
- [ ] Write-off GL entry confirmed in Accounting.
- [ ] Expiry scheduler status transitions verified (at least one batch moved to `expiring` or `expired`).
- [ ] Findings logged in `_findings.md`.
