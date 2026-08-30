# Sales Module Backend Audit — Phase E

Scope: `erp/apps/api/src/sales/**` + sales posting through accounting/inventory. Code + DB read-only audit, no browser, no writes. Cross-checked against `study/sales/_hardening-log.md` claims.

---

## CRITICAL

### 1. Customer bulk-deactivate bypasses the blast-radius guard (CONFIRMED)

The single-edit path enforces a party blast-radius check (open orders/invoices/AR) before letting a customer be deactivated, but the guard lives in the CONTROLLER, not the service — and the bulk endpoint calls the service directly, skipping it entirely. This is the exact defect class the purchase module already fixed on the supplier side (guard moved into the service so both entry points share it) and sales never mirrored that fix.

Evidence:
- `apps/api/src/sales/customers/customers.controller.ts:163-179` — `updateCustomer` (single PATCH) runs:
  ```
  if (body.status === "inactive") {
    const force = forceParam === "true";
    const blast = await this.graphService.blastRadius(ctx.tenantId, "party", id);
    enforceBlastRadius(blast, force);
  }
  ```
- `apps/api/src/sales/customers/customers.controller.ts:139-148` — `bulkUpdateCustomers` calls `this.customersService.bulkUpdateCustomers(...)` directly, no blast-radius call anywhere in that path.
- `apps/api/src/sales/customers/customers.service.ts:868-895` — `bulkUpdateCustomers` loops `input.ids` and calls `this.updateCustomer(tenantId, id, input.set)` — the SERVICE method, not the controller — so the controller's guard never runs.
- `grep -n "enforceBlastRadius\|blastRadius" customers.service.ts` returns nothing — the service has zero blast-radius awareness.
- `customers.dto.ts:114-129` — `bulkUpdateCustomersSchema.set.status` accepts `CustomerStatus` (including `inactive`), so a bulk request of up to 200 customer ids with `set: { status: "inactive" }` deactivates every one of them with no dependents check and no `force` semantics at all.
- Confirmed the purchase-side fix this should have mirrored: `apps/api/src/suppliers/suppliers.controller.ts:187-213` and `suppliers.service.ts:676-698` — the blast-radius guard was moved INTO `SuppliersService.updateSupplier`, with an explicit comment: "the one implementation this PATCH and bulkUpdateSuppliers both call — so it can never be bypassed by either entry point."

Impact: a user with only `sales.customer.update` can mass-deactivate customers with open sales orders, unpaid invoices, or AR balances via `POST /tenant/sales/customers/bulk`, bypassing the exact protection the single-record path enforces. Fix is mechanical: move the guard into `CustomersService.updateCustomer` (or a shared helper both call), same pattern as suppliers.

---

## HIGH

### 2. `costAtSale` returned on invoice detail with no server-side `cost.view` enforcement (CONFIRMED)

`GET /tenant/sales/invoices/:id` (gated only by `sales.invoice.read`) always includes each line's `costAtSale` in the response, with no permission check gating that field — the exact shape of the POS defect referenced in the brief ("POS shipped `costAtSale` to cashiers with zero server enforcement").

Evidence:
- `apps/api/src/sales/invoices/sales-invoices.service.ts:236-263` — `toLineResponse` unconditionally sets `costAtSale: l.costAtSale` on every line of the response used by `create`, `get`, `confirm`, etc.
- `apps/api/src/sales/invoices/sales-invoices.controller.ts:149-189` — `get()` calls `this.service.get(...)` and returns `{ data: { ...data, edit } }` with no cost-field stripping or permission check based on `cost.view`.
- Contrast with the module that DOES this correctly: `apps/api/src/inventory/stock-levels/stock-levels-cost-permission.ts` defines a shared `COST_VIEW_PERMISSION = "inventory.cost.view"` constant, and `stock-levels.controller.ts:31-33` calls `permissionService.hasPermission(..., [COST_VIEW_PERMISSION])` to decide whether to include cost data. Sales invoices have no equivalent call anywhere — `grep -n "cost.view" sales-invoices.service.ts sales-invoices.controller.ts` only turns up two comments (about the unrelated `originalCostLots` void-response field), never an actual enforcement call.
- DB proof this is reachable by an under-privileged role: `role_permissions` on the dev tenant shows the **Viewer** role holds `sales.invoice.read` and `sales.invoice.list` but does **not** hold `inventory.cost.view`:
  ```
  Viewer|sales.invoice.list
  Viewer|sales.invoice.read
  Accountant|inventory.cost.view   (only Accountant has it)
  ```
  So a Viewer-role user can `GET` any invoice detail and receive every line's unit cost.

Only the void endpoint's `originalCostLots` field is deliberately excluded from serialization (correctly, per the comment at `sales-invoices.controller.ts:327`) — but the routine detail/create/confirm response's per-line `costAtSale` was never given the same treatment.

---

## MEDIUM

### 3. Shared `document.amended` outbox dead-letter (PUR-064) reaches sales amend paths too (CONFIRMED shared defect, not sales-specific in origin)

`AmendSagaRunnerService.finalize` (the ONE shared amend engine, `apps/api/src/common/amend/amend-saga-runner.service.ts:510-520`) inserts an outbox row of `eventType: "document.amended"` unconditionally on every completed amendment, regardless of which adapter (purchase order, sales invoice, sales order, credit note, direct sale) drove it:

```ts
await this.outbox.insert(tenantId, "document.amended", {
  documentType: adapter.documentType, mode: input.mode,
  originalDocumentId: documentId, amendedDocumentId, amendmentId, correlationId,
}, tx);
```

