# Residual POS/UX closeout — triage + fixes

Session scope: PERM-005, ROLE-004, SHELL-002, PACK-004, and the POS-0xx / SESSION items listed
in the task brief. Method: triage every item against LIVE code (and DB where relevant) BEFORE
fixing anything; fix what verified TRIVIAL; escalate what is SUBSTANTIAL.

No live browser session was used this pass (gstack browse was not invoked) — every CONFIRMED
verdict below rests on reading the code path end to end (server permission gates, DB
constraints/rows, and — for the two items actually changed — a deliberately-broken/restored
test). Where that is not sufficient evidence (a UI rendering claim that needs eyes on the
screen), the item is marked SUSPECTED rather than CONFIRMED, per the method rules.

## Triage table

| ID | Classification | Evidence |
|---|---|---|
| PERM-005 | STILL OPEN → FIXED this session | `/inventory/items` and `/accounting` had no `PermissionGate`; a denied user's data query threw straight into the generic `ErrorState` 403 path. Wrapped both panels in the shared `PermissionGate` primitive. |
| ROLE-004 | ALREADY FIXED (busy state) | `roles-panel.tsx` threads `createMutation.isPending` into `role-dialog.tsx`, which disables the submit button and shows a `Loader2` spinner (`role-dialog.tsx:609-610`). `team-panel.tsx` threads `inviteMutation.isPending` into `invite-user-dialog.tsx`, same pattern (`invite-user-dialog.tsx:865-870`). Both busy states are wired end to end. (The 9.2s/11.3s timing itself was already flagged by the brief as likely Neon-Singapore latency, not re-measured this session — not a live finding either way.) |
| SHELL-002 | SUSPECTED-stale (unchanged from prior triage) | Re-read `branch-switcher.tsx` (collapsed variant shows full `${name} · ${code}` in a tooltip; expanded uses `SelectValue w-full`) and `top-bar.tsx`'s `BranchIndicator` (`rounded-full border`, `shrink-0`, no `max-width`/`truncate`, renders name only — no code to cut off). Neither reproduces "cuts the branch NUMBER in ar" in the current code. Not independently re-verified live in-browser this session (budget) — same caveat the prior triage left. |
| PACK-004 | STILL OPEN — SUBSTANTIAL, escalated | Read `promotion-form-dialog.tsx` (655 lines) end to end and `promotions-types.ts` — there is genuinely no cost-comparison anywhere in the promotion form. Building a below-cost WARNING (never a hard block, per the established split) requires: (1) resolving each target item's cost (gated behind `inventory.cost.view`, the same permission POS-004/SAL-BE-002 strip on), (2) computing the discounted sell price per promotion type (percent-off / fixed-off / fixed-price, each with different arithmetic), (3) a new UI affordance surfaced per-target or in aggregate. This is a real feature, not a one-liner — escalating with the shape above rather than shipping a partial/wrong margin calculation. |
| POS-001 (re-scoped) | ALREADY FIXED | `create-register-dialog.tsx`: `emptyValues()` seeds `defaultCashFloat: ""` (not `"0.00"`), with an explicit comment explaining exactly this defect and its fix; a `useEffect` reformats to `getFloatDecimals(branchCurrency)` once the branch resolves, only while the field is untouched (`floatTouched`). Confirmed by reading the full flow. |
| POS-003 | ALREADY FIXED (both halves) | Reveal button: `disabled={counted === null}` in `shift-close-panel.tsx` — cannot reveal before a count is typed (comment explicitly names this as the fixed HIGH-POS finding). Expected-cash formula (`pos-shifts.service.ts:948-1055`, `computeCashComponents`): `expectedCash = openingFloat + cashSales − cashRefunds − payOuts + payIns` — cash movements (`posCashMovements`, pay_in/pay_out) ARE included via a real query (`loadCashMovementGroups`/`computeCashComponents`), not excluded. |
| POS-004 | Second body found and FIXED this session | The online path (`pos-transactions.service.ts` `buildDetail`/`toLineResponse`) already strips `costAtSale` behind `inventory.cost.view` (comment: "CRIT-POS-01"). But the OFFLINE-SYNC replay funnel — `pos-sync.mappers.ts`'s `buildTransactionDetail`/`toLineResponse`, reachable via `POST tenant/pos/sync/transactions` under `pos.transaction.create` (which Cashier holds without `cost.view`) — unconditionally returned `costAtSale` with no gate at all. Fixed by threading `canViewCost` (resolved via `PermissionService.hasPermission(..., ["inventory.cost.view"], ...)`, fail-closed default `false`) through `pos-sync.service.ts`'s three call sites into the mapper, mirroring the online-path shape exactly. |
| POS-005 | ALREADY FIXED | `usePosShortcuts` handlers in `register-shell.tsx` gate `onHold`/`onRecall`/`onPay` on `phase === "build" && overlay === "none"`, with a comment explicitly naming this as the fixed "HIGH-POS finding: shortcuts fire through open dialogs." `onCancel` deliberately skips the guard so Escape still closes overlays. |
| POS-007 | ALREADY FIXED (real DB CHECK, contra hardening-log doubt) | `packages/db/src/schema/pos.ts:565` — `pos_transactions_grand_total_identity_check`, a real Postgres CHECK constraint recomputing the grand-total identity with a 0.000001 tolerance. Confirmed the constraint EXISTS in the live Gulf Auto Parts DB: `select conname from pg_constraint where conname='pos_transactions_grand_total_identity_check'` returned one row. The brief's "hardening log wrongly claims it shipped" premise is stale — it did ship, and it is live. |
| POS-008 | ALREADY FIXED | `pos-approvals.controller.ts`'s `verify` endpoint carries `@Audited("PosApproval")`, with an inline comment ("MED-POS-02") explicitly documenting this exact fix and why `entityId` resolves to "unknown" for this endpoint (no natural entity — the response is a signed token). No live `PosApproval` audit rows exist yet in the DB (no discount-approval flow has been exercised this session — expected, not a defect). |
| POS-009 | ALREADY FIXED | `register-shell.tsx:148-167` resolves `cashierLabel` from `registerOverviewQuery.data?.openShift?.cashierId` (the SHIFT's server-authoritative cashier), falling back to the signed-in user ONLY before the overview has loaded. Comment explicitly documents the old bug ("the header used to lie about who the cashier is") and the fix. |
| POS-012 | WITHDRAWN (architecture, not a bug) | The POS offline pipeline is "local-first" BY DESIGN (`use-complete-sale.ts` header comment): every sale — online or offline — is written to a local IndexedDB queue first via `enqueue()`, then drained immediately by the sync engine when reachable (`use-sync-engine.ts`: "drains immediately when connectivity becomes 'online'... once on start"). The UI's "Offline" pill is driven by a deliberate 3-consecutive-failed-ping monitor (`connectivity.ts`), explicitly NOT trusting raw `navigator.onLine` ("window online/offline events are treated only as hints... never trusted on their own"). So a divergence between the pill and `navigator.onLine` is intentional (server-reachability is the real signal, not the OS network-interface flag), and it does not "route an online sale through the offline queue" — ALL sales go through that queue, then sync immediately if actually reachable. Re-classifying from SUSPECTED to WITHDRAWN with the architecture as evidence. |
| POS-013 | STILL OPEN — partially fixed, remainder is FRICTION-severity, not attempted | `cart-line-row.tsx` already has Delete-to-remove-line and ArrowUp/ArrowDown qty-change shortcuts (with `aria-keyshortcuts`). No shortcut exists yet for discount entry, exact-cash tender, or complete-tender in `pay-surface*.tsx`. Lowest severity in this batch (FRICTION) and not in the task's explicit priority-fix list — left open, recommend a follow-up pass scoped to the pay surface only. |
| POS-014 | ALREADY FIXED (same root cause as the live-verified POS-025) | `sale-builder.ts`'s `assertSalePayable` has an explicit comment documenting the exact old bug ("used to hard-block the 'Confirm zero-amount sale' button unconditionally, making it a button that could never work") and its removal — a zero-total cart with zero payment rows now passes the underpayment check (`0 >= 0`). Confirms the scoreboard's own hint that POS-025 (already live-verified FIXED) closed this from a different layer. |
| POS-015 | ALREADY FIXED; class-swept and lint-guarded this session | `category-filter-bar.tsx` already imports and uses `useLocalizedName()` from `@/lib/localized-name`, not `primaryText`. Repo-wide grep for `primaryText` importers found exactly two other files: `general-ledger-table.tsx` (imports `primaryDescription`/`secondaryDescription`, a different, audit-grade-appropriate export — no violation) and `features/print/**` (legitimate — printed documents bind to the document language, per the print CODEMAP rule, never the UI locale). No other operational-component leak found. Added the requested CLASS fix: an ESLint `no-restricted-imports` rule (`apps/web/eslint.config.js`) forbidding `primaryText` imports from `@/lib/bilingual-name` everywhere except `src/features/print/**`, with a message pointing at `useLocalizedName`. |
| POS-016 | ALREADY FIXED | `register-shell.tsx` maintains ONE `lastChangeDue` state, set exclusively via `PaySurface`'s `onSaleCompleted` callback (`handleSaleCompleted`), which is what feeds `usePosBroadcast`'s `changeDue` argument — the customer display and the receipt now read the same value. Comment explicitly documents the old two-sources-of-truth bug and the fix ("Root cause of the old bug: this used to watch the pos-store's `lastSale`..."). |
| SESSION | Not reproducible, no obvious cause found; left recorded | Read `auth-provider.tsx`'s `onAuthStateChange` handler — `INITIAL_SESSION`/`SIGNED_IN`/`TOKEN_REFRESHED`/`SIGNED_OUT` are all handled per Supabase's documented pattern, with correct Sentry/PostHog identity resets on sign-out. No obvious defect (double-listener, missing debounce, race on refresh) found in a code read. Per the task's explicit instruction, did not chase this further (intermittent, not reproducible on demand). |

## What was fixed

### 1. POS-004 sweep — offline-sync replay was a second leak of the exact defect class

**Files:** `apps/api/src/pos/sync/pos-sync.mappers.ts`, `apps/api/src/pos/sync/pos-sync.service.ts`

- `pos-sync.mappers.ts`'s `toLineResponse`/`buildTransactionDetail` now take a `canViewCost`
  parameter (default `false`, fail-closed) and strip `costAtSale` identically to the already-fixed
  online path.
- `pos-sync.service.ts`'s three call sites (`syncTransaction`'s idempotent-existing branch, its
  unique-race-backstop branch, and its post-commit success return) now resolve
  `PermissionService.hasPermission(cashierId, ["inventory.cost.view"], db)` and pass the result
  through. `buildTxnDetail`'s other caller (returning a held/void detail elsewhere) was left at its
  existing default of `false` since no acting user is threaded there — fails closed rather than open.

