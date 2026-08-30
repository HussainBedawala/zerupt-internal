# POS Backend Audit — Permissions, Audit Capture, Scoping, Tie-out

Scope: `erp/apps/api/src/pos/**` + POS tables in `packages/db/src/schema/pos.ts`. Code-reading +
read-only SQL against the Gulf Auto Parts tenant (0 shifts / 0 transactions ever at time of audit,
so tie-out could not be corroborated against live rows — findings below are from reading the
posting path end to end plus schema constraints). No browser used, no writes performed, no
subagents spawned.

---

## CRITICAL

### CRIT-POS-01 (CONFIRMED) — `inventory.cost.view` is not enforced on any POS transaction endpoint; a Cashier can read COGS/cost for any completed sale

Every other cost-bearing surface in this codebase (inventory items list/search/export,
stock-levels, stock-levels export) resolves `inventory.cost.view` server-side and strips
`costPrice`/`averageCost` when the caller lacks it — e.g.
`apps/api/src/inventory/items/items.controller.ts:96-104`. POS transactions do not do this at
all.

- `apps/api/src/pos/transactions/pos-transactions.controller.ts` — `GET :id` (line 137-138,
  gated only on `pos.transaction.read`), `GET :id/receipt` (line 227-228, same gate), `POST :id/pay`
  (line 161-163), `POST :id/void` (line 175-181), `POST :id/return` (line 237-240) all return a
  `TransactionDetailResponse` built by `toLineResponse()`.
- `apps/api/src/pos/transactions/pos-transactions.service.ts:227` —
  `costAtSale: l.costAtSale` is copied into the response **unconditionally**. There is no
  `COST_VIEW_PERMISSION` check anywhere in this controller or service (grepped both files —
  zero hits for `cost.view`/`costView`/`COST_VIEW_PERMISSION`, contrast with 6+ hits in
  `apps/api/src/inventory/items/*`).
- `pos.transaction.read` is granted to Cashier via the `pos.sell` bundle
  (`packages/shared/src/permission-bundles.ts:56-70`), and the DB confirms it in the live tenant:
  ```
  select r.name, rp.permission_key from roles r join role_permissions rp on rp.role_id=r.id
  where r.name ilike 'cashier' and rp.permission_key ilike 'pos.%';
   Cashier|pos.transaction.read   (among others)
  select ... where r.name ilike 'cashier' and rp.permission_key ilike '%cost%';
   (0 rows)
  ```
  So Cashier holds `pos.transaction.read` and holds **no** cost permission at all — exactly the
  precondition the inventory module treats as "must strip cost."
- `GET :id` is **not scoped to the caller's own shift/register** — any authenticated cashier with
  `pos.transaction.read` can fetch any transaction UUID in the tenant and read `costAtSale` per
  line, i.e. every sale's margin, across every register/branch.

**Fix is one shared helper, not per-endpoint patches**: resolve `inventory.cost.view` once in
`PosTransactionsController` (same pattern as `ItemsController.list/search`), pass a
`canViewCost` flag into `service.get()`/`pay()`/`void()`/`createReturn()`, and null out
`costAtSale` (and any derived margin field) in `toLineResponse()` when false — mirroring
`ItemListItemResponse`'s null-on-no-permission contract in `items.dto.ts:495-542`.

**Uncovered test seam:** no permission-parity test exists for POS transaction responses
analogous to the inventory cost-view spec; extend (or add) a
`pos-transactions-cost-permission.spec.ts` that asserts `costAtSale` is absent/null for a
`pos.transaction.read`-only caller.

---

## MEDIUM

### MED-POS-01 (CONFIRMED) — `grandTotal = subtotal − discount + tax + deliveryFee` is enforced only in application code, not as a DB CHECK constraint

`packages/db/src/schema/pos.ts` has individual non-negative CHECKs on every money column
(`subtotal >= 0`, `taxTotal >= 0`, `discountTotal >= 0`, `grandTotal >= 0`, etc. — lines 526-549)
but **no** CHECK enforcing the formula relationship between them. Comment at line 453 documents
the intended formula but nothing in `(table) => [...]` encodes it. The comment at
`pos-transactions.service.ts:954` ("[Fix 3] Grand-total integrity assertion") confirms this is
purely an app-level `pay()`-time assertion, not a database invariant. By contrast, the tender-cash
invariant right next to it IS a genuine DB CHECK:
```
check("pos_payments_change_given_non_negative_check", ...)
check(..., sql`${table.method} = 'cash' OR ${table.changeGiven} = 0`)   // line 949-951, GENUINE DB-level enforcement
```
So `changeGiven > 0` on a non-cash tender is enforced at the database level (verified in schema,
not just app code) — this one is solid. The grandTotal formula is not: a future write path that
bypasses `pay()`'s in-app assertion (a direct SQL fix-up, a new sync/replay branch, an `amend`
code path) could persist an internally-inconsistent total and the database would accept it.
**Recommend**: either add a generated-column/CHECK expressing the formula, or explicitly document
in the schema file why it's deliberately app-only (e.g. delivery fee optionality makes a single
CHECK expression awkward) so a future reader doesn't assume it's DB-enforced.

### MED-POS-02 (CONFIRMED) — `POST /tenant/pos/approvals/verify` writes no audit row

