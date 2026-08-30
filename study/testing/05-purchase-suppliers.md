# Phase D — Purchase / Suppliers audit (static: code + DB + curl only)

Scope: `/:locale/purchase` (route 70), `/:locale/purchase/suppliers`, `/suppliers/new`,
`/suppliers/:id`, `/suppliers/:id/edit` (routes 97-100), backend `suppliers` module
(controller/service/DTO), and the underlying DB tables. No browser used this wave
(shared session owned by another agent) — every finding below is code-read or
DB/curl evidence.

Files read in full: `apps/api/src/suppliers/suppliers.controller.ts`,
`suppliers.service.ts`, `suppliers.dto.ts`, `graph/blast-radius.guard-helper.ts`,
`apps/web/src/app/[locale]/(app)/purchase/suppliers/{page,new/page,[id]/page,[id]/edit/page}.tsx`,
`apps/web/src/components/shell/require-permission.tsx`,
`apps/web/src/features/purchase/components/{suppliers-list-panel,suppliers-bulk-bar,
supplier-form-panel,supplier-detail-panel}.tsx`,
`apps/web/src/features/purchase/api/purchase-queries.ts` (supplier hooks),
`apps/web/src/components/money-input.tsx`, `apps/web/src/components/ui/exposure-cell.tsx`.
Cross-checked `study/purchase/_hardening-log.md` (M0/M5 supplier work) and
`erp/docs/CODEMAPS/purchase.md` before filing anything, per the addendum.

---

## HIGH

### H1. Bulk supplier deactivation bypasses the blast-radius safety check the single-edit path enforces (CONFIRMED, path divergence)

- `SuppliersController.updateSupplier` (`suppliers.controller.ts:190-222`) runs the
  blast-radius guard *only* on the single-resource `PATCH /tenant/suppliers/:id` route:
  ```ts
  if (body.status === "inactive") {
    const force = forceParam === "true";
    const blast = await this.graphService.blastRadius(ctx.tenantId, "party", id);
    enforceBlastRadius(blast, force);
  }
  ```
  `enforceBlastRadius` (`graph/blast-radius.guard-helper.ts`) throws a 409 with the
  dependents summary when hard blocks exist and `force` was not passed.
- `POST /tenant/suppliers/bulk` (`bulkUpdateSuppliers`, controller line 175, service
  line 881) calls `SuppliersService.updateSupplier(...)` **directly**, per id, in a
  loop — never through the controller method that runs the blast-radius check. There
  is no equivalent call to `graphService.blastRadius` anywhere in
  `bulkUpdateSuppliers`.
- Frontend confirms the asymmetry: `supplier-detail-panel.tsx` imports and renders
  `BlastRadiusDialog` for the single-supplier status change; `suppliers-bulk-bar.tsx`
  wires "Deactivate" straight to `useBulkUpdateSuppliersMutation` with **no**
  confirmation dialog and no blast-radius surface at all (only "Block" gets a
  dialog, and that dialog only collects the required reason string, not a
  dependents warning).