**Pin:** new `apps/api/src/pos/sync/pos-sync.mappers.spec.ts` (3 tests: default-false strips,
explicit-false strips, explicit-true includes). Also updated the pre-existing
`pos-sync.service.spec.ts` "idempotent replay skips permission check" test, which asserted
`hasPermission` was NEVER called on replay — that assertion was true only because the leak
existed; now it asserts the price-override permission specifically is not re-checked on replay,
while the cost.view check IS (POS-004 sweep, on every response including replay).

**Deliberate break:** reverted `toLineResponse` to unconditionally return `costAtSale` — both the
new default-false and explicit-true-vs-false tests failed as expected (`expect(received).not
.toHaveProperty(path)` — received `"7.500"`). Restored; re-ran clean: `pos-sync.mappers.spec.ts`
3/3, `pos-sync.service.spec.ts` 83/83, whole `pos-sync` fragment 166/166.

### 2. POS-015 class fix — ESLint guard + audit

**File:** `apps/web/eslint.config.js`

Added a `no-restricted-imports` block (scoped to everywhere except `src/features/print/**`)
forbidding `primaryText` from `@/lib/bilingual-name`, with a message pointing callers at
`useLocalizedName`. Swept the whole app for other importers (`general-ledger-table.tsx`,
`bilingual-name.tsx` — neither imports `primaryText` itself) — no other violation found.

