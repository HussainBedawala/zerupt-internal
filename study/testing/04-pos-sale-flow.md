# POS Sale Flow — Register Selling Surface, Display Mirror, Transactions List

Tenant: Gulf Auto Parts (KWD, 3dp), Kuwait (no VAT). Tested as **owner**
(`anonymator8@gmail.com`), NOT as cashier1 — per the task's confirmed blocker: `/pos` crashes
permanently for the Cashier role's default permission set (bare `catch{}` in
`use-register-currency.ts` swallows the branch-fetch 403, `currency` stays `""`, unguarded
`formatCurrency("")` throws). That blocker was already filed and is NOT re-investigated here.
**Every UX judgement below is from the owner's session.** Register used: `B1ALRAIMAIREG1`
(Al Rai Main Showroom), a register untouched by the prior registers/shifts session.

Ledger balance check before first write: `0.000000` (line count baseline in the addendum).
Ledger balance check after last write: `0.000000`. No leakage across 3 sales, 1 return, and 1
failed zero-amount attempt.

---

## HEADLINE: click/dialog/field count for one sale, and the 60-second verdict

**Ringing up one scanned/searched item and taking exact cash, from an already-open shift:**

| Step | Action | Type |
|---|---|---|
| 1 | Type into search box (or scan barcode — same field) | keyboard |
| 2 | Click/Enter the matching result to add to cart | 1 click (or Enter if list is keyboard-navigable — see FRICTION-SALE-04) |
| 3 | Press **F4** to open Pay | keyboard |
| 4 | Click the **Cash** tender tile (auto-fills remaining) | 1 click |
| 5 | Click **Complete Sale** | 1 click |

**3 clicks + 1 keyboard shortcut + 0 forced fields** (no customer, no reason, no confirmation) for
an exact-cash sale where the quick-fill lands on the right amount. This is genuinely fast — well
under 60 seconds for a trained user, and probably under 20 seconds for an untrained one **if the
amount happens to be a multiple of 5 fils.**

**Verdict: YES on the happy path, but there is one real landmine an untrained cashier WILL hit on
their first day: HIGH-SALE-01 below.** Any sale total that isn't a multiple of 0.005 KWD makes the
one-click "tap the tender tile" action fill a WRONG amount and silently block Complete Sale with no
guidance beyond a small red "Remaining" line the cashier has to notice, understand, and manually
correct using the on-screen numpad. That is not a 60-second failure for a trained cashier (they
learn to always double check), but it is exactly the kind of "why won't this go through" dead end
that breaks a first-try test with a real customer waiting. See HIGH-SALE-01.

Everything else in the flow (search, add, hold/recall, return) is efficient and correctly
3dp-precise. The module's real friction is concentrated in that one quick-fill rounding bug and in
the payment-surface's total mouse-dependency for quantity/tender entry (FRICTION-SALE-01).

---

## HIGH findings

### HIGH-SALE-01 (CONFIRMED) — Quick-fill "tender exact amount" rounds to the nearest 5 fils for EVERY tender type, not just cash — and for non-cash tenders this doesn't just shortfall, it can OVERSHOOT and hard-block the sale

This deepens and broadens the already-filed cash "fill remaining truncates to 2dp" finding (not
re-filed as new; do not re-count it as a second CRITICAL/HIGH). The actual root cause is **not**
2dp truncation — it is **rounding the remaining balance to the nearest KWD 0.005** (5 fils, the
smallest Kuwaiti coin) applied indiscriminately to the quick-fill action for **every** tender type,
including tenders that have no physical coin and should never be rounded at all.

**Repro 1 (cash, corroborates the filed finding):** Sale total KWD 58.582. Tap the Cash tile.
Field fills `KWD 58.580` (58.582 rounds down to nearest 0.005). "Remaining: KWD 0.002" persists,
Complete Sale stays disabled until manually corrected.

