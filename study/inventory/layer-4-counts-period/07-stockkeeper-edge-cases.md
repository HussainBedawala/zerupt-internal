# Chapter 07 — Edge Cases a Stockkeeper Hits

## Count during active sales / receipts (the "open warehouse" problem)

**Scenario:** Stockkeeper starts a full count at 9 AM. Sales and GRNs continue until close.
A sale of item A for 5 units posts at 10 AM. The counter physically finds (current on_hand -5)
units. The system_qty on the count line shows the 9 AM snapshot (before the sale).

**What happens:**
- Counter enters the physical count = snapshot_qty - 5
- System computes variance = (snapshot_qty - 5) - snapshot_qty = -5
- System posts a decrease adjustment of -5
- But the sale already decremented on_hand by -5
- Net effect: on_hand ends up at snapshot_qty - 5 - 5 = snapshot_qty - 10

**Result:** Overstated shrinkage. The correct approach is either (a) freeze the warehouse
during the count, or (b) use movement-adjusted system_qty = snapshot_qty + movements_since_snapshot.
Neither is implemented.

**Best practice advice for stockkeeper (until fixed):** Schedule full counts outside
business hours (overnight), or use cycle counts that cover a subset of items and freeze
only that subset's movements (not yet enforced in the system).

## Partial count (not all lines entered)

The submit step allows submission with `countedQty = null` on some lines (the query at
`approvePost` filters `isNotNull(stockCountLines.countedQty)` at line 601).

**What happens:** Uncounted lines are silently ignored at posting. There is no warning,
no error, no flag that some items were not counted. The approved count may cover only 60%
of items; the manager has no visibility unless they inspect the raw line data.

**Risk:** The stockkeeper believes the count is done; uncounted items accumulate silent
errors for potentially months before the next count.

## Recount of specific lines

The `recount` flag exists on `stock_count_lines` (schema, stock-counts.ts:129). A
manager reviewing `pending_review` can set this flag. However:
- No service method resets a flagged line's `countedQty` back to null.
- No endpoint transitions the count from `pending_review` back to `in_progress`.
- The `recount` flag is cosmetic only — posting proceeds regardless.
- A manager wanting a physical recount must cancel the entire count and restart.

## Blind count

`blindMode: true` hides `system_qty` from the counter at the UI level. Useful for
preventing anchoring bias. The service returns `systemQty` in the API response regardless;
the UI must enforce the hide. The backend does not enforce blind mode on the `saveLines`
call (there is no server-side check that the counter didn't observe the system_qty).

## Zero-count (item not found)

A counter physically finds zero units of an item. They should enter `countedQty = 0`.
This is a valid free-entry value and will produce `varianceQty = 0 - systemQty = -systemQty`.
The system correctly posts a full decrease for the missing item.

**Risk:** The counter might leave `countedQty = null` (meaning "I haven't counted this
yet") instead of entering `0` (meaning "I looked and found zero"). The system treats
null as "uncounted" and skips the line at posting (Chapter 07 — partial count above).
There is no UI-level guidance distinguishing "not yet counted" vs "zero physically found".

## Item received after count creation

New items received into the warehouse after the count was created have no line on the
count sheet. They will be in `materialized_stock_levels` with on_hand > 0, but the count
will not verify them. There is no mechanism to add new lines to an in-progress count for
items received during the count window.

## Multiple counts on same item (concurrent counts on different warehouses)

This is valid — an item can exist in multiple warehouses, and each warehouse has its own
count. Two counts on the same item but different warehouses do not interfere.

**Problematic case:** Two counts on the SAME warehouse (no uniqueness constraint
prevents this). Both could post conflicting variances for the same item.

## Serial mismatch on recount attempt

If a manager tries to "recount" by resubmitting `scannedSerials` for a serial-tracked
line (via `saveLines` while the count is still in `in_progress`), the new scanned list
replaces the old one (overwrite, not append). This is correct behavior — the last
`saveLines` call wins. But if the count has already been submitted to `pending_review`,
`saveLines` will throw `ConflictException` (status check at line 424).
