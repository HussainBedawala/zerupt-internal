# 06 — Sales fix verification

Independent verification of 5 claimed fixes to the Zerupt Sales module. Method: read the
code end to end first, then personally exercise the user-visible behaviour in the browser
(gstack browse) as the appropriate role, then cross-check the DB. Identity was asserted via
the user-menu avatar/email before every accountant1-scoped conclusion. Ledger balance
identity (`select round(sum(debit-credit),6) from journal_entry_lines`) was 0.000000 before
the session, was re-checked after every write, and is 0.000000 now.

---

## VERIFY 1 — permission gates on sales create/edit surfaces — **VERIFIED**

Logged in as `accountant1` (confirmed via user menu: `accountant1@gulf-auto-parts-mt5kya1i.zerupt.local`).
SQL-confirmed the Accountant role's actual sales grants:

```
sales.invoice.create/confirm/update/list/read   sales.receipt.create/list/post/read
sales.creditNote.create/confirm/list/read        sales.debitNote.create/confirm/list/read
sales.customer.list/read (no .create)            sales.order.list/read (no .create/.update)
sales.quotation.list/read (no .create)           sales.deliveryOrder.list/read (no .create)
```

**Blocked as expected** (all show a graceful `Alert` banner, not a crash, in plain language,
no jargon/IDs/em dashes, and the primary submit button stays disabled even after a field is
edited):
- `/sales/orders/new` — "You do not have permission to create orders." Fields (branch,
  customer, salesperson, discount, item search) disabled; "Create order" disabled.
- `/sales/quotations/new` — same pattern, "create-quotation permission".
- `/sales/delivery-orders/new` — same pattern, "create-delivery-order permission".
- `/sales/customers/new` — "You do not have permission to save this customer"; "Save
  customer" disabled.
- Sales-order **edit** panel (`/sales/orders/:id/edit`, tested against a real order I
  confirmed as owner first) — "You do not have permission to edit orders."; typed a change
  into Notes and "Review changes" stayed disabled. This is the case the fixing agent could
  not reach as owner (owner bypasses the gate); confirmed here for real.
- The orders **list** page's "New order" button is independently disabled with the same
  message — the gate isn't only on the create route.

**Usable as expected** (accountant1 legitimately has these):
- `/sales/invoices/new` — full form, no permission banner.
- `/sales/payments/new` — full form, no permission banner (see caveat below).
- Credit-note dialog from an invoice detail page — "Issue credit note" button enabled,
  dialog opens fully interactive (goods-return/price-adjustment toggle, qty stepper, reason
  field), no permission block.

No regression found: nothing accountant1 is entitled to do was blocked by the new gates.

**Side finding (HIGH, CONFIRMED, out of the fix's direct scope but blocks a legitimate
accountant action on one of the surfaces this VERIFY item covers):** `/sales/payments/new`
intermittently rendered "No branches configured. Add a branch in settings first." for
accountant1 instead of the form — not a permission-gate message, a different empty state.
Network trace showed the cause: `GET /api/v1/tenant/branches?...` returns **403** for
accountant1 (confirmed 4 times across reloads), while `GET /api/v1/tenant/me/branches`
(used elsewhere, e.g. the branch switcher) returns 200. `useBranchesQuery` in
`payment-create-panel.tsx` calls the admin-scoped `/tenant/branches` endpoint, which
Accountant has no permission for — SQL confirms `role_permissions` has zero `%branch%`
grants for the Accountant role. Effect: the payment-create form is unusable for accountant1
whenever this branches call resolves to empty before the (working) branch-switcher context
does — a race, not deterministic, but reproducible. This is a pre-existing gap unrelated to
the reported permission-gate fix, not something to fix here, but it directly undermines the
"payments/new MUST render a normal usable form" requirement and should be tracked.

