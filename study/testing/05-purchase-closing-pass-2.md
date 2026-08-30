# Phase D (Purchase) — closing browser pass 2

Date: 2026-08-28 · Tenant: Gulf Auto Parts (Kuwait, KWD 3dp) · Logged in as **owner HB
(anonymator8@gmail.com)**, branch **Al Rai Main Showroom** — re-asserted in the UI (avatar "HB",
"Viewing: Al Rai Main Showroom") before every conclusion below.

## Headline

**The supplier refund receipt now works end to end. `B1ALRAIMAINS-SRR-00001` is the first one
this product has ever produced.** GL, AP movement, `refundable_amount` and the reversal are all
correct. The carried-forward TODO #3 in `study/purchase/_hardening-log.md` can be closed.

Two real defects found on the way, both CONFIRMED, neither in the refund logic itself:
- **PD-01 (HIGH)** — the 30s client timeout in `api-client.ts` aborts writes the server then
  completes, producing a **false "could not save"** on a write that DID land.
- **PD-04 (MEDIUM)** — a `purchase.invoice.voided` accounting event emitted by the cost-correction
  amend saga is **permanently unprocessable** (empty `lineItems` vs a min-1 schema), retrying forever.

### Write safety
- Ledger identity **BEFORE first write: `0.000000`** · **AFTER last write: `0.000000`** (checked
  4 times across the session, always `0.000000`).
- Documents created (all logged in `_documents-created.md`): `PR-00008`, `SRR-00001` (+ its
  reversal), grn_cost_correction `c1da2041…`, suppliers `SUP-0002` / `SUP-0003`, and — as an
  automatic consequence of the correction — `PINV-00006` voided and `PINV-00007` issued.
- No pre-existing document and none of the 4 opening-balance journals were touched.

---

# TASK 1 — supplier refund receipt, end to end

## 1a. The refusal on `PR-00002` — **VERIFIED, correct behaviour, reads well**

`/en/purchase/returns/0ccefa5f-…` as owner, branch Al Rai:

- **No "Record refund receipt" button.** Full button list on the page:
  `Edit | Void return | Edit details` (plus chrome). The string "refund" does not appear
  anywhere in the rendered text.
- The note in its place, verbatim:
  > This return reduced what you owe this supplier by 11.000. That value has already been set off
  > against their unpaid bills, so there is no cash to receive back right now.

  That is honest and matches the SQL: this supplier's party-tagged 2111 position was a net
  **credit** of 4.005 at that moment.
- **Arabic parity VERIFIED** (`dir=rtl lang=ar`), fully translated, no English leakage:
  > خفّض هذا المرتجع ما تدين به لهذا المورد بمقدار 11.000. وقد تمت مقاصة هذه القيمة بالفعل مع
  > فواتيره غير المسددة، لذلك لا يوجد مبلغ نقدي لاستلامه الآن.
- Hygiene on both locales: **0 em dashes, 0 raw UUIDs, 0 two-decimal money, no tax UI.**

The previous pass's findings **P-01 / P-02 / P-03 / P-04 are all resolved** by this design: the
gate now keys on the GL position, the button is not offered where it can never succeed, and the
misleading "period is closed" copy is gone (I never saw it again this session).

## 1b. The success path — **VERIFIED**

Raised `B1ALRAIMAINS-PR-00008` against `PINV-00001` (55.000, paid in full), qty 2 @ 5.500 = 11.000.

The server correctly refused the naive post first (`422 RETURN_EXCEEDS_BILL_BALANCE`) and the UI
turned it into an excellent plain-language decision, verbatim:
> **This bill is already paid** — The bill only has 0.000 left to reduce. The rest, 11.000, cannot
> be applied to the bill. Instead, it will become money the supplier owes you back, to be recorded
> as a refund receipt once they pay it.
> [Go back and change the return] [Post and record 11.000 as owed back]

Confirming gave `201` → `PR-00008`, `bill_id` set, `refundable_amount 11.000000`. The supplier's
2111 net moved `-4.005 → +6.995` (a net **debit**, i.e. genuinely owed back). Ledger `0.000000`.

