# 03 — Accounts Payable Subledger

## AP is the mirror of AR

Where AR tracks what customers owe the business, AP tracks what the business owes its
suppliers. Every structural concept from Chapter 02 applies here in reverse. The control
account is **Trade Payables (2111)**. The sub-ledger holds one record per supplier. The
invariant is the same: the sum of all supplier sub-ledger balances must equal the GL
balance of 2111 at every moment.

The key difference is direction. AP has a **credit** normal balance. A supplier bill
increases what we owe (credit entry, AP goes up). A payment to a supplier decreases
what we owe (debit entry, AP goes down). This is the opposite of AR, where invoices
debit the customer account and payments credit it.

## Structure of a supplier ledger

**Gulf Supplies Co. -- AP Ledger (SAR)**

| Date | Reference | Description | Debit | Credit | Balance |
|------|-----------|-------------|-------|--------|---------|
| 2026-01-08 | BILL-001 | Goods received -- purchase order #PO-42 | | 5,250.00 | 5,250.00 |
| 2026-01-22 | BILL-002 | Goods received -- purchase order #PO-47 | | 2,625.00 | 7,875.00 |
| 2026-02-05 | PAY-001 | Payment -- BILL-001 full settlement | 5,250.00 | | 2,625.00 |
| 2026-02-12 | DN-001 | Debit note -- return of goods from BILL-002 | 525.00 | | 2,100.00 |

Closing balance: SAR 2,100.00 still owed to Gulf Supplies Co.

Read the balance column as "how much do we owe this supplier." A credit entry increases
it; a debit entry decreases it. The normal balance is credit -- this matches 2111 in
the GL.

### The journal entries that created these rows

BILL-001 posted:

```
DR  Merchandise Inventory (1141)     5,250.00
      CR  Trade Payables (2111)                   5,250.00
```

PAY-001 posted:

```
DR  Trade Payables (2111)            5,250.00
      CR  Cash / Bank (1111)                      5,250.00
```

DN-001 posted (see the next section for full discussion):

```
DR  Trade Payables (2111)              525.00
      CR  Merchandise Inventory (1141)             525.00
```

Each journal entry touched 2111 in the GL and simultaneously updated Gulf Supplies
Co.'s sub-ledger row by the same amount in the same direction.

## Debit notes

A **debit note** is issued by the buyer to the supplier. It says: "we are returning
goods (or claiming a credit for some other reason), reduce what we owe you." It is the
AP equivalent of a credit note in AR.

The name comes from the buyer's perspective: we debit our payable to the supplier,
meaning we reduce the liability.

### When debit notes are used

- Goods returned to supplier because they were damaged, incorrect, or surplus.
- Overcharge on a supplier invoice that the supplier agrees to correct.
- Quantity discrepancy discovered on goods receipt where the supplier accepts the
  claim.

### Journal entry for a goods return

Gulf Supplies Co. sent an incorrect batch. We return items worth SAR 525.00 (including
VAT at 5%, so SAR 500.00 net + SAR 25.00 VAT):

```
DR  Trade Payables (2111)              525.00
      CR  Merchandise Inventory (1141)             500.00
      CR  Input VAT Recoverable (1211)              25.00
```

The debit to 2111 reduces our liability. The credit to 1141 removes the inventory that
was returned. The credit to 1211 reverses the input VAT we had claimed when the goods
arrived.

In the sub-ledger, Gulf Supplies Co.'s balance decreases by SAR 525.00 in the same
transaction.

### Matching a debit note to a bill

A debit note should be matched to the specific bill it relates to, just as a payment
is matched to bills. This keeps the open-item list clean. A debit note for DN-001
matched to BILL-002 reduces BILL-002's outstanding balance from SAR 2,625.00 to
SAR 2,100.00.

## AP aging

AP aging works exactly like AR aging: each supplier's balance is broken into buckets
by the age of the underlying bills.

The practical purpose is different. For AR, aging drives collections -- chasing
overdue customers. For AP, aging drives cash management -- ensuring bills are paid on
time to avoid penalties, maintain supplier relationships, and capture early payment
discounts before they expire. The 90d+ bucket in AP signals bills that are overdue
or possibly disputed.

**AP Aging Report -- as of 2026-04-30 (SAR)**