**Deliberate break:** inserted `import { primaryText } from "@/lib/bilingual-name";` into
`category-filter-bar.tsx` — `npx eslint` flagged it with the exact guard message. Restored;
re-ran clean (no errors).

### 3. PERM-005 — graceful degrade via the shared PermissionGate primitive

**Files:** `apps/web/src/features/inventory/components/items-list-panel.tsx`,
`apps/web/src/features/accounting-overview/components/accounting-overview-panel.tsx`,
`apps/web/messages/{en,ar}/inventory.json`, `apps/web/messages/{en,ar}/accounting.json`

Both panels' exported component is now a thin wrapper: `PermissionGate` (already-landed
`components/permission-gate.tsx`, keyed `!isSuccess` not `isLoading` per its own header) gates on
the SAME permission the backend `@RequiresPermission` enforces (`inventory.item.list` /
`accounting.account.list`), with new `list.noPermission.{title,body}` / `overview.noPermission
.{title,body}` copy in en+ar. The original body was renamed to an `*Inner` component rendered only
once the gate resolves `allowed`.

**Pin:** new `apps/web/src/__tests__/perm-005-graceful-degrade.test.ts` — a structural grep-pin
asserting both files import `PermissionGate` and pass the correct `permission` prop (the render
behaviour of the gate itself is already exhaustively covered by
`components/__tests__/permission-gate.test.tsx`, so this test only guards against the exact
regression shape of a screen quietly dropping its gate on a future refactor).

