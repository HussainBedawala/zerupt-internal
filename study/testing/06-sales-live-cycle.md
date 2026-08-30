# Sales module — live cycle test (Wave E)

Date: 2026-08-28. Tenant: Gulf Auto Parts (KWD, 3dp, no VAT). Browser: gstack browse.
Pre-test ledger check: `select round(sum(debit-credit),6) from journal_entry_lines` = `0.000000`.
Post-test ledger check: `0.000000` (still balanced after every write in this session).

All created documents logged in `study/testing/_documents-created.md`, all prefixed `ZZTEST`.

## Identity discipline
- Logged in as `accountant1` first (confirmed via dashboard header initials "A" and DB role lookup) —
  found blocked from Sales entirely (see CRITICAL-1). Logged out (cleared the Supabase auth cookie
  and localStorage via JS, since no working "Log out" click path was found in the harness) and
  logged in as owner `anonymator8@gmail.com` (header initials "HB") for all money-flow testing.
  Every write below was performed as owner, branch = Al Rai Main Showroom
  (`B1_AL_RAI_MAIN_SHOWROOM`), confirmed via the "Viewing:" pill on every screen.

---

## CRITICAL-1 (CONFIRMED) — the Accountant role cannot access the Sales module at all

The task briefed accountant1 as "the primary invoicing persona." That is false on this build.

**Evidence:**
- UI: logged in as accountant1, selected Al Rai branch. The left nav shows only Dashboard,
  Purchases, Inventory, Accounting, Reports, Settings — **no "Sales" or "Point of Sale" item**,
  even though both appear immediately for the Owner role in the same branch.
- Direct navigation to `/en/sales/orders` and `/en/sales/invoices` as accountant1 renders
  "You don't have access to this page — Your role doesn't include the permission needed here."
- DB, decisive: `select rp.permission_key from role_permissions rp join roles r on r.id=rp.role_id
  where r.name='Accountant'` returns 76 permissions covering `accounting.*`, `purchase.*`,
  `inventory.item/stock.*`, `reports.*` — **zero `sales.*` permissions** except the read-only
  `reports.sales.view`. No `sales.order.create`, `sales.invoice.create`, `sales.receipt.*`,
  `sales.customer.*`, nothing.

**Impact:** in a real one-person-plus-bookkeeper Kuwaiti shop, the accountant is exactly the
person who would raise invoices and record customer receipts alongside the owner/cashier. As
shipped, that person can post journals and view purchase bills but cannot touch a single sales
document, not even read one beyond the aggregate report. This is either a genuine RBAC gap or a
stale seed that predates the sales-module build-out; either way it blocks the accountant persona
end to end. Recommend the founder decide the intended seed (a dedicated "Sales/AR" role, or widen
Accountant the way migration 0311 widened it for Purchase) rather than treating this as
self-evidently a bug — but the current state does not match the persona the task assumed.

**Severity note:** rated CRITICAL because it fully blocks a named persona from an entire module,
not because of any money-safety issue (nothing was posted or leaked). If the founder intended
Accountant to be purchase/GL-only and a separate role to own sales, downgrade to a documentation
mismatch (task briefing was wrong, not the product).

---

## HIGH-1 (CONFIRMED) — invoice detail page shows stale/false state after a successful payment

**Repro:**
1. As owner, on a confirmed invoice (B1ALRAIMAINS-INV-00002, balance 12.345 KWD), click
   "Record payment" → dialog pre-fills full balance, cash, today's date → click "Record payment".
2. Dialog shows "Posting..." then closes back to the invoice page.
3. The invoice page **still reads "Paid 0.000 of 12.345", "Balance 12.345", "No payments recorded
   yet"**, and the "Record payment" button is still enabled — exactly as if nothing happened.
4. DB, queried within seconds of step 2: `sales_receipt_vouchers` already has a **posted** row,
   `B1ALRAIMAINS-RV-00002`, for the full 12.345 KWD, correctly linked to the invoice's customer.
   The GL (`journal_entry_lines` via `journal_entries.source_document_id` = the invoice id) is
   correctly posted and balanced.
5. A manual hard reload of the same URL immediately shows the correct state: "Paid 12.345 of
   12.345", "Balance 0.000", receipt `B1ALRAIMAINS-RV-00002 · POSTED · 12.345` listed, "Record
   payment" now greyed out.

**This is defect pattern #2/#3 from the brief (false failure / stale success):** the write fully
succeeds and posts correctly, but the page the user is looking at does not reflect it. A cashier
who does not know to hard-refresh would reasonably conclude the payment did not register and
click "Record payment" again — the modal still offers the full original balance as the default
amount, so a second click would very plausibly record a duplicate receipt for the same invoice
(the amount field is not disabled by any client-side "already paid" guard visible on this stale
render). I did not attempt the double-click myself to avoid creating a genuine duplicate financial
document during an observation-only pass, but the state as rendered offers no protection against
it.