**Repro 2 (KNET/card, NEW instance, same root cause):** Sale total KWD 3.583. Tap the KNET tile.
Field fills `KWD 3.585` (3.583 rounds UP to nearest 0.005 this time — 3.583/0.005 = 716.6 → 717 ×
0.005 = 3.585). The screen correctly shows `status: "Change is only given on cash. Reduce the
card/account amount to the total."` and blocks Complete Sale — but the cashier is the one who has
to notice this and manually retype the exact amount on a tender that should never have needed
rounding to a coin denomination in the first place (electronic settlement, exact by construction).

**Math showing it's the same helper both times:**
- 58.582 / 0.005 = 11716.4 → rounds to 11716 × 0.005 = 58.580 (down)
- 3.583 / 0.005 = 716.6 → rounds to 717 × 0.005 = 3.585 (up)

Both match "round remaining to nearest 0.005", not "truncate to 2dp" — worth correcting the shape
of the existing filed bug for whoever fixes it: the fix is **not** "keep 3dp instead of 2dp", it is
**"only apply denomination rounding when the selected tender is Cash; for KNET/Credit
Card/On Account, quick-fill must fill the exact remaining balance."** One shared helper (the
tender's quick-fill handler), two call sites minimum (Cash + KNET, possibly Credit Card too —
not independently confirmed but same code path).

**Severity: HIGH** — same tier as the already-filed cash instance, escalated by the fact it can
also fully block completion of a non-cash sale that a real customer is standing at the counter
paying with a card, for a rounding step that shouldn't exist on that tender at all.

---

### HIGH-SALE-02 (CONFIRMED) — Confirm-zero-amount dialog offers "Complete anyway" but completing ALWAYS fails; the promised action doesn't work

A pre-existing leftover test promotion (`ZZTEST Boundary Promo`, 100% off, created in an earlier
inventory-pricing testing session, targeting `ZZTEST-SKU-0001`) auto-applies to that item and
zeroes the cart total. Adding it and pressing Pay → Complete Sale correctly surfaces:

> **"Confirm zero-amount sale" — "This sale totals KWD 0.000. Complete anyway?"** with a
> **"Complete anyway"** button.

Clicking "Complete anyway" **always fails**, every time, with a generic toast: *"Payment failed.
The cart is unchanged; retry."* Console shows the real cause:

```
[pos][pay-surface] complete sale failed Error: Cannot complete a sale with no payments.
    at assertSalePayable (...pos/offline/...)
```

The client-side `assertSalePayable` guard unconditionally requires at least one non-zero payment
leg — but a KWD 0.000 sale has, by construction, nothing to pay, and the UI's own explicit
"Complete anyway" button promises this is a supported path. **The feature the confirmation dialog
offers does not exist.** Anyone using POS for a fully-discounted/free item (staff giveaway, 100%
promo, warranty replacement rung at KWD 0) hits a dead end every time, with an error message that
gives no indication of what's actually wrong (same generic-toast pattern as
FRICTION-POS-01 from the prior registers/shifts session).

**Severity: HIGH** — a button that always does the opposite of what it says ("Complete anyway"
never completes) is exactly the founder's standard finding ("a button must do what its label
says"), and it fully blocks a legitimate (if rare) business scenario with no workaround in the UI.
No data was written — verified no `pos_transactions` row exists for this attempt.

---

### HIGH-SALE-03 (CONFIRMED, broadens CRIT-POS-01 — do not re-file, do not re-count) — The unguarded `formatCurrency("")` crash that is PERMANENT for the Cashier role is also a TRANSIENT crash for every other role, including the Owner

CRIT-POS-01 (already filed, not re-investigated) documents that the Cashier role crashes `/pos`
**permanently** because `GET /tenant/branches/:id` 403s for that role forever. While re-authenticating
as owner mid-session (after the browser tool itself reset — see Method notes), navigating straight
to `/pos` right after a fresh login + branch selection hit the **identical** crash as the owner:

```
[ErrorBoundary] Error: formatCurrency: invalid ISO 4217 currency code ""
    at formatCurrency (...) at RegisterShell (...register-shell.tsx...)
```

