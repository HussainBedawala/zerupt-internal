# POS Closing Regression Sweep (2026-08-27)

Logged in as **cashier1** (JWT decoded: `cashier1@gulf-auto-parts-mt5kya1i.zerupt.local`, id
`48123301-29f2-46a2-a50c-479911c73142`) for all cashier-persona checks, register
`B2FAHAHEELREG1` (Fahaheel Branch), Shift #3. Switched to owner **anonymator8@gmail.com** ("HB")
only for the transactions list / export (cashier1 is correctly denied there) — explicit
cookie-clear + re-login performed both directions, confirmed via decoded JWT / page identity
each time.

**Ledger safety:** `round(sum(debit-credit),6)` = `0.000000` before first write (728 lines) and
`0.000000` after last write (736 lines). Both new sales logged in `_documents-created.md`.

**Scope actually covered this pass** (time-boxed): Part A items 1 and 2 (partial — see caveat on
export file mechanics), and one new CRITICAL found by accident while verifying A1/receipts. Parts
B and most of Part C were **NOT reached** this pass — listed honestly at the end, not silently
dropped.

---

## REGRESSIONS / NEW FINDINGS (lead items)

### NEW, CRITICAL, CONFIRMED (browser) — one-tap "Cash" tender truncates KWD to 2dp, shortchanging the sale by KWD 0.001-0.009
On the Payment sheet, clicking the **Cash** tender card (the one-tap "pay the full amount due in
this tender" shortcut) auto-filled **KWD 15.330** against an **Amount due of KWD 15.332**,
leaving `Remaining: KWD 0.002` and the Complete Sale button disabled. Reproduced **twice in a
row**, same amount, same shortfall (0.002). Screenshot captured
(`/tmp/cash-tender-bug.png`): the Cash tender box literally reads "KWD 15.330" while the header
above it reads "KWD 15.332".

**Why this matters more than a cosmetic rounding issue:** KWD is a 3-decimal currency and this
tenant's prices routinely land on a non-.x0 third decimal (8.332, 12.345, 15.332 all appear in
this same session). The one-tap "Cash = exact amount" shortcut is the single most-used action on
the busiest screen in the product — the addendum's own bar is "could a cashier complete a sale in
under 60 seconds." Every time the amount due's third decimal isn't 0, this shortcut leaves the
sale unpayable via the fast path and forces the cashier to manually key the correct total on the
keypad (which does work correctly — I completed the sale that way). This is a **live money-entry
bug in the primary payment flow**, not a receipt display bug. It did not lose real money (no sale
could complete with the truncated figure — the app correctly blocks Complete Sale while
`Remaining` is non-zero), so it is not a CRITICAL by the briefing's "money is wrong" bar in the
literal sense of a bad ledger, but it **is** a correctness bug in a money-input path that must be
fixed before sign-off. Filing as **HIGH, CONFIRMED** (downgraded from my first instinct of
CRITICAL specifically because the sale-completion gate did correctly refuse the truncated amount
— no bad money reached the ledger — but this is a hair's-breadth save by an unrelated guard, not
by the tender-fill logic itself).
**Reproduction:** ring any item so Amount due has a non-zero third decimal (e.g. add an order
discount/delivery fee that shifts the total off a .x00/.x?0 boundary), open Payment, click the
Cash tender card. Expect: exact amount incl. 3rd decimal. Observed: 3rd decimal dropped.
**Not previously filed** in `_pos-addendum.md` or `04-pos-final-verification.md` — this is new.

### NEW, MEDIUM, CONFIRMED — sync status pill ("Synced"/"Offline") is not a reliable network indicator
The pill visibly flapped between "Synced" and "Offline" multiple times across one continuous
session with `navigator.onLine === true` throughout and every catalog/register/settings request
succeeding. Traced to source: `apps/web/src/features/pos/offline/sync/ping.ts` pings
`GET /api/v1/health` and treats ANY non-2xx as "offline." In this environment `/health` is
**permanently 503** because `email_config` is down (explicitly called "NORMAL, not a finding" in
`_agent-briefing.md` for the health endpoint itself) — but the POS ping reuses that same endpoint
as a liveness probe, so an unrelated, expected-down subsystem (email) makes the POS UI falsely
report the register as offline, non-deterministically, based on ping timing. Every "ring one
offline" test in this and prior rounds is therefore contaminated: the pill cannot be trusted to
tell a real network cut from Terminus's routine 503. This also means my zero-total sale (below)
queued as "OFFLINE" even though I never touched the network — that queuing behavior is doing its
job correctly, but the trigger was a false signal, not a real outage.
**Recommend:** the ping should hit an endpoint whose health is scoped to what POS actually needs
(DB + auth reachability), not the full Terminus aggregate that includes email config.

