# POS — Testing Findings Log

> Running log of issues found during live testing. One row per finding. Update status as fixed.
> Severity rubric: see [`../README.md`](../README.md). Fix CRITICAL/HIGH immediately; batch MEDIUM/LOW for review.

## Baseline (2026-06-29, Asala dev tenant `zerupt_tenant_dev` @ `br-old-recipe-a1d3dw26`)

**Data state:** Asala has **1 register, zero shifts / transactions / payments / receipts / cash movements.** No POS activity has been rung up yet. The data tie-out invariants (cash reconciliation, balanced JE per sale, COGS relief per line, stock deduction per line, return/void reversal) **cannot be baselined until sales exist** — defer these to the live dogfooding pass, then re-run queries Q1–Q10 from recon.

**Structural baseline (dataset-independent — DB constraints + indexes):**

| Invariant | Guard found | Verdict |
|---|---|---|
| ≤1 open shift per register | partial unique idx `pos_shifts_one_open_per_register WHERE status<>'closed'` | ✅ DB-ENFORCED (recon worried this was service-only — it is a hard DB guard) |
| Cashier ≤1 open shift | partial unique idx `pos_shifts_one_open_per_cashier` | ✅ DB-ENFORCED |
| shiftNumber monotonic/unique per register | unique `(register_id, shift_number)` | ✅ |
| Idempotent offline replay (tx + shift) | partial unique `pos_transactions_tenant_client_id_key` + `pos_shifts_tenant_client_id_key WHERE client_id IS NOT NULL` | ✅ DB-ENFORCED |
| transactionNumber unique per tenant | unique `(tenant_id, transaction_number)` | ✅ |
| Exactly one receipt per transaction | unique `(tenant_id, transaction_id)` on `pos_receipts` | ✅ |
| Receipt token unique | partial unique `pos_transactions_receipt_token_key` | ✅ |
| costAtSale ≥ 0 | check `cost_at_sale >= 0` | ✅ (but ≥0 only — zero-cost still passes; verify >0 on live tracked items, recon Q7) |
| Foreign-currency payment requires rate | check `amount_fc IS NULL OR (exchange_rate IS NOT NULL AND >0)` | ✅ |
| changeGiven ≥ 0; payment amount > 0 | checks present | ✅ |
| openingFloat ≥ 0; cash movement amount > 0 | checks present | ✅ |

## Findings

| # | Date | Submodule | Severity | Summary | Repro | Expected vs Actual | Status |
|---|------|-----------|----------|---------|-------|--------------------|--------|
| 1 | 2026-06-29 | 02 Transaction Lifecycle | LOW | No DB CHECK backstop for `grandTotal = subtotal + taxTotal - discountTotal` (only individual non-negative checks exist). Header-total arithmetic is service-only — a service rounding/logic bug would persist with no DB guard. | `pg_constraint` scan on `pos_transactions` | A CHECK enforcing the total identity (as accounting/inventory ledgers have), or accept as service-validated + covered by tests | OPEN (confirm recon flag; decide CHECK vs test-only) |
| 2 | 2026-06-29 | (baseline) | NOTE | Asala has zero POS activity (1 register only). Data tie-out invariants undeferred until live sales rung up. | Row counts | Not a bug — testing-readiness gap. Ring up sales in the live pass, then run recon Q1–Q10 | LOGGED (superseded — prod Asala now has 1 shift + 10 sales rung up 2026-07-03) |

## UX overhaul findings (2026-07-03, from live screenshots — register screen)

> **P1–P5 SHIPPED** in commit `574c576f` (main, pushed). 14 files, reviewer panel (frontend+code) findings all folded in. web typecheck + i18n:check + 923 POS tests green. Findings #3–#6 → FIXED below. #7 partially (offline-banner logic untouched), #8 still OPEN (functional, submodule 08).

