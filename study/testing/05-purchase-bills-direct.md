# Phase D — Purchase: Bills (order path) vs Direct Purchase — static audit

Method: static code read (controllers, services, DTOs, adapters, frontend components) +
psql against the Gulf Auto Parts tenant DB + targeted grep. No browser used (per scope —
another agent owns the shared session). No test data written (nothing needed writing to
reach these findings; balance invariant re-verified below regardless).

Routes covered: `/:locale/purchase/invoices{,/new,/:id,/:id/edit}` (79-82) and
`/:locale/purchase/direct{,/new,/:id,/:id/edit}` (71-74).

Pre-check (required by briefing):
```
select round(sum(debit-credit),6) from journal_entry_lines;  →  0.000000   (clean)
```

---

## HIGH-1 (CONFIRMED) — the seeded "Accountant" role has ZERO purchase permissions; the
task's own persona instruction cannot be exercised as specified

The wave brief says: *"The persona for billing is accountant1, NOT the owner. Check the
accountant's permission set completes a bill."* It does not.

**Evidence (DB, Gulf Auto Parts tenant):**
```
select r.name, rp.permission_key from role_permissions rp join roles r on r.id=rp.role_id
where rp.permission_key like 'purchase.%' order by 1,2;
```
returns rows only for **Viewer** (`purchase.*.list` / `purchase.*.read` — read-only). The
**Accountant** role (`role_permissions` filtered to `r.name='Accountant'`) has **59 total
permission keys and zero of them start with `purchase.`**. Only 4 roles exist in this tenant
(Owner, Cashier, Accountant, Viewer — one user each), matching `packages/shared/src/
role-templates.ts`.

**Root cause in code**, `packages/shared/src/role-templates.ts`:
- `accountant` template (line 272) composes `accounting.*`, `reports.*`,
  `settings.finance-config.view`, `settings.audit`, `inventory.view/cost`, and import keys.
  It **never calls `purchaseBundleKeys(...)` at all** — not even `purchase.view`.
- Only the **`manager`** template calls `purchaseBundleKeys(["purchase.create",
  "purchase.confirm", "purchase.view"])` (line 176). `viewer` gets `purchase.view` only
  (line 259). `refund-approver` gets `purchase.refund` + `purchase.view` only.

**Practical consequence:** as currently seeded, `accountant1` cannot see the Purchase nav
group at all (`nav-items.ts` gates it on `PK.purchase.orderList`, which Accountant lacks),
cannot list/read/create/confirm/void a bill on either path, and cannot use direct purchase
either (`purchase.bill.create` required on `POST /tenant/purchase/direct-purchases`, also
absent). Every purchase.* endpoint on both controllers correctly 403s for this user — this is
NOT a crash or a silent failure (defensible security behaviour) — but it means the specific
persona instruction in this wave ("bill as accountant1") describes a workflow the shipped
role model does not support. Either:
(a) this is a genuine gap — an accounting-department role should reasonably be able to record
   and approve supplier bills (it holds `accounting.post` and can post journals directly but
   not through the AP subledger UI), or
(b) it is intentional and "Manager" is the correct billing persona, in which case the test
   plan (not the product) is wrong.

This is reported as HIGH rather than CRITICAL because it fails closed (clean 403, no data
corruption, no cross-tenant leak) and is a role-template/persona-design question rather than a
runtime bug. Flagging for a founder decision either way — it blocks re-running this specific
wave's persona instruction as written until resolved (either grant Accountant `purchase.view`
+ `purchase.bill.*` + `purchase.payment.*`, or confirm Manager is correct and update the test
brief).

**This is symmetric across both paths** — it is not a path-divergence finding, it blocks
both equally.

---

## MEDIUM-1 (CONFIRMED) — direct-purchase's tax-row visibility is client-derived from the
tenant's tax-group catalogue; the bill's is server-derived from the actual posted totals

`apps/web/src/features/purchase/components/bill-summary.tsx:57-60`:
```
{/* Tax row visibility is server-derived (taxMode) from the resolved tax
    ... Never gated on legalEntities.taxSystem or a country check. */}
{bill.taxMode !== "none" && ( ... )}
```
`bill.taxMode` comes back from `PurchaseInvoicesService` — it reflects what the confirmed (or
previewed) document actually computed.

`apps/web/src/features/purchase/components/direct/direct-purchase-form-fields.tsx:789-791`:
```
showTaxRow={
  taxGroupsQuery.isPending || taxGroupsQuery.isError || taxGroupsQuery.hasGroups
}
```
This shows the tax row whenever the **tenant's tax-group catalogue is non-empty**, regardless
of whether any line on THIS document actually carries a tax group. For the Kuwait, no-tax
tenant this is currently harmless (the catalogue itself is empty, so `hasGroups` is false and
the row never renders — verified no VAT-shaped strings are hardcoded in either component).
But the two mechanisms are not the same invariant: a tenant that has ANY tax groups configured
tenant-wide (e.g. a future multi-country entity) would show a "Tax: 0.000 KWD" row on every
direct purchase even for an item with no tax group, while the bill path would correctly hide
it. Path divergence, not a live bug for the current no-tax tenant — file as a MEDIUM for
consistency, not urgency.

---

## Non-finding (verified, do not re-open) — money precision

Both DTOs share the exact same `moneySchema` re-export
(`apps/api/src/purchase/invoices/money.schema.ts` → `../../common/money.schema`, backed by
`numeric(19,6)`), so there is no precision divergence between the two paths. Grep for
`.toFixed(2)` across every direct-purchase and bill component returned zero hits. No 2dp
rendering found on either path.

## Non-finding (verified) — audit coverage on mutations

