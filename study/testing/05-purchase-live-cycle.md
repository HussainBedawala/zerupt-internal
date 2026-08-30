# Phase D — Purchase live browser cycle: PARTIAL RUN, blocked by browser-daemon instability

## Status: INCOMPLETE — stopped per method rules rather than burn budget on a dead browser

GL balance check (`sum(debit-credit)` over `journal_entry_lines`): **0.000000 before and after** —
write-safety invariant held. No pre-existing document, opening-balance journal, role, or
permission was touched.

## What was actually accomplished

1. Verified logged in as owner (HB / anonymator8@gmail.com), branch "Al Rai Main Showroom",
   confirmed via top-bar chip "Viewing: Al Rai Main Showroom" and user menu "HB" on
   `/en/purchase/suppliers` and `/en/dashboard`.
2. **Positive finding (FRICTION-none / good UX):** `/en/purchase/suppliers` search for "ZZTEST"
   correctly returned the empty state `"No suppliers match your filters."` — confirmed no
   pre-existing ZZTEST supplier, so this was genuinely the module's first ZZTEST document, not a
   leftover from an earlier dead session.
3. **Created supplier** `ZZTEST Auto Parts Supplier` via `/en/purchase/suppliers/new`.
   - Only "Name" is required (marked `*`); every other field (phone, email, tax number, tax
     group, payment terms, currency, credit limit) is optional with sane defaults
     (Status=Active, Tax group=None, Currency=blank→base). This matches the founder standard
     ("defaults over questions") well — an untrained owner can create a supplier with one field
     and one click.
   - Save produced toast "Supplier ZZTEST Auto Parts Supplier created".
   - **Verified in DB, not just the toast** (false-success hunt): `SELECT id, code, name FROM
     suppliers WHERE name ILIKE 'ZZTEST%'` returned
     `9151cc3f-785c-47d5-85fb-7736cf91f97c | SUP-0001 | ZZTEST Auto Parts Supplier`.
     Toast matched real DB row — no false success on this step.
   - Logged to `study/testing/_documents-created.md`.
4. **LOW/FRICTION (SUSPECTED, not confirmed as a real defect):** the new-supplier form shows a
   "Tax group" field with options `None` / `No Tax` even though Gulf Auto Parts is a Kuwait,
   no-VAT tenant. Per `feedback_hide_tax_in_no_tax_countries` this field arguably should not
   render at all for a no-tax country tenant. Severity kept LOW because: the field is optional,
   defaults to `None`, does not block the happy path, and I could not get far enough to confirm
   whether it actually affects any downstream tax computation (I never reached the PO/bill forms
   to check whether a tax line renders there too — see blocker below). Needs a follow-up pass
   with a healthy browser to confirm on the PO/bill screens specifically, since that is where a
   real no-tax violation would matter more.

## Blocker that ended the session

`browse` (the gstack headless Chromium daemon) was unstable for this entire session in a way
distinct from what the setup message described as fixed:

- The daemon's PID changed on almost every call for long stretches (`46223 → 47758 → 48409 →
  48869 → 49080 → 50416 → 51199`), each restart silently dropping the logged-in session and
  landing back on `/en/login` — consistent with the briefing's warning ("if the daemon restarts
  you will silently land back on /login"), so I treated every restart as a re-login requirement
  and did re-verify identity each time rather than assuming continuity.
- After several successful re-logins (confirmed reaching `/en/dashboard` and selecting the Al Rai
  branch, and successfully creating the ZZTEST supplier above), a subsequent login attempt hung
  indefinitely: the login `POST http://gulf-auto-parts.localhost:3000/en/login` stayed `pending`
  for 30+ seconds with the UI stuck on "Signing in...". `curl` confirmed both `localhost:3000`
  (307, alive) and `localhost:3001` (404 on `/health`, but port listening — process alive) were
  up and listening, so this was not the API/web servers being down. A `console --errors` capture
  during the hang showed one `net::ERR_CONNECTION_REFUSED` alongside benign preload warnings, but
  the log rotates and I could not pin down which request refused before the daemon itself timed
  out and force-restarted.
- Two follow-up attempts (`reload`, fresh `goto` to `/en/login`) both hit the browse tool's own
  15-second command timeout and triggered another daemon auto-restart, which per the task's
  explicit instruction ("if the browser becomes unusable for more than a few minutes, STOP and
  report back... a dead agent is not [valuable]") is the point I stopped rather than keep
  burning turns on a non-responsive tool.

This looks distinct from the two prior "truncated Chromium install" failures the orchestrator
already ruled out — the browser itself renders pages fine when it's up (I got real, correctly
formatted content back multiple times), the problem is repeated involuntary daemon restarts and
one genuine hang on the login POST specifically. I am not filing this as a product defect since I
could not isolate whether the hang was in the web app's auth flow, Supabase local auth, or the
browse daemon's own networking layer — it needs someone with shell access to the browse daemon
logs (not exposed to this agent) to diagnose.

