# POS Display Mirror, ar/en Register Parity, Transactions Export

Tenant: Gulf Auto Parts (KWD, 3dp), Kuwait (no VAT). Tested as **owner** (`anonymator8@gmail.com`),
consistent with the confirmed cashier `/pos` blocker (CRIT-POS-01, not re-investigated). Register
used: `B1ALRAIMAIREG1` (Al Rai Main Showroom), Shift #1, already open from a prior session.

Ledger balance check before first write: `0.000000`. Ledger balance check after last write:
`0.000000` (re-checked live). No leakage across 2 new cash sales this session.

**Method note:** this report is a reconstruction after an API connection loss cut off the original
run at the exact moment of writing the report file — nothing had been written to disk. Nothing
below is invented to fill the gap; every finding was independently re-derived from the tool
transcript actually executed this session (browser output, network captures, source reads, DB
query). Where I did not get to something, it is stated plainly as NOT DONE rather than guessed.

---

## GAP 1 — Customer-facing display (`/:locale/pos/display`)

### Code read (end to end)
- Page: `apps/web/src/app/[locale]/(pos)/pos/display/page.tsx` — thin wrapper, renders
  `PosDisplayScreen`. Comment confirms design intent: "Uses BroadcastChannel (same-origin,
  same-device) — no server round-trip, no auth required. This page is read-only and never
  mutates any state."
- Screen: `apps/web/src/features/pos/components/pos-display-screen.tsx` — subscribes to
  `BroadcastChannel("pos-display")`, renders one of: waiting / break / change-due / empty-cart /
  cart states.
- Publisher: `apps/web/src/features/pos/lib/use-pos-broadcast.ts` (`usePosBroadcast`) — the
  register broadcasts a `PosDisplayMessage` on every render where cart/phase/changeDue/onBreak
  changes. Wired into `register-shell.tsx:280-285`:
  ```ts
  const lastSale = usePosStore((s) => s.lastSale);
  const changeDue = lastSale?.changeDue;
  usePosBroadcast(view, currency, phase, onBreak, changeDue);
  ```

### Gating (CONFIRMED via code read)
`apps/web/src/app/[locale]/(pos)/layout.tsx` wraps all `(pos)` children (including `/pos/display`)
in `<RequirePermission>`, which resolves via prefix match against the `/pos` nav rule
(`pos.session.read`). This is deliberate and documented in the layout's own file header: the
display mirror and Z-report are both "part of operating that same register session," not separate
capabilities. **Gate confirmed present** — not a re-litigation of CRIT-POS-01 (that blocker is about
a crash after the gate, not an absent gate).

### Idle/empty state (CONFIRMED, live)
Opened `/en/pos/display` in a second tab with no prior broadcast received: renders "Waiting for
register... / Open the register on this device to see the cart here." Screenshot:
`/tmp/display-waiting.png`.

Note: a **freshly opened** display tab gets nothing until the register's cart next changes — there
is no "send current state on mount" handshake. If a cashier opens the display tab mid-shift with an
already-built cart sitting untouched, the display stays on "Waiting..." until the cashier adds/
removes something. Not filed as a numbered finding on its own (low real-world impact — displays are
typically opened once, at shift start, before any sale), but noted as a real gap in the mirror's
"genuinely real-time" claim.

### Live cart mirroring (CONFIRMED)
With the register cart at 1x `ZZTEST-Batch Tracked Oil Filter`, then incrementing quantity to 2 via
the stepper, the display tab (already open) updated within about a second to:
`ZZTEST-Batch Tracked Oil Filter, qty 2, KWD 15.000`, matching the register's own cart total exactly
(3dp). Screenshot: `/tmp/display-cart.png`.

