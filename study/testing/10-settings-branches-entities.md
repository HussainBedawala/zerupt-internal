
## 2026-08-30 — repair of 18 pre-existing tests broken by the location-deactivation guard

Context: `apps/api/src/common/location-deactivation-guard.ts` (WAREHOUSE_HAS_STOCK,
BRANCH_HAS_OPEN_SHIFT, BRANCH_HAS_IN_TRANSIT_STOCK, BRANCH_HAS_STOCK) was wired into
`warehouses.service.ts` and `branches.service.ts`, breaking 18 tests (2 warehouses, 16
branches) whose mocked DB could not answer the guard's new queries.

### Classification (CONFIRMED for every item — read the actual failure + the diff before touching anything)

**warehouses.service.spec.ts (2 failing)**
1. `never returns code, nameAlt, type, isDefault, or timestamps` — **(b) GENUINELY OUTDATED**,
   NOT guard-related. `git diff` on `warehouses.service.ts` shows an unrelated, deliberate change
   bundled in the same commit: `listWarehouseDirectory` now includes `type` (store/warehouse/
   transit) so pickers can exclude non-sellable warehouse kinds (e.g. POS can only sell from a
   STORE warehouse). The old test pinned "type excluded". Fixed the test to expect `type`
   included, renamed to state why, and asserted the value is passed through.
2. `cascades deactivation to zones and bins when isActive set to false` — **(a) MOCK GAP**. The
   test's `tx` mock had no `select`, so `readStockPosition` (called via
   `assertWarehouseDeactivatable` at `warehouses.service.ts:270`, only when `deactivating`) threw
   `tx.select is not a function`. Added a `tx.select` chain returning a zero-stock row so the
   already-correct deactivation is allowed through, unchanged test intent.

**branches.service.spec.ts (16 failing)** — investigated whether the guard's call site is
unconditional per the briefing's suspicion. It is NOT: `branches.service.ts:656` computes
`isDeactivating = input.isActive === false && existing.isActive === true` and only calls
`assertBranchDeactivatable` when true — CONFIRMED by reading the code end to end. **No real bug
found in the guard's call site.** The wide blast radius (createBranch, nullable fields, legal-
entity validation, lifecycle events) came from a *different*, legitimate refactor bundled in the
same diff: `updateBranch` was consolidated from 4 branching code paths (legal-entity change /
emirate change / isActive toggle / plain field update, each re-deriving pre-update state its own
way — exactly the shape that lets a guard get missed) into ONE transaction that always does
`tx.query.branches.findFirst` first. A sibling addition, `assertCurrencySupported`, also now
runs inside `createBranch`/`updateBranch` when `currencyCode` is set, querying
`tx.query.tenantCurrencies.findFirst`. Neither belongs to the deactivation guard, but both
needed new mock plumbing:
- 14 tests: **(a) MOCK GAP** — added `tx.query.branches.findFirst` and/or
  `tx.query.tenantCurrencies.findFirst` to each test's `tx` mock (or centrally, in the shared
  `setupUpdateChain` helper and the `setupIsActiveTransition` helper). Assertion intent
  unchanged in all 14.
- 2 tests: **(b) GENUINELY OUTDATED** — `"skips legalEntity validation when legalEntityId is not
  in update payload"` and `"allows clearing emirate to null without a legal-entity lookup"` both
  asserted `expect(mockDb.transaction).not.toHaveBeenCalled()`. That pinned the OLD 4-path
  behaviour (plain field updates bypassed the transaction). The refactor's whole point is that
  every PATCH now runs through one transaction so a guard can never be missed on an untouched
  path — so `db.transaction` being called on a plain update is now the CORRECT behaviour, not a
  regression. Rewrote both tests to assert the actual invariant that still matters (the
  legal-entity lookup itself is skipped when nothing requires it), verified via a spy on
  `legalEntities.findFirst` instead of on `transaction`.
- 0 tests were a real bug exposed by the guard. The call site is clean.

### Guard spec (`location-deactivation-guard.spec.ts`)

Already 7/7 green before and after — no changes needed (no call-site behaviour changed).

### Deliberate-break check — CONFIRMED

Temporarily edited `readStockPosition`'s caller in `assertWarehouseDeactivatable` to
unconditionally `return` before the stock check (`location-deactivation-guard.ts`), i.e. made the
guard never fire. Re-ran `npx jest location-deactivation-guard --no-coverage`:

```
Tests: 2 failed, 5 passed, 7 total
```
The two failures were exactly the stock-block assertions (`HARD-BLOCKS a warehouse holding
stock...` and `every thrown guard is a ConflictException...`), both failing with "Resolved to
value: undefined" instead of rejecting — proof the guard, when broken, is caught by its own spec.
Reverted the edit immediately; confirmed via `grep` that no trace of the break remains and
`git status` shows the file untracked with no diff. Re-ran the guard spec: `Tests: 7 passed, 7
total`.

### Final suite state (all three, one run) — CONFIRMED

```
npx jest branches.service warehouses.service location-deactivation-guard --no-coverage
Test Suites: 3 passed, 3 total
Tests:       102 passed, 102 total
```
(63 branches + 32 warehouses + 7 guard = 102.)

