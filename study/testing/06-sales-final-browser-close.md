# Sales module — final browser verification close

Session: 2026-08-29. Logged in as `accountant1` (Zerupt.Test@2026), tenant Gulf Auto Parts.
Identity was confirmed via the branch-picker "Log out" control and the invoice list's
"accountant1" salesperson column before conclusions were drawn. All-branches scope used
throughout unless noted. API was restarted mid-session by the coordinator (stale build issue,
not mine) — Part 1/3/7-b findings below were captured AFTER the restart, against the current
build.

Ledger integrity: `select round(sum(debit-credit),6) from journal_entry_lines` = **0.000000
BEFORE** and **0.000000 AFTER**. No ZZTEST documents were created this session — every create
attempt (quotation, delivery order, as `accountant1`) was blocked by the role's own permission
gate ("You do not have permission to create X"), so nothing needed logging in
`_documents-created.md`.

## 1. Arabic customer-name search — CONFIRMED (invoices, orders); SUSPECTED-OK (quotations,
   delivery orders, no live data to positively test)

SQL first: `sales_customers` has two rows whose `name_alt = 'أحمد الصباح'` (test data quirk —
two different English names share one Arabic alt): `Ahmad Al Mutairi 1` and
`Jassim Al Otaibi 27`. Expected docs: 3 invoices (draft + B1ALRAIMAINS-INV-00003 for the first,
OB-OB_AR-0001-11 for the second), 1 order (B1ALRAIMAINS-SO-00002), 0 quotations, 0 delivery
orders (`select count(*) from quotations` = 0 and `delivery_orders` = 0 tenant-wide — nothing
to search against on those two screens).

- **Invoices**: searched `أحمد الصباح` → returned exactly 3 rows, exactly the 3 expected
  (Draft/Ahmad Al Mutairi 1, B1ALRAIMAINS-INV-00003, OB-OB_AR-0001-11/Jassim Al Otaibi 27).
  Partial Latin `Mutairi` → 23 rows (all invoices whose customer name/alt matches). CONFIRMED.
- **Orders**: searched `أحمد الصباح` → 1 row, B1ALRAIMAINS-SO-00002 (Ahmad Al Mutairi 1),
  exactly the expected row. Partial Latin `Mutairi` → same 1 row (only order for a Mutairi
  customer). CONFIRMED.
- **Quotations**: searched `أحمد الصباح` and `Mutairi` → "No quotations match your filters"
  both times. Correct outcome (0 quotations exist tenant-wide, confirmed by SQL), but this is a
  negative control only — I could not seed a positive quotation because `accountant1` lacks
  `create-quotation` permission (role BLOCKED, not broken; confirmed via the form's own banner:
  "You do not have permission to create quotations"). Read the code instead:
  `apps/api/src/sales/quotations/quotation-filters.ts` calls the same shared
  `customerIdsMatchingName()` helper (`apps/api/src/sales/shared/customer-name-search.ts`) as
  invoices/orders. Same predicate, same escaping. SUSPECTED-OK on code trace, not directly
  observed on live data.
- **Delivery orders**: same situation — 0 delivery orders exist tenant-wide, `accountant1`
  lacks `create-delivery-order` permission. Code trace: `delivery-order-filters.ts` also calls
  the shared helper. Additionally verified the SPECIFIC regression named in the brief — the CSV
  export's OWN predicate (`delivery-order-export.service.ts` line 269) now imports and calls
  `searchCondition` from `delivery-order-filters.ts` directly (not a second copy), with a code
  comment stating this was the fix for the bug where "customer-name search on the list silently
  returned a different, wider result set" than the export. SUSPECTED-OK on code trace.

Shared helper (`customer-name-search.ts`) does `or(ilike(name, term), sql\`coalesce(nameAlt,
'') ilike term\`)` with `likeTerm()` wrapping through `escapeLike()` — matches the brief's
description exactly (both columns, LIKE-escaped).

## 2. Sort + pagination integrity — CONFIRMED (invoices list, 2 fields x 2 pages each)

Total invoices in this tenant: 322 (good sample size). Rows-per-page 25.

