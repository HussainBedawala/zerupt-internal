# Sales Invoicing Schema — Design Concepts (DEV-279)

The concepts behind why the AR (accounts receivable) sales tables are shaped the
way they are — not the implementation steps.

## Why AR is a "header + lines + allocations" shape

A sales invoice models a legal/financial event in three layers:

- **Header** (`sales_invoices`) — the document: who owes, how much, in what
  currency, what state. One row.
- **Lines** (`sales_invoice_lines`) — what was sold. The header's totals are the
  sum of its lines. Lines are *owned* by the header (delete the invoice → lines
  go too: cascade).
- **Settlement** (`sales_receipt_vouchers` + `sales_payment_allocations`) — money
  arriving and being *applied* to documents. One payment can settle many
  invoices (and offset credit notes), so allocation is its own many-to-many-ish
  table, not a column on the invoice.

This separation is what lets a single $500 receipt pay $300 of INV-1 and $200 of
INV-2 — the allocation rows carry the apply amounts, the receipt carries the
total received.

## Snapshots: why we copy data onto lines

`description`, `unitPrice`, `taxAmount`, `costAtSale` are *copied* onto the
invoice line at confirmation rather than looked up live from the item master.
A sale is a historical fact: if the item is renamed or repriced next month, last
month's invoice must still show what was actually sold and charged. Snapshots
freeze history. `costAtSale` additionally lets margin reports compute profit
without re-deriving cost layers later.

## Draft → Confirmed/Posted is a one-way door

Invoices and credit notes go draft → confirmed; receipts go draft → posted.
There is no "un-confirm". Once a document hits the books (stock moves, a journal
entry posts), reversing it would rewrite history. Corrections happen by issuing a
*new* document (a credit note against an invoice, a reversing receipt). This is
standard accounting hygiene: the audit trail only ever grows.

## Why a credit note points back at an invoice line

A credit can't exceed what was invoiced. By linking each credit-note line to the
original invoice line, the system can enforce "credit qty ≤ invoiced qty minus
already-credited qty" and reverse the right cost (`returnCost`) for COGS. The
`type` (goods_return vs price_adjustment) decides whether stock comes back.

## Polymorphic allocation: one column, two parents

`sales_payment_allocations.sourceDocumentId` can point at an invoice *or* a
credit note, discriminated by `sourceDocumentType`. A foreign key can only point
at one table, so a polymorphic reference trades DB-enforced integrity for
flexibility — the service layer must validate the target exists. We guard the
real risk (double-applying the same payment to the same document) with a unique
constraint on (voucher, type, id).

## Integrity at the DB layer vs the service layer

Database CHECK constraints catch the *impossible* states no code path should ever
produce: negative balances, a "confirmed" invoice with no confirmation
timestamp, an allocation of zero. These are cheap insurance against bugs and
partial writes. Business *rules* that need context (credit-limit checks, period
locks, manager PINs) live in the service layer — the DB can't see them. The
split: DB enforces shape and invariants; services enforce policy.

## Multi-tenant defense-in-depth

Every header table carries `tenantId` even though the tenant is already isolated
by a separate per-tenant database. It's a second wall: if a query ever forgets a
filter, the column is there to scope on, and cross-tenant references can be
sanity-checked.
