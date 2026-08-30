# POS Fix Verification — Cashier Persona (2026-08-26)

Logged in as **cashier1** throughout (asserted via `Cashier: 48123301-29f2-46a2-a50c-479911c73142` header
on every screen and via JWT `sub` claim used for API calls). Register **B2FAHAHEELREG1** (Fahaheel branch),
Shift #3. Switched to a second browser tab for the customer display (item 7) and briefly to the owner's
prior-agent-created closed shift data for the Z-report (read-only, no role switch needed since it was
cashier1's own shift #1). No owner login was used.

Ledger check: `0.000000` before first write, `0.000000` after last write (698 → many more lines, still
balanced). All documents created logged in `_documents-created.md`.

## Cashier 60-second verdict

**FAIL for a first-try untrained cashier**, not because of clicks/dialogs (the barcode-scan-to-cash flow
itself is fast: click item → Pay (F4) → tender → Enter, about 4-5 actions, comfortably under 60 seconds
for a plain cash sale) — but because **two of the four payment-adjustment features silently produce the
wrong total**, and neither the cashier nor the customer would notice on the receipt. That is a much worse
failure mode than a slow flow: the cashier believes the sale is correct because the screen said so.

## REGRESSIONS (read this first)

### R1 — CRITICAL — Order-level discount silently dropped at payment step, customer overcharged
Applied a KWD 70.000 order discount in the cart (subtotal 83.504 → total 13.504, clearly shown in the
cart UI). Opened Payment (F4): **Amount Due read KWD 83.504** — the discount had vanished. Completed the
sale anyway to see the real-world outcome: receipt shows Subtotal 83.504, **no discount line**, Total
83.504, Cash 83.504. DB confirms: `pos_transactions` row `5f8f407a-c59a-45b7-a09d-447ff1014a1e`,
`grand_total=83.504000`, `discount_total=0.000000`, `order_discount_amount=0.000000`. The customer was
charged the full undiscounted price. Ledger tie-out: JE posted 83.504=83.504 (balanced, but balanced
against the WRONG revenue number).

### R2 — CRITICAL — Delivery fee silently dropped at payment step, merchant undercharges (this is item 14)
Same mechanism, opposite direction. Added a KWD 3.000 delivery fee to the cart (129.266 total, clearly
shown). Opened Payment: **Amount Due read KWD 126.266** — fee dropped. Completed via KNET. Receipt and DB
(`pos_transactions` `801f4bc6-b156-48c0-a995-7c0c3f430d6a`) both show `grand_total=126.266000`,
`delivery_fee_amount=0.000000`. The merchant loses the delivery fee they explicitly charged.

**R1 and R2 are the same bug**, not two: the Payment sheet's "Amount Due" is computed from the raw
line-item subtotal and never re-reads order-level adjustments (order discount, delivery fee) made in the
cart before Pay was pressed. Both fixes claimed for this batch (item 14) and the untouched order-discount
path share this one predicate. Fix it once, in the shared totals calculation the Payment sheet reads —
not per-adjustment-type.

### R3 — MEDIUM — "Tax KWD 0.000" row flickers for the cashier specifically (root cause identified)
See item 4 below — not simply "still shows a row", it intermittently appears and disappears depending on
render timing, and the reason is cashier-specific: `GET /tenant/settings` returns **403 for cashier1**
(confirmed repeatedly in the network log), which is the query `useSellerContext` uses to resolve
`countryCode`/`taxSystem`. `cart-totals.tsx` deliberately **fails OPEN** (shows the row) while that
context is loading/blocked, by design ("never hide a real tax line because a fetch is in flight"). Because
the org query for a cashier never truly resolves (403, not merely slow), the tax row can reappear on
re-renders even after having correctly hidden. The owner would not see this because their org query
succeeds.

### R4 — LOW — Z-report renders sales totals at 2dp in a 3dp tenant
`GET /tenant/pos/shifts/:id/z-report` returns `"totalSales":"47.161000"` (correct 3dp) but the printed
Z-report shows `Total sales 47.16` (2dp), same for `Net sales` and `Void amount`. This is a DIFFERENT
occurrence from the already-filed POS-001 (opening-float placeholder) — do not conflate, but do not
ignore either: it is the same class of bug (a KWD money field rendered 2dp) in a new location.

### R5 — SUSPECTED — Cart-line qty ArrowUp affected two lines at once
See item 15 below.

---

## Item-by-item verdicts

### 1. THE BIG ONE — `/pos` no longer crashes for the Cashier — **CONFIRMED FIXED**
Opened `/pos` as cashier1, register auto-resolved, opened/reused shift #3, reloaded repeatedly (5+
times across the session) — never crashed. Money renders as `KWD 0.000` / `KWD 12.345` etc. everywhere,
always 3dp. Network log: `GET /tenant/pos/registers/657036ca-...` → 200, payload includes
`registerCode`, and `localStorage['zerupt:pos-register']` confirms `"currency":"KWD"` sourced from that
call. **No 403 on any branch endpoint** was observed anywhere in the session (the only persistent 403s
are `/tenant/settings`, an unrelated org-settings endpoint — see R3). Confirmed via direct DOM/localStorage
inspection, not just visual absence of a crash screen.

