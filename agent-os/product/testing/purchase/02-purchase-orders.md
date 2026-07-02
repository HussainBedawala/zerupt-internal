# Purchase — Purchase Orders Testing Checklist

> Persona: **purchasing clerk / shop owner** (Kuwait, KWD 3dp fils, no VAT). This owner mostly places orders **verbally / by phone** and records the bill on arrival via direct-purchase (03) — the formal PO screen is exercised for completeness, not daily reality. Test every item as that person. Verify the *invariant*, not just that the button works. At every screen ask: **"what's the dumbest thing a purchasing clerk could do here?"**

- **Route(s):** `/purchase/orders`, `/purchase/orders/new`, `/purchase/orders/[id]`
- **Feature dir:** `apps/web/src/features/purchase/`
- **API:** `tenant/purchase/orders` — create, add/update/remove line, confirm, cancel, close, get, list. Service `PurchaseOrdersService` (`erp/apps/api/src/purchase/orders/purchase-orders.service.ts`).
- **Depends on:** 01-suppliers (active supplier required), items/catalog, warehouses.

---

## 0. Preconditions

- [ ] At least one active supplier and one active item exist.
- [ ] Logged in as a user with PO create/confirm permission; separately confirm a user without it cannot reach `/purchase/orders/new` (server-side).
- [ ] Know whether the tenant has a `poApprovalThreshold` configured (`tenant_identity.poApprovalThreshold`) — if set, confirming a PO above it requires a second approver's PIN.
- [ ] Fiscal period open.

---

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

### PO list

- [ ] **List loads** — shows only user-facing manual POs (`sourceType = manual`); hidden direct-purchase anchor POs (`sourceType = direct_purchase`, `DP-` placeholder numbers) never appear here.
  - [ ] Empty state clear; pagination stable.
- [ ] **Filter** by supplier, status, date range; reset restores full list.

### Create PO (draft)

- [ ] **Supplier picker** is a searchable picker (not free text); only active suppliers selectable — picking an inactive/blocked supplier is rejected server-side even if the client somehow submits one.
- [ ] Creating a PO assigns a placeholder `DRAFT-<uuid>` number (not yet the gapless `PO-` sequence number) — confirm this placeholder is never shown to the user as "the PO number" in a confusing way.
- [ ] **Add line** — item picker is searchable (name/barcode), not free text.
  - [ ] Line pulls `unitPrice` from the item's cost price by default; clerk can override.
  - [ ] Item with no tax group configured and no `taxGroupId` supplied on the line is rejected with a clear message (not a silent zero-tax line) — no VAT tenant should still see this validated cleanly since VAT rate is just 0%, not "no tax group."
  - [ ] Pack-unit entry: quantity can be entered in a pack unit (e.g. box of 12); the stored `orderedQty` is the correct BASE-unit quantity (`unitQty × conversionFactor`).
  - [ ] Warehouse picker restricted to this tenant's active warehouses.
- [ ] **Update line** (draft only) — changing qty, pack unit, price, or discount recomputes line + header totals; the pack-unit snapshot (`unitName`/`unitQty`/`conversionFactor`) stays internally consistent with `orderedQty` after every edit (never a stale snapshot).
- [ ] **Remove line** — recomputes totals; removing the last line leaves the PO in a valid empty-draft state (not a crash), and confirming a PO with zero positive-qty lines is blocked.
- [ ] **Edit-only-in-draft immutability:** any add/update/remove-line call against a confirmed, received, closed, or cancelled PO is rejected with a clear 409 ("Only a draft purchase order can be modified") — verify via direct API call against a non-draft PO, not just hidden UI buttons.
- [ ] Concurrent edits: two tabs editing the same draft PO's lines — the row-level lock (`lockDraftOrder`, `SELECT ... FOR UPDATE`) serialises them; no lost update.

### Confirm (Draft → Confirmed)

- [ ] Confirming a draft with zero lines (or all-zero-qty lines) is rejected with a clear message.
- [ ] On confirm: a **gapless `PO-` number** is reserved and assigned (replacing the `DRAFT-` placeholder); totals are re-frozen as of the order date.
- [ ] **Approval threshold gate:** if `poApprovalThreshold` is configured and the PO total exceeds it, confirming without `approvedBy` + `approvalPin` is rejected (422); confirming with a valid different-manager PIN succeeds. Confirm the approver must differ from the confirming user (segregation of duties) if that's the configured behavior.
- [ ] Confirming an already-confirmed (or non-draft) PO is rejected (409) — no double-confirm.
- [ ] Confirming for a supplier that has since been blocked/deactivated is rejected server-side, even if the draft was created while the supplier was active.
- [ ] **No GL/stock impact on confirm** — a confirmed PO does not create any journal entry or stock ledger row; it is purely a commitment. Verify by checking the GL and stock ledger before/after confirm — nothing changes.
- [ ] Success/error/loading states on confirm: button debounced (no double-submit creating two gapless numbers); error leaves the PO in draft with data intact.

### Cancel

- [ ] **Draft PO** can be cancelled directly.
- [ ] **Confirmed PO with zero GRNs** can be cancelled (status → `cancelled`).
- [ ] **Confirmed PO with one or more GRNs** cannot be cancelled — rejected with a clear message ("has one or more goods receipt notes"); the correct path is to void the GRN(s) first (see 04-grn-receipt), not cancel the PO out from under received stock.
- [ ] Cancelling a received/closed/already-cancelled PO is rejected (409).
- [ ] Cancel is race-safe: the PO row is locked before the GRN count check and the status update (no TOCTOU window where a GRN is inserted between the count and the cancel).

