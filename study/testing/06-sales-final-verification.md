# Phase E (Sales) — Final Independent Verification

Session: 2026-08-29. Ledger identity check BEFORE testing: `0.000000`. AFTER testing (post one
real write — a Discard of the stray draft receipt in item 6): `0.000000`. No drift.

Login identity was explicitly asserted before every conclusion below by checking the top-bar
avatar initial (`A` = accountant1, `HB` = owner) and/or a permission-gated screen's behavior.

---

## 1. Sales maker-checker toggles — VERIFIED (CONFIRMED)

- Route is `/settings/organisation` (not `/settings/company` as the task described — that page
  exists but only has Profile/Addresses; the "Approval controls" section with all approval
  toggles lives under Organisation).
- All six approval toggles present: purchase, supplier payment, void a bill, supplier refund,
  **cancel a sales invoice**, **customer returns** (credit notes) — the task named a third,
  `requirePosAmendApproval` ("correct a till sale"), also present. All three new ones confirmed
  present as switches, all OFF by default, matching DB (`require_invoice_approval=f,
  require_return_approval=f, require_pos_amend_approval=f`).
- Toggled `requireInvoiceApproval` ON as owner (HB), clicked Save Changes → DB column flipped to
  `t` immediately. Reloaded the page → switch still shows `[checked]` (persists).
- With it ON, opened the void dialog on a real confirmed invoice (`OB-OB_AR-0001-1`). Dialog now
  shows: "Approving manager" picker (Select a manager), "Approval PIN" field, and "Void reason"
  — this was previously reason-only. Did NOT submit (opening-balance invoice, must not touch).
  Clicked Cancel, dialog closed cleanly.
- Turned the toggle back OFF and saved. DB confirms `require_invoice_approval=f` again (all
  three columns confirmed `f|f|f` at session end).

**Side finding while in this dialog** — see item 5 below: the invoice's Receipts panel showed
a raw `DRAFT-<uuid>` for a draft receipt, not a friendly label.

## 2. Warehouse pickers as accountant1 — PARTIALLY VERIFIED

Confirmed clean accountant1 session throughout (avatar `A`; blocked from `/settings/organisation`
route entirely — "Not available for your configuration" — consistent with accountant lacking
company-settings access).

- **`/sales/invoices/new`: VERIFIED.** Warehouse ("Location") dropdown populated with Al Rai's
  three warehouses (Al Rai Main Showroom, Shuwaikh Central Warehouse, Transit) once a branch is
  picked. Selected a customer, searched "brake" (real catalogue hit), added
  `Brake Disc Front KYB Ford Explorer / GAP-BRKDSC-00046` as a line — line genuinely appeared in
  the Lines table with location, qty, price, and a computed total (29.291). This is a real add,
  not just a reachable screen. Did not click "Create draft" (left unsaved, no stray document).
- **Draft invoice detail add-item bar and invoice `/edit`: COULD NOT VERIFY within scope.**
  Attempting to open ANY invoice detail page as accountant1 initially appeared to render blank
  ("Sales/Invoices" header only, no body). Investigation via network log showed this was NOT a
  403 on the invoice itself (`GET /tenant/sales/invoices/{id}` returned 200) — it was this
  machine's Neon Singapore RTT (per the briefing's stated ~700-900ms baseline; several sales
  API calls on this page took 2-13 seconds). Waiting longer resolved it and the invoice loaded
  fully with correct data. **However, two calls on this same page consistently 403 for
  accountant1: `GET /tenant/settings` and `GET /tenant/warehouses?page=1&limit=2`.** The
  warehouses 403 appears to be a harmless probe (a second call with `branchId=` succeeds, which
  matches the DB fact that accountant lacks the plain `settings.warehouse.list` permission but
  does have the branch-scoped one used for real dropdowns). The `/tenant/settings` 403 is NOT
  harmless — it broke Print on this same page (see item 4). I did not get to re-verify the
  add-item bar on a genuine DRAFT invoice or the `/edit` page's warehouse field before time ran
  out; flagging as not personally observed rather than assuming pass.