## Mission items NOT attempted (blocked before I could reach them)

1. PO → confirm → GRN → supplier bill → supplier payment (order path) — not started beyond
   supplier creation.
2. Direct purchase / direct bill express flow — not started.
3. Reversal (purchase return or payment reversal) — not started.
4. accountant1 persona checks (bill entry + payment + clean-denial verification on excluded
   actions) — not started.
5. storekeeper1 at `/purchase` — not started.

## Recommendation

Re-run this phase once the browse daemon's login-hang / restart-loop is understood or a fresh
daemon instance is confirmed stable for a sustained multi-minute session (e.g. `browse status`
returning the same PID across 5+ consecutive calls spaced 10-20s apart) before spending further
budget on the remaining mission items. The one document created (`ZZTEST Auto Parts Supplier`,
`SUP-0001`, id `9151cc3f-785c-47d5-85fb-7736cf91f97c`) is real, DB-verified, and safe to build the
PO on in the next attempt — no need to recreate it.

---

# LIVE BROWSER WAVE — full cycle run (2026-08-27, owner HB, Al Rai Main Showroom)

Ledger check before first write: `0.000000`. All work done as owner (HB), branch
"Al Rai Main Showroom", identity re-asserted in the UI before every conclusion below.

## What was exercised for the FIRST TIME EVER in this tenant

The long-open TODO in the purchase hardening log is now closed. Every one of these
documents is the first of its kind in Gulf Auto Parts, created live through the real UI:

| Document | Number | Result |
|---|---|---|
| Goods receipt | `B1ALRAIMAINS-GRN-00001` | confirmed, stock in, JE correct |
| Supplier bill | `B1ALRAIMAINS-PINV-00001` | confirmed, AP raised, JE correct |
| Landed cost | `B1ALRAIMAINS-LC-00001` | posted, allocation + average cost correct |
| Supplier payment | `B1ALRAIMAINS-PAY-00001` | posted, AP cleared, JE correct |
| Direct purchase | `B1ALRAIMAINS-DPU-00001` | GRN+bill+payment created atomically |
| Purchase return | `B1ALRAIMAINS-PR-00001` | posted, inventory relieved correctly, **AP split wrong (see PUR-L01)** |

Ledger after the last write: `0.000000` (re-checked at the end of the run).

## POSITIVES — verified, not assumed

- **Order-path GL is exactly right, end to end.** GRN `Dr 1141 / Cr 2121 55.000` →
  bill `Dr 2121 / Cr 2111 55.000` (payable party-tagged) → payment
  `Dr 2111 / Cr 1112 55.000`. The GRN-accrual clearing account nets to zero across
  the chain. Verified by SQL on `journal_entries` / `journal_entry_lines`.
- **Direct path posts the IDENTICAL GL as the order path.** `DPU-00001` produced
  JRN-00027/28/29 with the same three-JE shape and the same accounts. No path
  divergence in the ledger — the signature POS defect does NOT reproduce here.
- **Direct purchase is genuinely one step.** One screen, no draft, supplier + item +
  qty + cost, "Save purchase" creates GRN, bill and payment atomically and lands in
  status `paid`. This is the best create flow I saw in the module.
- **Landed cost money math is correct.** `ZZTEST Freight` KWD 10.005 by value onto
  GRN-00001: allocation row 10.005000, `Dr 1141 10.005 / Cr 2111 10.005`, cost pool
  went to on_hand 36 / total_value 553.987 / average 15.388528 — and 553.987/36
  reconciles exactly. Weighted-average recalculation on receipt is sound.
- **Purchase return relieves inventory at the right cost.** 2 units at the pooled
  average 15.388528 = 30.777056; GL credited 1141 by 30.777 and booked the
  19.777 difference to 5210 Purchase Price Variance. `1192 Purchase Return Clearing`
  nets to exactly 0.000000 across the two JEs. Balanced and defensible.
- **Supplier payment has NO draft stage.** "Create payment" posts straight to the GL.
  Correct per the founder standard: the draft has to earn its place and here it does not.
- **Idempotency actually works.** I deliberately clicked "Save receipt" a second time
  after a successful receive. No duplicate GRN was created — the idempotency key held.
  `select count(*) from grns` stayed at 1. This is the single most valuable defensive
  behaviour I confirmed all run.
- **KWD is 3dp everywhere I looked** — PO, GRN, bill, payment, landed cost, return,
  and all list columns. The amount input placeholder is `0.000`. No 2dp anywhere.