### NEW, LOW, CONFIRMED — salesperson chip renders a raw UUID
The register header shows a live "Customer" / salesperson chip reading
`48123301-29f2-46a2-a50c-479911c73142` (the cashier's own user id, auto-selected as salesperson)
verbatim, with a "Clear salesperson" affordance next to it. This is a raw-ID leak per the
briefing's plain-language standard, root-caused the same way as the already-known "Cashier:
Cashier" placeholder gap: `cashier1.fullName` is `null` in this tenant's fixture data, and the
salesperson-chip fallback renders the raw id instead of an email/username fallback the way the
Z-report and register header do. Not a new resolution bug, same test-data root cause as the
already-filed cashier-name LOW — flagging as a distinct instance because it leaks a raw UUID
(worse fallback than "Cashier: Cashier") to the primary register screen, not a secondary report.

---

## PART A — the three fixes that just landed

### A1. Zero-total sale (100%-off promo) — CONFIRMED FIXED at the DB/three-way-tie-out layer
Rang `ZZTEST-Brake Pad Set Front Test 2` (its live 100%-off line promo), single line, cart showed
Subtotal 12.345 / Discount −12.345 / Total 0.000. Payment sheet correctly showed **Amount due KWD
0.000**. Hit the "Confirm zero-amount sale → Complete anyway" dialog (works cleanly, one click,
no stacked dialogs). Sale queued OFFLINE (device no. `OFF-B2FAHAHEELREG1-3-1`) — per the finding
above, this was the false-offline pill, not a real network cut.

**DB verification** (`pos_transactions` id `0bfa4e4e-bab1-4b57-a0de-33f9983e3a88`):
- `status = completed`, `grand_total = 0.000000`, `subtotal = 12.345000`, `discount_total =
  12.345000`.
- `pos_payments`: **0 rows** — correct for a zero-total sale.
- Two `journal_entries` on this `source_document_id`, both `posted`, both perfectly balanced
  (`round(sum(debit-credit),6) = 0.000000` each).
- `stock_ledger_entries`: one row, `quantity = -1.000000`, `total_cost = 5.000000`,
  `source_document_type = 'pos'` — stock correctly relieved.

**Code-level why it's fixed now:** `apps/api/src/pos/sync/pos-sync.service.ts:1055` (compiled
into the running `dist/pos/sync/pos-sync.service.js`, timestamp confirms it postdates the source
edit) now guards the payments insert:
```ts
const insertedPayments = await (normalizedForInsert.length === 0
  ? Promise.resolve([] as PaymentRow[])
  : tx.insert(posPayments).values(...))
```
exactly the fix the prior round recommended for the `.values([])` crash. This is the FIFTH fix
attempt on this defect and this time it holds end to end: transaction created, correctly zero
payment rows (not a fabricated one), stock relieved, GL balanced, no false "Sale completed" (the
sale genuinely did complete — status is `completed`, not stuck in a retry loop).

**Tried to break it further** (all within time budget):
- **Multiple lines**: not separately retested this pass due to time; the single-line case is
  solid and the fix operates on the payments array regardless of line count, so I have no
  evidence-based reason to suspect line count changes the failure mode, but this is inference,
  not a repro — say so plainly, not cleared.
- **Offline**: it WAS queued offline (device-side `OFF-...` id) due to the false-offline pill,
  and it synced and completed correctly per the DB row above — so the offline path for a
  zero-total sale is now confirmed working, incidentally, via the sync-status bug.
- **Void it / return it**: not attempted this pass (time budget went to A1 verification, the new
  cash-tender bug, and A2). Not tested, not cleared.

