# Purchase — Direct Purchase (Express Path) Testing Checklist

> Persona: **purchasing clerk / shop owner** (Kuwait, KWD 3dp fils, no VAT). This is the **primary daily flow**: goods arrive, the clerk records a bill on one screen, and either pays on the spot or puts it on the supplier's account. Test every item as that person. Verify the *invariant*, not just that the button works. At every screen ask: **"what's the dumbest thing a purchasing clerk could do here?"**

- **Route(s):** `/purchase/direct`, `/purchase/direct/new`
- **Feature dir:** `apps/web/src/features/purchase/components/direct/` (`direct-purchase-panel.tsx`)
- **API:** `POST tenant/purchase/direct-purchases`. Controller `DirectPurchaseController` (`erp/apps/api/src/purchase/direct/direct-purchase.controller.ts`), service `DirectPurchaseService` (`erp/apps/api/src/purchase/direct/direct-purchase.service.ts`).
- **Depends on:** 01-suppliers (active supplier), items/catalog, warehouses, GL account mappings (Inventory, GRN Accrual `2121`, Accounts Payable `2111`, input VAT).

---

## 0. Preconditions

- [ ] At least one active supplier and one active item exist; at least one active warehouse exists for the branch.
- [ ] Logged in as a user holding **all** of: `purchase.grn.confirm`, `purchase.bill.create`, and (if testing "paid on the spot") `purchase.payment.post` — the direct-purchase orchestrator internally performs all three and enforces every one at runtime, not just the route-level `purchase.bill.create` guard. Separately confirm a user missing any ONE of these is rejected (403), even if they hold the others.
- [ ] Know whether `poApprovalThreshold` is configured for this tenant.
- [ ] Fiscal period open.

---

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

### One-screen "goods arrived, record bill"

