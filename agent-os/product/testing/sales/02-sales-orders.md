# Sales — Sales Orders Testing Checklist

> Persona: **a shopkeeper taking a trade order to fulfil later.** Asala does most sales at the counter, so SO is exercised for completeness — but the state machine and stock reservation must be correct.

- **Routes:** `/sales/orders`, `/sales/orders/new`, `/sales/orders/[id]`
- **Feature dir:** `apps/web/src/features/sales-orders/`
- **API:** `tenant/sales/orders` (create, confirm, convert-to-invoice, cancel)
- **Depends on:** 01 customers, item master + stock on hand.

## 0. Preconditions
- [ ] Customers + items with stock loaded.
- [ ] Logged in with `sales.order.*` perms; confirm a user without them is blocked server-side.
- [ ] Period open.

## 1. Functional — actions & states
- [ ] **Create SO (draft)** — customer + line picker (searchable, not free text); qty/price per line; totals compute at KWD 3dp; success + list refresh.
- [ ] **Confirm** — draft → confirmed transition; reserves stock (does NOT relieve/COGS yet).
- [ ] **Convert to invoice** — produces a linked invoice carrying the SO lines/prices; SO marked converted.
- [ ] **Cancel** — confirmed SO can be cancelled with confirmation; releases any reservation.
- [ ] Loading/empty/error states on list and form; button debounced.

## 2. Domain invariants
- [ ] **A draft/confirmed SO posts NOTHING to the GL and does NOT relieve stock** — no revenue, no AR, no COGS until the invoice confirms.
- [ ] Confirm **reserves** stock so it can't be double-promised, but reservation ≠ ledger movement.
- [ ] Convert-to-invoice carries prices forward exactly; the resulting invoice, when confirmed, is where AR/revenue/COGS post (see 04).
- [ ] SO total = Σ line (qty × unit price − line discount); no rounding drift at 3dp.

## 3. Edge cases & defensive UX
- [ ] Cannot confirm/convert an already-converted or cancelled SO (idempotent, clear 4xx).
- [ ] Ordering qty > available stock: warned at order time (soft) but hard-blocked at invoice confirm (see 04) — verify the message is honest.
- [ ] Zero-line / zero-qty / negative-qty / negative-price rejected client + server.
- [ ] Editing a confirmed SO is blocked or re-versions; no silent mutation of a converted SO.
- [ ] Cancel requires confirmation + warns it releases reservation.

## 4. Cross-module / integration
- [ ] Reserved stock reflected in inventory availability views.
- [ ] Invoice created from SO links back (invoice→SO) and resolves.

## 5. Known gaps
- SO is non-primary for Asala; if the UI is thin, note MEDIUM rather than block.

## Sign-off
- [x] All CRITICAL/HIGH pass. Findings logged.

**SIGNED OFF — 2026-07-04 (Al-Asala Auto Parts, prod).** Findings #18–27 all resolved (#27 display fixed; low-stock semantics tracked as DEV-443, inventory pass). Commits: b0d97142 (single-page create at PO parity + draft label + 3dp + searchable customer + breadcrumb), ba24b032 (warehouse combobox + header alignment), 55b0928e (3dp invoice line + blocked-customer re-check at confirm + test), 865ac93b (reserved/available on stock-levels).

DB-verified invariants (prod Asala, branch br-red-term-a1vs9ndl):
- Draft + confirmed SO post 0 journal_entry_lines / 0 stock_ledger_entries; 1131 held at 370.500.
- Confirm reserves via `stock_reservations` (active) with no ledger movement; gapless `SO-####` assigned only at confirm.
- Convert-to-invoice links back (`sales_invoices.source_order_id → SO`), produces a draft invoice, no GL/stock until invoice confirm (04).
- Idempotent transitions (conditional WHERE-status UPDATE); confirmed-SO immutable (`requireDraft`); qty/price validated client+server; blocked-customer hard-blocked at create/update AND re-checked at confirm.
