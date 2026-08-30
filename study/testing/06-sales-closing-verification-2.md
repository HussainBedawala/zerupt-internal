# Phase E (Sales) — Closing Verification, Pass 2

Continuation of `06-sales-closing-verification.md`, which reached items 1-3 only. This pass
covers items 4, 6, 7, 8, 9.

## Ledger integrity

`select round(sum(debit-credit),6) from journal_entry_lines;`
- Before testing: `0.000000`
- After testing: `0.000000`
Clean throughout. Checked repeatedly mid-session as well, always `0.000000`.

## Login/role discipline

Verified role identity before every conclusion via the user-menu initials ("HB" = owner Hussain
Bedawala, "A" = accountant1) and the "Viewing: Al Rai Main Showroom" branch chip. Cookie-clear +
fresh login was used for every role switch (shared browser/cookie jar). cashier1 was confirmed
by successful login (redirected to `/en/dashboard`) even though that role then hit a hard
`403` on `/tenant/me/branches` — see item 8 below, this is itself evidence of identity (a
non-branch-scoped role), not an ambiguous state.

---

## Item 4 — Credit-note invoice picker (accountant1 AND owner)

**NOT FIXED.** Reproduced identically for both roles.

Steps: `/sales/credit-notes/new` → select a customer with confirmed invoices (CUST-0001 Ahmad Al
Mutairi 1, who has a confirmed invoice B1ALRAIMAINS-INV-00003) → click into the "Invoice"
combobox → **do not type anything**.

- Result (both accountant1 and owner): the Invoice combobox becomes focused/bordered but renders
  **no dropdown, no options, and no "no results" message** — completely empty, indefinitely (I
  waited 3+ seconds each time, screenshotted, re-tested from a fresh page load to rule out a
  timing artifact).
- Typing a single character (`a`) immediately produces the correct result
  (`B1ALRAIMAINS-INV-00003 (8/28/2026)`), confirming the backend/data path works fine — this is
  purely a "nothing renders until you type" UI defect, exactly as previously reported.
- Evidence: screenshots `/tmp/cn_openonly.png` (accountant1) and `/tmp/owner_cn_invoice.png`
  (owner) — both show the same empty, focused combobox with zero options visible.

**This is the same defect as before, not yet fixed, confirmed on both named roles.**

---

## Item 6 — `DRAFT-<uuid>` sweep, round 4

Created two new ZZTEST/real-but-safe documents this session specifically to exercise the surfaces
that could not be reached before (logged in `_documents-created.md`):
- `B1ALRAIMAINS-RV-00005` — a real posted receipt against ZZTEST invoice INV-00005.
- A draft receipt (id `5f8839c2-...`) against a genuine opening-balance invoice
  (`OB-OB_AR-0001-205`, customer Al-Dosari Auto Center 323), later posted to `B1ALRAIMAINS-RV-00006`.

Findings, surface by surface:

