# 05 — Credit Limit and Blocked Customer

## Credit Limit

### Schema

`sales_customers.credit_limit` — `sales.ts` line ~101:
- `numeric(18,4)`, nullable.
- Nullable = no limit configured.
- Comment (line 102): "credit ENFORCEMENT at invoice/order confirmation is a deferred product decision and is intentionally NOT implemented here."

### Check Implementation

`sales-invoices.service.ts` — `checkCreditLimit()` method, lines ~984–1029:

```
Outstanding = SUM(sales_invoices.balance WHERE status='confirmed' AND customer_id = X)
Projected = outstanding + this_invoice.total
isOverLimit = creditLimit IS NOT NULL AND projected > creditLimit
```

Returns a `CreditLimitCheckResult` object:
```ts
{ creditLimit, currentOutstanding, thisInvoiceTotal, projectedOutstanding, isOverLimit }
```

**This method NEVER throws.** It returns a warning flag only. The invoice confirm path does not call it as a hard gate.

### Enforcement Gap

**Spec (`01-customer-model.md`):**
> If exceeded: Block confirmation. Manager PIN required to override.

**Actual behavior:**
- `checkCreditLimit()` exists as an API endpoint (likely called by the frontend to show a warning).
- Invoice/order `confirm()` does NOT call `checkCreditLimit()` internally and does NOT hard-block on over-limit.
- A manager PIN override flow does not exist.
- The schema comment explicitly documents this as intentionally deferred.

**Impact:** A customer can be invoiced beyond their credit limit with no system block.

### Credit Limit in DTO

`customers.dto.ts` line ~25–45:
- `creditLimitField = z.number().nonnegative().finite()` (Zod)
- `CreateCustomerInput.creditLimit: creditLimitField.optional()`
- `UpdateCustomerInput.creditLimit: creditLimitField.nullable().optional()`

Credit limit IS in the backend DTO — it can be set via API. But the frontend `CreateCustomerPayload` and `UpdateCustomerPayload` in `apps/web/src/features/customers/types.ts` do NOT include `creditLimit`. No credit limit field exists in the customer form UI.

---

## Blocked Customer

### Schema

`salesCustomerStatus` enum: `active | inactive | blocked` — exists (`enums.ts`).

**Missing columns:**
- `blocked_reason` (varchar) — no column.
- `blocked_at` (timestamptz) — no column.

### Guard on Document Creation

**Spec (`01-customer-model.md`):**
> Blocked: No new documents. No new credit sales. Cash sales via POS still allowed. Existing payments continue.

**Actual behavior in `sales-invoices.service.ts`:**
Searched for `assertNotBlocked`, `blocked`, `status` checks in the invoice confirm path — NONE FOUND. There is no guard preventing a `blocked` customer from having new invoices created or confirmed.

**Actual behavior in `sales-orders.service.ts`:**
Same search — no blocked guard in order creation or confirm path.

This means:
- A blocked customer can have new quotations, orders, and invoices created and confirmed.
- The `blocked` status is purely cosmetic in the current implementation.

### Blocked Reason in Audit Trail

The spec says "Blocking requires a reason (stored in audit trail)." The customer update endpoint accepts `status: 'blocked'` directly via `UpdateCustomerInput` with no `reason` field required. No audit log entry is created for status transitions (no `customer_status_history` table or equivalent).

---

## Transition Guards Summary

| Guard | Spec | Implemented |
|-------|------|-------------|
| Active → Blocked requires reason | Yes | No |
| Blocked customer: block new invoice confirm | Yes | No |
| Blocked customer: block new order confirm | Yes | No |
| Blocked customer: allow POS cash sales | Yes (allow) | N/A (not enforced at all) |
| Over-limit: block invoice confirm | Yes (hard block + PIN) | No (warning only) |
| Inactive: block new documents | Yes | No explicit check found |