### tsc — CONFIRMED

`npx tsc --noEmit` from `apps/api` produced no output (clean, exit 0 implied by empty diagnostic
output).

### Build/restart

Not performed — no `apps/api/src` production source was changed, only
`branches.service.spec.ts` and `warehouses.service.spec.ts` (plus a revert-only, temporary edit
to `location-deactivation-guard.ts` for the break check, fully undone). No live 409 re-proof was
required per the task's own conditional ("IF YOU CHANGE SOURCE").

### Files touched

- `/Users/hus3ain/Development/Zerupt/erp/apps/api/src/branches/branches.service.spec.ts`
- `/Users/hus3ain/Development/Zerupt/erp/apps/api/src/warehouses/warehouses.service.spec.ts`
- `/Users/hus3ain/Development/Zerupt/erp/apps/api/src/common/location-deactivation-guard.ts`
  (temporary break-and-restore only, net diff is empty)

---

## SET-BILL-001 — billing collapsed onto the administrative `isActive` flag (FIXED)

**Severity: HIGH. Status: FIXED and pinned. All claims below CONFIRMED unless marked.**

### The defect

`BillingMeteringService.getBillableOutletCount()` was
`count(branches) where tenant_id = $1 and is_active = true`. `branches.isActive` is ALSO the
administrative "is this shop open for business" flag, and deactivating a branch is a routine
operational action. So an owner closing a shop for Ramadan or a renovation silently cut their
own invoice, and reopening it silently raised it, with no disclosure and no audit of the money
consequence. This collapsed two of the five independent axes (administration and billing) into
one boolean.

### Reader audit of `branches.isActive`

**Commercial (must follow the billing axis) — 1 reader, this was the whole bug:**

| File | Verdict |
|---|---|
| `apps/api/src/billing/metering/billing-metering.service.ts:73` | THE DEFECT. Fixed. |

**Administrative (correctly follow the admin flag) — unchanged:**

| File | Use |
|---|---|
| `apps/api/src/branches/branches.service.ts` (list filter, directory, transition guard) | list/filter/guard |
| `apps/api/src/purchase-import/purchase-import.service.ts:422`, `.lookup.service.ts:244` | import target must be an open branch |
| `apps/api/src/sales-import/sales-import.lookup.service.ts:156`, `.template-context.service.ts:58` | same |
| `apps/api/src/opening-balance/opening-balance.service.ts:2499` | same |
| `apps/api/src/fx-revaluation/fx-revaluation.service.ts:192` | revalue open branches |
| `apps/api/src/team-users/team-users.service.ts:1671`, `user-profile.service.ts:227,232` | assignable branches |
| `apps/api/src/legal-entities/legal-entities.service.ts:398` | entity deactivation guard |
| `apps/web/src/features/locations/**` (types, status-badge, branches-table, dialogs) | display + filter only |

**Ambiguous, deliberately left alone:** `platform-admin-branch-count.service.ts:56`
(`getActiveBranchCount`) is a platform-admin tenant-detail display labelled "active branches".
It is administrative by its own name and is NOT a billing input (nothing in the billing path
calls it). Left as-is; noted so a future reader does not mistake it for a second billing source.

**Web:** no commercial reader exists. The billing UI reads `subscription.outletCount` straight
from the API (`billing.service.ts:121` -> `getBillableOutletCount`).

### The correct billable signal, and why

**Billable = every branch row PROVISIONED to the tenant, regardless of `isActive`.**

1. **Fairness.** A closed branch keeps its data, users, warehouses, history and reports, and
   reopens in one click. The tenant still holds the seat. A customer would not accept that
   reopening after Ramadan "increases" their price, which is the mirror image of the same bug.
2. **Coherence with the entitlement axis (this is decisive).**
   `BranchesService.assertBranchLimitNotExceeded` already counts branches **without** an
   `isActive` filter against the effective `maxBranches`. Billing counted a different
   population. Consequence, CONFIRMED by reading `apps/web/src/features/billing/components/usage-card.tsx:28`:
   the usage meter renders `outletCount / plan.maxBranches`, so a tenant at 3 of 3 branches with
   one deactivated saw "2 of 3" and was then refused with `BRANCH_LIMIT_REACHED`. What you are
   allowed to hold and what you pay for are now the same set.
3. **Derived, not a second flag.** No new column, no second boolean to drift. The commercial
   fact is the existence of the branch row. Giving an outlet back is an explicit commercial act:
   delete the branch (only possible once it holds no data), which emits `BRANCH_ARCHIVED_EVENT`
   and steps the Razorpay quantity down at cycle end.

Rejected: a disclosure banner (documents the bug instead of removing it); a `billing_status`
column (two hand-maintained flags that can disagree is strictly worse than one wrong flag).

### What was implemented

1. `billing-metering.service.ts` — `getBillableOutletCount` predicate is now
   `eq(branches.tenantId, tenantId)` only. `and` import dropped. Long comment records why the
   admin flag must never come back.