**Root cause (not confirmed, inferred):** the payment mutation's success handler is not
invalidating/refetching the invoice-detail query, only the dialog's own state.

---

## HIGH-2 (CONFIRMED) — SoD "approving manager" picker has no way to identify who is who

**Repro:** on a draft credit note (`ba4753b8-e6d5-427b-b7ab-294b3cea6b69`, goods return against
B1ALRAIMAINS-INV-00001), scroll to "Confirm credit note" → open the "Approving manager" combobox.

**Evidence:** the dropdown lists three options, and the accessibility tree confirms it is not a
screen-reader-only mislabel — all three are visually identical:
```
@e3 [option] "Team member"
@e4 [option] "Team member"
@e5 [option] "Team member"
```
There is no name, initials, email, or role shown to distinguish the three managers/owners who
could approve. This is the same picker pattern used for every PIN+SoD gate in the sales module
(credit-note confirm, receipt reversal, invoice void, credit-limit override per the hardening
log). A user cannot deliberately pick "the store manager" versus "the owner" versus a third
approver — they are choosing blind. This defeats the audit/segregation-of-duties purpose of the
control: the confirming user cannot verify they selected the right approver before entering that
approver's PIN, and an auditor reviewing a screen recording could not tell either. (The eventual
audit-log row presumably does capture the correct approverId once a PIN is entered and validated
— I did not confirm this because I do not have a working manager PIN for this tenant — but the
selection step itself is unusable as a control.)

**Not tested further:** I could not complete either the credit-note confirmation or an invoice
void because both require a real manager approval PIN, which was not provided to this testing
session and is (correctly) not discoverable by me from the DB. This is a scope limitation, not a
product finding — the PIN gate itself is working as designed (the "Confirm credit note" button
stayed disabled until both an approver and a PIN were supplied).

---

## MEDIUM-1 (CONFIRMED) — draft documents display a raw internal identifier as their "number"

Both a draft invoice and a draft credit note render as their page title, breadcrumb, and page
`<h1>`:
```
DRAFT-ad5589c3-9457-4d17-963f-191bf14af77a
DRAFT-44ec7ab5-c980-4d4c-9851-4505475fb91c
```
i.e. a `DRAFT-` prefix concatenated with what is structurally a UUID. This is not the entity's
real primary-key UUID (a different one), but it is still a raw, meaningless, UUID-shaped string
put directly in front of the user, on a screen a manager or accountant will look at routinely
while working invoices before confirming them. The brief explicitly flags "no raw UUIDs anywhere"
as a check; this is a narrower instance of the same smell (a machine-shaped identifier standing in
for a human document number) and should get a friendlier placeholder like "New invoice (unsaved)"
or simply omit the number entirely pre-confirm.

---

## LOW-1 (CONFIRMED) — delivery-fee helper copy mentions "tax" in a no-tax country

On the New sales order screen, the "Delivery fee (optional)" field's helper text reads:
> "Charged on top of the items. Tax on the fee is worked out for you."

Kuwait has no VAT/GST and the tenant correctly hides all other tax UI (no tax column, no tax rate
picker, no tax total anywhere in the invoice/order/direct-sale flows I tested). This one static
string is a leftover from the tax-aware copy path and should be conditioned the same way the rest
of the tax UI is (`resolveTaxPresentationMode` / `taxMode: "none"`, per the quotations codemap
notes on the same pattern already fixed there).

---

## LOW-2 (CONFIRMED, docs debt not app bug) — sales codemap lists wrong frontend routes

`erp/docs/CODEMAPS/sales.md` lists frontend routes as `/(app)/invoices`, `/(app)/sales-orders`,
`/(app)/customers`, `/(app)/sales-overview`. All four 404 in the real app. The actual live routes
(confirmed by walking the App Router tree and by successful navigation) are all under a `/sales/`
prefix: `/sales/orders`, `/sales/invoices`, `/sales/customers`, `/sales/direct`, `/sales/payments`,
`/sales/quotations`, `/sales/delivery-orders`, `/sales/credit-notes`, `/sales/debit-notes`,
`/sales/invoice-deliveries`. This cost real time in this session (multiple 404s before finding the
right paths) and would do the same to the next agent or engineer who trusts the codemap. Should be
regenerated via `/update-codemaps`.

---

## Confirmed working correctly (positive findings)

**Direct/express sale path — fully correct, end to end, fast.**
- Flow: customer picker (type-ahead, ZZTEST customer found on 2nd character group) → item picker
  (barcode/search, SKU matched) → qty/price editable inline → payment method pre-selected "Paid
  now / Cash" → "Save sale" — a single screen, no forced navigation, no stacked dialogs.
- Created `B1ALRAIMAINS-INV-00001` (12.345 KWD) + auto-created receipt `B1ALRAIMAINS-RV-00001`
  in one save.