- **Tooltip copy is genuinely plain-language and good.** e.g. on the GRN form:
  "Type how many actually arrived in this delivery. This is the only number you change."
  On landed cost: "the extra money it took to get your stock, on top of what you paid
  the supplier". This is the standard the rest of the product should be held to.
- **No tax UI on the PO, GRN, bill, payment or return screens** (Kuwait, no VAT).
  The one exception is the direct-purchase screen — see PUR-L05.
- **Destructive actions confirm exactly once**, with an honest irreversibility warning,
  and I saw no stacked dialogs anywhere in the module.

## FINDINGS

### PUR-L01 — HIGH — CONFIRMED — Returning against an already-billed GRN debits GRN Accrual instead of the supplier's payable

Returning goods against a GRN whose bill is already confirmed and paid posts the whole
AP side to `2121 GRN Accrual` and nothing to `2111 Trade Payables`. The supplier
sub-ledger therefore never shows the money the supplier owes back, and a clearing
account that must net to zero is left holding a permanent balance.

Evidence:

```
-- the return line, for a GRN line that IS fully billed:
select grn_line_id, bill_line_id from purchase_return_lines;
 grn_line_id 7f014cc7-e73f-4059-bd48-845411d72a53 | bill_line_id  <NULL>

-- but that same GRN line IS linked from the confirmed bill:
select id, invoice_id, grn_line_id from purchase_invoice_lines
  where invoice_id = '6c405e11-df85-46ae-90e5-302414e1558b';
 eb6af41b... | 6c405e11... | 7f014cc7-e73f-4059-bd48-845411d72a53

-- so the AP split went 100% accrual, 0% payable:
JRN-00030  Dr 2121 GRN Accrual 11.000 / Cr 1192 Purchase Return Clearing 11.000
```

`bill_line_id` is NULL on the return line, so `buildReturnApSplit`
(`apps/api/src/purchase/returns/`, documented in `purchase-returns-events.spec.ts:46`
as "DR payable (2111) + DR accrual (2121)") classified a fully-billed line as
accrual-only. The supplier's party-tagged AP balance is `10.005` (the landed cost
only) — the KWD 11.000 owed back for returned goods is invisible to AP aging and to
the supplier statement.

This compounds downstream. `accounting-events/listeners/purchase-refund-accounting.listener.ts`
posts the refund receipt against `lineType: "payable"` with the supplier's `partyId`,
and its own comment states the receipt "CLEARS the debit balance the return left
standing in the supplier's payable". That debit balance was never created. Recording a
supplier refund receipt for this return would therefore drive the supplier's AP
NEGATIVE by 11.000 while leaving 2121 permanently 11.000 in debit — two real ledgers
wrong in opposite directions, which is exactly the failure mode that listener comment
was written to prevent.

Repro: PO → confirm → Receive goods → Create bill → Confirm bill → Record payment →
Purchase returns → New → "A goods receipt" → pick that GRN → qty 2 → Save and post.

Note the UI offers "A goods receipt" or "A bill" as the return source and does not warn
that the receipt is already fully billed, so the wrong route is the natural one to pick.

### PUR-L02 — MEDIUM — CONFIRMED — Landed cost credited to Accounts payable creates an AP balance with no settleable document

`LC-00001` credited `2111 Trade Payables` KWD 10.005, party-tagged to the supplier.
That balance is real and correctly tagged, but no payable document exists for it: the
landed cost creates no bill. On the payment screen for that supplier, the "Which bills
does this pay?" table listed only `PINV-00001` (KWD 55.000). After paying that bill in
full the supplier's AP still reads:

```
select a.code, sum(jel.credit-jel.debit) from journal_entry_lines jel
  join accounts a on a.id=jel.account_id
  where jel.party_id='9151cc3f-785c-47d5-85fb-7736cf91f97c' group by a.code;
 2111 | 10.005000
```

There is no route in the purchase UI to clear it. The user is left with a permanent
10.005 owing to a supplier they believe they have paid in full. Marked MEDIUM rather
than HIGH because the amount is correctly tagged and visible in AP aging — it is
unsettleable, not lost.

### PUR-L03 — MEDIUM — CONFIRMED — Raw UUID shown as the document number on a draft landed cost

The landed cost detail page renders the internal placeholder number verbatim, in both
the breadcrumb and the page title:

`Purchases / Landed Costs / DRAFT-932e42eb-14a5-4582-91d2-1128ae8b1e55`
`Landed cost DRAFT-932e42eb-14a5-4582-91d2-1128ae8b1e55  [Draft]`

DB confirms `landed_costs.number = 'DRAFT-932e42eb-14a5-4582-91d2-1128ae8b1e55'` until
posting assigns `B1ALRAIMAINS-LC-00001`. Raw IDs in user-facing copy are banned by the
founder standard.