Clicking **"Try again"** on the error boundary self-healed it immediately (by then the async
`fetchRegister`/`fetchBranch` currency resolution had completed). This confirms the missing guard
at `register-shell.tsx:781` (the one unguarded call site among ~10 siblings that do
`{...(currency ? { currency } : {})}`) is **not cashier-permission-specific** — it is a **race
between first paint and the async currency fetch that can hit ANY role**, on any cold load of
`/pos`. For a role whose branch fetch 403s (Cashier) it's permanent; for a role whose fetch merely
hasn't resolved yet (Owner, on a fast reload or a slow network moment) it's a self-healing
"Something went wrong" crash that a real user would have no reason to know to retry rather than
give up on.

**Severity: HIGH** (adds to, does not replace, the filed CRITICAL) — the fix scope for CRIT-POS-01
should explicitly cover BOTH causes of an empty `currency` string (permission denial AND normal
load-time race), not just the permission gap, or the guard fix will still leave a transient crash
for every role on a cold load.

---

## MEDIUM / observations

### MED-SALE-01 (SUSPECTED) — App shows "Offline" during sales that complete instantly against a live, reachable server (corroborates HIGH-POS-03 from the prior session, now also reproduced in the OWNER's session, not just cashier1's)

Every sale this session (as owner, in a different browser process, on a different register than
the prior session's cashier1 test) showed the header pill as **"Offline"** and produced receipts
labeled `Device no. OFF-B1ALRAIMAIREG1-1-N`, even though the API was reachable and responding
throughout (confirmed: catalog/search/item-detail/settings calls all returned 200 in the same
network log). One sale (the double-click debounce test, `-00004`) instead produced a
`Receipt no.` (online path) with an immediately-active WhatsApp button — so the app *can* and does
go online, just not consistently, and switches without an obvious trigger visible from the UI.

Reproducing this across two independent sessions (different persona, different register, different
browser process) makes it less likely to be pure test-harness noise, but I did not instrument
`navigator.onLine` or the detector's own logic directly this session (that diagnostic work belongs
to whoever owns HIGH-POS-03) — kept SUSPECTED per the prior filing, now with a second independent
corroboration. **Do not re-count as a new finding**; flagging only that it reproduced in a second,
different context.

### MED-SALE-02 (CONFIRMED, positive-adjacent) — Cart-level "Tax" row shown even where the receipt correctly omits it
The cart pay surface always shows a `Tax KWD 0.000` line (already filed, not re-filed). Noted here
only because the **completed-sale receipt view does NOT show a tax line at all** (just Subtotal/
Total) — so the tax-row bug is confined to the cart/pay surface, not the receipt. Not a new
finding on its own, just scoping the blast radius of the existing one down to pre-completion
screens only, which narrows the fix.

---

## FRICTION findings (works, but wastes time / needs a mouse)

### FRICTION-SALE-01 (CONFIRMED) — Quantity adjustment on a cart line has NO keyboard path at all
The only way to change a line's quantity beyond typing a fresh search+add is the mouse-only
**"Increase quantity" / "Decrease quantity"** stepper buttons on the cart line. There is no
focus-and-type quantity field, no numeric-keypad-on-the-line, and no keyboard shortcut. For a
scanner+keyboard-first workflow (the addendum's explicit design target), needing 5 mouse clicks to
ring up "5 of the same item" (vs. scanning the barcode 5 times, which does work — see
FRICTION-SALE-02) is a real gap for anyone using a keyboard-only till.

### FRICTION-SALE-02 (POSITIVE, confirmed) — Repeated scan of the same item correctly increments quantity
Re-adding the same item via search+click a second time correctly bumped the existing line's
quantity (1 → 2, `KWD 29.291` → `KWD 58.582`, exact 3dp) rather than creating a duplicate line.
Confirms the "scan the same barcode 50 times" dumb-user case degrades gracefully into "qty 50",
not 50 separate lines or a crash.

### FRICTION-SALE-03 (CONFIRMED, environment-adjacent, real trigger plausible) — A held/parked sale surfaces cleanly, but the underlying test tool's automation revealed the search combobox silently treats fast literal text entry as barcode input first
When text was typed into the search field via a fast programmatic `type` action (not `fill`), the
combobox entered a **"Resolving item…"** state and issued `GET /items/barcode/<the literal typed
string>` — i.e. it raced the "is this a barcode scan" heuristic against the "is this a free-text
search" path and, for fast keystroke bursts, guessed barcode. A real handheld scanner emits keys
even faster than this, so the heuristic is presumably tuned around that — but a fast human typist
(not uncommon for an experienced cashier) could plausibly trigger the same misfire on partial
input, landing on a dead `404` and having to wait it out before search works. Not independently
confirmed with a real keyboard's timing (this was via the test harness's `type` command), so kept
as FRICTION rather than a numbered HIGH — flagging the mechanism for whoever owns the scan-anywhere
heuristic to judge whether real typing speeds can trigger it.