| # | Date | Submodule | Severity | Summary | Repro | Expected vs Actual | Status |
|---|------|-----------|----------|---------|-------|--------------------|--------|
| 3 | 2026-07-03 | 02 Cart (register screen) | HIGH | **Cart is unreadable.** Item names truncate to "Ba…" while per-line Discount + Tax columns render "KWD 0.000" on every line (tenant has no tax/discount). Least-useful data (zeros) eats the space the item name needs; "KWD" repeats ~20× on one panel with no column separation. | Add 3 items to cart, view right panel | Item name legible (2 lines ok); `KWD` shown once in header not per-cell; zero discount/tax collapsed (shown only when non-zero); line = Name · Qty · Total | FIXED 574c576f |
| 4 | 2026-07-03 | 01/all | HIGH | **Dialogs break the dark theme.** POS is dark but Close Shift renders as a white modal (same will affect cash-movement/void/return). Reads as unfinished. | Open Close Shift on dark POS | All `(pos)` dialogs inherit the dark surface via a shared themed wrapper | FIXED 574c576f |
| 5 | 2026-07-03 | 03 Payment (SETTLE) | MEDIUM | **SETTLE wastes 60% of screen + cash entry built for a mouse.** Greyed catalog keeps 60% width while pay is crammed in 40%; Amount-tendered has spinner arrows (no on-screen keypad wired though numeric-keypad.tsx exists); quick-cash chips fixed 0.5/1/5/10/20 regardless of amount due; "Cash advisory" jargon. | Hit Pay (F4), view payment panel | SETTLE expands pay to reclaimed space; big keypad; smart denominations (Exact + next round notes 135/140/150); plain-language labels | FIXED 574c576f |
| 6 | 2026-07-03 | 02 Search | LOW | **Search dropdown collides with tile grid** — results overlay with a hard edge slicing a tile mid-row. Result rows (icon·name·SKU·price) are more readable than the cart itself. | Type "oil" in search | Clean elevated surface that owns the region (or replaces grid while searching); cart should borrow the result-row treatment | FIXED 574c576f |
| 7 | 2026-07-03 | 08 Close Shift | LOW | Close Shift dialog: placeholder AND helper text both read "Total cash physically in the drawer." (duplicate); shows "Offline totals… syncs when you reconnect" while top bar shows "Online" (contradiction — verify real bug vs stale copy). | Open Close Shift | De-dupe helper text; offline banner only when actually offline | OPEN |
| 8 | 2026-07-03 | 08 Close Shift | HIGH | **Blind-close summary diverges from server truth.** Close Shift dialog computed **8 transactions / net 1,795.720** ("Offline totals") while the server (prod Asala shift b61dfe82) holds **10 completed / 1,827.720** and the top bar read "Online" — a 2-sale / 32.000 KWD gap. Cashier would reconcile the drawer against a wrong expected cash. | Ring sales, open Close Shift on the register while online | Blind-close expected/summary must reflect authoritative server tally when online (or force a sync before showing totals); local IDB tally used only when genuinely offline, clearly labelled | **FIXED** (display-only bug; ledger was always correct — see root-cause note) |

### Finding #8 — root cause + fix (2026-07-03)

**Which problem:** display-only. The persisted ledger value was never wrong.

- **Bug (display):** `shift-close-panel.tsx` unconditionally sourced its summary from the local IndexedDB queue via `computeLocalZReportFromQueue(db, openingFloat)` — regardless of connectivity. Expected cash, transactions, net/cash sales, and the derived over/short all came from local IDB; it received `serverShiftId`/`isOffline` props but never used them, and always rendered the WifiOff "Offline totals" note (the "Offline while Online" tell). When the device's local queue trailed the server (sales rung on another device/session, or a cleared/partial IDB — the prod case: 8 local vs 10 server), the cashier saw a wrong expected (1,795.720 vs true 1,827.720) and a phantom over/short. The X-report dialog was already correct — it uses the server `useXReportQuery`.
- **Persisted value (safe):** `PosShiftsService.close` (`pos-shifts.service.ts:477-479`) recomputes `expectedCash` via `computeCashComponents` (DB aggregate over `pos_payments`/`pos_transactions`/`pos_cash_movements`) and `cashOverShort = actualCash − expectedCash` server-side; it only trusts client `actualCash` (the physical count). GL was correct (1,827.720). Already guarded by `pos-shifts.service.spec.ts` (close computes expected/over-short from DB, ignores client figures).
- **Fix:** when `!isOffline && serverShiftId`, the close panel now drives expected/summary/over-short from the server X-report (`useXReportQuery`), labelled "Live totals from the server"; the local IDB report is used **only** offline / pre-sync, labelled provisional. Panel also nudges the sync engine on open so pending local sales flush. New regression guard `shift-close-authoritative.test.tsx` reproduces the exact 8/1,795.720 (local) vs 10/1,827.720 (server) divergence and asserts the online close reconciles against the server tally with no phantom over/short. web typecheck + i18n:check + close-panel tests (8) green.
- **Also addresses #7's contradiction:** the "Offline totals" note now renders only when actually provisional/offline. (The duplicate helper/placeholder text in #7 is cosmetic and left as-is.)