- [ ] **Supplier picker** — searchable, active suppliers only; picking a blocked/inactive supplier is rejected server-side.
- [ ] **Line entry** — item picker (searchable), quantity (supports pack units — entering "1 box of 12" resolves to the correct base-unit `orderedQty`), unit cost, warehouse (defaults to the branch's default active warehouse if not chosen; a branch with zero active warehouses is rejected with a clear message, not a crash).
  - [ ] Item with no tax group and no line-level override is rejected with a clear message.
- [ ] **No-VAT tenant:** input VAT / tax fields are blank or show 0.000 for every line — never a stray non-zero tax amount from a stale default tax group.
- [ ] **Settlement choice:** clerk picks **paid** (cash/bank on the spot, with payment method + optional bank account) or **on account / credit** (optional due date). This choice is required before submit — no ambiguous default.
- [ ] **Supplier invoice number / notes** — optional fields, both saved and shown on the resulting bill.
- [ ] **Submit** — one button, one atomic save:
  - [ ] Loading: button disabled/debounced while the full receipt→bill→(payment) chain posts; no partial-looking UI state.
  - [ ] Success: shows the resulting GRN number, bill number, totals, and (if paid) payment reference; success toast.
  - [ ] Error (e.g. a mid-chain failure): the WHOLE thing rolls back — no orphaned GRN, bill, stock, or AP row left half-posted. Confirm by checking the GRN/bill/stock ledger/GL after a forced failure — nothing should exist.
  - [ ] **Idempotent replay:** re-submitting with the same `idempotencyKey` (e.g. a retried request after a network blip) returns the SAME result (200, `replayed: true`) with NO new posting — never a duplicate GRN/bill/payment. Simulate by double-submitting rapidly or replaying the exact request.
- [ ] **Approval threshold gate:** if the bill total exceeds `poApprovalThreshold`, submit without `approvedBy`/`approvalPin` is rejected (422) with a clear message; submitting with a valid different-manager PIN succeeds. The gate fires on the bill total (post-tax), at parity with the PO-confirm gate.

### Payment-on-the-spot vs on-account

- [ ] **Paid:** a full standard payment is created and posted, allocated entirely to the new bill's balance; bill status ends as fully settled; `directPurchases.status = 'paid'`.
- [ ] **On account (credit):** no payment is created; the bill remains open with the full balance owed; `directPurchases.status = 'credit'`; optional due date is stored and reflected in AP aging.
- [ ] Cash payment method vs bank transfer (with `bankAccountId`) both work; bank account picker only shows this tenant's accounts.

### Void / reverse the whole thing

- [ ] A posted direct purchase can be reversed cleanly: the linked bill can be voided (see 05-purchase-invoices), which cascades correctly — GR/IR-cleared and AP are contra'd, and if a payment was made, that payment must be reversed FIRST before the bill can void (verify the correct order is enforced, not silently skipped).
- [ ] Reversal is a true net-zero contra — original documents (GRN, bill, payment) are never deleted or edited; new mirrored reversal documents are created (see 04/05/07 for the specific reversal mechanics this composes).
- [ ] Reversing an already-reversed direct purchase's bill is a safe no-op (idempotent), not a double-reversal.

---

## 2. Domain invariants

> Cross-cutting invariants are in `README.md`. Submodule-specific invariants below.

- [ ] **One balanced posting, receives stock AND raises AP:** the composed chain (hidden confirmed PO → draft GRN → confirm GRN [Dr Inventory / Cr GRN Accrual `2121`] → bill-from-GRN [Dr `2121` + Dr input VAT, Cr AP `2111` party-tagged] → confirm bill) nets to the SAME economic journal as a manual PO→GRN→bill chain for the same goods at the same cost. Verify by comparing the GL entries of a direct purchase against an equivalent manual PO→GRN→bill for the same item/qty/cost — **dual-path equivalence must hold exactly**, not just approximately.
- [ ] **Stock ledger entry at cost + WAC recompute:** the GRN confirm step inside the chain writes a stock ledger entry at the line's `unitCost`; the item's average cost (WAC) recomputes correctly against the pre-existing on-hand and cost.
- [ ] **AP raised is party-tagged to the correct supplier** and immediately reflected in that supplier's `2111`-derived outstanding balance (01-suppliers reconcile invariant).
- [ ] **FX fixed at 1 for direct purchase**, always — the document currency is always the legal entity's functional currency; a client-supplied exchange rate is never trusted or threaded through (`FUNCTIONAL_EXCHANGE_RATE = "1"` hardcoded in the service, not read from the request). For this KWD-only tenant, this should never even be an observable behavior, but confirm no stray currency/rate field is exposed in the UI that could suggest otherwise.
- [ ] **Whole-chain atomicity:** the hidden PO, GRN, GRN lines, GRN confirm posting, bill, bill confirm posting, and (if paid) payment + payment post ALL commit in a single database transaction. A failure at any step (e.g. approval-threshold rejection) rolls back everything — verify no orphaned hidden PO or draft GRN survives a failed/rejected direct purchase.
- [ ] **Approval-threshold check happens INSIDE the transaction**, before any commit — per the code's explicit invariant (`DOC-1` comment in `direct-purchase.service.ts`), so a rejected approval never leaves partial stock/AP/cash committed.
- [ ] **Idempotency key is unique per tenant** and is the durable replay identity — a retried request with the same key never re-posts.
- [ ] **Hidden anchor PO never inflates on-order quantity:** the internal `sourceType = direct_purchase` PO does not emit `purchase.order.confirmed`, so inventory's "on order" figure is not double-counted with the receipt that happens in the same breath.

---

## 3. Edge cases & defensive UX — "the dumbest thing a purchasing clerk could do here"

- [ ] **Clerk double-clicks Submit** (or the network retries automatically). Idempotency key guarantees only ONE GRN/bill/payment set is created; the second response is the replayed result, not a duplicate.
- [ ] **Clerk submits with zero lines.** Rejected with a clear message, not a 500 or an empty bill.
- [ ] **Clerk enters cost = 0 on a line.** Confirm the system's stance — a zero-cost receipt would corrupt WAC; verify it's blocked or requires explicit confirmation, never silently accepted.
- [ ] **Clerk enters a negative quantity or cost.** Rejected client- and server-side.
- [ ] **Clerk picks "paid" but the payment fails mid-chain** (e.g. invalid bank account). The ENTIRE direct purchase rolls back — no bill, no stock movement, no AP — not a bill left open because "only the payment part failed."
- [ ] **Clerk's purchase total crosses the approval threshold** but they don't have a second manager's PIN handy. Submit is rejected cleanly with a message telling them what's needed — not a confusing generic error, and definitely not a silent partial post.
- [ ] **Clerk tries to void a paid direct purchase's bill without first reversing the payment.** Blocked with a clear message pointing at the correct order of operations.
- [ ] **Clerk enters a quantity in a pack unit that doesn't evenly divide** (e.g. weird fractional pack qty). Server-side pack-unit resolution validates and rejects nonsensical conversions.
- [ ] **RTL/Arabic:** supplier name, item names, notes render correctly in RTL; amounts, quantities, and the resulting GRN/bill/payment numbers stay LTR with correct KWD 3dp grouping.
- [ ] **No-VAT tenant sanity check:** submit a direct purchase and confirm the resulting bill shows `taxTotal = 0.000` exactly — not a rounding artifact, not blank-but-nonzero underneath.
- [ ] **Missing default warehouse:** a branch with no active warehouses configured yields a clear "no active warehouse" error at submit, not a silent fallback to a wrong/deleted warehouse.

---

## 4. Cross-module / integration

- [ ] **GL:** the confirmed bill's journal entry is visible in the accounting module; Dr Inventory / Dr input VAT (blank for this tenant) / Cr `2111` (party-tagged) nets correctly; drill-down from the journal entry resolves to the bill, and from the bill back to the GRN and hidden PO.
- [ ] **Stock:** `/inventory/stock` reflects the increased on-hand immediately after a posted direct purchase; the stock ledger entry's `source_document_type`/`source_document_id` resolves to the GRN.
- [ ] **AP aging (09):** an on-account direct purchase immediately appears in the supplier's aging bucket with the correct due date.
- [ ] **Supplier detail (01):** outstanding balance updates immediately to include the new bill (if on account) or stays unchanged net (if paid same-day).
- [ ] **Dual-path equivalence with 02+04+05:** run the SAME economic purchase once via direct-purchase and once via the manual PO→GRN→bill chain (different items/dates to avoid confusion) and confirm the resulting GL postings and stock valuation are structurally identical.
- [ ] Failed auto-postings (if any sub-step's downstream listener fails) land in the dead-letter queue — nothing silently dropped; verify against `10-cross-module-contracts.md`.

---

## 5. Known gaps (from recon — verify or track)

- **Zero-cost line guard not confirmed in this pass** (HIGH): verify server-side that a direct-purchase line with `unitCost = 0` is rejected (or at minimum flagged), mirroring the inventory-adjustments zero-cost guard — a silent zero-cost receipt would corrupt WAC for all future sales of that item.
- **Approver-identity check for the approval threshold** (MEDIUM): same open question as 02-purchase-orders — confirm `approvedBy` must be a genuinely different user than the submitting clerk (true SoD), not self-approval with one's own PIN.
- **Void-before-payment-reversal ordering** (MEDIUM): confirm the bill-void endpoint actively rejects voiding a bill with an active payment allocated to it (rather than relying on UI ordering alone) — test by calling the void endpoint directly on a paid direct-purchase bill without reversing the payment first.
- **Over-approval-threshold + "paid" settlement interaction** (LOW): confirm the payment step correctly waits for/respects a rejected approval — i.e. no window where the payment permission check passes but the approval-PIN check hasn't yet run, given both happen inside the same transaction per the code comments.

---

## Sign-off — ✅ SIGNED OFF 2026-07-02

- [x] All CRITICAL/HIGH items pass for the loaded dataset. Zero-cost WAC guard shipped (#10, `a4b9d4c7`).
- [x] Dual-path equivalence verified: a direct purchase and an equivalent PO→GRN→bill post identical GL + stock outcomes (founder-verified live; baseline tied out — 2111 = 3,524.500, 2121 = 0.000, supplier balances correct).
- [x] Idempotent replay verified (code + live): re-submitting the same request never double-posts.
- [x] Findings logged in `_findings.md` — all FIXED (#10, #17–20 + the testing-round fixes committed `9427be05`, `ddc89f58`, `8a9be57e`).

> **Founder-verified live on Al-Asala (KWD). Closed out.** UX polish that surfaced during dual-path testing (bill/PO currency precision, GRN column/toast/alignment, direct-purchases list) shipped in the same session and applies module-wide.
>
> **Follow-up (2026-07-02, post-sign-off):** finding #18 (consistent searchable picker) grew into a full app-wide consolidation — every hand-rolled entity picker (all 18 sites across purchase/sales/invoices/inventory/journal/legal-entities) now runs on shared primitives (`searchable-combobox`, `async-combobox`, `multi-select-list`) + thin per-entity wrappers. Dead code deleted; typecheck/i18n/tests/build green; pushed to main.
