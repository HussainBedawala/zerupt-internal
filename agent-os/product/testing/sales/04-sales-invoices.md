# Sales — Invoices (+ stock relief + COGS + output VAT) Testing Checklist

> Persona: **a shopkeeper billing a trade customer.** The invoice is the load-bearing document: confirming it is what relieves stock, books COGS, and raises AR + revenue (+ output VAT). There is NO separate delivery note — relief happens on `sales.invoice.confirmed`.

- **Routes:** `/sales/invoices`, `/sales/invoices/new`, `/sales/invoices/[id]`
- **Feature dir:** `apps/web/src/features/invoices/`
- **API:** `tenant/sales/invoices` (create draft, confirm, void, print)
- **Depends on:** 01 customers, item master + stock, COA (1131 AR, revenue, output-VAT, COGS, inventory accounts).

## 0. Preconditions
- [ ] Customers + items with stock/cost loaded.
- [ ] Logged in with `sales.invoice.create` + `.confirm`; `.void` gated separately (PIN/SoD).
- [ ] Period open.

## 1. Functional — actions & states
- [ ] **Create draft** — customer + searchable line picker; qty/price/discount; totals at KWD 3dp; save as draft (posts nothing).
- [ ] **Confirm** — draft → confirmed; this is the posting moment (AR + revenue + COGS + stock relief).
- [ ] **Void** — confirmed invoice can be voided with confirmation + reason; posts a net-zero reversal.
- [ ] **Print** — A4/thermal renders correctly; no VAT block for Kuwait.
- [ ] List filters (status, customer, date-range) correct; loading/empty/error states; export matches screen.

## 2. Domain invariants — every confirm must be balanced and tie out
- [ ] **On confirm, TWO effects post exactly once:** (a) Dr AR (1131, party-tagged) + Cr Revenue + Cr output VAT (0 for Kuwait); (b) Dr COGS + Cr Inventory at engine-realized WAC/FIFO cost, plus a SALE stock movement.
- [ ] **Customer 1131 rises by exactly the invoice total;** reconcile invariant still holds (Σ open invoices per customer = 1131 balance).
- [ ] **No double COGS:** confirming once relieves stock once; re-confirm is a no-op/blocked.
- [ ] **Oversell blocked:** if a line qty > on hand, the WHOLE confirm rolls back — no AR, no revenue, no partial relief.
- [ ] **Output VAT = 0 / blank** for Asala (Kuwait no-VAT); no phantom tax line.
- [ ] **Void = net-zero contra** of BOTH effects: reverses AR/revenue AND returns stock to inventory at the ORIGINAL realized cost (Dr Inventory, Cr COGS). Reconcile holds after void.
- [ ] Draft invoice is **immutable once confirmed**; edits require void + re-issue, not silent mutation.
- [ ] Failed auto-post lands in outbox/DLQ — never marked "confirmed" with no GL (the suppressErrors gap).

## 3. Edge cases & defensive UX
- [ ] Confirm on a draft whose stock was sold out by another session → clean block, no partial post.
- [ ] Void an already-voided / already-paid invoice → idempotent; voiding a paid invoice must reconcile the receipt too (or be blocked with guidance — no dangling cash).
- [ ] Zero/negative qty or price; discount > line total; rejected client + server.
- [ ] Backdated/future invoice date into a closed period → server-side block with clear message.
- [ ] Rapid double-confirm = ONE posting.
- [ ] KWD 3dp on every amount; currency from `useTenantCurrency()`.

## 4. Cross-module / integration
- [ ] Inventory on-hand + valuation decrease by the sold qty × cost; stock ledger shows the SALE movement linked to the invoice.
- [ ] GL: invoice appears in journal with balanced lines; drill-down from Reports resolves back to the invoice.
- [ ] Invoice → SO link (if created from an SO) resolves; receipt(s) against it reduce the open balance.

## 5. Known gaps
- Separate delivery/fulfillment is intentionally absent — verify relief-at-invoice is the ONLY relief path (no second, dead delivery code posting again).

## Sign-off
- [ ] All CRITICAL/HIGH pass. Findings logged.
