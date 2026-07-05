# Sales — Direct / Express Sale Testing Checklist

> Persona: **the counter salesperson raising a quick invoice for a trade customer.** Direct sale is NOT the cash register — POS owns walk-in retail (scan, tender, **change due**, drawer, KNET, split). Direct sale is the Sales-module **express-invoice lane**: one atomic call = invoice + confirm + (optional) receipt, producing a **formal, numbered, AR-aware sales invoice** with customer price lists and credit limits. Its reason to exist over POS is the **on-credit sale to a trade account** (garage buys parts on their account → AR rises → collect later) plus back-office quick-invoicing without opening a till.
>
> **Scope decision (2026-07-04):** direct sale deliberately does NOT do KNET / change-due / split-tender — those are POS concerns and are NOT logged as direct-sale gaps. Settlement here is **Paid now (cash / bank transfer)** or **On credit**. UI aligned to direct-purchase parity (commit 82cb5ac7).

- **Route:** `/sales/direct/new`
- **Feature dir:** `apps/web/src/features/sales/`, `invoices/`
- **API:** `POST tenant/sales/direct-sales` (atomic: create invoice → confirm → optional receipt create + post). Throttled 10/min/IP. Perms: `sales.invoice.create`, `sales.invoice.confirm`, and if paid `sales.receipt.create` + `sales.receipt.post`.
- **Depends on:** 01 customers, item master + stock, 04/05 posting engine.

## 0. Preconditions
- [ ] Items with stock + selling prices loaded; Walk-in customer present.
- [ ] Logged in as Cashier (the real persona) — confirm cashier can complete a sale but does NOT see cost/COGS/margin.
- [ ] Period open.

## 1. Functional — actions & states
- [ ] **Credit sale to a trade account** (PRIMARY — the reason this exists over POS) — pick trade customer, add lines, **On credit**, complete → posts to AR (customer's 1131 rises by invoice total), invoice left open at total.
- [ ] **Paid-now cash sale** — Paid now / Cash → Dr Cash, invoice fully settled (open balance 0), receipt created.
- [ ] **Paid-now bank-transfer sale** — Paid now / Bank transfer → bank account picker appears, Dr Bank.
- [ ] ~~KNET / change-due / split payment~~ — **POS concern, out of scope for direct sale** (see scope decision above). Verify these are simply absent, not half-built.
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
- [x] All CRITICAL/HIGH pass. Findings logged.

**Signed off 2026-07-05.** Findings #28–36 (this pass) resolved on prod; #35 (promotions dual-path divergence, not Asala-triggered) tracked as DEV-445, #34 purchase-banner cap as DEV-444. Live-verified at the prod ledger:
- **Dual-path equivalence:** direct sale (INV-00001/00004) ≡ SO→invoice (INV-00003) — identical revenue/COGS/AR/stock legs; pack path matches to the fils (accounting-review APPROVE).
- **Pack unit (INV-00004):** 2 Box → base qty 24, unit_pack_id persisted, 5 KWD/pack discount applied (discount_amount 10.000), total 314.000 with **displayed == posted (WYSIWYP)**; Dr AR 314 / Cr Rev 314 / Dr COGS 212.885 / Cr Inv 212.885, VAT 0, balanced; stock −24.
- **Void (INV-00001):** net-zero contra across 1131/1141/4110/5100; status=voided; AR settled to 0; stock returned; reconcile holds.
- **Oversell** hard-blocked (no post). **Cashier** sees no cost/COGS/margin. **KWD 3dp** throughout. **No VAT** lines.
- **Reconcile invariant:** Σ per-customer 1131 = total 1131 = 711.500 after all activity. Materialized stock == stock-ledger net.

UI aligned to direct-purchase / purchase-bill parity (pickers, settlement, header, badge, list search/pills/banner/CSV, paid-balance bar) — sales & purchase invoice screens now share components (single source of truth).
