# Phase D (Purchase) — independent fix verification

Verifier: independent agent, did not write any of the code under test.
Date: 2026-08-27. Tenant: Gulf Auto Parts (Kuwait, KWD 3dp, no VAT, auto-parts pack).
Users exercised: owner `anonymator8@gmail.com`, `accountant1`. Branch: Al Rai Main Showroom.

Ledger identity `select round(sum(debit-credit),6) from journal_entry_lines`:
**0.000000 before the first write** and **0.000000 after the last write**. No dead-lettered
outbox rows at any point (`accounting_event_outbox where status<>'completed'` = 0).

Documents created are logged in `_documents-created.md`.

---

## A. The money fix (return against an already-billed GRN) — **VERIFIED**

### A1 — before state (observed by me, SQL)
| thing | value |
|---|---|
| GL 2121 GRN Accrual | -8889.000 |
| GL 2111 Trade Payables | -1346127.093 |
| GL 1192 Purchase Return Clearing | 0.000 |
| GL 1141 Merchandise Inventory | 9490034.016 |
| `item_cost_pools` total_value | 9490034.016 (**tied exactly to GL 1141**) |
| PR-00001 `refundable_amount` | 0.000000 |
| PR-00001 `matched_breakdown` | NULL |
| ledger identity | 0.000000 |

The pre-fix posting was confirmed present: `JRN-00030 DR 2121 11.000 / CR 1192 11.000`.

### A2 — void PR-00001 (through the UI) — **VERIFIED**
`POST /tenant/purchase/returns/03f6a690.../void` → **HTTP 200**, detail page then read
"Voided. All journal entries have been reversed."

The deliberate legacy fallback posted the **exact contra**:
```
JRN-00032  DR 1192 11.000 / CR 2121 11.000     (mirror of JRN-00030)
JRN-00033  DR 1141 30.777 / CR 1192 11.000 / CR 5210 19.777   (mirror of JRN-00031)
```
- 2121 returned to **-8900.000**, i.e. exactly its pre-return balance (-8889 - 11). Correct.
- 5210 Purchase Price Variance returned to **0.000**. 1192 returned to **0.000**. 2111 untouched.
- Ledger identity still 0.000000. Stock re-received (+2 units), and the return became
  re-raisable ("Already returned 0" on the new-return screen).

Nothing was left half-unwound in the GL. **One real defect surfaced here — see finding A-F1.**

### A3 — re-raise the same return against the same GRN line — **VERIFIED**
`POST /tenant/purchase/returns` → **HTTP 201**, `B1ALRAIMAINS-PR-00002`.

```
JRN-00034  DR 2111 Trade Payables 11.000 / CR 1192 11.000     <-- the fix
JRN-00035  DR 1192 11.000 + DR 5210 18.678 / CR 1141 29.678
```
DB row: `refundable_amount = 11.000000`, `matched_breakdown = {"f6fedcda-…": "1.000000"}`
(fully matched). **2121 was NOT touched** — no phantom debit that no future bill can clear.
Exactly what was claimed.

### A4 — AP reflects the refund owed — **VERIFIED**
Party-tagged 2111 for supplier `9151cc3f` (ZZTEST Auto Parts Supplier), full history:
```
-55.000 (bill) -10.005 (landed cost) +55.000 (payment) -7.515 (bill) +7.515 (payment)  = -10.005
+11.000 (JRN-00034 return)                                                              = +0.995
```
The supplier now carries a **debit** balance of KWD 0.995 — i.e. the 11.000 refund is owed to
us, netted against the 10.005 unpaid landed cost. Arithmetically correct.

Ledger identity after step 4: **0.000000**.

### A-F1 — inventory GL vs cost-pool break introduced by the VOID — **HIGH, CONFIRMED**
The void's GL contra restores inventory at the **average cost** it left at (`DR 1141 30.777`),
but the stock side re-receives the goods at the **GRN unit price**:
```
stock_ledger_entries for PR-00001:
  purchase_return  -2.000000 @ 15.388528 = 30.777056     (confirm)
  grn_receipt      +2.000000 @  5.500000 = 11.000000     (void)   <-- asymmetric
```
`item_cost_pools` therefore moved +11.000 while GL 1141 moved +30.777.

