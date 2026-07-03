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