Then `POST /purchase/refund-receipts` → **`201`, `B1ALRAIMAINS-SRR-00001`**, `status posted`,
`amount 11.000000`, method cash, account `1111 Petty Cash`.

**The journal entry — every requested check passes:**

| JE | Account | Debit | Credit | Party | Cur |
|---|---|---|---|---|---|
| `B1ALRAIMAINS-JRN-00049` (`srr`, posted) | `1111 Petty Cash` | **11.000000** | 0.000000 | — | KWD |
| | `2111 Trade Payables` | 0.000000 | **11.000000** | `supplier` `9151cc3f…` | KWD |

- **DR Cash / CR Trade Payables 2111, party-tagged** — exactly as specified. ✅
- **Balanced**: `total_debit = total_credit = 11.000000`. ✅
- **Functional currency**: `currency KWD`, `debit_tc/credit_tc` equal the transaction amounts. ✅
- **No phantom payable**: the entry has exactly **two** lines, no extra 2111 credit. ✅
- **AP position moved by exactly the refunded amount**: `+6.995 → -4.005`, a delta of `-11.000`. ✅
- **`refundable_amount` updated**: `11.000000 → 0.000000`. ✅
- **Ledger identity after: `0.000000`.** ✅

## 1c. Route 93 `/purchase/refund-receipts/:id` — **VERIFIED, renders a real document**

> Refund receipt B1ALRAIMAINS-SRR-00001 · Posted · [Reverse receipt]
> Supplier ZZTEST Auto Parts Supplier · Purchase return **B1ALRAIMAINS-PR-00008** · Receipt date
> 8/28/2026 · Method Cash · Amount **KWD 11.000**

0 em dashes, 0 raw UUIDs, 0 two-decimal money, no tax UI. The linked return is shown by its
human number, not an id.

## 1d. The reversal — **VERIFIED, an exact contra, not a dead end**

Dialog copy is correct and confirms once for an irreversible action, with a mandatory reason:
> Refund receipt B1ALRAIMAINS-SRR-00001 will be reversed. This puts the return's refundable amount
> back and reverses the journal entry. This cannot be undone.
> **What will happen** — The return's owed-back amount is restored, so a corrected receipt can be recorded.

`200`. `JRN-00050` is a **line-for-line exact contra** of `JRN-00049`:

| JE | Account | Debit | Credit | Party |
|---|---|---|---|---|
| `JRN-00049` | 1111 / 2111 | 11.000 / 0.000 | 0.000 / 11.000 | — / supplier |
| `JRN-00050` | 1111 / 2111 | 0.000 / **11.000** | **11.000** / 0.000 | — / supplier |

- `refundable_amount` restored to `11.000000`; supplier 2111 net back to `+6.995`.
- Receipt page now reads *"Reversed — Reversal reason: ZZTEST reversal check"*.
- **Not a dead end**: reloading `PR-00008` shows the **"Record refund receipt" button again**, so a
  corrected receipt can be raised. Exactly what the dialog promised.
- Ledger identity `0.000000`.

### PD-05 — LOW — CONFIRMED — reversing JEs are not linked to the entry they reverse
`journal_entries.reversal_of_entry_id` / `reversed_by_entry_id` are **NULL on all 86 rows** in this
DB, including `JRN-00050`. The contra exists and is correct; only the link is unrecorded. This is a
**codebase-wide convention gap, not a purchase defect** — noting it, not filing it against Purchase.

### PD-06 — LOW — CONFIRMED — internal event names used as GL descriptions
`JRN-00049.description = "Auto: purchase.refund.received"`, `JRN-00050 = "Auto: purchase.refund.reversed"`.
An internal event key in a user-visible ledger description. Again codebase-wide, not purchase-only.

---

# TASK 2 — the three unproven fixes

## F1 (input half) — money field keeps 3 decimals — **VERIFIED on two cold-loaded forms**

