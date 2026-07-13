# Branch-scope enforcement (P2a)

The data-leakage-prevention layer. Every data READ on a branch-owned table must
be filtered to the branches the current request may see, so one tenant's user in
Branch A can never read Branch B's rows.

## Pieces

| Piece | Path |
|-------|------|
| Helper (the primitive) | `erp/apps/api/src/tenant/branch-scope.ts` |
| Protected-tables registry (source of truth) | `erp/apps/api/src/tenant/protected-tables.ts` |
| Helper tests (100%) | `erp/apps/api/src/tenant/branch-scope.spec.ts` |
| Drift check | `study/ops/branch-scope/check-branch-scope.sh` |

## The helper (registry-keyed)

```ts
branchScopeCondition("stockCounts")   // key ∈ keyof PROTECTED_TABLES
```

A caller names the table by its REGISTRY KEY only. The derivation shape (which
column, whether NULL is tenant-wide, single-column vs dual-warehouse) is authored
ONCE in `PROTECTED_TABLES` against the table's ACTUAL Drizzle column(s), so a call
site can never pick the wrong column, and a key not in the registry is a COMPILE
ERROR. Reads the server-validated `TenantContext` and returns a Drizzle SQL
condition to drop into an existing `and(...)` WHERE (or into a LEFT JOIN ON when
zero rows must still appear), or `undefined` when the request may see all branches.

Semantics (fail-closed):
- `currentBranchId` set -> only that branch.
- no `currentBranchId` + `allBranchesAccess` -> `undefined` (no filter).
- no `currentBranchId` + specific `allowedBranchIds` -> `IN (those)`.
- no access at all -> `sql\`false\`` (no rows).
- registry `includeNull: true` -> NULL branch/warehouse = tenant-wide/unlocated,
  always visible (even for a no-access request).

### Derivation shapes (do NOT assume every table is one of the 3 single-column ones)

| kind | how it scopes | example tables |
|------|----------------|-----------------|
| `branchId` | direct column `branch_id IN (…)` | stockLedgerEntries, stockAdjustments |
| `warehouseId` | `warehouse_id IN (SELECT id FROM warehouses WHERE tenant AND branch_id IN (…))` | materializedStockLevels, itemBatches, stockCounts, itemSerialNumbers |
| `registerId` | via `pos_registers` subquery | posTransactions, posShifts |
| `warehousePair` | **dual-warehouse**: visible if EITHER of two warehouse columns is in scope (OR of two subqueries) | stockTransfers (`from_warehouse_id` / `to_warehouse_id`) |

> IMPORTANT for fan-out agents: some tables reference a PAIR of warehouses (stock
> transfers) or otherwise cannot be modelled by a single column. Do NOT mechanically
> apply only the three single-column shapes and miss a two-sided table — check the
> schema for a second warehouse/branch column and use `warehousePair` (or add a new
> multi-column derivation kind) when one exists. Likewise, a table whose derivation
> column is NULLABLE (e.g. price-adjustment / service lines with no warehouse) MUST
> be registered with `includeNull: true`, or the branch filter will silently DROP
> every NULL-column row once the table is scoped.

Non-HTTP/JOB contexts run tenant-wide by setting `allBranchesAccess: true`, so the
helper returns `undefined` (all rows) — this is why scheduler/job reads must never
be branch-scoped. A NEW job that forgets that flag resolves to no access and would
fail closed to zero rows (correct for a read, but never gate a write path on it).

## Registry: wired vs planned

`protected-tables.ts` holds two lists:

- **`PROTECTED_TABLES`** — WIRED tables carrying the real Drizzle column objects.
  These GATE (a read that bypasses the helper fails `--gate`).
- **`PLANNED_TABLES`** — branch-owned tables not yet wired (pos/sales/purchase/
  accounting fan-out, plus inventory tables with no user-facing read yet). Reads
  here only WARN so the backlog is never silently forgotten. Graduate a table by
  moving it into `PROTECTED_TABLES` with its real columns when its first read is
  scoped. KEEP BOTH LISTS COMPLETE — a branch-owned table in neither list is
  invisible to the drift check and can leak silently.

**Line tables read through an authorised parent** (e.g. `stockCountLines`,
`stockTransferLines`, `salesOrderLines`) belong in `PLANNED_TABLES` as
`column: "viaParent"`. Their user-facing reads are already authorised by the
branch-scoped header read, so each such read carries a `// branch-scope-exempt:
viaParent — ...` marker rather than being independently scoped. They must still be
IN the registry: a branch-owned line table absent from both lists is invisible to
the check.