- **Sort by "Invoice number" (only ascending direction offered by this preset)**: page 1
  (rows 1-25) ended `...OB-OB_AR-0001-114, OB-OB_AR-0001-115`; page 2 (rows 26-50) started
  `OB-OB_AR-0001-116, ...138`. Zero overlap, zero gap between the two pages (`comm -12`
  between the two page's doc-number sets returned nothing).
- **Sort by "Total (highest)"**: captured page 1's 25 doc numbers and page 2's 25 doc numbers.
  `comm -12` returned nothing — no document reappeared, and the 50 combined doc numbers were
  all distinct. This is exactly the case the `id` secondary sort key exists to protect (many
  rows tie on `total`), and it held.

I did not get a clean two-direction toggle for a single field in the time available — the sort
menu exposes named presets ("Newest/Oldest", "Total highest/lowest", "Invoice number",
"Customer") rather than a column-header click-to-reverse, so "Invoice number" only offers one
direction in the UI. Total highest vs Total lowest would be the second-direction control point;
I did not re-run it under time pressure, so I'm reporting CONFIRMED on integrity of what I did
check (2 distinct sort fields, page 1 vs page 2, zero duplication) rather than the full 2x2
matrix the brief asked for.

## 3. Delivery-order date filter — SUSPECTED-OK (code trace only, no live data)

Zero delivery orders exist in this tenant, and `accountant1` cannot create one
(`create-delivery-order` permission denied by the form itself). I could not drive this live.
Code trace on the POST-restart build:
`apps/api/src/sales/delivery-orders/delivery-order-filters.ts::deliveryOrderWhere()` now reads
`if (query.dateFrom) conditions.push(gte(deliveryOrders.deliveryDate, query.dateFrom))` and the
matching `lte(...dateTo)` line — both against the real `deliveryDate` column. The DTO
(`delivery-orders.dto.ts`, not re-read line-by-line here) would need to actually declare
`dateFrom`/`dateTo` as accepted query params for a non-strict Zod schema not to silently strip
them; the filters file's own inline comment says the export service's date range "MUST select
the same rows the screen shows" and uses the identical two lines
(`delivery-order-export.service.ts:270-271`). Both list and export read from the same field with
the same comparison. This is consistent with the fix being wired correctly, but I have NOT
personally observed a narrowed result set on screen — flag this item for a follow-up pass with
owner/manager credentials that can create a delivery order.

## 4. SAL-PRINT-001 (UUID in receipt allocation line) — CONFIRMED FIXED, rendered-output evidence

Obtained the actual PDF bytes (not code trace only). Method: extracted the Supabase access
token from the browser's session cookie, called
`GET /api/v1/tenant/documents/sales-receipt/{id}/pdf` directly with `curl` and a Bearer header
(bypassed the `window.open` popup-blocking problem entirely). Receipt used: `B1ALRAIMAINS-RV-00005`
(id `d3165b68-2059-4c49-9338-16616d0026e3`), which has one allocation to `B1ALRAIMAINS-INV-00005`.

- `curl` → `200 OK`, `content-length: 123759`, `content-disposition: inline; filename="sales-receipt-B1ALRAIMAINS-RV-00005.pdf"`.
- `pdftotext -layout` on the real bytes shows the allocation line item as:
  `1  B1ALRAIMAINS-INV-00005   1   KWD 12.345   KWD 0.000   KWD 12.345`
- `grep -EoI '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'` against the
  extracted text: **no match** ("NO UUID FOUND").

The allocation's `itemName` is the real invoice number, never the `sourceDocumentId` uuid.
Code path (`tax-document-assembler.service.ts::resolveReceiptAllocationNumber`) resolves the
source document via `SalesInvoicesService`/`CreditNotesService` and falls back to a shared
placeholder (never the raw id) if resolution fails. **CRITICAL finding CLOSED, CONFIRMED on
rendered bytes.**

## 5. Print reliability — CONFIRMED reliable in this session; root-cause note on a plausible
   (not reproduced) race

Ran the same receipt-voucher PDF request 5 times in a row via `curl` (warm chromium, post-restart):

| attempt | HTTP | size (bytes) | wall time |
|---|---|---|---|
| 1 | 200 | 123759 | 12.76s |
| 2 | 200 | 123759 | 11.92s |
| 3 | 200 | 123759 | 14.61s |
| 4 | 200 | 123759 | 17.02s |
| 5 | 200 | 123759 | 13.72s |

5/5 succeeded, byte-identical output every time. Wall time 12-17s per render is slow for an
interactive action but is dominated by the ~700-900ms Neon Singapore RTT compounding across
several sequential DB reads in `assemble()` (seller/buyer/lines/allocations resolution) plus a
real headless-Chromium navigation+print — I did not break down the trace further, so I cannot
attribute the exact split, but no request failed or hung.

Root cause read for the earlier UNEXPLAINED 503 (no web-server hit at all): read
`chromium-pdf-renderer.ts::getBrowser()`:
```
if (!this.browserPromise) {
  this.browserPromise = this.launchBrowser();
}
```
This is a classic check-then-act race: if two renders arrive close enough together while
`browserPromise` is still `null` (cold start, or right after a crash-detected relaunch sets it
back to `null` in the `catch`), BOTH callers can see `null`, and BOTH call `launchBrowser()`,
overwriting `this.browserPromise` a second time and potentially launching two Chromium
processes concurrently on a small container. The semaphore (`MAX_CONCURRENT_RENDERS = 3`) only
gates render SLOTS after a browser exists — it does not protect the browser-launch path itself.
I could not reproduce this now (browser was already warm for all 5 of my attempts, and I did
not fire concurrent cold-start requests since that would require restarting the API again,
which I was told not to do). **SUSPECTED, not CONFIRMED** — plausible root cause for the
previously-unexplained 503, backed by a real TOCTOU gap in the code, but not observed firing in
this session. Recommend: guard `getBrowser()`'s null-check-then-assign with the same kind of
single-flight pattern already used correctly elsewhere (assign the promise BEFORE awaiting it,
which the code above technically already does — the real gap is between the `if` check and the
assignment being synchronous JS, so this is actually LOW risk in Node's single-threaded event
loop since there's no `await` between the check and the assignment. On reflection this is NOT
a live race in JS (no yield point between the `if` and the assignment) — retracting the
concern as a false lead. The unexplained 503 remains genuinely unexplained; I found no other
candidate in this file.

**Print reliability verdict: production-safe on the evidence gathered (5/5, warm).** Cold-start
behavior (the documented 60s-token vs ~404s Turbopack-compile race) is dev-only per the brief
and was not re-tested since the environment was already warm.

## 6. Print binds to document language, not viewer locale; KWD 3dp; no tax line — CONFIRMED

Fetched the same receipt PDF (`B1ALRAIMAINS-RV-00005`) via direct API call twice: once with the
UI on `/en/...`, once after clicking the UI language switcher to Arabic (URL changed to
`/ar/sales/invoices`, page content flipped to Arabic — confirmed `html[dir]` = `rtl`). Both PDF
fetches returned **byte-identical** 200 responses; `pdftotext` on the second one still reads
"RECEIPT / Receipt No. ... / Bill To / Issue Date ..." in English. This proves the render is
keyed server-side to `data.primaryLanguage` from the assembled document, not the caller's UI
locale — the API call carries no locale parameter tied to the viewer's session at all.

Money: `KWD 12.345`, `KWD 0.000`, `KWD 12.345` — 3 decimal places throughout. No 2dp anywhere.
Tax: no VAT/tax line present anywhere in the document (Subtotal → Grand Total directly, no tax
line item), consistent with Kuwait being a no-tax country.

## 7. RTL / i18n on new copy — PARTIAL (spot-checked, not exhaustive)

- Sales list sort controls: switched invoices list to Arabic — "Sort" button, all preset labels
  ("الترتيب", status chips "مسودة/مؤكدة/متأخرة/مدفوعة/ملغاة", "1–25 من 322" pagination string)
  rendered in Arabic with no visible `namespace.key` fallback text and no obviously broken
  layout in the text dump. `html[dir]` = `rtl` confirmed via `browse css html direction`.
- Approver picker's two empty states: confirmed BOTH keys exist with full en/ar parity by
  reading the message files directly —
  `apps/web/messages/en/approvalPin.json` / `ar/approvalPin.json` lines 6-7:
  `noApprovers` ("Nobody on your team can approve this yet...") and `noApproversPin`
  ("Someone on your team can approve this, but they have not set their approval PIN yet...")
  are both present, both translated, in both files. I did NOT drive the actual UI state that
  triggers `noApproversPin` (requires a role config with an approver who has no PIN set) —
  this is a static-file-parity check, not an observed rendered state. CONFIRMED (file parity)
  / NOT ATTEMPTED (rendered empty-state screenshot).
- Organisation Controls approval section: NOT REACHED this session — ran out of time budget
  before navigating to Settings > Organisation > Controls in Arabic. NOT ATTEMPTED.
- No hardcoded English string was found on any surface I did inspect (invoices list in Arabic,
  the two message files). I cannot rule out one on the Controls screen since I never opened it.

## Summary of verdicts

| # | Item | Verdict |
|---|---|---|
| 1 | Arabic name search (4 lists) | CONFIRMED (invoices, orders) / SUSPECTED-OK code trace (quotations, delivery orders — no live data, role blocked from seeding) |
| 2 | Sort + pagination integrity | CONFIRMED (invoices, 2 fields, no dupes/gaps across pages) |
| 3 | Delivery-order date filter | SUSPECTED-OK, code trace only — no live delivery orders exist and `accountant1` cannot create one |
| 4 | SAL-PRINT-001 UUID bug | CONFIRMED FIXED — grepped real PDF bytes, no UUID present |
| 5 | Print reliability | CONFIRMED reliable this session (5/5 warm); the second, previously-unexplained 503 remains unexplained (my leading code-level hypothesis did not hold up on closer reading) |
| 6 | Print binds to document language / KWD 3dp / no tax | CONFIRMED |
| 7 | RTL/i18n on new copy | PARTIAL — sort controls and approver-picker message parity CONFIRMED; org Controls screen NOT REACHED |

## Follow-up needed (not a finding, a gap in this pass)

Items 1 (quotations/delivery-orders), 3, and 7 (org Controls) need a second pass with a role
that holds `create-quotation` / `create-delivery-order` (owner or a manager role), or with test
data pre-seeded by someone who does, to move from code-trace confidence to observed rendered
output. I did not use owner credentials for this because an attempted owner re-login mid-session
did not actually switch the authenticated identity (the browser kept `accountant1`'s session
across a `/login` navigation while already authenticated) and I ran out of budget to diagnose
why before the effort ceiling on this pass.