| Surface | Typed | After blur | Verdict |
|---|---|---|---|
| Bill detail → "Correct the cost of this item" → **New cost** | `1.375` | **`1.375`** | ✅ no 2dp rounding |
| `/purchase/invoices/:id/edit` (cold load) → **Unit price** | `1.250` | **`1.250`** | ✅ no 2dp rounding |

Also correct: typing `0.999889` into New cost rounds to **`1.000`** on blur — the KWD 3dp
precision, not a 2dp fallback. The old `1.250 → 1.25` behaviour did not reproduce once.

*Small caveat (LOW, CONFIRMED):* that dialog rounds `0.999889 → 1.000` **without showing any
"Rounded to KWD …" notice**. The notice exists on the bill create/edit lines editor, not here, so
this surface changes the user's number silently.

## F2 — a failed save must not lie — **PARTIAL**

The surface is bill detail → Lines → **"Edit this cost"** → *Correct the cost of this item*.

- **Failure path — VERIFIED (alert half).** I forced a real failure (the request aborted, see PD-01).
  The dialog showed a **persistent `role="alert"`**, in plain language, and it stayed on screen:
  > Could not save this correction. Please try again.

  The submit button returned to `"Save correction" disabled=false`, so the user can retry. No
  silent revert, no lying success toast.
- **Stale rounding notice half — NOT TESTABLE here.** This dialog never renders a "Rounded to
  KWD X" notice at all (see the F1 caveat above), so there was no stale notice to clear. I did not
  reach the surface where that notice lives; **I am not claiming that half verified.**
- **A separate 500 on the refund dialog behaved correctly too** — plain-language
  `role="alert"`: *"Could not record the refund receipt. Please try again."*, button re-enabled.
  (That 500 was an admin-DB connect timeout in the tenant guard — infrastructure, not filed.)

**But the alert was WRONG — see PD-01.** The correction it said it could not save **was written**.

## F3 — submit disables with a spinner, second click inert — **VERIFIED for all 6 panels**

Two panels were verified in the browser earlier; two more in the browser this session; the final
four by reading the code path end to end (allowed as CONFIRMED evidence per method rule 1, and here
it is the *stronger* evidence, because on this link the busy window is trivially wide).

| Panel | Evidence | Verdict |
|---|---|---|
| Refund receipt dialog | browser (prev pass) `"Recording..." disabled=true aria-busy=true` — reconfirmed **this session** | ✅ |
| Return create | browser (prev pass) + **this session**: `"Saving…" disabled=true aria-busy=true` | ✅ |
| **Bill create** | `bill-create-panel.tsx:786` `loading={pendingAction === "save"}`, `disabled={!canSaveNow}` where `canSubmit` includes `!submitting && !saveMutation.isPending && !createDraftMutation.isPending` (`:366-372`); handler re-guards `if (!canSaveNow) return` (`:419`) | ✅ |
| **Order create** | `order-create-panel.tsx:709` `disabled={!canSubmit \|\| submitting \|\| createMutation.isPending}` + `loading={submitting \|\| createMutation.isPending}` | ✅ |
| **Landed-cost create** | `landed-cost-create-panel.tsx:518` `loading={submitting \|\| createMutation.isPending}`, `canSubmit` includes `!submitting && !createMutation.isPending` (`:167-176`) | ✅ |
| **Supplier create** | `supplier-form-panel.tsx:937` `disabled={isPending} loading={isPending}` where `isPending = createMutation.isPending \|\| updateMutation.isPending`; handler re-guards `if (isPending) return` (`:315`) | ✅ |

All six route through the one shared `packages/ui/src/components/submit-button.tsx`, which sets
`disabled`, `aria-busy={true}` and a `Loader2 animate-spin` from a single `loading` prop. Every
panel wires `loading` to **both** a local flag **and** the mutation's `isPending`, and every one
re-guards inside the handler, so a second click is inert even if the disable were bypassed.