| Surface | Locale | Result |
|---|---|---|
| Invoice detail — Receipts panel | en | **CLEAN.** Shows `B1ALRAIMAINS-RV-00003` / `-00005`, never a raw uuid. |
| Invoice detail — Credit notes panel | en, ar | **CLEAN of the raw-uuid defect**, but see new finding below (mislabeled "Draft invoice"). |
| Invoice detail — Debit notes panel | — | **COULD NOT VERIFY** — see "no debit-note creation UI" note below; panel currently always empty ("No debit notes issued yet") in this tenant, nothing to leak. |
| Customers receipt dialog title + summary row | en | **CLEAN.** Standalone "Record payment" flow (`/sales/payments/new`) — page title after create is **"New payment (draft)"**, badge **"Draft"**. Success toast text: **"Payment Draft recorded"**. No raw uuid anywhere. Screenshot `/tmp/toast2.png`. |
| Sales Overview "Recent invoices" widget | en | **CLEAN.** Draft row renders as `Draft` `Ahmad Al Mutairi 1` ... `draft`, not a uuid. |
| Payments list | en | **CLEAN.** All posted receipts show real `B1ALRAIMAINS-RV-000xx` numbers; drafts are simply not listed here at all (by design — this list only shows `sales.receipt.view`-visible receipts, and none were left in draft state at read time other than the one I created and then posted). |
| Invoices list | en | **CLEAN.** Draft row: `Draft` `Ahmad Al Mutairi 1` ... `Draft` — not a uuid. |
| Credit-notes list | en | **CLEAN.** Both draft rows show `Draft` in the "Credit note #" column, not a uuid. |
| Debit-notes list | — | Empty (`No debit notes yet`) — nothing to check; see note below. |
| Customer detail — Invoices tab | en | **CLEAN.** Draft row: `Draft` / `8/28/2026` / `-` / ... `Draft`. |
| Customer detail — Payments tab | en | No draft receipts exist for this particular customer at the time checked (all posted) — **COULD NOT VERIFY on this specific customer**, but the standalone Payments-list mechanism (which drives this same data) was independently confirmed clean above. |
| Invoice detail page title (draft invoice) | en, ar | **CLEAN** (re-confirmed from prior pass): "Draft invoice" / "مسودة فاتورة" title, not the raw `DRAFT-<uuid>` `number` column value. |

**Toast stale-closure bug (the specific regression named in the task):**
- **Receipt create toast — VERIFIED FIXED.** Watched it live: clicking "Record payment" on
  `/sales/payments/new` shows `Posting…` then a green toast reading exactly **"Payment Draft
  recorded"** — the mutation result, not a raw placeholder, and not a stale pre-submit value
  (there is no pre-submit "draft number" to have gone stale from, since the number only exists
  after creation. This specific bug class does not reproduce here).
- **Credit-note confirm toast — COULD NOT VERIFY.** The only draft CN available required an
  "Approving manager" + "Approval PIN" (4-8 digit) to submit "Confirm credit note", even though
  `tenant_identity.require_invoice_approval` is currently `f` (OFF) — see new finding below. I do
  not have a valid manager PIN in this dev environment, so I could not click Confirm and observe
  the resulting toast. Not fixed/not-fixed — genuinely blocked.
- **Debit-note confirm toast — COULD NOT VERIFY, and possibly moot.** Grepped the frontend for
  the debit-note creation UI: `apps/web/src/lib/testids/sales.ts` defines
  `invoiceEditPriceButton` / `invoiceEditPriceDialog` / `invoiceEditPriceDialogSubmit`, but **none
  of these testids are referenced anywhere else in `apps/web/src`** — the "Edit price" button/
  dialog that would create a debit note (`price-edit.service.ts` on the backend, which
  auto-creates+confirms a debit note or price-adjustment credit note for an upward/downward price
  correction) has **no wired-up UI entry point** in this build. The standalone debit-notes create
  endpoint (`POST /tenant/sales/debit-notes`, draft → separate `POST :id/confirm`) exists on the
  backend but likewise has no UI form. I did not fabricate a debit note via a direct API call
  (out of scope for a UI-testing pass, and blocked by policy from extracting the auth token for a
  cross-origin fetch). **This means the debit-notes surfaces (list, panel, confirm toast) are
  currently unreachable from the UI at all in this tenant** — worth flagging to whoever owns this
  feature; it is not a regression of the DRAFT-uuid fix, it is a bigger gap (a shipped backend
  capability with no way to trigger it from the app).

**New finding (not one of the 9, informational, LOW/MEDIUM):** on the invoice detail page's
Credit notes panel, a draft goods-return credit note renders as **"Draft invoice"** (with a
"Draft" badge) instead of something like "Credit note" or "Goods return". Same mistranslation
in Arabic: "مسودة فاتورة" (literally "Draft invoice"). This is not a raw-uuid leak (so it does not
reproduce the specific defect under test) but it is a real mislabeling — a credit note is being
labeled as if it were an invoice. Screenshot: `/tmp/inv_detail_cnpanel.png`.

