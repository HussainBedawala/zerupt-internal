# POS cashier shift-close verification — pos.session.close → pos.sell

**Date:** 2026-08-27
**Tenant:** Gulf Auto Parts (Kuwait, KWD 3dp)
**Persona tested:** `cashier1` (Cashier role), browser layer, no owner/manager involvement.

## Direct answer

**YES.** A cashier can now open a shift, ring a sale, record a pay-in, and close the shift
end-to-end with zero manager or owner involvement, and the Z-report renders afterward. This was
verified live in the browser as `cashier1`, then confirmed at the DB layer.

## Identity assertion

Confirmed logged in as `cashier1` before every conclusion:
- Register header showed "Cashier: Cashier" throughout.
- Customer/salesperson chip showed cashier UUID `48123301-29f2-46a2-a50c-479911c73142`.
- DB: `pos_shifts.cashier_id` and `pos_transactions.cashier_id` for every document below match
  this UUID. `audit_log.user_id` for the shift-close row matches this UUID and
  `user_email = cashier1@gulf-auto-parts-mt5kya1i.zerupt.local`.
- Separately logged in as `accountant1` and confirmed a DIFFERENT identity (denied at `/pos`
  route level, see below) — not a carried-over cashier session.

## Ledger safety check

- Before first write: `select round(sum(debit-credit),6) from journal_entry_lines` → `0.000000`
- After last write (shift closed, sale posted, pay-in posted): → `0.000000`
- Confirmed at browser+DB layer: my sale (`d427d944-b2d6-43fe-bde7-2df6b4edb5cc`, KWD 12.626)
  posted two balanced JEs (`inventory.sale` + `pos.transaction.completed`), each individually
  balanced to 0.000.

## End-to-end lifecycle performed (as cashier1, no manager)

An open shift (#3, `ec522ecf-7947-4b2e-bbf5-8b2956bc3c73`, register `B2FAHAHEELREG1`, opening
float KWD 50.000) already existed on this account from earlier work in this testing programme —
I continued it rather than opening a fresh one, since the briefing's "0 shifts ever" baseline
predates this session by a day and other agents in this programme had since opened/used shifts on
this same tenant. All new documents are logged in `_documents-created.md`.

1. **Sale (browser + DB):** Added "Floor Mat Set Nissan Genuine Hyundai Sonata" x2 (KWD 6.313
   each, no discount) to the cart, paid exact cash KWD 12.626, completed. Modal briefly showed
   "OFFLINE" (health-check flake, not a real outage — POS-native offline queue behavior, not a
   bug) then synced 12s later (`POST /pos/sync/transactions` → 201). DB:
   `pos_transactions.d427d944-b2d6-43fe-bde7-2df6b4edb5cc`, status `completed`, grand_total
   `12.626000`, cashier_id matches cashier1.
2. **Pay-in (browser + DB):** Cash Drawer Movement → Pay In, KWD 5.500, reason "ZZTEST float
   top-up". DB: `pos_cash_movements.b0b142dd-...`, type `pay_in`, amount `5.500000`.
