# Browser verification — accountant1 — 2026-08-28/29

Logged in as `accountant1` at http://gulf-auto-parts.localhost:3000/en/login. Identity
re-confirmed throughout via `/en/settings/members/my-profile` (shows username "accountant1",
avatar initials "AC") and via role/permission lookups against the tenant DB (`Accountant` role,
5 active tenant members). Never logged in as owner.

Journal balance check before and after: `0.000000` both times (no writes made this session,
all findings gathered via read-only browsing + code + SQL).

---

## 1. Approvals are capability-derived — BLOCKED (for this role), code CONFIRMED-WORKING

accountant1 cannot open `/settings/organisation` at all: the page renders "Failed to load
organisation settings." Network capture shows the underlying call:

```
GET http://localhost:3001/api/v1/tenant/settings → 403
```

This is **by design**, not a bug: `apps/api/src/tenant-settings/tenant-settings.controller.ts`
gates `GET /tenant/settings` (the endpoint that returns `data` + `approvalCapability` together)
behind `@RequiresPermission("settings.tenant.read")`, and the controller's own doc comment
states explicitly: *"a permission... which neither a cashier nor an Accountant role holds"*.
Confirmed against the DB: `role_permissions` for the `Accountant` role lists
`settings.currency.read`, `settings.fiscal.read`, etc., but **not** `settings.tenant.read`.

So I cannot show the live JSON `approvalCapability` object as accountant1 — that requires a
role that holds `settings.tenant.read` (e.g. Owner/Manager), which is out of scope for this
pass. The denial itself is clean (styled error card + Retry button, no crash) — that satisfies
the "clean denial not a crash" checklist item.

**Verdict: BLOCKED as accountant1** (correct/expected access denial, not a defect). Code path
for the derivation itself is read in item 2/3 below and is correct.

## 2. Solo-shop collapse / derivation source — CONFIRMED-WORKING (via code + SQL)

`apps/api/src/tenant-settings/approval-capability.ts`:
```ts
export function deriveApprovalCapability(activeMemberCount: number): ApprovalCapability {
  const safeCount = Number.isFinite(activeMemberCount) ? Math.max(0, activeMemberCount) : 0;
  return {
    activeMemberCount: safeCount,
    minimumMembers: MINIMUM_APPROVAL_MEMBERS, // = 2
    available: safeCount >= MINIMUM_APPROVAL_MEMBERS,
  };
}
```
`tenant-settings.service.ts#getApprovalCapability` sources the count from the **admin DB**
`user_tenant_map` table filtered to `status = 'active'`, exactly the same source
`PinVerificationService.getTeamReadiness` uses — config never enters into it.

SQL against the admin DB for Gulf Auto Parts (`tenant_id = ce603a7c-9f94-4c89-8f48-8ebb84755e10`):
```
select status, count(*) from user_tenant_map where tenant_id=... group by status;
 active | 5
```
5 active members ≥ minimum 2 → `available` would be `true`. This is internally consistent
(derivation logic + DB state agree), though I could not independently pull the literal API
response as accountant1 (see item 1) to diff the two numbers side by side.

**Verdict: CONFIRMED-WORKING** — activeMemberCount = 5, minimumMembers = 2, derivation is
member-count-based, not config-based.

## 3. The write gate — CONFIRMED-WORKING (code read, not live-reproduced — honestly reported)

`tenant-settings.service.ts#updateSettings`:
```ts
const turningOn = approvalFlagsTurnedOn(data);
if (turningOn.length > 0) {
  const capability = await this.getApprovalCapability(tenantId);
  if (!capability.available) {
    throw new BadRequestException({
      code: APPROVALS_UNAVAILABLE_CODE,
      message: "You need at least two active team members before approvals can be switched on. "
        + "One person cannot approve their own work.",
      fields: turningOn,
    });
  }
}
```
Turning OFF is always allowed (escape hatch); only turning ON is gated. Since Gulf Auto Parts
CAN approve (5 active members), a live 400 is genuinely not reproducible without either
mutating real membership (forbidden) or a synthetic tenant, neither of which I did. Reporting
this as a **code-verified, not live-verified** finding, per the honesty requirement in the task.

**Verdict: CONFIRMED-WORKING (by code inspection only)**.

## 4. Warehouse pickers populate — MIXED: CONFIRMED-WORKING on some surfaces, CONFIRMED-BROKEN on others

DB ground truth for the branch-scoping trap (warehouse → branch join):
```
B1_AL_RAI_MAIN_SHOWROOM-MAIN    | Al Rai Main Showroom         | B1_AL_RAI_MAIN_SHOWROOM
B1_AL_RAI_MAIN_SHOWROOM_TR      | Transit                      | B1_AL_RAI_MAIN_SHOWROOM
WH1_B1                          | Shuwaikh Central Warehouse   | B1_AL_RAI_MAIN_SHOWROOM  <- looks like a different branch, is NOT
B2_FAHAHEEL_BRANCH-MAIN         | Fahaheel Branch              | B2_FAHAHEEL_BRANCH
B3_JAHRA_BRANCH-MAIN            | Jahra Branch                 | B3_JAHRA_BRANCH
B4_SALMIYA_SERVICE_CENTER-MAIN  | Salmiya Service Center       | B4_SALMIYA_SERVICE_CENTER
```

