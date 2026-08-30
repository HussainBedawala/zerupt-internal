# Inventory > Items ("Parts") list — `/:locale/inventory/items`

5,000 items. The screen where scale actually bites.

---

## ITEM-001 — CRITICAL — Arabic search is completely broken; the index for it exists and is never used
**Verified three ways.**

Searching `بطارية` (battery) returns **0 items**. Ground truth in the DB: **324 items** match
`name_alt ILIKE '%بطارية%'`, and **all 5,000 items have Arabic alt names**.

Root cause, read in source: the search predicate is
`or(ilike(items.name), ilike(items.sku), ilike(items.partNumber))`
(`apps/api/src/inventory/items/items.service.ts:668`, mirrored at :326-328).
**`items.nameAlt` is not in the predicate.**

The damning part: migration 0307 created **`items_name_alt_coalesce_trgm_idx`**. Four trigram
indexes now exist on `items` — `name`, `sku`, `part_number` and `name_alt`. The query uses three.
The `name_alt` index is built, and re-maintained on every write, and never read. Somebody built
the index for exactly this purpose and the predicate was never updated.

**Why CRITICAL for this product:** the tenant's secondary language is Arabic, every single item
carries an Arabic name, and the target market is MENA retail. An Arabic-speaking counter clerk
searching for a part in Arabic gets "no results" for a part that is sitting on the shelf. They
will conclude the shop does not stock it.

**Status:** FIXED & VERIFIED IN BROWSER (324 results, correct Arabic items rendered)

### How it went wrong the first time, and the lesson
The first fix added the `nameAlt` leg, proved with EXPLAIN it hits the trigram index, and
returned 324 in SQL. All true. **And the bug was still 100% unfixed for the user**, because
`items.service.ts` held TWO independent copies of the predicate: `search()` (fixed) and
`list()` (not fixed). The items list is the screen users actually search on.

Second pass extracted ONE shared `buildItemTextSearchCondition(term, { includeBarcodeExists })`
(`items.service.ts:259-289`); both call sites use it and `ilike(items.name` now appears exactly
once in the file. Verified end to end: `GET /api/v1/tenant/items?q=بطارية` -> HTTP 200,
`meta.total = 324`. Then re-verified in the browser.

**Process lesson adopted:** a passing test plus a green EXPLAIN is NOT proof a user-facing bug is
fixed. Verify the user-visible outcome (browser or real HTTP) before calling anything fixed.

---

## ITEM-001b — HIGH — the SAME Arabic gap exists on three more screens (blast radius)
Grepped repo-wide after the fix. Three more item text-search predicates omit `name_alt`:

| File | Line | Predicate | Screen affected |
|---|---|---|---|
| `inventory/reorder/reorder.service.ts` | 269 | `or(ilike(name), ilike(sku))` | Reorder / low-stock list |
| `inventory/stock-levels/stock-levels.service.ts` | 422 | same shape | Stock Levels list |
| `inventory/batches/batches.service.ts` | 154-156 | batchNo/name/sku | Batches & Lots |

NOT a gap (checked): `auto-parts/search/part-finder.service.ts` already covers `nameAlt` via its
own trigram-similarity engine. `items-export.service.ts` delegates to the items list `q` so it
inherited the fix. POS reuses `ItemsService` directly. Customer/supplier `nameAlt` searches are a
different entity, out of scope.

**Status:** FIX DISPATCHED

---

## ITEM-002 — CRITICAL — Rapid pagination permanently freezes the list; only a full reload recovers
Repro: page size 100, click "Next page" repeatedly ~2.5s apart (faster than the API responds).
- Every click fires its own request. Nothing debounces, cancels or supersedes in-flight requests.
- Requests queue and latency climbs monotonically: page 4 = 14.4s -> page 24 = 12.1s ->
  page 31 = **22.7s**.
- After the final queued request returned **HTTP 200**, the UI **never left the loading skeleton**,
  observed for 30+ seconds. "Showing X-Y of 5,000" never came back. Only a full page reload recovered.