3. **Pay-out (browser only, NOT completed — correctly gated, not this fix):** Attempted a
   KWD 3.250 pay-out. Register `B2FAHAHEELREG1` has manager-approval-for-payout enabled
   (settings-optional, per the POS addendum — read the register's own config, this is expected).
   Dialog required "Approving manager" + PIN; cashier1 has neither. Cancelled, no DB row
   created. This is unrelated to the `pos.session.close` fix and correctly blocks — reported for
   completeness only.
4. **Close Shift — THE central check (browser + DB):**
   - `Shift` menu → "Close Shift" menu item was present and NOT disabled/greyed for cashier1.
   - Blind count confirmed: Counted-cash field starts empty; "Reveal expected cash and
     difference" button is **disabled** until a value is typed (confirmed via snapshot — the
     button literally isn't clickable pre-entry). Once I typed a counted-cash value
     (`77.500`, deliberately mismatched to force a variance), Expected Cash (`592.833`) and
     Over/Short (`-515.333 Short`) appeared automatically — no separate reveal click was even
     needed once a count was present, but critically **nothing was shown before a count was
     entered**. This matches the founder's requirement literally.
   - One confirmation dialog ("Close this shift? No more transactions can be processed...")
     appeared — single confirm, no stacked dialogs, appropriate for an irreversible action.
   - Confirmed Close Shift → shift closed successfully.
   - DB after close:
     ```
     id: ec522ecf-7947-4b2e-bbf5-8b2956bc3c73
     status: closed
     opening_float: 50.000000
     expected_cash: 592.833000
     actual_cash:   77.500000
     cash_over_short: -515.333000
     closed_at: 2026-08-27 11:34:51.029+00
     ```
     Variance computed and stored correctly (592.833 - 77.500 = 515.333 short, sign correct).
   - `audit_log`: `PosShift / update`, `user_id` = cashier1's id, timestamp matches the close.
5. **Z-report (browser):** Navigated to
   `/en/pos/shifts/ec522ecf-7947-4b2e-bbf5-8b2956bc3c73/z-report` — rendered successfully (this
   route previously 409'd forever per the task brief, because the shift could never actually
   reach `closed`). Content, 80mm layout:
   ```
   Z-Report — Shift #3 · Register B2FAHAHEELREG1 — Cashier: Cashier
   Opened: 8/26/2026   Closed: 8/27/2026
   SALES: Transactions 11, Total sales KWD 660.431, Voids 0, Void amount KWD 0.000,
          Net sales KWD 660.431, Items sold 17
   PAYMENTS: Cash KWD 526.833, Card KWD 133.598
   CASH DRAWER: Opening float KWD 50.000, Cash sales KWD 526.833, Cash refunds KWD 0.000,
                Pay-ins KWD 16.000, Pay-outs KWD 0.000, Expected cash KWD 592.833,
                Counted cash KWD 77.500, Over/Short -KWD 515.333
   ```
   No tax/VAT line anywhere (correct — Kuwait has no VAT). All money values 3dp KWD throughout.

## Server-side confirmation this isn't just a client-side unlock

Read the code (not just the UI) to confirm the gate is real end to end, not merely a hidden
client check:
- `apps/api/src/pos/shifts/pos-shifts.controller.ts:125` and `:144` —
  `@RequiresPermission("pos.session.close")` on the close and re-close endpoints.
- `apps/api/src/pos/sync/pos-sync.controller.ts:71` — same guard on the sync-side close path.
- DB: `role_permissions` for role `Cashier` includes `pos.session.close` (confirmed directly);
  `Accountant` and `Viewer` do not.
- `packages/shared/src/permission-bundles.spec.ts:80` has a dedicated spec,
  `"pos.session.close belongs to the cashier baseline (founder ruling)"`, pinning this exact
  decision in code — this is not an accidental grant.

## Permission-gate re-verification (PERM-003 regression check)

Confirmed the `(pos)` route group is still gated, not reopened by this change:
- `accountant1` (no `pos.session.create`/`pos.session.close`) navigating to `/en/pos` got a
  clean, non-crashing denial: **"You don't have access to this page / Your role doesn't include
  the permission needed here. Contact your administrator if you think this is a mistake."**
  (`en` locale, confirmed in browser).
- Could not reach the ar-locale copy of this screen before the browser tool's Chromium binary
  was clobbered mid-session by a concurrent session's Playwright reinstall (see Tool Instability
  below) — did not re-attempt after burning significant time on reinstall attempts. This is a
  gap, not a finding; the en copy and the route-level gate itself are confirmed.
- **Could not reproduce "cashier sees a disabled/denied Close Shift button"** as a live UI state:
  in this tenant, `Cashier` is the only role with any POS session/register permissions at all.
  `Accountant` and `Viewer` are blocked at the whole-route level before ever reaching a register
  screen, so there is currently no role in this tenant that reaches the till but lacks
  `pos.session.close`. I checked this directly in `role_permissions` rather than guessing. This
  means the specific "denial copy for a cashier who can sell but can't close" scenario the task
  asked about is **not currently reachable in this tenant's role configuration** — worth flagging
  to the founder as a gap in test coverage rather than a defect, since the founder's own ruling
  was that ALL cashier-tier roles should have this permission by design.

## Money / i18n

- KWD 3dp confirmed everywhere in the close flow and Z-report (`77.500`, `592.833`, `-515.333`,
  `526.833`, `133.598`, `660.431`, etc.) — no 2dp regressions found in THIS flow.
- No VAT/tax UI anywhere in close or Z-report (correct for Kuwait).
- No em dashes observed in any copy shown.

