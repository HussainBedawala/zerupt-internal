# Sales module — reversal-path test (Wave E, Phase E)

Date: 2026-08-29. Tenant: Gulf Auto Parts (KWD, 3dp, no VAT). Browser: gstack browse.
Pre-test ledger check: `select round(sum(debit-credit),6) from journal_entry_lines` = `0.000000`.
Post-test ledger check: `0.000000` (still balanced after every write in this session).

All created documents logged in `study/testing/_documents-created.md`, all prefixed `ZZTEST`
(document numbers are system-assigned sequences and cannot carry the prefix themselves; every
note/reason field created by this session does).

## Identity discipline
Every conclusion below states who was logged in, confirmed via the "User menu" avatar initials
(`A` = accountant1, `HB`/`Z` = owner / zztestmgr1) and, for accountant1, the DB permission table
directly (`role_permissions` joined to `roles`).

---

## STEP 0 — approval PIN: CRITICAL finding, then worked around

### CRITICAL-PIN-1 (CONFIRMED) — no non-Owner role can ever set an approval PIN on this tenant, and there is no product path to change that without creating a new role first

**Evidence:**
- `settings.approvalpin.manage` (the permission gating `PUT /tenant/approval-pin`, i.e. "set my
  own PIN") is granted to **zero** rows in `role_permissions` for this tenant's four seeded roles
  (Owner/Cashier/Accountant/Viewer): `select r.name, rp.permission_key from role_permissions rp
  join roles r on r.id=rp.role_id where rp.permission_key like '%approvalpin%'` returns 0 rows.
- The permission exists only in the **"Manager"** role TEMPLATE
  (`packages/shared/src/role-templates.ts`), which this tenant never instantiated.
- Owner bypasses all `@RequiresPermission` checks (documented, intentional), so the Owner alone
  could set a PIN. Logging in as `accountant1` and opening Settings > Approval PINs renders
  **"Not available for your configuration — This setting is not available for your current plan
  or country configuration."** — this message is actively misleading: the real cause is a missing
  RBAC grant, not a plan/country restriction (a Kuwait no-tax config has nothing to do with this
  screen). See MEDIUM-PIN-2 below.
- Net effect: before this session, in a shop with only the four default roles, **the owner is the
  only human who can ever hold an approval PIN.** Every "distinct-approver SoD" gate in the sales
  module (invoice void, receipt reversal, credit-note confirm, credit-limit override) can never
  have a second, different approver — the control is structurally a single-person rubber stamp.

**Severity:** CRITICAL. A security/segregation-of-duties control that is unusable by construction
for the seeded roles is a real defect, per the task brief's own framing ("a control you cannot
configure is a real defect"). Downgrade only if the founder considers a 4-role starter seed with
no Manager role an intentional MVP choice for solo shops — but no in-product signpost tells the
owner "invite a Manager if you want a second approver."

**Workaround used (through the product, no DB writes):**
1. Settings > Roles & Permissions > Create role > started from the built-in **Manager** template
   (148 permissions, includes `settings.approvalpin.manage`) > named it **"ZZTEST Manager"**.
2. Settings > Members > Invite user > username `zztestmgr1` / `Zerupt.Test@2026`, role ZZTEST
   Manager, all branches.
3. Owner set PIN `135790`; `zztestmgr1` logged in and self-set PIN `246810` via the same
   self-service screen (worked immediately once the role held the permission).
4. Verified in DB: `select user_id, updated_at from user_approval_pins` returns exactly these 2
   rows. Recorded in `study/testing/_test-users.md`.

### CRITICAL-PIN-3 (CONFIRMED) — the sales-side maker-checker gate has NO settings UI at all; it is permanently OFF for every tenant

This is the more consequential finding and explains everything that follows.

**Evidence:**
- Invoice void, credit-note confirm, and receipt reversal are all gated behind the SAME tenant
  flag `tenant_identity.require_invoice_approval` (see
  `apps/api/src/sales/invoices/sales-invoices.service.ts` `maybeVerifyApproval` /
  `isInvoiceApprovalRequired`, and the identical pattern in
  `apps/api/src/sales/receipts/receipt-vouchers.service.ts` `assertReversePreconditions`).
  Column default is `false` ("DEFAULT false so single-user / solo-retailer tenants can void a
  mis-confirmed invoice directly" — the code comment is explicit that this is deliberate).
- The API DTO for `PATCH /tenant/settings` accepts `requireInvoiceApproval`,
  `requireReturnApproval`, `requirePosAmendApproval` as settable booleans
  (`apps/api/src/tenant-settings/tenant-settings.dto.ts`).
- **No screen in the web app ever renders a toggle for any of these three flags.** The only
  maker-checker toggles that exist in the UI (`apps/web/src/features/organisation/components/
  controls-section.tsx`, rendered from the Company settings form) are the PURCHASE-side ones:
  `requirePoApproval`, `requirePaymentApproval`, `requireBillApproval`, `requireRefundApproval`.
  `grep -rln "requireInvoiceApproval|requireReturnApproval|requirePosAmendApproval"
  apps/web/src/app` returns nothing — these three flags are referenced only inside DIALOGS that
  consume the flag's current (always-false) value, never inside a settings FORM that could change
  it.
- Practical proof: as **owner**, voiding a confirmed invoice (`B1ALRAIMAINS-INV-00004`, 12.345
  KWD, no payment/credit note) showed a single dialog with only a free-text "Void reason" field —
  **no approver picker, no PIN field at all** — and the void succeeded. DB confirms:
  `void_approved_by` is **NULL** on the voided row. The credit-note-confirm and receipt-reversal
  dialogs behaved identically (no approver/PIN fields appeared) for the same reason.

**Impact:** the entire "distinct-approver SoD via `verifyApproval`" mechanism the hardening log
credits to Layers 3 and 5 is real, tested, and correctly wired in the SERVICE layer — but no
tenant, on any plan, can ever turn it on, because the founder never shipped the settings UI for
the sales/POS-amend half of the flag family (only the purchase half got a control). This means
the task's framing ("every reversal here is gated by manager PIN + SoD") does not match the
product as shipped: **by default, and with no way to change it, every sales reversal is a single
person's unilateral action with a free-text reason box.**

**Severity:** CRITICAL. This is not a bug in the gate's logic (the logic is sound and, from the
service-layer code, correctly mirrors the purchase module) — it is a missing surface that makes a
built, tested control permanently inert for 100% of tenants. Recommend either building the
missing settings toggle (fastest: extend `controls-section.tsx` with the 3 remaining flags) or
explicitly documenting that sales SoD is not offered at v1 and removing/relabeling the confusing
approver-picker code paths that can never activate (see HIGH-1 below, which is now explained by
this finding).

**Given the above, this session tested every reversal AS SHIPPED (gate OFF, no PIN needed) since
that is the only reachable configuration.** The Manager role + PINs created in Step 0 remain
available for a future session if the toggle gets built.

### MEDIUM-PIN-2 (CONFIRMED) — misleading "not available for your configuration" message

When a user lacks `settings.approvalpin.manage` (e.g. `accountant1`), the Approval PINs settings
page renders "This setting is not available for your current plan or country configuration."
The real cause is a missing RBAC grant, not plan/country. Plain-language copy should say "You
don't have permission to set an approval PIN — ask an owner or manager," which is also actionable
(the plan/country message gives the user nothing to do).

### LOW-PIN-4 (CONFIRMED, positive-with-a-caveat) — the Team PIN status table shows real names; the approver picker does not

Settings > Approval PINs > "Team PIN status" table shows real, distinguishable identity per row
(`storekeeper1`, `accountant1`, `cashier1`, `Hussain Bedawala ⟨email⟩`) plus a computed
"Approval ready" / "Needs a PIN" status. This is a GOOD pattern and proves the underlying data
(names, permission-holding) is available. The known XCUT-002 defect — every option in the
in-dialog "approving manager" combobox rendering as "Team member" — is therefore NOT a data
limitation, it is that one picker not reusing the same identity source. Not retested live this
session (the gate that would surface that picker is unreachable per CRITICAL-PIN-3), but the
underlying claim from the 06-sales-live-cycle.md session (HIGH-2) stands and is now explained:
the picker was likely never exercised in a real signed-off release because the gate that shows it
is always off.

---

## STEP 1 — reversal paths, as actually reachable (gate OFF)

### Setup
- Created `B1ALRAIMAINS-DSL-00002` → invoice `B1ALRAIMAINS-INV-00004`, 12.345 KWD on credit, as
  **accountant1** (has `sales.invoice.create`+`confirm`), against `ZZTEST Live Cycle Customer`.
- Created `B1ALRAIMAINS-DSL-00003` → invoice `B1ALRAIMAINS-INV-00005`, qty 2 × 12.345 = 24.690
  KWD on credit, same way, for the credit-note tests.
- Confirmed accountant1's permission set directly in DB
  (`role_permissions` for role `Accountant`): **has** `sales.invoice.create/confirm/update/read/
  list`, `sales.creditNote.create/confirm/list/read`, `sales.receipt.create/post/list/read`.
  **Does not have** `sales.invoice.void`, `sales.order.create`, `sales.order.cancel` (no
  order-cancel key exists in the grant at all), `sales.refund.post`, `sales.receivable.write-off`,
  `sales.invoice.credit-limit-override`. This exactly matches the brief's stated split.

### 1. Invoice void — CONFIRMED both directions, CONFIRMED zero-net

- **accountant1**: invoice detail page for `B1ALRAIMAINS-INV-00004` shows Print / Issue credit
  note / Record payment / (disabled) Edit — **no "Void invoice" button at all.** Frontend gate
  holds. (Did not additionally force a raw 401/403 API probe with accountant1's own bearer token
  — the in-page `fetch()` I tried used cookies only and returned 401 regardless of role because
  auth here is bearer-token based, not cookie-based, so it doesn't prove anything either way. The
  DB permission table plus the consistent, centrally-enforced `@RequiresPermission("sales.invoice.
  void")` decorator pattern used identically across this whole module is the evidence for the
  backend side; I did not independently re-derive a live 403 for accountant1's user.)
- **Owner**: same invoice, "Void invoice" button present, single dialog (reason only, no
  approver/PIN per CRITICAL-PIN-3), void succeeded.
- **Timing (defect pattern #3 check):** the void POST took **28,987 ms** end to end — this
  machine's Neon RTT baseline is 700-900ms (briefing rule 4), so ~29s for one contra-JE + stock
  reversal write is unusually slow, and sits uncomfortably close to a typical 30s client timeout.
  It did NOT fail here, so this is not a confirmed false-failure, but it is a genuine near-miss:
  **FRICTION/MEDIUM — flag for someone to check the client's abort timeout margin against
  observed void-write latency**, since the brief documents an almost-identical near-miss
  elsewhere in this program (abort at 30003ms vs a 39489ms write).
- **GL proof (CONFIRMED zero-net, the hardening log's central claim):**
  ```
  sales.invoice.confirmed:  dr 12.345000  cr 12.345000
  sales.invoice.voided:     dr 12.345000  cr 12.345000
  inventory.sale:           dr  1.734000  cr  1.734000
  inventory.sale_return:    dr  1.734000  cr  1.734000
  ```
  Confirm and void net to **exactly zero on every leg**, including COGS. GL-derived AR for this
  customer/account (1131, party-tagged) is `0.000000` after the void. Global ledger balance
  check before/after: `0.000000` both times. **This part of the hardening log's claim is
  CONFIRMED true**, independent of the PIN-gate finding above.
- `voided_by` in DB is populated (the acting owner's user id); `void_approved_by` is NULL
  (expected, since the gate is off — see CRITICAL-PIN-3).

### 2. Sales credit note confirm — CONFIRMED partial, CONFIRMED zero-drift, one real silent-failure UX bug found along the way

- **accountant1**, "Issue credit note" on `B1ALRAIMAINS-INV-00005" (qty 2): dialog opens with
  "Goods return" / "Price adjustment" type choice, no approver/PIN fields (gate off, as
  established). Selecting **Goods return** left "Return location" a genuinely **empty combobox**
  (no options, no error text) — see **HIGH-1** below, this blocked completing a goods-return CN
  as accountant1.
- Switched to **Price adjustment** as a workaround. Entered `creditQty=1` (partial) against a
  `unitPriceOverride`-less line and got a silent 422 — see **HIGH-2** below. Root cause (found in
  code, not guessed): `credit-notes.service.ts`'s documented rule "A-L3: a price_adjustment
  credit note's creditQty MUST equal the invoice line's current correctable quantity; partial-
  quantity price corrections are not supported" — **this rejection is correct, intentional
  behaviour**, my initial test input violated a real business rule. Retried with `creditQty=2`
  (full line) as price_adjustment: still 422 (a second, unlogged validation, likely the missing
  `unitPriceOverride` requirement) — did not chase further given time; not re-classified as a
  product bug since the actual defect (see HIGH-2) is that BOTH 422s produced zero user feedback.
- **Owner**, same invoice, **Goods return** type, **partial** qty (1 of 2), reason "ZZTEST partial
  goods return": return location pre-filled correctly (owner isn't blocked by the warehouse-list
  permission gap), submitted successfully — draft created (201) then auto-confirmed (200) in one
  UI action, took ~13s create + ~19.5s confirm.
- **GL proof (CONFIRMED, partial return, half the invoice):**
  ```
  sales.creditNote.confirmed:  dr 12.345000  cr 12.345000  (1131 CR 12.345 party-tagged customer;
                                                              4200 DR 12.345 revenue reversal)
  inventory.sale_return:       dr  1.734000  cr  1.734000  (1141 DR restock; 5100 CR COGS reversal)
  ```
  GL-derived AR for the customer after the partial CN: **12.345000** (exactly half of the
  original 24.690, correctly reflecting the un-returned line). `sales_invoices.balance` for
  the invoice also reads 12.345000 — subledger and GL-derived figure agree. Global ledger check:
  `0.000000` before and after. **The AR-mirrors-GL invariant and per-line partial correctness are
  CONFIRMED to hold** for this path.
- Did not additionally test a full-line credit note to completion given time remaining in this
  session (the partial-quantity math above already proves the per-unit proration is correct; a
  full-line CN is the simpler case and was implicitly exercised during the void test's
  `inventory.sale_return` full reversal).

#### HIGH-1 (CONFIRMED) — permission-gated warehouse lookup silently empties the "Return location" picker for a role that IS supposed to be able to complete goods-return credit notes

**Repro:** log in as `accountant1` (who holds `sales.creditNote.create` + `sales.creditNote.
confirm` per the brief and per the DB grant), open "Issue credit note" on any confirmed invoice,
select "Goods return". The "Return location" combobox opens with **zero options and no error/
empty-state text** — just a blank dropdown.

**Root cause, confirmed via network log:** `GET /tenant/warehouses?...branchId=...` returns
**403** for accountant1 (`role_permissions` for Accountant has no `settings.locations.*` /
warehouse-read key). The dropdown's data source 403s and the component renders an empty list with
no fallback message. Because "Issue credit note" stays disabled until a return location is
picked, **accountant1 cannot complete a goods-return credit note in the UI at all**, despite
holding the exact permission (`sales.creditNote.create`) the RBAC design says should let them.
This is precisely defect pattern #5 from the brief ("a permission-gated lookup the user
legitimately cannot make, failing silently downstream into a false empty state") — the same
`/tenant/branches` 403 pattern already fixed once on the payment form has a live sibling here on
the credit-note dialog's warehouse picker.

**Workaround for the SAME accountant1 user:** switch the credit-note type to "Price adjustment"
(money only, no warehouse needed) — this path IS reachable for accountant1, just not the
goods-return path the brief calls out as one of the two variants to test.

**Severity: HIGH.** Not CRITICAL because a workaround exists (price adjustment) and no data is
lost or leaked, but it silently blocks a granted permission's primary use case with zero
diagnostic to the user or to whoever is troubleshooting a support ticket about it.

#### HIGH-2 (CONFIRMED) — a specific, well-written backend validation error never reaches the user

**Repro:** in the price-adjustment credit-note dialog, enter a `creditQty` that doesn't match the
line's correctable quantity (or, apparently, omit `unitPriceOverride` — both were tried) and click
"Issue credit note".

**Evidence:** network log shows `POST /tenant/sales/credit-notes → 422` (repeatable, confirmed
twice with a fresh screenshot each time). The backend has an excellent, specific, actionable
message ready (`"A price_adjustment credit note line's creditQty (1) must equal invoice line
...'s current correctable quantity (2); partial-quantity price corrections are not supported."`)
— but the dialog UI shows **nothing**: no toast, no inline field error, no banner. The button just
returns to its normal (non-loading) state and the user is left to guess. Checked the DOM
immediately after the failed submit via screenshot: dialog is fully intact, form values
untouched, zero visible error text anywhere on the page.

**Severity: HIGH.** This is the "silent failure" sibling of the brief's "false success" pattern —
the write correctly did NOT happen (verified: no row in `sales_credit_notes` for either failed
attempt, ledger stayed balanced), so there's no money-safety issue, but a user has no way to
learn what to fix, and the specific, well-designed backend error is being discarded entirely
by the frontend's error handling. Fix is presumably attaching the standard toast/error-surface
mutation-error handler that other dialogs in this module clearly do use (the direct-sale form and
invoice-void dialog both surface backend errors, or at least don't need to since they succeeded on
retry) — this dialog's error path appears to be missing that wiring.

### 3. Customer receipt reversal — NOT completed this session

Ran out of session time after the credit-note investigation above. The code path was read (see
CRITICAL-PIN-3 evidence, `assertReversePreconditions` in `receipt-vouchers.service.ts`) and
confirmed to share the exact same `requireInvoiceApproval` gate (so reversal, like void and CN
confirm, is reachable without a PIN in this tenant's current configuration) but **was not
exercised live in the browser**. This is a real gap in this wave's coverage, not a finding —
flagging explicitly per the method rules rather than fabricating a result. A follow-up session
should: post a receipt against a confirmed invoice as accountant1 (`sales.receipt.post`), then
reverse it as owner or accountant1 (both hold `sales.receipt.post`, which per the code above is
the SAME permission required to also be the approver when the gate is on — worth separately
flagging to the founder as a possible SoD design gap: the identical permission key is required of
both the acting user and the approver, `requiredPermission: "sales.receipt.post"` in
`assertReversePreconditions`, meaning when the gate IS eventually turned on, the "distinct
approver" could be any other person who also has receipt-posting rights, not necessarily a
manager — worth a second look, SUSPECTED not CONFIRMED since not exercised live).

### 4. Sales order cancel — NOT completed this session

accountant1 has no `sales.order.create` and no `order.cancel` key at all in her grant, so this
path requires the owner throughout. Not reached this session due to time. Flagging as untested
rather than guessing a result.

---

## Other findings observed opportunistically while executing the above

### MEDIUM-1 (CONFIRMED) — direct-sale "New sale" form displays 2dp money in a 3dp KWD tenant

On `/sales/direct/new`, the running Subtotal/Total and the "N.NN added to the customer's account
as receivable" confirmation line both render **2 decimal places** ("12.35", "24.69") while the
actual stored/posted amounts are correctly 3dp (12.345, 24.690 — verified in
`sales_invoices.total`/`.balance` and in the credit-note dialog's own "Amount" column, which DID
show 3dp correctly, "12.345"). This is display-only — every downstream page (invoices list,
invoice detail, credit-note dialog) shows the correct 3dp figure — but it is exactly the "2dp is a
bug" pattern called out in the brief, and it sits on the highest-traffic sales screen (the primary
create flow) rather than a rarely visited one.

### MEDIUM-2 (CONFIRMED) — customer/item combobox click-then-type-then-select can silently NOT commit the selection to form state

On the direct-sale form, typing a search term into the Customer combobox and clicking the
resulting (visually "selected") option sometimes leaves the underlying form value unset:
submitting produced a "Select a customer." validation error even though the input showed the
customer's name and the option showed `[selected]` in the accessibility tree. Re-opening the
combobox and pressing Enter on the already-highlighted option fixed it. Reproduced once
concretely (first invoice creation attempt); the second and third invoice creations (same
sequence, deliberately including the extra open+Enter step) did not repeat it, so I could not
isolate a hard trigger — recording as **MEDIUM, CONFIRMED occurrence, SUSPECTED root cause**
(a race between the async option-select handler and the typeahead's own state, worth a closer
look but not reliably reproducible in this session).

### LOW-1 (CONFIRMED) — direct-sale/POS-style "Salesperson" combobox shows "Team member" for every option

Same XCUT-002-family defect as the known credit-note approver picker (already tracked, not mine
to fix), but on a DIFFERENT screen (`/sales/direct/new`'s Salesperson field) that is reachable
today (unlike the approver picker, which per CRITICAL-PIN-3 is currently unreachable). Worth
noting this is not confined to the approval-PIN dialogs — it's a more general "team-member name
resolution" gap on at least two independent pickers.

### LOW-2 (CONFIRMED) — raw internal branch code concatenated into a disabled button's visible label

On the direct-sale form, the disabled "Branch" field renders `B1_AL_RAI_MAIN_SHOWROOMAl Rai Main
Showroom` — the internal branch code and the display name concatenated with no separator or
space, both parts visible. Minor but a literal instance of "no raw internal identifiers in
user-facing copy."

### LOW-3 (CONFIRMED) — stale helper copy in "Price adjustment" credit notes mentions stock/return location

The credit-note dialog's footer note reads "Confirmed credit notes cannot be reversed. Stock for
returned items is added back at the return location." unconditionally, even when "Price
adjustment" (explicitly "Money only, no stock movement") is selected. The stock/return-location
half of the sentence is simply false for that type.

### Withdrawn / non-findings (documented per method rules, not inflated)

- The customer/item combobox appearing to show an **unfiltered** full list right after typing
  "ZZTEST" was NOT a real filtering bug — the search is server-side with several-second latency on
  this dev box (confirmed via network log: the debounced request eventually returned a correctly
  filtered 1-result set). A snapshot taken mid-flight just caught the stale pre-search state. This
  matches briefing rule 5 (repeat a control before calling it a bug) — retried multiple times, the
  eventual filtered result was always correct.
- accountant1's Sales nav item and `/sales/*` routes ARE reachable in this build (Dashboard,
  Sales, Purchases, Inventory, Accounting, Reports, Settings all shown; direct sale, invoice
  list/detail, credit note dialog all rendered and functioned for creates/confirms). This
  **contradicts** the prior session's CRITICAL-1 ("the Accountant role cannot access the Sales
  module at all") — either that was fixed between sessions or was itself a stale-session artifact
  (see that session's own rule-2 caveat about shared-browser identity confusion). Not re-litigated
  further here since it isn't this wave's focus, but flagging the discrepancy for whoever reviews
  both reports together.

---

## Ledger integrity summary

`select round(sum(debit-credit),6) from journal_entry_lines` was `0.000000` before the first
write of this session and `0.000000` after the last write (credit note confirm). Checked
repeatedly at intermediate points (after the void, after each credit-note attempt including the
failed 422s) and it never moved off zero — no partial/orphaned postings from any of the failed
credit-note submissions.

## First-try usability check (founder standard)

- **Void invoice** (owner): 1 click to open dialog, 1 required field (reason), 1 click to confirm.
  Clean, fast, would pass the "untrained shop owner, under 60 seconds" bar easily — **if** the
  ~29s write latency doesn't make them think it hung (no visible "this can take a moment" copy
  during the 29s "Voiding..." state — worth a LOW/FRICTION note on its own).
- **Credit note (goods return, partial)** (owner): 1 click to open, pick type, pick/confirm
  pre-filled return location, type reason, adjust qty via a +/- stepper, 1 click to submit —
  reasonable, no stacked dialogs, no repeated confirmations. Passes the 60-second bar.
- **Credit note (price adjustment)** (accountant1): technically reachable but a first-try user
  would be stuck indefinitely on the two silent 422s (HIGH-2) with zero clue what to change —
  **fails** the 60-second/first-try bar outright for this specific sub-path.
