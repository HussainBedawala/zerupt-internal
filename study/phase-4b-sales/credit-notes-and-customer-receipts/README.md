# Credit Notes & Customer Receipts — Concepts

> The two documents that *unwind* and *settle* an AR invoice. Built in DEV-282.
> This is the "why", not the "how" — the code lives in `erp/apps/api/src/sales/`.

## Where they sit in the AR cycle

```
Quotation → Sales Order → Invoice (confirmed = money owed)
                              │
                 ┌────────────┴────────────┐
        Credit Note                   Receipt Voucher
   (reduce what's owed)            (collect what's owed)
```

An invoice creates a receivable. Only two things legitimately reduce that
receivable: a **credit note** (we agree the customer owes less — a return or a
price correction) or a **receipt** (the customer pays). Neither edits the
invoice — confirmed invoices are immutable. They are *separate documents* that
adjust the invoice's running `balance` and `paidAmount`. This is the
audit-trail discipline of double-entry bookkeeping: you never erase, you post a
counter-entry.

## Credit note: two flavours, one document

| Type | What happened | Stock | COGS | Revenue |
|------|---------------|-------|------|---------|
| **Goods return** | Customer sent items back | +stock (SALE_RETURN) | reverse (DR Inventory / CR COGS) | reverse (DR Sales Returns / CR AR) |
| **Price adjustment** | We overcharged; no goods move | none | none | reverse (DR Sales Returns / CR AR) |

The key insight: a goods return is *two* economic events — inventory comes back
**and** revenue is reversed — while a price adjustment is *only* the revenue
reversal. Same document, different side effects, chosen by a `type` field.

### Why "Sales Returns" instead of just debiting Sales

You could debit the original Sales revenue account directly. Accountants don't,
because a contra-revenue account (`Sales Returns`) preserves *gross* sales for
analysis: "we sold 1.2M, of which 80K came back" is a health signal you lose if
returns silently net against sales.

## The partial-credit guard (the core money rule)

A line can be credited at most as much as was invoiced, across *all* credit
notes ever raised against it:

```
creditQty ≤ invoicedQty − Σ(prior confirmed credits on that line)
```

Without this, a shop could credit 10 units against a 6-unit sale and hand the
customer free money. The subtle part is **concurrency**: two credit notes
confirming at the same instant could each read "6 available" and both pass.
The fix is a pessimistic lock — `SELECT … FOR UPDATE` on the invoice row — so
the second confirm waits for the first to commit and re-reads the true
remaining quantity. The same lock serializes credit notes *and* receipts
against one invoice, so `balance` can never be driven negative by a race.

## Receipt allocation: money is not "a payment on an invoice"

A customer pays one lump sum; it may settle several invoices. So a receipt
has a `totalAmount` and a set of **allocations** — how that money is applied
across documents. `Σ allocations ≤ totalAmount` (the remainder is an advance /
overpayment, deferred here). Each allocation reduces one invoice's balance.

This separation (header amount vs. allocation lines) is what lets one payment
clear five invoices, or a partial payment chip away at one — without it you'd
force one-payment-per-invoice, which is not how customers actually pay.

### Deadlock avoidance

When one receipt allocates to invoices A and B, and another allocates to B and
A, locking them in *arrival* order can deadlock (each holds what the other
wants). Locking in a **canonical order** (sort by id) means both transactions
grab A before B — one waits cleanly instead of both dying.

## returnCost: what value comes back into stock

When goods return, at what cost do they re-enter inventory? Per spec, the
**current weighted-average cost** at the return warehouse. Edge case: the item
was never stocked at that warehouse (WAC = 0) — restocking at zero would inflate
quantity with no value (phantom inventory). The fallback is the *original sale's*
`costAtSale`, so the asset value that left on the sale is the value that returns.

## The division of labour: events, not direct posting

Sales never writes a journal entry or a stock-ledger row itself. On confirm/post
it **emits a domain event** (`sales.creditNote.confirmed`,
`sales.receipt.posted`); the inventory engine and the accounting listener react.

Why decouple? Three reasons:
1. **Single source of COGS truth** — the inventory engine owns WAC/FIFO
   consumption. If Sales also posted COGS, two systems would disagree.
2. **Idempotency & retry** — each event carries a UUID; consumers ignore
   duplicates, so a retried event is safe.
3. **Forward compatibility** — the accounting JE listener (DEV-330) isn't built
   yet. Sales emits the full payload (`revenue`, `taxLines`, allocation
   breakdown) *now*, so DEV-330 plugs in with no change to the emitter.

The price of this elegance: the emit is **post-commit and best-effort** (logged,
not thrown). The document is already durable; an outbox/poller owns delivery.

## Gapless numbering, again

`CN-0001`, `RV-0001` — sequential, no gaps (tax authorities require it). The
pattern: **reserve** a number before the transaction, **commit** it on success,
**release** it on failure so the number is reclaimed. Drafts carry a throwaway
`DRAFT-<uuid>` until confirm/post assigns the real sequence number.

## Deferred (and why it's OK for MVP)

- **Manager-PIN approval** — the `approvedBy` field is recorded but not yet
  PIN-verified (no PIN service exists). Tracked in DEV-338.
- **Multi-currency** — single functional currency for now; FX gain/loss,
  exchange rates, and `bankAccountId` are emitted as identity/null values so the
  event contract is already shaped for the multi-currency build.
- **Refunds on settled invoices** — crediting past a zero balance (cash back to
  the customer) is rejected; the customer-credit/refund flow is a later document.
