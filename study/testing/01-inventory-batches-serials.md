# Inventory: Batches & Lots + Serial Numbers — Test Report

Date: 2026-08-26. Tenant: Gulf Auto Parts (Kuwait, KWD 3dp). Logged in as owner
`anonymator8@gmail.com` (confirmed via top-bar avatar "HB" and branch picker showing
tenant-specific branches). Scope tested at "Al Rai Main Showroom" branch (owns 3 warehouses:
Al Rai Main Showroom, Shuwaikh Central Warehouse, Transit — branch-scoping trap applied
throughout, see SQL below).

## Data reality (established BEFORE judging the UI, per instructions)

```sql
select tracking_type, count(*) from items group by 1;
-- none | 5001   (ALL 5001 pre-existing items are tracking_type='none')

select count(*) from item_batches;        -- 0
select count(*) from item_serial_numbers; -- 0
```

**Zero items in this tenant had batch or serial tracking enabled, and zero batch/serial rows
existed.** Both screens were genuinely empty before this session. I created real data through
the real backend service (not raw SQL) to exercise both screens:

- Created item `ZZTESTBA-FC132987` "ZZTEST-Batch Tracked Oil Filter" (trackingType=batch)
- Created item `ZZTESTSE-3A2B0ED2` "ZZTEST-Serial Tracked Alternator" (trackingType=serial)
- Posted 3 stock adjustments (type=Found) at Al Rai Main Showroom warehouse via
  `POST /tenant/stock-adjustments`, which is the ONLY way batch/serial rows get created —
  there is no direct "create batch" or generic "create serial" endpoint; batches/serials are
  always born from a receiving movement (GRN or adjustment).
  - `B1ALRAIMAINS-ADJ-00010`: +50 units, batch `ZZTEST-LOT-A`, expiry 2027-06-01 (future)
  - `B1ALRAIMAINS-ADJ-00011`: +20 units, batch `ZZTEST-LOT-EXPIRED`, expiry 2026-01-01 (past —
    today is 2026-08-26, so 237 days expired at time of receipt)
  - `B1ALRAIMAINS-ADJ-00012`: +3 units, serials `ZZTEST-SN-001/002/003`
- Ledger balance checked before (0.000000) and after (0.000000) — see
  `study/testing/_documents-created.md` for the full log.

## CRITICAL — CONFIRMED: a batch received with an already-past expiry date is shown and
## treated as "Active", not "Expired", until a once-daily cron catches up

**Evidence — code:**

`apps/api/src/inventory/movement-attribution.service.ts` (`resolveInboundBatch`, ~line 278) is
the function that find-or-creates a lot row on every batch-tracked receipt (adjustment or GRN).
It inserts unconditionally with:
```ts
status: "active",
```
It never calls `deriveStatusFromExpiry(expiryDate)` — the exact helper
`apps/api/src/inventory/batches/batches.service.ts` defines and uses for `update()` and
`undoWriteOff()` to keep status honest. The only place that corrects a stale status is
`BatchesService.markExpiredBatches()`, run once daily by `BatchExpirySchedulerService`.

`apps/api/src/inventory/batches/batch-picker.service.ts` (FEFO allocator) selects sellable lots
with `AND b.status IN ('active', 'expiring')` — it does **not** additionally check
`expiry_date < today`. So between receipt and the next cron run, an expired lot is both shown
as "Active" AND remains eligible to be picked and sold to a customer.

**Evidence — DB (my own test data), confirms the code reading:**
```sql
select batch_no, expiry_date, status from item_batches order by batch_no;
 ZZTEST-LOT-A       | 2027-06-01 | active
 ZZTEST-LOT-EXPIRED | 2026-01-01 | active   <- 237 days past expiry, still "active"
```

**Evidence — browser, /inventory/batches, Al Rai Main Showroom, logged in as owner:**
Screenshot showed the list row for `ZZTEST-LOT-EXPIRED`: Expiry Date `2026-01-01`, Days column
`-237` in red, Status badge **"Active"** in green — directly contradicting the red days-overdue
number in the same row. The KPI strip read **Active: 2, Expiring soon: 0, Expired: 0, Value at
risk: 0.000** — the 20 units × 3.500 KWD = 70.000 KWD of genuinely expired stock is invisible
to both the Expired count and the Value-at-Risk tile.