So the user is left staring at a skeleton forever, after a successful response.

This screen is used in a rush at a parts counter. Impatiently clicking Next is not exotic
behaviour, it is the expected behaviour, and it bricks the screen.

**Status:** FIXED & VERIFIED IN BROWSER BY ME

### The real mechanism (better than the original theory)
It was not a stuck query. `items-list-panel.tsx:446` gated the ENTIRE table **including the
pagination footer** on `isLoading`. In TanStack v5, `isLoading = isPending && isFetching`, and a
page change creates a brand-new query key with no cached data, so `isPending` is true on EVERY
page click, not just first load.

**Result: the Next/Previous buttons literally unmounted from the DOM on every page change**, for
the whole duration of that fetch. Confirmed by polling: `[aria-label="Next page"]` returned
`null` for the entire multi-second window.

Combine that with a slow backend and the user clicks into a void, queueing unbounded requests
against a UI that keeps vanishing.

Honest note from the fixer: it could NOT reproduce a literal never-recovers freeze; every run
eventually recovered once the last response landed. The confirmed defect is the full unmount,
which matches the reported symptom shape.

### Fix
`placeholderData: keepPreviousData` on the paginated inventory query hooks (so the previous page
stays rendered while the next fetches, and `isPending` is false after first load), plus an
in-flight guard on `handlePageChange`, plus a subtle "Refreshing" indicator copied from the
existing `journal-entries-panel.tsx` convention.

**My own verification:** clicked Next, then polled 5 times over 10 s -> `CONTROLS PRESENT` every
time, rows correctly at "Showing 26-50 of 5,000". First load still shows a genuine skeleton.
Rapid-click test by the fixer: 8 fast clicks produced only **1** network request.

---

## ITEM-002b — MEDIUM (systemic) — the same unmount-on-fetch pattern exists in ~30 other lists
Grepped every `TableSkeleton`-gated `isLoading` panel. Fixed the 8 inventory ones (items,
stock-levels, adjustments, transfers, batches, promotions, serial-numbers, stock-counts).

**Still carrying the pattern, outside inventory:** customers, receipts/payments, trial-balance,
sales-overview recent-invoices, close-management, direct-sales, invoices, delivery-orders,
fiscal, admin (feature-flags/tenants/admins), general-ledger, taxation, account-mappings,
cheques, purchase (suppliers, landed-costs, returns, payments, direct-purchases, grns, orders),
bank-reconciliation, debit-notes.

Two panels ALREADY do it correctly and were used as the exemplars: `audit-panel.tsx` and
`journal-entries-panel.tsx`.

These will be fixed as each module's phase comes up, so the change lands with that module's
testing rather than as one blind sweep.

---

## ITEM-003 — HIGH — There is no column sorting at all
Headers (Name, SKU, Category, Selling Price, Stock, Status) are plain `<th>`: no `aria-sort`,
`cursor: auto`, and clicking them fires no request and changes nothing (verified on Name,
Selling Price and Stock).

On a 5,000-row catalogue you cannot sort by Stock ascending to see what is running out, or by
price. At this scale that is not a nicety.

---

## ITEM-004 — HIGH — "Clear filters" leaves the search text behind
Repro: search "Brake" -> apply status=Active -> "Clear filters".
Status and category reset, but the search box still holds "Brake" and the count stays **620**
instead of returning to 5,000. Clearing from a search-ONLY state works correctly, so the bug is
specific to search combined with another filter.

The user believes they have cleared everything and is now looking at a filtered catalogue.

---

## ITEM-005 — MEDIUM — Search has no debounce
Typing 4 characters at 300ms intervals fired **4 separate full API requests**
(`q=zzzqqqb`, `...br`, `...bra`, `...brak`), each a 5-13s round trip. Combined with ITEM-002's
lack of request cancellation, a normal typist queues several slow, redundant, unabortable
requests.

---