### Leakage check — network/message payload (CONFIRMED CLEAN)
This is **not a network request** — `usePosBroadcast` uses `BroadcastChannel`, a same-origin,
same-device, client-only IPC mechanism; nothing is sent to any server for this feature. Read the
full `PosDisplayMessage` shape end to end (`use-pos-broadcast.ts`) and captured live messages via an
injected `BroadcastChannel` listener in the display tab (see HIGH-DISPLAY-01 below for the exact
captured payloads). The message contains only:
```
id, description, quantity, unitPrice, lineTotal, discountAmount   (per line)
subtotal, discountTotal, taxTotal, grandTotal, currency, phase, onBreak, changeDue?
```
**No `costAtSale`, no supplier, no internal entity/branch/register/warehouse IDs, no other
cashier's or register's data.** This does NOT carry the already-filed `costAtSale`-in-transactions-
API leak (that is a separate REST endpoint, `GET /tenant/pos/transactions`, unrelated to this
BroadcastChannel path) — cross-referencing, not duplicating.

**Cross-register/cross-tab leak (MEDIUM, CONFIRMED by design, not independently reproduced with a
second real register this session):** `BroadcastChannel("pos-display")` is scoped to the browser
**origin**, not to a specific register or tab pair. If two registers are ever operated from two
tabs of the *same browser* on the same device (e.g. a single back-office PC used to demo/test two
registers, or a shop that runs multiple registers in tabs rather than separate physical terminals),
each register's cart would broadcast to *every* open display tab on that origin, and a display tab
would show whichever register broadcast most recently — not a designated one. The code comment
explicitly assumes "same-device" one-register-per-device, so this is a documented design constraint
rather than a hidden bug, but it is worth flagging explicitly as the leakage story's one real edge:
the mirror is not register-scoped, only device/browser-scoped. Not independently tested with two
concurrent register tabs this session (time-boxed) — flagging the mechanism, not filing a numbered
CONFIRMED cross-register leak.

### Tax UI (CONFIRMED — same root defect as H1 in the static audit, now shown to extend to the display)
The display's totals footer unconditionally renders a `Tax` row:
```tsx
<div className="flex justify-between text-base">
  <span className="text-muted-foreground">{t("totals.tax")}</span>
  <span>{formatAmount(msg.taxTotal, msg.currency)}</span>
</div>
```
(`pos-display-screen.tsx:151-154`) — no `taxSystem`/country/`documentShowsTax` gate, matching the
already-filed H1 (`cart-totals.tsx` on the register itself). **Not a new bug class** — it is a
**third** instance of the same pattern the prior static audit found on the register cart (the first
two instances were the register cart and, previously, nowhere else — this display screen is a
second surviving instance, meaning the fix needs to cover BOTH `cart-totals.tsx` and
`pos-display-screen.tsx`, not just the one file H1 named). Live confirmation: cart/display both
showed "Tax KWD 0.000" throughout this Kuwait (no-VAT) session.

### HIGH-DISPLAY-01 (CONFIRMED) — The change-due dwelling screen never renders in practice; the display goes straight to "Ready to serve you" (empty state) instead
This is the most consequential finding in this gap.

**Repro (done twice, independently, to satisfy the "repeat a control" rule):**
1. Register: build a cart (`ZZTEST-Batch Tracked Oil Filter`), Pay (F4), tender Cash for MORE than
   the total (e.g. total 15.000, cash 20.000 → change due 5.000; second run: total 7.500, cash
   10.000 → change due 2.500), Complete Sale.
2. Register's own receipt overlay correctly and persistently shows `Change due KWD 5.000` (and
   `KWD 2.500` on the second run) — confirmed via `text` dump of the register tab, both times.
3. Switch to the already-open display tab: shows **"Ready to serve you"** (the literal
   `display.emptyCart` string), not the change-due screen, both times.

**Root-cause evidence (not just a screen glance — captured the actual BroadcastChannel traffic):**
Injected a second listener into the display tab (`new BroadcastChannel('pos-display')` with
`onmessage` pushing to `window.__msgs`) before the second repro run, then read the array back after
completing the sale. **8 messages were captured for that one sale; not one of them carries a
`changeDue` key**, including the final message:
```json
{"type":"cart_update","lines":[],"subtotal":"0","discountTotal":"0","taxTotal":"0",
 "grandTotal":"0","currency":"KWD","phase":"settle","onBreak":false}
```
(`changeDue` key entirely absent — the message-builder in `use-pos-broadcast.ts` only spreads it in
when `changeDue !== undefined && changeDue !== "0"`, so its total absence means the hook's
`changeDue` argument — sourced from `lastSale?.changeDue` — was falsy/undefined at every one of the
8 broadcasts fired around this sale, even though the register's own receipt view (fed from the same
`lastSale` state) correctly shows the value.)

