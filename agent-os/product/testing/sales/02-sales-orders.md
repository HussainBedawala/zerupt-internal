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
- [ ] All CRITICAL/HIGH pass. Findings logged.
