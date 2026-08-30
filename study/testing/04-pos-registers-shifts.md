# POS: Registers, Register Detail, Z-Report, and the Cash/Shift Lifecycle

Tenant: Gulf Auto Parts (KWD, 3dp), Kuwait (no VAT). Primary persona tested as **cashier1**
(`Zerupt.Test@2026`), per module addendum. Switched to owner `anonymator8@gmail.com` only where
noted — and every switch is called out below, because the switch itself was forced by a bug,
not a planned "manager-only" check.

Ledger balance check before first write: `0.000000`. Ledger balance check after last write:
`0.000000`. No money leaked out of the double-entry system despite several crashes below.

**Method note on environment noise**: `gstack browse` restarted/lost session several times
mid-session (unrelated to the app — confirmed via `curl` that the Next/API servers stayed up
throughout). Every finding below was re-confirmed after re-authenticating, backed by a DB query,
a screenshot, or a full code read end to end (rule 1), and login identity was checked before each
conclusion (rule 2).

---

## Scope covered
- A. `/pos/registers` (list) — tested as cashier1, then as owner
- B. `/pos/registers/:id` (detail) — tested as cashier1
- C. `/pos/shifts/:id/z-report` — tested as owner (cashier1 never reached this screen this
  session, see CRIT-POS-01)
- D. Full cash lifecycle from `/pos`: open shift, one trivial cash sale, pay-in, pay-out, X-report
  (Shift summary), denomination blind close, Z-report data. Tested first as cashier1 (blocked),
  then as owner (completed).

---

## CRITICAL findings

### CRIT-POS-01 — `/pos` crashes for the Cashier role's own default permission set, permanently, on first shift open (CONFIRMED)
**Repro:**
1. Log in as `cashier1` (role: Cashier, the tenant's least-privileged, primary POS persona).
2. Go to `/pos`, select Register 1 (B2FAHAHEELREG1), enter opening float `25.500`, click "Open
   Shift".
3. Toast shows "Shift 1 opened" — the shift **is** created server-side (verified:
   `pos_shifts` row `604d707b-...`, `opening_float=25.500000`, `status=open`) — but the screen
   immediately renders "Something went wrong / An unexpected error occurred."
4. Reload: crashes again, every time, indefinitely.

**Root cause (read end to end):**
`apps/web/src/features/pos/lib/use-register-currency.ts` (`useRegisterCurrency_`) resolves the
register's transacting currency by calling `fetchRegister(registerId)` then
`fetchBranch(register.branchId)`. The Cashier role template has **no** `branches.*` permission
(confirmed: `SELECT permission_key FROM role_permissions WHERE role_id = (Cashier)` returns no
`branch` key at all), so `GET /tenant/branches/:id` returns `403` for every cashier, every time.
The hook's catch block deliberately swallows the error ("never block the register") and
`currency` stays `""` forever — it can never resolve for this role, and the empty string also
gets persisted to `localStorage` (`zerupt:pos-register` → `"currency":""`), so it does not
self-heal on reload either.

Meanwhile `register-shell.tsx:781` calls
`formatCurrency(parseFloat(grandTotal), locale, currency)` **unguarded** (unlike the other ~10
call sites of `currency` in the same file, which all do `{...(currency ? { currency } : {})}` or
similar). `formatCurrency("")` throws `Error: invalid ISO 4217 currency code ""`, which is not
caught anywhere below the page's error boundary, so the entire register screen goes down.

**Impact:** the Cashier role — the persona this whole module is built for — cannot use the
primary selling screen at all, on any register, with a completely stock permission set. This is
not an edge case or a misconfiguration; it is the tenant's default onboarding state (per the
hardening log, only Owner + the seeded Cashier/Manager templates exist on a fresh tenant). A shop
that goes live today with `cashier1`-equivalent accounts gets a broken till on the very first
shift open.