| | before void | after void | now (end of session) |
|---|---|---|---|
| GL 1141 | 9490034.016 | 9490064.793 | 9490045.630 |
| Σ `item_cost_pools.total_value` | 9490034.016 | 9490045.016 | 9490025.853 |
| **difference** | **0.000** | **19.777** | **19.777** |

They tied **exactly** before the void and are out by exactly the PPV amount (19.777) after it,
and the gap has not closed since. The confirm side is symmetric (PR-00002: GL -29.678, pool
-29.678); only the void path is asymmetric.

Not a blocker for the money fix itself (the AP/GL side of the claim is fully correct and the
ledger stays balanced), but the inventory sub-ledger no longer reconciles to the control
account for this tenant. Fixing the void's stock re-receipt to use the same average cost the
GL contra uses (or valuing the GL contra at the re-receipt cost) would close it.

---

## B. Sub-half-fils rounding — **PARTIAL** (code + test verified; **not** reproduced in the UI)

**I did not reach the failure state through the UI, and I am not claiming UI verification.**

What I tried, in the browser, end to end: PO-00002 (3 @ KWD 1.000) → GRN-00004 → "Create bill"
→ edited the bill line's unit cost to **0.999889** (the field accepted 6dp), which would give a
3 × 0.000111 = 0.000333 variance against the receipt. On Confirm the bill posted **HTTP 200**
as `PINV-00004` with a clean two-leg JE `DR 2121 3.000 / CR 2111 3.000` — because the edited
unit cost **was silently discarded**; the DB row shows `unit_price = 1.000000`. The line-level
Discount field, the other documented route to a non-terminating unit cost, is locked on a
GRN-linked bill line ("Set the discount on the purchase order instead"). So this document
could not be pushed into the sub-half-fils state.

Verified instead at code and test level:
- `apps/api/src/journal-entries/journal-posting.service.ts` `normalizeAndValidateLine` now
  **returns `null`** (drops the leg) when a genuinely non-zero amount rounds away to zero on
  BOTH the functional and the transaction side, instead of throwing. A leg that was zero in the
  raw payload still throws — that is still treated as a data error.
- Step 2b refuses to go below two legs after rounding; step 4 absorbs the resulting functional
  residual into account **4840 FX Rounding Difference** as one zero-TC plug leg, with a
  materiality guard (`tolerance = legCount × 10^-fdp`) that still rejects a real imbalance.
- Account 4840 exists and is active in this tenant, so the KWD-only residual path has somewhere
  to land (this was the obvious remaining hole and it is closed).