| Supplier | Current (0-30d) | 31-60d | 61-90d | 90d+ | Total |
|----------|----------------|--------|--------|------|-------|
| Gulf Supplies Co. | 2,100.00 | 0.00 | 0.00 | 0.00 | 2,100.00 |
| Al-Ameen Dist | 0.00 | 3,150.00 | 0.00 | 0.00 | 3,150.00 |
| Rashid & Co | 0.00 | 0.00 | 0.00 | 1,575.00 | 1,575.00 |
| **TOTAL** | **2,100.00** | **3,150.00** | **0.00** | **1,575.00** | **6,825.00** |

The TOTAL (SAR 6,825.00) must equal the GL balance of **Trade Payables (2111)**.

Rashid & Co's SAR 1,575.00 in the 90d+ bucket deserves investigation. This is either
a disputed bill, a bill that was overlooked, or -- in the worst case -- a bill that was
entered in the sub-ledger but the payment was never posted. The 90d+ bucket is also
where early payment discount windows have certainly closed.

Al-Ameen Dist's SAR 3,150.00 sits in the 31-60d bucket. Depending on payment terms
(typically 30 or 60 days for trade suppliers in the region), this may be due imminently.
A cash flow plan should account for it.

## Duplicate bill protection

AR has an equivalent risk in credit note duplicates, but the bigger AP risk is posting
the same supplier invoice twice. This is easy to do when paper bills arrive by email
and also by post, or when an operations team member re-enters a bill that was already
in the system.

The effect of a duplicate bill is that both the GL and the sub-ledger overstate AP. The
books balance -- both sides of the entry are recorded correctly -- but the liability is
wrong. The business may end up paying the supplier twice, or the overstated payable
sits on the balance sheet indefinitely.

Prevention requires that the system track the **supplier's own invoice reference number**
and reject any attempt to post a bill with a reference number that has already been
posted for the same supplier. This is a uniqueness constraint on (supplier_id,
supplier_invoice_reference). A bill with reference "INV-2026-0047" from Gulf Supplies
Co. can exist only once in the system.

Without this constraint, duplicates surface only when a payment run pays both entries
and the supplier returns the double payment -- or when AP aging is reviewed carefully.

## AP write-offs: writing off a liability

Writing off a payable is unusual and works in the opposite direction from AR write-offs.
In AR, a write-off removes an asset (the customer's debt to us) and recognizes an
expense. In AP, a write-off removes a liability (our debt to the supplier) and
recognizes **income**.

This happens when a supplier forgives a debt, goes out of business before the invoice
is settled, or when a liability becomes statute-barred (the legal limitation period for
debt claims expires -- typically 3 to 5 years depending on jurisdiction).

The journal entry to write off a forgiven or statute-barred AP balance:

```
DR  Trade Payables (2111)            1,575.00
      CR  Other Income (4900)                     1,575.00
```

The sub-ledger record for the supplier goes to zero in the same transaction.

This transaction attracts scrutiny for two reasons. First, the income created may be
taxable -- most jurisdictions treat forgiven debt as taxable income in the year it is
forgiven. Second, tax authorities may question whether the liability was real in the
first place. A business that consistently books large payables and then writes them off
without paying raises compliance and potentially fraud concerns. Any AP write-off should
be supported by documentation: a written confirmation from the supplier that the debt is
forgiven, or legal evidence that the limitation period has expired.

## Partial payments and allocation in AP

Everything in Chapter 02 on partial payments and allocation applies here. When a payment
covers only part of a bill, the bill remains open for the unpaid balance. Payments are
allocated against specific bills. An unallocated payment remainder sits as a debit
balance on the supplier account -- an **unapplied debit** that reduces the net AP
balance but is not yet matched to any outstanding bill.

The one practical difference: in AP, unallocated debits are less common and should be
investigated quickly. An unallocated debit on a supplier account might indicate a
payment sent without a corresponding bill, or a bill that was paid but never entered
into the system.

## The mental model

> AP is AR viewed from the other side of the transaction. The structural mechanics are
> identical -- control account, sub-ledger per entity, allocation, aging, write-offs --
> but the direction reverses: liabilities have a credit normal balance, bills credit the
> account, payments debit it. The discipline is the same: the sum of all supplier
> sub-ledger balances must equal the GL at every moment, and the aging report is the
> instrument that turns that balance into actionable cash management decisions.

Next: `04-inventory-valuation-wac.md`.
