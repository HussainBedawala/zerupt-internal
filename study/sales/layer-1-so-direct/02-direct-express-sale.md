# Layer 1 — Direct / Express Sale Path

## Path: apps/api/src/sales/direct/direct-sale.service.ts

---

## Architecture: Is it a real-reuse path or a parallel drift-prone engine?

**VERDICT: REAL REUSE. Atomic. Idempotent. No parallel engine.**

The `DirectSaleService.create()` method orchestrates entirely through the existing sales machinery in ONE Postgres transaction:

```
db.transaction(async tx => {
  1. insert salesInvoices (draft, number=DRAFT-<uuid>)
  2. insert salesInvoiceLines (qty in base units, prices, pack snapshot)
  3. invoices.confirm(tenantId, userId, invoiceId, confirmInput, compose)
     └── stock OUT + COGS + AR/Revenue/OutputTax via existing listeners
  4. [if paid] receipts.create(..., compose)
             + receipts.post(..., compose)     // DR Cash/Bank CR AR
  5. insert directSales anchor (idempotency key UNIQUE per tenant)
})
```

Every accounting posting — stock movements, COGS, AR, Revenue, Output Tax, settlement — flows through `SalesInvoicesService.confirm()` and `ReceiptVouchersService`. No separate journal entry builder, no parallel stock deduction. The anchor row (`directSales` table) is the idempotency record only.

---

## Idempotency Pattern

```
fast-path: findExisting before tx → return replayed result
inside tx: re-check idempotency under lock (findExisting inside tx)
UNIQUE(tenantId, idempotencyKey) index is the final durable guard
race condition: UniqueViolation caught → findExisting → replayed result
```

Pattern is identical to the purchase direct-purchase hardened pattern. Correct.

---

## Governance Parity Vs SO Path

| Gate | SO confirm | Direct sale | Gap? |
|---|---|---|---|
| Customer active check | ✅ `requireActiveCustomer` (service:904) | ✅ `resolveContext` checks `customer.status !== 'active'` (direct:284) | None |
| Credit-limit check | ❌ not on SO confirm | ❌ not on direct sale | Consistent absence — both paths skip it |
| Approval threshold | ❌ not implemented | ❌ not implemented | Consistent absence |
| SoD permission | `sales.order.approve` on confirm endpoint | `sales.direct.create` permission (controller:32) | Both use RBAC |
| Period gate (hard-lock) | N/A (SO is pre-fiscal) | ✅ invoice confirm calls period validation | Invoice engine covers it |
| Fiscal posting via real engine | N/A | ✅ delegates to `SalesInvoicesService.confirm()` | Clean |

No governance drift between paths for the features that ARE implemented. Both paths have the same absent features (credit-limit enforcement, approval threshold).

---

## Exchange Rate Trust Issue

`direct-sale.service.ts:147` hardcodes `exchangeRate: "1"` when creating the draft invoice. Comment at `direct-sale.dto.ts:14` documents this as intentional: "functional-currency only — there is no exchangeRate field."

**Status:** the DTO has no `exchangeRate` field so the client cannot supply a rate. This is correct design for functional-currency-only sales (MENA retail). No client-supplied exchangeRate trust issue exists here.

However: if a tenant transacts in a foreign currency (e.g. USD invoicing from an AED entity), the direct sale path would silently book at rate=1 (functional = transaction). This is a **latent multi-currency gap**, not an active bug for current single-currency tenants.

---

## Pack-Unit Invariant

`direct-sale.service.ts` calls `resolvePackUnit()` for each line (line ~325-340):

```typescript
const pack = await resolvePackUnit(tx, tenantId, line.itemId, line.unit?.unitPackId, ...)
// baseQty = pack.baseQty (base units always stored)
```

`salesInvoiceLines.quantity` stores base units. Pack snapshot columns (`unitPackId`, `unitName`, `unitQty`, `conversionFactor`) are written. This is correct — same invariant as SO lines and purchase lines.

---

## Settlement Modes

| Mode | What happens |
|---|---|
| `paid` | receipt created + posted in same tx (DR Cash/Bank CR AR → AR settles to zero) |
| `credit` | invoice confirmed, AR open, no receipt |

Credit due-date logic: uses `input.settlement.dueDate` if provided, else `saleDate + customer.paymentTermsDays` (default 30 days). Implemented correctly at `direct-sale.service.ts:~210-220`.

---

## Frontend Reachability

Direct sale UI: `apps/web/src/features/sales/components/direct/direct-sale-panel.tsx`

- Panel exists with full form: customer picker + quick-add, branch, date, lines (item search + unit picker), settlement type (paid/credit), payment method, bank account.
- Uses `useCreateDirectSaleMutation()` — wired to the API.
- No credit-limit warning surfaced in the panel.
- No approval gate UI.

SO path UI: `apps/web/src/features/sales-orders/components/order-detail-panel.tsx`
- Confirm / Convert-to-Invoice / Cancel buttons with AlertDialog confirmations — all wired.
- Both paths are reachable from the frontend.
