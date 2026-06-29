# Inventory — Valuation / Costing (WAC / FIFO) Testing Checklist

> Persona: **storekeeper / inventory manager** — someone who receives goods, issues stock, and needs to trust that the value on the screen is real. They are NOT an accountant, but their actions directly drive the numbers an accountant depends on. At every step ask: **"what's the dumbest thing a storekeeper could do here?"**

- **Route(s):** `/reports/inventory-valuation`
- **Feature dir:** `apps/web/src/features/reports/components/reports/inventory-valuation-report.tsx`; `apps/web/src/features/reports/api/inventory-reports-api.ts`
- **API:** `GET /tenant/inventory/reports/valuation` (as-of date, warehouse filter, method filter)
- **Depends on:** `07-stock-ledger.md`, `08-adjustments-opening.md` — ledger must be correct before valuation is meaningful

---

## 0. Preconditions

- [ ] Dataset loaded with known opening stock (asala baseline or seeded set). Know the expected total valuation figure before you start.
- [ ] At least one item tracked by WAC, one by FIFO, and (if the tenant has it) one by specific-ID — exercise all three costing paths.
- [ ] At least one prior GRN, one sale/issue, and one purchase-return posted — enough movement history to test re-weighting.
- [ ] Logged in as a user with the `inventory:reports:read` permission. Separately confirm a user WITHOUT the permission cannot reach the route (403, not a blank page).
- [ ] Relevant period is open (or test an as-of date inside a locked period to confirm the report still reads historical data correctly).

---

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

- [ ] **Report loads at default as-of (today)** — data appears; total matches expected; no blank/broken screen.
  - [ ] Loading spinner shown while fetching; no frozen UI; no double-fetch on mount.
  - [ ] Error state on API failure shows a user-friendly message (not a raw stack trace or silent blank).
  - [ ] Empty state (no stock at all) shows a helpful message, not a broken table.

- [ ] **As-of-date filter** — changing the date regenerates the report for that point in time; going back before any GRN shows zero or opening values only.
  - [ ] Future date accepted; reports as-of now (or the system prevents a future date with clear messaging).
  - [ ] Very old date (before tenant was created) handled gracefully — zero results, not a crash.

- [ ] **Warehouse / location filter** — filtering to a single warehouse shows only that warehouse's stock; totals adjust accordingly; multi-location tenant sees cross-location totals when no filter applied.

- [ ] **Costing method filter** — if exposed, filtering to WAC-only or FIFO-only returns only items configured with that method.

- [ ] **Search / item filter** — searching by item name or SKU returns correct subset; clearing the filter restores the full list.

- [ ] **Export / print** — exported CSV/PDF matches what is on screen (same totals, same precision, same currency symbol). No rounding change on export.

- [ ] **Drill-down** — clicking an item row (if available) resolves to the correct item detail or stock ledger view for that item.

---

## 2. Inventory / costing invariants

> These are CRITICAL financial invariants. A single failure here is a showstopper. The README covers ledger/GL/UOM cross-cutting rules; the ones below are specific to valuation and costing.

- [ ] **Report total = GL control account balance.** Σ(onHand × averageCost) across all items on the report equals the balance of the Merchandise Inventory control account in the GL at the same as-of date. Test on the asala baseline where the entire balance is opening stock.

- [ ] **WAC re-weights correctly on receipt.** After posting a GRN, the item's averageCost on the report equals `(priorQty × priorWAC + receivedQty × receivedUnitCost) / (priorQty + receivedQty)`. Verify the formula manually for at least one item.

- [ ] **WAC issues consume at current WAC, do not change it.** Post a sale/issue; the averageCost on the report stays the same; onHand decreases; total value decreases by exactly `issuedQty × WAC`.

- [ ] **No negative average cost.** No item on the report ever shows a negative averageCost, regardless of adjustments or returns.

- [ ] **FIFO layers reconcile.** For a FIFO item, Σ(remainingQty × unitCost) across all open cost layers equals the item's total value on the report. Consume oldest layer first — after a sale that partially depletes the oldest layer, the report reflects the blended remaining value correctly.

- [ ] **Specific-ID costing (if applicable).** An item tracked by serial/lot shows total value = Σ(acquisition cost of all on-hand serials). After one serial is sold, its cost leaves the inventory total exactly.

- [ ] **totalValue = onHand × averageCost to 3dp (KWD).** For every item row, `totalValue` equals `onHand × averageCost` rounded to the tenant's currency precision — no rounding leak accumulates across items.

- [ ] **Landed cost revalues inventory, not P&L.** After posting a landed cost allocation to a GRN, the item's averageCost increases; the difference posts to Inventory (Dr) and Landed Cost Clearing (Cr) — NOT to an expense or variance account.

- [ ] **Purchase-return reversal.** Returning goods to a supplier reduces onHand and resets WAC correctly; total value decreases; GL posts the reversal journal.