Both controllers decorate every direct mutation with `@Audited(...)`:
- Bills: `create`, `save`, `fromGrn`, `patchHeader`, `addLine`, `updateLine`, `removeLine`,
  `confirm`, `void` — all `@Audited("PurchaseInvoice", ...)`.
- Direct purchase: `create` → `@Audited("DirectPurchase")`.
- Both `void`/`amend` on **both** controllers correctly OMIT the controller-level `@Audited`
  decorator with an explicit comment explaining why (`AmendSagaRunnerService` writes the
  document-keyed audit rows itself at finalize — a controller decorator would double-write).
  This is consistent and intentional on both paths, not a gap.

## Non-finding (verified) — PIN / SoD / maker-checker parity on void

- `PurchaseInvoicesService.voidBill` gates PIN+SoD only when `requireBillApproval` is ON
  (tenant setting), matching the founder-approved five-approval-toggle pattern.
- `DirectPurchaseAmendAdapter` (used for BOTH direct-purchase void and amend) reads the same
  `needsApproval` flag before requiring `approvedBy`/`approvalPin` at the `voidGrn` step —
  same conditional gate, not hardcoded true. No divergence.

## Non-finding (verified) — FX guard

Both `billExchangeRateSchema` (invoices) and the direct-purchase path route through the same
`purchase-fx-guard.ts` refusal for derived-currency paths. Per founder ruling 2026-08-27, full
FX is deferred; this tenant is KWD-only so the guard never fires in practice here. Not
re-litigated, not filed.

## Non-finding (verified) — CSV export exists symmetrically

`apps/api/src/purchase/invoices/export/bill-export.controller.ts` (`tenant/purchase/invoices/
export`, gated `purchase.bill.list`) and `apps/api/src/purchase/direct/export/
direct-purchase-export.controller.ts` (`tenant/purchase/direct-purchases/export`, same
permission) both exist, both stream, both gated identically. Frontend wiring
(`bills-export-dialog.tsx` / `direct-purchase-export-dialog.tsx` +
`bills-export-columns.ts` / `direct-purchases-export-columns.ts`) is present for both.

## FRICTION-1 (CONFIRMED, cross-cutting item already open — recording the purchase instance)

Neither the bill list panel nor the direct-purchase list panel uses `placeholderData:
keepPreviousData` (grep for `placeholderData` across `apps/web/src/features/purchase/`
returned zero hits outside a test file). This matches the already-open cross-cutting note
("~30 list panels lack placeholderData... Purchase's share is in scope") — recorded here as
confirmed for purchase specifically, not filed as a new issue, per the addendum's instruction
not to re-litigate settled/known items.

---

## Path divergence table (order/bill path vs direct path)

| Invariant | Order path (`/purchase/invoices`) | Direct path (`/purchase/direct`) | Divergence? |
|---|---|---|---|
| Money schema | `moneySchema` (numeric 19,6) | same `moneySchema` import | None |
| Create permission | `purchase.bill.create` | `purchase.bill.create` (+ AND-composed `purchase.grn.confirm`, and payment perms when paid) | None (direct correctly composes the extra sub-operation perms it performs) |
| Confirm/settle permission | `purchase.bill.approve` (ANDed with create via `assertAllPermissions` on the `/save` fast path) | folded into the same create call (grn.confirm + bill.create [+ payment.create/post]) | Consistent pattern, different composition — expected given direct is one atomic call |
| Void mechanism | Two mechanisms: a simple direct `/void` (confirmed-but-unpaid only, `voidBill`, `@Audited` at controller) **and** a full amend saga `/amend` (cancel/edit, handles paid bills too) | Only ONE mechanism: always the amend saga (`/void` route itself calls `runAmend` with `mode:"cancel"`) | Structural difference, not a correctness gap — direct purchases don't have a "confirmed but unpaid, simple void" special case worth a fast path since they're always fully posted (GRN+bill[+payment]) in one shot |
| PIN/SoD on void | Conditional on `requireBillApproval` | Conditional on the same flag, read inside the shared adapter | None |
| Audit on void/amend | Omitted at controller (amend runner writes it) | Same | None |
| Tax row visibility | Server-derived `taxMode` | Client-derived from tenant-wide tax-group catalogue presence | **MEDIUM-1 above** |
| CSV export | `bill-export.controller.ts`, `purchase.bill.list` | `direct-purchase-export.controller.ts`, `purchase.bill.list` | None |
| `placeholderData`/keepPreviousData | Missing | Missing | None (both missing equally — known cross-cutting issue) |
| Accountant role can reach it | No (0 purchase perms) | No (0 purchase perms) | None — blocks both equally, see HIGH-1 |
| FX fail-loud | Enforced via `purchase-fx-guard.ts` | Same guard | None |

---

## Summary

The dual path is genuinely well-hardened for the invariants that matter most (money schema,
audit coverage, PIN/SoD gating, FX guard, export symmetry) — no path divergence found in any
of those. The one live UI divergence (MEDIUM-1, tax-row visibility source) is currently
invisible in the no-tax Kuwait tenant and does not need urgent action.

The headline finding of this wave is **not** a code bug but a **role-model gap that blocks
the wave's own persona instruction**: the seeded Accountant role in this tenant (and the
underlying `accountant` role template in `packages/shared/src/role-templates.ts`) has no
`purchase.*` permissions whatsoever — not even read — so `accountant1` cannot open, list, or
touch either the bill or the direct-purchase screen. Reported as HIGH-1 for a founder decision:
either widen the Accountant template (likely `purchase.view` + `purchase.bill.*` +
`purchase.payment.*`, none of `purchase.order.create`/`purchase.return.create` unless also
intended) or confirm Manager is the intended billing persona and correct future test briefs.