- `npx jest journal-posting --no-coverage` → **Test Suites: 1 passed, Tests: 113 passed**. The
  suite contains the exact scenario (spec line 1090: "10 units at 9.6666666 billed at the
  supplier's 3dp price of 9.667 yields a price variance of 0.000333") asserting the entry
  **posts, dropping the rounded-away leg**.

Per method rule 1 a green test is not proof for users, so this stays **PARTIAL**, not VERIFIED.

### B-F1 — bill line unit-cost edit silently discarded — **MEDIUM, CONFIRMED**
On a GRN-linked bill line the Unit cost input accepts a typed value (I entered `0.999889` and
the input held it), but Confirm posts the receipt's price and the typed value is thrown away
with no warning and no "unsaved changes" prompt before an explicitly irreversible action
("This cannot be undone, and the bill becomes read-only"). The adjacent Discount field is
correctly locked with an explanation; unit cost should behave the same way, or actually save.

---

## C. Accountant persona — **PARTIAL**

### C1 — accountant1 can post a supplier payment — **VERIFIED**
Logged in as accountant1 (identity re-asserted via the user menu:
`accountant1@gulf-auto-parts-mt5kya1i.zerupt.local`). `/purchase/payments/new` rendered, the
**Create payment button was enabled**, and `POST /tenant/purchase/payments` returned
**HTTP 201** → `B1ALRAIMAINS-PAY-00003`, detail page showing **Posted**.
DB: `JRN-00036 DR 1161 Supplier Advances 1.234 / CR 1112 Cash Register 1.234`.
The previously fatal `GET /tenant/settings → 403` **still happens** (I observed it on every
purchase screen as accountant1) but it no longer disables the button. The fix is real.

### C2 — bill create no longer claims "No locations configured for this branch" — **VERIFIED**
`/purchase/invoices/new` as accountant1: the message is gone, and the Location combobox is
pre-filled "Al Rai Main Showroom" and lists **all three** Al Rai warehouses
(Al Rai Main Showroom, Shuwaikh Central Warehouse, Transit) — despite
`GET /tenant/warehouses?branchId=… → 403`. The value is now sourced from a payload the
accountant can read. Correct fix, not a widened permission.

### C3 — permissions not widened — **VERIFIED**
```
 Accountant | 28 purchase permissions | 87 total
 Viewer     | 16 | 72
 Cashier    |  0 | 20
 Owner      |  0 |  0   (owner bypasses RBAC)
```
Accountant is still exactly **28**. No `purchase.supplier.create`, `purchase.order.create`,
`purchase.grn.create`, `purchase.bill.approve` or `.void`.

### C4 — deliberate exclusions give a clean denial — **MIXED**

| exclusion | result |
|---|---|
| GRN receive | **CLEAN.** List button disabled with tooltip "You don't have permission to receive goods."; the `/grns/new` route itself shows "You cannot post receipts — You do not have permission to record goods receipts. Ask your administrator." |
| Bill post/approve | **CLEAN.** `/invoices/new` shows "You cannot post bills — You can save this as a draft. Someone with permission to approve bills has to post it." |
| PO create | **NOT CLEAN** — see C-F1 |
| Supplier master data | **NOT CLEAN** — see C-F2 |

### C-F1 — PO create route not gated for accountant1 — **MEDIUM, CONFIRMED**
`/purchase/orders` correctly disables "New order" with the tooltip "You do not have permission
to create purchase orders." But navigating to `/purchase/orders/new` directly renders the
**full, interactive form with an enabled "Create order"** and **no denial banner** — unlike
`/grns/new` and `/invoices/new`, which both carry one. This is the PERM-004 pattern the
programme already tracks, and it is a path divergence: the same fix landed on two of the four
create routes and not on this one.

On one of two loads this route also showed the misleading empty state
**"No active suppliers found. Add a supplier first."** while 501 active suppliers exist and the
accountant can in fact read suppliers (the payment screen listed them). It did not reproduce on
reload, so I record it as **SUSPECTED** — but the copy is wrong either way: it tells the user to
do something they also have no permission to do.

### C-F2 — supplier create route not gated; full form, denial only on submit — **MEDIUM, CONFIRMED**
`/purchase/suppliers/new` renders the complete supplier form with an enabled "Save supplier"
for a user with no `purchase.supplier.create`. Submitting gives
`POST /tenant/suppliers → 403` and an **"Access denied"** toast.
Server-side enforcement is correct — I checked the DB and **no supplier row was created**
(`select count(*) from suppliers where name like 'ZZTEST Perm Probe%'` = 0), so this is *not*
a false success. But the user fills a 12-field form before finding out, and "Access denied"
says what broke rather than what to do.

---

## D. Tax UI in a no-tax tenant — **PARTIAL**

Ten surfaces checked in the browser, in **en and ar**, scanning the rendered text for
`tax|vat|gst|before tax|ضريب|قبل الضريبة`.

| surface | en | ar |
|---|---|---|
| order create | clean | clean |
| order detail | clean | **"المجموع قبل الضريبة"** |
| GRN detail | clean | **"المجموع قبل الضريبة"** |
| bill create | clean | clean |
| bill detail | clean | clean |
| direct purchase create | **"+KWD 0.000 tax"** | (same component) |
| direct purchase detail | clean | clean |
| return create | clean | — |
| return detail | clean | clean |
| orders list | clean | clean |

**The direct-purchase DETAIL panel, previously the worst offender, is now clean in both
locales.** That part of the claim holds. Two leaks remain.

### D-F1 — direct purchase CREATE shows a per-line tax amount — **MEDIUM, CONFIRMED**
`/en/purchase/direct/new`, after adding any line, renders **"+KWD 0.000 tax"** under the line
total (I reproduced it with ZZTEST-SKU-0001 qty 3 @ 2.505). My first sweep of this route missed
it because the page had **no lines**; the string only exists once a line is present. The shared
predicate gates the tax *row* in the totals block but not this per-line annotation.

### D-F2 — Arabic "Subtotal" is translated as "total before tax" — **MEDIUM, CONFIRMED**
Not a predicate problem — a translation one. `messages/ar/purchases.json`:
```
purchases.orders.detail.summary.subtotal : "المجموع قبل الضريبة"   (line 1304)
purchases.grns.detail.summary.subtotal   : "المجموع قبل الضريبة"   (line 1679)
```
against `messages/en/purchases.json` `"subtotal": "Subtotal"`. So an Arabic-reading Kuwaiti user
sees "total **before tax**" on PO detail and GRN detail while the English user sees plain
"Subtotal". `messages/ar/sales.json:1919` carries the same string — likely the same defect in
Sales, outside this phase's scope but worth a look.

---

## E. Em dash — **VERIFIED**

The specific claim holds: the purchase orders list "Expected delivery" column shows **no em
dash** (the list renders zero `—` characters).

Swept 14 purchase screens in both locales for `—`: orders list/create/detail, GRN list/detail,
bills list/create/detail, direct list/create/detail, returns list/create/detail, payments list,
suppliers list. **All clean.**

One caveat, recorded honestly: my *first* scan of `/en/purchase/orders/<id>` reported two lines
containing `—`. I could not reproduce it in **six** subsequent attempts (two full reloads
sampled at 14s and 29s, plus a six-point sample at 3/5/7/9/11/13s). **SUSPECTED transient
only** — most likely a loading-state placeholder — not a confirmed finding.

(Note, not an em dash: the GRN and supplier lists use an **en dash** in "Showing 1–25 of 501"
while the returns list uses a hyphen "Showing 1-1 of 1". Cosmetic inconsistency, LOW.)

---

## F. Pagination continuity — **VERIFIED**

`/en/purchase/suppliers` (501 rows, 25/page): clicked "Next page" and sampled the DOM every
second. `document.querySelectorAll('tbody tr').length` stayed at **25 at every sample**, and the
footer flipped straight from "Showing 1–25 of 501" to "Showing 26–50 of 501". The table never
blanks and the pager never unmounts — `keepPreviousData` is doing its job here.

`/ar/purchase/suppliers` (verified RTL: `documentElement.lang=ar dir=rtl`, pager buttons
"الصفحة التالية" / "الصفحة السابقة"): the refreshing indicator appears as
**"جارٍ التحديث"** — present, and translated. Rows again held at 25 through the whole transition.

---

## G. Regression sweep — **VERIFIED** (both paths still post correct, identical GL)

### Direct path — `404a2880-…` (ZZTEST-SKU-0001, qty 3 @ KWD 2.505 = 7.515, paid now, cash)
```
JRN-00037  DR 1141 Merchandise Inventory 7.515 / CR 2121 GRN Accrual     7.515
JRN-00039  DR 2121 GRN Accrual           7.515 / CR 2111 Trade Payables  7.515
JRN-00038  DR 2111 Trade Payables        7.515 / CR 1112 Cash Register   7.515
```
Byte-for-byte the same shape as the pre-fix DPU-00001. Balanced, 3dp.

### Order path — PO-00002 → GRN-00004 → PINV-00004 (qty 3 @ KWD 1.000)
```
PO confirm : no GL (correct)
JRN-00040  DR 1141 3.000 / CR 2121 3.000        (grn.confirmed)
JRN-00041  DR 2121 3.000 / CR 2111 3.000        (invoice.confirmed)
```
Same shape as the pre-fix order path. Balanced, 3dp. Ledger identity 0.000000 after both.

No fix broke either working path.

### G-F1 — long purchase POSTs leave the form with no terminal state — **HIGH, SUSPECTED**
Two writes committed server-side but never resolved in the browser:
`POST /purchase/direct-purchases` and `POST /purchase/grns/receive`. In both cases the API log
shows the handler completing and the JEs posting, and the DB has exactly one document — but
`performance.getEntriesByType('resource')` reports `responseStatus === 0` for the request
(console: `net::ERR_CONNECTION_REFUSED`), the browser sat on the create form with **no success
screen, no error toast, and the Save button re-enabled**. A user in that state would very
reasonably click Save again and create a duplicate GRN or duplicate direct purchase.

Marked **SUSPECTED**, not CONFIRMED, and deliberately not inflated, because I cannot separate
the product from the environment here: both requests ran 45–65s wall clock on a machine
~700–900ms RTT from Neon (Singapore), and the API process was verifiably still listening on
:3001 throughout. Shorter writes on the same session resolved cleanly and showed proper success
screens (returns confirm 29s → success page; payment create 17s → 201 + detail page; bill
confirm 29s → 200 + "Confirmed"). The threshold looks like ~40s. This needs one re-test in a
low-latency environment before it is called a product bug — but the missing terminal state and
the re-enabled submit button are a real defensive-UX gap whatever the cause.

---

## Outbox reconcile drift at boot ("drift for tenant …: 2") — **BENIGN**

Not an undelivered-event problem. Both flagged rows are `inventory.transfer.completed`, both
`status = completed` with a `processed_at`, and both carry **`"isSameBranch": true`** in the
payload:
```
88f021e8 eventId 61698ba4  isSameBranch true   -> 0 journal entries
bf60edf4 eventId 484b0e46  isSameBranch true   -> 0 journal entries
cd1386eb eventId 2bf86793  isSameBranch false  -> 1 journal entry
d6b90301 eventId 94aa5f25  isSameBranch false  -> 1 journal entry
9bef031d eventId 1d4a102a  isSameBranch false  -> 1 journal entry
11dc7264 eventId 7bfee646  isSameBranch false  -> 1 journal entry
```
A same-branch stock transfer correctly posts **no** journal entry — nothing moved between
accounts. The reconciler's predicate simply does not exclude same-branch transfers, so it
reports them as drift forever. **LOW** finding: a permanent false positive on a warning that is
supposed to mean "investigate", which trains the reader to ignore it. Exclude
`isSameBranch === true` from the reconcile predicate.

---

## Verdict summary

| claim | verdict |
|---|---|
| A. money fix (void + re-raise, 2111 + refundable_amount) | **VERIFIED** |
| B. sub-half-fils rounding | **PARTIAL** (code + 113 passing tests; UI trigger unreachable) |
| C. accountant persona | **PARTIAL** (payment + locations fixed; 2 routes still ungated) |
| D. tax UI in a no-tax tenant | **PARTIAL** (8/10 clean; direct-create line + ar subtotal leak) |
| E. em dash | **VERIFIED** |
| F. pagination continuity | **VERIFIED** |
| G. regression sweep, both paths | **VERIFIED** |
| outbox reconcile drift | **BENIGN** (false positive) |

### Findings raised
| id | sev | status | one line |
|---|---|---|---|
| A-F1 | HIGH | CONFIRMED | Return void re-receives stock at GRN price but credits GL at average cost → inventory GL and cost pools out by 19.777 |
| G-F1 | HIGH | SUSPECTED | Purchase POSTs over ~40s commit but leave the form with no success/error and a live Save button |
| B-F1 | MEDIUM | CONFIRMED | Bill line unit-cost edit silently discarded on Confirm, no unsaved-changes warning |
| C-F1 | MEDIUM | CONFIRMED | `/purchase/orders/new` renders a full enabled form for a user without `purchase.order.create` |
| C-F2 | MEDIUM | CONFIRMED | `/purchase/suppliers/new` same; denial only at submit (server does correctly 403) |
| D-F1 | MEDIUM | CONFIRMED | Direct purchase create shows "+KWD 0.000 tax" per line in a no-tax tenant |
| D-F2 | MEDIUM | CONFIRMED | ar translates PO/GRN detail "Subtotal" as "المجموع قبل الضريبة" (total before tax) |
| — | LOW | CONFIRMED | Draft bills are shown to the user as `DRAFT-<raw uuid>` (raw ID in user-facing copy) |
| — | LOW | CONFIRMED | Outbox reconcile drift warning is a permanent false positive on same-branch transfers |
| — | LOW | CONFIRMED | "Showing 1–25" uses an en dash on some lists and a hyphen on others |