### FRICTION-SALE-04 (observation) — Search-result list appears to require a click; no confirmed keyboard "select top result" shortcut
Across several searches, Enter/arrow-key navigation of the results list was not exercised
end-to-end (time-boxed); every add-to-cart in this session was via a mouse click on the result
button. Given the addendum's "keyboard-first" mandate, whether Enter-selects-top-result exists is
worth a follow-up check by whoever picks this module up next — flagged as an open question, not a
confirmed gap.

---

## POSITIVES (confirmed)

- **Full three-way tie-out (POS ↔ GL ↔ stock) held exactly for every write this session**,
  across 3 sales and 1 partial return, in two different tender types:
  - Sale 1 (cash, KWD 58.582, qty 2): JE1 DR Cash 1112 58.582 / CR Sales 4110 58.582; JE2 DR COGS
    5100 35.760 / CR Inventory 1141 35.760; stock -2 qty @ 17.880 unit cost.
  - Sale 2 (KNET/card, KWD 3.583, qty 1): JE1 DR Bank 1121 3.583 / CR Sales 4110 3.583; JE2 DR COGS
    5100 2.799 / CR Inventory 1141 2.799; stock -1 qty @ 2.799 unit cost. **Correctly routed to a
    distinct GL account (1121 Bank) from the cash sale (1112 Cash Register)** — tender-to-account
    mapping is tender-specific, not hardcoded to one cash account.
  - Return (cash, partial qty 1 of 2, KWD 29.291): JE1 DR Sales Returns 4200 29.291 / CR Cash 1112
    29.291; JE2 DR Inventory 1141 17.880 / CR COGS 5100 17.880; stock +1 qty @ 17.880 (mirrors the
    original sale's unit cost exactly — current-WAC-at-return not used incorrectly).
  - Sale 4 (cash, KWD 27.105, double-click test): single JE pair, single `pos_transactions` row —
    **no double-charge** (see below).
  - Tenant-wide ledger balance (`sum(debit-credit)` over `journal_entry_lines`) was `0.000000`
    before the first write and `0.000000` after the last, across all of the above.
- **Double-click "Complete Sale" does NOT double-charge.** Fired two near-simultaneous clicks on
  Complete Sale for a KWD 27.105 cash sale; exactly one `pos_transactions` row was created
  (`-00004`), one JE pair, one stock movement. Debounce/idempotency holds under a real "impatient
  cashier" click pattern (not just the offline-clientId idempotency the hardening log describes —
  this was an online-path double click).
- **Partial return correctly computes a proportional refund**, exact 3dp: returning 1 of 2 units
  from a KWD 58.582 (qty 2 @ 29.291) sale showed "Refund total KWD 29.291" before confirming, and
  the persisted JE matched exactly.
- **Held/parked sale round-trips with nothing lost.** F2 to hold with an optional label
  (`ZZTEST-hold-test`), F3 to recall, shows name + item count + amount (`1 item 3.583`), and
  recalling restored the exact same cart (item, qty, price) with no loss.
- **"Cancel sale" requires no reason and clears with one confirm dialog** — matches the locked
  design decision from the hardening log (reason optional pre-completion, single confirm, no
  stacked dialogs). Confirmed again in this session (2nd independent confirmation of the same
  positive from the prior registers/shifts report).