**Deliberate break:** changed the `ItemsListPanel` permission prop to a wrong key
(`inventory.itemCreate`) — the pin test failed on the regex match. Restored from backup, diffed
clean, re-ran: 2/2 pass.

## Verification run

```
apps/api: npx tsc --noEmit                          → clean (0 errors in files this session touched)
apps/api: npx jest pos-sync --no-coverage            → Test Suites: 6 passed, 6 total; Tests: 166 passed
apps/api: pnpm --filter @zerupt/api build             → clean (nest build, no errors)
apps/web: npx tsc --noEmit                            → clean
apps/web: pnpm --filter @zerupt/web i18n:check        → "Translation check passed. All locales are in sync."
apps/web: npx vitest run perm-005-graceful-degrade    → 2/2 pass
apps/web: npx eslint <category-filter-bar.tsx>        → clean (guard verified to fire on deliberate break, see above)
```

**API restarted:** yes. Rebuilt (`pnpm --filter @zerupt/api build`), confirmed the new symbol
("POS-004 sweep") present in compiled `dist/pos/sync/pos-sync.mappers.js` (2 occurrences) and
`dist/pos/sync/pos-sync.service.js` (1 occurrence) — not just checking `dist/main.js` mtime per
the method rule. Killed the old listener on :3001, restarted with
`nohup node --enable-source-maps dist/main`. `/api/v1/health` returns `status: "error"` with the
ONLY failing check being `email_config` (no Resend key configured) — normal on dev per the brief,
not a finding.

**Ledger identity:** `0.000000` before this session's writes (all of them were source-code edits;
no live document/transaction was created) and `0.000000` confirmed again after restart. No
`ZZTEST` documents were created — `_documents-created.md` is unchanged.

**Live browser confirmation:** NONE this session. Every CONFIRMED verdict above rests on reading
the server-side permission gate, the DB constraint/row state, or a deliberately-broken-then-restored
test — not on an interactive browser check as a specific user persona. This is flagged explicitly
per the method rules rather than silently omitted; a follow-up pass should live-verify PERM-005's
two new denial screens (as `storekeeper1`) and re-check SHELL-002 (ar, narrow viewport) before
either is closed with full confidence.

## Classification counts

- **ALREADY FIXED (verified this session, no code change needed):** 12 — ROLE-004, POS-001,
  POS-003, POS-005, POS-007, POS-008, POS-009, POS-014, POS-015 (core defect; class-sweep added
  new value), POS-016, and (partially) POS-004's online half.
- **WITHDRAWN:** 1 — POS-012 (by-design offline-first architecture, not a bug).
- **SUSPECTED-stale (unchanged from prior triage, not independently re-verified live):** 1 —
  SHELL-002.
- **FIXED this session (code changed, pinned, deliberately broken + restored):** 2 — PERM-005,
  POS-004 (second/offline-sync body). Plus a class-level guard added for POS-015 (eslint rule)
  even though the reported instance itself was already fixed.
- **STILL OPEN — substantial, escalated (not attempted):** 1 — PACK-004 (below-cost warning
  needs new cost-lookup + per-promotion-type discount math; genuinely a feature, not a one-liner).
- **STILL OPEN — partial, low severity, not attempted:** 1 — POS-013 (discount/exact-cash/
  complete-tender shortcuts; FRICTION severity, qty/remove-line already fixed).
- **Left recorded, not chased further per explicit instruction:** 1 — SESSION (intermittent,
  not reproducible; no obvious cause found in the auth-provider code path).

## Anything left, and why

| ID | Left because |
|---|---|
| PACK-004 | Substantial: needs a cost-lookup (behind `inventory.cost.view`) plus per-promotion-type discount arithmetic before a below-cost WARNING can be computed honestly. Shipping a partial/approximate version risks a wrong margin signal on a money-shaped surface. Recommend a dedicated pass with accounting-reviewer input on which cost basis (WAC vs. last-cost) the warning should use. |
| POS-013 (remainder) | FRICTION severity (lowest tier), not in the task's explicit priority-fix list, and the qty/remove-line half is already shipped. A full pay-surface shortcut scheme (discount, exact-cash, complete-tender) is a self-contained follow-up. |
| SHELL-002 | Prior triage already traced both candidate components and found no reproducing code path; this session did not add a live-browser check (budget), so it stays SUSPECTED-stale rather than being closed outright. |
| SESSION | Intermittent, not reproducible on demand — per the task's explicit instruction, not chased beyond a one-pass code read of the auth listener (no obvious defect found). |
