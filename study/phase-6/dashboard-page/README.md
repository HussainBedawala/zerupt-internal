# Dashboard Page (DEV-291)

The concepts behind the tenant dashboard *page* — the post-login landing screen that
consumes the KPI/chart endpoints from DEV-289. The *why* and the patterns, not the steps.

## What the dashboard is, and why it's the landing page

A retail owner doesn't open an ERP to navigate menus — they open it to find out *how the
shop is doing right now*. So the dashboard is the post-login destination: a read-only
glance that answers "did we sell, are we making margin, is anything about to run out, who
owes me money" before the user touches anything else. It is a **read model** — it
aggregates across POS, sales, the ledger, and inventory but owns none of them.

## The five KPIs and one shared sales definition

The page surfaces: **today's sales** with a %-change vs yesterday, **gross margin MTD**,
a **low-stock count**, and **outstanding AR** — plus a daily-sales bar chart.

The trap with any dashboard is that "sales" quietly means a different number than the same
word on the daily-sales report, and the moment a user spots the mismatch they stop trusting
every figure. We avoid that by **reusing one `net-sales-by-date` definition** that both the
dashboard and the report call. They agree by construction — no two engineers re-deriving the
formula and hoping it ties out.

### Null is not zero

The percentage and margin fields are `number | null`, never `number`. With a zero
denominator — no sales yesterday, no revenue this month — the ratio is *undefined*, not 0%.
Returning `0` would lie ("flat / no change") and `Infinity` would leak a non-serialisable
value into JSON. `null` is the honest answer; the UI renders it as "—".

## Money is a decimal string, never float-parsed

Monetary values cross the wire as fixed **6-decimal-place strings** (`"1234.567890"`) —
the Neon driver carries Postgres `numeric` precision through as a string precisely so it
*isn't* coerced to an IEEE-754 float. The frontend rule: format the string directly for
display, never `Number()` it for arithmetic. Float-summing money drifts by fractions of a
cent, and in accounting a cent that doesn't tie out is a bug, not a rounding nit.

## Recent transactions: a server-side union of two sources

"Recent activity" has to merge **two heterogeneous sources** — POS transactions and sales
invoices — that share no common list endpoint and no common shape. Rather than fetch both
to the client and stitch them in the browser, the server does a **union → sort-by-time →
limit**, returning one already-ordered list. The merge logic lives in a small pure
`mergeRecent` helper so it can be unit-tested in isolation from the database.

One subtlety: both sources must **guard their timestamp with `isNotNull`** rather than fall
back to an epoch default. A row with a missing time sorted as `1970` would jump to the top
or bottom of "recent" and quietly corrupt the ordering — dropping it is safer than inventing
a date.

## Frontend patterns

- **Feature-slice architecture.** The dashboard mirrors the reports module:
  `api/ queries/ components/ types/`. Cohesion by feature, not by file type — the same shape
  reviewers already know.
- **Auto-refresh without flicker.** TanStack Query uses `refetchInterval: 60s` so the owner
  sees live-ish numbers, paired with `keepPreviousData` so each refresh doesn't blank the
  cards back to skeletons. A dashboard that strobes every minute is worse than a slightly
  stale one.
- **Per-section independent states.** Each KPI card, the chart, and the recent-transactions
  list own their *own* loading / error / empty / success state. If AR fails, the rest of the
  page still renders. This is the Defensive-UX rule made structural — non-technical MENA /
  India / SEA retail users must never face a single blank screen.
- **Empty state for new tenants.** A brand-new shop with zero history gets a deliberate
  empty state, not a wall of "—" or a broken-looking zero chart.

## Branch filter persisted in the URL

The selected branch lives in the URL (`?branchId=`) so a view is bookmarkable and shareable.
The concept that bites here is the **cold-load race**: on first paint the branch list hasn't
loaded yet, so a naive "is this id valid?" check would see an empty list, decide the
bookmarked id is invalid, and **strip it before it could ever match**. The fix is to
validate the externally-supplied id against the known branches *only once that list has
loaded* — and to treat any id never to be trusted from the URL until checked against real
branches.

## RTL / i18n for charts

Recharts doesn't respond to `dir="rtl"` — its axes and margins are **physical pixel
offsets**, not CSS logical properties. So Arabic requires manual work: reverse the axis,
flip the orientation, and **flip the `margin` values by hand** (logical-property helpers do
nothing inside an SVG). Separately, hover tooltips are invisible to keyboard and
screen-reader users, so the chart ships an **`sr-only` data summary** — the numbers in text
form — so the chart is not the *only* way to reach the data.

## Permissioning and isolation

The whole page is **read-only** and gated by `reports.dashboard.view` — a user without it
never sees the route. Every underlying query is scoped to the tenant's own database, so
cross-tenant leakage isn't a permission bug waiting to happen, it's structurally impossible.

---

**See also:** dashboard-kpis (the endpoints this page consumes) · reports-frontend (the
shell/patterns it mirrors) · [[project_mvp_status]].