- **Credit-note "Goods return" dialog and its edit fields: COULD NOT VERIFY.** Reached
  `/sales/credit-notes/new`, picked a customer, but the Invoice picker returned zero options for
  two different customers with real confirmed invoices (`Ahmad Al Mutairi 1` /
  `B1ALRAIMAINS-INV-00003`, confirmed/paid). **Ran this as a control under the OWNER account —
  same empty result.** Since it reproduces identically for the owner (who bypasses all
  permission checks), this is NOT an accountant-specific permission bug — it looks like a
  business-rule eligibility filter I don't understand (possibly credit notes require a specific
  invoice status not "Paid", or the fixture data has no eligible source invoices left). Did not
  chase further given time budget. Because I never got a line-editor open, I could not check its
  warehouse picker. Reporting as COULD NOT VERIFY, not as a regression, since it is unclear this
  is even the fixed surface.

## 3. "Voided" invoice status tab — VERIFIED (CONFIRMED)

- `/sales/invoices` (as owner) → clicked "Voided" tab → list re-filtered correctly to "1
  invoices", showing only `B1ALRAIMAINS-INV-00004` (status Voided). No 400, no crash, no console
  error.
- `/sales/credit-notes` → Status filter → "Voided" → list re-filtered (0 results, correct — no
  voided credit notes exist in this tenant), no error, "Clear filters" appeared correctly.

## 4. Customer-facing print output — PARTIALLY VERIFIED