- DB verification: invoice `status='confirmed'`, GL `JRN-00056` (DR AR 1131 12.345 party-tagged
  to the customer / CR Revenue 4110 12.345) and `JRN-00057` (DR COGS 5100 1.734 / CR Inventory
  1141 1.734) both `status='posted'` and individually balanced; stock ledger shows `-1.000000`
  qty at `unit_cost=1.734286`, which rounds to exactly the COGS JE amount (no drift). Receipt
  voucher `posted`, cash, 12.345.
- Good defaults observed: branch locked to the branch being viewed (cannot be fat-fingered to the
  wrong branch), salesperson pre-filled to the logged-in user, sale date and payment date default
  to today, no tax fields anywhere, KWD shown to 3 decimals everywhere including line/tax/total.
- **Could an untrained Kuwaiti shop owner do this in under 60 seconds?** Yes for a simple one-line
  cash sale: customer, item, save — 3 required interactions plus qty confirmation. No confirmation
  dialog is even required for the express/direct path (the write is immediate on "Save sale"),
  which matches "no unnecessary draft stage" from the founder's standard.

**Full SO → invoice → payment chain — also correct.**
- Draft SO created (customer optional, defaults correctly for walk-in), single "Confirm this
  order?" dialog (clear plain-language copy, no stacking), `B1ALRAIMAINS-SO-00001` confirmed.
- "Convert to invoice" — single dialog ("This will create a draft invoice from this order and mark
  the order as fulfilled") — created a genuinely separate draft invoice
  (`sales_invoices.source_order_id` correctly links back), SO status flipped to `fulfilled` in the
  DB immediately (a stale-looking screenshot mid-transition turned out to be a Next.js dev-server
  route-compile artifact, not a real bug — confirmed by reload showing the correct, already-
  navigated invoice page underneath).
- No separate "delivery order" step exists in this flow for this tenant/pack — the SO converts
  straight to a draft invoice. This matches the sales hardening log's Layer 2 note ("no separate
  delivery doc — deferred B2B"), so it is a known, deliberate scope decision, not a missing step I
  failed to find.
- Draft invoice confirmed via a single "Confirm invoice?" dialog with an optional due-date field;
  produced `B1ALRAIMAINS-INV-00002`. GL: `JRN-00058` (AR/revenue) + `JRN-00059` (COGS/inventory),
  both posted and balanced, same clean tie as the direct-sale path.
- Payment recorded via "Record payment" (see HIGH-1 for the display bug found here) — the
  underlying receipt, `B1ALRAIMAINS-RV-00002`, posted correctly for the full balance.

**Credit note issuance (up to the PIN gate) — form is well designed.**
- "Issue credit note" on a paid invoice offers a clear "Goods return" vs "Price adjustment"
  choice, a return-location picker (defaults to the branch), a required reason, and a
  qty-based line table (`max 1` correctly derived from invoiced minus already-credited qty) that
  computes the credit amount live and to 3dp. A draft is created on submit and requires an
  explicit second confirm step with manager approval — appropriately treated as irreversible
  ("Confirmed credit notes cannot be reversed. Stock for returned items is added back at the
  return location.").

**No tax UI leaked anywhere** in the direct sale, sales order, or invoice screens I reached
(Kuwait has no VAT/GST) — correctly derived, not hardcoded, matching the founder's mandate.

**No stacked confirmation dialogs** were seen on any screen — every irreversible action (confirm
order, convert to invoice, confirm invoice, record payment, issue credit note) is gated by exactly
one plain-language dialog, never two.

**Ledger integrity held throughout.** `round(sum(debit-credit),6)` over the whole
`journal_entry_lines` table was `0.000000` before this session and remained `0.000000` after every
one of the 4 posting writes made (2 invoices × 2 JEs each = 4 JEs, 2 receipts, all individually
balanced).

---

## Not completed in this pass (scope, not findings)
- Credit note **confirmation** (blocked on needing a real manager PIN — see HIGH-2).
- Invoice **void** (same PIN gate).
- Receipt **reversal**.
- **Quotation** path (`/sales/quotations/new`) — not reached this session due to time spent on
  the accountant-permission investigation and the browser-automation overhead (selector/dropdown
  interactions on this app's shadcn comboboxes needed several retries throughout — no product
  bugs found from that, just harness friction worth flagging for the next tester: use
  `input[placeholder='...']` or `[data-testid=...]` CSS selectors for these comboboxes, not
  accessibility-tree `@ref` clicks, which frequently landed on stale refs after a re-render).
- Printed invoice (raw-UUID-on-print check from the brief) — `window.print()` opens the OS print
  dialog, which the headless harness cannot inspect; would need a dedicated PDF-render check.
- ar/en parity and RTL layout — not checked this session; recommend a follow-up pass.
- Branch-scoping check (Al Rai's 3-warehouse trap) — not exercised since this session's sales
  documents were company-level/single-warehouse by default and I did not switch branches.
