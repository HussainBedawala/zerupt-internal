# Reports Frontend (DEV-290)

The concepts behind a reusable, regional-safe reporting UI layer — not the implementation steps.

## 1. The "report shell" pattern (one layout, many reports)

Every report shares the same skeleton: header → filter bar → body → export. Instead of repeating
that in six files, a single `ReportShell` owns the **cross-cutting states** (loading / empty /
error+retry / data) and the export button, and each report supplies only its filters + table as
children.

Why it matters: the four states are the part developers forget. Centralizing them means *every*
report gets a skeleton, an empty state, and a retry button for free — you can't ship a report that
silently shows a blank screen on error. This is the Defensive-UX rule made structural.

## 2. Money is a decimal string, never a float

The API returns money as fixed 6-decimal **strings** (`"1234.567890"`), because IEEE-754 floats
can't represent decimal cents exactly (`0.1 + 0.2 !== 0.3`). The frontend rule that follows:

- **Display:** format the string directly (`Intl.NumberFormat`), never `Number()` it for math.
- **Only place we parse:** charting, where a chart library needs real numbers — and even there a
  guarded `parseDecimal` returns `null` (dropped) instead of letting `Number("")` become `0` and
  silently invent a data point.
- **Sorting:** acceptable to parse, because sort order is presentation, not arithmetic — but it's a
  deliberate exception, not the default.

The lesson: lossy conversion of money is a *data-integrity* bug, not a formatting nit.

## 3. CSV export is a security boundary (formula injection)

A spreadsheet treats a cell starting with `=`, `+`, `-`, or `@` as a **formula**. If a customer
names themselves `=cmd|...` and you export that to CSV, opening the file in Excel can execute it.
Client-side CSV generation must neutralize those cells (prefix with a tab / quote) and escape quotes
and delimiters. "It's just a download" is exactly the assumption attackers rely on — untrusted data
stays untrusted on the way *out*, too.

## 4. Right-to-left is structural, not a coat of paint

Two RTL traps this work surfaced:

- **Bidi isolation:** a mixed-direction string (Arabic customer name in an English row, or vice
  versa) can visually *reorder adjacent cells* — numbers jump to the wrong side. Wrapping
  user-entered text in a Unicode isolate (`isolateText`) fences each value so it can't corrupt its
  neighbors. Pure numbers/dates don't need it; free-text from users does.
- **Charts don't flip themselves.** A chart library's `margin` and axis orientation are *physical*
  (left/right), so they ignore `dir="rtl"`. You have to detect locale direction and swap the axis
  side + margins yourself. CSS logical properties solve layout; they do nothing inside an SVG chart.

## 5. Query gating: don't fetch on incomplete input

Reports with required filters (P&L/Tax need a legal entity + period; sales need a date range) must
**not** fire the request until the inputs are valid. The pattern: build the params object as `null`
when incomplete and let the data layer's `enabled` flag suppress the call. This prevents a burst of
guaranteed-400 requests on mount and the empty-flicker that comes with them.

## 6. Server shell + client panel (Next.js App Router)

Each report route is a thin **server component** (awaits `params`, sets the request locale, supplies
metadata) that renders a **client component** holding the interactive state. The split keeps
per-page locale/SEO handling on the server while the filters, queries, and table stay client-side —
and it's why `setRequestLocale` has to be called in *both* `generateMetadata` and the default export.

---

**See also:** [[project_mvp_status]] · dashboard-kpis · mvp-reporting-endpoints (the API these pages consume).