*Honest limitation:* on supplier create I clicked submit twice in the browser and got exactly one
row each time, but the button unmounts on navigation faster than my 60ms poll, so I never captured
its `aria-busy` frame directly. The code path above is what I am relying on for that panel.

## F4 — no raw UUID on a printed document — **VERIFIED (with one adjacent defect, PD-02)**

Method: cold load (via `/dashboard` first to force a fresh mount), then poll `document.body.innerText`
and the Print button every 150ms through the whole resolve window. Repeated on **two** GRNs.

| GRN | Samples | Item column ever a UUID? | Ever a bare "Line #1"? | Print enabled while any UUID visible? |
|---|---|---|---|---|
| `GRN-00001` | 403 | **no** | **no** | **no** |
| `GRN-00002` | 403 | **no** | **no** | **no** (`uuidWhilePrintEnabled = 0`) |

Print button sequence is exactly right: `absent → disabled → enabled`, first enabled at sample 83
(~12.5s), well after the last UUID sample. **The fix holds.** Settled print document is clean:
item name + Arabic name + SKU, `KWD 5.500`, `KWD 55.000`, no tax lines, no ids.

### PD-02 — MEDIUM — CONFIRMED — the **Supplier** field flashes a raw UUID on GRN cold load
Reproduced on both GRNs. For ~1.5s (10 consecutive samples) the printed-document header renders:
```
Supplier
9151cc3f-785c-47d5-85fb-7736cf91f97c
```
Located precisely: `BDI < SPAN.text-sm < DIV.flex < DIV.border-border` — inside the print document
tree, not the sidebar. It resolves to *"ZZTEST Auto Parts Supplier"* and never reaches paper
(Print is still disabled), so this is on-screen only. Same shape as F4 and as P-06 from the
previous pass (which used an em dash placeholder); the supplier field is the one that was missed.

---

# TASK 3 — route coverage

| # | Route | Result | Evidence |
|---|---|---|---|
| 81 | `/purchase/invoices/:id/edit` | **PASS** (1 LOW) | `PINV-00004`. Renders the amend saga honestly: *"Correcting bill B1ALRAIMAINS-PINV-00004. We void this bill and issue a new one with your changes."* + *"Quantities come from the goods receipt and cannot be changed here. Only prices can be corrected."* Qty input correctly `disabled`. Mandatory reason. 0 em dash, 0 UUID, 0 2dp, no tax UI. **LOW:** the disabled Qty field shows the raw DB value **`3.000000`** (6dp) instead of a formatted quantity. |
| 82 | `/purchase/invoices/new` | **PASS** | Renders fully. Branch **defaulted and locked** to the viewed branch with an explanation; bill date defaulted to today; currency defaulted to KWD with the base-currency hint; due date explicitly optional ("Leave empty to use the supplier's payment terms"); lines optional with a clear empty state. 0 em dash, 0 UUID, **no tax UI at all**. Good defaults-over-questions behaviour. |
| 84 | `/purchase/landed-costs/:id` | **PASS** | `LC-00001` posted. `Total 10.005` (3dp), component *ZZTEST Freight 10.005*, credit account *Accounts payable*, allocation method *By value*, allocation row shows GRN number + SKU + item name + qty — no raw ids. 0 em dash, 0 2dp, no tax UI. |
| 88 | `/purchase/orders/:id/edit` | **PARTIAL — refusal state only** | `PO-00001` (`partially_received`) is refused cleanly and correctly: *"Only a confirmed purchase order can be edited this way."* with a **"Back to this order"** escape — plain language, not a dead end, no crash. **The happy path could not be exercised: there is no `confirmed` purchase order in this tenant** (`select … where status='confirmed'` returns 0 rows; the four POs are `received` / `partially_received`). Not claiming the editor itself verified. |
| 91 | `/purchase/payments/:id` | **PASS** (1 LOW) | `PAY-00005` posted. Payment Voucher renders with supplier, date, `Method Cash`, `Type Standard`, `Total KWD 2.500`, and an Allocations table tying to `PINV-00005` for `KWD 2.500`. 0 em dash, 0 UUID, 0 2dp, no tax UI. **LOW:** the printed voucher reuses the generic goods-line template, so a bill allocation appears under headers *Item / Qty / Unit Price / Discount / Line Total* with the bill number in "Item" and `Qty 1`. Cosmetic, on a printed document. |
| 93 | `/purchase/refund-receipts/:id` | **PASS** | See Task 1c. First real document ever to exist at this route. |

