# Phase E — Sales module screen-by-screen sweep (list + detail screens)

Browser wave, live in `gstack browse`. Logged in as owner `anonymator8@gmail.com`
(Hussain Bedawala, "HB", confirmed via `/en/settings/profile` — Full Name field read
"Hussain Bedawala") for the entire sweep, branch scope "Al Rai Main Showroom" unless noted.
Ledger identity check before starting: `select round(sum(debit-credit),6) from
journal_entry_lines` → `0.000000`. No writes were made during this sweep (read-only
exploration only), so no post-check was required and none was performed.

**Environment note:** the dev web server restarted / hot-reloaded several times mid-session
(browser sessions were silently logged out ~4 times, each time landing back on `/login` with
no product-level error). This matches the briefing's warning that other agents are editing
frontend code concurrently. Each time, a fresh login + branch re-selection recovered normally
— treated as environment noise, not a product defect, and NOT counted as a finding.

---

## CONFIRMED findings

### [HIGH] [CONFIRMED] S-1 — "Voided" status filter on the Invoices list is completely broken (400 error)

Repro: `/en/sales/invoices` → click the "Voided" status tab.

Result: the list replaces itself with "Something went wrong / An unexpected error occurred.
Please try again." Reproduced twice independently (once immediately, once after a full page
reload) — not a one-off race.

Network evidence (captured via `browse network`):
```
GET /api/v1/tenant/sales/invoices?page=1&limit=25&status=voided → 400 (205B body)
```
compared with the same request for "Paid":
```
GET /api/v1/tenant/sales/invoices?page=1&limit=25&status=paid → 200 (4317B body)
```
`status=voided` is a real, in-use value — `select distinct status from sales_invoices` on the
live DB returns exactly `voided | draft | confirmed` — so this is not a stale/renamed enum on
the data side; the query-param validation on the invoices list endpoint rejects `voided`
specifically while accepting the other tab values. This makes the Voided tab on the invoices
list completely unusable — a user cannot filter to see their voided invoices at all, and gets a
generic, unhelpful error instead of a normal filtered/empty list.

Not yet checked whether this also affects the Payments/Direct-sales "Voided/Cancelled" tabs or
only the invoices endpoint specifically — scope this to invoices only until someone verifies
the sibling routes.

### [MEDIUM] [CONFIRMED] S-2 — Draft documents render their raw UUID as the document number on two list surfaces (Sales Overview widget and Payments list), while the Invoices list itself renders the same draft cleanly as "Draft"

Repro A: `/en/sales` (Sales Overview) → "Recent invoices" widget → one row's Invoice # column
reads literally `DRAFT-4953bb68-70b7-4ed5-85a1-87cb0da887d1` (a raw UUID with a `DRAFT-` prefix
glued on), for customer "Ahmad Al Mutairi 1", amount `KWD 0.000`, status "draft". This is an
`aria`-confirmed link (`@e24 [link] "DRAFT-4953bb68-70b7-4ed5-85a1-87cb0da887d1"`), not a text
artifact of scraping.

Repro B: `/en/sales/payments` → the list itself (not a widget) shows a row whose Receipt #
column reads `DRAFT-1583eb30-38a9-4a1d-a611-0002af038fe4` for customer "Salem Al Otaibi 3",
status "Draft".

Control (same defect class, but CLEAN): `/en/sales/invoices` — the full invoices list — renders
the identical underlying draft invoice (same customer, same amount) with Invoice # simply
reading `Draft` (no UUID, no prefix). This proves the invoices list component already has the
correct fallback and the bug is specific to the Sales Overview "Recent invoices" widget and to
the Payments list's own row renderer, which are two separate, less-hardened code paths that
never got the same "don't print the raw id" treatment as the main invoices list.

This is exactly the hunt-list item #3 pattern (`DRAFT-<uuid>`), found in two new places not
previously reported. Severity kept at MEDIUM rather than HIGH: it never displays a dollar/KWD
amount tied to the UUID incorrectly (the amount is right), and it's confined to a still-draft,
not-yet-finalized document, so no customer-facing consequence — but it is a genuine internal-id
leak into a user-facing column in a back-office screen an untrained staff member reads daily.

### [MEDIUM] [CONFIRMED] S-3 — Customer receipt print preview is titled "Invoice" and shows a blank line-item name instead of the invoice number it was paid against

Repro: `/en/sales/customers` → search "Mohammed Al Fadhli" → open customer → Payments tab →
click receipt `B1ALRAIMAINS-RV-00004` → Print.