- **F4 (Pay) and F2 (Hold) keyboard shortcuts both work reliably** from the register screen without
  needing to click into the cart first.
- **SKU search returns the exact match plus fuzzy neighbors** (searching the literal SKU
  `ZZTEST-SKU-0001` or `GAP-ELEBAT-00003` surfaced the exact item first, with visible SKU text in
  the result row) — good for a cashier reading a SKU off a shelf label or an old receipt.
- **Out-of-stock items are sellable with a visible "Oversell 0" badge**, not silently blocked or
  silently allowed — the cashier can see the item shows zero stock and still choose to sell it
  (never-lose-a-sale design intent holding up in practice).
- **Bilingual (ar/en) item names appear automatically on both the on-screen receipt and printed
  receipt text** (e.g. "قرص فرامل أمامي KYB" alongside "Brake Disc Front KYB Ford Explorer") with
  no extra cashier action required.
- **No VAT/tax UI on the completed-sale receipt** (only the pre-payment cart surface shows the
  already-filed unconditional `Tax KWD 0.000` row — see MED-SALE-02) — correct for Kuwait.
- **Money precision held at full 3dp everywhere checked this session**: catalog prices, cart
  subtotal/total, quick-cash/KNET numpad entry, receipts, and every GL/stock figure cross-checked
  against the DB.
- **Transactions list (`/pos/transactions`, in the (app) shell)**: shows all sales/returns with
  correct types, correctly links a return row back to its original sale
  (`B1ALRAIMAINS-POS-B1ALRAIMAIREG1-1-00003 → -00001`), the type filter correctly narrowed
  5 → 1 transaction, and the export request correctly carried the applied filter
  (`GET .../export?type=return` — verified in the network log, not just the on-screen filter state).
  Export response returned 200 with a small non-empty payload; I was not able to open the actual
  downloaded file end-to-end this session (the harness's direct-URL download bypassed the app's
  bearer-token auth and 401'd — an environment/tooling limitation, not a product bug) so I cannot
  personally confirm the CSV's column contents/filename — flagging as an incomplete check for
  whoever verifies this screen next, not as a finding.

---

## What was NOT re-tested / out of scope here (per task boundaries)
- Registers list/detail, shift open/close, X-report, Z-report, cash movements — owned by the prior
  `04-pos-registers-shifts.md` session; not re-verified except where a new sale/return needed a
  shift open (opened cleanly, register `B1ALRAIMAIREG1`, left open at session end, shift #1).
- Cashier persona on the register itself — blocked by the confirmed CRIT-POS-01; all testing here
  is from the owner's session, as instructed.
- Full customer-display mirror live-sync test — attempted, but the test browser process itself
  restarted mid-attempt (lost session + open tab, see Method note below) before a second tab could
  be held open long enough alongside a live cart on the main register tab to observe the mirror.
  Not re-attempted given time already spent recovering login/branch-selection state twice. This is
  a genuine coverage gap in this report, not a negative finding either way.
- ar/en RTL screenshot-level comparison of the register screen itself — not done this session
  (time-boxed); only receipt-level bilingual text was checked.

## Method notes (environment, not product)
- The `gstack browse` tool itself restarted/lost its browser session **twice** mid-session
  (unrelated to the app — confirmed via direct `curl` that both the Next.js dev server and the API
  stayed up and responsive throughout both resets), each time requiring a fresh login and branch
  selection. This is the same tool instability the prior registers/shifts session reported.
- One quantity-stepper "rapid parallel click" test (10 concurrent background clicks) produced only
  +4 to the quantity instead of +10 — but since this was fired as 10 truly-simultaneous OS-level
  CDP commands (not achievable by a real human clicking a mouse), it is **not** reported as a
  finding; it's ambiguous whether the drop is a real app race or a test-harness artifact of firing
  clicks faster than any human could, and rule 5 (repeat a control before trusting it) says not to
  file it on a single ambiguous run.
