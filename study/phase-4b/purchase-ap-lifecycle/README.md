# Purchase AP Lifecycle — Concepts (DEV-302)

The accounts-payable side of the ledger: how a supplier bill becomes stock + a
liability, and how paying it settles that liability. Built as the mirror of the
sales AR module, inverted.

## Why AP is the mirror of AR (and where it inverts)

| | Sales (AR) | Purchase (AP) |
|---|---|---|
| Party | Customer | Supplier |
| Document | Invoice (`INV`) | Bill (`PINV`) |
| Stock | **leaves** (sale outbound) | **enters** (grn_receipt inbound) |
| Tax | **output** tax (liability) | **input** tax (recoverable asset) |
| Control account | Receivable (asset) | Payable (liability) |
| Cost | COGS frozen at sale | unit price *is* the cost |
| Settlement | receipt (cash in) | payment (cash out) |

The symmetry is deliberate: same lifecycle (draft → confirmed, immutable after),
same gapless numbering, same fiscal-period gate, same event-driven side effects.
What inverts is *direction* — debits and credits swap sides, stock flows the other
way, and tax sits on the opposite side of the balance sheet.

## The "minimal AP" model

A full ERP separates Purchase Order → Goods Receipt Note → supplier invoice
(three documents, three moments). The MVP collapses these: **the bill is the
receipt**. One confirm both increases stock and books the payable. This is the
right wedge for a small retailer who just wants "I bought stock, I owe money" —
PO/GRN matching is deferred until a customer needs three-way matching.

## Double-entry: what confirm and payment actually post

**Confirm a bill** (goods in, liability up):
```
DR  Inventory        net (subtotal − discount)   ← asset rises
DR  Input Tax        recoverable VAT             ← claimable asset
    CR  Accounts Payable   gross total           ← liability rises
```
The entry balances because `total = net + tax`. The inventory engine separately
updates stock quantity + cost layers; it does **not** post this JE — so there is
exactly one source of the inventory debit and no double counting.

**Post a payment** (liability down, cash out):
```
DR  Accounts Payable   amount   ← liability falls
    CR  Cash / Bank     amount   ← asset falls
```

## Why payments are a voucher + allocations, not a flat FK

A single payment can settle several bills, and a bill can be settled by several
payments (partial payments). That's a many-to-many, so a payment *voucher* holds
the total and *allocation* rows distribute it across bills. `paidAmount` and
`balance` on each bill are derived running totals; the database enforces the
invariant `balance = total − paidAmount` so a half-written settlement can never
silently corrupt AP aging.

## Concurrency: the confirm/edit race

Two dangers when one user edits a draft while another confirms it:
1. The confirm snapshots totals, then an `addLine` slips in → emitted amounts
   diverge from stored totals (wrong JE).
2. A line gets added to an already-confirmed (immutable) bill.

The fix is a **pessimistic row lock**: every line-edit and the confirm both
`SELECT ... FOR UPDATE` the bill row first and re-check it is still draft. Whoever
gets the lock first wins; the other serialises behind it and then sees the new
state. The guarded `UPDATE ... WHERE status = 'draft'` is the final backstop.

For payments, the same idea protects against two vouchers jointly over-paying one
bill: each bill row is locked and its balance re-validated *inside* the posting
transaction, not just at draft-creation time.

## Fiscal period control

Posting date = the supplier's **bill date** (`invoiceDate`), not the system clock —
a bill entered late still belongs to its real period. The period gate: `OPEN`
proceeds, `SOFT_LOCKED` needs an explicit override reason (kept for audit),
`HARD_LOCKED` blocks. The due date (`invoiceDate + supplier term`) is *not* a
posting date, so it is never period-checked — it can legitimately fall in a future
period.

## Recoverable vs non-recoverable input tax (deferred)

This build books all input VAT as recoverable (claimable from the tax authority).
Some VAT is *non-recoverable* (UAE entertainment, India blocked ITC) and should be
capitalised into the cost of the goods instead of sitting as a claimable asset.
That routing is deferred (DEV-337) — correct for standard MENA B2B today, but a
real distinction in the general case.