Two separate defects found in the print root's HTML (`#customer-receipt-print-root`):
1. The document's own `<h1>` heading reads `Invoice` (uppercase, bordered, top-right of the
   page) — this is a payment receipt, not an invoice. The wrong document-type label prints on
   a customer-facing PDF/paper document.
2. The line-items table's `Item` column, which per the shared print mapper
   (`payment-voucher.mapper.ts`) is meant to show which invoice the payment was allocated
   against, renders as a bare `-` placeholder — the invoice number is silently absent, not just
   wrong. By contrast, the ON-SCREEN dialog for the exact same receipt (both the customer-tab
   dialog and the standalone `/sales/payments/[id]` detail page) correctly resolves and shows
   `OB-OB_AR-0001-176` as the invoice.

This is a different symptom than the raw-UUID leak flagged by the prior code-audit pass
(`E-B1` in `06-sales-export-print-i18n.md`) — on today's build the id is not printed raw, but
the resolution has regressed to printing nothing at all, and the document header itself is
mislabeled. Both are real, independently confirmed defects on the actual printed/PDF-preview
surface a customer would receive: (a) wrong document title, (b) missing "paid against" info.
Given the concurrent-editing warning in the briefing, this is plausibly `E-B1` mid-fix by
another agent — reporting the CURRENT observed state rather than assuming it's the same bug,
since the specific symptom (UUID vs blank) differs.

Evidence: on-screen dialog HTML shows the correct resolved table
(`<td>OB-OB_AR-0001-176</td><td>31.601</td>`) under heading "Invoice allocations"; the
`#customer-receipt-print-root` HTML for the same receipt in the same dialog shows
`<h1>...>Invoice</h1>` and `<td>...>−</td>` (dash) for the item name, with the correct amount
`KWD 31.601` in the adjacent column.

### [LOW] [CONFIRMED] S-4 — "Pick a date range" filter button renders in English on Arabic sales list screens; the Quotations breadcrumb also leaves "Quotations" untranslated

Repro: switch UI language to Arabic (header "ع" toggle, confirmed `dir="rtl"` on
`<html>` afterward) → visit `/ar/sales/invoices` and `/ar/sales/quotations`.

- On `/ar/sales/invoices`: every other filter/tab/column header translates correctly
  (كل، مسودة، مؤكدة، متأخرة، مدفوعة، ملغاة، رقم الفاتورة، العميل، …) but the date-range filter
  button's own label stays the literal English string `Pick a date range`, sitting between two
  correctly-Arabic controls.
- On `/ar/sales/quotations`: the same untranslated `Pick a date range` reappears (confirms this
  is a shared date-range-picker component missing an Arabic string, not a one-off on the
  invoices page — repeated per method rule 5, not a single observation). Additionally the page
  breadcrumb reads `المبيعات/Quotations` — "Quotations" left in English while its sibling
  segment "المبيعات" (Sales) is translated.

This is a real, reproduced i18n gap (hardcoded English string reaching an Arabic screen),
distinct from the previously-reported quotation "(excl. tax)" label finding.

### [LOW] [CONFIRMED] S-5 — Direct navigation to an `/ar/...` sales URL silently falls back to `/en/...` of the same route; only the in-app language toggle actually switches locale

Repro: from an English session already scoped to a branch, `goto
http://gulf-auto-parts.localhost:3000/ar/sales/invoices` directly → after the "Loading your
branches…" interstitial resolves, the browser ends up at `/en/sales/invoices` (English), not
`/ar/sales/invoices`. Using the in-app "ع" toggle from the English invoices page, by contrast,
correctly lands on `/ar/sales/invoices` with `dir="rtl"`.

Impact is limited (a bookmarked/shared Arabic deep link degrades to English rather than erroring
or leaking data), so filed as LOW/i18n rather than a scoping or security issue. Not re-tested
across every sales route — confirmed only on `/sales/invoices`.

---

## Verified NOT a finding (checked, ruled out)

