# Phase D (Purchase) — closing browser pass

Date: 2026-08-28 · Tenant: Gulf Auto Parts (Kuwait, KWD 3dp) · Logged in as owner (HB),
branch Al Rai Main Showroom, re-asserted in the UI before each conclusion below.

## Status: PARTIAL. Two fixes verified, one flow found genuinely broken, then the DB link failed.

Two earlier environment failures (an incomplete Next route manifest, fixed by the coordinator
deleting the whole `.next` build dir) cost most of the session. In the working window I got
real browser evidence for F1 (display half) and F3, and I found the reason the supplier refund
receipt has never been exercised — a genuine product defect, not an environment one.

Work then stopped because the **tenant DB connection pool started failing** (`[TenantConnectionPool]
Tenant pool ping failed: ping query timeout` / `Health check failed, evicting stale client`,
repeating from 13:02 onward in `/tmp/zerupt-logs/api.log`). `POST /purchase/returns` hung for
>8 minutes across two attempts and never landed; GRN detail reads stopped resolving too.

### Write safety
- Ledger identity BEFORE first write attempt: `0.000000`
- Ledger identity AFTER last write attempt: `0.000000`
- **No writes landed.** `purchase_returns` = 2 (unchanged), `supplier_refund_receipts` = 0,
  `journal_entries` = 82. No partial write from the hung POSTs. `_documents-created.md` needs
  no new rows.
- `B1ALRAIMAINS-PR-00002` is untouched and still `confirmed` with `refundable_amount = 11.000`.
  I opened its amend dialog to look for a bill-link field and **cancelled without submitting**
  (that dialog voids and reissues the return); verified still `confirmed` in the DB afterwards.

---

## TASK 1 — the four fixes

### F1 — money must never render at 2 decimals — **display half VERIFIED, input half NOT TESTED**

**VERIFIED (display).** Method: hard cold load, then poll `document.body.innerText` every
~150ms through the entire resolve window, and grep every sample for any 2-decimal number.

| Screen | Cold load | Samples | Any 2dp money? |
|---|---|---|---|
| Bill detail `PINV-00001` (the exact reported site) | 24.9s to settle | 170 | **none** |
| Bill list `/purchase/invoices` | full compile + fetch | 144 | **none** |
| Supplier detail `SUP-0001` | full compile + fetch | 57 | **none** |

The bill-detail money block appeared already correct and never flashed an intermediate value:
`Subtotal KWD 55.000 / Total KWD 55.000 / Paid KWD 55.000 / Balance KWD 0.000`. Values seen
across all samples were only `0.000`, `5.500`, `55.000`, `1,346,120.088`, `1,846.994`,
`2,626.913` — all 3dp. The previously reported `2.50 / 2.50 / 0.00` state did not occur.

AP aging and the payments screens were **not** covered — the session dropped to `/login`
mid-probe and then the DB link failed. Not verified.

**NOT TESTED (input half).** The `MoneyInput` 3-decimal write-back could not be exercised: the
refund dialog's amount is fixed (not an input), and the DB link failed before I reached a bill
line or supplier credit-limit field. **This half remains unverified.**

### F2 — a failed save must not lie — **NOT TESTED**

I never reached the bill lines table to force a failure. No browser evidence either way.

### F3 — buttons must disable while a write is in flight — **VERIFIED on 2 of 6 surfaces**

Measured by clicking submit and polling the button every ~150ms, firing a **second click** at
sample 2.

| Surface | Observed at first sample after click | Second click |
|---|---|---|
| Record refund receipt dialog | `"Recording..." disabled=true aria-busy=true spinner=true`, **Cancel also disabled** | inert |
| Return create (`Save and post`) | `"Saving…" disabled=true aria-busy=true spinner=true`, Cancel and "Save as draft" also disabled | inert |

Both match the shared `SubmitButton` contract exactly. GRN create, bill create, order create,
landed-cost create and supplier create were **not** reached — not verified.

### F4 — no raw UUID on a printed document — **NOT TESTED**

I loaded the GRN detail page and polled 90 samples; it never got past the breadcrumb because
the DB link had failed. The Print button was absent throughout (page unresolved), so I saw
neither a UUID nor a resolved name. No evidence either way.

---