**A directly relevant code comment was found** at `apps/web/src/features/pos/components/
pay-surface.tsx:80-84`:
```
* Fired the moment a sale completes (payment accepted), before the change-due
* dwelling screen even renders. Lets a caller react reliably to "a sale just
* finished" ... without watching pos-store's `lastSale`, which this online
* settle flow never writes to.
```
This documents that the **online** settle path never writes `lastSale` at all (a separate,
worse case than my repro, which went through the **offline** path, whose `showLocalSale` action
does set `lastSale`). My repro's sales were offline (register showed "Offline" the whole
session — see the already-filed MED-SALE-01/HIGH-POS-03 offline-detector finding, reproduced again
here, not re-filed). Even on the path that IS supposed to populate `lastSale.changeDue`, the
broadcast never carried it in either of my two independent runs — so this is not merely the
documented "online path never writes lastSale" gap, but a **second, broader** timing/data gap that
also defeats the offline path's own change-due handoff to the display specifically (the register's
own receipt UI, which reads the same `lastSale` state directly via React, DOES get the value —
only the BroadcastChannel hand-off to the display fails to carry it).

**Impact:** the documented "change due dwelling screen after payment" (per the component's own file
header states machine) is, as far as this session's two independent reproductions go, **never
observed by a customer standing at the display**, on the one payment path actually exercisable in
this environment (offline). A customer paying cash and expecting their change amount confirmed on
the second screen sees the idle "Ready to serve you" message instead, every time.

**Severity: HIGH.** Confirmed CONFIRMED (not suspected) via two independent repros plus a captured
raw message log proving the data is absent from the wire, not just mis-rendered. Not filed as
CRITICAL because it degrades gracefully (no wrong/leaked data shown, no crash, no money impact) —
it is a silently-broken feature, not a corruption or leak.

