# Sales — Direct / Express Sale Testing Checklist

> Persona: **the counter salesperson ringing up a face-to-face sale.** This is Asala's PRIMARY flow: pick items, take cash/KNET, print receipt. One atomic call does invoice + confirm + (optional) receipt.

- **Route:** `/sales/direct/new`
- **Feature dir:** `apps/web/src/features/sales/`, `invoices/`
- **API:** `POST tenant/sales/direct-sales` (atomic: create invoice → confirm → optional receipt create + post). Throttled 10/min/IP. Perms: `sales.invoice.create`, `sales.invoice.confirm`, and if paid `sales.receipt.create` + `sales.receipt.post`.
- **Depends on:** 01 customers, item master + stock, 04/05 posting engine.

## 0. Preconditions
- [ ] Items with stock + selling prices loaded; Walk-in customer present.
- [ ] Logged in as Cashier (the real persona) — confirm cashier can complete a sale but does NOT see cost/COGS/margin.
- [ ] Period open.

## 1. Functional — actions & states
- [ ] **Ring up a cash sale to Walk-in** — add lines by search/scan, take cash, system computes **change due**, complete, receipt renders. Under 5 min unaided (persona success criterion).
- [ ] **KNET sale** — select KNET, no change-due, completes.
- [ ] **Credit sale to a trade account** — no immediate payment → posts to AR (customer balance rises).
- [ ] **Split payment** (part cash / part KNET) if available — tenders sum to total.
- [ ] Loading/error/success states; button debounced; a failed post leaves NO half-sale.

## 2. Domain invariants — the whole point
- [ ] **Atomicity:** invoice + confirm + receipt either ALL post or NONE. A mid-way failure leaves no orphan invoice, no stock relief, no AR row.
- [ ] **GL (paid cash sale):** Dr Cash/Bank (or KNET clearing), Cr Revenue, Cr output VAT (zero for Kuwait); PLUS Dr COGS, Cr Inventory at realized cost. Balanced.
- [ ] **GL (credit sale):** Dr AR (1131, party-tagged), Cr Revenue (+VAT); PLUS COGS/inventory relief. Customer's 1131 rises by the invoice total.
- [ ] **Identical outcome to the SO→invoice path** for the same goods/price (dual-path equivalence).
- [ ] **Change given > 0 only on cash**, never on KNET/card.
- [ ] **Oversell blocked:** selling more than on hand fails before anything posts (no negative stock, no revenue booked).
- [ ] costAtSale is not silently 0 — COGS reflects the real realized cost.

## 3. Edge cases & defensive UX
- [ ] Rapid double-click / double network submit = ONE sale (idempotency key), not two.
- [ ] Tenders that don't cover the total are rejected; overpayment in cash → change, never a negative AR.
- [ ] Zero-qty / zero-price / negative line rejected.
- [ ] Manual line/cart discount: computes correctly, VAT (if any) allocated pre-tax, cannot drive total negative; discount beyond a threshold requires approval (if configured).
- [ ] Removing the last line / empty cart cannot be "completed".
- [ ] KWD 3dp everywhere (line, tender, change); no 2dp hardcode.

## 4. Cross-module / integration
- [ ] Stock on hand decrements by exactly the sold qty; stock ledger SALE movement created.
- [ ] AR/receipt reconcile: a paid direct sale leaves the invoice fully settled (open balance 0); a credit sale leaves it open at the invoice total.
- [ ] Receipt/thermal print renders logo + branch + lines + totals + payment + change (bilingual), no VAT block.

## 5. Known gaps
- FX fail-loud (never triggers for KWD-only Asala) — verify no foreign-currency path is reachable here.

## Sign-off
- [ ] All CRITICAL/HIGH pass. Findings logged.