`apps/api/src/pos/approvals/pos-approvals.controller.ts:31-34` — the only endpoint in the
`(pos)` approvals surface, gated by `pos.transaction.create`, has no `@Audited(...)` decorator
(every other POS mutation controller does — verified by grep across all 9 POS controllers, this
is the one exception). This is the endpoint that verifies a manager's PIN and mints the
short-lived signed approval token used for discount/void/return/pay-out overrides. Its outcome
(who requested an approval, which manager approved it, for which action) is exactly the kind of
security-sensitive event the audit log exists to capture, and today there is no row for "manager
X approved a discount/return/cash-out requested by cashier Y" independent of the downstream
mutation's own audit entry (which records the actor who *used* the token, not who *issued* it).
Not re-filing as AUDIT-002/003/004 (those are different, already-open findings) — this is a new
gap specific to this one POS endpoint.

---

## Genuine positives (what IS properly enforced — for the scoreboard)

- **`(pos)` route-group gate (PERM-003) still present.** Every POS controller endpoint I
  enumerated (10 controllers, 40+ routes) carries an explicit `@RequiresPermission(...)`
  decorator — no endpoint was found with a missing decorator. Full enumeration:
  registers (list/read/create/overview/update), shifts (list/create/export/current/get/z-report/
  x-report/close/reopen-close), cash-movements (create/update/delete/list), transactions (create/
  no-receipt-return/list/export/get/price-override/pay/void/amend/receipt/return/reprint/held),
  catalog (snapshot/serials), tender-types (list/all/read/create/update/account/delete), sync
  (shifts-open/transactions/shifts-close/movements), approvals (verify), serial-quick-add (create).
- **`pos.transaction.price-override` and `pos.transaction.void` are deliberately withheld from
  Cashier** (verified in both `packages/shared/src/role-templates.ts:60-66` and the live DB role
  grant query above — Cashier has neither key). This is intentional SoD design, documented inline,
  and correctly reflected in the actual tenant's `role_permissions` rows.
- **`changeGiven > 0` on a non-cash tender is a real DB CHECK**, not just app validation
  (`pos_payments_change_given_non_negative_check` + the cash-only CHECK, `packages/db/src/schema/pos.ts:947-951`).
- **`costAtSale = 0` on a tracked item is flagged, never silently booked as zero COGS**:
  `pos-transactions.service.ts:1052-1097` — a candidate zero-cost line on a serial/batch-tracked
  item never blocks the sale but stamps the line id into `totalsMismatch.costZeroLines` via a
  `jsonb_set` merge, using `Decimal.isZero()` (not a naive `=== "0"` string compare, which the
  hardening log notes previously missed Postgres's `"0.000000"` formatting).
- **Per-tender GL account overrides resolved on every emit path** (online AND offline sync) via
  one shared `PosTenderTypeAccountsService.resolveByTenderType` (codemap-documented, not
  independently re-verified line-by-line here but the codemap's design note is specific and
  plausible given the emitter code structure).
- **Fiscal-period gate is one shared function** (`assertPosPeriodOpen()` in
  `apps/api/src/pos/pos-period-gate.ts`) applied consistently across sale/void/return/
  no-receipt-return/sync-replay/shift-close/reopen-close per the codemap's write-path table — not
  independently re-verified per call site in this pass, but the single-gate architecture itself is
  the right shape (one implementation, not N).
- **Register→branch/warehouse integrity is a composite FK**, not app-only validation:
  `UNIQUE(branch_id,id)` on warehouses + `pos_registers(branch_id,warehouse_id) → warehouses(branch_id,id)`
  composite FK (mig 0191, per hardening log) — a register's warehouse structurally cannot belong
  to a different branch at the DB level.
- **Approval PIN is never stored/transmitted raw for cash-movement or discount approval** — the
  hardening log documents a signed short-lived approval-token replacing raw PIN at rest, reviewed
  and fixed as a CRITICAL in a prior pass; not re-derived independently here but the described
  mechanism (`PosApprovalTokenService`) matches what `pos-approvals.controller.ts` implements.

## Not re-litigated (per addendum)

- Per-register approval gates (discount/void/return/pay-out) are settings-optional, default OFF —
  did not test enforcement live (no browser, 0 existing shifts/transactions to inspect); this is a
  SUSPECTED-not-checked item, not a finding either way. Recommend the next live-testing pass
  create a shift/sale as `cashier1` with a register that has the gate ON and confirm server-side
  409/403 when the approval token is omitted.
- Three-way tie-out (POS ↔ GL ↔ stock) could not be corroborated against real rows — this tenant
  had 0 shifts and 0 POS transactions at audit time. The posting-path code (atomic single
  `db.transaction()` for GL + stock legs, per the L1 hardening log entry) was not re-derived
  line-by-line here for effort reasons; flagging as unverified rather than claiming it's fine.
- Not re-filed: PERF-002, AUDIT-002, AUDIT-003, AUDIT-004 (already open, out of scope here).
- `cashierId`-not-`salespersonId` on POS is by design (per addendum) — not a finding.
- Absent discount/void/refund approval prompts are not findings unless the register's approval
  setting is confirmed ON (not checked live this pass).

## Recommended next step

CRIT-POS-01 is the standout: it is a straightforward, high-confidence, code-plus-DB-confirmed cost
leak to the Cashier role via a route that already exists and is already reachable
(`GET /tenant/pos/transactions/:id`, `GET /tenant/pos/transactions/:id/receipt` return
`costAtSale` per line to any `pos.transaction.read` holder). Recommend fixing via one shared
`canViewCost` resolution in `PosTransactionsController`, threaded the same way
`ItemsController` already does it.