- Opened a POSTED customer receipt (`B1ALRAIMAINS-RV-00001`) with a real allocation. The
  Allocations table's raw DOM (verified via `innerHTML`, not the flattened text dump which
  visually looked blank due to a rendering artifact in my terminal capture) showed
  `B1ALRAIMAINS-INV-00001` — a real invoice number — next to the allocated amount `12.345`.
  **Not blank, not a UUID.** Also checked the DRAFT receipt before discarding it (item 6): its
  allocation showed `OB-OB_AR-0001-1`, also a real number.
  - Title check ("Receipt" not "Invoice") and the ar-locale spot check: **COULD NOT VERIFY.** I
    could not find a reachable Print entry point on `/sales/payments/{id}` for either accountant1
    or owner in the time available — no Print button appeared in the detail panel snapshot for
    this document type (unlike invoices, which do have a visible Print button). This may mean
    receipt print is reached from a different surface (e.g. the customer's Payments tab) that I
    did not get to.
- Supplier payment voucher print at `/purchase/payments/{id}`: **NOT TESTED** — ran out of time
  budget after chasing the sales receipt print entry point.
- **Confirmed, unreported finding relevant to this item's spirit:** `GET /tenant/settings`
  returns 403 for accountant1, reproducibly, on the sales invoice detail page, and this DIRECTLY
  breaks Print for that role: the invoice detail page showed "This document cannot be printed
  yet — Your company details could not be loaded... ask an administrator to review your company
  settings." This is a real, personally-observed, CONFIRMED finding. Severity: **HIGH** — Print
  is a core, everyday action and accountant is a normal operating role, not an edge case. The
  UX message is honest and non-crashing (credit to the defensive-UX bar), but the underlying
  403 should not be happening for a role that needs to print documents.

## 5. Draft document numbers — ONE CONFIRMED LEAK, rest not swept

- **CONFIRMED NOT FIXED on the invoice detail page's Receipts panel.** Opening
  `OB-OB_AR-0001-1`'s detail page (as owner) showed, under "Receipts":
  `DRAFT-1583eb30-38a9-4a1d-a611-0002af038fe4` (verbatim raw UUID with `DRAFT-` prefix), for a
  draft receipt allocated against this invoice. This is exactly the class of defect the task
  says was "fixed in three rounds" — it is not fixed on this surface. Severity: **MEDIUM** per
  the task's own calibration, but note this is a fourth miss on a fix that keeps missing
  surfaces; worth escalating the fixing approach (grep every render site of the receipt/document
  number field, not another point-fix).
- I did not have time to sweep the other seven surfaces named in the task (Sales Overview
  widget, Payments list, debit-note list/detail, receipt detail, Customers tabs, invoices list,
  credit-notes list, in both en/ar). Given one fresh leak was found on the first surface checked,
  **do not treat the unswept surfaces as passing** — they are COULD NOT VERIFY, not VERIFIED.

## 6. Receipt draft Discard — VERIFIED (CONFIRMED)

- As accountant1, opened the real stray draft `f6696e82-b7a2-4a66-ac5f-061fa85ea992` at
  `/sales/payments/{id}`. Discard button present. Allocation showed a real invoice number
  (`OB-OB_AR-0001-1`), confirming item 4's data isn't blank for drafts either.
- Clicked Discard → confirmation dialog appeared exactly once ("Discard this draft? ... Cancel /
  Discard draft"), no stacked dialogs.
- Confirmed → redirected to `/sales/payments` list with a "Draft discarded" toast.
- Verified in DB: `select count(*) from sales_receipt_vouchers where id='f669...'` → `0`. Row is
  genuinely gone.
- Checked a POSTED receipt (`B1ALRAIMAINS-RV-00001`, as owner): no Discard button present (only
  Edit / Reverse payment). Correct — Discard is draft-only.
- Did NOT get to test the negative case for a role lacking the permission (`cashier1`) since the
  only stray draft was consumed by this test (by design — item 6 says this document exists to be
  discarded). No other draft receipts exist in the tenant to substitute. **COULD NOT VERIFY** the
  cashier1 negative case.
- Ledger identity re-checked after this delete: `0.000000`. Clean (expected — draft was never
  posted, no GL impact, matches the dialog's own copy).

## 7. i18n — NOT TESTED

Ran out of time budget before reaching the ar-locale checks (date-range placeholder, Quotations
breadcrumb) or the non-sales regression spot-checks. **COULD NOT VERIFY.**

## 8. The two open gaps — PARTIALLY ADDRESSED

**(a) False-empty-on-403 sweep as accountant1:** Found one NEW instance beyond the three already
known: **`GET /tenant/settings` 403s for accountant1** on the sales invoice detail page,
degrading Print (not a picker, but the same failure class — a permission gap surfacing as a
broken/degraded feature instead of a clean state). Did not complete a full walk of every sales
list/detail screen's every dropdown — time did not allow it. The `/tenant/warehouses?page=1&limit=2`
403 seen on the same page appears to be a benign secondary probe (the branch-scoped warehouse
call succeeds), consistent with the DB permission fact given in the task, but I did not verify
what UI element (if any) depends specifically on that unscoped probe endpoint.

**(b) Deep filter sweep:** Not attempted — time did not allow it. Confirmed only the status-tab/
status-filter behavior for item 3 above (which touches filtering) but did not exercise other
filters individually/combined, pagination-survival, or bidirectional sorting on any list.
**COULD NOT VERIFY.**

## 9. Regression check on permission gates — VERIFIED (CONFIRMED)

- `accountant1` on `/sales/orders/new`: clean, non-crashing denial banner — "You do not have
  permission to create orders. You can fill this form to check figures, but saving is turned off
  for your role." Form fields are visible/fillable but save is disabled. This is a defensible,
  well-designed denial (not a HIGH finding — arguably better than a hard block).
- `accountant1` on `/sales/invoices/new`: fully allowed — confirmed under item 2 above (added a
  real line to the Lines table).

---

## Summary of findings (ranked)

| # | Finding | Severity | Status |
|---|---|---|---|
| F1 | `GET /tenant/settings` 403s for accountant1 on sales invoice detail, breaking Print with an honest error message rather than crashing | HIGH | CONFIRMED |
| F2 | Draft receipt shows raw `DRAFT-<uuid>` in the invoice detail page's Receipts panel (4th miss on this class of fix) | MEDIUM | CONFIRMED |
| F3 | Credit-note "goods return" Invoice picker returns zero eligible invoices for two different customers with real confirmed invoices, reproduced identically for owner (rules out accountant-specific permission bug; likely a business-rule/data issue, not chased further) | MEDIUM (unconfirmed cause) | SUSPECTED |

## Items verified clean (CONFIRMED)

1 (toggles + void-approval gate + persistence + revert), 3 (Voided tab, both invoices and credit
notes), 6 (Discard flow, DB-confirmed delete, absence on posted), 9 (orders/new blocked cleanly,
invoices/new allowed with a real add-line).

## Items COULD NOT VERIFY (time budget exhausted, not assumed passing)

2 (draft-detail add-item bar, invoice `/edit`, credit-note line editor's warehouse field — the
credit-note dialog itself never opened due to F3), 4 (print title wording, ar print, purchase
payment voucher regression — Print entry point for receipts not located), 5 (7 of 8 named
surfaces unswept, in en and ar), 6 (cashier1 negative case — no substitute stray draft existed),
7 (all of it), 8a (full sweep beyond F1), 8b (all of it).

## Ledger integrity

`round(sum(debit-credit),6)` = `0.000000` before and after all testing. One real DB write this
session: discarding pre-existing stray draft receipt `f6696e82-...` (explicitly sanctioned in
the task). No documents created (no ZZTEST prefix entries added to
`_documents-created.md` — nothing else was persisted).
