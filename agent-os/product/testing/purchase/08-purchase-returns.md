# Purchase — Returns / Debit Notes Testing Checklist

> Persona: **Purchasing clerk / shop owner.** Bad or wrong stock arrives sometimes; you send it back to the supplier and expect the system to reduce both the stock on your shelf and what you owe (or are owed back). You will notice immediately if a return quietly leaves stock or AP wrong.

- **Route(s):** `/purchase/returns`, `/purchase/returns/new`, `/purchase/returns/[id]`
- **Feature dir:** `apps/web/src/features/purchase/components/returns/`
- **API:** `tenant/purchase/returns`
- **Depends on:** 04-grn-receipt or 05-purchase-invoices (a confirmed GRN or bill line must exist to return against), 01-suppliers

---

## 0. Preconditions

- [ ] Dataset has at least: one fully received/billed line eligible for return, one line already partially returned, and one bill with an outstanding (unpaid) balance and one bill that is fully paid.
- [ ] Know the item's on-hand stock quantity and WAC before the return.
- [ ] Know the linked bill's current balance and the supplier's 2111 GL balance before starting.
- [ ] Logged in as a user whose role can create and confirm purchase returns.
- [ ] Current fiscal period is open.

---

## 1. Functional — actions & states

- [ ] **Create a return against a confirmed GRN or bill line** — pick the source line, enter return quantity (≤ received/billed quantity), confirm; return status moves to confirmed.
  - [ ] Loading state shown during confirm (button debounced, no double-submit).
  - [ ] Error state on failure is user-friendly and does not lose the entered lines.
  - [ ] Empty state on `/purchase/returns` with none yet is clear, not a blank table.
- [ ] **Only stock/item lines are returnable** — attempting to add an expense line to a return is rejected with a clear message.
- [ ] **Add / edit / remove lines on a draft return** before confirming; a confirmed return's lines cannot be edited.
- [ ] **Void a confirmed return** — reason required; stock and AP/bill balance are restored to their pre-return state.
- [ ] Filters (supplier, date range, status) return correct subsets; reset works.
- [ ] Return detail shows the source GRN/bill link, lines, GL journal link, and void status.

---

## 2. Domain invariants

### Stock
- [ ] **Stock is reduced at the original received/billed cost**, not current WAC — a stock ledger entry is created for the returned quantity at the original unit cost.
- [ ] **Stock ledger entry references the return document** and resolves back from `/inventory/stock-ledger`.
- [ ] **On-hand quantity decreases by exactly the returned quantity**; WAC of remaining stock recalculates correctly (unaffected items are untouched).

### GL posting
- [ ] **GL on confirm:** Cr Inventory (1141, at original cost) / Dr Accounts Payable (2111, party-tagged) for a matched (billed) line, or Dr GR/IR clearing (2121) for an accrual-only (received-not-billed) line — the AP-side debit reverses the SAME control account the original receipt/bill credited.
- [ ] **Journal is a net-zero contra to the original posting** — same accounts, opposite direction, same amount (or the exact remaining amount if a partial return).
- [ ] **Void reverses the exact confirm-time journal**, including any frozen tax breakdown, even if a tax rate changed since confirm (Asala has no VAT, so tax legs should always be blank/zero here — confirm they stay that way).

### Cannot over-return
- [ ] **Return quantity cannot exceed the received or billed quantity** for the source line, accounting for quantities already returned on prior return documents — rejected (422), not clamped.
- [ ] **Return quantity cannot exceed remaining serial-tracked units** for serialized items; a specific serial already returned cannot be returned again.

### Over-value return beyond unpaid balance (CRITICAL)
- [ ] **If the linked bill has already been paid (fully or partially), a return whose AP value would drive the bill's balance below its current (already-reduced) balance is REJECTED (422)** — not clamped. The reduction the return applies to the bill must exactly equal the DR 2111 leg posted, or the AP subledger and GL diverge.
- [ ] **The clerk must reverse the payment first, then return** — confirm the error message says this explicitly, not a generic failure.
- [ ] After reversing the payment and completing the return, the reconcile invariant holds again.

### Void (reversal)
- [ ] **Void is idempotent** — voiding an already-voided return is a safe no-op / clear "already voided" message, not a double-reversal.
- [ ] **Void re-receives the stock** (adds it back on-hand) and restores the linked bill's balance to its exact pre-return value.
- [ ] **Void un-applies the source PO's returnedQty** (if the return traces back to a PO) and restores serialized units to available.
- [ ] **Void is period-gated** — blocked in a hard-locked period; soft-locked requires an override reason.

### Reconcile invariant
- [ ] **After every confirm/void:** Σ open bill balances per supplier = supplier's 2111 balance; Σ all suppliers = total 2111 GL balance.

---

## 3. Edge cases & defensive UX

- [ ] **Zero-quantity return line** — rejected client + server side.
- [ ] **Return quantity exactly equal to remaining returnable quantity** — accepted; a second attempt to return more on the same line is rejected.
- [ ] **Concurrent return attempts on the same GRN/bill line from two sessions** — the second is blocked (row lock) or rejected with a clear conflict, not a silent over-return.
- [ ] **Voiding a return whose linked bill has since been fully paid off** (via a separate payment after the return) — confirm the void still restores balance correctly, no negative balance results.
- [ ] **Client + server validation both reject** an over-return or over-value-return attempt.
- [ ] **RTL (Arabic)** — return form, item picker, and reason text render correctly.

---

## 4. Cross-module / integration

- [ ] **Return posts to GL** — the confirm and void journal entries appear in `/accounting/general-ledger` filtered to 1141/2111/2121, with correct source-document links.
- [ ] **Return reduces the linked bill's balance** — verify from `/purchase/invoices/[id]`, the bill shows the return in its history.
- [ ] **Stock ledger reflects the return** — verify from `/inventory/stock-ledger` or item detail, on-hand quantity matches.
- [ ] **AP aging reflects the return immediately** in `/purchase` overview.
- [ ] **Drill-down from GL entry / stock ledger entry back to the return record** resolves correctly.

---

## 5. Known gaps (from recon — verify or track)

- **No credit-note / refund-receivable path when a return exceeds the unpaid balance and the supplier owes the shop money back** — the current design requires reversing the payment first; there is no standalone "supplier owes us" receivable flow. Confirm this is acceptable for Al-Asala's low-volume workflow or log as a gap. **MEDIUM**.
- **Confirm the void re-receive of serialized units correctly excludes units the supplier already scrapped/kept** — recon-only, verify live with a serial-tracked item if the dataset has one. **LOW** (Asala persona may not stock serialized auto parts; note N/A if so).

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