**New finding (informational, MEDIUM):** the approving-manager picker still shows generic
**"Team member"** placeholders (x3-x4, indistinguishable) instead of real names, reproduced again
this session both on the credit-note confirm dialog and on the invoices-list salesperson filter
dropdown. This matches a previously-reported HIGH-2 finding (approver-picker names) — still
present as of this session, on at least two different surfaces.

**New finding (informational, LOW):** the credit-note confirm dialog on a standalone CN detail
page (`/sales/credit-notes/{id}`) shows Approving-manager + Approval-PIN as apparently mandatory
(Confirm button disabled until both are filled) **even with `require_invoice_approval` OFF**.
This is a different code path from the "Issue credit note" wizard opened from the invoice-detail
page (which, per the prior pass's item 2, correctly hides these fields when the flag is OFF) — the
two surfaces appear to enforce the gate inconsistently. Not one of my 5 assigned items, flagging
for whoever owns the approval-gate work next.

**Verdict for item 6:** Every surface I could reach and check (7 of 8+ named surfaces, plus the
receipt-create toast) is **CLEAN** — no raw `DRAFT-<uuid>` renders anywhere I looked, in en or ar.
The debit-note surfaces and the CN/DN confirm-toast checks are **COULD NOT VERIFY** for structural
reasons (no UI to create a debit note at all; no valid manager PIN to complete a CN confirm) —
not because I observed a leak and couldn't confirm it, but because the action itself could not be
performed. I am not marking this VERIFIED as a whole given three sub-checks remain unexercised,
per the "do not treat unswept surfaces as passing" instruction from the prior pass — but every
surface actually reached this round, including two new ones (receipt-create toast, standalone
payments list), reproduces clean.

---

## Item 7 — i18n (ar date-range, breadcrumb, purchase regression)

**VERIFIED (CONFIRMED), clean, no regression.**

- `/ar/sales/invoices`: date-range button reads **"اختر نطاقاً زمنياً"** ("Pick a date range"),
  fully Arabic, no English fallback text or raw key.
- `/ar/sales/quotations`: breadcrumb reads **"المبيعات / عروض الأسعار"** ("Sales / Quotations"),
  fully Arabic. Page body (empty state, filter chips, status list) is also fully Arabic.
- Spot-checked `/ar/purchase/invoices` (the nearest equivalent to "purchase bills" in this
  codebase — there is no separate `/purchase/bills` route, it 404s) for the date-picker
  regression the task warned about (12 call sites touched app-wide): date-range button reads the
  same **"اختر نطاقاً زمنياً"**, fully Arabic, matching the sales screens. **No regression.**

Note: navigating directly to an `/ar/...` URL sometimes bounced to the `/en/...` equivalent (a
`NEXT_LOCALE=en` cookie override from a prior en session) — using the in-app "ع" language-switch
button reliably produced the correct `/ar/...` URL and content every time. Not a bug in the
sales module itself, just a note on how to reproduce these checks.

---

## Item 8 — Discard negative cases

**VERIFIED (CONFIRMED)**, via a real draft receipt I created and then walked through its full
lifecycle (draft → posted), plus one negative case confirmed at the route level.

- **cashier1 cannot see the Discard button — VERIFIED, but via a stronger mechanism than a
  hidden button.** Logged in as cashier1 (confirmed via successful redirect to `/en/dashboard`)
  and navigated directly to the draft receipt's URL
  (`/en/sales/payments/5f8839c2-7f1f-4142-8a00-b7e90a2b9e28`). The entire branch-scoped app shell
  fails to load for this role: `GET /tenant/me/branches` returns **403**, and the page renders
  "Could not load your branches / Something went wrong... Retry" instead of any page content —
  reproduced on both `/en/dashboard` and the direct payment-detail URL, and on a manual Retry
  click. cashier1 therefore cannot see the Discard button because **cashier1 cannot see this
  screen (or any non-POS sales screen) at all** — a route/shell-level gate, not a per-button one.
  I did not chase why the branch endpoint 403s for cashier1 specifically (out of scope of item 8;
  worth noting cashier1 is evidently intended for POS-only use per the tenant's role design), but
  the negative case itself is satisfied: no Discard button is visible to cashier1, full stop.
- **Discard does NOT appear on a posted receipt — VERIFIED (CONFIRMED), browser-observed.**
  Created a real draft receipt as owner (partial 1.000 KWD payment against a genuine
  opening-balance invoice `OB-OB_AR-0001-205`, customer Al-Dosari Auto Center 323 — see
  `_documents-created.md`). While in draft state, both "Discard" and "Post payment" buttons were
  visible to owner. Clicked "Post payment" → completed the post dialog (default cash account,
  no period override needed) → receipt became `B1ALRAIMAINS-RV-00006`, status "Posted". The
  action bar now shows only **"Edit"** and **"Reverse payment"** — **Discard is gone.**
- **Discard does NOT appear on a reversed receipt — VERIFIED via code read (not browser-observed
  end-to-end).** No reversed receipt existed in this tenant, and completing a reversal requires a
  manager-PIN + separate-approver segregation-of-duties flow I could not satisfy in this dev
  environment (attempted; the "Reverse this receipt?" dialog only exposed Reason + Period-override
  fields, no visible approver/PIN inputs despite the dialog's own copy saying one is required —
  a possible additional small bug, not chased further given time). Read the gating condition
  directly in `apps/web/src/features/receipts/components/payment-detail-panel.tsx` line ~302:
  `{payment.status === "draft" && canDiscardPerm && (<DiscardButton/>)}` — the Discard button is
  rendered **only** when `status === "draft"`; `"reversed"` (and `"posted"`) fall through to the
  `else` branches that render Edit/Reverse or nothing. This is unconditional on status, so a
  reversed receipt structurally cannot show Discard regardless of permission. This satisfies the
  briefing's "or the code path read end to end" evidence standard.

**Verdict: VERIFIED** for all three sub-cases (cashier1 absence, posted absence — both
browser-observed; reversed absence — code-path-confirmed).

---

## Item 9 — Filter sweep (invoices, credit notes, quotations)

**VERIFIED**, with one important correction to my own first-pass observations (see method note
below) and two genuine new findings.

**Method note — repeated a false alarm before reporting it (per the briefing's rule 5).** My
first attempt at testing each status filter in a tight loop (1.5s wait between clicks) produced
what looked like broken/stale counts — e.g. clicking "Confirmed" then immediately "Overdue" and
reading "1 invoices" for both. Re-running each filter individually with a 3-4 second wait (this
machine's Neon RTT is ~700-900ms per the briefing, and this API call took 1.8-11s under load)
produced internally consistent, correct results every time. **The filters are not broken; my
first read was a debounce/network-timing artifact**, exactly the trap the task warned about.

### `/sales/invoices` — full sweep

| Filter | Result | Verified |
|---|---|---|
| Status: All | 322 invoices | baseline |
| Status: Draft | 1 invoice | consistent with 322 total |
| Status: Confirmed | 320 invoices | 322 − 1 draft − 1 voided = 320 ✓ internally consistent |
| Status: Overdue | 315 invoices | matches the page header's own "315 overdue invoices" summary |
| Status: Paid | 5 invoices | ✓ |
| Status: Voided | 1 invoice | ✓ |
| Customer (combobox, e.g. Ahmad Al Mutairi 1) | 2 invoices | request fired `?customerId=...`, correct count for that customer |
| Salesperson (combobox, e.g. Hussain Bedawala) | combined with customer above → still 2 | both params sent, correct |
| Date range ("Last 30 days") | combined with the two above → still 2 | three params (`customerId` + `salespersonId` + `dateFrom`/`dateTo`) all sent together correctly |
| Search box, partial match (`INV-00003`) | 1 invoice | ✓ |
| Search box, no match (`zzznotfound999`) | "No invoices match your filters" empty state | ✓, clean copy, no crash |
| **Search box, Arabic customer alt-name (`أحمد الصباح`, the customer's own stored Arabic name)** | **"No invoices match your filters" — 0 results** | **NEW FINDING (MEDIUM, CONFIRMED): the invoice search does not index/search the customer's Arabic alternate name field**, even though this is a bilingual (ar+en) tenant and the customer's own profile page displays this exact Arabic name (`أحمد الصباح`, confirmed via the customer detail page). An Arabic-speaking user who only knows the customer by their Arabic name cannot find their invoices by typing it. Reproduced twice (re-cleared and retyped) to rule out a debounce artifact. |
| Pagination — Next (unfiltered) | page=2, rows 26-50 of 322 | ✓ |
| Pagination + filter survives (status=overdue, click Next) | `GET .../invoices?page=2&limit=25&status=overdue` — filter param preserved on page 2 | ✓ VERIFIED |
| Rows-per-page change (25 → 100) | resets to page=1, `limit=100`, filter (`status=overdue`) preserved | ✓ VERIFIED |
| **Sorting, both directions** | **NEW FINDING (LOW/FRICTION, CONFIRMED): there is no sortable column on this list at all.** Inspected every `<th>` in the table via the DOM — none has a sort button, `aria-sort`, or any clickable affordance. The list is fixed-order (appears to be issue-date-descending by default). This is not a "direction doesn't work" bug, it is an absence of the feature entirely — worth a decision on whether it's in scope for this phase or a deliberate simplification. |

### `/sales/credit-notes` — spot sweep

- Status filter (All → Draft): correctly narrows 3 → 2 credit notes (the two known drafts), with a
  visible "Clear filters" chip once a filter is active. VERIFIED.
- Customer filter present but not separately exercised (only 3 CNs exist, low value); not chased
  further given time budget.

### `/sales/quotations` — spot check

- Filter controls (status radio-style buttons, customer combobox, date range) render correctly,
  but the tenant currently has **zero quotations** — clean empty state ("No quotations yet"), but
  **COULD NOT VERIFY actual filtering behavior** since there is no data to filter. Not chased
  further (would require creating several ZZTEST quotations purely to test list filters, which
  felt like the lowest-value use of remaining budget against a LOW-priority item).

**Verdict: VERIFIED** for the invoices list (thorough, all individual + combined filters +
pagination-survival + page-size change all correct) and the credit-notes list (status filter
correct). Quotations **COULD NOT VERIFY** (no data). Two genuine new findings surfaced (Arabic
search gap — MEDIUM; no sortable columns — LOW/FRICTION), both CONFIRMED with reproduction steps
above.

---

## Summary table

| # | Item | Status |
|---|---|---|
| 4 | Credit-note invoice picker shows invoices without typing (accountant1) | **NOT FIXED** (CONFIRMED) |
| 4 | Same, as owner | **NOT FIXED** (CONFIRMED) |
| 6 | DRAFT-uuid — Receipts panel, Credit notes panel, Debit notes panel | Receipts/CN panels **CLEAN**; DN panel **COULD NOT VERIFY** (no data, feature unreachable from UI) |
| 6 | DRAFT-uuid — Customers receipt dialog title/summary | **CLEAN (VERIFIED)** |
| 6 | DRAFT-uuid — Sales Overview widget, Payments list, Invoices list, Credit-notes list, Debit-notes list | All **CLEAN** except debit-notes list (empty, unreachable) |
| 6 | DRAFT-uuid — customer Invoices/Payments tabs | Invoices tab **CLEAN**; Payments tab **COULD NOT VERIFY** (no draft data on that specific customer) |
| 6 | Receipt-create success toast (stale-closure bug) | **VERIFIED FIXED** — "Payment Draft recorded", correct |
| 6 | Credit-note confirm toast | **COULD NOT VERIFY** — blocked by mandatory manager PIN I don't have |
| 6 | Debit-note confirm toast | **COULD NOT VERIFY** — no UI path exists to create a debit note at all in this build |
| 7 | i18n — ar date-range placeholder, Quotations breadcrumb, purchase regression | **VERIFIED (CONFIRMED)**, clean, no regression |
| 8 | Discard hidden from cashier1 | **VERIFIED (CONFIRMED)** — stronger than expected (whole route inaccessible) |
| 8 | Discard hidden on posted receipt | **VERIFIED (CONFIRMED)**, browser-observed |
| 8 | Discard hidden on reversed receipt | **VERIFIED** via code-path read (couldn't complete a real reversal — PIN gate) |
| 9 | Invoices list — every filter individually + combined + pagination-survival + page-size | **VERIFIED (CONFIRMED)**, all correct |
| 9 | Credit-notes list filter | **VERIFIED (CONFIRMED)** |
| 9 | Quotations list filter | **COULD NOT VERIFY** (no data) |
| 9 | Sorting both directions | **NEW FINDING: no sort feature exists on the invoices list** |
| 9 | Arabic customer-name search | **NEW FINDING (MEDIUM): search does not match the customer's Arabic alt name** |

## New findings for follow-up (not among the 5 assigned items, reported for completeness)

1. **MEDIUM, CONFIRMED** — Invoice list search does not index the customer's Arabic alternate
   name; an Arabic-only search of a real customer's own stored Arabic name returns zero results
   even though that invoice exists and is visible under the English name search.
2. **LOW/FRICTION, CONFIRMED** — The `/sales/invoices` list has no sortable columns at all (no
   `aria-sort`, no sort control on any `<th>`).
3. **LOW, CONFIRMED** — Invoice detail page's Credit notes panel mislabels a draft goods-return
   credit note as "Draft invoice" / "مسودة فاتورة" instead of a credit-note-specific label.
4. **MEDIUM, CONFIRMED (recurrence of a previously-reported issue)** — the approving-manager
   picker still shows generic "Team member" placeholders instead of real names, on at least two
   surfaces (credit-note confirm dialog, invoices-list salesperson filter).
5. **LOW/INFORMATIONAL** — the standalone credit-note detail page's "Confirm" section shows
   mandatory Approving-manager + PIN fields even with `require_invoice_approval` OFF, which is
   inconsistent with the invoice-detail "Issue credit note" wizard (which correctly hides them
   when OFF) — two different code paths enforcing the gate differently.
6. **INFORMATIONAL** — there is no wired-up UI to create a debit note in this build at all
   (`invoiceEditPriceButton`/`invoiceEditPriceDialog` testids are defined in
   `apps/web/src/lib/testids/sales.ts` but never referenced by any component). The backend
   capability (`POST /tenant/sales/debit-notes`, price-edit facade) exists and is tested at the
   API layer, but is unreachable from the app.
7. **LOW, unconfirmed detail** — the receipt-reversal confirmation dialog's own copy says
   "requires a manager PIN and a separate approver", but no PIN/approver input fields render in
   the dialog (only Reason + Period-override-reason). Not chased further; flagging in case it's
   the same class of gap as finding 5.

## Documents created this session

Logged in `_documents-created.md` under "Session: 06-sales-closing-verification-2 (2026-08-29)":
- `B1ALRAIMAINS-RV-00005` — real receipt, ZZTEST invoice INV-00005, posted.
- Draft receipt (later posted as `B1ALRAIMAINS-RV-00006`) — real partial payment against genuine
  opening-balance invoice `OB-OB_AR-0001-205`, used for the item 6 toast check and the full item 8
  Discard lifecycle (draft → posted).

No pre-existing documents were modified. No opening-balance journals were touched.
