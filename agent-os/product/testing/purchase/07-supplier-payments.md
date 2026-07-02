# Purchase — Supplier Payments Testing Checklist

> Persona: **Purchasing clerk / shop owner.** You pay suppliers by cash or bank transfer and you will lose sleep if the system lets you pay the same bill twice, pay more than you owe, or "loses" a payment when you reverse it. Ask at every step: **"what's the dumbest thing a clerk could do here?"** (double-click pay, pay a bill that was already settled, allocate more than the bill balance, reverse the wrong payment).

- **Route(s):** `/purchase/payments`, `/purchase/payments/new`, `/purchase/payments/[id]`
- **Feature dir:** `apps/web/src/features/purchase/components/payments-list-panel.tsx` (+ payment create/detail panels)
- **API:** `tenant/purchase/payments`
- **Depends on:** 05-purchase-invoices (bills must exist and be confirmed), 01-suppliers

---

## 0. Preconditions

- [ ] Dataset has at least: one fully unpaid confirmed bill, one partially paid bill, one fully paid bill, and two open bills for the same supplier (to test multi-bill allocation).
- [ ] Know each supplier's current 2111 (AP) GL balance before starting, so it can be re-checked after every action.
- [ ] Logged in as a user whose role can record and post supplier payments; separately confirm a user without the permission cannot reach `/purchase/payments/new`.
- [ ] Current fiscal period is open (or note if testing a locked-period scenario).

---

## 1. Functional — actions & states

- [ ] **Record a payment against a single bill** — enter amount, select cash or bank account, confirm; the bill's balance decreases by the allocated amount; the payment appears in the list with status posted.
  - [ ] Loading state shown while posting (submit button debounced, no double-submit).
  - [ ] Error state on failure is user-friendly and does not lose entered allocations.
  - [ ] Empty state on `/purchase/payments` with no payments yet is clear, not a blank table.
- [ ] **Multi-bill allocation** — one payment splits across two or more open bills of the same supplier; each bill's balance reduces by its own allocated share; the payment total equals the sum of allocations.
- [ ] **Cash vs bank account picker** — selecting Cash posts against the cash account; selecting the NBK bank account posts against that bank account; the GL credit leg matches the picked account, not a hardcoded default.
- [ ] **Early-payment discount (if enabled)** — a discount amount is entered alongside allocations; the bill balance reduces by allocation + discount share; discount cannot exceed the combined outstanding balance.
- [ ] **Advance / unallocated payment** — a payment can be recorded with no allocations at creation (parked as a supplier prepayment); it is applied to a bill later; the un-applied advance shows correctly in the supplier's balance.
- [ ] Filters (supplier, date range, status) return correct subsets; reset works.
- [ ] Payment detail page shows allocations, source bill links, GL journal link, and reversal status.
- [ ] Payment list / detail export (if present) matches on-screen data.

---

## 2. Domain invariants

### AP / GL posting
- [ ] **GL on post:** Dr Accounts Payable (2111, party-tagged for the supplier), Cr Cash or Bank for the account picked. Journal is balanced.
- [ ] **Allocations reduce the specific open bill(s)**, not a generic supplier total — verify each allocated bill's `balance` decreased by exactly the allocated amount (+ discount share if applicable).
- [ ] **Reconcile invariant holds after every payment:** Σ open bill balances for the supplier = supplier's 2111 balance; Σ all suppliers = total 2111 GL balance.

### The "pay twice" guard (CRITICAL)
- [ ] **A bill can never be over-allocated:** attempting to allocate more than the bill's current open balance is rejected (422), not silently clamped.
- [ ] **A fully paid bill cannot receive another payment** — it does not appear as selectable in the bill picker for a new payment, or the attempt is rejected server-side.
- [ ] **Open balance floors at zero**, never goes negative, even under concurrent/rapid submissions.
- [ ] **Rapid double-submit / double-click "Pay"** creates exactly one payment and one allocation set — not two. Verify by checking the payments list count and the bill balance after a deliberate double-click.
- [ ] **Re-checked under lock at post time** — even if the bill balance changed between when the payment form loaded and when it was submitted (e.g. another session paid it first), the server re-validates against the current balance, not a stale client-side figure.

### Payment reversal
- [ ] **Reverse restores the bill's exact balance** — the allocated amount (+ discount share, if any) is added back to the bill's open balance; the bill returns to its pre-payment state.
- [ ] **Reversal is idempotent** — reversing an already-reversed payment is a safe no-op (or a clear "already reversed" message), never a double-reversal that inflates the bill balance.
- [ ] **Reversal posts a contra JE** — Dr Cash/Bank, Cr Accounts Payable (2111, party-tagged), mirroring the original posting exactly.
- [ ] **Reversal is period-gated** — cannot reverse into a hard-locked period; soft-locked period requires an override reason.
- [ ] **An advance that has already been applied to bills cannot be reversed directly** — the applications must be reversed first; the error message says so clearly.
- [ ] **Reconcile invariant holds after reversal** — Σ open bill balances and 2111 balance both return to their pre-payment state.
- [ ] **PIN / approval (if manager-approval mode is on for this tenant)** — reversal requires the same approval gate as posting; PIN is never persisted in cleartext.

### Currency & precision
- [ ] All amounts display in KWD at 3 decimal places (fils); no hardcoded 2dp.
- [ ] FX fail-loud: since Asala is KWD-only, no foreign-currency supplier exists in this dataset; confirm a rate ≠ 1 would be rejected if such a supplier existed (code-level check, not exercised live).

---

## 3. Edge cases & defensive UX

- [ ] **Zero-amount payment** — rejected client + server side, not silently accepted.
- [ ] **Negative allocation** — rejected.
- [ ] **Allocation exactly equal to bill balance** — accepted; bill balance becomes exactly zero, not a residual fraction from rounding.
- [ ] **Paying a bill that another session voided/reversed in the meantime** — clear conflict error, not a crash or silent no-op.
- [ ] **Reversing a payment into a period that has since been closed** — blocked with a clear message.
- [ ] **Very large payment amount** — no overflow, displays correctly, GL posts correctly.
- [ ] **Client + server validation both reject** an over-allocation attempt (don't trust a bypassed client check).
- [ ] **RTL (Arabic)** — payment form, supplier picker, and amounts render correctly; numbers stay LTR within RTL layout per currency convention.

---

## 4. Cross-module / integration

- [ ] **Payment posts to GL** — the payment's journal entry appears in `/accounting/general-ledger` filtered to 2111 and the cash/bank account, with the correct source-document link back to the payment.
- [ ] **Bill detail reflects the payment** — opening the paid bill from `/purchase/invoices/[id]` shows the payment in its allocation history with a working link back to the payment.
- [ ] **AP aging reflects the payment immediately** — after posting, the supplier's row in `/purchase` overview AP aging decreases by the allocated amount.
- [ ] **Drill-down from GL journal entry to the payment record** resolves correctly.

---

## 5. Known gaps (from recon — verify or track)

- **Reversing an already-applied advance is deferred** — the service explicitly blocks reversing an advance once it has been applied to bills; the user must reverse the applications first. Confirm the UI surfaces this clearly rather than a raw 422. **MEDIUM**.
- **No FIFO auto-allocation on payment** — the clerk must manually pick which bill(s) to allocate to; there is no "pay oldest first" one-click option. Acceptable for this persona (2 suppliers, low bill volume) but worth tracking as a UX gap. **LOW**.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