## Live findings (2026-07-04, register/payment/receipt dogfooding — post-UI-overhaul)

| # | Date | Submodule | Severity | Summary | Repro | Expected vs Actual | Status |
|---|------|-----------|----------|---------|-------|--------------------|--------|
| 9 | 2026-07-04 | 08 Close Shift | HIGH | **Close Shift dialog not scrollable** — content (Transfer to safe + the Close button) is cut off at the viewport bottom and the modal doesn't scroll, so the cashier cannot reach/press Close. Blocks the entire close flow. | Open Close Shift with the dialog taller than viewport | Dialog body scrolls (overflow-y-auto, max-height), Close button always reachable/sticky footer | FIXED 3d2eb4ee (scrollable body + sticky footer) |
| 10 | 2026-07-04 | 03 Payment | MEDIUM | **Change due shown in THREE places** on the SETTLE screen: "Change: KWD x" under Amount Due, a big "CHANGE DUE" banner, and "Change due: KWD x" under the quick-cash chips. Redundant/cluttered. | Tender > amount due (cash) | One prominent CHANGE DUE display; remove the other two | FIXED 3d2eb4ee (single change-due display) |
| 11 | 2026-07-04 | 07 Receipt | MEDIUM | **Receipt titled "TAX INVOICE" for a zero-tax tenant.** Kuwait tenant collects no VAT; a plain sale should read "RECEIPT"/"SALES RECEIPT". "TAX INVOICE" should be conditional on VAT registration / tax present. | Complete a sale, view receipt | Title conditional on tax/VAT-registration | FIXED 3d2eb4ee (title gated on taxTotal>0) |
| 12 | 2026-07-04 | 07 Receipt | MEDIUM | **Receipt line layout stacked + missing line total.** Each item = name on row1, "qty × unit" on row2, no extended line total. Founder wants single row: name (start) + qty/price (end); second-language alt name on the next row with qty/price; add the per-line extended total. | View receipt preview | Single-row primary + alt-name row per item; show line extended total | FIXED 3d2eb4ee (single-row layout + line total + alt-name row) |
| 13 | 2026-07-04 | 07 Receipt | LOW | **"Sale completed" header above receipt preview** — possibly redundant with the receipt itself. | Complete a sale | Decide: remove or make it a subtle confirmation | FIXED 3d2eb4ee (slimmed to checkmark) |
| 14 | 2026-07-04 | 07 Receipt | LOW | **"Send via WhatsApp" button disabled** — likely no customer/phone attached to the sale. Flow to attach a customer/phone unclear. | Post-sale screen, no customer | Enable path (prompt for phone / attach customer); clarify flow | FIXED 3d2eb4ee (real WhatsApp send flow built, not hidden) |
| 15 | 2026-07-04 | 02 Search | MEDIUM | **Price check shows "In stock: Unknown."** The price-check dialog can't resolve on-hand quantity. | Tap info (i) on a search result | Show real on-hand stock (or hide the row if genuinely unavailable) | FIXED 3d2eb4ee (lazy warehouse-scoped on-hand lookup) |
| 16 | 2026-07-04 | 08 Close Shift | HIGH | **Possible incomplete #8 fix:** Close dialog showed 8 txns / expected 1,763.720 while server held 10→11 completed (2028.700). Dialog labeled "Live totals from the server" but numbers don't match server. Verify whether display is truly server-authoritative or still stale/local. | Open Close Shift while online, compare to server | Dialog matches server tally exactly | OPEN (confirm vs screenshot timing before reopening #8) |

## Tie-out recon (2026-07-04, PROD Asala `zerupt_tenant_al_asala_auto_parts_mqy1wpk2` @ `br-red-term`, shift `b61dfe82`)