---

# Findings

## PD-01 — HIGH — CONFIRMED — a 30s client timeout aborts writes the server then completes, and the UI reports failure

**Root cause, read in source:** `apps/web/src/lib/api-client.ts:313`
```ts
const DEFAULT_TIMEOUT_MS = 30_000;   // uploads get 120_000
```
`fetchWithTimeout` aborts at that ceiling and throws `ApiError(..., "timeout")`.

**Evidence I observed personally**, via a `fetch` interceptor recording status and elapsed ms:

| Call | Result |
|---|---|
| `POST /purchase/returns` (unmodified client) | `THROW AbortError` at **30003 ms**, nothing written |
| the identical call with `signal` removed | **`422`** at 39489 ms — i.e. the server needs ~39s here |
| `POST /purchase/returns` confirm | **`201`** at 40871 ms |
| `POST /purchase/refund-receipts` | **`201`** at 23049 ms |
| GRN cost correction (unmodified client) | UI: *"Could not save this correction."* — **DB: the row landed** |

That last row is the damaging one. `grn_cost_corrections` went `0 → 1` (`c1da2041…`,
`1.250 → 1.375`), the amend saga ran to completion (`PINV-00006` voided, `PINV-00007` issued at
2.750, `JRN-00051/52/53` all posted), **while the user was told the save had failed.** A user who
believes that alert and retries is being invited to double-correct a bill.

Note the mitigations that are already right: both endpoints carry an `idempotency_key`, and the
ledger stayed `0.000000` throughout. Nothing is corrupt. The defect is that **the client gives up
before the server does, and then reports the wrong outcome.**

**Caveat, stated plainly:** this link is ~700-900ms RTT from Neon (Singapore) and writes here run
30-90s, which the briefing correctly calls latency, not a defect. I am **not** filing the latency.
I am filing that a 30s ceiling sits *below* the normal write time on exactly the kind of connection
this product is being shipped onto (MENA / SEA / India retail), and that the failure it manufactures
is reported as a definite "could not save" rather than "we lost contact, check before retrying".

**Second manifestation (MEDIUM, part of the same cause):** on the return-create panel the timeout
surfaces through `toast.error(err.message)` (`return-create-panel.tsx:468`), and `err.message` for a
timeout is the raw internal string **`Request to /purchase/returns timed out after 30000ms`** — a
path and a millisecond count in user-facing copy. *(I polled ~100s after the click and saw no toast
at all; I believe it had auto-dismissed, so I am marking "the user is told nothing" as SUSPECTED,
not confirmed. The raw copy itself is CONFIRMED from the code.)*

## PD-02 — MEDIUM — CONFIRMED — raw supplier UUID on GRN cold load
See F4 above. ~1.5s, on the printed-document header, both GRNs tested. Never printable.

## PD-03 — MEDIUM — CONFIRMED — bill detail "Unit cost" column contradicts the bill on the same page

On `/purchase/invoices/e5ff947b-…` (`PINV-00006`), reproducible on cold load, the Lines table row read:

| Item | Location | Qty | **Unit cost** | Discount | Total |
|---|---|---|---|---|---|
| ZZTEST-Brake Pad Set Front Test 2 | From GRN · Al Rai Main Showroom | 2 | **KWD 1.250** | KWD 0.000 | **KWD 2.000** |

`2 × 1.250 ≠ 2.000`, and the printed bill **on the same page** says `KWD 1.000`. SQL settles which is
which: `purchase_invoice_lines.unit_price = 1.000000` (the bill), `grn_lines.unit_cost = 1.250000`
(the receipt). So the column is showing the **receipt** cost under the heading "Unit cost", beside
the **bill's** line total.