- [ ] **Sale-return (customer return).** Stock is reinstated; WAC re-weights using the original cost (or configured policy); report total increases; COGS reversal posts to GL.

- [ ] **per-item costing method override.** An item with `item_costing_config` set to FIFO is costed by FIFO even if the tenant default is WAC — and vice versa. Confirm the report uses each item's effective method, not just the tenant default.

- [ ] **Multi-location aggregation.** For an item spread across two warehouses, the report's per-item total = sum of both warehouse values; filtering to one warehouse shows only that warehouse's portion. Totals never double-count.

---

## 3. Edge cases & defensive UX — "the dumbest thing a storekeeper could do"

- [ ] **Zero-cost receipt.** A storekeeper posts a GRN with unitCost = 0 (forgot to enter cost). System warns or blocks; if allowed, WAC drops toward zero — report shows 0 cost clearly, not a null or blank.
- [ ] **Negative quantity adjustment.** Posting a negative adjustment that would drive onHand below zero is blocked (or triggers the negative-stock warning). Report never shows negative onHand.
- [ ] **Duplicate GRN.** Receiving the same PO line twice in rapid succession (double-click, two browser tabs). Second post is idempotent or rejected with a clear error — valuation does not double-count the receipt.
- [ ] **Very large quantity / cost.** Entering qty = 999,999 and cost = 999.999 KWD does not overflow display or database; 3dp precision is preserved.
- [ ] **Wrong precision input.** Entering a cost with 4 decimal places (e.g. 1.2345 KWD); system rounds or rejects at input — report never stores more precision than the tenant currency allows.
- [ ] **As-of date in locked period.** Report still renders historical values correctly; it is read-only, so no write is attempted.
- [ ] **Stale report after a movement.** After posting a new GRN, refreshing the report (same as-of = today) reflects the new movement. No aggressive caching that hides recent changes.
- [ ] **RTL rendering.** In Arabic locale, all numeric columns (onHand, averageCost, totalValue) are still left-to-right numerals; currency symbol position follows the tenant locale convention; column headers render correctly in Arabic.
- [ ] **Currency display.** Report never shows "USD" or "SAR" for a KWD tenant; currency symbol and precision come from the tenant functional currency, not a hardcoded default.
- [ ] **Empty item name / missing SKU.** If an item has no secondary-language name, the secondary name column is blank — not "undefined" or a crash.

---

## 4. Cross-module / integration

- [ ] **GL tie-out.** Open the Balance Sheet (or Chart of Accounts detail for the Merchandise Inventory account) to the same as-of date; the balance must equal the valuation report total. Any mismatch is CRITICAL.
- [ ] **COGS tie-out.** Σ(cost of all issued/sold units in a period) must equal the COGS line on the P&L for that period. Spot-check one item manually.
- [ ] **Stock ledger drill-down.** Each valuation row links (or can navigate) to the stock ledger for that item; ledger movements account for the current onHand and averageCost shown.
- [ ] **Landed cost module.** After a landed cost is posted and allocated, re-run the valuation report; the affected items' averageCost increases; the GL Inventory account balance increases by the same amount.
- [ ] **GRN / purchase receipt.** Posting a new GRN (Purchase module) immediately updates the valuation report on next load; no manual refresh step required.
- [ ] **Opening stock import.** After the inventory template import (asala dataset), the valuation report total equals the known opening balance value; every item appears with the correct onHand and cost from the import.

---

## 5. Known gaps (from recon — verify or track)

- **No real-time streaming.** The report is a point-in-time snapshot; there is no live-update / SSE push when stock changes during a session. Severity: LOW (acceptable for a report; document expected behavior).
- **FIFO layer rebuild on return.** Behavior when a customer return is added back into FIFO layers (new layer vs. reinstate original layer) is not specified in the current engine docs. Verify empirically; if reinstate-original is not implemented, flag as MEDIUM — cost distortion risk.
- **Specific-ID costing UI.** The valuation report UI may not surface per-serial cost breakdown in the current build. If clicking a specific-ID item does not show serial-level detail, flag as MEDIUM.
- **Landed cost partial allocation rounding.** When landed cost is split across many items by weight/value, rounding remainders may not be assigned to a single item (penny problem). Verify that report total + GL balance still agree after a multi-item landed cost post. Severity: HIGH if mismatch found.
- **AI EOQ / reorder integration.** Valuation data is not yet surfaced to the AI engine for EOQ suggestions. Not a bug; noted for future wiring.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset (asala baseline + at least one GRN + one sale).
- [ ] GL tie-out confirmed at least once (valuation report total = Merchandise Inventory control account balance).
- [ ] WAC formula verified manually for at least one item.
- [ ] FIFO layer reconciliation verified for at least one item.
- [ ] Report renders correctly in both English (LTR) and Arabic (RTL) locales.
- [ ] Findings logged in `_findings.md`.