**Fix shape (for whoever picks this up, not applied by me per scope):** (a) branch currency code
is not sensitive — it should be readable via a lightweight endpoint that doesn't require full
`branches.read` (echoes the "names-only directory" pattern used elsewhere in this codebase), and/or
(b) guard the line-781 `formatCurrency` call exactly like its siblings so an unresolved currency
degrades to a loading/placeholder state instead of throwing.

**Severity:** CRITICAL. Blocks the core task for the intended default persona, on every register,
with no workaround short of code/permission changes.

---

### CRIT-POS-02 — `/pos/shifts/:id/z-report` crashes for EVERY user, not permission-specific (CONFIRMED)
**Repro:** as owner (full permissions), navigate to `/pos/shifts/604d707b-.../z-report` (a real,
closed shift). Page renders "Something went wrong." Reload: crashes again.

**Root cause:** console shows
`[ErrorBoundary] Error: 'Tooltip' must be used within 'TooltipProvider'`, thrown from
`ShiftManagementPanel` (which the z-report page renders alongside `ZReportPrintView`, per
`app/[locale]/(pos)/pos/shifts/[id]/z-report/page.tsx`). The `(pos)` route-group layout
(`app/[locale]/(pos)/layout.tsx`) wraps children only in `RequirePermission` — it never wraps a
`TooltipProvider`, unlike the `(app)` shell which supplies one via its own chrome
(`main-nav.tsx`/`top-bar.tsx`). Since `(pos)` is a standalone fullscreen shell with none of that
chrome, any Tooltip usage inside it (here, in `ShiftManagementPanel`) has no provider and throws
on mount.

**Impact:** this is one of the three routes explicitly in scope for this phase, and it is
completely inaccessible — not a permission gap, a build-time-detectable wiring gap that reaches
every viewer regardless of role. Nobody can view a Z-report today.

**Severity:** CRITICAL. In-scope screen is 100% down for all users.

---

## HIGH findings

### HIGH-POS-01 — Quick-cash "tender exact amount" truncates to 2dp in a 3dp currency, leaving a real shortfall (CONFIRMED)
**Repro:** ring a KWD 47.161 sale, open Payment, click the "Cash" tender tile (which auto-fills
the full remaining balance). The field fills `KWD 47.160`, and "Remaining: KWD 0.001" is shown —
Complete Sale stays disabled until the cashier notices and manually corrects the last digit.
Screenshot evidence captured; DOM `value` confirmed `47.160` against an amount due of `47.161`.

This is a rounding bug in the "fill remaining" quick action itself (not a display-only issue —
the actual input value is short by 1 fils), on the single highest-frequency action of the highest-
frequency screen in the product, in a 3-decimal-place currency. A cashier who doesn't notice the
"Remaining" line will either get stuck unable to complete the sale, or will be one fils short if
some code path lets it through.

**Severity:** HIGH. Money-precision bug on the core tender flow; the addendum specifically calls
out "cash rounding... must be 3dp-correct."

---

### HIGH-POS-02 — "Reveal expected cash" bypasses the blind close entirely, and the revealed figure is wrong (CONFIRMED)
Two stacked problems in the same control, both on `Close Shift`:

1. **The blind close is not actually blind.** The "Reveal expected cash and difference" toggle
   works with the "Counted cash" field still completely empty — nothing gates it on having
   entered a count first. A cashier (or anyone) can open Close Shift, immediately click Reveal,
   read the exact expected cash, and then type that same number into Counted cash to manufacture
   a "perfect" close without ever counting the drawer. This defeats the entire purpose of a blind
   count (the addendum explicitly requires "the expected amount is not shown to the cashier before
   they count").
2. **The revealed number is itself wrong** — it excludes cash drawer movements. Reproduced live:
   shift had opening float 25.500 + one cash sale 47.161 + a pay-in of 10.500 + a pay-out of
   5.250. Server-computed (and correctly recorded) `expected_cash = 77.911`. The client's "Reveal"
   preview showed **72.661** = `25.500 + 47.161` only — it silently drops both cash movements
   (72.661 + 10.500 − 5.250 = 77.911 confirms the missing terms exactly). Anyone who trusted the
   preview to sanity-check their own count would misjudge a real shortage by exactly the net
   movement amount (5.25 KWD in this case) — the true variance recorded server-side was
   `-7.911` (short), not the `-2.661` a naive comparison against the shown "expected" would
   suggest.

The actual persisted `pos_shifts` row and JE **were correct** (`expected_cash=77.911`,
`actual_cash=70.000`, `cash_over_short=-7.911`, balanced JE with pay-in/pay-out/variance legs) —
this is a client-side display/gating bug only, not a ledger-integrity bug. But it directly
compromises the control the whole shift-close screen exists to enforce.

**Severity:** HIGH. Confirmed, reproducible, undermines the module's core cash-integrity feature
(the addendum lists "the close is genuinely blind" as a load-bearing invariant to verify).

---

### HIGH-POS-03 (SUSPECTED, environment-adjacent) — App reports "Offline" while `navigator.onLine` is `true`, queuing an online sale through the offline path
Throughout the session the header pill showed "Offline" and the sale completed with device
number `OFF-B2FAHAHEELREG1-1-1` (offline path), even though `navigator.onLine` evaluated to
`true` and the API was reachable and responding the whole time (confirmed via network log and
direct `curl`). The offline-first design means this degrades gracefully (the transaction
eventually synced once the sync queue was opened, and the JE/stock legs posted correctly) — but
if the app's own online/offline detector is wrong, every sale on a genuinely-online till is
needlessly routed through the offline queue, delaying GL/stock tie-out and defeating the "sync
never blocks a sale, but should not be triggered when unneeded" design intent.

Marked SUSPECTED rather than CONFIRMED because this could be an artifact of the headless browser
harness (no real network-change events fired, a background heartbeat ping blocked by the test
environment) rather than something a real cashier's browser would hit. Flagging for someone with
a normal browser to confirm.

**Severity:** HIGH if confirmed in a real browser (every sale silently degrades to slower,
harder-to-audit offline path); otherwise a test-harness artifact.

---

## MEDIUM findings

### MED-POS-01 — Action buttons the Cashier role cannot use are still fully rendered and clickable (PERM-004 pattern, CONFIRMED)
On `/pos/registers`, logged in as cashier1 (role permissions: `pos.register.list` +
`pos.register.read` only — no create/update/deactivate):
- **"New register"** button opens a fully interactive create dialog (name/code/float fields all
  editable). It only fails silently client-side because the Branch dropdown never resolves
  (`GET /tenant/branches?...` → 403 for cashier, so the combobox is permanently stuck on
  "Loading..." then empty) — the required-field validation is what actually blocks submission,
  not a permission check. No 403 ever reaches the server because nothing is ever submitted.
- **"Deactivate"** is rendered on every register row. Clicking it did not trigger a deactivate
  call in this session (the click landed on the row's navigation instead — see LOW-POS-01), so no
  403 was directly observed for this action, but the button is present with no client-side gate
  and no `pos.register.update`/similar permission on the Cashier role.

Backend enforcement is correct wherever actually exercised (branches/warehouses/settings all
403'd cleanly for cashier1). This is the exact "denied user still gets a fully interactive form"
pattern the addendum asked to check for POS specifically — confirmed present on the registers
list screen.

**Severity:** MEDIUM (UX/trust issue, not a security hole — server-side enforcement holds).

---

### MED-POS-02 — Shift header "Cashier:" label shows whoever is currently logged in, not the shift's actual cashier (CONFIRMED)
`register-shell.tsx:131` — `cashierLabel = resolveCashierName(user?.id, user?.email)` is derived
from `useAuth()` (the CURRENT session), not from `pos_shifts.cashier_id` (the shift's actual
owner). Reproduced: shift `604d707b` has `cashier_id` = cashier1's user id
(`48123301-29f2-46a2-a50c-479911c73142`, confirmed against the JWT payload), opened by cashier1.
After switching the browser session to the owner, the SAME shift's header, Shift-summary (X-report)
dialog, and Close Shift panel all display "Cashier: Hussain Bedawala" (the owner's name) — not
cashier1. The underlying DB record and every JE are correctly attributed to cashier1; only the
on-screen label is wrong.

In a real shop this misleads anyone who glances at the till (a manager stepping in, a second
cashier covering a break) into believing the wrong person is on duty — relevant precisely because
this screen exists for cash-integrity accountability.

**Severity:** MEDIUM. Display-only, but directly touches the module's audit-trust surface.

---

### MED-POS-03 — Branch name unresolvable for Cashier anywhere it's shown (register list + detail) (CONFIRMED, root-caused)
On both `/pos/registers` and `/pos/registers/:id`, the **Branch** and **Location** columns/fields
render as `—` for cashier1 (owner sees them correctly: "Fahaheel Branch" etc.). Root cause:
`GET /tenant/branches/:id` (and the list variant) return 403 for the Cashier role, and the
frontend has no lighter-weight, read-only branch-name lookup to fall back to. This is the same
underlying gap as CRIT-POS-01 (branch data gated behind a permission cashiers don't have) — filed
separately here because it degrades gracefully (dash, not a crash) but is still a real, confirmed
gap: a cashier can never see which branch/location their own register belongs to on either screen.

**Severity:** MEDIUM (degrades gracefully, unlike CRIT-POS-01, but is the same root defect).

---

## LOW / FRICTION findings

### LOW-POS-01 — "Deactivate" click on the registers list navigates to the register detail page instead of acting (SUSPECTED)
Clicking the row-level "Deactivate" button (as cashier1) navigated to `/pos/registers/:id`
instead of triggering a deactivate confirmation. Register status was confirmed unchanged in the
DB afterward (`active`), so nothing destructive happened — but the click target appears to be
absorbed by the row's own click-to-navigate handler rather than the button's own `onClick`
(event-propagation / z-index issue), which would affect anyone with the real permission to
deactivate, not just cashier1. Not independently re-tested with a permitted role due to time —
SUSPECTED, not CONFIRMED.

### FRICTION-POS-01 — `localStorage`/offline-cached `registerCode` can go empty and silently break "Complete Sale" with a cryptic error (SUSPECTED, self-inflicted trigger but real resilience gap)
While diagnosing CRIT-POS-01 I cleared `localStorage['zerupt:pos-register']` to work around the
crash. On the next load, `registerCode` in the persisted pos-store stayed `""` (currency
re-resolved fine, `registerCode` did not), and attempting to pay produced a hard failure:
`Invalid registerCode "": must be alphanumeric (no separators)` (from
`assertValidRegisterCode`), with the cart preserved and a generic "Payment failed" toast — no
indication to the user of what was actually wrong. `registerCode` is only ever set once (at
register selection); nothing re-derives it from the already-successful `GET /pos/registers/:id`
response on a fresh load. I fixed it manually via `localStorage` and completed the sale
afterward. Flagging because I triggered this via a manual `localStorage` clear (not an ordinary
click path), but the equivalent real-world trigger — a cleared site data, private window, or
storage-quota eviction while a shift is open — is entirely plausible for a shop device, and the
failure mode (generic "Payment failed. The cart is unchanged" with an internal validator message
only visible in devtools) is not something a cashier could self-diagnose or recover from without
help.

---

## POS-001 status (known open finding, not re-filed)
**Still present, CONFIRMED.** The "Opening float" field on the `/pos` Open Shift dialog has
`placeholder="0.00"` and `step="0.01"` (verified via `attrs`) — 2dp in a 3dp (KWD) tenant. Same
2dp pattern also independently present on the **register create dialog**'s "Default Opening
Float" field (`placeholder="0.00"`, `step="0.01"`, id `new-register-float`) and on the
**register detail** screen's rendered "Default Opening Float" / "Today's Sales" values (both
show `0.00` even though the underlying `pos_registers.default_cash_float` is `0.000000` — a
display truncation, not a storage issue). These read like the same underlying shared
component/formatter defaulting to 2dp; worth fixing once for all three surfaces rather than
patching each screen.

---

## Positives (confirmed)

- **Three-way tie-out held for every write this session.** The one real cash sale (KWD 47.161,
  `Brake Disc Rear ACDelco Hyundai Tucson`) produced two balanced JEs
  (`pos.transaction.completed`: DR Cash 47.161 / CR Sales 47.161; `inventory.sale`: DR COGS
  36.359 / CR Inventory 36.359). The shift-close JE correctly rolled up the pay-in (10.500),
  pay-out (5.250), and cash variance (-7.911) into one balanced entry. Tenant-wide ledger balance
  was `0.000000` before and after the entire session.
- **`pos_cash_movements.approved_by_id` is NOT NULL on both the pay-in and the pay-out** created
  this session, and the pay-out correctly required selecting a "What was this cash used for?"
  reason **category** (`supplier_payment`) before Confirm enabled — matches the L0 hardening
  (reason-code-required pay-outs).
- **Denomination-based blind close correctly records a real variance**: counting a different
  amount than the (correctly server-computed) expected cash produced `cash_over_short = -2.661`
  → later `-7.911` once movements were included, both computed and persisted at full 3dp
  precision, matching the manual count exactly.
- **Money precision is correct almost everywhere it matters**: the catalog (30+ SKUs sampled,
  e.g. `KWD 149.304`, `KWD 6.313`), the cart/pay surface (`KWD 47.161`), the cash-movement
  amount fields (placeholder `0.000`, `step="0.001"`), and the DOM-verified Close-Shift summary
  (`Net sales 47.161`, `Cash sales 47.161`, `Tax collected 0.000`) all render full 3dp. (I
  initially misread a low-resolution screenshot of this last panel as 2dp truncated — re-checked
  against the live DOM per method rule 1 and it is correct; noting this explicitly so it is not
  mistaken for a finding.)
- **No VAT/tax UI anywhere** in the registers, shift, or payment screens — correct for Kuwait.
- **"Cancel sale" (formerly Void) requires no reason and clears the cart with one confirm
  dialog**, matching the locked L0/hardening decision (reason optional pre-completion, one
  confirm, no stacked dialogs).
- **One-open-shift-per-register + double-submit protection both held.** A rapid double-click on
  "Open Shift" produced exactly one new shift row (`shift_number` incremented once, not twice) —
  no duplicate-open race observed. (I did not additionally verify the cross-session "second
  concurrently open shift on an already-open register" case with a second real login, given the
  time already spent working around CRIT-POS-01/02 and the browser-harness instability; this is a
  gap in my coverage, not a negative finding — the partial unique index this relies on was
  reportedly added in the L0 hardening pass per the study log.)
- **Owner sees all 8 registers with correct branch/location names across all 4 branches**
  (Al Rai Main Showroom ×3, Fahaheel ×2, Jahra ×2, Salmiya ×1) when viewing "All branches" —
  confirms MED-POS-03 is a Cashier-permission-specific gap, not a universal data bug.
- **Negative opening float is rejected client-side** ("Enter a valid non-negative amount"),
  before any request reaches the server.
- **Empty-count blind close is blocked** — "Close Shift" stays disabled until a Counted Cash
  value is entered; a cashier cannot close a shift without entering something.

---

## Documents created this session
Logged in `study/testing/_documents-created.md`: one pos_shifts row (opened by cashier1, closed
by owner due to CRIT-POS-01), one pos_transactions row (real catalog item, not ZZTEST-prefixed —
selling-flow items are pre-existing tenant data, not test-created data, so no ZZTEST prefix
applies), one pay-in and one pay-out cash movement, and a second short-lived shift
(`5b4549f8-...`, opened and cleanly closed with zero variance to leave the register in a tidy
state). No pre-existing document, opening-balance journal, or other agent's data was touched.