## TASK 3 — supplier refund receipt — **BLOCKED BY A REAL DEFECT (this is the finding)**

The flow is reachable in the UI and stops at the server. Exactly where it stops:

1. `/purchase/returns/0ccefa5f-…` renders `PR-00002`, `Owed back by supplier 11.000`, and an
   enabled **Record refund receipt** button.
2. The dialog is well built: fixed amount `11.000` (3dp), "The full amount owed must be received
   back at once", method Cash/Bank transfer/Cheque, an account picker correctly filtered to cash
   accounts (`1111 Petty Cash`, `1112 Cash Register`, `1119 Cash in Transit` — codes and names,
   no UUIDs), receipt date defaulted to today.
3. Submitting returns **HTTP 422 after 11.6s**, captured from the response body via an injected
   fetch interceptor:

```json
{"statusCode":422,"error":"Unprocessable Entity",
 "code":"REFUND_REQUIRES_LINKED_BILL",
 "message":"Purchase return B1ALRAIMAINS-PR-00002 is not linked to a supplier bill, so there is
 no settled bill for the supplier to refund against. Amend the return to link the bill it
 belongs to, then record the refund."}
```

DB confirms the precondition: `purchase_returns.bill_id IS NULL` for PR-00002, while
`refundable_amount = 11.000000`.

**No refund receipt was created. GL, `refundable_amount`, AP position and route 93 could
therefore not be verified. `supplier_refund_receipts` is still 0 rows.**

### FINDING P-01 — HIGH — CONFIRMED — the error message is a lie, and points at the wrong fix

The server's message is excellent and actionable. The user is shown, in a `role="alert"`:

> **The accounting period for this date is closed.**

That is false. `fiscal_periods` for the only legal entity (`Gulf Auto Parts`,
`d67ece83-…`) has `Aug 2026 / 2026-08-01 → 2026-08-31 / status = open / locked_at = null`.
I checked every period covering 2026-08-28 — exactly one row, open.

Root cause, `apps/web/src/features/purchase-refunds/lib/refund-receipt-error-map.ts`:

```ts
if (err.status === 422) return "periodLocked";   // catch-all, last rule before "generic"
```

Any 422 that no earlier substring matches is reported as a closed period. The server's own
plain-language remedy is discarded and replaced with wrong copy that sends the user to
Accounting to reopen a period that is not closed. This is the "plain language / error copy says
what to DO" standard failing in the most expensive way: the copy tells them to do the wrong thing.

### FINDING P-02 — HIGH — CONFIRMED — the refund is offered on returns that can never be refunded

A refund receipt requires a bill-linked return. Returns raised against a **goods receipt** get
`bill_id = NULL` and can never be refunded. Nothing surfaces this until after an 11.6s round
trip: the return page shows `Owed back by supplier 11.000`, the **Record refund receipt** button
is fully enabled, and the dialog lets you choose a method, an account and a date first. This is
the PERM-004 shape the addendum warns about — a fully interactive form blocked only on submit,
on a precondition that is knowable when the page renders.

### FINDING P-03 — MEDIUM — CONFIRMED — the server's suggested remedy has no UI

The 422 says "Amend the return to link the bill it belongs to". There is no such field:
- **Edit details** on the return exposes only Reason and Notes.
- **Edit** opens "Edit confirmed return" (a void-and-reissue amend saga) offering only return
  quantity and a reason.

So the instruction the user is given (once P-01 is fixed and they can actually see it) cannot be
followed in the product. The only path to a refundable return is to raise a *new* return against
a bill instead of a goods receipt.

### FINDING P-04 — MEDIUM — CONFIRMED — `refundable_amount` is populated on an unrefundable return

`PR-00002` carries `refundable_amount = 11.000000` with `bill_id IS NULL`. The number is
displayed to the user as "Owed back by supplier 11.000" but the system cannot honour it. The two
fields disagree about whether a refund is possible.

### Attempted workaround (to salvage the GL verification) — blocked by infrastructure