Also noted (LOW, not part of this fix): the invoice detail page's "Edit" button tooltip says
"You do not have permission to edit invoices" for accountant1 on a **confirmed** invoice —
but Accountant actually HAS `sales.invoice.update`; confirmed invoices simply can't be
edited by ANYONE (a business-state rule: "Confirmed invoices can't be edited. Corrections
go through a credit note."). The button's disabled-reason copy blames permission when the
real reason is invoice state. Misleading but not the permission-gate bug under test.

---

## VERIFY 2 — pagination keepPreviousData — **VERIFIED** (2 of 3 lists had enough data for a real test)

Code: `placeholderData: keepPreviousData` confirmed present in the query hooks behind all 9
sales list panels (orders, quotations, delivery-orders, customers, invoices, receipts,
credit-notes, debit-notes, direct-sales) — receipts/credit-notes/debit-notes reuse the
already-fixed `invoices-queries.ts`/`debit-notes-queries.ts` hooks, so there is no second,
unpatched copy.

Browser: this tenant only has enough rows for genuine multi-page testing on **customers**
(501 rows) and **invoices** (319 rows) — orders/quotations/delivery-orders/credit-notes/
debit-notes have 0–3 rows each, too few to observe pagination behaviour meaningfully. I
disclose this rather than fabricate a third dataset.

- Customers list (en): paged 25→50→75→100 (3 consecutive "Next page" clicks, snapshotting
  immediately after each click, no wait) — table and pager stayed mounted every time, no
  skeleton flash, count updated in step. Then a text-search filter ("Ahmad") applied and
  page reset to 1 of 19 cleanly, no stale rows left over.
- Invoices list (ar, `/ar/sales/invoices`): paged 1–25→26–50→51–75 (2 consecutive clicks,
  immediate snapshots) — same result, pager and totals in Arabic ("١-٢٥ من ٣١٩" etc.)
  stayed mounted with no flash. A status-filter click ("مؤكدة"/Confirmed) also reset to
  page 1 immediately without an intervening skeleton.

Repeated the observation at each list (rule 5) rather than trusting a single click.

**Minor side finding (LOW):** on first render before a customer is chosen, the payments/new
form showed `Total allocated: 0.00` (2dp); after interacting it correctly showed
`0.000`/`31.601` (3dp). Also on the Arabic invoices list, "Pick a date range" for the date
filter renders in English inside the Arabic UI — an i18n gap, unrelated to this fix.

---

## VERIFY 3 — receipt allocation quantisation — **VERIFIED**

Code: `quantiseReceiptMoney` (apps/api/src/sales/receipts/receipt-money.ts) is called at
exactly 2 sites in `receipt-vouchers.service.ts` (lines 169 and 301 — the `create` and
`createComposed` methods), both before persistence. Grepped every file that touches
`salesPaymentAllocations` (7 files) — all others only **read** the table (invoice-amend
adapters, cheques reopen/validation, POS AR mirror, audit registry); the code comment in
`cheques.validation.ts` states allocation rows are "only ever written inside
receipt-voucher..." — confirming there is exactly one write path, not a second unpatched
copy of the predicate.

Browser + DB: as owner, took a real payment (not synthetic — a genuine partial/full
collection against a live opening-balance AR invoice) of KWD 31.601 against invoice
`OB-OB_AR-0001-176` (customer Mohammed Al Fadhli 280). Posted receipt
`B1ALRAIMAINS-RV-00004`. Verified all three figures agree to 3dp by construction:

| | Amount |
|---|---|
| `sales_payment_allocations.allocated_amount` | 31.601000 |
| Invoice balance movement | 31.601000 → 0.000000 (paid_amount 31.601000) |
| GL leg (JRN-00064, both lines) | 31.601000 / 31.601000 |

Ledger identity `round(sum(debit-credit),6)` was `0.000000` immediately before and
immediately after this write.

Confirmed the known, deliberately-out-of-scope unfixed sibling still exists exactly where
stated: `refund-vouchers.service.ts:155` builds `amount` from raw unrounded input with no
quantisation call — left untouched, as instructed. No **other** unquantised copy found.

---

## VERIFY 4 — customer bulk-deactivate blast-radius guard — **VERIFIED**

Code: `CustomersService.updateCustomer` runs `blastRadius` + `enforceBlastRadius` whenever
`input.status === "inactive"`, with an explicit comment noting both the single `PATCH` and
`bulkUpdateCustomers` call through this one method, and that `bulkUpdateCustomers` always
passes `force=false` so bulk can never bypass the check.

Browser + DB: selected 3 real customers in the customers list — CUST-0454 (has 1 unpaid
confirmed invoice, KWD 3,390.748 outstanding) plus two clean customers CUST-0182 and
CUST-0410 (zero balance, no open orders) — and ran bulk "Set status → Deactivate". Result,
confirmed in DB:

- CUST-0454: **stayed `active`** (correctly blocked).
- CUST-0182 and CUST-0410: **became `inactive`** (correctly committed) — this is the
  partial-success behaviour the claim describes.

Also re-tested the **single-resource path** directly on CUST-0454's detail page ("More
actions → Deactivate") — same guard fired, dialog showed "Cannot deactivate: linked to: - 1
open sales invoice(s) with outstanding balance KWD 3390.748" and disabled the confirm
button; no crash, graceful degrade.

**Copy finding (LOW, confirmed, explicitly flagged as cross-module/out-of-scope per the
task):** that same single-customer dialog also displays the raw internal string
`"Cannot remove: 1 hard block(s) + 0 warning(s)."` directly above the plain-language
explanation. Traced to the shared `graph.service.ts` blast-radius module (used by
suppliers/items/customers alike), lines 273/309. A Kuwaiti shop owner would likely ignore
it and read the "linked to: ... open sales invoice(s)" line beneath it, but the jargon
sentence is still user-visible. The bulk-flow toast itself is fine and does not surface this
string — it only shows "N customers could not be updated."

---

## VERIFY 5 — draft documents no longer show a raw UUID — **PARTIALLY VERIFIED — 1 NOT FIXED**

**Detail-page title/breadcrumb: VERIFIED, both locales.**
- Existing draft credit note (`DRAFT-2470f4e8-...`) detail page: en shows breadcrumb + H1
  "New credit note"; switched to ar in-app (language switcher, not just a URL prefix) and
  confirmed breadcrumb + H1 "إشعار دائن جديد" — both correct, no raw UUID anywhere on the
  page.
- Created a fresh draft invoice (`DRAFT-4953bb68-...`, ZZTEST, Ahmad Al Mutairi 1, 1x
  ZZTEST-SKU-0001, never confirmed) to test the invoice side end to end: en shows
  breadcrumb + H1 "Draft invoice"; ar shows breadcrumb + H1 "مسودة فاتورة". No raw UUID on
  either detail page in either language.

**List rows: NOT FIXED.** Checked as explicitly instructed ("check no OTHER sales surface
still renders a raw DRAFT- string"):
- Invoices list, Draft filter → row shows `DRAFT-4953bb68-70b7-4ed5-85a1-87cb0da887d1` as
  the visible invoice-number cell (not "Draft invoice" or any humanised label).
- Credit notes list → same pattern for both existing draft credit notes:
  `DRAFT-2470f4e8-cfed-437c-8a54-d4d9a2f0ade2` and
  `DRAFT-44ec7ab5-c980-4d4c-9851-4505475fb91c` shown verbatim as the row's number.

So the fix reached the detail-page title/breadcrumb (both entity types, both locales) but
did not reach the list views, which is a different render path for the same number field.
This is exactly the "same predicate, only one copy patched" failure mode the briefing warned
about, just in a different shape (different component, not a duplicated query). Print
documents and CSV export were not checked (no confirmed draft ever prints/exports as a
document; export was not exercised this session for time) — call that scope **COULD NOT
VERIFY** rather than assuming it's clean.

---

## Summary

| # | Item | Result |
|---|---|---|
| 1 | Permission gates on create/edit surfaces | **VERIFIED** (+ 1 unrelated HIGH side-finding: `/sales/payments/new` 403s on `/tenant/branches` for accountant1, breaking the form independent of the permission-gate fix) |
| 2 | Pagination `keepPreviousData` | **VERIFIED** on the 2 lists with enough rows (customers, invoices); other 7 lists verified by code only, data too thin (0-3 rows) to browser-test pagination |
| 3 | Receipt allocation quantisation | **VERIFIED** — allocation/invoice/GL agree to 3dp, ledger identity held |
| 4 | Customer bulk-deactivate guard | **VERIFIED** — partial success confirmed in DB and UI, single-PATCH path shares the same guard |
| 5 | Draft documents show a label, not a UUID | **PARTIALLY VERIFIED** — detail pages fixed (both entity types, both locales); **list rows NOT FIXED** (still show raw `DRAFT-<uuid>` for both invoices and credit notes) |
