# Phase D — Purchase: Payments, Returns/Refunds, Landed Costs (STATIC audit)

Scope: routes 90-96 + 83-85 (supplier payments, returns, refund receipts, landed costs).
Method: full read of controllers, services, allocation math, DTOs, frontend list/detail/create
panels, and DB schema (`psql`). No browser used this wave (shared session owned by another agent).
No writes made (nothing to log in `_documents-created.md`). Balance-proof at session start:
`round(sum(debit-credit),6) = 0.000000` — OK, unchanged (no writes performed).

Note: `supplier_payments`, `purchase_returns`, `landed_costs`, `supplier_refund_receipts` are all
**0 rows** on the Gulf Auto Parts tenant — nothing has ever been posted through these three screens
on this DB. Everything below is a code-level finding; nothing could be cross-checked against a real
audit_log row or a live GL posting for these specific document types (the `audit_log` query for
these four entity types returned 0 rows for the same reason). A future wave should exercise create
→ post → reverse for at least one of each as `accountant1`/`storekeeper1` to get first live evidence.

---

## Non-findings (verified, deliberately listed so nobody re-audits these)

1. **Backend permission parity is solid and consistently elevated for money-moving actions.**
   `SupplierPaymentsController`, `PurchaseReturnsController`, `LandedCostsController`,
   `SupplierRefundReceiptsController` — every POST/PATCH/DELETE carries `@RequiresPermission`.
   Post/reverse/void/confirm all sit behind a tight 5-req/60s throttle and are documented as
   PIN-gated (SoD) inline. Payment reverse and return void deliberately **reuse** the
   post/confirm permission (documented: "the manager who can post can reverse") — frontend
   `payment-detail-panel.tsx` gates the Reverse button on the same `paymentPost` permission
   (`apps/web/src/features/purchase/components/payment-detail-panel.tsx:77,304`), so
   frontend/backend parity holds.
2. **The one-step create+post/create+confirm AND-permission trap is closed everywhere in scope.**
   `SupplierPaymentsController.create` (`postImmediately`) and `PurchaseReturnsController.create`
   (`confirm: true`) both call `assertAllPermissions` for the composed permission set instead of
   relying on the OR-only `@RequiresPermission` decorator alone — the exact pattern the addendum
   flags as the historical trap (`DirectPurchaseController`/`QuotationsController.convertToInvoice`
   precedent). Verified by reading both controllers end to end.
3. **Landed cost allocation math is rigorous and 3dp/6dp-safe.**
   `landed-costs-allocation.math.ts` stores at `MONEY_SCALE = 6` (numeric(19,6) in DB — confirmed
   via `\d landed_cost_allocations`, `\d supplier_payments`, `\d purchase_returns`,
   `\d supplier_refund_receipts`, all `numeric(19,6)`), uses a largest-remainder (Hamilton) method
   with a signed-remainder fix (this was previously fixed per the hardening log; verified the fix is
   still present — removal path only pulls from lines with a **positive** floored allocation, so a
   zero-weight/zero-qty line can never be pushed negative). `allocateManual` routes its own residue
   through the same largest-remainder helper rather than a bare tolerance check, so Σ allocations
   always equals the component amount exactly. No 2dp truncation found anywhere in this file or in
   any of the three list/detail panels (grepped for `toFixed(2)` / `minimumFractionDigits: 2` across
   payments, landed-costs, returns, refund-receipts components — zero hits).
4. **No tax UI leak in the returns flow.** `previewQuery.data.taxMode` is threaded through, but both
   `return-create-lines-table.tsx:324` and `return-detail-panel.tsx:333` conditionally render the
   tax row only `if (totals.taxMode !== "none")`, with an inline comment noting this is
   server-derived from the return's own line tax codes, "never gated on legalEntities.taxSystem or
   a country check." For the Kuwait tenant this row will never render. Payments and landed costs
   have no tax concept at all (correctly — landed cost lines are cost components, not taxable
   supplies). Confirmed non-finding.
5. **Money inputs in the return line table are read-only display, not free-text.** Unit price and
   return value are `formatMoneyAmount(...)` display cells; only quantity (`QuantityInput`) and
   serial numbers are editable per line, so there is no hand-rolled money-parsing path here that
   could truncate precision.
6. **Frontend defaults are good on the payment create panel.** `payment-create-panel.tsx`: branch
   pre-seeded via `useSeededDefaultBranchId()`, payment date defaults to today
   (`todayIsoDate()`), payment method defaults to `cash`, exchange rate defaults to `"1"`. This
   matches the "defaults over questions" standard — worth calling out as a genuine positive.