> Submodule 02 autonomous three-way tie-out over all 11 completed transactions in the open shift. Recon-only pass (no code changes per founder instruction). Cash tally 2028.700 KWD = Σ grand_total ✓.

**Header arithmetic (invariant §2):** ✅ all 11. `grandTotal = subtotal + taxTotal − discountTotal` exact on every row (incl. tx-9/tx-10 discount: 2.440 − 0.610 = 1.830). transactionNumber unique + monotonic (B1SHUWAIKHREG1-1-1..11). No voids, no held tx currently.

**Three-way tie-out (POS record ↔ GL journal ↔ stock ledger):** ✅ 9 of 11 tie out exactly (revenue JE `pos.transaction.completed` balanced Dr=Cr; COGS JE `inventory.sale`/`sale_return` balanced; matching signed stock-ledger movement at qty×costAtSale). ❌ **2 of 11 FAIL — see #17.** Two are returns (tx-3, tx-5: `type=return`, negative-qty lines, positive grand_total — correct modelling).

| # | Date | Submodule | Severity | Summary | Repro | Expected vs Actual | Status |
|---|------|-----------|----------|---------|-------|--------------------|--------|
| 17 | 2026-07-04 | 02 / 09 Cross-module (inventory tie-out) | **CRITICAL** | **Two completed prod POS transactions relieved NO stock and posted NO COGS — three-way tie-out broken.** (a) **tx `ec78893f` / B1SHUWAIKHREG1-1-8** — 715.000 KWD sale of "Test Battery (Batch tracked)" qty 11: revenue JE posted (Dr cash / Cr sales 715), but **no `inventory.sale` JE and no `stock_ledger_entries` row** → COGS understated ~143.000, inventory overstated ~143.000. (b) **tx `9909384f` / B1SHUWAIKHREG1-1-5** — serial ECU return qty −1: revenue-reversal JE posted (5.000), but **no `inventory.sale_return` JE and no stock movement** → returned serial never restocked, COGS stays overstated 99.000. In BOTH the inventory outbox event (`pos.*.completed.inventory`) is marked **`status=completed`, attempts=0, no error**, and its payload carries the correct line (qty 11 batch / qty 1 serial) — so it is a **silent no-op**, not a thrown failure. **Root cause (localized, read-only):** the batch line had **no `batchId`** and the serial-return line had **no `serialNumbers`** (unlike the tie-ing tx-6/tx-7 which carried a `batchId`). `MovementAttributionService.attributeOutbound/attributeInbound` (`movement-attribution.service.ts:143-178`) can return an **empty movement array** — the batch idempotency short-circuit `if (await batchLineAlreadyRecorded(...)) return []` (`:153`) or an empty FEFO pick on a depleted lot. `recordAttributed` (`inventory-event.listener.ts:91-96`) returns `null` when the movement array is empty, and `applyOutbound`/`applyInbound` (`:501-505`, `:219-222`) treat `entryId === null` as **"duplicate eventId — skipping"** and `return` — writing nothing while the event completes cleanly. The POS never-block-negative policy (`blockNegativeStock=false`) is defeated because attribution bails before the negative-stock fallback. | Ring a POS sale of a batch-tracked item whose lots are depleted (no FEFO batch resolvable at add-line) — or return a serial line without the serialNumbers stamped — then query `stock_ledger_entries` + `journal_entries(source_document_type='pos')` for that tx. | Every completed sale/return line writes exactly one signed stock movement + a balanced COGS JE (Dr COGS / Cr Inventory at qty×costAtSale), even when negative stock results; an empty attribution must NOT be silently swallowed as a "duplicate". Needs engine-level fix (distinguish "already-recorded replay" from "nothing attributed", and honor the POS negative-stock fallback for unresolvable batch/serial lines) — deferred to a fix pass. | **OPEN — CRITICAL** (recon-confirmed; fix deferred per founder) |
| 18 | 2026-07-04 | 09 Cross-module (outbox) | ~~MEDIUM~~ → **NOT A BUG** | Original: "outbox poller appears stalled" (tx-11 rows pending at recon time). **Re-verified 2026-07-04 (12h later): all 107 outbox rows now `completed`** (newest processed 2026-07-03 21:43) — the pending rows were just mid-flight during the recon snapshot. Poller drains correctly. Downgraded/closed. | Re-query `accounting_event_outbox GROUP BY status` → 100% completed. | Poller healthy. | CLOSED (transient snapshot, not a stall) |

