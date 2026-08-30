# Auto-parts pack — Vehicles + Fitment Families screens

Tested as Owner (`anonymator8@gmail.com`, Al Rai Main Showroom branch, confirmed via top-bar
"Viewing: Al Rai Main Showroom" and successful navigation past the auth-gated route on every
snapshot). Routes: `/inventory/vehicles` (`VehiclesPanel`) and `/inventory/families`
(`FamiliesFitmentPanel` → `FamilyCrudPanel` + `FitmentListPanel` + `FamilyMergeDialog`). The
`/auto-parts/vehicles` and `/auto-parts/families` routes are dead redirect shims to these, not a
duplicate surface.

**Environment note:** the gstack browser is shared with other concurrent testing agents this
session. Navigation was repeatedly hijacked mid-flow (redirected to `/inventory/what-fits`,
`/inventory/price-lists`, `/inventory/items/new` — none of which I opened) and the session logged
out twice unprompted. I completed list-screen verification but could **not** complete an
interactive create/duplicate/audit-log round trip before losing the tab again. Findings below are
split into CONFIRMED (code read + SQL, or browser-observed) and NOT INDEPENDENTLY VERIFIED
(reasoned from code, flagged so it isn't mistaken for a live-browser confirmation).

Ledger balance check before/after: `0.000000` both times (no writes were completed this session).

---

## HIGH — Frontend permission gates check the wrong keys, pack-wide (CONFIRMED via code read)

The auto-parts pack backend deliberately split vehicle/family/fitment write authority off the
generic item-CRUD permissions, specifically so a "catalogue clerk" role can maintain vehicles and
fitments **without** full item create/update/delete rights (see the doc comment on the
`inventory.autoparts` bundle, `packages/shared/src/permission-bundles.ts:344-368`). Backend
controllers enforce this split:

- `apps/api/src/auto-parts/vehicles/vehicles.controller.ts` — create/update vehicle+make:
  `inventory.autoparts.manage`; delete vehicle+make: `inventory.autoparts.delete`.
- `apps/api/src/auto-parts/families/families.controller.ts` — create/rename family:
  `inventory.autoparts.manage`; delete/merge family: `inventory.partfamily.delete`.
- `apps/api/src/auto-parts/fitments/fitments.controller.ts` — attach/edit/remove fitment:
  `inventory.fitment.manage`.

But every frontend component in both screens except `vehicle-make-picker.tsx` gates its buttons
on the **old, generic** item keys instead:

- `vehicles-panel.tsx:86-88` — `canCreateVehicle`/`canUpdateVehicle`/`canDeleteVehicle` all read
  `PERMISSION_KEYS.inventory.itemCreate` / `itemUpdate` / `itemDelete`.
- `family-crud-panel.tsx:96-98` — same three generic keys for create/rename/delete family.
- `fitment-list-panel.tsx:70-72` — same three generic keys for add/edit/remove fitment (should be
  `inventory.fitment.manage`).
- `family-merge-dialog.tsx:56` — `itemDelete` for merge/move (should be
  `inventory.partfamily.delete`).

Only `vehicle-make-picker.tsx:65` was updated to the correct `autopartsManage` key.

**Consequence:** a role granted only the auto-parts bundle (exactly the persona the split was
built for) sees every Add/Edit/Delete/Merge button disabled by the frontend gate even though the
backend would allow the action. A role granted only generic item CRUD (and not the auto-parts
bundles) sees the buttons enabled, clicks them, and gets a 403 from the backend.

**Not independently reproduced live:** in this tenant's actual role config only `Owner` holds any
of the affected keys (Owner bypasses all permission checks by design), and `Accountant`/
`Cashier`/`Viewer` hold neither set:

```
select r.name, rp.permission_key from roles r join role_permissions rp on rp.role_id=r.id
where rp.permission_key like 'inventory.item.%' or rp.permission_key like 'inventory.autoparts%'
   or rp.permission_key in ('inventory.fitment.manage','inventory.partfamily.delete')
order by r.name, rp.permission_key;
-- Accountant: inventory.item.list, inventory.item.read
-- Cashier:    inventory.item.list, inventory.item.read
-- Viewer:     inventory.item.list, inventory.item.read
```

So no test login can currently trigger the drift in the browser — this is a code-level bug that
this tenant's role setup happens not to expose yet. The moment anyone creates a "catalogue clerk"
style custom role (the documented intended use of the split), it fires. Matches the project's
known "permission declaration drift" pattern.

**Fix:** swap the four call sites above to the matching backend keys
(`autopartsManage`/`autopartsDelete`/`fitmentManage`/`partfamilyDelete`), same pattern already
used correctly in `vehicle-make-picker.tsx`.

---

## MEDIUM — Ambiguous vehicle label is duplicated across 4 independent implementations, reaches the Families fitment list and 2 other pickers (CONFIRMED via code read + SQL)

Per the orchestrator's brief, `vehicleLabel()` in `vehicle-picker.tsx:26-37` builds "Model
Years Trim" and omits `engine`; `trim` is NULL for 100% of rows, so distinct vehicles collapse to
identical labels. I verified the group count independently:

```sql
select count(*) from (
  select make_id, lower(model) m, coalesce(year_from,0) yf, coalesce(year_to,0) yt
  from vehicles group by 1,2,3,4 having count(*) > 1
) x;
-- 1428
```

Blast radius — I found **four separate copies of essentially the same label logic**, all omitting
engine:

1. `vehicle-picker.tsx:26-37` `vehicleLabel()` — used by `VehiclePicker`, which is embedded in:
   - `fitment-list-panel.tsx` → the **Families screen's own fitment picker** (in scope). Adding a
     fitment to a family, the vehicle dropdown shows entries like "Expedition 2012-2014" and
     "Expedition 2018-2021" indistinguishably from any of the other 4-6 engine variants at the
     same years — the user cannot tell which physical vehicle they are attaching.
   - `what-fits-panel.tsx` (`/inventory/what-fits` lookup tool) — same ambiguity for a customer
     enquiry, not one of the assigned screens but directly downstream.
   - `auto-parts-fitments-fields.tsx` (per-item fitment editor on the item form) — same.
2. `fitment-list-panel.tsx:49-56` `fitmentVehicleLabel()` — a **second, independently written**
   near-identical function, used to render the **existing fitment rows already attached to a
   family** (the actual Families-screen list, section D of the checklist). Same omission: once a
   fitment is attached, the family's fitment list shows the same ambiguous string for any two
   same-years/different-engine vehicles fitted to that family.
3. `apps/api/src/auto-parts/search/part-finder.service.ts:749-759` `vehicleLabel()` — a **third**
   copy, backend-side, feeding the "sample fitted vehicles" shown on Part Finder search-result
   hits (also omits engine and trim entirely, worse: doesn't even carry trim through).

The **Vehicles admin list itself is NOT affected** — `vehicles-panel.tsx` renders Model, Years,
Engine, Engine Code and Trim as five separate table columns (lines 273-302), so the collision is
invisible there; an admin auditing the raw table can tell rows apart. The ambiguity is confined to
every *picker/summary* surface that collapses the vehicle into one string, which is exactly where
a counter clerk needs to disambiguate live (which of six 2012-2014 Expeditions is this add-fitment
click actually attaching).

**Fix:** one shared label helper (already flagged by the orchestrator as the root cause) that
includes engine when it's the only distinguishing field, used by all four call sites — not a
per-site patch, per the project's "parallel agents duplicate helpers" lesson.

---

## Vehicle creation — duplicate handling (NOT INDEPENDENTLY VERIFIED live; code-confirmed)

Could not complete a live create-duplicate round trip (browser contention). From code:

- `vehicle-quick-create-form.tsx` is shared by both the admin dialog (`VehiclesPanel`) and the
  inline picker sub-form, good reuse — one schema, one set of bounds (year 1900-2100, matches
  server `vehicles.dto.ts`).
- The 409 conflict on `POST /tenant/auto-parts/vehicles` is mapped to a plain-language toast, not
  a raw `23505`: `mapConflictToFieldError` (`hooks/map-conflict-to-field-error.ts`) routes any
  `ApiError` with `status === 409` to `t("vehiclePicker.newVehicle.duplicate")` =
  **"This vehicle already exists"** (en) / **"هذه المركبة موجودة بالفعل"** (ar) — both confirmed
  present and parallel in `messages/en/auto-parts.json:255` and `messages/ar/auto-parts.json:255`.
  So a true duplicate (same make/model/years/engine) is rejected with an honest, plain message —
  no jargon, no raw error code surfaced to the user. Good.
- **However**, the unique key includes `engine`, and `engine` lives behind a collapsed "Advanced"
  toggle in `VehicleFieldsForm` (`vehicle-quick-create-form.tsx:143-154`), closed by default. A
  user creating "Expedition 2012-2014" without opening Advanced gets `engine: null`. If a
  different-engine "Expedition 2012-2014" already exists with `engine: null` too, they hit the
  409 with no clue *why* — the message says "already exists" but never surfaces which field
  collided, and the colliding field (engine) is the one hidden by default. If instead they type an
  engine that happens to not collide, the vehicle saves as visually indistinguishable from its
  siblings in every picker (see the label bug above) with no warning at create time that a
  same-looking entry already exists — there is no "did you mean this vehicle?" step before create,
  only a hard reject on exact duplicates.

**Severity:** MEDIUM/FRICTION rather than HIGH — the reject-on-exact-duplicate path uses plain
language and doesn't corrupt data, but the "duplicate that isn't byte-identical" case (different
engine, or blank engine both times) is silently allowed and immediately indistinguishable in every
downstream picker, compounding the label bug above. This could not be exercised live this session;
flagging as SUSPECTED for the exact repro, CONFIRMED for the code path (advanced-toggle placement,
409 mapping, and translation strings were all read directly).

---

## LOW/FRICTION — "Advanced" fields hide the unique-key-relevant field by default

`VehicleFieldsForm` puts `trim`, `engine`, `engineCode` behind a closed-by-default disclosure
toggle, framed in the code comment as "most walk-up lookups never need them." That's a reasonable
default for *lookup*, but `engine` is also part of the create-time **uniqueness** check — hiding
it means the field most likely to prevent an accidental duplicate (or to explain a rejected one)
is the one field a first-time creator is least likely to see. Not asking to remove the
progressive disclosure (correct call for a counter workflow), but the 409 error should name the
colliding field, or the form should surface "Engine" pre-expanded specifically on a 409 retry so
the user can see what to change.

---

## Scoping (CONFIRMED — no branch/warehouse leak risk)

Both screens are catalogue-level (vehicle makes, vehicles, part families, fitments are tenant-wide
reference data, not warehouse/branch-scoped) — same as the item catalogue, which the briefing
already establishes is company-wide by design. Neither screen shows a branch/warehouse selector,
which is correct: there is nothing to scope. No leak risk to evaluate here (rule 3 doesn't apply —
these are not stock/financial rows).

## Audit (NOT VERIFIED — no rows exist yet)

```sql
select entity_type, action, user_email, created_at from audit_log
where entity_type ilike '%vehicle%' or entity_type ilike '%family%'
order by created_at desc limit 15;
-- 0 rows
```

Both controllers carry `@Audited("Vehicle")` / `@Audited("VehicleMake")` / (families controller
not fully re-read for its `@Audited` tag name but is decorated) on every mutating endpoint, which
is the correct mechanical pattern — but zero rows exist for these entity types in this tenant's
`audit_log`, meaning no session (including this one) has yet completed a create/update/delete
against these tables to confirm the audited write path fires end-to-end in practice. Flag this as
an **open verification gap**, not a finding — a follow-up pass with working browser access should
create one `ZZTEST` vehicle and one `ZZTEST` family and confirm the resulting `audit_log` rows
carry the correct `user_email`/`action`/`before`/`after`.

## i18n / RTL (spot-checked)

- `vehicles-panel.tsx` uses `<bdi>` around model/engine/trim (bidi isolation for unknown-direction
  content) and `dir="ltr"` specifically on `engineCode` (correct — part codes are always LTR
  regardless of UI locale) and `dir="auto"` on the free-text search input — matches the project's
  bidi convention.
- All auto-parts strings referenced above (`vehicles.*`, `vehiclePicker.*`, `families.*`) exist in
  both `messages/en/auto-parts.json` and `messages/ar/auto-parts.json` with parallel structure —
  no missing-key risk spotted in the paths read. Full `i18n:check` was not run (out of scope for a
  read-only spot check; the CI-enforced parity check is the authority).
- No em dashes found in any of the copy strings read.

## What could not be completed this session

- Live create/edit/delete of a `ZZTEST`-prefixed vehicle and family, with DB audit-row
  confirmation — blocked by shared-browser contention (session hijacked 6+ times mid-flow by other
  concurrent agents). No `ZZTEST` document was created, so `_documents-created.md` has no new row
  from this pass.
- Pagination/search/sort exercise on a make with a large vehicle count (e.g. Ford, Toyota) at
  4,555 total rows — the list component (`TablePagination`, page sizes 25/50/100, debounced
  search) reads correctly in code (search debounced 300ms, page resets on make/search/page-size
  change — `vehicles-panel.tsx:127-141`) but was not exercised live.
- Merge-family and move-part flows (`family-merge-dialog.tsx`) were located and permission-gate
  checked but not opened/read for full UX detail.

Recommend a follow-up pass once the shared browser is free to close these three gaps.

---

# Orchestrator verification of the permission-drift HIGH (2026-08-26)

Agent claim **CONFIRMED**, and the root cause of *why it survived* is now identified: the
existing parity tests are structurally incapable of catching it.

## The drift itself

`apps/web/src/features/auto-parts/components/vehicles-panel.tsx:86-88`
```ts
const canCreateVehicle = useHasPermission(PERMISSION_KEYS.inventory.itemCreate);
const canUpdateVehicle = useHasPermission(PERMISSION_KEYS.inventory.itemUpdate);
const canDeleteVehicle = useHasPermission(PERMISSION_KEYS.inventory.itemDelete);
```

`apps/api/src/auto-parts/vehicles/vehicles.controller.ts`
```
:57  @RequiresPermission("inventory.autoparts.manage")   POST
:79  @RequiresPermission("inventory.autoparts.manage")   PATCH
:92  @RequiresPermission("inventory.autoparts.delete")   DELETE
:110 @RequiresPermission("inventory.autoparts.manage")
:122 @RequiresPermission("inventory.autoparts.manage")
:135 @RequiresPermission("inventory.autoparts.delete")
```

Same for families (`inventory.autoparts.manage` / `inventory.partfamily.delete`) and fitments
(`inventory.fitment.manage`). The frontend gates on the generic item keys; the backend demands
the auto-parts keys. Per the project's standing principle, **the backend decorator is
authoritative**, so the frontend gate is simply wrong.

## Why it is latent rather than currently visible

Only the tenant Owner holds these keys today, and Owner bypasses RBAC entirely. So nothing
misbehaves right now. It fires the moment a narrower custom role exists — which is precisely the
"catalogue clerk who manages vehicles but not item CRUD" use case the backend split was
deliberately written to support. Both failure directions are live:

- clerk has `autoparts.manage` but not `item.create` -> **button hidden, action they are
  entitled to perform is unreachable**
- clerk has `item.create` but not `autoparts.manage` -> **button shown, click 403s** (dead
  button; the founder standard treats a button that does not do what it says as HIGH)

## Root cause — the guard gap

Two parity tests exist and **neither compares a frontend action-button gate to a backend
decorator**:

1. `apps/api/src/auto-parts/auto-parts-route-permissions.spec.ts` — pins controller decorators
   against a hardcoded expectation list. **Backend-only.** It re-reads controller source on
   every run, so it correctly catches a backend decorator changing, but it has no knowledge that
   a frontend file exists.
2. `apps/web/src/components/shell/__tests__/route-permissions-backend-parity.test.ts` — its sole
   assertion is *"has a backend-backed mapping entry for every permission used in **nav-items**"*.
   **Sidebar navigation only.** In-page `PermissionGatedButton` gates are outside its scope.

So the drift lives in the one seam both tests leave uncovered: in-page action buttons. Fixing
only `vehicles-panel.tsx` would leave the same hole open for the next screen. The durable fix is
to extend the web parity test from nav-items to every `useHasPermission` call site, mapped to
the controller route it triggers.