There are **two separate implementations** of "warehouse options for a picker" in the web app,
which is exactly the "same predicate exists twice, only one patched" failure class the briefing
warns about:

- `apps/web/src/features/locations/api/locations-queries.ts` → `useWarehouseOptionsQuery(branchId)`.
  Tries the permissioned `GET /tenant/warehouses` first, and on a 403 (Accountant lacks
  `settings.warehouse.list`) **falls back** to the permission-free
  `GET /tenant/warehouses/directory`. This is the fixed version (comment cites `PUR-L18`).
- `apps/web/src/features/inventory/api/inventory-queries.ts` → a **different function with the
  identical exported name** `useWarehouseOptionsQuery()`, taking **no** `branchId` argument,
  which calls `fetchWarehouses({isActive:true, limit:100})` directly against the permissioned
  `GET /tenant/warehouses` endpoint with **no fallback at all**.

Consumers importing the **locations** (fixed, fallback-aware) version — CONFIRMED-WORKING live:
- Purchase bill create (`/purchase/invoices/new`): network capture shows
  `GET /tenant/warehouses?...branchId=... → 403` then `GET /tenant/warehouses/directory → 200`.
  Branch field is locked/defaulted correctly ("Locked to the branch you are viewing").
- Reports → Stock Levels (`/en/reports/stock-levels`) Location filter: same 403→200 fallback
  pattern observed live; clicking the filter shows real names:
  `["All locations", "Al Rai Main Showroom", "Fahaheel Branch", "Jahra Branch",
  "Salmiya Service Center", "Shuwaikh Central Warehouse", "Transit"]` — correctly includes
  Al Rai's 3 warehouses under their real display names, no UUIDs, no cross-branch leak (this
  is company-wide by design for an unscoped "All locations" report filter — not a leak).

