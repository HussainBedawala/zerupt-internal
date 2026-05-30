# MVP Reporting Endpoints — Stock Levels, AR Aging, Tax Summary

_Concepts behind DEV-287. Three read-only `/tenant/reports/*` endpoints. This is about
**why** the numbers are computed the way they are, not the wiring._

---

## 1. Why reports are pure read models (no writes, ever)

A report never mutates business state. It projects existing tables into a shape a human
(or an export) can act on. In Zerupt this is enforced structurally: the report services
inject the tenant Drizzle factory read-only and only ever `select`. The costing engine,
the posting engine, and the sales module own all mutations; reports just read their
output. This separation is what lets a report be re-run a thousand times a day with zero
risk — and why a wrong report is a *display* bug, never a *data* bug.

## 2. Money is never a float

Every monetary and quantity value lives in Postgres as `numeric(19,6)` and crosses the
wire as a **decimal string**, summed with `decimal.js`. The reason is exactness: binary
floating point cannot represent `0.1`, so `0.1 + 0.2 !== 0.3`. In an ERP that drift
compounds across thousands of lines and a tax return that's off by a fil/paisa fails an
audit. The rule: parse string → `Decimal` → arithmetic → `.toFixed(6)` → string. The DB
never hands us a JS `number` for money, and we never create one.

## 3. AR aging: the "as-of" date and why buckets exist

**Aging** answers "how overdue is each receivable, *as of a chosen date*?" The `asOf`
parameter is not cosmetic — an aging report without a fixed reference date is meaningless,
because "30 days overdue" depends entirely on when you ask. Two accountants running the
same report on different days must be able to reproduce each other's numbers by passing
the same `asOf`.

**Why bucket at all?** Collections triage. A flat list of balances tells you who owes;
buckets tell you who to *call first*. The standard model separates:

- **current** — *not yet due* (due date in the future, or no due date set). This is healthy
  receivable, not a problem.
- **1–30 / 31–60 / 61–90 / 90+** — escalating overdue bands. The older the band, the lower
  the probability of collection and the closer it is to a bad-debt write-off.

The subtle correctness point: **not-yet-due must never be folded into the first overdue
band.** An early version lumped "0–30" together, which hides genuinely overdue invoices
(say, 20 days late) inside the "current/healthy" number — exactly the debt a collections
team needs to see. Keeping `current = ageDays <= 0` separate from `1–30` is the difference
between a report that flatters the books and one that's operationally useful.

Age is computed in **whole days** from `dueDate` to `asOf`. A null due date is treated as
not-yet-due (you can't be overdue on a date that doesn't exist).

## 4. Tax summary: reconstructing a tax return from the ledger

A VAT/GST/SST return, at its core, is: *for each tax rate, how much tax did you collect
(output) and how much can you reclaim (input), and what's the net you owe?*

The clean way to get "tax collected by code" is **not** to re-read invoices — it's to read
the **general ledger**. When an invoice is confirmed, the posting engine credits an output
tax liability account and tags that journal line with the `taxCodeId`. So summing posted
journal lines whose account is the tax code's *output account*, grouped by tax code, gives
you exactly the tax collected — already net of credit notes, because a credit note debits
the same account. This is why the sign convention is `sum(credit − debit)`: output tax is a
credit-normal liability, reversals debit it, and the net falls out correctly.

**Why the GL and not the invoices?** The ledger is the single source of truth that's
already balanced and period-controlled. Invoices can be drafts, can be edited; posted
journal entries are immutable and dated. A tax return built from the ledger ties back to
the trial balance by construction.

### The honest limitations (and why they're deferred, not hidden)

- **Taxable base is back-derived** (`taxAmount ÷ rate`). That works for standard-rated
  supplies but breaks for **zero-rated and exempt** turnover, where the tax is zero so the
  back-derived base is also zero — yet the *turnover* still belongs on the return. The real
  fix is to store the taxable base on the journal line at posting time.
- **Current rate, not transaction-date rate.** Back-deriving with today's rate is wrong for
  historical periods that span a rate change (KSA VAT 5%→15% in 2020). Storing the base
  removes the division entirely.
- **No input tax / net is gross output.** Until purchases carry tax, there's nothing to
  reclaim, so `netPayable` overstates the true liability.

These are documented in code and tracked as tech debt because they require schema work
(a taxable-base column) and a purchase-tax module — out of scope for a read-only MVP
preview, but **hard blockers before filing a real return**.

## 5. Multi-tenancy and defense-in-depth

Even though each tenant has its own physical database, every query still filters
`tenantId` (and joins re-assert it). In a per-tenant DB the filter is technically
redundant — but it's free, it makes the isolation intent explicit, and it means a future
schema change (e.g. a shared catalog table) can't silently turn a join into a cross-tenant
leak. Security that depends on "this table happens to be isolated" is fragile; security
that's written into every WHERE clause is not.

## 6. Self-describing responses

Each report echoes back the inputs that produced it (`asOf`, `periodStart/End`,
`legalEntityId`, applied filters). A tax summary that doesn't state its own period isn't a
document you can file or archive — the consumer would have to trust client-side state to
know what they're looking at. Echoing the parameters makes the payload a standalone
artifact.
