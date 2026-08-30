# Settings > Roles & Permissions — findings

Screen: `/:locale/settings/roles` · Tested as tenant Owner, branch B1.

---

## ROLE-001 — HIGH — Choosing a template SILENTLY OVERWRITES the role name you typed
**Reproduced deterministically, verified in the database.**

Steps: Create role -> type name "Storekeeper" -> type description "Stock handling, no money
visibility" -> click the "Viewer" template -> Next -> Create role.

Result in DB:
| Field | I typed | Saved as |
|---|---|---|
| name | **Storekeeper** | **Viewer**  <- clobbered by template |
| description | Stock handling, no money visibility | Stock handling, no money visibility (kept) |

So the template overwrites `name` but NOT `description`, which is doubly confusing: half your
input survives.

**Why it matters:** the template is meant to be a STARTING POINT for permissions, not a rename.
A shop owner creating "Front Desk" or "موظف الكاشير" from the Cashier template silently ends up
with a role called "Cashier". If they create two roles from the same template they get two roles
with the same name and no idea why. There is no warning and no undo.

**Correct behaviour:** if the name field is empty, prefilling it from the template is helpful.
If the user has already typed a name, NEVER overwrite it. (Same rule the description already
follows, so the two fields just need to agree.)

**Status:** FIX DISPATCHED

---

## ROLE-002 — MEDIUM — Raw i18n key paths rendered in the UI
Visible on the Permissions step as a module filter chip:
> `roles.modules.translation  1/1`

Console confirms three missing keys, in **both** locales:
- `roles.modules.translation`
- `roles.bundles.purchase.refund.label`
- `roles.bundles.purchase.refund.description`

Root cause: `PERMISSION_MODULES` in `packages/shared/src/permissions.ts:112-122` contains 8
modules including `translation` (a deliberate tiny module holding `translation.field.use`), but
`apps/web/messages/{en,ar}/roles.json` `modules` defines only 7. Same story for the
`purchase.refund` bundle.

**Status:** FIX DISPATCHED

---

## ROLE-003 — MEDIUM (systemic, process) — `i18n:check` cannot catch this class of bug
`pnpm --filter @zerupt/web i18n:check` passed clean while three referenced keys were missing,
because it verifies **ar/en parity**, not **existence**. A key absent from BOTH locales is
"in sync" and sails through.

This is why a raw key path reached a live screen. Any permission module or bundle added to
`packages/shared` without message keys will do the same again.

**Fix:** a guard test asserting every `PERMISSION_MODULES` entry and every permission bundle id
resolves to a message key in EVERY locale. Dispatched with ROLE-002 so the class is closed, not
just the instance.

**Status:** FIX DISPATCHED

---

## ROLE-004 — MEDIUM — Creating a role takes 9.2 seconds
Measured: `POST /api/v1/tenant/roles` -> 201 in **9,184ms**. The preceding
`GET /tenant/roles?take=100&skip=0` also took 4,656ms.

Nine seconds is long enough that a user will assume it failed and click again. Needs
investigation (materialising 72 permission rows should not cost 9s) AND, regardless of the
backend fix, the submit button must show a busy state and be debounced against double-submit.

**Status:** OPEN, needs investigation

---

## ROLE-005 — QUESTION — "19 selected" disagrees with the module chips
Bottom-left reads **"19 selected"**. The module chips read
Settings 0/10 · Accounting 0/7 · Inventory 1/6 · Point of Sale 1/4 · Sales 0/4 · Purchase 0/4 ·
Reports 0/4 · translation 1/1 — which sums to **3** selected out of 40.

Both numbers are probably "right" for different units (permissions vs permission groups), but
the user has no way to know that. Two totals on one screen that cannot be reconciled.
Needs a product call on what the chips should count, or a label change.

---

## ROLE-006 — OBSERVATION — A live tenant ships with NO operational roles
Before this test the tenant had exactly one role: **Owner (System), All permissions, 1 user**.
`role_permissions` was empty.

A shop that has just gone live must therefore hand-build every role before they can add a
single member. Given the "signup to live in under 2 hours" promise, consider seeding the
standard roles (Cashier / Manager / Accountant / Viewer) at go-live, since the templates that
would produce them already exist.

---

## Confirmed GOOD
- The create-role flow is a clean 2-step wizard (Details -> Permissions) with clear progress.
- Templates carry honest permission counts: Cashier 19, Manager 148, Viewer 72, Accountant 59,
  Refund approver 18, plus Custom.
- Permission copy is plain-language, not key names: "Manage staff and their access",
  "See staff and roles, read only", "Set your own approval PIN". This is the right register for
  a non-technical shop owner.
- **The Cashier template is well designed and tight.** Verified all 19 keys in the DB:
  POS session/transaction/register/catalog/tender, the inventory item+stock READS needed to
  sell, customer create/list/read for counter quick-create, and exactly ONE accounting key
  (`accounting.paymentaccount.list`) needed to tender. No refund, no void, no cost visibility.
- Role permissions are correctly MATERIALISED into `role_permissions` at create time
  (19 / 59 / 72 rows as advertised), matching the documented architecture.

## Roles created for permission testing
| Role | Perms | POS | Accounting | Cost-related |
|---|---|---|---|---|
| Cashier | 19 | 10 | 1 | 0 |
| Accountant | 59 | 0 | 39 | 1 |
| Viewer (intended "Storekeeper", see ROLE-001) | 72 | 5 | 11 | 2 |
| Owner (system) | all (bypass) | - | - | - |
