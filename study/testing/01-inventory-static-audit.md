# Inventory — static audit (pre-UI), 2026-08-25

Scope: permission gating, branch/legal-entity scoping, tenant scoping for all 27 inventory screens.
Method: read code + codemap. No runtime verification yet.

## Verdict: NO critical, high or medium findings.

### 1. Permission gating — OK
- Enforcement is single-point: `require-permission.tsx` wraps the whole `(app)` layout
  (`apps/web/src/app/[locale]/(app)/layout.tsx:89`) and resolves via `route-permissions.ts`
  using LONGEST-PREFIX matching (`route-permissions.ts:47-56`).
- That prefix match is why `items/new`, `items/[id]`, `transfers/[id]/edit`,
  `stock-counts/[id]/count` etc. inherit their parent's gate without being listed.
  Page files carry no permission code by design. Not a gap.
- Every inventory backend endpoint carries `@RequiresPermission`. No ungated endpoint found.
- Auto-parts pack routes: nav gates on `requiresModule: auto_parts` only, but the backend is
  STRICTER (module gate + per-endpoint permission). Backend-stricter is safe.
- Parity test exists: `apps/web/src/components/shell/__tests__/route-permissions-backend-parity.test.ts`
  and covers inventory. NOT verified whether it enumerates every key
  (`stock.adjust`, `stock.transfer`, `autoparts.manage`) — TODO: targeted grep before
  trusting it as exhaustive.

### 2. Branch / legal-entity scoping — OK
- Single non-bypassable primitive: `branchScopeCondition(tableKey)` in
  `apps/api/src/tenant/branch-scope.ts`, reading request-scoped `getTenantContext()`.
- Table derivations registered compile-time-checked in `apps/api/src/tenant/protected-tables.ts`
  (`branchId` | `warehouseId` via warehouses join | `registerId` via posRegisters join |
  `warehousePair` for transfers).
- FAIL-CLOSED: no branch access and no all-access flag -> zero rows (`kind: "none"`).
- AGGREGATE/ROW PARITY VERIFIED (the classic bug): every count/KPI reuses the exact same
  where-condition as its row list. Checked at stock-adjustments:859, stock-transfers:2056,
  stock-counts:199, batches:204/621/627/640, serial-numbers:210/977, reorder:298/435-445.
- Inventory overview KPIs compose from already-scoped endpoints; no separate unscoped path.

### 3. Tenant scoping — OK
- Structural, not predicate-based: per-tenant Postgres DB via `TENANT_DB` injection.
- The two schedulers + export service use `ADMIN_DB` ONLY to enumerate tenant ids, then loop
  per-tenant through that tenant's own `TENANT_DB`. Correct pattern, not a leak.

## DO NOT MISREAD DURING UI TESTING (by design, not bugs)
1. **Average cost does not change when you switch branch.** `itemCostPools` is deliberately
   keyed by (item, legalEntity) and spans branches — company-wide average cost architecture.
   `onHand` beside it IS branch-scoped. This asymmetry on the items screen is intentional
   (`items.service.ts:409-441`).
2. Child/line tables (`stockTransferLines`, `stockCountLines`) derive scope via their parent
   row (`viaParent`), so they are not independently re-checked. Intentional.

## OPEN — verify at runtime (SUSPECTED, LOW)
- `inventoryCostLayers` and `stockReservations` sit in `PLANNED_TABLES` as NOT branch-scoped,
  justified by "no user-facing read applies the filter yet".
  ACTION: confirm no inventory screen surfaces a reservations or cost-layer list/count.
  If one does -> upgrades to MEDIUM/HIGH depending on what it shows.
