# Dashboard KPIs & Sales Chart (DEV-289)

Concepts behind the tenant dashboard's KPI and sales-chart endpoints. Not a
how-to — the *why* behind the shape of the code.

## What the dashboard answers

A retail owner opening the app wants five numbers and one chart, fast:

- **Today's sales** + how that compares to yesterday (% change).
- **Gross margin month-to-date** — am I actually making money on what I sell?
- **Low-stock count** — how many items need reordering.
- **Outstanding AR** — how much money customers still owe me.
- A **bar of daily sales** for the last N days.

Each number comes from a different subsystem (POS, sales invoices, the general
ledger, inventory). The dashboard is a *read model*: it aggregates across those
subsystems but owns none of them.

## One definition of "sales", shared

The trap with dashboards is that the same word means two different numbers in two
places. "Today's sales" on the dashboard must equal a day's net sales on the
daily-sales report, or users lose trust.

We avoid that by **extracting the aggregation, not duplicating it**. A shared
`net-sales-by-date` helper encodes the single rule:

```
net sales for a day = POS completed grand totals
                    + confirmed sales-invoice totals
                    − POS voided grand totals
```

Both the dashboard and the report call the same helper. They agree by
construction, not by two engineers independently re-deriving the formula and
hoping they match. This is the general principle: when two features must report
the same business fact, the fact lives in one function.

## Money is decimal, not float

Every monetary value is stored as `numeric(19,6)` and travels as a **decimal
string**, summed with a decimal library — never a JS `number`. Floating point
can't represent `0.10` exactly; summing thousands of line totals as floats drifts
by fractions of a cent, and in accounting a cent that doesn't tie out is a bug.
Strings + decimal math keep the arithmetic exact end to end.

## Null is not zero

Percentage fields (`todaySalesChange`, `grossMarginMtd`) are `number | null`, not
`number`. When the denominator is zero — no sales yesterday, no revenue this
month — the percentage is **undefined**, not 0%. Returning `0` would tell the
user "flat / no change" when the truth is "there's nothing to compare against."
Returning `Infinity` (the naive `x/0`) would leak a non-serialisable value into
JSON. `null` is the honest answer, and the UI renders it as "—".

This is the same divide-by-zero discipline that shows up everywhere money ratios
are computed: decide explicitly what "no denominator" means and encode it.

## Accounting sign conventions

Gross margin reads the general ledger directly. Revenue and COGS sit on opposite
*normal balances*:

- **Revenue** is credit-normal → its amount is `credit − debit`.
- **COGS** is debit-normal → its amount is `debit − credit`.

Classification comes from the chart of accounts: revenue = accounts of type
`income`; COGS = type `expense` with subtype `cost_of_sales`. An expense that is
*not* COGS (operating expense, finance charge) must never enter the COGS bucket,
or margin is overstated. That exclusion is the kind of rule worth a dedicated
test — a silent misclassification produces a plausible-but-wrong number, the most
dangerous kind of bug in a financial report.

## Scoping: tenant, branch, and what the schema allows

Multi-tenancy means every query filters `tenantId` on its driving table — defence
in depth, not just via a join. Branch scoping is more subtle because the schema
exposes branch differently per subsystem:

- POS transactions carry no branch directly → joined through register → branch.
- Sales invoices carry `branchId` directly.
- Journal entry lines carry a line-level `branchId` (null for manual entries).
- Stock levels carry only a warehouse → joined warehouse → branch.

So "branch-scoped" is only as precise as the data model allows. Gross margin is
tenant-wide MTD here because the endpoint contract takes `branchId` but not
`legalEntityId`, and the GL is organised by legal entity. Documenting that scope
decision in the code matters as much as the code: a future reader needs to know
the number is deliberately entity-wide, not accidentally unfiltered.

## Date buckets and "today"

Days are bucketed by casting timestamps to `::date` in the database session
timezone (UTC in deployment). "Today" is computed once, in UTC, and is made
override-able so the logic is testable without mocking the system clock. Store-
local day boundaries (a shop in GMT+4 closing at midnight local) are a known
follow-up — the dashboard currently shares the reports module's UTC assumption so
the two never disagree about which day a sale falls in.

## The chart fills its gaps

The sales chart returns a contiguous point per day across the window, with absent
days filled as zero. A day with no sales is still a bar of height zero — the chart
shouldn't silently collapse a 7-day window into 3 bars because 4 days were quiet.
The fill happens in the read model, not the UI, so every client renders the same
shape.
