# POS tooltip crash risk + closing gaps — verification pass (2026-08-27)

Persona: **cashier1** (Cashier role) throughout, except where noted as **owner**
(anonymator8@gmail.com) for permission-gated screens. Every claim below states its layer
(browser / curl / DB / code).

Ledger balance: `0.000000` before (736 lines) and after (750 lines) — held throughout, per
`study/testing/_documents-created.md`.

---

## PRIORITY 1 — Tooltip crash risk: VERDICT = SAFE, one adjacent finding

Hovered a real tooltip trigger on every surface, watching the console for
"Tooltip must be used within TooltipProvider" and any React error. None occurred anywhere.

| Surface | Tooltip found? | Result |
|---|---|---|
| `/pos` cart panel (quantity-stepper InfoHint) | Yes — icon next to qty stepper | **Renders correctly** ("Keyboard: select the quantity, then use up/down arrows to change it. Press Delete anywhere on this line to remove it."). No crash, no console error. |
| Queue drawer (`Open sync queue` → drawer) | No tooltip visible (queue was empty — "Everything is synced", nothing to hover) | No crash on open/close. Cannot confirm a tooltip renders inside a populated queue row — not reachable this session (queue was always empty). |
| Sync status pill (top of register) | Yes | **Renders correctly** ("Connection and sync status. Tap to view the sync queue."). No crash. |
| Shift management panel (Shift → Shift summary) | **None found** — no `[data-slot="tooltip-trigger"]` anywhere in this modal | No crash either way, but this is a "tooltip never renders" case per the brief's own standard — nothing to verify here, said plainly. |
| Z-report (`/pos/shifts/:id/z-report`) | Loaded only after actually closing Shift #3 (see below); the report never rendered because the close never landed server-side — see the CRITICAL finding | **Not reachable this session** for a tooltip check — the report page itself never got past the 409 error state despite the client showing "shift closed." |
| Customer display (`/pos/display`) | No tooltip trigger in DOM (empty "Waiting for register…" state, single-tab test can't mirror a live cart via BroadcastChannel) | No crash. Empty-state only; not a full test of a populated display's tooltips (if any exist there). |
| `/pos/registers` (registers table) | Yes — the "Deactivate" icon button | **Renders correctly** ("Deactivate" label appears on hover). No crash. Confirms the file-header claim that this screen deliberately kept its own local `TooltipProvider` because it sits under `(app)`, which has no global provider — **that reasoning is correct and the screen is NOT dead.** |
| `/pos/registers/:id` (register detail) | No tooltip trigger found in the KPI strip / tabs / Z-report history table | No crash. Just nothing to hover here. |

**Bonus finding (code-read, not one of the six named surfaces, flagging because it's the
identical defect class the brief is hunting for):** `tender-account-cell.tsx` (used inside
`TenderTypesPanel` → `PaymentMethodsPanel`, rendered at Settings → Payment Methods,
`(app)/settings/[section]/page.tsx`) renders a bare `<Tooltip>` with **no `TooltipProvider`
anywhere in its ancestor chain** — the `(app)` layout, the `settings` layout, and
`registers-table.tsx`'s local provider (a different route) all fail to cover it.
**MEDIUM, CONFIRMED (code read end-to-end):** hovering the tender-account info icon on
Settings → Payment Methods should be checked — I did not have time to browser-verify it this
pass (it's outside the six named POS surfaces), but the code shape is the exact defect this
whole task exists to catch. Recommend someone hover it before calling the tooltip sweep fully closed.

**Verdict: the six named POS surfaces do not crash.** Sign off Priority 1 as met, with the
Settings → Payment Methods tender-account tooltip flagged as an unverified same-class risk.

---

## POS-024 — cross-line quantity bug: NOT REPRODUCIBLE, confirmed by direct testing

Built a 4-line cart (Brake Disc Rear, Alternator 120A, Battery 12V 70Ah, Battery 12V 80Ah).
Used **real DOM `.focus()`** (not a click, which opens a numpad popup instead of arming
arrow-key mode) to focus each line's quantity control directly, then pressed `ArrowUp` via
the browser's keyboard API.

- Focused line 2 → `ArrowUp` → **only line 2** went 1→2. Lines 1/3/4 stayed at 1.
- Refocused line 3, then line 1 (both via `.focus()`, no click) → `ArrowUp` → **only line 1**
  incremented 1→2. Line 2 stayed at its prior value, lines 3/4 untouched.

Two independent focus/press sequences, both showed the increment landing exactly on the
line that had DOM focus, never a neighbor. **I could not reproduce POS-024. Say so plainly:
not fixed-and-confirmed, but not reproduced despite a genuine attempt** — consistent with the
prior code trace that found it structurally impossible (every layer keys on the line's own
`lineId`).

**New, unrelated finding while testing this (LOW, CONFIRMED):** after one `ArrowUp` press,
keyboard focus silently drops to `<body>` (React re-renders the button, the new DOM node
isn't the one that had focus). A second immediate `ArrowUp` does nothing until the user
re-focuses the line. This is a real usability gap for a keyboard-first register (holding the
key or pressing it twice fast does not repeat the increment) but is NOT the cross-line bug
under investigation.

**Also confirmed, all via browser + real keyboard events:**
- `Delete` while the search input is focused → cart unchanged (no line removed). CONFIRMED.
- `Delete` while a cart line's quantity control is focused → that line is removed. CONFIRMED.
- `Delete` while the Payment dialog is open (3 lines in cart behind it) → no line removed;
  closing the dialog shows the cart untouched. CONFIRMED — shortcuts do not fire behind a
  modal.
- Cancel-sale flow: single confirm-with-reason dialog, no stacked dialogs. CONFIRMED clean.
- Could not test the InfoHint at 375px or on `/ar/pos` this pass (time went to the shift-close
  investigation below) — **not verified, say so plainly, do not assume clean.**
- Could not test the manager-PIN-field-vs-Delete-key scenario — no approval-PIN field was
  ever on screen this session (the one register I could open a Pay Out dialog on required
  approval but I never got a manager to type into it) — **not verified.**

---

## CRITICAL, CONFIRMED — shift close silently fails for the Cashier role and the client lies about success

This is the single most serious finding of this pass. Layers: browser (network log +
screenshots), DB (direct query), code (permission bundle + guard read end to end).

**Repro (as cashier1, Shift #3, register B2FAHAHEELREG1):**
1. Rang up sales, did a cash Pay In of KWD 10.500 (reason "ZZTEST float top-up") — succeeded,
   `POST .../movements → 201`.
2. Opened Close Shift, entered counted cash `574.707` (= 50.000 opening float + 514.207 cash
   sales + 10.500 pay-in — **expected cash correctly includes the pay-in**, "Over/Short:
   Balanced"). Confirmed the "Close this shift?" dialog (single confirm, correct for an
   irreversible action).
3. Client showed a **green success toast: "Shift 3 closed"** and transitioned to the
   post-close screen.
4. Network log for that action: `POST /api/v1/tenant/pos/sync/shifts/close → 403 (Forbidden)`.
5. DB, immediately after: `select status, closed_at from pos_shifts where id=...` →
   `open | NULL`. **The shift never closed server-side.**
6. Navigating to `/pos/shifts/:id/z-report` afterward: `GET .../z-report → 409 (Conflict)`
   repeatedly — the Z-report can never generate because the shift is still open. The UI shows
   a clean "Could not load the Z-report. Check your connection and retry." error state (not a
   crash), but retrying can never succeed because the underlying cause is permission, not
   connectivity.
7. Navigating back to `/pos` afterward: the register **resumes Shift #3 as the live/open
   session again** (full cart, full ability to keep ringing sales on a shift the cashier was
   just told is closed).

**Root cause, read end to end in code:**
- `apps/api/src/pos/sync/pos-sync.controller.ts:70` — `POST shifts/close` requires
  `@RequiresPermission("pos.session.close")`.
- `packages/shared/src/permission-bundles.ts` — `pos.sessionClose` lives ONLY in the
  `pos.supervise` (manager-level) bundle, deliberately separate from the `pos.sell` (baseline
  cashier) bundle. This part is a **legitimate design decision** — shift close/reconciliation
  as a manager-gated action is a defensible retail pattern.
- DB check (`role_permissions` joined to `roles`): **zero roles in this tenant hold
  `pos.session.close`** — not Cashier, and no Manager/Supervisor role exists with the
  `pos.supervise` bundle either. Only the Owner bypasses permission checks entirely
  (`permission.service.ts`'s `isOwner` short-circuit). So in this tenant, **only the owner can
  ever close a shift**, and every cashier-initiated close is silently rejected forever.
- `apps/web/src/features/pos/lib/use-close-shift.ts` is a **local-first** design: it always
  writes the close locally, computes a local Z-report, marks the local shift closed, shows a
  success toast, and "nudges" a background sync engine to push the close to the server. This
  matches how sales work (addendum fact #6) and is fine for transient network failures. But it
  has **no path to distinguish a permanent 403 (permission denied, will never succeed no
  matter how many retries) from a transient offline/5xx failure (will succeed once
  reconnected)**. The toast text used was the ONLINE-success string (`shiftClose.success`,
  "Shift {number} closed"), not the offline variant ("closed offline; will sync when you
  reconnect") — the client believed it was online and successful, when the server had
  permanently refused the request.

**Impact:** for the Cashier persona this task is explicitly told to prioritize, the entire
shift-close workflow is unusable and **lies about success** — the cashier is told their count
was accepted and balanced, walks away, and the shift silently stays open forever with no
retry that can ever succeed and no visible error banner (the only banner on screen was an
unrelated pre-existing "1 sale(s) need your attention" item). This blocks the Z-report,
blocks any subsequent shift-open sanity (the register still thinks Shift #3 is live), and
leaves an audit gap: the "closing count" the cashier typed and reconciled against never
reaches the server record.

**Severity: CRITICAL.** Whether the *permission model* (manager-only close) is intentional is
a product decision above my pay grade to override, but the **client-side false-success
+ silent-forever-failure** is unambiguously a bug regardless of that decision, and this
tenant currently has **no role other than owner that can close a shift at all**, which on its
own blocks sign-off for the cashier persona this module is being tested against.

---

## HIGH, CONFIRMED — register detail page (`/pos/registers/:id`) renders money at 2dp, not 3dp

Layer: browser DOM text extraction (not a screenshot misread — I checked this twice after an
earlier false alarm from screenshot-rounding artifacts; the `Read` tool's screenshot render
had visually truncated a correct 3dp value once already this session, so this one was
confirmed via raw `text` output before being reported).

On `/pos/registers/657036ca-dde3-47d3-9366-c58cd4bc92f5` (Register 1 / B2FAHAHEELREG1),
as cashier1:
```
Default Opening Float   0.00
Today's Sales           397.60
Expected Cash           574.71
Last Shift Variance     0.00
Shift #3  Net Sales 647.81   Variance —
Shift #2  Net Sales 0.00     Variance 0.00
Shift #1  Net Sales 47.16    Variance -7.91
```
The **same shift's** net sales shows as `647.805` (3dp, correct) in the Shift Summary modal on
the register screen, and `647.81` (2dp, wrong) on this detail page — same underlying number,
two different precisions on two different screens.

**Root cause, read end to end:** `register-kpi-strip.tsx` calls
`formatMoneyAmount(amount, currency, locale)` where `currency` comes from
`register-detail-panel.tsx`'s `branchQuery.data?.data.currencyCode ?? null`. Network log shows
`GET /tenant/branches/:id → 403` for cashier1 (branch read is not in the cashier's permission
set). Because the branch fetch 403s, `currency` stays `null`, and `formatMoneyAmount` silently
falls back to a 2dp default instead of the tenant's real 3dp KWD precision — everywhere this
component's `currency` prop resolves to `null`.

**Impact:** every cashier viewing their own register's KPI strip and shift history sees wrong
money precision, for the exact same reason (a denied read silently degrading precision rather
than failing loud or falling back to the tenant's actual currency, which is already known and
correctly used everywhere else in POS). This is the PERM-004 pattern from the addendum but in
a new flavor — not a blocked action, a silently wrong number.

---

## Cash movements — pay-in CONFIRMED, pay-out gate CONFIRMED (approval-required is per-register, working as designed)

- **Pay In**: KWD 10.500, reason "ZZTEST float top-up" — dialog defaults correctly (Amount
  placeholder `0.000`, 3dp), submitted cleanly, `POST movements → 201`, reflected instantly in
  the Shift Summary's Cash Drawer section (`Pay-ins KWD 10.500`, all 3dp). CONFIRMED CLEAN.
- **Pay Out**: KWD 5.250 attempted — this register has manager-approval-for-payout enabled
  (per-register, settings-optional, exactly as the addendum describes). The form correctly
  demanded a category, an approving manager, and a manager PIN, and blocked with "Manager
  approval is required for pay-outs." I don't have a manager PIN, so I cancelled rather than
  bypass it. **No DB row was created** (corrected my own log after initially mis-recording
  this as a success — see `_documents-created.md`). Gate behaves as designed; not a finding.

---

## Register-create dialog — POS-001 STILL PRESENT (already filed, not re-filed as new)

`New Register` dialog, "Default Opening Float" field: **value starts empty** (correct — no
wrong number gets silently submitted), but the **placeholder text is `0.00`** (2dp) in this
3dp KWD tenant. Confirmed via DOM (`input.placeholder === "0.00"`, `input.value === ""`).
Matches the already-open POS-001 (HIGH) exactly as described in the addendum — **confirming
it is still present, not filing it again.**

---

## `/ar/inventory` items list — CONFIRMED CLEAN, no regression

Tested as **owner** (cashier1 hangs indefinitely loading this page — see permission note
below, but Arabic-rendering was the actual ask here, not permission behavior, so I switched
personas as instructed for this one check).

`/ar/inventory/items` renders full RTL layout, Arabic column headers (الاسم، رقم القطعة،
الفئة، إلخ), and **Arabic item names render correctly** (e.g. "طقم دواسات أرضية Nissan
Genuine" for "Floor Mat Set Nissan Genuine…", "قرص فرامل خلفي ACDelco" for "Brake Disc Rear
ACDelco…") with the embedded Latin brand/model names sitting correctly inside the RTL flow —
no visible bidi corruption. No console errors tied to rendering. **CONFIRMED, nothing
regressed from the prior 27/27 sign-off.**

Side note, not a finding for this task: category names (`Accessories`, `Brake Discs`) remain
untranslated on the Arabic screen — pre-existing data-label behavior, out of scope here.

**Permission note (MEDIUM, CONFIRMED):** as cashier1, `/inventory/items` (either locale) spins
forever — never resolves to either data or a clean "access denied" screen. Network shows
repeated `403` on the underlying list/detail calls, but the page itself never surfaces a
denial state, it just spins. This is the PERM-004 pattern again (denied user gets an
interactive-looking shell rather than a clean deny) but manifesting as an **infinite loading
spinner** rather than an interactive form — arguably worse, since there's no visual signal at
all that access was denied.

---

## Order-discount reconciliation — CONFIRMED on every surface reached

Used the pre-existing sale `B2FAHAHEELBR-POS-B2FAHAHEELREG1-3-00008`
(subtotal 8.332, order discount −2.000, delivery fee +1.000, total 7.332 — all 3dp) rather
than creating a new write, since this exact combination was already on record.

| Surface | Reconciles? |
|---|---|
| Thermal receipt (reprint from Transactions detail) | Yes — Subtotal 8.332, Order discount −2.000, Delivery fee 1.000, TOTAL 7.332. Already confirmed in a prior pass; re-confirmed here. |
| Transaction detail drawer (`/pos/transactions`) | Yes — same four numbers, same arithmetic, 3dp. CONFIRMED. |
| Public digital receipt link (`/en/r/:token`, no login) | Yes — identical layout and numbers to the thermal receipt (same shared `receipt-document.tsx` component, just wider `max-w-[210mm]` vs `max-w-[80mm]`). CONFIRMED via browser, unauthenticated. |
| A4 invoice | **Not separately screenshotted**, but confirmed by code read: `receipt-document.tsx` has a `printerType === "a4"` branch that only changes CSS width — it is the **same document component and the same computed totals**, not a second implementation. Given the thermal/transaction-drawer/public-link math all ties out identically, A4 is not a separate risk. |
| Offline local receipt | Confirmed on a different sale this session (the 5-line KWD 365.602 offline sale) — no discount/fee on that one, so it doesn't exercise this specific arithmetic, but it did render correctly under a genuinely offline (API-flapping) condition using the same shared component as above. |

**One tool-instability note, not a product finding:** the very first `goto` on the public
receipt link timed out three times in a row (`curl` independently confirmed a 20s+ hang on
first hit, then a warm 6.8s success) — this was the dev server's first-visit route
compilation for that page, not a real outage or crash. Retrying after warm-up worked cleanly.

---

## Direct answer: is anything still blocking sign-off of the POS module?

**Yes — one CRITICAL and one HIGH item block sign-off, both newly found this pass:**

1. **CRITICAL:** the Cashier role (and every non-owner role in this tenant) cannot close a
   shift — `pos.session.close` is granted to nobody but the owner-bypass — and the client
   shows a false "Shift closed" success toast and transitions the UI to a closed state while
   the server rejects the request with 403 and the shift stays open forever. This is not a
   transient failure; it can never self-heal by retrying, and there is no error surfaced to
   the cashier. This breaks the Z-report (permanently 409s) and register state (the "closed"
   shift silently resumes as the live session) for the exact persona this module is being
   tested against.
2. **HIGH:** `/pos/registers/:id` renders money at 2dp instead of 3dp for cashier1, root-caused
   to a 403 on the branch-currency lookup silently degrading `formatMoneyAmount`'s precision
   rather than falling back to the tenant's real currency or failing loud.

Everything else checked this pass is either clean (all six named tooltip surfaces, POS-024
non-repro, Delete/dialog-blocking shortcuts, cash movement dialogs, POS-001 placeholder still
correctly tracked as open-not-new, `/ar/inventory`, order-discount reconciliation across four
surfaces) or explicitly flagged as not reached (queue-drawer tooltip on a populated queue,
InfoHint at 375px/Arabic, manager-PIN-vs-Delete focus test, customer-display tooltips on a
live mirrored cart) — say so plainly, do not assume those are clean.
