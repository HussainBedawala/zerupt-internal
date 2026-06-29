# Chapter 06 — Frontend

---

## Routes (EXISTS)

| Route | File | Purpose |
|-------|------|---------|
| `/purchase/landed-costs` | `app/.../purchase/landed-costs/page.tsx` | List page |
| `/purchase/landed-costs/new` | `.../landed-costs/new/page.tsx` | Create form |
| `/purchase/landed-costs/[id]` | `.../landed-costs/[id]/page.tsx` | Detail / post |

---

## Components

| Component | File | Covers |
|-----------|------|--------|
| `LandedCostCreatePanel` | `features/purchase/components/landed-costs/landed-cost-create-panel.tsx` | Branch, date, multi-GRN checkbox selection |
| `LandedCostDetailPanel` | `.../landed-cost-detail-panel.tsx` | Add/edit/remove components, post button, approval PIN |
| `LandedCostsListPanel` | `.../landed-costs-list-panel.tsx` | Paginated list with status badges |

---

## Create Flow

1. User selects branch → date → ticks GRNs from `status=confirmed` list (fetched with `limit: 100`).
2. Currency hardcoded to functional currency from selected legal entity
   (`landed-cost-create-panel.tsx:47`). No currency override UI (correct for deferred FX).
3. On submit → `POST /tenant/purchase/landed-costs` → redirects to detail page.

**REQUIRES (UX):** Confirmed GRN list is fetched with `limit: 100`, no pagination. A tenant
with many confirmed GRNs will silently truncate the list.

**REQUIRES (UX):** No indication on the GRN select list whether a GRN already has landed costs
attached. Users could inadvertently double-allocate.

---

## Detail / Component Flow (EXISTS)

- Displays all components in a table with edit (Pencil) / delete (Trash2) actions.
- Add component form: description, amount, `creditAccountType` (payable/bank/accrual),
  `allocationMethod` (by_value/by_quantity/by_weight/manual).
- Manual method: shows per-GRN-line amount inputs (from `targetGrnIds`).
- Approval PIN fields (`ApprovalPinFields`) shown only when any component is `manual`.
- Post button visible only for `draft` status; calls `POST /tenant/purchase/landed-costs/:id/post`.

---

## Allocation Preview (REQUIRES)

No preview of computed allocations before posting. Users cannot see how amounts will be
distributed across GRN lines until after the LC is posted. A "preview allocation" dry-run
endpoint or UI step would improve confidence, especially for `by_weight` (which can 422 if
items lack weights).

---

## Reversal UI (REQUIRES)

No "reverse" or "void" button on the detail panel. The spec says corrections use a new
negative LC, but (a) the schema blocks negative amounts and (b) there is no UI shortcut
to clone an LC with negated amounts.

---

## i18n (EXISTS)

Uses `useTranslations("purchases.landedCosts")`. All visible strings come from the i18n
namespace — no hardcoded English/Arabic. RTL handled via Tailwind logical properties in
the shared UI library.

---

## Missing Surfaces

| Feature | Status |
|---------|--------|
| GRN detail → "Landed Costs" tab | REQUIRES — no cross-link from GRN to its LCs |
| Item cost history including landed cost adjustments | REQUIRES |
| LC total vs GRN value ratio indicator | REQUIRES |
| Freight supplier auto-bill creation | REQUIRES |
| Allocation preview before post | REQUIRES |
