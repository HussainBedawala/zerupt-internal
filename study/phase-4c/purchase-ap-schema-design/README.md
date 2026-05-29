# Purchase / Accounts-Payable Schema — Design Concepts (DEV-300)

The concepts behind why the AP (accounts payable) purchase tables are shaped the
way they are — not the implementation steps. AP is the mirror image of AR
([sales-schema-design](../../phase-4b/sales-schema-design/README.md)); this note
focuses on what's *different* and why.

## AP is the mirror of AR — same three-layer shape

A supplier bill models the same kind of financial event as a customer invoice,
just pointing the other way:

- **Header** (`purchase_invoices`) — the bill: who *we* owe, how much, in what
  currency, what state. One row.
- **Lines** (`purchase_invoice_lines`) — what was bought. Owned by the header
  (cascade).
- **Settlement** (`supplier_payments` + `supplier_payment_allocations`) — money
  *leaving* and being applied to bills. One payment can settle many bills, so
  allocation is its own table, not a column on the bill.

Modelling AP symmetrically with AR matters because the accounting engine consumes
both the same way: a `*.posted` event carries an `allocations[]` array, and AP
aging / AR aging are the same query with the sign flipped. Symmetry keeps the
ledger code uniform.

## Why a payment is a *voucher + allocations*, not a column on the bill

The issue's first sketch put `purchase_invoice_id` directly on the payment — one
payment, one bill. That breaks the most common real-world case: paying three
outstanding bills with a single bank transfer. The voucher (`supplier_payments`)
holds the total that left the bank; the allocation rows say how that total was
*split* across bills. This is the one structural decision worth getting right
up front, because retrofitting it after payments exist is painful.

## One place we *diverge* from the AR mirror: a direct FK, not a polymorphic ref

Sales allocations point at "an invoice OR a credit note" — a *polymorphic*
reference (a plain UUID + a type discriminator, no real foreign key). Purchase
allocations point only at purchase invoices, because purchase returns / debit
notes are out of MVP scope. With only one possible target, a **direct foreign
key** (`purchase_invoice_id → purchase_invoices`) is strictly better than a
polymorphic UUID: the database enforces the reference. Don't reach for
polymorphism until you actually have a second target type.

## The supplier's number vs. our number

A purchase invoice carries *two* identities: our internal sequence
(`number`, e.g. `PINV-0001`, unique per tenant) and the supplier's own bill
number (`supplier_invoice_number`, their reference). The supplier's number is
not globally unique — two vendors can both send "INV-001" — but entering the
*same* supplier's *same* number twice is almost always a duplicate bill, which
leads to paying a vendor twice. A partial unique index on
`(tenant_id, supplier_id, supplier_invoice_number)` (only when the number is
present) turns that costly mistake into a database error.

## "Paid" is a derived fact, not a status

The issue suggested a status of `draft/confirmed/paid/cancelled`. We kept only
`draft → confirmed` and track settlement with `paid_amount` / `balance` columns
instead. "Paid" is just `balance == 0` — deriving it from the numbers can never
disagree with the numbers, whereas a separate status enum can drift out of sync
with the actual money. And like AR, confirmed is a one-way door: no cancel,
corrections flow through the (deferred) purchase-returns module.

## Letting the database guard the money

Schema-level CHECK constraints make whole classes of bug impossible regardless of
service-layer correctness:

- non-negative amounts everywhere;
- `balance = total - paid_amount` (the AP invariant — a partial write can't
  silently corrupt aging);
- a confirmed bill *must* carry its confirm metadata;
- a posted payment *must* carry its post metadata.

What the schema **can't** enforce is cross-row/cross-table arithmetic — e.g.
"the sum of a payment's allocations ≤ the payment total" or "≤ the bill's
balance". Those are aggregates across many rows, not expressible in a simple
CHECK, so they live in the service-layer posting transaction. The schema still
contributes the structural guard it *can*: a unique
`(payment_id, purchase_invoice_id)` so the same bill can't be allocated twice on
one payment (which is what a retry/double-click would otherwise do).

## What we deliberately left out (and why it's safe to defer)

MVP intentionally omits the richer spec: PO/GRN lifecycle, landed cost, payment
terms, credit limits, multi-currency FX (exchange rate, functional-currency
amounts, realised gain/loss), advance payments, cheque tracking. For a
single-currency tenant the FX fields are derivable (rate = 1), so deferring them
loses no data. The rule of thumb: defer columns whose absence doesn't *destroy
information* today, but add constraints now, because constraints are the thing
that's expensive to add once real data exists.