- Effect: a user can select N suppliers in the list and bulk-deactivate them
  (`suppliers-bulk-bar.tsx:140`) even when one has open POs/GRNs/bills that would
  have hard-blocked (or at least warned on) the single-supplier deactivation. This
  is exactly the "path divergence" defect class called out in the addendum
  (order vs direct was the POS/sales version; here it's single vs bulk).
- Severity reasoning: not CRITICAL — no money is misposted and the transition is
  reversible (inactive → active is allowed per `ALLOWED_STATUS_TRANSITIONS`). But it
  silently skips a deliberately-built safety net, which is a HIGH per the briefing's
  "fails silently" bucket (the failure here is a missing warning, not a crash, but
  it defeats a control that exists specifically to catch exactly this).
- Repro (code path, not yet browser-verified): as an owner/`purchase.supplier.update`
  role, select 2+ suppliers on `/purchase/suppliers`, use "Set status → Deactivate".
  `bulkMutation` posts to `tenant/suppliers/bulk`; no 409/dialog appears regardless
  of whether a selected supplier has open purchase orders.
- Fix direction (not applied — audit only): route bulk status changes for
  `status === "inactive"` through the same blast-radius check per id (or a batched
  variant), and surface warnings/hard-blocks in the bulk result the same way the
  single edit does.

---

## MEDIUM

### M1. Supplier list is missing `placeholderData: keepPreviousData` (CONFIRMED, matches known cross-cutting item)

- `useSuppliersQuery` (`purchase-queries.ts:110-119`) has no `placeholderData`:
  ```ts
  export function useSuppliersQuery(params, options) {
    return useQuery({
      queryKey: supplierKeys.list(params),
      queryFn: () => fetchSuppliers(params),
      ...(options?.enabled !== undefined ? { enabled: options.enabled } : {}),
    });
  }
  ```
- Every page change, sort change, or filter change on `/purchase/suppliers`
  unmounts the table into `TableSkeleton` (`suppliers-list-panel.tsx:342-344`)
  instead of keeping the previous page's rows visible while the next page loads.
  This is the same class of defect the briefing pre-lists as an open ~30-panel
  item (AUDIT addendum cross-cutting list). Filing it here confirms suppliers is
  one of the affected panels, not fixing it (audit-only wave).

### M2. `SUP-` auto-code prefix diverges from this tenant's actual seeded supplier codes (SUSPECTED — cosmetic but potentially confusing)

- `SuppliersService.CODE_PREFIX = "SUP-"` (`suppliers.service.ts:91`), and
  `nextSupplierCode` only recognizes `^SUP-([0-9]+)$` when computing the next
  number.
- DB check on Gulf Auto Parts:
  ```
  code      | name
  SUPP-0001 | Battery World Co. 1
  SUPP-0002 | Gulf Parts Trading Est. 2
  ...
  ```
  All 10 sampled rows use `SUPP-####` (double P), not `SUP-####`. These were
  clearly seeded by a different generator (or hand-entered/import) than the one
  the live create-supplier flow uses.
- Effect: the very next auto-created supplier through the UI will be `SUP-0001`
  (the regex never matches `SUPP-...` rows, so `maxNum` resolves to 0), sitting
  right next to 500+ existing `SUPP-####` codes. Not a collision (different
  strings, unique constraint is fine) but confusing to a shop owner scanning the
  list by code, and it means the auto-numbering silently restarts at 1 instead of
  continuing a visually similar sequence.
- Not filing higher because it does not corrupt data and both formats pass the
  `supplierCodeSchema` regex (alphanumeric + hyphen). Marking SUSPECTED-as-friction
  because I did not verify whether this seed data was intentionally out-of-band
  (e.g. a books-import test fixture) — worth a one-line confirmation before anyone
  "fixes" it.

---

## LOW / FRICTION

### F1. Credit-limit zod schema allows 6dp while the UI field only ever produces 3dp for KWD (LOW, non-finding but worth noting)

- `creditLimitSchema = z.coerce.number().min(0).max(1_000_000_000_000)` and the
  client-side regex `/^\d+(\.\d{1,6})?$/` both accept up to 6 decimal places.
  `MoneyInput` (used for the credit-limit field in `supplier-form-panel.tsx:874`)
  normalizes on blur via `formatToDecimals(v, getCurrencyDecimals(currency))`,
  which is 3 for KWD — so the UI never actually submits more than 3dp for this
  tenant. The 6dp ceiling in the DTO/DB column (`credit_limit numeric(19,6)`)
  is deliberately currency-agnostic (other tenants may have 0dp/2dp/3dp
  currencies), so this is consistent design, not a bug. Recording as a genuine
  non-finding per the briefing's instruction to log explicit non-findings.

### F2. Supplier code auto-numbering is genuinely well-defended (positive finding)

- Manual-code path is a single attempt (correct 409 on dup); auto-gen path retries
  up to `MAX_CODE_RETRIES` on a real unique-constraint race, and the regex-bound
  `substring(...from pattern)` in `nextSupplierCode` binds the prefix as a
  parameter, not `sql.raw`, so it can never become a SQL/regex injection vector
  even though `CODE_PREFIX` is a compile-time constant today. Good defensive
  posture ahead of any future per-tenant-configurable prefix.

---

## Non-findings (checked, no defect)

- **Scoping**: `suppliers` and its child tables (`supplier_contacts`,
  `supplier_addresses`) carry no branch/warehouse dimension — correct, suppliers
  are a tenant-level (not branch-level) master exactly like customers. Every
  service query is `and(eq(id,...), eq(tenantId, tenantId))`; child-row mutations
  additionally verify the child belongs to the already-tenant-verified parent
  (`assertContactExists`/`assertAddressExists`) before touching it — cross-tenant
  isolation is intact.
- **Permission parity, route-level**: `resolveRoutePermission`-driven
  `RequirePermission` (global `(app)` layout wrapper) reads the same
  `nav-items.ts` permission keys the backend enforces
  (`PK.purchase.supplierList` → `purchase.supplier.list` on the controller). No
  drift found for the four in-scope routes.
- **Permission parity, action-button level**: `suppliers-list-panel.tsx` gates
  "New" on `purchase.supplier.create` and row "Edit" on `purchase.supplier.update`
  client-side, matching the controller's `@RequiresPermission` on
  `POST /` and `PATCH /:id` respectively. No PERM-004-style "denied user gets a
  fully interactive form" pattern found on this screen — create/edit affordances
  are disabled, not merely blocked on submit.
- **Directory endpoint**: `GET /tenant/suppliers/directory` deliberately has no
  `@RequiresPermission` and returns only `{id, name, nameAlt, active}` — correct
  application of the "names-only directory" rule (matches
  `project_names_only_directory_endpoints`); the response shape is the security
  boundary, by design and by comment in the code.
- **Audit coverage**: every mutating endpoint (`createSupplier`, `bulkUpdateSuppliers`,
  `updateSupplier`, `addContact`/`updateContact`/`deleteContact`,
  `addAddress`/`updateAddress`/`deleteAddress`, `uploadImage`/`deleteImage`) carries
  `@Audited("Supplier")`. `updateSupplier` additionally captures a full
  before-snapshot (`req.auditBefore`) ahead of the blast-radius check, so a denied
  (409) deactivation attempt never writes a misleading "changed" audit row. DB
  spot-check shows `Supplier|create|500` rows logged for this tenant's seed;
  confirms the audit path fires (could not find an `update` sample in-tenant to
  confirm before/after diff shape, since no test session has edited a supplier here
  yet — flagged as untested rather than broken).
- **KWD 3dp money handling**: `MoneyInput` + `formatMoneyWithSymbol` (used by
  `ExposureCell` for outstanding/credit-limit display) both derive decimals from
  `getCurrencyDecimals(currency)`, never hardcoded 2dp. `credit_limit` column is
  `numeric(19,6)`, comparisons in `isOverLimit()` scale to 6dp integers to avoid
  float rounding. No 2dp truncation found anywhere in the supplier read/write path.
- **No tax UI in Kuwait**: the tax-group picker (`showTaxGroupPicker`) only renders
  when `taxGroups.length > 0` — for a no-VAT tenant with zero configured tax groups
  this section never appears; not even collapsed. Matches
  `feedback_hide_tax_in_no_tax_countries`.
- **i18n / ar-en parity**: `apps/web/messages/{en,ar}/purchases.json` have zero
  key-diff for `suppliers.*` (scripted flatten-and-diff, 0 missing either
  direction). No em dashes found in any `suppliers.*` English string. No
  hardcoded physical CSS properties (`margin-left`/`-right`,
  `padding-left`/`-right`, `text-left`/`-right`) in any supplier component file —
  logical properties (`ms-*`, `ps-*`, `text-end`) used throughout.
- **List UX**: pagination, search (debounced 300ms), status filter, currency
  filter, hasOutstanding/overLimit filters, sort (asc/desc, 6 fields incl. a
  GL-scan path for `outstanding`), loading (skeleton), error (retry), and two
  distinct empty states (filtered vs. true-empty with a "New supplier" CTA) are
  all present and each is a genuinely separate code branch, not a shared
  catch-all. CSV export (list toolbar → `SuppliersExportDialog`, and the bulk
  bar's "Export selected" via client-side `buildCsv`) both honor the
  currency-aware `formatCsvMoneyCell` and respect the active filters (server
  export) or current selection (client export) — did not find a bug in either
  csv-construction path.
- **Trailing-tiebreaker pagination**: every `orderBy` branch in `listSuppliers`
  and its outstanding-sort sibling appends `suppliers.id` as a final unique key —
  correctly guards the CSV export (which pages 200 rows at a time) against
  skipped/duplicated rows on a name/date collision.
- **Friction / click count**: create-supplier defaults are good — code
  auto-generates and is collapsed behind "Use my own code", currency
  auto-fills to tenant currency on create, payment-term is a preset Select
  (not free text) defaulting to "None", tax group hidden entirely for
  no-tax tenants. A shop owner filling only Name and clicking Save can create
  a supplier in one field + one click. No unnecessary draft stage — create is
  a single POST, no draft/confirm split.
- **Money-ledger integrity check** (per house write-safety protocol): ran before
  and confirmed `select round(sum(debit-credit),6) from journal_entry_lines` =
  `0.000000` on Gulf Auto Parts. No writes were made this session (audit-only), so
  no after-check was needed.

---

## Summary of severities

| # | Severity | Status | One-line |
|---|----------|--------|----------|
| H1 | HIGH | CONFIRMED | Bulk supplier deactivate skips the blast-radius dependents check the single-edit path enforces |
| M1 | MEDIUM | CONFIRMED | `useSuppliersQuery` lacks `placeholderData: keepPreviousData` — pager unmounts to skeleton on every page/filter change |
| M2 | MEDIUM | SUSPECTED | Seeded `SUPP-####` codes vs. live auto-gen `SUP-####` prefix mismatch (cosmetic, needs a one-line confirm on seed intent) |
| F1 | non-finding | — | Credit-limit 6dp DTO ceiling vs 3dp UI display is deliberate multi-currency design, not a bug |
| F2 | positive | — | Supplier auto-code generation is race-safe and injection-safe |