### Finding #17 — root cause CONFIRMED + fix (2026-07-04)

**Re-verified 12h later (2026-07-04):** still 11 completed tx (no new ones); **tx-8 and tx-5 still have ZERO stock-ledger rows** — no self-heal. Diagnosis below is derivation-verified (recomputed the deterministic per-line eventIds offline and matched them against the actual ledger rows of the *tie-ing* tx-6 exactly).

**Three defects — two already fixed upstream, one live:**
- **D3 (durability) — ALREADY FIXED.** The silent completion (outbox marked `completed`, attempts=0, no stock/COGS) is the exact silent-gap that `runDurableGated` + `DURABLE_REPLAY_MARKER` (PR #168/#169, 2026-07-03) closed. tx-8/tx-5 were rung **2026-07-01**, BEFORE that fix → pre-fix casualties. On current code a fresh oversell dead-letters LOUDLY instead of completing silently.
- **D2 (serial not copied to POS return line) — ALREADY FIXED.** Current receipted-return path copies `serialNumber` onto the return line (`pos-transactions.service.ts:1572`); tx-5 (rung 2026-07-01) predates it → stale data.
- **D1 (batch/serial oversell blocks COGS) — LIVE, being fixed.** `BatchPickerService.pick` (`batch-picker.service.ts:100-106`) hard-throws "Insufficient batch-tracked stock" when requested qty > available lots, even for a POS sale where `blockNegativeStock=false`. Since the inventory fan-out runs async AFTER the sale commits + takes cash, the throw now dead-letters forever → sale completed, COGS/stock never post → tie-out broken. **The hardened invariant `MovementAttributionService.failUnattributed` (`movement-attribution.service.ts:63-81`) forbids writing an unattributed ledger row for a tracked item**, so the correct fix is NOT "relieve unattributed negative stock". **Persona decision (counter cashier, lot-tracked auto parts):** BLOCK a batch/serial oversell at COMPLETION with a clear "only N in stock" message — before money is taken. Non-tracked items keep the never-block-negative behavior. Fix in progress (pre-completion attributability guard in `pos-transactions.service.ts` + tests; accounting/nestjs/code reviewers).

**Prod data remediation (needs founder approval — Neon MCP writes require it):** the two pre-fix prod transactions are still out of tie-out and won't self-heal: **tx-8 (`ec78893f`)** is short one `inventory.sale` movement + COGS ~143.000 (batch relief for qty 11), and **tx-5 (`9909384f`)** is missing the serial restock + COGS reversal 99.000. These need a manual corrective backfill (or a void+re-ring) on prod once the code fix lands. Do NOT auto-apply — flag for the founder.

**FIX (D1) — SHIPPED to main 2026-07-04:** pre-completion attributability guard `assertBatchLotsAttributable` in `pos-transactions.service.ts`, called inside the `pay()` DB transaction. For every batch-tracked sale line it sums available lot stock (Σ `stock_ledger_entries.quantity` per lot × warehouse, `GREATEST(0,…)` per-lot clamp to match `BatchPickerService.pick` exactly, `FOR UPDATE` locked in the picker's (expiry, created) order) and rejects with a user-friendly `UnprocessableEntityException` if the requested qty (aggregated per item across lines) can't be covered — BEFORE cash/outbox commit. A throw rolls back the whole sale atomically (status flip, receipt, payments, both outbox rows). Non-tracked items keep never-block negative behavior; serial oversell already blocks via `markSold`. **Reviewer panel (accounting + nestjs + code):** online-path logic confirmed correct (atomicity, ledger-basis parity, unit consistency, non-tracked/serial preservation); folded in — negative-lot false-positive clamp (accounting MEDIUM), deadlock-safe lock ordering (code MEDIUM), corrected overclaiming comments (nestjs CRITICAL was a doc-overclaim, not a logic defect — the guard fixes the observed single-tx prod bug; the concurrent-across-registers double-sell is a pre-existing async-relief residual, now LOUD not silent, single-register-safe). api typecheck + 176 pos-transactions + 101 pos-sync tests green. **Residuals (accepted, surfaced to founder):** (1) concurrent same-lot completions within the async fan-out window can still both pass → the loser dead-letters loudly (full close needs synchronous in-tx batch reservation — tracked follow-up); (2) offline-synced oversell is intentionally NOT guarded (never reject an already-paid device sale) → dead-letters for manual reconciliation. Both need a monitoring/reconciliation runbook.

**BACKFILL + MONITORING RUNBOOK — [`study/pos/11-tie-out-backfill-and-residual-runbook.md`](../../../../study/pos/11-tie-out-backfill-and-residual-runbook.md) (2026-07-04).** Contains the exact state snapshot, the engine-re-drive backfill SQL for tx-8 + tx-5, the tx-8 cost-basis decision (A snapshot-143 / **B current-WAC-299.5 recommended** / C full recompute), verification queries, and the R1 (concurrent) + R2 (offline) monitoring/reconciliation procedures. **Backfill NOT yet executed** — held for founder confirmation of the tx-8 basis before mutating prod GL (irreversible, material); one-word go and it runs. tx-5 is unambiguous (specific-ID 99.0). Monitoring runbook (Part 2) delivered.
| 19 | 2026-07-04 | 02 Domain (margin sanity) | NOTE | tx-4 (`d0ff61bc`) sells "ECU Test Unit" (serial) at unit_price 5.000 with cost_at_sale 99.000 → COGS 99 on 5.000 revenue (−94 margin). Genuine test data (deliberately cheap sale of an expensive serial unit), NOT a bug — `costAtSale > 0` invariant holds. Flagging only so it isn't mistaken for a WAC-capture error during review. | Line inspection | No action; margin-warning UX could surface sub-cost sales for the cashier (future). | LOGGED |

## Settings redesign findings (2026-07-04, register management)

| # | Date | Submodule | Severity | Summary | Status |
|---|------|-----------|----------|---------|--------|
| 17 | 2026-07-04 | 01 Settings | HIGH | Entire POS settings UI poor: register mgmt bolted onto receipt settings, one long ungrouped form, printer buried, live preview used a different tenant's sample data (Pacific Co/AED), alt-language label hardcoded "Arabic". | FIXED bf1ffbbc — redesigned as legal-entities-style Registers list + row→detail drawer with grouped config sections; real-tenant preview; dynamic secondary-language label |
| 18 | 2026-07-04 | 01 Settings | MEDIUM | Register code was required — user could get stuck on codes. | FIXED bf1ffbbc — code optional, auto-suggested gap-safe REG-N, auto-generated on blank |
| 19 | 2026-07-04 | 01 Settings | LOW | Opening float didn't show 0.000 until focused. | FIXED bf1ffbbc — formats to currency decimals from first render |
| 20 | 2026-07-04 | 01 Settings | LOW | Duplicate-code error shown in TWO places (toast + inline banner). | FIXED bf1ffbbc — single inline error near Code field, no toast |
| 21 | 2026-07-04 | 01 Settings | HIGH | Could DEACTIVATE a register with an OPEN shift (server had no guard); till kept selling but register vanished from shift-open picker. | FIXED bf1ffbbc — server ConflictException guard (in a transaction, TOCTOU-safe) + UI blocks deactivate with reason; shift-open already rejected inactive registers |

| # | Date | Submodule | Severity | Summary | Status |
|---|------|-----------|----------|---------|--------|
| 22 | 2026-07-04 | 01 Register/Session | HIGH | Opening a new shift right after closing one re-showed the Close Shift dialog on the fresh shift (stale `overlay:'close'` — bumpShiftVersion never reset it). | FIXED 3eee0a6b — overlay cleared on every shift open/close/reconcile; regression test added |
| 23 | 2026-07-04 | 01 Register/Session | MEDIUM | Open Shift "opening float" was a raw number input (6dp `0.000000`, spinner arrows, unformatted "5"). | FIXED 3eee0a6b — shared MoneyInput at currency precision (KWD 3dp, no spinners) |

## Live findings (2026-07-04, sale/receipt/settle dogfooding on shift #2)

| # | Date | Submodule | Severity | Summary | Status |
|---|------|-----------|----------|---------|--------|
| 24 | 2026-07-04 | 06/09 Offline+Contracts | CRITICAL | Offline sale with a PACK-UNIT item fails to sync ("Request validation failed", retry loops) — stranded on-device forever. Sync ingest schema/service never learned pack units (unitPackId/unitQty), unlike the direct add-line path. | FIXED 728b6406 — sync schema + server-side pack resolution: base qty = unitQty×factor, pack discount folded via shared helpers; posts revenue/discount/COGS/stock identical to online; accounting-reviewed clean (2 passes) |
| 25 | 2026-07-04 | 07 Receipt | HIGH | Pack-unit receipt line internally inconsistent: "1 × KWD 8.730" but line total "KWD 52.380" (pack qty × base price ≠ base total). | FIXED 728b6406 — pack-aware displayUnitPrice (lineTotal÷qty, no re-pricing) → "1 × 52.380 = 52.380" |
| 26 | 2026-07-04 | 06 Offline | LOW | Sync-queue drawer showed money at 6dp (52.380000) instead of KWD 3dp. | FIXED 728b6406 — formatted via currency formatter |
| 27 | 2026-07-04 | 03 Payment | MEDIUM | Two change-dues shown pre-complete (small "Change:" under Amount Due + big banner) — earlier dedup was incomplete. | FIXED 728b6406 — single CHANGE DUE banner |
| 28 | 2026-07-04 | 03 Payment | MEDIUM | Tapping Pay auto-opened the amount keypad; cashier should choose (type / Exact / chip). | FIXED 728b6406 — autoOpen removed; opens on tap |
| 29 | 2026-07-04 | 03 Payment | LOW | Numeric keypad dialog off-center with uneven padding. | FIXED 728b6406 — standard centered DialogContent + even gaps |
| 30 | 2026-07-04 | 03 Payment | MEDIUM | Overpaying with only non-cash tenders gave no feedback (Complete silently disabled). | FIXED 728b6406 — inline warning "change only on cash" |
| 31 | 2026-07-04 | 03 Payment | OPEN | On Account tender disabled with no customer attached (correct guard) — but is there any way to ATTACH a customer on the till? If not, On Account is unusable in practice. | OPEN — investigate customer-attach affordance on /pos |

| # | Date | Submodule | Severity | Summary | Status |
|---|------|-----------|----------|---------|--------|
| 32 | 2026-07-04 | 07 Receipt | LOW | "Reprint receipt" dialog (sync-queue reprint, queue-reprint-dialog) shows "Send via WhatsApp" disabled even for a SYNCED sale that has a receipt token. The WhatsApp-enable fix (commit 3d2eb4ee) only covered the post-sale local-sale-receipt, not the reprint dialog. | OPEN — wire the same receiptToken→wa.me flow into the reprint dialog (submodule 07/10) |

---

## Tie-out re-recon + lifecycle code audit (2026-07-04 PM, PROD Asala `zerupt_tenant_al_asala_auto_parts_mqy1wpk2` @ `br-red-term`)

> Submodule 02 autonomous re-run over all **12** completed transactions (was 11; new pack-unit sale `b9376bef` / B1SHUWAIKHREG1-2-1 on shift #2). Manual founder guide delivered: [`02-manual-test-guide.md`](02-manual-test-guide.md).

**Three-way tie-out (POS ↔ GL ↔ stock): ✅ 12 of 12 now GREEN.** Every completed tx has ≥2 balanced journal entries (Σdebit−Σcredit = 0.000000 exact), a revenue JE (`pos.transaction.completed`/`pos.return.completed`), a COGS JE (`inventory.sale`/`sale_return`), and matching signed stock-ledger movements (sales negative, returns positive). Header arithmetic exact on all 12; transactionNumber unique + monotonic.

**Finding #17 (CRITICAL) — RESOLVED on prod.** The two previously-broken transactions were **backfilled 2026-07-04** (verified live, not assumed):
- **tx-5 (`9909384f`, serial return):** now has `inventory.sale_return` JE (DR 1141 / CR 5100 = 99.000, specific serial cost) + stock **+1** restock (backfilled 14:48). Ties out.
- **tx-8 (`ec78893f`, batch sale):** now has COGS JE described "inventory.sale (backfill finding #17)" (DR 5100 / CR 1141 = **299.538459**, basis **B / current-WAC** per the runbook) + stock **−6/−5 = −11** across two lots (backfilled 16:25). Balanced, ties out.
  - **Note (not a defect):** tx-8's backfilled COGS (299.538 on WAC basis) intentionally deviates from line `costAtSale`×qty (13.000×11 = 143.000). This was the documented [runbook](../../../../study/pos/11-tie-out-backfill-and-residual-runbook.md) basis-B decision (line costAtSale was stale/wrong), not a new tie-out break.

**Pack-unit tie-out (commit 728b6406) — ✅ CONFIRMED END-TO-END** on real data (tx `b9376bef`): line stores **base qty 6** (unit_qty 1 pack × factor 6) @ 8.730; stock relief **−6 base units** (not −1 pack); COGS 28.620 (= 6 × 4.770 cost); revenue 52.380 = pack price. Findings #24/#25 verified live.

**Lifecycle code audit (hold / recall / pay / void — `pos-transactions.service.ts`): no new CRITICAL/HIGH.**
- `pay` — status-guarded UPDATE `WHERE status='draft'` (atomic double-tap no-op); empty-cart guard (`Cannot pay a transaction with no lines`); grand-total integrity assertion inside the tx; `assertBatchLotsAttributable` pre-completion oversell guard (finding #17 D1); receipt-token minted post-commit (no orphan admin-DB row).
- `hold`/`recall` — guarded UPDATE on exact prior status → concurrent double-hold / double-recall are clean no-ops; `MAX_HELD_PER_REGISTER` enforced; held excluded from revenue by status filter.
- `void` — guarded UPDATE on exact pre-read status (double-void safe); blocks void when a return already exists (no double-reversal); atomic outbox inserts for GL reversal + inventory restock; serials released atomically; draft-void emits nothing. Combined with the shipped `runDurableGated` durability, async-relief failures now dead-letter LOUDLY (no silent gap like the pre-fix #17 casualties).

**Recon SQL note:** GL tables are `journal_entries` + `journal_entry_lines` (not `journal_lines`); join key `source_document_type='pos'` (lowercase), `source_document_id = transaction.id`. Tenant accounts: 1112 Cash Register, 4110 Product Sales, 4200 Sales Returns, 5100 COGS, 1141 Merchandise Inventory.

**Verdict:** submodule 02 data-tie-out invariants all pass on the live dataset. No code fix required this pass (the one CRITICAL was already fixed + backfilled). Remaining work is the founder's manual UI run (hold/recall/void have zero live rows — created in the guide) + the open non-blocking items below.

---

## ✅ Submodule 01 — Register & Session — SIGNED OFF (2026-07-04)

Live-tested on prod-test tenant Al Asala (KWD 3dp). All register-management + shift open/close + close-reconcile paths pass after the fixes below. Register-settings fully redesigned (Registers list + detail drawer, mirroring legal-entities). Commits: 574c576f · bf1ffbbc · 3eee0a6b (+ payment/receipt fixes 3d2eb4ee · 728b6406 verified incidentally).

Findings resolved this submodule: #4 (dark dialogs), #7 (dup helper text), #9 (close-dialog scroll), #17 (settings UI redesign), #18 (auto-code), #19 (float 0.000), #20 (single inline error), #21 (deactivate open-shift guard + TOCTOU), #22 (stale close overlay), #23 (opening-float decimals). Structural DB invariants confirmed at baseline.

**Deferred (need Manager user + approval PIN + 2nd cashier — SoD batch):**
- Manager-approval-on-large-discrepancy at shift close.
- Cross-cashier "you already have an open shift" (single-cashier tenant today).
These carry into a dedicated SoD/RBAC test pass (with submodule that touches PIN approvals).

**Open non-blocking:** #1 (grandTotal DB CHECK, LOW), #16 (verify close server-authoritative — now shows "live from server", re-confirm), #31 (customer-attach affordance for On Account — MEDIUM, likely a build), #32 (WhatsApp in reprint dialog, LOW).