`OutboxPollerService` has no branch for `"document.amended"` anywhere (`grep -n "document.amended" outbox-poller.service.ts` — no hits), so it can neither fan out nor post it, and it dead-letters permanently — exactly the PUR-064 shape.

DB proof this is live right now on the dev tenant:
```
select event_type, status, count(*) from accounting_event_outbox group by 1,2;
document.amended|failed|1
```
The one stuck row's payload is `{"documentType":"purchase.order", ...}` — so this specific instance is the already-known purchase-side occurrence, not a fresh sales one. But `apps/api/src/sales/invoices/sales-invoice-amend.adapter.ts`, `sales/orders/sales-order-amend.adapter.ts`, `sales/credit-notes/credit-note-amend.adapter.ts`, and `sales/direct/direct-sale-amend.adapter.ts` all register with the SAME `AmendSagaRunnerService.finalize`, so any completed `sales.invoice.amend` / `sales.order.amend` / `sales.creditNote.amend` (via void+recreate) will insert the identical unconsumed `document.amended` row and dead-letter the same way. This is not a new sales-specific bug — it is proof the known shared-runner bug is not module-scoped and will recur on the sales side the next time an amend is used. Fix belongs in `OutboxPollerService` (or the shared runner), once, for every adapter.

---

## LOW / FRICTION

### 4. No sales.order.amend period validation (SUSPECTED — likely correct-by-design, flagging for visibility)

`sales/orders/sales-orders.service.ts` has zero calls to `validatePeriod` anywhere in the file, while every other financially-posting sales flow (invoice confirm/void/amend, credit note confirm/void, debit note confirm, receipt post/reverse, receivable write-off) does call it. This is consistent with sales orders never posting a JE (posting happens at invoice/direct-sale confirm per Layer 1 of the hardening log) — so this is very likely correct, not a gap. Flagging only because it stood out as the one confirm-type action with zero period gate; if a future change ever makes SO confirm touch the GL (e.g. deferred revenue), period validation would need to be added at that point.

### 5. Guard-mirroring and maker-checker checks that came back CLEAN (no finding, recorded for completeness)

- Credit-note confirm's manager-PIN + distinct-approver gate is genuinely conditional on the tenant setting `require_invoice_approval` (currently `false`/OFF on this dev tenant — verified via `select require_invoice_approval from tenant_identity` → `f`). This matches the documented, deliberate "settings-optional approval gate, default OFF" pattern used elsewhere in the codebase (POS approval gates) rather than being a bypass; the code comment at `credit-notes.service.ts:396-399` states this explicitly. Not a finding.
- Self-approval is explicitly rejected at the shared gate: `apps/api/src/approval-pin/pin-verification.service.ts:354-358` throws when `approvedBy === actingUserId`, logging an "SoD rejection" — so a single role holding both permissions still cannot rubber-stamp itself. Confirmed clean.
- Receipt post/reverse: `FOR UPDATE` + status re-assert inside the tx (`receipt-vouchers.service.ts:823, 877-885`), `pinVerification.verifyApproval` on reverse (`:921`), `validatePeriod` on post/reverse (`:417, :653, :1075`). Matches the hardening log's claims — confirmed by direct read.
- FX asymmetry (item 9 in the brief): credit notes against a foreign-currency invoice are explicitly **blocked** (422, fail-loud), not silently posted at today's rate — `apps/api/src/sales/credit-notes/credit-notes.service.ts:462-473`. This is the CORRECT behavior per the brief's own instruction not to port purchase's fail-loud expectation incorrectly; it's actually fail-loud here too, which is right. Not a finding.
- Flag-as-proxy-for-quantity (item 6): DB schema check (`information_schema.columns` on all sales-adjacent tables) found no boolean standing in for a delivered/invoiced/returned/settled quantity — only legitimate UI-state booleans (`is_primary`, `price_override`, `is_opening`). `sales_order_lines` has no `invoiced_qty` column at all, but that's because partial-invoicing tracking doesn't exist yet (already an explicitly-disclosed founder follow-up in the hardening log, not a hidden flag standing in for it). Not a new finding.
- Permission gating parity (item 1): every mutating route across all 12 sales controllers carries `@RequiresPermission`; none found ungated. Every mutation also carries `@Audited` except the deliberately-documented exceptions (`preview` endpoints — no mutation; amend endpoints — the shared `AmendSagaRunnerService` owns the audit trail itself, documented inline at each call site). Consistent with the module's own stated design, not a gap.
- Document-commit-before-GL-posts (item 7): every posting path checked (invoice confirm/void, credit note confirm, receipt post/reverse) wraps the outbox insert in the SAME db transaction as the status/document write (`buildInvoiceConfirmedPayload + outbox insert`, `buildReceiptPostedPayload + outbox insert`, etc., all inside `db.transaction`), so no path found where the document commits ahead of / independent from its GL posting record. No sub-fils-rounding-throws-after-commit pattern found in the invoice/credit-note/receipt confirm paths inspected.

---

## Summary

- 1 CRITICAL (customer bulk-deactivate blast-radius bypass — mechanical fix, mirrors the already-shipped supplier-side fix)
- 1 HIGH (`costAtSale` leaks to any `sales.invoice.read` holder without `cost.view`, confirmed reachable by the Viewer role on this tenant)
- 1 MEDIUM (shared `document.amended` outbox dead-letter, PUR-064, proven live in this DB right now, and structurally will recur on any sales amend since it shares the same runner code)
- Everything else hunted (permission/audit parity, maker-checker SoD, period validation, FX-on-credit-notes, flag-as-quantity-proxy, commit-before-GL) came back clean on direct inspection — the hardening log's claims for those areas held up.