**Why this is CRITICAL, not cosmetic:** this is a stock-correctness and money issue, not just a
display bug. Any batch-tracked item received via GRN with a backdated or already-past expiry
(a very normal real-world case: a shop owner is late entering a shipment, or receives goods
that were already close to/past their shelf life) is sellable and shows as fine in the UI until
the nightly job runs — up to ~24h of window where expired stock can legitimately be sold at
POS/sales, and where the batches screen actively misinforms the user ("Active" next to
"-237 days").

**Fix location:** `resolveInboundBatch()` should derive initial status from `expiryDate` at
insert time using the same `deriveStatusFromExpiry()` helper `batches.service.ts` already
exports for exactly this purpose (currently only `batches.service.ts`'s own paths use it).
`BatchPickerService`'s FEFO queries should also filter or flag `expiry_date < CURRENT_DATE` as
a defense-in-depth belt-and-suspenders, since a second insert path could reintroduce the same
gap (a lot's `unitPackId` reservation import path, POS quick-add, etc. weren't audited for the
same defect within this session's time budget — grep `insert(itemBatches)` finds only these two
call sites today, but any future third site would inherit the same gap unless it goes through a
shared constructor).

## Reconciliation check (per instructions — batch sum vs on-hand)

Verified twice, item + warehouse scoped to avoid the Al-Rai-3-warehouses trap:

```sql
select warehouse_id, on_hand from materialized_stock_levels
  where item_id = '8daa1632-92af-48b8-bd34-8a389fa18304';
-- a941792d... (Al Rai Main Showroom) | 70.000000

select sum(qty_remaining) from item_batches
  where item_id = '8daa1632-92af-48b8-bd34-8a389fa18304';
-- 70.000000

select sum(quantity) from stock_ledger_entries
  where item_id = '8daa1632-92af-48b8-bd34-8a389fa18304';
-- 70.000000
```
All three agree (50 + 20 = 70). **No reconciliation mismatch found** — batch sum, ledger sum,
and materialized on-hand all tie out for the data I created. Given only one warehouse was used
for this item, I could not additionally test a multi-warehouse split of one item's batches
within the time budget; the lot-identity design (one master row per lot, quantity split by
warehouse via ledger projection — documented in `batches.service.ts`'s header comment) is
architecturally sound for that case but was not independently exercised.

## Serial numbers: duplicate check, status lifecycle, resale of sold units

**Can the same serial exist twice?** No — confirmed by schema:
```sql
UNIQUE (tenant_id, item_id, serial_no)  -- item_serial_numbers_tenant_item_serial_key
```
This is scoped by `(tenant, item)`, not additionally by warehouse — correct: a serial number is
a physical unit's identity; it should be impossible to have two "units" of the same serial for
the same item anywhere in the tenant, and the constraint enforces exactly that (a transfer moves
the same row's `warehouse_id`, it does not duplicate the row). I did not find a UI/API path that
lets the same serial be entered twice for the same item — the unique index would 409/23505 it.

**Status lifecycle** (enum `serial_number_status`): `available → reserved → sold → returned`,
plus `defective` and `in_transit`. Read `serial-numbers.service.ts` `remove()` (lines ~488-560):
a sold/reserved/in_transit serial CANNOT be removed via the UI ("Return or release the unit
first"), and a unit with real sale history is permanently protected from hard-delete — the
delete path only hard-deletes a registry-only row with zero ledger movement, otherwise it posts
a real 1-unit WriteOff adjustment (GL-correct) to retire it to `defective`. This is well-built:
no silent data loss, no orphaned ledger rows. **No bug found here** — this is a positive finding.

**Is a sold serial re-sellable?** By status alone, no: `sold` is a terminal state distinct from
`available`/`returned`, and nothing in `serial-numbers.service.ts` transitions `sold` back to
`available` directly — a `returned` unit (via a sales credit note / restock path) is the
documented route back to sellable stock. I verified this by reading the state machine in code
(`restoreToAvailable()` only accepts a `defective` unit, and `remove()`'s status check explicitly
walls off `sold`); I did not have a sold serial in my test data to click through the actual sale
+ return flow end to end in the browser within this session's time budget — this claim is
**CONFIRMED by code**, not independently re-verified by a live sale transaction.

## Screen-by-screen browser verification

**Batches & Lots** (`/inventory/batches`), Al Rai Main Showroom scope, owner login:
- KPI strip: Active/Expiring soon/Expired/Value at risk tiles render — **but Expired and Value
  at risk are wrong** per the CRITICAL finding above.
- List columns: Batch No., Item, Location, Mfg Date, Expiry Date, Days (to expiry, signed),
  Qty Remaining, Unit Cost, Status, Supplier Ref, actions (view / edit / Write off).
- Money: Unit Cost rendered `3.500` — correct KWD 3dp via `formatMoneyAmount` (shared
  primitive, confirmed in `batches-list-panel.tsx` import).
- Search/warehouse/status/expiry-range filters present in the toolbar; not exhaustively
  re-tested against pagination/sort combinations this session (only 2 rows of test data exist,
  insufficient to meaningfully test deep pagination).

**Serial Numbers** (`/inventory/serial-numbers`), same scope/login:
- KPI strip: Available/Reserved/Sold/Defective — read correctly (Available: 3 matched my 3
  created serials).
- List columns: Serial No., Item, Status, Location, Acq. Cost, Warranty Expiry, Purchase Ref,
  Sale Ref, actions (Mark Defective, Remove).
- Money: Acq. Cost rendered `45.000` — correct KWD 3dp.
- Purchase Ref correctly links back to `B1ALRAIMAINS-ADJ-00012`, the adjustment that created
  the serials — good traceability.
- An "Add Serials" button exists in the header (not clicked/exercised this session — the 3
  serials I needed were already created via the adjustment path that a real GRN would also use,
  so this button was lower priority given the time budget; flagging as **untested**, not broken).

## Method-rule compliance notes

- Rule 3 (branch-scoping trap): confirmed via SQL that Al Rai owns 3 warehouses
  (`a941792d…` Al Rai Main Showroom, `4d230c12…` Shuwaikh Central Warehouse,
  `0da38490…` Transit) before treating any warehouse-scoped result as branch-correct. All test
  data was posted to a single named warehouse (Al Rai Main Showroom) and the reconciliation
  check above is warehouse-id-scoped, not branch-name-scoped, to avoid this trap.
- Rule 2 (assert login before conclusions): every screenshot/URL check was taken immediately
  after confirming the top-bar shows "HB" (owner initials) and "Viewing: Al Rai Main Showroom".
- The dev browser is shared with other concurrent agent sessions this run (repeated unexpected
  navigations/logouts observed mid-session) — every finding above was re-verified against a
  fresh screenshot/SQL query taken immediately before recording it, not from an earlier,
  possibly-stale observation.

## Not covered this session (time-boxed)

- Permissions matrix (cost.view strip, cashier/accountant role denial) not tested against
  these two screens — only owner login was exercised.
- Audit log rows for the write-off/mark-defective/remove actions not verified in DB.
- i18n/RTL (Arabic locale) not visually checked for either screen.
- Responsive breakpoints (375/768/1280/1920) not checked.
- Export (both screens have an Export button) not exercised.
- "Add Serials" manual-entry dialog not exercised.

## Summary of findings

| # | Severity | Status | Finding |
|---|----------|--------|---------|
| 1 | CRITICAL | CONFIRMED | A batch received with an already-expired `expiryDate` is inserted with `status: "active"` (movement-attribution.service.ts `resolveInboundBatch`) instead of deriving status from the date; it is shown as "Active" in the UI and remains FEFO-sellable until the once-daily `markExpiredBatches()` cron catches up. Reproduced live: `ZZTEST-LOT-EXPIRED` (expiry 2026-01-01, -237 days) shows green "Active" badge, Expired KPI = 0, Value at risk = 0.000 KWD despite 70.000 KWD of stock being expired. |
| 2 | — | CONFIRMED (positive) | Batch qty reconciles exactly across `item_batches.qty_remaining`, `stock_ledger_entries`, and `materialized_stock_levels` for the item/warehouse tested (70.000 = 70.000 = 70.000). No mismatch found. |
| 3 | — | CONFIRMED (positive) | Serial number uniqueness is enforced tenant+item-wide via a real DB constraint; a sold/reserved/in-transit serial cannot be deleted from the UI, and deletion of a stocked serial correctly reverses through a real GL-posting WriteOff rather than a silent hard-delete. |
| 4 | LOW | SUSPECTED | A sold serial's return-to-sellable path (`sold → returned → available`) was verified by reading the code's state machine only, not exercised end-to-end via an actual sale + return in the browser this session. |
| 5 | FRICTION | SUSPECTED | Both screens were 100% empty for every real item in this tenant (0 of 5001 items batch/serial tracked) before this session — there is no in-app nudge on either empty screen prompting a user to enable tracking on an item, so a shop owner who navigates here cold sees a dead end with no next action. (Not independently re-verified against the true first-load empty state, since I populated data before screenshotting either screen — noted as a gap, not a confirmed empty-state failure.) |

---

# Orchestrator verification of the expired-batch CRITICAL (2026-08-26)

**CONFIRMED — every link of the chain independently verified, and the severity is if anything
understated.** The agent said expired stock "remains FEFO-sellable". It is worse than that: the
picker's own ordering makes expired stock the **first** thing sold.

## Link 1 — the receipt path hardcodes `active`, with the expiry date in the same insert

`apps/api/src/inventory/movement-attribution.service.ts` — `resolveInboundBatch()`:
```ts
.values({
  ...
  expiryDate: input.expiryDate ?? null,   // <-- expiry IS known here
  ...
  status: "active",                        // <-- and ignored
  grnDocId: base.sourceDocumentId,
})
```

## Link 2 — the correct helper exists, and this is the one path that skips it

`apps/api/src/inventory/batches/batches.service.ts:109`  `deriveStatusFromExpiry(expiryDate)`
Used at `:306` (update) and `:588` (undoWriteOff). **Not used on the inbound receipt path.**
So this is not a missing feature — it is one call site out of three that forgot the helper.

## Link 3 — the picker filters on status, never on the date

`apps/api/src/inventory/batches/batch-picker.service.ts:112` and `:197`:
```sql
AND b.status IN ('active', 'expiring')
ORDER BY b.expiry_date ASC NULLS LAST, b.created_at ASC
```

**This is the sharper edge.** The query *orders* by `expiry_date ASC` but never *filters* by it.
A lot that expired in the past therefore holds the earliest expiry date in the set, so FEFO sorts
it to the **front of the queue**. Expired stock is not merely still sellable — it is
preferentially picked ahead of good stock.

Verified by replaying the picker's exact ordering against the live tenant:
```
      batch_no      | expiry_date | status
 ZZTEST-LOT-EXPIRED | 2026-01-01  | active    <-- 237 days expired, sorts FIRST
 ZZTEST-LOT-A       | 2027-06-01  | active
```

## Link 4 — the only thing that ever corrects it is a once-daily cron

`batch-expiry-scheduler.service.ts` -> `markExpiredBatches()`. So the exposure window for a lot
received already-expired is up to 24 hours, during which it sells first and reports clean.

## Live state confirming the reporting failure

```
      batch_no      | expiry_date | status | qty_remaining | days_past_expiry
 ZZTEST-LOT-EXPIRED | 2026-01-01  | active |     20.000000 |              237
```
A lot 237 days past expiry, flagged **Active**, while the KPI strip reads
`Expired: 0 / Value at risk: 0.000 KWD`.

## Why CRITICAL is the right severity

This is a food/parts-safety and money-correctness defect at once: expired goods are sold first,
the expiry KPI under-reports risk as zero, and stock valuation counts worthless inventory at full
value. It needs no unusual input — receiving a short-dated or already-expired lot is ordinary
retail.

**Fix:** call `deriveStatusFromExpiry(input.expiryDate)` in `resolveInboundBatch` instead of the
`"active"` literal, AND add a date predicate to the picker
(`AND (b.expiry_date IS NULL OR b.expiry_date >= current_date)`) so correctness does not depend
on cron latency. Per method rule 1, fix BOTH — patching only the insert leaves every batch
already in this state still sellable, and the picker is the actual gate.

**Ledger integrity re-verified after all agent writes: `0.000000`.**