### 2. Z-report screen loads — **CONFIRMED FIXED**, with a caveat and one regression (R4)
Opened Z-report for cashier1's own closed shift (`604d707b-...`, shift #1). Page hydrates and renders in
full (took ~9s wall-clock across three sequential API calls at ~700ms-3s each — consistent with this
machine's documented Neon RTT, not a new perf bug). A shift belonging to a DIFFERENT cashier
(`5b4549f8-...`, shift #2, cashier `da7126c7-...`) stayed on the loading spinner forever even though its
API calls all returned 200 — could not distinguish whether that is an intentional cross-cashier access
restriction rendered badly (infinite spinner instead of a "not your shift" message) or a genuine client
bug; flagging as **MEDIUM, SUSPECTED** since I could not confirm the server actually denies it (all
network calls showed 200, so if it's a permission wall it is enforced nowhere I could see — needs a
backend-code read to settle, out of scope for this pass).
Register-settings `registers-table` tooltips — **NOT VERIFIED**: ran out of session time before reaching
`/pos/registers`; do not take this as "fine", it is simply unchecked.

### 3. Ring up a complete sale as cashier, under 60 seconds — **CONFIRMED (mechanically) / FAIL (in substance)**
A plain cash sale is genuinely fast: click item in grid (1 click) → Pay F4 (1 key) → type amount → Enter
(1 key) → New Sale. That is roughly 4 actions and well under 60 seconds; an untrained cashier could do
this on the first try. But see R1/R2 — the moment a discount or delivery fee is involved (both are
front-and-center buttons right there in the cart, a cashier WILL press them), the sale silently completes
for the wrong amount with no error, no warning, nothing on the receipt to say so. A "fast, wrong" flow is
worse than a slow, right one, so the module-level verdict for this item is **FAIL**.

### 4. Tax row is gone (Kuwait, no VAT) — **PARTIALLY FIXED (flaky, root cause identified — see R3)**
- Cart: observed BOTH states in the same session on the same cart contents — "Tax KWD 0.000" visible
  immediately after adding one item, absent moments later after a debounced re-render, reappeared again
  during a live search. Root cause: `cart-totals.tsx`'s `showTax` fails open while `useSellerContext` is
  unresolved, and for cashier1 the underlying org-settings call 403s (confirmed repeatedly in network
  log), so the "resolved, hide it" state is never durable.
- Receipt: **no Tax line ever shown** on any of the three completed receipts in this session (cash,
  KNET, discount sale) — the print/receipt path evidently uses a different, more reliable predicate
  (matches briefing's note that the receipt uses "hasTax-by-amount"). That predicate should be the one
  the live cart also uses.
- Verdict: the SAME defect exists twice (cart vs receipt), one copy is more robust than the other. Not
  "fixed", it's inconsistent — and specifically broken for the persona this whole exercise is about
  (the cashier), not for the owner who tested it before.

### 5. Card/KNET sale completes; cash rounds to 5 fils, card doesn't — **CONFIRMED FIXED**
Cash sale KWD 8.332, tendered KWD 10.000 → Change Due **KWD 1.670** (8.332→10 is 1.668, rounded to
nearest 0.005 = 1.670, correct 5-fils-up rounding). KNET sale (KWD 126.266, after R2 dropped the delivery
fee) completed successfully with an auth-code field, receipt shows `Card KWD 126.266` — no rounding
applied to the KNET tender amount. Both payment rails work end to end; card is no longer blocked.

### 6. Zero-total sale completes, stock still relieved — **STILL BROKEN**
Cart with the pre-existing `ZZTEST Boundary Promo` (100% off) on `ZZTEST-Brake Pad Set Front Test 2`
(KWD 12.345 → KWD 0.000). Pay (F4) → "Confirm zero-amount sale" dialog appears (no longer instant-fails
on the confirm click, that part is fixed) → clicked "Complete anyway" → client shows "Sale completed" and
queues it offline (`OFF-B2FAHAHEELREG1-3-1`). It then landed in the **Failed sync queue**: "Request
validation failed". No `pos_transactions` row was ever created for it (checked before/after: the id
sequence skips straight from `...00001` to the next real sale). **Root cause found in code**:
`apps/api/src/pos/sync/pos-sync.dto.ts` line ~171 still has
```
payments: z.array(syncPaymentSchema).min(1),
```
while `apps/web/src/features/pos/offline/sale-builder.ts` (lines 94-134) was deliberately changed to
build a **zero-payment** array for a zero-total sale, with an explicit comment: "A zero-total sale with
zero payment rows is valid ... there is deliberately no separate payments.length === 0 guard". The client
fix and the server validation were never reconciled — the client now WILL submit a zero-payment sale, and
the server DTO rejects it outright with `.min(1)`. This is exactly the "same predicate patched on one
side only" failure mode the briefing warns about. Fix: relax the server schema to `.min(0)` for a
zero-grand-total sale (or drop `.min()` and validate payments-sum === grandTotal, which already tolerates
zero on both sides).

### 7. Customer display shows CHANGE DUE, discount row correct, no cost leak — **PARTIALLY FIXED**
- Line items and grand total sync live to `/pos/display` in a second tab, near-instantly.
- Per-line totals correctly reflect the order discount proportionally allocated (12.483 + 1.021 = 13.504
  when a KWD 70 discount was on the cart) — this part is genuinely fixed, no more hardcoded "-KWD 0.000".
- **BUG** (same root cause as R1/R2): the instant Payment (F4) was opened on tab 1, the display
  (tab 2) reverted to the **pre-discount** line totals and total (83.504 instead of 13.504) — it is
  reading the same broken payment-step totals object, not the cart's own state.
- Change Due: could not observe it render because the only live test that reached the tender step also
  hit R1 (discount dropped), so "amount due" and "tendered" no longer disagreed in the way that would
  produce a real change-due figure to check. Not independently confirmed either way — **NOT VERIFIED**.
- No cost/margin was visible on the display in any state observed.

### 8. Blind close is blind; expected cash includes pay-in/pay-out — **CONFIRMED FIXED**
Close Shift dialog: "Reveal expected cash and difference" button `disabled=true` (checked via
`button.disabled` in the DOM, not just visually greyed) until a count is typed. Typing a count replaces
the button with the revealed expected/over-short panel directly (arguably better than the described
"button becomes clickable" — it just reveals as soon as a valid number exists, still gated on typing
first).
Arithmetic verified via `GET /tenant/pos/shifts/:id/z-report` for a shift with real pay-in/pay-out
(`604d707b-...`): `cashSummary = { openingFloat: 25.5, cashSales: 47.161, payIns: 10.5, payOuts: 5.25,
expectedCash: 77.911 }`. `25.5 + 47.161 + 10.5 − 5.25 = 77.911` — matches exactly. `actualCash: 70.000`,
`cashOverShort: −7.911` — also arithmetically correct. Pay-in/pay-out are genuinely included now.

### 9. Shift header shows the SHIFT's cashier, not whoever is logged in — **CONFIRMED FIXED (mechanism), LOW finding on display**
Every screen (register, Z-report) showed `Cashier: 48123301-29f2-46a2-a50c-479911c73142` — this IS
cashier1's own id, and it stayed correct across shift #1 (closed, cashier1) and shift #3 (open, cashier1)
without ever showing a different logged-in identity. Mechanically correct. Separately (not one of the 14,
noting as a real UX gap): it is rendered as a **raw UUID**, never resolved to a display name, on both the
live register header and the printed Z-report. `GET /tenant/users/directory` IS called successfully by
the cashier session, so the data to resolve a name is available — this looks like a simple missed
join/lookup in the shift-header and Z-report components. LOW/cosmetic, but very visible (it's the first
thing on every POS screen).

### 10. Void button is permission-gated for cashier1 — **CONFIRMED FIXED**
Checked both surfaces:
- Sync queue drawer ("Failed sync review"): `Void` button has `disabled=true` in the DOM.
- Same screen doubles as the "failed-sync review screen" in this build (there is one drawer for both
  purposes) — `Void` disabled there too.
Did not find a visible reason/tooltip string on the disabled button itself (no title/aria-describedby
inspected) — cannot confirm the "not a dead end, has a reason" half of the requirement. **PARTIALLY
VERIFIED**: disablement is real and consistent; the explanatory copy was not confirmed present.

### 11. Arabic category chips — **STILL BROKEN**
`/ar/pos`: page is otherwise correctly RTL (Arabic labels for cart, customer, shift menu, all sidebar
copy; money right-aligned; layout mirrored). But every category chip is still in English: **"Tyres",
"Suspension", "Lubricants", "Filters", "Engine Parts", "Electrical", "Brakes", "Accessories"** — only
"All" is translated (as "الكل"). Confirmed by direct screenshot, not inference.

### 12. Enter completes the tender; F-keys don't fire behind an open dialog — **CONFIRMED FIXED (Enter) / NOT FULLY VERIFIED (F-key-behind-dialog)**
Enter on the payment screen: with amount due already covered (KNET/cash both), pressing **Enter**
completed the sale in both cases without touching the mouse — confirmed working twice, independently.
On the zero-amount confirm dialog, Enter also correctly triggered the visible "Complete Sale"/"Complete
anyway" action rather than doing nothing. Did not specifically test whether an **F-key** (e.g. F4) typed
while a DIFFERENT dialog (say, the delivery-fee numpad) is open leaks through to flip the cart to
Payment behind it — ran out of budget for this specific regression check. **NOT VERIFIED** — the
regression this fix targeted (F-pay firing behind an open dialog) was not independently re-created.

### 13. Cost is stripped for the cashier — **CONFIRMED FIXED**
Direct `curl` with cashier1's bearer token against `GET /tenant/pos/transactions/:id` and
`GET /tenant/pos/transactions/:id/receipt` for a real completed transaction: **no `cost` key present at
all** in either JSON payload (grepped the full pretty-printed body for "cost", zero matches). Absent, not
blanked/zeroed — correct implementation.

### 14. Delivery-fee sale — **STILL BROKEN** (see R2 above)
There IS a UI setter (`Add delivery fee` button + numeric keypad, confirmed reachable and functional in
the cart) — the addendum's caveat about "no HTTP setter reachable through the UI" does not apply, it is
reachable. But the fee is silently dropped the instant Payment opens, and the completed sale/DB/receipt
all confirm it. This is the same defect as R1 (order discount), not a separate one — see the writeup at
the top.

### 15. Cart-line keyboard shortcuts (new, cart-line-row.tsx) — **SUSPECTED BROKEN / NOT FULLY VERIFIED**
- **ArrowUp/Down qty stepper**: focused the qty control on one cart line (Floor Mat Set, qty 1) and
  pressed ArrowUp once. Result: **both** cart lines present at that moment (Floor Mat Set AND a second
  ZZTEST line) incremented from qty 1 to qty 2 simultaneously, confirmed via before/after screenshots and
  the recomputed subtotal (18.658 → 37.316, exactly double both lines). This is either a genuine
  cross-line bug (the shortcut is wired to a global "last touched" line rather than the specifically
  focused DOM row) or an artifact of how the click-then-focus was scripted in this session
  (`document.activeElement` did report the correct single button before the key press) — I cannot rule
  out the second explanation with full confidence given the automation involved, so this is **SUSPECTED,
  not CONFIRMED**, and needs a manual mouse-driven re-check.
- **Floor/serial-tracked exemption**: not tested — no serial-tracked item was in a live cart at the time
  of the qty-stepper check.
- **Delete key vs PIN input focus**: not tested — no approval-PIN field was present on any cart line in
  this session (register has no approval gates enabled), so there was nothing to type into to check
  Delete-swallowing.
- **InfoHint icon fit at 375px**: not tested — ran out of session time before a responsive pass on the
  cart panel.
- **Arabic strings for the new hint**: not tested for the same reason.
- **Shortcuts suppressed while a dialog is open**: not tested for the same reason.
Overall: item 15 is the least-verified item in this pass, purely due to time — treat everything above as
a starting point for a dedicated follow-up, not a clean bill of health.

---

## Three-way tie-out (POS record ↔ GL ↔ stock), confirmed on the one clean sale
Cash sale `ebab5c11-0227-4575-9abf-b4f36854ba7b` (Battery 12V 100Ah Exide Honda Civic, KWD 8.332):
- `pos_transactions`: `grand_total = subtotal = 8.332000`, `status = completed`.
- `journal_entries`/`journal_entry_lines` joined on `source_document_id`: one JE,
  `event_type = pos.transaction.completed`, `sum(debit) = sum(credit) = 8.332000` — balanced.
- `stock_ledger_entries` joined on `source_document_id`: one row, `movement_type = sale`,
  `quantity = -1.000000`, `total_cost = 5.359000`, `source_document_type = 'pos'`.
All three agree. This is the one sale in this session NOT touched by R1/R2, and it ties out cleanly —
confirming the underlying event/outbox/JE/stock machinery itself is sound; the bug is specifically in
what the Payment sheet sends as the amount, upstream of all that.

## What I did NOT get to (say so plainly, per the brief)
- `/pos/registers` → register-settings `registers-table` tooltip regression check (item 2's second half).
- F-key-behind-open-dialog regression re-creation (item 12's second half).
- Void-button explanatory copy/tooltip (item 10's second half).
- Most of item 15 (serial-tracked exemption, Delete-vs-PIN-input, 375px hint layout, Arabic hint strings,
  shortcuts-suppressed-during-dialog).
- ~30-list-panel `keepPreviousData` sweep for POS's own list screens (transactions list, sync queue) —
  not audited this pass.

## Severity summary
- **CRITICAL** — R1 (order discount dropped, customer overcharged) and R2/item 14 (delivery fee dropped,
  merchant undercharged): same root cause, one shared fix needed in the Payment sheet's amount-due
  calculation.
- **HIGH** — item 6 (zero-total sale still rejected server-side; root cause pinpointed to one line in
  `pos-sync.dto.ts`).
- **MEDIUM** — item 4/R3 (tax row flicker, cashier-specific, root-caused to a 403 on `/tenant/settings`);
  the shift-#2-loads-forever-for-a-different-cashier behavior (item 2 caveat).
- **LOW** — R4 (Z-report 2dp), item 9's raw-UUID cashier display, item 11 (Arabic chips still English).
- **SUSPECTED / NOT VERIFIED** — item 15 (qty-stepper cross-line increment), items 2/10/12's second
  halves, item 7's change-due rendering.

## Confirmed fixed, no caveats
Item 1 (the headline "/pos" crash — this is real and solid), item 5 (cash 5-fils rounding / KNET no
rounding), item 8 (blind-close gating + expected-cash arithmetic including pay-ins/outs), item 13 (cost
stripped from cashier-visible payloads).