**Registry completeness is the gate's soundness precondition.** The gate can only
see tables it knows about; a branch-owned table (`branch_id` / `warehouse_id` /
`register_id`, directly or via a parent) in NEITHER list is a silent hole. When you
touch the schema, re-audit: `grep -rE "branchId:|warehouseId:|registerId:"
packages/db/src/schema` and cross-check every hit against these two lists.

## Drift check

```bash
bash study/ops/branch-scope/check-branch-scope.sh           # warn (default), always exit 0
bash study/ops/branch-scope/check-branch-scope.sh --gate    # exit 1 on an unhandled read in a MIGRATED module
```

Scans `apps/api/src` for reads (`.from(<table>)` / `db.query.<table>`), INCLUDING
Prettier-wrapped multi-line forms where the table name is on a following line.

The check is **per-READ and table-aware** (not per-method "appears anywhere"). Each
individual read of registry table `X` is handled only if ONE of:
- its ENCLOSING method/function applies `branchScopeCondition("X")` for the SAME
  table key `X` — scoping table A does NOT excuse an unscoped read of table B in the
  same method; the scope call is tied to the read's table token; OR
- a `// branch-scope-exempt: <reason>` marker sits DIRECTLY above THAT read (the
  nearest annotation above it, with no other registry read in between — a marker
  attaches to exactly one read and never leaks to a second read further down).

Method boundaries recognise class methods, `function` decls, AND class-field arrow
methods (`name = async (...) => {}`), so a read in an arrow-bound method never
inherits the previous method's scope call.

Gating is MODULE-AWARE: only reads in an already-migrated module
(`MIGRATED_MODULE_DIRS`, currently `inventory`) escalate to `[GATED]`; reads of a
wired table from a not-yet-migrated module are `[WARN]` fan-out backlog.

Exemptions (mark the SPECIFIC read, DIRECTLY above it, with a precise reason):
- `// branch-scope-exempt: <reason>` — for costing engines, posting paths, by-id /
  race re-read mutation lookups, tenant-wide existence/uniqueness guards, and
  line-table reads authorised through an already-branch-scoped parent (`viaParent`).
  A class-level or method-top marker no longer blanket-exempts every read below it —
  each read needs its own adjacent marker.

### Self-test (regression guard)

```bash
bash study/ops/branch-scope/check-branch-scope.sh --self-test
```

Runs inline fixtures proving the detector CATCHES the two blind spots the old
per-method logic missed — (a) an unscoped second wired read in a method that scopes
a different table, (b) an unscoped read in a class-field arrow method following a
scoped method — plus that a correctly-scoped read is NOT flagged and an adjacent
exempt marker does not leak to a second read. Exit 1 on any failed assertion; wire
it into CI alongside `--gate` so nobody can quietly reintroduce the blind spot.

## Fan-out guide (pos / sales / purchase / accounting / reports)

Copy the inventory reference. For each module:
1. Confirm each table's shape against the actual schema (inventory shapes are
   schema-verified; PLANNED shapes are from recon — RE-VERIFY, and check for a
   second warehouse/branch column → `warehousePair`, and NULLABLE columns →
   `includeNull`).
2. Move the table from `PLANNED_TABLES` into `PROTECTED_TABLES` with its real
   Drizzle column(s), then apply `branchScopeCondition("<key>")` at every
   user-facing LIST/browse/report/detail read. For LEFT-JOIN "show zero rows"
   queries, put the condition in the JOIN ON, not WHERE.
3. Mark genuinely internal reads (engines, posting, scheduler jobs, by-id / race
   re-read lookups, tenant-wide guards) with a `// branch-scope-exempt: <reason>`
   marker DIRECTLY ABOVE THAT read. The gate is per-read: a method that scopes
   table A does NOT cover an unscoped read of table B, and a single marker covers
   only the one read beneath it — a method with N internal reads needs N markers
   (or N scope calls). Line tables read via an authorised parent get a
   `viaParent` marker (see above). **Never scope a read reachable from a
   scheduler/job** — job contexts run tenant-wide via `allBranchesAccess: true`.
4. Add the module's dir to `MIGRATED_MODULE_DIRS` in the drift check, run `--gate`
   until green, and run `--self-test` (both must pass in CI).

> Blind spots the tightened gate now catches (do NOT reintroduce them): a second,
> unscoped read of a different wired table in a multi-read method; an unscoped read
> in a class-field arrow method; a line table absent from the registry. Multi-read
> methods are COMMON in fan-out modules — every read stands on its own.
5. Consolidated/tenant-wide reports: let owners/all-access see everything (the
   helper returns `undefined`); respect `currentBranchId` when set.