7. **Missing `@Audited` on `POST :id/amend` (both payments and returns) is NOT a gap.** The amend
   saga (`AmendSagaRunnerService`) writes its own audit rows via `writeFinalizeAuditEntries` inside
   the finalize transaction (`amend-saga-runner.service.ts:494`), so the controller-level decorator
   would be redundant. Checked this is consistent with the landed-cost/return controllers (landed
   costs have no amend endpoint in scope; return and payment both follow the same pattern).
8. **Route nav gating matches the addendum's established pattern** (nav entry hidden by
   `PK.purchase.paymentList` / `.returnList` / `.landedcostList` per the codemap; page-level
   components additionally gate the Create button on the create permission and route data itself
   through server-enforced `.list`/`.read`, surfaced via `ErrorState` with retry on any query error
   — not a crash). This is consistent with how the rest of the Zerupt frontend does route protection
   (server-enforced, nav-hidden, not a client route guard), so not flagging as a gap specific to
   this module.

---

## FRICTION (confirmed, part of an already-open cross-cutting item)

### FRICTION-1 (confirmed): payments/returns/landed-costs list panels lack `placeholderData:
keepPreviousData`; pager unmounts on every page/filter change

This is the addendum's already-open cross-cutting item ("~30 list panels lack `placeholderData:
keepPreviousData`") — recording purchase's specific share, not a new class of bug.

- `usePaymentsQuery` (`apps/web/src/features/purchase/api/purchase-queries.ts:642`), and the
  equivalent list queries in `returns-queries.ts` and `landed-costs-queries.ts`, are plain
  `useQuery({ queryKey, queryFn })` with no `placeholderData`.
- `payments-list-panel.tsx:243`: `query.isLoading ? <TableSkeleton /> : ...`. In TanStack Query v5,
  `isLoading` is true whenever there is no cached data for the *current* query key — which is true
  every time the page number or a filter changes the key, since there's no previous-page cache to
  fall back to.
- The pager itself is conditionally rendered — `{meta && <TablePagination ... />}`
  (`payments-list-panel.tsx:320`) — and `meta` comes from `query.data`, which is `undefined` during
  that refetch. So clicking "next page" makes the entire table (rows AND the pager that was just
  clicked) disappear and get replaced by a full-height skeleton, then reappear.
- Same pattern confirmed present (via grep, not manually clicked) in `landed-costs-list-panel.tsx`
  and `returns-list-panel.tsx` — none of the three query hooks in scope opt into
  `keepPreviousData`.
- Severity: FRICTION, not HIGH — no data corruption, no stale data shown (the opposite problem:
  it clears data too eagerly), and this is explicitly called out as already-tracked/open in the
  addendum, so filing it again as new would inflate the count. Recording for completeness of this
  wave's coverage.

---

## Open items carried forward, not re-litigated (per addendum instruction)

- Full multi-currency FX remains fail-loud by design in this scope too — `exchange_rate` columns on
  `supplier_payments` / `landed_costs` / `purchase_returns` all default to `1` and carry a
  `> 0` check; did not attempt to force a non-1 rate through any of the three flows since the
  addendum states this is deferred and explicitly asks not to re-file it.
- Company-wide cost pools: not directly exercised by payments/returns/landed-costs (they don't
  write `item_cost_pools`), so nothing to add here.
- The five near-identical approval-toggle helpers noted as debt in the 2026-08-08 hardening entry
  (payment/bill/return/invoice/refund) still exist as separate files — confirmed
  `requireRefundApproval`, `requireReturnApproval`, `requirePaymentApproval` are each their own
  private helper rather than one `ApprovalToggleService`. Not re-filing as a new finding — this was
  already logged as acknowledged debt.

---

## Summary

No CRITICAL, HIGH, or MEDIUM findings in this scope. Permission gating (frontend/backend parity,
AND-composition for one-step create+post/confirm), audit coverage, and money precision
(numeric(19,6) storage, largest-remainder allocation, no 2dp truncation, no tax-UI leak) are all
solid across supplier payments, purchase returns, supplier refund receipts, and landed costs. One
FRICTION item recorded (missing `keepPreviousData` causing pager/table flash on page change),
which is the purchase module's share of an already-tracked cross-cutting issue, not a new defect
class. The main gap in this wave is empirical, not code-level: all four tables are empty on the
Gulf Auto Parts tenant, so nothing here has been observed posting a real GL entry, writing a real
audit row, or surviving a real reverse/void round-trip in the browser — that live verification is
still owed and should be the first thing the next wave (or a follow-up write-enabled session) does
for this scope.
