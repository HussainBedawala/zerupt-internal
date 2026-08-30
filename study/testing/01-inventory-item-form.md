# Item detail page + New Item form

Tested as OWNER, branch Al Rai Main Showroom. Test item `GAP-ENGPMP-02450` (water pump).

---

## CORRECTION FIRST — a reported CRITICAL was NOT a bug (I verified)
The sweep reported: "Stock by Location silently drops a warehouse that has stock" — page showed
15 units (Al Rai Main Showroom 3 + Shuwaikh Central 12) while the DB has 39 including Fahaheel 24.

**Verified in SQL. Not a defect.** The active branch was **Al Rai**, which owns BOTH warehouses
shown (`B1_AL_RAI_MAIN_SHOWROOM-MAIN` and `WH1_B1` Shuwaikh Central). Fahaheel's 24 units belong
to **B2** and are correctly excluded by branch scope.

This is the THIRD time an agent has mistaken correct branch scoping for data loss (previously:
Shuwaikh "outside the four branches", and company-wide catalogue counts). Warehouse names do not
map 1:1 to branch names in this tenant, and that keeps fooling people.

### BUT it exposes a real product gap — ITEM-DET-001, HIGH (product decision)
A parts counter's actual question is **"do we have this part anywhere?"** The page answers
"do we have it in this branch?" and gives no hint that 24 units sit in Fahaheel. The clerk tells
the customer "we have 15" or "we're low", when the company holds 39.

Two things are missing:
1. **No scope label.** The table never says whether it is branch or company scope.
2. **No other-branch visibility.** Even a muted "24 more at other branches" line would turn a lost
   sale into a transfer or a redirect.

This is the same theme as the low-stock finding (INV-OV-001): branch-aggregate answers "should I
buy?", but nobody is answering "do we already have it elsewhere?".
**FOUNDER DECISION, pairs with the earlier transfer-signal question.**

---

## ITEM-DET-002 — HIGH — There is no read-only item view; every visit is a live edit form
`/en/inventory/items/{id}` renders the same fully-editable form as edit mode, header "Edit Part",
every field a live input, Save at the bottom. A clerk who just wants to check a price is dropped
into an editable form where a stray keystroke plus Save mutates real data.

Directly against the defensive-UX rule. A parts counter looks things up far more often than it
edits them.

## ITEM-NEW-001 — HIGH — Stale validation error blocks resubmission
Submit empty -> "Name is required." (correct). Fill Name with a valid value, submit again while a
DIFFERENT field is invalid -> the Name error and `aria-invalid="true"` **persist**, with the field
containing valid text. Confirmed via DOM attributes. A user can be permanently blocked from
saving unless they reload.

## ITEM-NEW-002 — HIGH — Wrong error copy, and it is invisible on screen
Entering `-5` in Selling Price produces:
> "This number is too large. Use at most 13 digits before the decimal point."

for a NEGATIVE number. Worse, that text **is not rendered visually at all** — only the label turns
red. The explanation exists solely in the DOM/accessibility tree. A sighted user sees a red label
and no reason.

## ITEM-NEW-003 — HIGH — No unsaved-changes guard
Typed a name, clicked a nav link, navigated away instantly with no warning. Draft silently lost.
House rule is warn before data loss.

## ITEM-DET-003 — MEDIUM — Invalid item id hangs forever
`/en/inventory/items/00000000-0000-0000-0000-000000000000` shows "Loading your branches…"
indefinitely (>4 minutes, never resolves). No 404, no not-found state, no way out.
The items list loads fine in the same session, so it is specific to the bad-id path.

## ITEM-DET-004 — MEDIUM — Fitment is family-scoped and dumps ~100 unfiltered rows
`fitments.item_id` is NULL for all 9,266 rows: fitments attach to `part_families`, never to items.
So this water pump's page lists ~100 vehicles from the whole `ENG-PMP` family, none of them the
Nissan Altima in the item's own name. The UI DOES disclose this ("Fitment is shared by every part
in this part's family"), so it is not silently wrong, but there is no search, no pagination and no
filter on a 100-row flat list. Families are grouped by a SKU token (`ENGPMP`), not by real fitment.

## ITEM-NEW-004 — MEDIUM — Two fields ask for the same thing
"Part No." (top of form) and "OEM/Part Number" (inside More details) are the same concept under
two labels. A shop owner will not know which to fill.