This is a same-module divergence, and the fix already exists a few files over: the draft
BILL has the identical `DRAFT-<uuid>` number in the DB
(`DRAFT-7b254a1f-4b40-459b-8d32-afd5d1937d09`) but its screen correctly renders
"New bill" instead. Apply the bill's treatment to landed costs.

### PUR-L04 — MEDIUM — CONFIRMED — Raw internal branch code shown as the branch value on three purchase screens

The branch control renders the internal code above the display name:

```
Branch   B1_AL_RAI_MAIN_SHOWROOM
         Al Rai Main Showroom
```

Confirmed on: landed cost create, supplier payment create, direct purchase create.
The same raw codes also appear in the branch-chooser gate
("صالة عرض الري الرئيسية · B1_AL_RAI_MAIN_SHOWROOM"). One shared control, so one fix.

### PUR-L05 — MEDIUM — CONFIRMED — Tax UI leaks onto the direct-purchase screen in this no-VAT Kuwait tenant

This is the extension of the already-known supplier-form "Tax group" leak that the task
asked me to chase, and it does matter where it landed. The direct purchase create screen
shows tax on both the line and the totals block:

- line: `KWD 7.515  +KWD 0.000 tax`
- totals: `Subtotal KWD 7.515 / Discount KWD 0.000 / **Tax KWD 0.000** / Total KWD 7.515`

I checked the other five screens specifically for this and they are CLEAN: the PO, GRN,
bill, payment and return screens show no tax UI at all. So the leak is confined to
direct purchase (plus the already-reported supplier form). Note the plumbing is present
but harmless underneath — `purchase_return_lines.tax_group_id` is populated with
`tax_amount 0.000000` — the defect is purely that the zero is rendered.

### PUR-L06 — LOW — CONFIRMED — Em dash used as the empty placeholder across the purchase module

Confirmed as the shared empty-value placeholder, not a one-off. Instances found:

1. Purchase orders LIST, "Expected delivery" column (already known).
2. Purchase order DETAIL, "Expected delivery" field.
3. GRN detail, "Delivery note" field.
4. Bill detail, "Due date" and "Supplier reference" fields (draft state).
5. Bill detail, "Supplier reference" field (confirmed state).
6. GRN create form, purchase-order picker label:
   `B1ALRAIMAINS-PO-00001 — ZZTEST Auto Parts Supplier (8/27/2026)` — this one is an
   em dash used as a SEPARATOR in live copy, not an empty placeholder, so a
   placeholder-only fix will miss it.

Em dashes are banned in product copy and this defect was already fixed once on the
dashboard. Fix it once in the shared empty-value/placeholder primitive, then sweep
separately for the separator case in (6).

The purchase RETURN create screen is clean — `document.body.innerText.match(/—/g)`
returned 0 there.

### PUR-L07 — MEDIUM — CONFIRMED — "Create landed cost" sits disabled with no statement of what is missing

After filling description, amount, allocation method, credit account and supplier, and
clicking "Add charge" successfully (component listed, "Total: 10.005"), the primary
button "Create landed cost" remained `[disabled]` with no message anywhere on the page
explaining why. The missing input was the "Target GRNs" listbox selection, which sits
far above the button and gives no validation hint. This is a dead end for anyone who
does not think to scroll back up and hunt.

Worse, arriving from the bill via "Add landed cost" passes `?grnId=<id>` but the GRN
arrived NOT pre-selected — the user is made to re-pick the exact receipt they just
navigated from. (SUSPECTED for the deep-link part specifically: my navigation passed
through a login redirect which stripped the query string, so the param loss may be the
redirect rather than the screen.)

### PUR-L08 — MEDIUM — CONFIRMED — Landed cost is written with two non-atomic requests

Creating a landed cost fires `POST /purchase/landed-costs` (201) and then a separate
`POST /purchase/landed-costs/{id}/components` (201). If the second call fails the user
is left with an orphan landed cost carrying no components and no total. There is no
single transactional endpoint.

### PUR-L09 — MEDIUM — CONFIRMED — Bill confirm dialog claims it receives stock even when the stock is already received

The confirm dialog reads:

> "Confirming posts the bill to accounts payable and receives stock. This cannot be
> undone, and the bill becomes read-only."

For a bill created from a GRN the stock was already received by the GRN, and the JE
confirms it (`Dr 2121 / Cr 2111` only — no inventory leg). Telling a shop owner that
confirming "receives stock" invites them to believe they have double-counted. The copy
is written for the direct/no-receipt path and reused unconditionally on the GRN path.

### PUR-L10 — MEDIUM — SUSPECTED — "Correct quantities" disabled on a GRN with a reason that is not true

On `GRN-00001`, immediately after receiving and before any sale or movement of those
units, the "Correct quantities" button was `[disabled]` with the tooltip:

> "Goods from this receipt have already been sold or moved, so it can no longer be
> un-received. You can still correct the cost, or raise a purchase return."

Nothing from that receipt had been sold or moved at that point. Marked SUSPECTED
because the item (`68a447c3`, Battery 12V 80Ah) has a company-wide cost pool with
pre-existing stock and prior movements, so the guard may be keying on item-level
movement rather than receipt-level movement. Either way the message as written is
false for the user and steers them to the wrong remedy.

### PUR-L11 — MEDIUM — CONFIRMED — Exchange rate field shown on the supplier payment form in a single-currency KWD tenant

The payment create form renders an "Exchange rate" input (value `1`) with the help text
"What one unit of the bill's currency is worth in your own money." Gulf Auto Parts is a
single-currency KWD tenant and full multi-currency FX is deferred post-launch per the
founder ruling. This is an irrelevant concept shown to a Kuwaiti shop owner, and per
the progressive-disclosure principle it should not be reachable at all here. (Filed as
a UI-visibility issue only — NOT as an FX behaviour bug, and not touching the
fail-loud guard.)

Note by contrast that the direct purchase screen shows no exchange rate field, so the
two paths already disagree on this.

### PUR-L12 — LOW — CONFIRMED — Premature validation error on the direct purchase line

Adding an item to a direct purchase immediately renders "Enter a positive cost." under
the unit cost field before the user has had any chance to type. Error copy should
appear on blur or submit, not on arrival.

### PUR-L13 — FRICTION — CONFIRMED — Raw "Line #1" placeholder while a return line loads

On the return create screen, after choosing a GRN the lines table renders
`Line #1  10  --  5.500` for roughly 20 seconds before the item name
("Battery 12V 80Ah Aisin Kia Cerato / GAP-ELEBAT-00003") resolves. A raw line ordinal is
not a usable identifier for a shop owner mid-load; the item name should come from the
GRN payload already fetched. A stale hint "Enter a quantity to see the total" also
persists next to an already-computed total of 11.000 after the quantity is entered.

## G8 — could an untrained Kuwaiti shop owner receive a supplier delivery on the first try in under 60 seconds?

**Yes, comfortably — this is the strongest flow in the module.** From the confirmed PO:

1. Click "Receive goods" (1 click).
2. The form arrives fully defaulted: purchase order pre-selected, receipt date = today,
   and "Qty to receive" pre-filled with the full remaining quantity (10).
3. Click "Save receipt" (1 click).

**2 clicks, 0 dialogs, 0 forced fields.** Nothing is asked that the system already knows
— no warehouse question, no date question, no supplier question. The only editable
number is labelled "Type how many actually arrived in this delivery. This is the only
number you change." That is exactly right.

The one real-world caveat is speed, not design: `POST /purchase/grns/receive` took
12.4 seconds to return on this machine (see the environment note below).

The bill and payment flows are also short: GRN → "Create bill" → "Confirm bill" →
confirm dialog = 3 clicks; payment = supplier + "Pay it all" + "Create payment".
The landed cost flow is the outlier and would defeat an untrained user, because of
PUR-L07 (disabled primary button with no stated reason).

## Environment note — NOT product findings

Recorded so the next agent does not re-file these as product defects.

- **Client-side route navigation hangs in this dev server.** After a successful
  mutation the screen frequently stayed on the old form with no visible change. The
  cause is Turbopack dev compiling the destination route: the RSC request sits pending
  for 25s+, e.g.
  `GET /en/purchase/landed-costs/new?grnId=...&_rsc=... → pending`.
  Every affected screen rendered the correct new state immediately on a hard reload,
  and the underlying POSTs all returned 200/201. I initially wrote this up as a
  silent-success defect and then disproved it — **it is dev-server latency, not a
  product bug.** Success toasts are fired by the code
  (`grn-create-panel.tsx:407`, `grn-detail-panel.tsx:120`) and auto-dismiss before a
  slow polling check can see them.
- **API latency is severe on this machine.** Warm reads 1.5-12s, writes 12-22s
  (`POST /purchase/payments` → 201 in 22.2s). Consistent with the known ~700-900ms
  Neon Singapore RTT plus dev overhead. No performance claim should be built on these
  numbers; PERF-002 already covers the browser-vs-curl gap.
- **The browse daemon restarted itself four times** during the run, silently dropping
  the session to `/login` each time. Re-login as owner + branch re-selection was
  scripted to recover. Identity was re-asserted in the UI before every conclusion above.

---

## THE TWO FIXES THAT JUST LANDED — verification

### FIX 1 (list `keepPreviousData` + refreshing spinner) — VERIFIED WORKING, both locales

Tested on TWO lists, in en and ar, watching the DOM at 1-second intervals across the
page change.