**Fix shape for whoever picks this up:** the bug is upstream of the display component — the display
correctly implements a changeDue branch that would render if the key were present. Investigate why
`lastSale.changeDue` (or its timing relative to the cart-clear render that fires the broadcast) never
reaches `usePosBroadcast`'s `changeDue` argument for either the online path (already documented as
never writing `lastSale`) or the offline path (this session's finding — `showLocalSale` does set
`lastSale`, but the value still didn't reach the broadcast in 2/2 runs). One shared root cause is
likely (a render-order/effect-timing race between the cart-reset effect and the lastSale-set
effect), not two separate bugs — worth tracing with React DevTools Profiler or added console
instrumentation rather than guessing further from outside.

### MED-DISPLAY-01 (CONFIRMED) — Discount row on the display ignores a real zero and shows "-KWD 0.000" instead of hiding
`pos-display-screen.tsx:145`: `{msg.discountTotal !== "0" && (...)}`. This is a **strict string**
comparison against the literal `"0"`. The actual `discountTotal` value flowing through the cart view
is a zero-padded decimal string (`"0.000"`), which is never equal to `"0"` — so the condition is
**always true** in practice, and the discount row renders unconditionally, showing `-KWD 0.000`.
**Live evidence:** captured in the same message log as HIGH-DISPLAY-01: a normal, no-discount 2-line
sale produced `"discountTotal":"0.000000"`, and the on-screen display genuinely rendered
`Discount -KWD 0.000` beneath the total (confirmed via `text` dump of tab 2 at that moment, not just
inferred from the JSON).

Contrast with the register's own cart, which gates the equivalent row correctly with a numeric
comparison: `cart-totals.tsx:104`: `const hasLineDiscount = Number(discountTotal) > 0;`. The display
screen is the ONE place in POS that uses the fragile string-equality form instead of the
`Number(x) > 0` pattern already proven correct elsewhere in this same module.

**Severity: MEDIUM.** Cosmetic/copy-adjacent (no wrong money, just an always-visible zero row a
customer never asked to see), but a genuine, easily-reproduced defect distinct from the tax-row bug
above (different helper, different root cause — string equality vs. missing gate entirely).
**Fix shape:** change `msg.discountTotal !== "0"` to `Number(msg.discountTotal) > 0`, matching
`cart-totals.tsx`'s existing pattern — one-line fix, no new helper needed.

### Positives (confirmed)
- **Read-only, no server round-trip** — confirmed via network log: zero requests originate from the
  `/pos/display` tab itself; all data arrives via `BroadcastChannel` only.
- **No cost/margin/supplier/internal-ID leakage** in the message contract — verified by reading the
  full `PosDisplayMessage` type and the live captured payloads (see above).
- **Real-time mirroring works** for line add/remove/quantity changes and totals, with a sub-second
  perceived latency (same-device IPC, not network-bound — no performance claim beyond "no
  observable API-layer delay," per the method rule on stating the layer).
- **Route permission gate is genuinely present** (`RequirePermission` wraps the whole `(pos)` group,
  confirmed by direct code read, not just absence-of-error).
- **3dp KWD money rendering held everywhere on the display** (line totals, subtotal, grand total) —
  no 2dp truncation observed in the cart-mirror state.
- **No VAT/tax UI is functionally correct in spirit** (Kuwait total is genuinely 0.000, so the
  always-present tax row never shows a wrong number) — the finding is that the row exists at all,
  not that it shows a wrong figure.

### NOT verified in this gap (say so plainly, not guessed)
- **Reload/reconnect recovery** was not tested — I did not reload the display tab mid-cart and
  confirm it re-syncs (it structurally cannot without the register re-broadcasting, per the "no
  handshake on mount" behavior noted above, but I did not run an explicit reload-and-observe repro
  before the connection loss).
- **The "break" state** (`onBreak: true`) was not exercised or screenshotted this session.
- **A genuine cross-register/cross-tab leak** (two live register tabs, one display) was reasoned
  about from the BroadcastChannel API's origin-scoping but **not independently reproduced** with a
  second concurrent register session.

---

## GAP 2 — Register-screen ar/en parity and RTL (BUILD + SETTLE), screenshot-level

### Method
Populated a live cart (`ZZTEST-Batch Tracked Oil Filter`, qty 1, KWD 7.500) on `/en/pos`, screenshot
at BUILD (`/tmp/en-build.png`) and SETTLE/Pay (`/tmp/en-settle.png`). Navigated to `/ar/pos` with the
**same cart still active** (cart state is per-register, not per-locale — confirmed the item and
total carried over exactly), screenshot at BUILD (`/tmp/ar-build.png`) and SETTLE (`/tmp/ar-settle.png`).
All four images were read and visually compared side by side.

### HIGH-RTL-01 (CONFIRMED) — Category filter chips on the Arabic register screen render in English, even though the underlying data has Arabic names
On `/ar/pos` BUILD, the "All" pill correctly reads "الكل", but every category chip next to it — 
Tyres, Suspension, Lubricants, Filters, Engine Parts, Electrical, Brakes, Accessories — renders in
**English**, unchanged from the `/en/pos` screenshot. Screenshot evidence: `/tmp/ar-build.png` vs
`/tmp/en-build.png`.

**This is not a missing-translation-data problem** — verified directly against the DB:
```
select name, name_alt from item_categories limit 5;
Brakes|الفرامل
Filters|الفلاتر
Electrical|الكهرباء
Suspension|التعليق
Engine Parts|قطع المحرك
...
```
Every category has a populated Arabic `name_alt`. The bug is in the frontend component,
`apps/web/src/features/pos/components/category-filter-bar.tsx:69`:
```tsx
const label = primaryText(node);
```
`primaryText` is imported from `apps/web/src/lib/bilingual-name.ts`, whose own file header is
explicit about what it is for:
> Primary is ALWAYS `name`, secondary ALWAYS `nameAlt`, **regardless of UI locale**. These helpers
> are for accounting/audit-grade "show both" surfaces... For OPERATIONAL single-line display
> (pickers, combobox options, tables, **POS search**) where showing one name at a time is the right
> call, use `localized-name.ts` instead — it deliberately branches on the UI locale.

The category filter bar is exactly an "operational single-line display" (a POS filter chip), but
uses the audit-grade "always English `name`" helper instead of the locale-aware one the same file's
own documentation names as the correct choice for this exact use case. Grepped the rest of
`features/pos/**` for `primaryText` — **this component is the only call site**, so this is an
isolated, one-line-fix bug, not a spreading pattern.

**This is precisely the "uncovered seam" the task asked to name:** the prior static audit's `pos.json`
en/ar key-parity check (0 keys missing either direction) is a translation-**message-file** diff — it
has no visibility into category **data** rendering at all, because category names are not UI-string
translation keys, they are bilingual DB columns rendered through a helper function. A parity script
diffing `en/pos.json` against `ar/pos.json` structurally cannot catch a wrong-helper bug like this
one; the only way to catch it is exactly what this session did — a live screenshot comparison with
real data loaded. **Recommendation for whoever owns this next:** extend static coverage with a
lightweight grep-based lint (or a runtime assertion) that flags any POS/inventory-adjacent
component importing `primaryText`/`secondaryText` outside the accounting/audit surfaces the helper's
own doc names as its intended callers.

**Severity: HIGH.** A cashier working in Arabic (the tenant's stated bilingual majority-persona
scenario) sees the entire category navigation bar in English on the highest-frequency screen in the
product — a real, visible, everyday defect, not a corner case. One-line fix
(`primaryText(node)` → the `localized-name.ts` locale-aware equivalent).

### Everything else checked (CONFIRMED CLEAN / correctly mirrored)
Comparing all four screenshots side by side:
- **Item names**: correctly rendered in Arabic in the catalog grid and cart line (e.g.
  "ZZTEST-Batch Tracked Oil Filter" — this specific test item has no Arabic name configured, so it
  legitimately falls back to English; other items sampled in the earlier sale-flow session showed
  correct bilingual names, e.g. "قرص فرامل خلفي ACDelco" — not re-tested here, cross-referencing the
  prior session's positive).
- **Layout mirroring**: cart panel correctly swaps from right (en) to left (ar); catalog grid swaps
  from left (en) to right (ar); header controls (Customer/Salesperson/sync/locale toggle/Shift) are
  fully mirrored left-to-right — genuine CSS logical-property RTL, not a half-flipped layout.
- **Payment surface (SETTLE)**: tender-tile order correctly mirrors (Credit Card, KNET, Cash, On
  Account left-to-right in ar vs. On Account, Cash, KNET, Credit Card left-to-right in en — a true
  mirror, not a re-sort); numpad digit layout mirrors as a standard RTL calculator flip (not a bug —
  this is the expected convention); "Back to cart" affordance and its arrow correctly flip sides and
  point the RTL-correct direction (arrow points right in ar, matching "back" in a right-to-left
  reading flow); the close (X) button correctly moves from top-right (en) to top-left (ar).
- **Money formatting**: `KWD 7.500` (prefix) in en vs. `7.500 د.ك.` (suffix) in ar — correct
  locale-appropriate currency positioning via the shared `Intl`-based formatter, not a bug; digits
  stay Western/LTR inside the RTL context in both locales (no Arabic-Indic digit substitution
  observed, which would itself be wrong for this tenant).
- **Tender auth-code labels** ("Auth code / reference" under KNET/Credit Card) ARE correctly
  translated in Arabic (رمز التفويض / المرجع) — initially worth double-checking given the category
  chip bug above, but this one is clean.
- **No tax UI difference between locales** — the always-present zero tax row (H1, already filed)
  appears identically in both locales, consistent with it being a gating bug, not an i18n bug.

### NOT verified in this gap
- Text overflow/truncation under long Arabic strings was not specifically stress-tested (no
  long-name item was added to the cart to check for wrapping/clipping).
- Mobile/tablet breakpoints (375/768) were not screenshotted in Arabic — only the 1440px desktop
  viewport was compared.
- The Hold/Recall drawers, Return drawer, and other overlay surfaces were not screenshotted in
  Arabic this session (only the BUILD catalog/cart view and the SETTLE/Pay surface, per the task's
  explicit two named phases).

---

## GAP 3 — Transactions list export (`/:locale/pos/transactions`)

### Filters + list states (CONFIRMED)
- Applied the **Type** filter (All types → Return): list correctly narrowed from 7 transactions to
  1 (`B1ALRAIMAINS-POS-B1ALRAIMAIREG1-1-00003`, the return linked back to `-00001`) — confirmed via
  the on-screen count and row content, not just the filter control's own state.
- **Empty state (CONFIRMED, screenshot evidence):** typed a nonsense search query
  (`nonexistentquery12345`) into "Search by transaction number, customer name, or phone…" — list
  correctly rendered a clean, human-readable empty state: **"No transactions match your filters."**
  in a bordered placeholder panel, not a blank table or a spinner stuck forever. Screenshot:
  `/tmp/export-empty.png`. (Note: the CLI `text` dump command did not surface this message in its
  plain-text output at all — an artifact of that specific inspection command, not of the app; the
  screenshot proves the correct behavior conclusively.)
- **Export button correctly disables at zero results** — confirmed via source read,
  `disabled={isExporting || total === 0}` in `pos-transactions-list-panel.tsx`; consistent with the
  empty-state screenshot showing the Export control present but the underlying `total` at 0.

### Export request respects the applied filter (CONFIRMED)
With the Type filter set to "Return" (1 matching row), clicking Export fired:
```
GET http://localhost:3001/api/v1/tenant/pos/transactions/export?type=return → 200 (600B)
```
— the `type=return` query param is present on the actual network request, not just reflected in
the UI control's local state. Re-ran this exact check twice (rule: a control that passes once isn't
a control) — both times the request carried the filter and returned 200.

### File contents — PARTIALLY verified; full end-to-end file-open NOT achieved this session
I attempted to capture the actual downloaded CSV bytes by monkey-patching `URL.createObjectURL` and
`HTMLAnchorElement.prototype.click` inside the page (to intercept the blob before/as the browser-
native download fires, since gstack's headless mode has no configured download directory and the
prior session's direct-URL approach 401'd on the bearer-token boundary). **Both interception
attempts returned no captured content** — the headless environment does not appear to expose the
in-page blob URL to a subsequent `fetch()` call the way it would in a normal browser, and I did not
find a third approach before time ran out on this sub-task. **I did not open an actual downloaded
file this session either — this specific instruction ("apply filters, then export, then ACTUALLY
OPEN the downloaded file") is NOT fully satisfied, and I am saying so plainly rather than
reconstructing a guessed file listing.**

What I DID verify, as a partial substitute, by reading the full client-side CSV-building code path
end to end (not a substitute for opening the real file, but real evidence about its correctness):
- **Headers are plain, translated, human-readable labels** — `pos-transactions-list-panel.tsx:376-390`
  builds the header row from `t("transactions.list.columns.*")` / `t("transactions.list.exportColumns.*")`
  keys: Transaction #, Date, Type, Status, Branch, Register, Cashier, Customer name, Customer phone,
  Payment, Subtotal, Tax, Discount, Grand total, Currency — **no raw UUIDs, no internal parameter
  names** (e.g. no `branchId`, no `cashierId`) appear as column headers; cashier/branch are resolved
  to display names before being placed in cells (`resolveCashierName(r.cashierId)`,
  `r.branchName ?? r.branchCode ?? ""`).
- **Money cells use the correct shared 3dp-aware primitive**: `formatCsvMoneyCell(value, currency)`
  from `packages/shared/src/format/csv-money.ts` — read this file's full contract: it is
  currency-decimals-aware (3dp for KWD via `getCurrencyDecimals`), rounds rather than truncates,
  renders a real `"0.000"` for zero/null/undefined (never a blank or dash — correct for a
  machine-summable export), and deliberately avoids `Intl` locale grouping/Arabic-Indic digits so
  the cell stays spreadsheet-parseable. This is the SAME helper used by every other CSV export in
  the codebase (reports, purchase, sales, inventory, accounts, audit, journal entries) — not a
  one-off POS implementation.
- **A UTF-8 BOM is added exactly once** (`downloadCsv` in `apps/web/src/lib/export/csv-export.ts`),
  guarding against Excel mis-rendering Arabic customer names, with an explicit code comment
  explaining why it checks for an existing BOM before prepending (avoiding a double-BOM bug from an
  earlier incident).
- **Filename** is built from the applied date range (`pos-transactions-{from}-{to}.csv`, falling
  back to `"all"` on either side) — a plain, human-meaningful filename, not a raw parameter dump.

**Net honest assessment of this gap:** the request-level filter correctness is CONFIRMED via live
network capture (done twice). The file-content correctness is well-supported by a full source read
of the exact code path that builds it (headers, money formatting, filename), which is real evidence
under this task's own rules (a code path read end to end is admissible), but it is **not the same as
opening the actual file**, which I was explicitly asked to do and did not achieve. Flagging as a
genuine, stated gap for whoever picks this up next, not smoothing it over.

### NOT verified in this gap
- The actual downloaded CSV file was never opened (see above — stated plainly, not guessed).
- Pagination (deep pages, page-size change) was not exercised this session — the tenant only has 7
  POS transactions total, so a "deep page" scenario does not currently exist in this data; page-size
  change control exists (`Rows per page: 25`) but was not clicked to a different value this session.
- Sorting (both directions) was not tested this session.
- An explicit loading-state screenshot (mid-fetch skeleton) was not captured this session — the
  static audit (M1) already documents the missing `keepPreviousData` behavior on this exact list from
  a source-code read; not re-verified live here.
- An explicit network-error state (e.g. simulating a 500) was not tested this session.

---

## Summary

| Finding | Severity | Status |
|---|---|---|
| HIGH-DISPLAY-01: change-due dwelling screen never renders (broadcast never carries `changeDue`) | HIGH | CONFIRMED |
| HIGH-RTL-01: category filter chips stay in English on `/ar/pos` despite Arabic data existing (`primaryText` used instead of the locale-aware helper) | HIGH | CONFIRMED |
| MED-DISPLAY-01: discount row on customer display shows "-KWD 0.000" always (string `!== "0"` instead of `Number(x) > 0`) | MEDIUM | CONFIRMED |
| Display tax row unconditional (3rd instance of already-filed H1 pattern, now also on the customer display) | (rolls into existing H1) | CONFIRMED |
| Cross-register/cross-tab BroadcastChannel scoping (device/origin-scoped, not register-scoped) | MEDIUM (design-constraint) | CONFIRMED by design, not independently reproduced with 2 live registers |
| Export request respects applied filter (`type=return` on the wire) | positive | CONFIRMED |
| Export empty state is a clean, human message | positive | CONFIRMED (screenshot) |
| Export CSV headers/money formatting/filename via shared, well-documented primitives | positive | CONFIRMED via full source read; actual file NOT opened |
| Display route gate (`pos.session.read` via `(pos)` layout `RequirePermission`) | positive | CONFIRMED via code read |
| No cost/margin/supplier/internal-ID leakage in the display's BroadcastChannel payload | positive | CONFIRMED via type read + live captured messages |
| RTL layout mirroring (panels, tender tiles, numpad, back-arrow direction, close button) | positive | CONFIRMED (screenshot comparison) |

**Explicitly open/unresolved, stated plainly (not guessed):**
1. The transactions export was **not actually opened as a file** this session — filter-correctness
   and file-content-correctness were verified by other rigorous means (live network capture; full
   source read), but the literal "open the downloaded file" step was not achieved. Two blob-capture
   techniques were tried and both failed silently in this headless environment.
2. Display reload/reconnect recovery, the "break" state, and a genuine two-register cross-leak test
   were not exercised.
3. ar/en parity was checked only at 1440px desktop, only on BUILD+SETTLE (as scoped), not on
   overlays/drawers or other breakpoints.
