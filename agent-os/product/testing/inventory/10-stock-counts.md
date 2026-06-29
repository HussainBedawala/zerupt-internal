# Inventory — Stock Counts / Stocktake Testing Checklist

> Persona: **storekeeper / inventory manager**. You run the warehouse. You count shelves, discover discrepancies, and expect the system to reconcile the difference against the books — correctly — without you understanding debits or credits. At every step ask: **"what's the dumbest thing a storekeeper could do during a count?"**

- **Route(s):** `/inventory/stock-counts` (list), `/inventory/stock-counts/new`, `/inventory/stock-counts/[id]` (review), `/inventory/stock-counts/[id]/count` (worksheet)
- **Feature dir:** `apps/web/src/features/inventory/` — `stock-count-form-panel.tsx`, `stock-count-sheet-panel.tsx`, `stock-count-variance-panel.tsx`, `stock-counts-list-panel.tsx`, `stock-count-status-badge.tsx`, `stock-count-serial-scan.tsx`
- **API:** `stock-counts.controller.ts` prefix `tenant/inventory/stock-counts` — `GET /variance-report`, `GET /`, `POST /`, `GET /:id`, `PATCH /:id/lines`, `POST /:id/submit`, `POST /:id/approve-post`, `POST /:id/cancel`
- **Depends on:** Items/Catalog (01), Warehouses/Locations (05), Stock Levels/On-Hand (06), Stock Ledger (07), Adjustments (08)

---

## 0. Preconditions

- [ ] Dataset loaded with a mix of items: some with on-hand stock, some with zero, at least one serial-tracked and one batch-tracked item.
- [ ] At least one warehouse and one bin defined.
- [ ] Logged in as a user with stock-count permissions; verify a user without the permission cannot reach `/inventory/stock-counts/new` or submit/approve actions (server-side rejection, not just hidden button).
- [ ] Fiscal period is open (posting to a locked period should be blocked at approve-post).

---

## 1. Functional — actions & states

### 1.1 Create a new count

- [ ] **Create (full / cycle / spot)** — form accepts count type, warehouse, optional bin filter, optional assignee; saved count appears in list with status `draft`.
  - [ ] Loading state shown on submit; button debounced — rapid double-click does not create two counts.
  - [ ] Error (e.g. no warehouse selected) shows user-friendly inline message; entered data not lost.
  - [ ] Empty state on `/inventory/stock-counts` is clear, not a blank screen.
- [ ] **System quantity is frozen at creation** — create a count, then receive a GRN that increases the same item's on-hand; the count's `systemQty` does not update. Verify via the worksheet.
- [ ] **Blind mode toggle** — when enabled, `systemQty` column is hidden on the worksheet; storekeeper can enter `countedQty` without seeing the book figure. Toggle off shows it.

### 1.2 Worksheet (count entry)

- [ ] **Enter counted quantities** — each line accepts a non-negative number; variance column updates in real time as lines are saved (`PATCH /:id/lines`).
- [ ] **Serial scan** — `stock-count-serial-scan.tsx` allows scanning a barcode/serial; scanned serial increments the correct line count and does not add a new duplicate line.
- [ ] **Partial save** — leaving the worksheet mid-count and returning shows previously entered quantities; nothing is lost.
- [ ] Lines filter / search by item name, SKU, or bin — correct subset returned; reset clears filter.
- [ ] Pagination on the worksheet (large count) is stable across pages; quantities entered on page 1 are not wiped when navigating to page 2.

### 1.3 Submit for review

- [ ] **Submit** — status transitions `draft → in_progress → pending_review`; worksheet becomes read-only after submit; a confirmation dialog is shown before submit (destructive: can no longer edit lines).
- [ ] Loading/error/success states all present on the submit action.
- [ ] A count with zero lines counted cannot be submitted without a confirmation warning ("you have not counted any items — are you sure?").

### 1.4 Approve and post

- [ ] **Approve-post** — status transitions `pending_review → approved → posted`; variances are applied atomically to the stock ledger and GL in a single transaction.
  - [ ] Loading state; button debounced — double-click does not post twice.
  - [ ] A posted count cannot be approved-posted again (server returns an error; UI shows graceful message).
- [ ] **Variance report** (`GET /variance-report`) — after posting, report reflects the posted variances only; items with zero variance are present or excluded consistently.
- [ ] **Cancel** — available from `draft` or `in_progress`; confirmation required; after cancel, stock and GL are unchanged; count appears as `cancelled` in list and cannot be re-opened.

### 1.5 List & filters

- [ ] List shows status badge, count type, warehouse, date, and assigned user.
- [ ] Filter by status, warehouse, and date range; results correct; reset works.
- [ ] Drill-down from list to review page resolves correct record.
- [ ] Export / print of variance report matches on-screen figures.

---

## 2. Accounting / domain invariants

> Cross-cutting invariants are in `README.md`. The following are specific to stock counts.