Suppliers list (`/en/purchase/suppliers`, 501 rows), clicking "Next page":

```
{"rows":25,"spin":["Refreshing"],"pg":"Showing 26–50 of 501"}   (x5 consecutive polls)
```

Bills list (`/en/purchase/invoices`, 298 rows), clicking "Next page":

```
{"rows":25,"spin":["Refreshing"],"pg":"Showing 26–50 of 298"}   (x5 consecutive polls)
```

Suppliers list in Arabic (`/ar/purchase/suppliers`, `dir=rtl`, `lang=ar`), clicking
"الصفحة التالية":

```
{"rows":25,"spin":["جارٍ التحديث"],"pg":"عرض 26–50 من 501"}   (x5 consecutive polls)
```

Confirmed on all three: the row count never drops to 0, so the table never blanks; the
spinner is exposed as `role="status"`; it is correctly translated in Arabic; and it
disappears once the fetch settles (a later poll returned `"spin":[]`), which is the
`isFetching && !isLoading` gate behaving correctly. The pager stays mounted throughout.
Arabic renders RTL with the correct 3dp currency (`‏9,269.381 د.ك.‏`) and no untranslated
strings in the table, filters or pager.

### FIX 2 (supplier bulk deactivate runs the blast-radius dependents check) — **NOT WORKING**

### PUR-L14 — HIGH — CONFIRMED — Supplier deactivation is NOT refused despite an open purchase order, on BOTH the bulk and the single-edit path

The stated expectation was that bulk-deactivating the ZZTEST supplier would be REFUSED
because it has an open PO, and that the refusal would surface in the per-row failure
toast. It was not refused, and neither is the single-edit path — so this is not a
bulk-vs-single divergence, it is that **neither path enforces the check on a status
change**.

Bulk path (`/en/purchase/suppliers`, filter to the ZZTEST supplier, tick its row,
"Set status" → "Deactivate"):

```
POST http://localhost:3001/api/v1/tenant/suppliers/bulk → 200 (10850ms)
toast: "Updated 1 suppliers."
```

```sql
select code, name, status from suppliers where id='9151cc3f-785c-47d5-85fb-7736cf91f97c';
 SUP-0001 | ZZTEST Auto Parts Supplier | inactive

select number, status from purchase_orders where supplier_id='9151cc3f-...';
 DP-22cf3812-...        | received
 B1ALRAIMAINS-PO-00001  | partially_received     <-- open dependent
```

Single-edit path (`/purchase/suppliers/{id}/edit`, Status → Inactive → "Save supplier"):

```
PATCH http://localhost:3001/api/v1/tenant/suppliers/{id} → 200 (9953ms)
resulting status: inactive
```

Both succeeded with an open `partially_received` PO. The supplier's own detail page
renders "Open orders 1" and "Outstanding balance KWD 10.005" at the same time, so the
dependency is known to the product and simply not consulted on the status transition.

I restored the supplier to `active` afterwards; verified `status = active`.

Two secondary defects observed in the same flow:

- **PUR-L15 — LOW — CONFIRMED** — the bulk success toast reads "Updated 1 suppliers."
  Unpluralised for a count of one.
- **PUR-L16 — MEDIUM — CONFIRMED** — a raw Zod validation string is rendered to the
  user on the supplier edit form when the Status field is empty:
  `Invalid option: expected one of "active"|"inactive"|"blocked"`.
  That is an internal schema message with internal enum values, shown verbatim. Error
  copy must say what to DO.

---

## PERSONA: accountant1 — the 28 newly granted purchase permissions

Identity asserted before and after: logged in as `accountant1@gulf-auto-parts-mt5kya1i.zerupt.local`
(read from the user menu), avatar "A", branch "Al Rai Main Showroom". Its nav is
correctly reduced versus the owner: Dashboard, Purchases, Inventory, Accounting,
Reports, Settings — no Sales, no Point of Sale.

### Direct answer to the mission question

**No. accountant1 CANNOT enter and pay a supplier bill end to end in the real UI.**
It is blocked at both halves, for two different reasons — one intended, one a defect.

- Entering a bill: it can only DRAFT. The bill form shows an honest up-front notice,
  "You cannot post bills — You can save this as a draft. Someone with permission to
  approve bills has to post it." That is consistent with the deliberate exclusion of
  bill approve, so end-to-end bill entry is impossible **by design** — worth stating
  plainly because the mission assumed otherwise.
- Paying: blocked by a **defect**, PUR-L17 below.

The green unit test was indeed not proof.

### PUR-L17 — HIGH — CONFIRMED — accountant1 can never submit a supplier payment: a permission-gated settings lookup permanently disables the button

On `/en/purchase/payments/new` as accountant1 the form renders an error above the
submit button:

> "Could not load approval settings. Refresh the page and try again."

and "Create payment" is `disabled: true` permanently. I completed every input the form
asks for — payment type Advance, supplier "ZZTEST Auto Parts Supplier SUP-0001",
amount 1.000, date defaulted, method Cash — and re-checked:

```
[{"t":"Create payment","dis":true}]
```

The cause is visible in the network log for this session: `GET /api/v1/tenant/settings
→ 403`. The screen needs the approval-gate settings, accountant1 is not permitted to
read that endpoint, and the failure is surfaced as a transient-looking error that
invites a refresh which can never succeed. The owner's identical screen shows no such
message and the button enables normally, so this is permission-driven, not incidental.

This is the addendum's defect pattern 3 exactly: a permission-gated lookup the user
legitimately cannot make, failing downstream. Per that pattern the fix is to source the
approval-gate flag from a payload accountant1 CAN already read — **not** to widen the
settings permission.

It is also a dead end and an error message that does not say what to do, both of which
the founder standard treats as findings in their own right.

### PUR-L18 — HIGH — CONFIRMED — accountant1 is told the branch has no stock locations when it has three

On the new-bill form as accountant1 the Location control renders:

> "No locations configured for this branch."

That statement is false. The branch genuinely has three warehouses:

```sql
select w.code, w.name from warehouses w join branches b on b.id=w.branch_id
  where b.id='43df4c2e-ec1b-4dc7-8f0d-d35a250c15e6';
 B1_AL_RAI_MAIN_SHOWROOM_TR   | Transit
 WH1_B1                       | Shuwaikh Central Warehouse
 B1_AL_RAI_MAIN_SHOWROOM-MAIN | Al Rai Main Showroom
```

The cause is `GET /api/v1/tenant/warehouses?page=1&limit=2 → 403` for this user. The
empty result is then rendered as a confident factual claim about the tenant's setup
rather than as "you cannot see locations". An accountant who believes it will conclude
the branch is misconfigured and escalate. It also blocks adding any item line to a bill.

Same pattern and same prescription as PUR-L17: source the location list from something
accountant1 can read, or say honestly that it is not visible to this user.

### PERM-004 pattern — where accountant1's exclusions are clean and where they are not

The mission asked whether the deliberate exclusions give a CLEAN denial or the PERM-004
"fully interactive form that only blocks on submit". The answer is split, and the good
examples and the bad ones are in the same module:

| Excluded action | Route | Behaviour | Verdict |
|---|---|---|---|
| Post/approve bill | `/purchase/invoices/new` | Form renders WITH an explicit banner: "You cannot post bills — You can save this as a draft. Someone with permission to approve bills has to post it." | **CLEAN.** Up-front, plain language, and it names the workaround. This is the pattern to copy. |
| Receive goods (GRN) | `/purchase/grns/new` | Form renders WITH banner: "You cannot post receipts — You do not have permission to record goods receipts. Ask your administrator." | **CLEAN** message, but the "Save receipt" and "Save as draft" buttons still render below it. |
| Create purchase order | `/purchase/orders/new` | Fully interactive form. No banner, no gate, no notice of any kind. | **PERM-004 — FINDING** |
| Supplier master data | `/purchase/suppliers/new` | Fully interactive form. No banner. | **PERM-004 — FINDING, confirmed to submit** |

### PUR-L19 — MEDIUM — CONFIRMED — PERM-004 on purchase order create and supplier create for accountant1

For supplier create I carried it through to submit. I filled the form with
"ZZTEST Denied Probe Supplier" and pressed "Save supplier":

```
POST http://localhost:3001/api/v1/tenant/suppliers → 403
```

DB confirms no row was created (`select count(*) from suppliers where name like 'ZZTEST%'`
returns 1, the pre-existing supplier only). **The backend enforces correctly — there is
no authorization bypass here.** The defect is purely that the frontend never gated the
route or the form, so the user does the whole data-entry job and is refused at the end.

`/purchase/orders/new` presents the same ungated interactive form; I did not carry that
one through to submit, so its submit-time refusal is SUSPECTED to be the same 403 by
symmetry.

---

## PERSONA: storekeeper1 — recorded, and a correction to the mission's premise

Identity: avatar "S", logged in successfully, no branch scope prompt.

### The premise "storekeeper1 has NO role at all" is WRONG — it has the Viewer role

I checked before drawing any conclusion, and it changed the answer materially:

```sql
select ur.user_id, r.name,
       (select count(*) from role_permissions rp where rp.role_id=r.id) perms
  from user_roles ur join roles r on r.id=ur.role_id;
 da7126c7-... | Owner      |  0   (owner is unrestricted, not permission-listed)
 48123301-... | Cashier    | 20
 bfdf55a3-... | Accountant | 87
 1a997a70-... | Viewer     | 72
```