2. `branches.service.ts` `updateBranch` — **removed** the `isActive`-transition emission of
   `BRANCH_CREATED_EVENT` / `BRANCH_ARCHIVED_EVENT`. An administrative toggle no longer moves
   the invoice in either direction. (`previousIsActive` local removed with it.)
3. `branches.service.ts` `deleteBranch` — now emits `BRANCH_ARCHIVED_EVENT` **unconditionally**.
   The old `if (wasActive)` guard was a direct consequence of billing reading `isActive`; with
   the axes separated it would have kept charging for a deleted, administratively-closed branch.
4. Stale docblocks corrected (the `deleteBranch` doc literally claimed deactivation "stops the
   branch from being billed").

`BillingMeteringListener` is the ONLY consumer of both events (verified by grep), so no other
subsystem is affected. **No schema change and NO migration were needed** — hence no backfill and
no re-pricing side effect from a migration.

### Proof no existing customer is re-priced

Gulf Auto Parts, before any change:

```
 active_only | all_rows
-------------+----------
           4 |        4
```
Billable count is **4 under both the old and the new predicate** — identical. (Zerupt has no
other live customers, so no tenant's bill moves as a result of this change.)

### What pins it

`billing-metering.service.spec.ts` — a new stub captures the REAL Drizzle condition and renders
it with `PgDialect`, because the previous shape-only mock could not tell the two queries apart,
which is exactly how the collapsed axes survived review:
- `does NOT filter on the administrative is_active flag` (asserts the rendered SQL).
- 3 parametrised `billable count is unchanged when branches are deactivated` cases, applying the
  service's own predicate to fixtures that differ only in `is_active`.
- the **existing** parametrised quote-vs-Razorpay agreement test was **extended** (not
  duplicated) with `expect(captured.sql).not.toContain("is_active")`, so the agreement is now
  asserted on the separated signal.

`branches.service.spec.ts` — the 3 isActive-transition emission tests were replaced by one
parametrised `emits NO billing lifecycle event` (close / reopen / no-op), and
`does NOT emit ... when deleting an already-inactive branch` was inverted into
`emits BRANCH_ARCHIVED_EVENT when deleting an administratively-closed branch`. Every changed
assertion is a deliberate contract inversion, classified above.

### Deliberate-break result — CONFIRMED

1. Re-added `and(eq(branches.tenantId, tenantId), eq(branches.isActive, true))` to
   `getBillableOutletCount`. `npx jest billing-metering.service --no-coverage` →
   **`Tests: 8 failed, 20 passed, 28 total`**, failures naming
   `Received string: "("branches"."tenant_id" = $1 and "branches"."is_active" = $2)"`.
2. Re-added the isActive-driven emission to `updateBranch`.
   `npx jest branches.service --no-coverage` → **`Tests: 3 failed, 60 passed, 63 total`**.
3. Both restored from byte-for-byte backups; `diff` clean. Re-run:
   `npx jest branches.service billing-metering --no-coverage` →
   **`Test Suites: 3 passed, Tests: 113 passed`**. Full billing tree:
   **`Test Suites: 14 passed, Tests: 264 passed`**.

### tsc

`npx tsc --noEmit` from `apps/api` → exit 0, no diagnostics.

### Live verification

Rebuilt (`pnpm --filter @zerupt/api build`) and restarted the shared API on port 3001 once
(announced). Freshness proven by a NEW SYMBOL in `dist`, not by mtime:
`grep -c "PROVISIONED to the tenant" dist/billing/metering/billing-metering.service.js` → 1, and
the compiled predicate is
`.where((0, drizzle_orm_1.eq)(db_1.branches.tenantId, tenantId));` with no `is_active`.
`GET /api/v1/health` → 503 with `failing: ['email_config']` only (normal on dev).

```sql
-- BEFORE (new predicate vs old predicate)
 billable_new | billable_old
--------------+--------------
            4 |            4

-- ADMINISTRATIVE ACTION
update branches set is_active=false
  where tenant_id='ce603a7c-…' and code='B3_JAHRA_BRANCH';   -- UPDATE 1

-- AFTER
 billable_new | billable_old
--------------+--------------
            4 |            3     <-- old predicate would have silently cut the bill
```

Live API, with B3_JAHRA_BRANCH still deactivated:
`GET /api/v1/tenant/billing/subscription` → `"outletCount": 4` (would have been 3 before the fix).

Branch restored (`is_active=true`), all 4 branches verified active again.

### Write safety

Ledger identity `0.000000` before the first write and `0.000000` after the last. All 24 fiscal
periods still `open`. One row touched (`branches.is_active` on B3_JAHRA_BRANCH), recorded and
restored, restore verified by SQL. No documents created.

### Residual note (SUSPECTED, not actioned)

A branch that has been administratively closed for a long time still bills. That is the correct
default, but a courtesy disclosure on the deactivate dialog ("this branch stays on your plan
while it is closed; delete it to stop being billed", en + ar) would be a reasonable secondary
addition. Not implemented here: it is copy, not the fix, and adding new UI copy was outside the
scope of a billing-correctness change.
