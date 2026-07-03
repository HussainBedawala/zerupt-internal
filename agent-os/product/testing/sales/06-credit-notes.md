# Sales — Returns / Credit Notes Testing Checklist

> Persona: **a shopkeeper taking back a wrong/faulty part and crediting the customer.** A credit note reverses a sale (fully or partially): reduces AR (or refunds cash), reverses revenue + output VAT, and **returns stock to inventory at the original realized cost.** No dedicated route — issued from the invoice detail.

- **Routes:** `/sales/credit-notes`, `/sales/credit-notes/new`, `/sales/credit-notes/[id]`; also issuable from `/sales/invoices/[id]`; API `tenant/sales/credit-notes` (create, list, confirm).
- **Feature dir:** `apps/web/src/features/` credit-notes components; API `sales/credit-notes/`.
- **Depends on:** 04 invoices (the source document being credited).

## 0. Preconditions
- [ ] A confirmed invoice exists to credit against.
- [ ] Logged in with credit-note create/confirm perms (gated); confirm server-side.
- [ ] Period open.

## 1. Functional — actions & states
- [ ] **Full credit note** against an invoice — reverses the whole sale.
- [ ] **Partial credit note** — credit selected lines/qty only.
- [ ] **Confirm** — posts the reversal; credit note becomes immutable.
- [ ] Refund path: apply the credit to the customer's AR (reduce what they owe) OR refund cash — both correct.
- [ ] Loading/error/empty states; debounced.

## 2. Domain invariants
- [ ] **GL (credit to AR):** Cr AR (1131, party-tagged) — customer owes less; Dr Revenue + output-VAT reversal (0 for Kuwait).
- [ ] **Stock returns:** Dr Inventory, Cr COGS at the **original realized cost** of the returned units — inventory value restored correctly, not at current or zero cost.
- [ ] **Net-zero contra** to the original invoice posting for the credited portion; nothing left dangling.
- [ ] **Reconcile invariant holds** after the credit note (Σ open invoices per customer = 1131 balance).
- [ ] **Cannot over-credit:** total credited ≤ invoiced qty/amount; a return beyond the unpaid balance is handled (refund cash or block with guidance — no negative AR, no money created).
- [ ] Confirming twice / crediting an already-fully-credited invoice = idempotent block.

## 3. Edge cases & defensive UX
- [ ] Credit note on a voided invoice blocked.
- [ ] Returning more qty than sold rejected.
- [ ] Zero/negative credit rejected.
- [ ] Credit into a closed period blocked server-side.
- [ ] Double-submit = ONE credit note.
- [ ] KWD 3dp; no VAT block for Kuwait.

## 4. Cross-module / integration
- [ ] Inventory on-hand + valuation rise by the returned qty at original cost; stock ledger RETURN movement created.
- [ ] Customer ledger + AR aging reflect the credit.
- [ ] Credit note links back to its source invoice; drill-down resolves.

## 5. Known gaps
- Over-value return beyond unpaid balance (requires reversing the receipt first, per purchase-side pattern) — verify Asala's simple returns don't hit this, and that if they do the message is honest.

## Sign-off
- [ ] All CRITICAL/HIGH pass. Findings logged.