This is a labelling/consistency defect, **not a wrong stored value** — the underlying money is
correct and the PPV was posted properly. It is defensible that the cell is the receipt cost, because
its edit button opens *"Correct the cost of this item … Current cost 1.250"*, a GRN correction. But
as rendered the row is arithmetically impossible and contradicts the document above it. Either label
it (e.g. "Receipt cost") or show the bill's unit price.

## PD-04 — MEDIUM — CONFIRMED — a poison accounting event that can never drain

`accounting_event_outbox` row `c47f2de9-…`, `event_type = purchase.invoice.voided`, emitted at
12:00:54 by the cost-correction amend saga (`correlationId` = `PINV-00006`'s id):

```
attempts: 3
last_error: Invalid purchase.invoice.voided payload:
  [{ "origin": "array", "code": "too_small", "minimum": 1,
     "inclusive": true, "path": ["lineItems"] ... }]
```

The payload carries an **empty `lineItems` array** against a schema requiring at least one, so it
fails validation on every retry, forever.

**No money is missing** — I checked: the void's own JE `JRN-00051` (2.500) posted from a *different*
event, `PINV-00007` was issued and posted (`JRN-00053`, 2.750 = 2 × 1.375), the correction delta
posted (`JRN-00052`, 0.250), and the ledger identity is `0.000000`. This is a **redundant** emission,
not a lost posting. But it is a permanently-failing row in a durable accounting queue: it will retry
forever, and it will train whoever watches that queue to ignore it.

## PD-05 — LOW — CONFIRMED — reversing JEs carry no link to the entry reversed (codebase-wide)
## PD-06 — LOW — CONFIRMED — internal event keys used as GL descriptions (codebase-wide)
## PD-07 — LOW — CONFIRMED — cost-correction dialog rounds 6dp → 3dp with no notice
## PD-08 — LOW — CONFIRMED — bill edit shows raw `3.000000` in the disabled Qty field
## PD-09 — LOW — CONFIRMED — payment voucher print reuses the goods-line template for allocations

## Re-confirmed from the previous pass
- **P-05 (LOW)** — *"Enter a quantity to see the total"* is still shown beside a computed
  `Return value 11.000` on return create. It is **transient**: it persists only while the preview
  call is in flight (~30s here) and is replaced by Subtotal/Total once the preview lands. Real, but
  only visible because the round trip is slow.

## Observed, NOT filed (infrastructure, per the task brief)
- One `500` on `POST /purchase/refund-receipts`: `DrizzleQueryError` on `user_tenant_map` in
  `TenantResolverGuard.enforceActiveMembership`, cause `UND_ERR_CONNECT_TIMEOUT` to the **admin** DB
  (neon-http). The immediate retry succeeded. The UI handled it correctly.
- `[TenantConnectionPool] Tenant pool ping failed / evicting stale client` recurring in `api.log`.
- Bill search in the return-create bill picker returned all 6 bills on one attempt and correctly
  filtered to 1 on another — a debounce race in my own automation, **not** filed as a defect.

## Suspected, NOT confirmed — worth one look, do not act on it yet
- **Supplier create shows "Tax number" and "Tax group" fields in a Kuwait no-tax tenant.** These may
  be deliberate (a Kuwaiti buyer can have foreign suppliers), and suppliers were passed in a previous
  route sweep, so I did not re-litigate settled design. Flagging only so someone can confirm it is
  intentional. **SUSPECTED, LOW.**

---

## What is left for a future pass
1. **Route 88's happy path** needs a `confirmed` purchase order to exist — none does in this tenant.
2. **F2's "clear the stale rounding notice"** half needs the bill create / edit **lines editor**,
   which is where that notice actually lives. The dialog I reached has no notice.
3. **PD-01** deserves a decision, not a patch: what should a write ceiling be for a shop in Kuwait
   or Kerala on a bad link, and what should the copy say when we lose contact mid-write?