## ITEM-NEW-005 — MEDIUM — Std. Purchase Price duplicates cost
Detail page shows Average Cost (read-only, 6.025) and Std. Purchase Price (editable, 6.025) as two
numbers. The schema has only `cost_price`, so it is the same value twice under different labels.

---

## Friction / simplification (against the "under 60 seconds" bar)
Fields to REMOVE or MERGE: Std. Purchase Price (merge into one canonical cost),
OEM/Part Number (merge with Part No.).
Fields correctly DEFERRED already (collapsed under "More details", no complaint): Weight,
Quantity Decimal Places, Tracking type, Grade, Dimensions.
Keep front-loaded: Name, Unit, Selling Price, opening qty + cost, warehouse, Brand/Family.
One structural gripe: Alternate Codes and Fitment live inside the same collapsed "More details"
panel as the niche fields, even though cross-reference codes are CORE auto-parts work, not an
extra.

---

## Confirmed GOOD (evidence-backed)
- **3-decimal money end to end.** Typed `12.345` -> DB stores `12.345000` exactly. No 2dp or 4dp
  rounding anywhere on these screens.
- **No tax/VAT field anywhere** on either screen. Correct for Kuwait, and it is derived rather
  than hardcoded.
- **Duplicate SKU rejected server-side** with plain copy: "This SKU is already in use.", attached
  to the right field.
- Empty submit gives "Name is required." plus a page-level "Please fix the highlighted fields
  before saving."
- **Auto-parts fields are available at CREATE time** (Brand, Family, Alternate Codes, Fitment) —
  no save-then-reopen round trip for a counter clerk.
- Alternate Codes correctly filters out the auto-generated self-referential sku/part_number rows
  and shows only the genuine cross-reference.
- Arabic: `dir=rtl`, `lang=ar`, fully translated, mirrored layout, KWD/PCS codes correctly stay LTR.

## Known-good-but-worth-noting
A bookmarked `/ar/...` URL silently opens in English if `NEXT_LOCALE=en` is set from a prior visit.
Cookie-over-URL precedence is a defensible Next.js pattern, so not scored as a bug, but a shared
Arabic deep link will surprise someone.

## RECORDS CREATED
| SKU | Name | id |
|---|---|---|
| `ZZTEST-SKU-0001` | ZZTEST-Brake Pad Set Front Test 2 | `ce4915ed-f88b-4bdb-8885-77e9b9cef882` |

Minimal fields, selling price 12.345, no stock assigned. No pre-existing data touched.

## Not tested
Keyboard-only completion and tab order; over-long name limits; barcode generation; pack units;
image upload; the detail page's action buttons (not clicked, to avoid mutating a real item).


---

## CORRECTION 2026-08-26 — the two "duplicate field" findings were WRONG. Do not merge them.

I reported ITEM-NEW-004 (Part No. vs OEM/Part Number) and ITEM-NEW-005 (Std. Purchase Price vs
Average Cost) as duplicated fields and recommended merging. **Both were wrong.** Verified against
the live schema:

```sql
items:            cost_price, selling_price
item_cost_pools:  average_cost, last_cost, total_value
```

**Std. Purchase Price != Average Cost.** Different columns, different TABLES, different meanings:
- `items.cost_price` — what you EXPECT to pay. Manually set. A default for new purchase orders.
  Its own tooltip says it "does not affect profit".
- `item_cost_pools.average_cost` — what you ACTUALLY paid. Server-computed weighted average.
  This is the number that drives COGS and profit.

The earlier agent claimed "the schema has only cost_price" — it had looked only at the `items`
table and missed `item_cost_pools` entirely. Merging these would have destroyed the distinction
between expected and actual cost, which is a genuine accounting concept, not UI clutter.

**Part No. != OEM/Part Number.** `items.sku` is the unique, regex-constrained internal code with an
auto-generate button that locks once stock exists. `items.part_number` is the manufacturer's
free-text reference used for cross-referencing. Both columns exist and are used independently.

### The real defect here is COPY, not structure
Both pairs are legitimately distinct and confusingly labelled. Fix the labels and tooltips so a
shop owner can tell them apart at a glance. Do NOT remove either field.

### Method lesson
"Schema has only X" is not a safe conclusion from reading one table. Two agents disagreed; the DB
settled it. Check the schema directly before recommending the removal of anything financial.