## ITEM-006 — HIGH (systemic) — The list is slow, everywhere, with no floor
| Operation | Time |
|---|---|
| Items API page 1, limit 25 (warm) | 5.1s |
| Items API page 1, limit 100 (first) | 20.8s |
| Items API page 1, limit 100 (second) | 7.6s |
| Search exact SKU | 5.8s |
| Search name "Brake Pad" | 13.8s |
| Search alternate code | 12.3s |
| Category filter | 12.4s |
| Under rapid pagination | 4s -> 22.7s, monotonically increasing |

**Nothing measured came in under 4 seconds.** This is the most-used screen in the module and it
is unusable at a counter. Needs its own investigation, not a spot fix. Note this is measured
AFTER the trigram indexes landed, so indexes are not the missing piece.

---

## FRICTION
- **No "jump to page"** control. 50 pages at 100/row reachable only by sequential Next clicks,
  which is exactly what triggers ITEM-002.
- **No keyboard shortcut to focus search** (`/` and Cmd+K both do nothing) on a rush-hour screen.
- **Selling Price column shows no currency** (`6.313` with no KWD anywhere on the row).
- **ar:** header badge "5000 صنف" is not thousands-separated while the footer "عرض 1–25 من 5,000"
  in the same locale is.

---

## CORRECTIONS to the sweep (I verified; these are NOT bugs)
The sweep believed it was logged in as the tenant OWNER. **It was actually logged in as
`cashier1`** — my own earlier login persisted in the browser. Confirmed: the persisted branch id
resolves to `B2_FAHAHEEL_BRANCH`, which is cashier1's only branch. Therefore:

- **"403 on `/tenant/settings` and `/tenant/warehouses`"** — CORRECT behaviour. A cashier has
  neither permission. Not a bug.
- **"Branch switcher never renders"** — CORRECT. A single-branch user is offered no switcher.
  This actually re-confirms the Phase A finding that branch scope cannot be self-escalated.

Both were reported as MEDIUM defects. Neither is a defect.

---

## Confirmed GOOD (verified against SQL, not assumed)
- **Export respects applied filters** — the single most important check here, and it passes.
  The dialog shows an explicit "Applied filters: Search: Brake Pad" chip and "Matching rows: 331
  items", versus "No filters are applied, so every item will be exported / 5,000 items" when
  clear. Export API calls carry the query params.
- **Export strips cost server-side, not just in the UI.** `items-export.service.ts:57` changes
  the CSV HEADERS based on `canViewCost`, gated on `inventory.cost.view`
  (`items-export.controller.ts:32`). A cashier exporting the catalogue gets no cost column at
  all, and the code comments say explicitly "stripped server-side (never just hidden)".
  This is the right pattern and it closes the classic export-bypasses-permissions leak.
- Counts tie exactly to SQL: total 5,000 · `BRKPAD` 331 · "Brake Pad" 331 ·
  "Brake"+Active 620 · category "Brake Pads" 331. Counts stay correct across pagination.
- **Alternate-code search works** (`MIC-32232` -> parent item `GAP-FLTAIR-00001`) — the core
  auto-parts counter workflow.
- Gibberish search gives a proper empty state with a "Try a different search" CTA.
- **Stock column is branch-scoped**: SKU `GAP-ELEPLG-01870` showed 28 on Fahaheel; SQL confirms
  Fahaheel 28 vs company-wide 114 vs Al Rai 19.
- Money is 3-decimal KWD everywhere on this screen, en and ar. No 2dp instances.
- Responsive at 375px: the table scrolls inside its own container; the page never scrolls
  sideways (`document.body.scrollWidth === window.innerWidth === 375`).
- ar: `dir=rtl`, no raw i18n keys, full column mirroring, Western digits (correct for money).

## Could not test
- **The exported CSV file's actual contents** (headers, encoding of Arabic names). The headless
  session had no download path. The export REQUEST and its filter plumbing were verified instead.
  **This still needs doing** - reading the real file is the only way to confirm Arabic encoding
  and header quality.
- A genuine 5xx error state, distinguishable from empty.