- [ ] **systemQty is frozen at creation:** the snapshot must not change after the count is created, regardless of subsequent GRNs, sales, adjustments, or transfers.
- [ ] **variance = countedQty − systemQty** on every line; `varianceValue = variance × WAC` at posting time; displayed value matches computed value.
- [ ] **Zero-variance lines:** approve-post produces no ledger entry for lines where variance = 0; ledger row count matches the number of non-zero-variance lines.
- [ ] **Increase variance (countedQty > systemQty):** approve-post creates a `COUNT_ADJUSTMENT` ledger entry with Dr Inventory, Cr Inventory Gain — amounts in tenant functional currency at correct precision (3dp for KWD).
- [ ] **Decrease variance (countedQty < systemQty):** approve-post creates a `COUNT_ADJUSTMENT` ledger entry with Dr Inventory Write-Down, Cr Inventory — correct direction, correct amount.
- [ ] **Atomic post:** if the GL posting fails mid-way, the stock ledger is also rolled back; no partial state (some lines posted, some not).
- [ ] **No double-post:** after `posted` status, re-submitting the approve-post API call is idempotent — second call returns an error; stock and GL unchanged from first post.
- [ ] **After posting:** on-hand quantity for each affected item/location = previous on-hand + variance; `total_value = on_hand × WAC`; inventory control account balance equals Σ total_value across all stock (cross-cutting invariant holds).
- [ ] **Cancel does not touch stock or GL:** on-hand and ledger after cancel are identical to before the count was created.
- [ ] **Lifecycle enforced server-side:** attempting to PATCH lines on a `pending_review` or `posted` count returns an error; attempting approve-post on a `draft` count returns an error — not just UI gates.

---

## 3. Edge cases & defensive UX — "the dumbest thing a storekeeper could do"

- [ ] **Enter a negative counted quantity** — blocked client-side and server-side with a clear message; the line is not saved with a negative value.
- [ ] **Enter a counted quantity larger than any reasonable stock level** (e.g. 999,999 units of an item known to have 5) — system accepts it (no hard cap) but variance is surfaced visibly and the approve-post confirmation should highlight the large discrepancy.
- [ ] **Submit then immediately try to edit lines** — worksheet is locked; UI shows "count submitted, no edits allowed"; no API route allows PATCH after `pending_review`.
- [ ] **Approve-post with a decimal quantity in a count for a unit-only item** — blocked; integer-only items (e.g. pieces) should not accept 1.5 counted.
- [ ] **Two sessions counting simultaneously** — user A and user B both have the worksheet open; one saves a line, the other saves a conflicting value; last-write-wins is acceptable but must not corrupt other lines; verify no 500 error.
- [ ] **Approve-post during a locked fiscal period** — server rejects with a clear "period is closed" message; status remains `pending_review`.
- [ ] **Cancel a posted count** — cancel action not available on a `posted` count; UI does not show the cancel button; API returns a 4xx.
- [ ] **Count created for a warehouse with no items** — empty worksheet shows a meaningful empty state, not a broken screen.
- [ ] **Storekeeper navigates away mid-count** — browser back/refresh returns to the same worksheet with quantities intact (no data loss).
- [ ] **RTL / Arabic:** all labels, status badges, and variance values render correctly in Arabic locale; numbers and currency remain LTR; no truncation of long item names.
- [ ] **Currency precision:** variance values shown to 3dp for KWD tenants; never hardcoded 2dp.
- [ ] **Bilingual item names:** primary language shown as heading, secondary shown beneath (or as tooltip), hidden for monolingual tenants — no hardcoded "English" or "Arabic" labels.

---

## 4. Cross-module / integration

- [ ] **GL posting (Accounting):** after approve-post, the Inventory Gain or Inventory Write-Down journal entry appears in the GL with the correct date, amount, and source-document link pointing back to the stock count.
- [ ] **Stock Levels (06):** after approve-post, `/inventory/stock` reflects the updated on-hand for each adjusted item/location; the count does not appear as a pending movement.
- [ ] **Stock Ledger (07):** each non-zero-variance line produces exactly one `COUNT_ADJUSTMENT` ledger row; `source_document_type = stock_count`, `source_document_id` resolves to the count.
- [ ] **Valuation (13):** after posting, inventory valuation report shows updated quantities and values; Σ total_value still equals the GL Inventory control account balance.
- [ ] **Adjustments (08):** a count adjustment and a manual adjustment on the same item in the same period both appear in the ledger; neither overwrites the other.
- [ ] **Drill-down:** from the variance report, clicking a line navigates to the correct count detail; from the GL journal entry, the source-document link resolves to the count review page.
- [ ] **Serial-tracked items:** if a serial-tracked item is included, the worksheet uses the serial scan flow; posting updates serial statuses correctly (no phantom serials created).
- [ ] **Batch-tracked items:** if a batch-tracked item is included, the variance is applied to the correct batch layer (earliest expiry first for reductions).

---

## 5. Known gaps (from spec — verify or track)

- **Multi-counter independent counting** (spec-only, not built): two counters independently count the same bin and the system reconciles their results. Not implemented; confirm UI does not imply this is possible. MEDIUM.
- **Offline counting sync** (spec-only, not built): counts entered offline (mobile, no connectivity) sync when reconnected. Not implemented; confirm no offline-mode UI hint. MEDIUM.
- **ABC cycle-count auto-classification** (spec-only, not built): system automatically schedules cycle counts by item velocity (A/B/C). Not implemented; confirm no broken "schedule" button. LOW.
- **Variance threshold alerts:** no automatic notification when a variance exceeds a configured threshold. LOW.
- **Recount workflow:** no formal "recount this line" flow for disputed variances; storekeeper must cancel and recreate. Confirm workaround is documented or UX makes it obvious. MEDIUM.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Variance math verified line-by-line against a manual calculation (at least 3 lines: increase, decrease, zero).
- [ ] GL entries confirmed in Accounting after approve-post.
- [ ] Findings logged in `_findings.md`.