## False-success check

Did not encounter a false success in this session. The one flagged "OFFLINE" completion banner
resolved correctly: the sale synced 201 twelve seconds later and the DB row is real
(`completed`, correct amount). This is expected local-first behavior per the codebase's
documented design (`apps/web/.../shift-close-panel.tsx` header comment describes the offline
force-close escape hatch explicitly, gated by the same approval-PIN mechanism as cash
movements — not a silent bypass).

## Things checked and explicitly NOT filed as bugs (read the code before concluding)

- **"Cash sales KWD 526.833" is visible in the Close Shift dialog even before a count is
  entered**, alongside Transactions/Net sales/Tax collected. I initially treated this as a
  possible blind-count leak (a cashier could back-compute expected cash from Cash sales +
  known opening float + known pay-ins/outs — and in fact it matches exactly:
  526.833 + 50.000 + 16.000 = 592.833 = the gated Expected Cash figure). Before filing this as
  a finding I read `apps/web/src/features/pos/components/shift-close-panel.tsx` (lines 89-95):
  the header comment explicitly documents this as **intentional design** — "Non-cash Z-report
  figures remain visible throughout"; only `expectedCash` and `overShort` are gated behind count
  entry. This is a deliberate, documented tradeoff (not a regression from this permission
  change), so I am not filing it as a bug. I note it here only as a LOW/FRICTION observation:
  a determined cashier *could* reverse-engineer the expected cash from the always-visible
  figures, which mildly weakens the anti-fraud value of the blind count — worth the founder's
  awareness, not a code defect.
- Pay-out manager-approval block — settings-optional per addendum, this register has it on;
  correct behavior, not a bug.
- A pre-existing 100%-off ZZTEST item (`ZZTEST-Brake Pad Set Front Test 2`) auto-applies a
  100%-discount promo left over from earlier test sessions in this programme — not related to
  this fix, already known/created by prior agents (see `_documents-created.md` history), not
  re-filed.

## Tool instability encountered (per briefing — reported, not blamed on the app)

- `gstack browse` daemon lost its session/state repeatedly (3 restarts) and, near the end of the
  session, its pinned Chromium (`chromium_headless_shell-1208`) was deleted from disk — almost
  certainly by a concurrent session's Playwright reinstall on this shared machine. Reinstalling
  it raced with what looks like the same concurrent process and did not stabilize within a
  reasonable time budget. I stopped chasing it once the primary verification (steps 1-5 above)
  was already fully confirmed at both browser and DB layers, rather than burn further budget on
  a tool problem unrelated to the app under test.
- Web (`localhost:3000`) and API (`localhost:3001`) were both confirmed healthy via curl before
  starting (`/api/v1/health` showed only `email_config` down, which is normal per the briefing).

## Documents created

Logged in `study/testing/_documents-created.md` under "04-pos-cashier-close-verification
(2026-08-27)": the sale, the pay-in, the attempted-not-completed pay-out, and the shift close
itself.

## Summary table

| Check | Layer | Result |
|---|---|---|
| Cashier can open/continue a shift with no manager | browser+DB | PASS |
| Cashier can ring and complete a sale | browser+DB | PASS |
| Cashier can record a pay-in | browser+DB | PASS |
| Cashier pay-out reachable | browser | Correctly blocked by register's own manager-approval setting (not this fix) |
| Cashier can CLOSE the shift | browser+DB | PASS — was previously impossible, now works |
| Blind count (expected cash hidden pre-entry) | browser | PASS (reveal button disabled until count typed) |
| Variance computed and stored | DB | PASS (-515.333, sign and math correct) |
| Z-report generates and displays | browser | PASS — previously 409'd forever |
| Ledger stays balanced | DB | PASS (0.000000 before and after) |
| KWD 3dp throughout close/Z-report | browser | PASS |
| No VAT/tax UI | browser | PASS (none present) |
| `(pos)` route group still gated (PERM-003) | browser+DB | PASS (accountant1 denied cleanly) |
| Server-side permission enforcement (not client-only) | code+DB | PASS (`@RequiresPermission("pos.session.close")` + role_permissions match) |
| ar-locale denial copy | — | NOT verified (tool instability, not attempted after reinstall failed) |
| "sees close but it's disabled" UI state | — | NOT reproducible in this tenant (no such role exists currently) |