Consumers importing the **inventory** (broken, no-fallback, no-branchId) version —
CONFIRMED-BROKEN live for accountant1:
- Inventory → New Adjustment (`/inventory/adjustments/new`): "Location" combobox shows
  **"No matches"** with zero options. Network: `GET /tenant/warehouses?...→ 403` repeated, and
  **no** `/tenant/warehouses/directory` call ever fires (confirmed via network log — because
  the hook is called as `useWarehouseOptionsQuery()` with `branchId` always `undefined`, so the
  fallback's `enabled: !!branchId && primaryForbidden` is permanently `false`).
- Inventory → New Transfer (`/inventory/transfers/new`): same symptom, same root cause
  (`transfer-form-panel.tsx` calls `useWarehouseOptionsQuery()` from
  `../../api/inventory-queries`, no branchId, no fallback firing).
- Same broken import (confirmed by grep, not separately re-clicked live) also affects:
  `transfers-list-panel.tsx`, `transfer-edit-dialog.tsx`, `adjustments-list-panel.tsx`,
  `serial-numbers-list-panel.tsx`, `batches-list-panel.tsx`,
  `stock-counts-list-panel.tsx`, `stock-count-form-panel.tsx`, `stock-levels-panel.tsx`,
  `item-form-panel.tsx` — all import `useWarehouseOptionsQuery` from
  `apps/web/src/features/inventory/api/inventory-queries.ts` (the version with no fallback),
  so any of these screens will show an empty warehouse picker for a role without
  `settings.warehouse.list` (Accountant, Cashier per the code comment).

POS screen: I did not reach a POS warehouse picker live before the browse daemon became
unstable (see Method notes). Code check: `apps/pos/.../create-register-dialog.tsx` imports the
**fixed** `useWarehouseOptionsQuery(branchId)` from `features/locations`, so it is expected to
work the same way as the purchase/report surfaces above — SUSPECTED-WORKING, not personally
observed in-browser this session.

**Verdict: CONFIRMED-BROKEN (HIGH)** — Inventory Adjustment and Inventory Transfer creation
(and the other 7 inventory-feature call sites listed) are dead-ended for accountant1/cashier
roles: the "Location" field cannot be populated, blocking the whole flow. This is the exact
defect class ("permission-gated lookup failing silently") the task described as fixed — it is
fixed on the purchase/reports/sales/POS side (which import from `features/locations`) but the
identically-named duplicate on the inventory side was never migrated to the fallback pattern.

Fix shape (not applied — verification only): either delete
`inventory-queries.ts#useWarehouseOptionsQuery` and have all 9 inventory call sites import the
`locations` version with a real branchId (there is a current-branch value available from the
branch-switcher context on every one of these screens), or add the same 403→directory fallback
to the inventory copy. Given there are two functions with the identical name in different
modules, double-check the import path at each call site before assuming a fix landed.

## 5 & 6. No raw UUIDs / draft document numbers — CONFIRMED-WORKING everywhere checked

Grepped rendered `document.body.innerText` for the UUID pattern
(`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`) on:
- `/sales/invoices` (list, 322 rows including opening-balance rows `OB-OB_AR-0001-*`) — **zero
  matches**. Draft row rendered as: `Draft | Ahmad Al Mutairi 1 | 8/28/2026 | — | ... | 0.000 |
  0.000 | Draft` — a clean "Draft" placeholder in the number column, not a UUID.
- `/sales/invoices/{id}` detail for that same draft — header renders "Draft invoice" / "Draft"
  badge, no UUID anywhere in the body text (the UUID only appears in the URL, which is normal
  and not a UI leak).
- `/sales/credit-notes` (3 rows, 2 of them drafts) — **zero matches**. Draft rows show
  `Draft | — | Goods return | Draft | 12.345 | -` — "Draft" in the number column and `—`
  (placeholder) in the customer column, not a raw id.
- `/purchase/invoices` (bills list, 304 rows, includes `OB-OB_AP-0001-*` opening balances) —
  **zero matches**. All amounts render KWD to 3dp (`8,837.196`, `1.000`, `55.000`, etc.) —
  correct precision, no 2dp money bugs on this screen.

I was not able to reach the payments/receipts screen live before the browse daemon crashed
repeatedly (see Method notes) — did not personally verify that surface this session.

**Verdict: CONFIRMED-WORKING** on every screen I actually walked (sales invoices list+detail,
credit notes list, purchase bills list). **BLOCKED** (not reached) for payments/receipts.

## 7. Member names in pickers — CONFIRMED-WORKING (cross-checked against DB)

DB (admin DB `user_tenant_map` for Gulf Auto Parts, all 5 active members):
```
username     | full_name         | status
(blank)      | Hussain Bedawala  | active   <- owner, real name on file
cashier1     | cashier1          | active   <- no real name; full_name = username
accountant1  | accountant1       | active   <- no real name; full_name = username
storekeeper1 | storekeeper1      | active
zztestmgr1   | zztestmgr1        | active
```
Live UI observed on `/sales/invoices` (Salesperson column): rows show `accountant1` and
`Hussain Bedawala` verbatim — never a raw email, never blank. This matches the DB exactly: for
the 4 test accounts, `full_name` genuinely equals the username in the seed data (no separate
"real" name was ever set), so displaying `accountant1` **is** the correct fallback-chain
outcome (fullName happens to equal username here), not a bug. For the owner, the real
`full_name` "Hussain Bedawala" is shown.

Code confirms `resolveMemberDisplayName` (from `@zerupt/shared`) is wired through
`apps/web/src/lib/hooks/use-entity-map.ts`, which is the shared entity-name resolution hook
used by pickers/labels app-wide (imported by `member-display-name.ts` too).

I could not open a live approver picker: all seven `require*Approval` flags are OFF for this
tenant right now (`select require_payment_approval, ... from tenant_identity` → all `f`), so no
approval-gated document exists to surface an approver picker, and `/settings/members` itself is
gated off for accountant1 ("Not available for your configuration" — same permission-shape
denial as item 1, not investigated further as it's outside the 7 items). This part is
**BLOCKED**, not fabricated.

**Verdict: CONFIRMED-WORKING** (salesperson picker, cross-checked DB vs UI) for the part I could
reach; **BLOCKED** for the dedicated approver picker (no approval flag is on, no gated document
exists in this tenant state).

---

## Method notes / environment issues encountered

- The gstack browse daemon restarted/crashed unprompted several times mid-session (`Operation
  timed out: goto: Timeout 15000ms exceeded` followed by `[browse] Starting server...`), which
  dropped the authenticated session each time and required re-login. This cost time but did not
  change any conclusion above — every finding was re-verified against a fresh, confirmed
  accountant1 session (identity re-checked via `/settings/members/my-profile` after each
  re-login) before being recorded.
- Did not reach: POS warehouse picker (live), payments/receipts screens (item 5/6), live
  approver picker (item 7 — blocked by tenant config, not by time).

## Summary table

| # | Item | Verdict |
|---|------|---------|
| 1 | Approvals capability-derived (API JSON) | BLOCKED for accountant1 (403 by design — role lacks `settings.tenant.read`); derivation code CONFIRMED-WORKING |
| 2 | Solo-shop collapse derivation source | CONFIRMED-WORKING (code + SQL: 5 active members, threshold 2) |
| 3 | Write gate (`approvalFlagsTurnedOn`) | CONFIRMED-WORKING (code-verified only, not live-reproduced — honestly can't be, team can approve) |
| 4 | Warehouse pickers populate | **CONFIRMED-BROKEN (HIGH)** for Inventory Adjustment/Transfer (+7 more inventory sites) — duplicate unfixed `useWarehouseOptionsQuery`; CONFIRMED-WORKING for Purchase bill create + Stock Levels report filter; POS not reached (code suggests fine) |
| 5 | No raw UUIDs on screen | CONFIRMED-WORKING on sales invoices, credit notes, purchase bills; payments screen not reached |
| 6 | Draft document numbers | CONFIRMED-WORKING (list rows, detail page, credit notes) |
| 7 | Member names in pickers | CONFIRMED-WORKING (salesperson picker vs DB); approver picker itself BLOCKED (no approval flag on) |
