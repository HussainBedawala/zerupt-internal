# Sales — Payments Received / Collections Testing Checklist

> Persona: **a shopkeeper collecting what a trade customer owes.** A payment received takes money in and settles open invoices. Labeled **"Payments Received"** (mirror of purchase "Payments"; the doc is a receipt voucher).

- **Routes:** `/sales/payments`, `/sales/payments/[id]`; API `tenant/sales/receipt-vouchers` (create, list, allocate).
- **Feature dir:** `apps/web/src/features/sales/` (payments components), API `sales/receipts/`.
- **API:** `POST /create`, `GET /list`, `PATCH /allocate`.
- **Depends on:** 04 invoices (open balances to collect against).

## 0. Preconditions
- [ ] At least one confirmed, unpaid credit invoice exists (e.g. a credit sale to C-001).
- [ ] Logged in with `sales.receipt.create` + `.post`; confirm the guard is server-side.
- [ ] Period open.

## 1. Functional — actions & states
- [ ] **Record a receipt** against an open invoice — cash/bank/KNET; success feedback; invoice open balance drops.
- [ ] **Partial receipt** — invoice remains partially open by the exact remainder.
- [ ] **Allocate** a receipt across multiple open invoices for the same customer.
- [ ] **On-account / unallocated** receipt (money in, not yet applied) supported and visible as a credit.
- [ ] Loading/error/empty states; debounced submit.

## 2. Domain invariants
- [ ] **GL:** Dr Cash/Bank, Cr AR (1131, party-tagged). Customer 1131 balance falls by the receipt amount.
- [ ] **Reconcile invariant holds:** Σ open invoice balances per customer = customer 1131 balance, after every receipt/allocation.
- [ ] **Cannot over-collect:** total allocated to an invoice ≤ invoice total; open balance floors at 0, never negative. Excess goes on-account, never a negative invoice.
- [ ] **Receipt reversal** (if supported): net-zero contra, idempotent, restores the invoice open balance; reversing twice is a safe no-op.
- [ ] Receipt persists its balance/allocation so the reconcile figure is durable (the L5 hardening C1 fix — verify).

## 3. Edge cases & defensive UX
- [ ] Double-submit / rapid re-click = ONE receipt, not two (no phantom over-collection).
- [ ] Allocating more than the receipt amount, or to an already-settled invoice, rejected.
- [ ] Collecting against a voided invoice blocked with guidance.
- [ ] Zero/negative amount rejected client + server.
- [ ] Receipt into a closed period blocked server-side.
- [ ] KWD 3dp; currency not hardcoded.

## 4. Cross-module / integration
- [ ] Cash/bank account balance rises by the receipt; appears in GL + bank/cash reports.
- [ ] Customer ledger + AR aging reflect the collection immediately.
- [ ] Receipt links back to the invoice(s) it settled; drill-down resolves.

## 5. Known gaps
- Newly built screen (parity pass with purchase) — verify the list/detail wire correctly to the receipt-vouchers API and that recording a payment from here reconciles the same as one recorded inline on a direct sale.

## Sign-off
- [ ] All CRITICAL/HIGH pass. Findings logged.
