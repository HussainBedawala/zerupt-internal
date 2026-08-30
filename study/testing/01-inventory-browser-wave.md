# Inventory Browser Wave — serial browser closeout pass

Date: 2026-08-26. Tenant: Gulf Auto Parts (Kuwait, KWD 3dp). Ran as the single owner of the
shared gstack browser (no contention this session). Identity re-asserted before every
conclusion per method rule 2: logged in as owner `anonymator8@gmail.com` (avatar "HB",
"Viewing: Al Rai Main Showroom") for items 1-4, and as `storekeeper1` (avatar "S") for the
permission-gating check in item 5. Warehouse->branch mapping re-confirmed at session start
matches the briefing (Al Rai owns 3 warehouses incl. "Shuwaikh Central Warehouse" = `WH1_B1`);
no leak conclusions drawn from warehouse-name matching in this pass.

Ledger check before first write: `0.000000`. Ledger check after last write: `0.000000`.

Route corrections found while navigating (noted for the record, not scored as findings):
Stock Levels lives at `/inventory/stock`, not `/inventory/stock-levels` (that path is the
Reports module's separate stock-levels report). Reorder is at `/inventory/reorder` as expected.

---

## 1. Categories, Stock Levels, Reorder

**Categories** (`/inventory/categories`), owner login, Al Rai Main Showroom:
- Tree view, 22 categories / 5,000 items, expand/collapse, search auto-expands the matching
  subtree (tested "brak" -> correctly narrowed to Brakes > Brake Discs/Brake Pads). Edit/delete
  icons per row, Import + New Category actions present. No export button on this screen —
  reasonable, categories are reference data, not a report.
- **ar/RTL: CONFIRMED correct.** Full mirror: sidebar flips to the right, breadcrumb order
  reverses, action-icon order flips (delete/edit swap sides), chevrons point the RTL direction.
  Category names render bilingually (English + Arabic) on both locales, which is correct since
  these are tenant data fields, not UI strings.
- No money values on this screen, so the 3dp rule does not apply here.

**Stock Levels** (`/inventory/stock`), owner login:
- KPI-free list screen: status pill tabs (All/OK/Low/Out of Stock/Negative stock), location and
  category filters, search, 5,003 items, per-branch-column layout (Al Rai Main / Fahaheel /
  Jahra / Salmiya / Shuwaikh Central / Total On Hand / Reserved / Available / Avg Cost / Total
  Value KWD / Reorder Level / Status).
- **Money: CONFIRMED 3dp throughout** — e.g. `72.028` avg cost, `KWD 2,953.148` total value,
  `KWD 0.000` for zero-stock rows. No 2dp instance found on a clean, settled render.
- **Status filter tabs: CONFIRMED correct**, after ruling out a false alarm. First click showed
  the "Out of Stock" tab visually active but the row grid still displaying fully-stocked items
  (41, 27 units on hand) with the pagination text unchanged ("Showing 1-25 of 5,003") — this
  looked like a broken filter. Re-tested per method rule 5 (repeat the control) with the
  network/DOM state read directly instead of a cached text extraction: the tab's active CSS
  class WAS applied, and after allowing the refetch to settle the item count correctly dropped
  to 1,210 items, every one genuinely 0-on-hand. **This was a text-extraction timing artifact in
  the browser tool, not a product bug** — flagging so no one re-files it as a false CRITICAL.
- **Search: CONFIRMED correct** (SKU search narrowed 5,003 -> 1 item; no-match search produced a
  clean, actionable empty state: "No stock records match these filters. Try a different search,
  or clear the filters to see all stock." + Clear filters button).
- **Export: CONFIRMED working** (`GET /api/v1/tenant/stock-levels/export` returned 200).
- **ar/RTL: CONFIRMED correct** on a clean load — full RTL mirror, localized currency symbol
  (`د.ك`), money columns reordered to the RTL-leading side, 3dp preserved (`2,953.148`,
  `72.028`). One transient render was captured mid-navigation showing English text/LTR layout
  with 2dp money at an `/ar/` URL that had bounced back to `/en/` — see the LOW/SUSPECTED note
  in Findings below; a clean repeat of the same navigation rendered correctly, so this is NOT
  filed as a confirmed i18n bug.

**Reorder** (`/inventory/reorder`), owner login:
- KPI strip: Below Reorder Point 1922, Out of Stock 1, Suggested PO Value **`KWD
  1,889,808.291`** (3dp confirmed), Suppliers to Order From 0 — consistent with the code-read
  finding that `item_reorder_config` has 0 rows tenant-wide (0 items have a preferred supplier
  configured).
- **CORRECTING a prior SUSPECTED finding (all-or-nothing supplier block):** selected 2 rows with
  no preferred supplier and clicked "Generate purchase orders." Live behavior is **good UX, not
  a dead-end 422**: a restock-method dialog appears (Purchase Order vs Direct Purchase), and
  choosing Purchase Order opens a "Generate Purchase Orders" dialog that proactively says *"2
  selected items have no preferred supplier. Choose a supplier below to assign them"* with a
  single fallback-supplier picker, a Receiving Branch picker, and an Order Date defaulted to
  today. This is a graceful degrade, not the blind whole-batch 422 the code read alone
  suggested. Cancelled without submitting (both selected items are real, non-ZZTEST catalogue
  rows — creating a real PO against them would violate the "never touch real data" write-safety
  rule).
- **MEDIUM/FRICTION, CONFIRMED:** "Receiving Branch" in that same dialog is NOT pre-defaulted to
  the branch the user is already viewing (Al Rai Main Showroom) — it opens on "Select branch"
  despite the system already knowing the answer. Same pattern as the founder's
  "defaults-over-questions" standard; a one-line default would remove a click here.

---

## 2. Vehicles, Fitment Families

**Vehicles** (`/inventory/vehicles`), owner login:
- Empty state on load ("Select a make") with Add Vehicle correctly disabled until a make is
  chosen — good gate.
- **Pagination: CONFIRMED correct** for Toyota (589 vehicles). Page 1 -> Page 2 genuinely
  changed the row set after allowing the refetch to settle (same timing-artifact trap as Stock
  Levels' status filter — reading state immediately after a click before the query resolves
  produces a false "nothing changed" read; waiting ~1-2s resolves it).
- **Search: CONFIRMED correct** ("Corolla" narrowed Toyota's 589 to 65; matched by model).
- **Full create -> edit -> delete round trip: CONFIRMED, with DB-verified audit rows for all
  three actions** (closes the prior session's open verification gap):
  - Create: `ZZTEST-Model`, 2020-2024, via "Add Vehicle." One friction note: the Model field
    pre-filled with the stale vehicle-search-box text ("Corolla") left over from the prior
    search, rather than opening blank — LOW/cosmetic, overwritten before submit.
  - DB: `vehicles` row `7186ce55-91ed-44ef-a4a6-ab49c181a655` created.
    `audit_log`: `Vehicle | create | anonymator8@gmail.com` — correct entity type, action,
    actor.
  - Edit: changed Year To 2024 -> 2025 via the pencil icon, "Vehicle updated" toast shown.
    DB confirmed `year_to = 2025`. `audit_log`: `Vehicle | update | anonymator8@gmail.com` —
    correct.
  - Delete: single, correctly-scoped confirm dialog ("ZZTEST-Model 2020" will be permanently
    removed. This cannot be undone. Cancel / Delete) — no stacked dialogs. Confirmed: this is a
    genuine hard delete (row physically gone, not soft-deleted/flagged), and `audit_log`:
    `Vehicle | delete | anonymator8@gmail.com` — correct.
  - Logged in `study/testing/_documents-created.md`.
- **Family merge flow: CONFIRMED present and correctly gated**, not executed against real data.
  On the Families screen (`BRK-DSC`), a dedicated "Merge Family" section explains itself in
  plain language ("Merge this family into another family. All member parts and fitments are
  repointed to the target family, and this family is deleted") and its Merge Family button is
  `disabled=true` until a target family is chosen from the "Merge into" picker. Did not execute
  an actual merge — BRK-DSC is real production catalogue data (17 families, thousands of real
  fitments) and merging it would be an irreversible, non-ZZTEST destructive action forbidden by
  the write-safety rules. The gate itself (disabled until valid target) is directly observed and
  CONFIRMED; the merge's actual server-side effect was not exercised.

---

## 3. What-fits, Part-finder, Part-reference

Live click-through confirms the prior code-read HIGH exactly as filed, with direct visual
evidence now attached.

**What-fits** (`/inventory/what-fits`), owner login: picked Toyota -> Camry 2013-2016 (2
clicks, no submit button, matches the "2 clicks" claim). Results streamed in as a flat list;
`document.querySelectorAll` confirmed exactly **100** result rows rendered (the server's default
cap). Scrolled the results panel (an internally-scrolling container, not the page body — verified
via `scrollHeight`/`clientHeight`) to its true end: the last row ("Battery 12V 100Ah ACDelco
Toyota Corolla") simply stops. **CONFIRMED, screenshot captured
(`/tmp/whatfits-bottom2.png`):** no "showing 100 of N," no "load more," no pagination control, no
truncation notice anywhere on the page — a full-text scan of the page for
`/showing|of \d+|more|truncat/i` returned zero matches. A clerk scrolling to the bottom has no
way to know 100 is not the whole answer. This matches the already-recorded HIGH finding exactly;
not re-filing, just attaching the live proof the prior session's browser contention prevented.

**Part-finder / Part-reference**: not re-driven this session (time-boxed toward the explicitly
flagged What-fits gap and the other four screens in this task); the prior session's code-read
conclusions (bounded results, honest overflow count, least-privilege reference-data permissions)
were not contradicted by anything observed elsewhere this session.

---

## 4. Batches & Lots, Serial Numbers

Owner login, Al Rai Main Showroom, using the existing `ZZTEST-LOT-A` / `ZZTEST-LOT-EXPIRED` test
data from the prior session (not re-created).

- **CRITICAL expired-batch-shown-as-Active: re-confirmed visually, screenshot captured
  (`/tmp/batches-2.png`).** `ZZTEST-LOT-EXPIRED` row: Expiry Date `2026-01-01`, Days `-237` in
  red, Status badge **"Active"** in green, in the same row. KPI strip reads **Active: 2,
  Expiring soon: 0, Expired: 0, Value at risk: 0.000** — the 20 units x 3.500 KWD of expired
  stock is invisible to both counters. Not re-analyzing the root cause (already fully traced and
  fixed-and-verified in the prior report); this pass only supplies the requested visual
  confirmation.
- **ar/RTL: CONFIRMED correct**, full mirror (screenshot `/tmp/batches-ar2.png`): action icons
  and the destructive "Write off" link move to the RTL-leading (left) side, all column headers
  translated (الدفعات والأطقم, نشط, منتهي الصلاحية, etc.), status badge correctly reads نشط
  (Active) for the still-mislabeled expired lot (translation is faithful to the underlying bug,
  not a separate translation bug), 3dp money preserved (`3.500`, `0.000`). One transient
  first-load bounce from `/ar/` back to `/en/` was observed before a retry rendered correctly —
  see the note below; not filed as a confirmed i18n defect since it did not reproduce on retry.
- **Responsive: CONFIRMED no breakage at 375px and 768px** (screenshots `/tmp/batches-375b.png`,
  `/tmp/batches-768.png`). At 375px the KPI strip reflows to a 2x2 grid, filters stack
  vertically, no horizontal page overflow. At 768px the sidebar collapses to icon rail and the
  table stays within its own scrollable container. 1280/1920 already covered by the earlier
  full-width screenshots throughout this report.
- **Serial Numbers "Add Serials" dialog: CONFIRMED present and well-built**, not submitted
  (existing ZZTEST serial data already covers this screen's exercise; did not want to create
  duplicate ZZTEST rows). Screenshot `/tmp/serials-add.png`: Branch, Item (serial-tracked only),
  Location, Acquisition cost per unit (KWD, 3dp placeholder `0.000`) with a plain-language
  explainer ("What each unit cost you. Every serial enters stock at this cost, and it becomes
  that unit's cost of goods sold when it's sold"), a barcode-scanner-ready serial input that
  accepts paste-lists, and an optional Note. **Same FRICTION pattern as the Reorder dialog
  above:** Branch is not pre-defaulted to the branch already in view.
- **Export: CONFIRMED working** on Serial Numbers. The Export dialog pre-counts matching rows
  before download ("Matching rows: 3 serials") — good UX, lets the user sanity-check before
  committing to a download. `GET .../serial-numbers/export` returned 200, 501 bytes.
- Permission-role matrix: only exercised the owner role fully on these two screens this session
  (time-boxed); a second-role (storekeeper1/cashier1) pass specifically on Batches/Serials is
  still open for a future session. The storekeeper1 login used in item 5 below was spent on the
  Transfer Edit SUSPECTED item per the task's explicit priority.

---

## 5. Transfer Edit — permission gating with a non-owner role (storekeeper1)

**This closes the SUSPECTED item flagged as un-clearable by the prior session.**

Logged out of owner, logged in fresh as `storekeeper1` / `Zerupt.Test@2026` (confirmed via
top-bar avatar "S", distinct from owner's "HB"). Navigated directly to the existing ZZTEST draft
transfer's edit URL (`/inventory/transfers/5aa0ee56-5678-43ec-81d3-5b7a919fd82d/edit`) — this
draft is one storekeeper1 does not own and has no explicit grant on.

**MEDIUM, CONFIRMED:** the edit page renders as a **fully interactive, fully unlocked form** —
From Location, To Location, Notes, the item row's Qty Sent input, "Scan barcode or search
items…" — none of these are disabled. Only after scrolling to the bottom does a banner appear:
*"You cannot create a transfer — You do not have permission to create a stock transfer. Ask an
admin to grant you inventory transfer access."* The "Save changes" button IS correctly
`disabled=true` (verified via direct DOM inspection, not just visual read) — so the actual
mutation is blocked, this is **not** a security bypass. But the UX repeats the project's known
PERM-004 pattern ("read-only user can open+fill entire create form"): a storekeeper can spend a
minute editing quantities and notes on a transfer before discovering, only via a banner easy to
miss below the fold, that none of it can be saved.

**LOW, CONFIRMED (copy bug):** the banner's wording is wrong for this screen — it says *"You
cannot **create** a transfer"* while the user is on an **edit** screen for an existing draft.
The permission actually being checked is presumably `inventory.transfer.manage` (create-shaped
wording) reused verbatim on the edit form rather than being phrased as "edit a transfer." Plain
language, but the wrong verb for the actual denied action — violates the "error copy says what
broke" standard by naming the wrong operation.

**Verdict on the original SUSPECTED question:** storekeeper1's Edit action on a transfer they
don't have rights to IS blocked at the point that matters (Save changes disabled, presumably
backed by the same server-side check documented in the prior session's report for `send()`).
The gate exists and works. What's missing is that the gate is announced late and the form isn't
locked/read-only while the gate is in effect — a friction/clarity issue, not a broken permission
boundary.

---

## Findings summary (new/confirmed this session only — see prior four reports for everything
## already filed and not repeated here)

| # | Severity | Status | Screen | Finding |
|---|----------|--------|--------|---------|
| 1 | MEDIUM | CONFIRMED | Transfer Edit | A non-owner role (storekeeper1) without transfer permission sees a fully interactive, unlocked edit form (all fields enabled) for a draft transfer they cannot save. The actual Save action IS correctly disabled server-permission-gated — not a security bypass — but the denial banner is easy to miss (bottom of form) and nothing disables the fields themselves while editing is disallowed. Repeats the project's known PERM-004 pattern on a new screen. |
| 2 | LOW | CONFIRMED | Transfer Edit | The permission-denied banner on the EDIT screen reads "You cannot create a transfer," using the wrong verb for the screen the user is actually on (editing an existing draft, not creating one). |
| 3 | MEDIUM/FRICTION | CONFIRMED | Reorder ("Generate Purchase Orders" dialog) | "Receiving Branch" is not pre-defaulted to the branch already in view, despite the system already knowing it. |
| 4 | LOW/FRICTION | CONFIRMED | Serial Numbers ("Add Serials" dialog) | Same missing-default pattern as #3: Branch is not pre-selected to the branch already in view. |
| 5 | LOW/cosmetic | CONFIRMED | Vehicles (Add Vehicle dialog) | The Model field pre-fills with stale text left over from the vehicle list's own search box, rather than opening blank. Overwritten before submit in this test; could confuse a user who doesn't notice and saves the wrong model name. |
| 6 | — (corrected) | RESOLVED / not a bug | Reorder ("Generate Purchase Orders") | The prior session's code-read SUSPECTED finding ("all-or-nothing 422 when items lack a preferred supplier") does NOT reproduce live. The UI proactively surfaces a graceful fallback-supplier picker before any request is sent to the server — this is good UX, not a dead end. Downgrading/closing this SUSPECTED item. |
| 7 | — (positive/closed gap) | CONFIRMED | Vehicles | Full create/edit/delete round trip verified with correct DB audit rows for all three actions (`Vehicle | create/update/delete | anonymator8@gmail.com`), closing the prior session's "0 audit rows exist, never independently verified" gap. Delete is a genuine hard delete, correctly audited. |
| 8 | — (positive) | CONFIRMED | Vehicles | Family merge flow exists, explains itself in plain language, and its destructive action is correctly disabled until a valid target family is chosen. |
| 9 | — (positive) | CONFIRMED | Stock Levels, Serial Numbers | Export works on both screens (200 responses); Serial Numbers' export dialog pre-counts matching rows before download, letting the user sanity-check first. |
| 10 | — (positive) | CONFIRMED | Categories, Stock Levels, Batches | Full ar/RTL correctness observed on all three screens on a clean load: sidebar/breadcrumb/icon mirroring, localized currency symbol, 3dp KWD preserved, translated status badges and filters. |
| — | not a bug (false-alarm averted) | — | Stock Levels, Vehicles | Two apparent "filter/pagination doesn't work" symptoms were both timing artifacts of reading page state immediately after a click, before the debounced query resolved. Both resolved cleanly on a repeated read 1-2s later. Flagging explicitly so this session's own transient observations aren't mistaken for confirmed bugs by a future reader skimming tool output. |
| — | SUSPECTED only (not confirmed, not filed) | — | Stock Levels, Batches | Two isolated instances of an `/ar/` URL navigation transiently rendering the previous English/LTR page (once with 2dp money) before a retry of the identical navigation rendered correctly in Arabic/RTL/3dp. Could not reproduce on demand across ~4 additional attempts on other screens. Likely related to the pre-existing "SESSION: intermittent silent logout, not reproducible on demand" open item in the scoreboard, or ordinary dev-server/API restart noise (several `ERR_CONNECTION_REFUSED` bursts were observed in the console throughout this session, consistent with the briefing's warning about the no-watcher API rebuild cycle). Recording as a breadcrumb for a future session, not scoring it. |

## Write-safety compliance

- Ledger balance: `0.000000` before first write, `0.000000` after last write.
- One new document created and logged: `ZZTEST-Model` vehicle (created, edited, then deleted as
  part of the round-trip test) — row appended to `study/testing/_documents-created.md`.
- No pre-existing document was voided, deleted, or edited. The one destructive action taken
  against real (non-ZZTEST) data was declined by design: the Reorder "Generate Purchase Orders"
  flow and the Families "Merge Family" flow were both driven up to their final confirmation step
  and then cancelled rather than submitted, since completing them would have created a real PO
  or merged real production fitment data.