`/purchase/returns/new` does offer "What are you returning against? **A goods receipt / A bill**".
I built a bill-linked return against `PINV-00001` (55.000, paid in full — the "already paid in
full" supplier the task wanted): lines table resolved correctly
(`Received 10 / Already returned 2 / Returnable 8 / Unit price 5.500`), qty 2 → `Return value
11.000`, preview returned `{"currency":"KWD","taxMode":"none","subtotal":"11.000000",
"taxTotal":"0.000000","total":"11.000000"}` (no tax, correct for Kuwait).
`POST /purchase/returns` then hung indefinitely on both attempts while the tenant pool was
failing its health pings. No row created, ledger unchanged.

### FINDING P-05 — LOW — CONFIRMED — stale empty-state hint on return create

After entering a quantity, the line shows `Return value 11.000` while the hint
"Enter a quantity to see the total" is still displayed beside it.

### FINDING P-06 — LOW — CONFIRMED — transient em dash for a known supplier on bill detail

Bill detail settles its money at ~24.9s but shows `Supplier —` until ~40s, then resolves to
`ZZTEST Auto Parts Supplier`. The value is on the document already. Same shape as the F1 bug but
for the supplier name, and an em dash is used as the placeholder.

---

## Two suspicions I raised and then DISPROVED — do not act on them

Recording these because both looked like findings mid-session and both were artifacts of my own
tooling, not defects:

1. **"The bill picker queries the GRNs endpoint"** — I saw
   `GET /purchase/grns?search=PINV-00001&returnable=true`. Wrong: my "A bill" toggle click had
   not registered, so the form was still in goods-receipt mode. Once the toggle actually
   switched, the picker correctly called
   `GET /purchase/invoices?limit=20&status=confirmed&returnable=true`. **Not a bug.**
2. **"Selecting a bill renders no lines table"** — wrong: a programmatic `.click()` does not
   select in this combobox. A real pointer click selected the bill and the "Lines to return"
   table rendered correctly. **Not a bug.**

---

## TASK 2 — route sweep — 4 of 10 exercised

| # | Route | Result | Evidence |
|---|---|---|---|
| 79 | `/purchase/invoices` | **PASS** | 302 bills; KWD 3dp (`2.000`, `2.500`, `7.515`, outstanding `1,346,120.088`); status + supplier + date-range filters; Export CSV; no tax UI; no raw IDs; plain language. 144-sample cold load, no 2dp. |
| 94 | `/purchase/returns` (via detail) | **PARTIAL** | Return detail `PR-00002` renders: `Subtotal 11.000 / Total 11.000 / Owed back by supplier 11.000`, unit cost `5.500`. Plain language, no raw IDs. List route itself not opened. |
| 96 | `/purchase/returns/new` | **PASS** | Both paths offered; date defaulted to today; lines table `Received / Already returned / Returnable / Unit price 5.500 / Return value 11.000`; preview `taxMode: none`; no tax UI, no em dash, no raw IDs. One LOW (P-05). |
| 98 | `/purchase/suppliers/:id` | **PASS (money only)** | 57-sample cold load, no 2dp; `2.500`, `4.005` at 3dp. Full checklist not run. |
| 81 | `/purchase/invoices/:id/edit` | **NOT TESTED** | id `e5ff947b-…` |
| 82 | `/purchase/invoices/new` | **NOT TESTED** | |
| 84 | `/purchase/landed-costs/:id` | **NOT TESTED** | id `99718bde-…` (LC-00001, posted) |
| 88 | `/purchase/orders/:id/edit` | **NOT TESTED** | id `eaa85434-…` (PO-00001) |
| 91 | `/purchase/payments/:id` | **NOT TESTED** | id `fe5dd1d6-…` (PAY-00005, posted) |
| 93 | `/purchase/refund-receipts/:id` | **NO DOCUMENT EXISTS** | blocked by P-01/P-02; table still 0 rows |

Bill detail (`/purchase/invoices/:id`, not on the list) also **PASS**: correct 3dp money,
supplier, dates, lines, and a print document in the DOM showing item name + Arabic name + SKU,
no UUID.

---

## What the next pass needs

1. The tenant DB link has to be healthy — writes and even some reads were timing out at the end.
2. Still unverified: **F1 input half, F2, F4**, and F3 on the remaining 4 panels.
3. Task 3 still cannot be completed until P-01/P-02 are addressed, or by creating a
   **bill-linked** return (the flow was built and validated up to the POST — it is one working
   write away).