### Close

- [ ] Close is allowed from `confirmed` (short-close: order will never be fully received) or `received` (normal close after receiving).
- [ ] Closing a draft or already-cancelled/closed PO is rejected.
- [ ] Closed PO is immutable — no further lines, receipts, or edits.

### Receive-against-PO handoff

- [ ] From a confirmed PO's detail page, "Receive" navigates into GRN creation pre-populated with this PO's lines (see 04-grn-receipt for full GRN behavior); smoke-test the handoff link/button works and passes the correct `purchaseOrderId`.
- [ ] **Over-receipt:** attempting to receive more than the ordered qty on a line is either blocked or requires explicit confirmation (verify which — over-receipt should never be silent).
- [ ] **Under-receipt / partial receipt:** PO status moves to a partially-received state (or stays `confirmed` with partial `receivedQty` tracked per line) and can still be received against again until fully received or closed.
- [ ] Fully receiving all lines transitions PO status to `received`.

---

## 2. Domain invariants

> Cross-cutting invariants are in `README.md`. Submodule-specific invariants below.

- [ ] **PO has zero GL and zero stock impact until GRN receipt.** It is a commitment only. This must hold at every status except after a linked GRN posts.
- [ ] **`PO-` numbers are gapless and unique per tenant** — assigned only on confirm, never reused, and released back to the sequence if the confirming transaction fails (verify via `docNumbering` reservation release on error).
- [ ] **Pack-unit snapshot invariant:** `orderedQty` (base units) always equals `unitQty × conversionFactor` for every line, on create AND after every update — never a stale snapshot from before a pack-unit change.
- [ ] **Draft immutability boundary:** only a `draft` PO can have its lines added/updated/removed; every other status is read-only for lines.
- [ ] **Cancel-with-GRN guard:** a confirmed PO with ≥1 GRN can never be cancelled directly (only the GRN can be voided, which is a separate reversible action — see 04).
- [ ] **Approval threshold is a hard server-side gate**, not a client-side warning — confirm this by calling the confirm endpoint directly above the threshold without a PIN and confirming it is rejected.

---

## 3. Edge cases & defensive UX — "the dumbest thing a purchasing clerk could do here"

- [ ] **Clerk tries to edit a line on a PO that another tab just confirmed.** Rejected with a clear "only draft can be modified" message, not a silent no-op or crash.
- [ ] **Clerk double-clicks Confirm.** Only one gapless `PO-` number is issued; the second click either no-ops cleanly or shows "already confirmed."
- [ ] **Clerk enters a negative or zero quantity on a line.** Rejected client- and server-side; a PO cannot be confirmed with only zero-qty lines.
- [ ] **Clerk tries to cancel a confirmed PO that already has a GRN.** Blocked with a message pointing at the real fix (void the GRN).
- [ ] **Clerk tries to receive more than was ordered** (e.g. ordered 10, tries to receive 50). Confirm the system's stance (block vs. warn-and-confirm) — must never silently accept.
- [ ] **Clerk leaves a draft PO half-filled and navigates away.** No destructive auto-discard; draft persists and is resumable from the list.
- [ ] **Clerk confirms a PO for a supplier that got blocked five minutes ago.** Rejected server-side at confirm time, not just filtered out of the picker at create time.
- [ ] **RTL/Arabic:** supplier name, item names, and notes render correctly in RTL; PO numbers and amounts stay LTR with correct KWD 3dp grouping.
- [ ] **No-VAT tenant:** tax fields on every line show zero/blank cleanly — never a stray non-zero VAT line appearing from a stale tax group default.

---

## 4. Cross-module / integration

- [ ] Confirming a PO emits `purchase.order.confirmed` via the transactional outbox (crash-durable); verify the event lands even if the fast-path emit fails (poller re-fans it out with the same `eventId`, no duplicate side effects on replay).
- [ ] Cancelling a confirmed PO emits `purchase.order.cancelled`, which should decrease any "on-order" quantity shown in inventory reports for the cancelled lines.
- [ ] GRN creation against a PO correctly locks/reads `purchaseOrderLines` (`purchase_order_line_id` FK) — drill-down from a GRN line back to its PO line resolves.
- [ ] Direct-purchase's hidden anchor PO (`sourceType = direct_purchase`) must NEVER surface here or emit `purchase.order.confirmed` (its onOrder-quantity semantics differ) — spot-check the PO list truly excludes it.

---

## 5. Known gaps (from recon — verify or track)

- **Over-receipt behavior not confirmed in this pass** (MEDIUM): verify in `04-grn-receipt.md` whether receiving more than `orderedQty` on a PO line is hard-blocked or soft-warned; this doc assumes it must never be silent.
- **Short-close semantics** (LOW): closing a `confirmed` PO with partially-received lines leaves the unreceived remainder permanently unfulfillable — confirm the UI communicates this is a deliberate "we're not getting the rest" decision, not a bug.
- **Approval threshold approver identity check** (MEDIUM): confirm whether `approvedBy` is validated to be a DIFFERENT user than the confirming actor (true segregation of duties) or merely a named approver who could be the same person typing their own PIN.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Confirmed a PO has zero GL/stock impact until GRN receipt (spot-checked against the ledger).
- [ ] Findings logged in `_findings.md`.
