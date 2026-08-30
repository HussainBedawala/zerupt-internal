# Test users & roles (created 2026-08-26)

Created through the real UI (Settings > Roles, Settings > Members), username route, no email.
**Staff login link:** `http://gulf-auto-parts.localhost:3000`
**Password for all three:** `Zerupt.Test@2026`

## Permission / branch matrix (verified in DB)

| Username | Role | Perms | Branch access | Purpose in testing |
|---|---|---|---|---|
| `cashier1` | Cashier | 19 | **Fahaheel only** (all_branches=false) | Narrowest role. Must see POS only, and only Fahaheel data. |
| `accountant1` | Accountant | 59 | **ALL** (all_branches=true) | Money role, no POS. Tests cost/GL visibility across branches. |
| `storekeeper1` | Viewer | 72 | **Al Rai only** (all_branches=false) | Read-only. Must not be able to mutate anything. |
| (owner) `anonymator8@gmail.com` | Owner | bypass | implicit all | Baseline. Bypasses RBAC, so NOT useful for gate testing. |

Role composition verified in `role_permissions`:

| Role | total | pos.* | accounting.* | cost-related |
|---|---|---|---|---|
| Cashier | 19 | 10 | 1 (`accounting.paymentaccount.list` only) | 0 |
| Accountant | 59 | 0 | 39 | 1 |
| Viewer | 72 | 5 | 11 | 2 |

## What each user is EXPECTED to prove
1. **cashier1** — nav shows POS (+ minimal inventory/customer reads), NOT accounting/purchase/reports/settings.
   Branch switcher must offer ONLY Fahaheel (no "All branches", no other branch).
   Every list must contain Fahaheel data only. No cost or margin column anywhere.
2. **accountant1** — accounting + reports reachable, POS NOT reachable. Can see all 4 branches.
3. **storekeeper1** — can view but every create/edit/delete/void action must be absent AND
   refused server-side. Branch switcher must offer ONLY Al Rai.

## Critical rule for this phase
UI hiding is NOT proof. For each denied action, ALSO hit the API directly as that user and
confirm the backend refuses (403), not just that the button is missing. A hidden button with an
open endpoint is a security hole, not a passing test.

## Approval PINs set (Wave E, 2026-08-29, for reversal-path testing)

The tenant shipped with **zero non-Owner roles holding `settings.approvalpin.manage`**
(Owner/Cashier/Accountant/Viewer are the only roles seeded; the permission lives only in the
"Manager" role TEMPLATE, which was never instantiated for this tenant). This meant, before this
session, NO user except the Owner could ever set an approval PIN through the product — the
distinct-approver SoD control was unusable by anyone but the Owner. See CRITICAL-PIN-1 in
`06-sales-reversals.md`.

Worked around entirely through the product (Settings > Roles & Permissions > Create role >
Manager template > Settings > Members > Invite user):
- Created role **"ZZTEST Manager"** (cloned from the built-in Manager template, 148 permissions,
  includes `settings.approvalpin.manage` + `sales.invoice.void` + `sales.refund.post` etc).
- Invited user **`zztestmgr1`** / `Zerupt.Test@2026`, role ZZTEST Manager, all branches.
- Owner `anonymator8@gmail.com` set PIN **135790** via Settings > Approval PINs.
- `zztestmgr1` logged in and set PIN **246810** via the same self-service screen.
- Verified in DB: `select user_id, updated_at from user_approval_pins` returns exactly these 2
  rows, both dated 2026-08-29.
- `accountant1` was tried first and get blocked: the Approval PINs settings page renders
  "Not available for your configuration" for accountant1 — misleading copy, real cause is the
  missing `settings.approvalpin.manage` grant, not plan/country (see CRITICAL-PIN-1/MEDIUM-PIN-2).

Use `zztestmgr1` / `Zerupt.Test@2026` (PIN 246810) as the distinct approver for any future SoD
testing; owner PIN is 135790.