- **S-search-timing** — Invoices list search box (`Search invoice no. or customer…`) appeared to
  do nothing on a first pass (count stayed at "of 322" for three different search terms
  including a nonsense string). Re-tested with a longer wait and by forcing a native `input`
  event: search works correctly (`ZZTEST` → 4 matching rows, nonsense string → "No invoices
  match your filters" empty state). The first read was a timing artifact from reading the count
  before the debounce fired — logged per method rule 5, not reported as a bug.
- **Deep pagination** — Invoices list, 322 total invoices: paged all the way to the last page
  (301–322 of 322) via 13 successive "Next" clicks with no crash, no duplicate rows, no stale
  count.
- **Page-size change** — switching Rows-per-page from 25 → 100 correctly resets to page 1 and
  shows "1–100 of 322".
- **Branch scoping (Al Rai)** — `select b.name, count(*) from sales_invoices si join branches b
  on b.id = si.branch_id where si.status <> 'voided' group by b.name` returns a single row:
  all 321 non-voided invoices belong to Al Rai Main Showroom. No other branch currently has any
  sales-invoice data on this tenant, so the classic branch-scoping-leak check (compare Al Rai's
  numbers against another branch's) could not be meaningfully exercised for invoices — the
  Sales Overview totals (`KWD 587,808.702` outstanding, `315` overdue) match the Al Rai-only DB
  total exactly, which is consistent with correct scoping but is not proof of a leak-guard since
  there is no cross-branch data to leak. Flagging as an untested gap rather than a pass.
- **Orders list export button** — `/en/sales/orders` list header has no Export control at all
  (only "New order"), consistent with the known open item E-A1 (no export surface for sales
  orders) — corroborates the prior static-analysis finding in the browser, not a new finding.
- **Ledger identity** — `0.000000` before the sweep; no writes were made, so no after-check was
  needed.

## Not completed (time/tooling constraints — flag for a follow-up pass)

- **Hunt #1 (403 → false-empty-state pickers as `accountant1`)** — attempted to log out and
  re-authenticate as `accountant1` to probe branch/salesperson pickers for permission-gated
  lookups degrading into "no data" states; the in-app logout control did not visibly complete
  (session stayed as owner HB) within the time available for this pass, and re-attempting risked
  further destabilizing the shared browser session for other concurrent agents. Not verified
  either way — should be picked up by a follow-up pass explicitly starting a clean session as
  `accountant1`.
- **E-B2 (delivery order print, viewer-locale-bound signature block)** and **E-C1 (quotation
  "excl. tax" labels)** from the prior static-audit pass were not re-verified live in this sweep
  (time-boxed); both are already CONFIRMED via code reading in
  `study/testing/06-sales-export-print-i18n.md` and are not repeated here.
- Full per-filter combinatorial sweep (every filter individually AND combined, both sort
  directions, all detail-screen tabs on every one of the 8 document families) was not completed
  end-to-end in the time available. This pass prioritized the HUNT list and the per-screen
  checklist's highest-signal items (scoping via DB, a broken status filter, draft/UUID leaks,
  i18n on two list screens, print-document correctness) over exhaustive coverage of every
  remaining screen (sales orders detail, delivery-orders detail, invoice-deliveries, debit-notes
  detail, credit-notes detail, customer Statement/Contacts/Addresses/History tabs) — these
  route loads were confirmed to render without crashing (see below) but not deep-tested.

### Screens confirmed to load without error (smoke-checked only)
`/en/sales/orders`, `/en/sales/quotations`, `/en/sales/delivery-orders`,
`/en/sales/customers`, `/en/sales/direct`, `/en/sales/payments`, customer detail
(Profile/Payments tabs). `/en/sales/credit-notes`, `/en/sales/debit-notes`,
`/en/sales/invoice-deliveries` were reached but hit environment logout/hot-reload timeouts
before content could be read — not confirmed clean, not confirmed broken.

---

## Summary table

| ID | Area | Severity | Status | One-line |
|---|---|---|---|---|
| S-1 | Invoices list filter | HIGH | CONFIRMED | "Voided" status tab returns 400, list breaks with a generic error |
| S-2 | Overview widget + Payments list | MEDIUM | CONFIRMED | Draft documents show `DRAFT-<uuid>` as their number in 2 places; Invoices list itself handles the identical draft correctly |
| S-3 | Customer receipt print | MEDIUM | CONFIRMED | Printed receipt titled "Invoice"; paid-against invoice number renders blank instead of resolving |
| S-4 | i18n (ar sales lists) | LOW | CONFIRMED | "Pick a date range" + "Quotations" breadcrumb segment untranslated on 2 Arabic screens |
| S-5 | i18n (locale routing) | LOW | CONFIRMED | Direct `/ar/...` URL silently falls back to `/en/...`; toggle button works correctly |
| — | Search debounce | — | Not a finding (timing artifact) | Invoices search works correctly on proper wait |
| — | Pagination / page-size | — | Not a finding | Deep pagination and page-size change both correct |
| — | Branch scoping (invoices) | — | Untestable this pass | Only Al Rai has invoice data; no cross-branch leak surface exists to probe |
| — | accountant1 permission-gated pickers | — | Not completed | Logout did not complete within time budget |