`GET /tenant/me/permissions` returned a **1719-byte** payload for storekeeper1 (against
2265B for accountant1's 87 permissions) — consistent with the Viewer role's 72
permissions and flatly inconsistent with "no role". storekeeper1 is the Viewer.

**This matters: I was one step from filing a CRITICAL that would have been false.** What
storekeeper1 sees on `/purchase/invoices` is the entire AP book — "298 bills", "296
overdue bills · outstanding 1,346,117.088", every bill's amount, balance and due date —
plus the full PO book on `/purchase/orders`. Every list call returns 200:

```
GET /api/v1/tenant/purchase/invoices?page=1&limit=25   → 200
GET /api/v1/tenant/purchase/invoices/summary           → 200
GET /api/v1/tenant/suppliers?limit=100&status=active   → 200
```

Read as "a user with no role reads the whole payables ledger" that is alarming. Read
correctly — a **Viewer** reading purchase data — it is exactly what the Viewer role is
for. **This is NOT a security finding.** No storekeeper template exists, so nothing
here says anything about a storekeeper persona; it says the account is a Viewer.

### PUR-L20 — MEDIUM — CONFIRMED — write-action buttons render unconditionally for a read-only Viewer

storekeeper1 (Viewer) is shown, with no gating: "New direct purchase" and "New purchase
order" on `/purchase`; "New order" and "Export CSV" on `/purchase/orders`; "Receive
goods" and "Export" on `/purchase/grns`; "New bill" and "Export CSV" on
`/purchase/invoices`. Per checklist item B, action buttons must be gated individually.
This is the same PERM-004 family as PUR-L19 and should be fixed with it.

### PUR-L21 — MEDIUM — CONFIRMED — Purchase overview AP aging renders raw supplier UUIDs, because the name lookup batches ~300 ids into one URL and 400s

On `/en/purchase` the "Accounts payable aging" table renders raw UUIDs in place of
supplier names for every row:

```
2181a086f            KWD 0.000  KWD 2,748.573 ... KWD 2,748.573
d1695f68-ebc5-4910-b064-479e2900f411   KWD 0.000  KWD 5,682.274 ... KWD 5,682.274
666c08b2-b485-4076-a3d8-8064a2ac212b   KWD 0.000  KWD 2,626.913 ... KWD 2,626.913
```

Cause, from the network log — the panel puts roughly 300 supplier ids into a single
query string and the API rejects it:

```
GET /api/v1/tenant/suppliers?ids=011e4e87-...<~300 comma-separated uuids>... → 400
GET /api/v1/tenant/suppliers?ids=9151cc3f-785c-47d5-85fb-7736cf91f97c        → 200
```

**Important correction to my own first reading.** I initially attributed this to a
permission-gated lookup, which would have been wrong twice over. It is a **400, not a
403**, so it is batch-size driven and role-independent — it will reproduce for any user
on any tenant with enough suppliers, the owner included. (Owner reproduction is
SUSPECTED only: I did not open `/purchase` as the owner.)

A related but DIFFERENT and benign effect: on the orders and bills LISTS the supplier
column shows raw UUIDs *transiently*, for roughly 20 seconds, until a smaller `?ids=`
batch (24 ids) returns 200 and the names resolve. I watched that same page resolve to
"ZZTEST Auto Parts Supplier" on a later poll. That one is slow-load cosmetics on this
dev machine, **not** a defect — recorded here so it is not re-filed as one.

The permanent case is the overview, and per the "names-only directory endpoints"
principle a name should never fail to render; the fix is to chunk the id batch (or read
names from the aging payload itself).

## Additional non-findings and observations

- Dashboard Quick Actions offer "Open POS" and "New Invoice" (`/en/sales/invoices/new`)
  to accountant1 even though Sales and POS are absent from its nav. Noted, but it is the
  dashboard, outside this phase's scope.
- The suppliers LIST has a **"TRN"** (tax registration number) column and the supplier
  form has "Tax number" and "Tax group" fields in this no-VAT Kuwait tenant. This is the
  already-known supplier tax leak; recording the list column as an additional instance
  for whoever fixes PUR-L05.
- The GRN accrual account (2121) carries a large pre-existing seed balance, so the
  11.000 left by PUR-L01 is not detectable from that account's aggregate alone. Any
  check for this defect must trace the individual document chain, not the account total.

## Final ledger check

```
select round(sum(debit-credit),6) from journal_entry_lines;  ->  0.000000
```

Balanced before the first write and after the last. Every document created is logged in
`_documents-created.md`. No pre-existing document and none of the four opening-balance
journals were voided, deleted or edited. The ZZTEST supplier was left `active`, as found.