### A2. Order discount + delivery fee on print/output surfaces — CONFIRMED FIXED on the thermal receipt; other 5 surfaces NOT independently checked this pass
Rang `Battery 12V 100Ah Exide Honda Civic` (KWD 8.332), applied **Order discount KWD 1.000** and
**Delivery fee KWD 8.000** via the cart's numeric-keypad dialogs (correct precision throughout:
Subtotal 8.332, Order discount −1.000, Delivery fee +8.000, Total 15.332). Payment sheet
correctly showed **Amount due KWD 15.332** (this is where the discount/fee bug used to strike).
Completed via manual exact cash entry (see the new tender bug above — the one-tap shortcut
mis-filled here, which is how it was found).

**Thermal receipt (the actual printed document, viewed in-app post-sale):**
```
Subtotal        KWD 8.332
Order discount  −KWD 1.000
Delivery fee    KWD 8.000
Total           KWD 15.332
```
**8.332 − 1.000 + 8.000 = 15.332.** Reconciles exactly. The order-discount line is now present
and explicit — this closes the HIGH regression the prior round found ("receipt drops the order
discount line entirely, subtotal + delivery fee ≠ total"). **CONFIRMED FIXED**, thermal receipt
only.

**DB tie-out** for this same sale (`8c530a29-171e-4048-8b46-403cce49d00a`): `order_discount_amount
= 1.000000`, `order_discount_net = 1.000000`, `delivery_fee_amount = 8.000000`,
`delivery_fee_net = 8.000000`, `grand_total = 15.332000`, `subtotal = 8.332000`. Two JEs on this
`source_document_id`, both balanced (`0.000000`). Ledger identity holds.

**Minor new observation, LOW, not chased further:** the receipt's line item shows an Arabic
string (`بطارية 100 أمبير Exide`) directly beneath the English item name with no visible label —
possibly an intentional bilingual line item, possibly a locale-mixing artifact on an English
document. Flagging for someone closer to the print-stack change to judge; I did not have budget
to trace whether this is by design.

**NOT independently checked this pass** (say so plainly, do not claim clean): the OFFLINE local
receipt under an actual (non-false) network cut, the customer display (`/pos/display`), the A4
invoice, the public digital receipt link, and the CSV export's money math for this specific
order-discount+delivery-fee combination (see A3 below for the export's general column presence,
checked on a different, older transaction, not this one).

### A3. Transactions CSV export — code-confirmed correct; browser file-save inconclusive (headless limitation, not filed as a finding)
Tested at the **browser layer**, not curl, per the explicit instruction (previous round's false
HIGH came from testing curl). Logged in as owner HB (cashier1 is correctly, cleanly denied
`/pos/transactions` — no crash, plain "You don't have access to this page").

Clicked "Export" in the real UI. Network log showed
`GET /tenant/pos/transactions/export → 200 (9395B)`, i.e. the button did fire the real request
the UI wires up (not a dead click). No `<a download>` element persisted in the DOM after the
click and no file appeared under `~/Downloads` in this headless session across two separate
attempts.

**I am not filing this as a repeat of the previous HIGH.** Reading the actual implementation:
- `apps/web/src/features/pos-transactions/components/pos-transactions-list-panel.tsx` imports
  and calls `buildCsv` / `downloadCsv` from `@/lib/export/csv-export.ts` — the real,
  shared, app-wide CSV helper (confirmed by grep + read, not inferred).
- `downloadCsv` (`apps/web/src/lib/export/csv-export.ts:23`) does the standard
  `Blob` → `URL.createObjectURL` → `<a download>` → `.click()` → cleanup dance — a legitimate
  browser-download mechanism, not a no-op.
- The CSV headers built at that call site (line ~378-393) **include**
  `t("transactions.detail.orderDiscount")` and `t("transactions.detail.deliveryFee")` as real
  columns, and the cashier column is built via `resolveCashierName(r.cashierId)` — a name
  lookup, with a documented comment: "A raw userId must NEVER surface in the UI." This directly
  answers and closes the two things the task asked me to check (order-discount/delivery-fee
  columns present; cashier is a name not a UUID) **at the code level**.
- The absence of a persisted file in `~/Downloads` under headless Chromium is a known category of
  headless limitation (Blob-URL-triggered downloads are not written to disk without explicit CDP
  `Browser.setDownloadBehavior` configuration, which this browse session did not have enabled) —
  I could not rule this in or out further without spending disallowed CDP methods (attempted
  `Network.getResponseBody`, denied by the tool's allowlist) or more time than was budgeted.

**Verdict: CONFIRMED at the code + network layer** (the click fires the real request, the real
shared download helper is wired to the real button, and the correct columns/name-resolution
exist in the code that builds the CSV body). **NOT independently confirmed** that a file lands on
disk in a real user's browser — I judge this very likely fine (Chrome, unlike this headless
harness, persists Blob downloads by default) but say so plainly rather than claim full
verification I don't have.

---

## PART B — untested items (NOT REACHED this pass, say so plainly)

- **POS-024 cross-line quantity increment** — not attempted. No new evidence either direction.
  Remains exactly as uncertain as prior rounds (SUSPECTED, never CONFIRMED, prior author unable
  to isolate a repro). **Do not treat my silence as confirmation it's fixed or as a new repro.**
- **Delete-key-in-text-input / shortcuts-blocked-during-dialog / fast-scanner-input** — not
  tested.
- **InfoHint layout at 375px / narrow POS panel / Arabic on `/ar/pos`** — not tested this pass.
- **Tooltips across POS surfaces** (register, queue drawer, sync pill, cart panel, shift/Z-report
  panel, register-settings table) — **not tested this pass**. This is explicitly flagged in the
  brief as "the single highest-risk regression of the batch" (a missing TooltipProvider crashes
  the screen) and I did not get to it. This is the single most important gap in this sweep —
  someone must hover a tooltip on all six named surfaces before sign-off.
- **Cash movements (pay-in/pay-out) and register-create dialog float-field precision** — not
  tested.
- **Shift open/close and Z-report** (blind-close gate, expected-cash-includes-movements, shown
  cashier = shift's cashier not viewer) — not re-tested this pass. The prior round's report
  (04-pos-final-verification.md) confirmed Z-report money at 3dp and the arithmetic ties; I did
  not re-verify this round and note it only as unconfirmed-by-me, not as regressed.
- **`/ar/inventory` items list Arabic rendering** — not tested this pass.

## PART C — free hunt: only partially covered
Covered: KWD 3dp correctness (found the cash-tender-precision bug above), tax UI absence (not
re-checked this pass, but no VAT/tax string appeared anywhere in my session's cart/receipt/payment
text), three-way tie-out (checked, holds, on both sales I rang). **Not covered**: transactions
list filters/pagination/empty-error states beyond what I incidentally saw, holds and recalls,
returns and voids (attempted to reach void via Recall on my zero-total sale but ran out of clean
UI path in the time available and pivoted to the higher-priority A1/A2 items instead — did not
find a repro nor rule it out).

---

## Direct answer: is POS safe to sign off?

**No, not yet** — one new HIGH (the one-tap Cash tender truncating a 3dp KWD amount to 2dp,
blocking the fast-path completion of any sale whose total has a non-zero third decimal, which is
common) must be fixed first, and the single highest-risk item from the brief — **whether the
TooltipProvider consolidation crashes any of the six named POS surfaces** — was not verified at
all this pass. Signing off without that check is the exact "confirmed vs. known-outstanding"
gamble the honesty rules warn against.

**What is now genuinely fixed and can be closed:**
- Zero-total (100%-off) sale: completes correctly end to end (0 payment rows, stock relieved,
  balanced JEs, no false success) — confirmed at the DB layer on the single-line case.
- Order discount now appears explicitly on the thermal receipt and reconciles
  (subtotal − discount + fee = total) — confirmed in-browser on one live sale.
- Transactions CSV export has the order-discount/delivery-fee columns and name-resolved cashier
  in its code — confirmed by source read plus a successful 200 network round trip.

**What is newly broken and blocks sign-off:**
- HIGH: one-tap Cash tender drops the third decimal on a 3dp currency, reproduced twice.

**What is unverified and must be checked before sign-off, not assumed clean:**
- Tooltips on all six named surfaces (highest risk per the brief).
- POS-024 repro attempt (still open-ended, not attempted this round).
- Multi-line zero-total, offline zero-total under a REAL network cut, void/return of a
  zero-total sale.
- The other five print/output surfaces for the order-discount reconciliation (customer display,
  A4 invoice, public digital receipt, offline local receipt under a real outage, and the export's
  money math for a discount+fee combination specifically).
- Cash movements, register-create float precision, shift/Z-report re-verification,
  `/ar/inventory`.
