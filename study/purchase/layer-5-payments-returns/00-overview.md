# Layer 5: Supplier Payments, Purchase Returns, AP Aging, Period Integrity

Layer 5 is the settlement + correction + reporting layer. It sits atop Layers 1-4 (PO, GRN, bill) and is the point where AP is finally relieved or reversed.

## Scope

| Domain | What it covers |
|--------|----------------|
| Supplier payments | Vouchers, partial payments, advances, early-pay discounts, FX at settlement, advance allocation |
| Purchase returns | Return-to-supplier from a confirmed GRN, partial returns, stock reversal, debit note AP reduction |
| AP aging | 0-30 / 31-60 / 61-90 / 90+ day buckets tied to the AP subledger-of-record |
| Period integrity | `validatePeriod` across payments and returns; HardLock blocks, SoftLock requires override reason |
| Multi-currency | FX realized on settlement (payment) and on advance application |
| Dual path | Both PO-chain bills and direct-purchase (inventory-only) flow through the same payment service |

## Key Files

| File | Purpose |
|------|---------|
| `erp/apps/api/src/purchase/payments/supplier-payments.service.ts` | Core payment logic |
| `erp/apps/api/src/purchase/payments/supplier-payment-fx.ts` | Realized FX math |
| `erp/apps/api/src/purchase/payments/supplier-payments-events.ts` | Outbox event builders |
| `erp/apps/api/src/purchase/returns/purchase-returns.service.ts` | Return confirm logic |
| `erp/apps/api/src/purchase/returns/purchase-returns-events.ts` | Return event builders |
| `erp/apps/api/src/purchase/overview/purchase-overview.service.ts` | AP KPI + aging inputs |
| `erp/apps/api/src/suppliers/supplier-ap-balance.service.ts` | GL-derived AP subledger |
| `erp/apps/api/src/accounting-events/listeners/purchase-accounting.listener.ts` | JE construction |
| `agent-os/product/modules/purchase/05-purchase-returns.md` | Spec: returns |
| `agent-os/product/modules/purchase/06-supplier-payments.md` | Spec: payments |

## Document Numbers

| Document | Sequence key | Example |
|----------|-------------|---------|
| Payment voucher | `PAY` (PV- prefix) | `PV-0001` |
| Purchase return | `PR` | `PR-0001` |

## Approval / SOD

| Action | Gate |
|--------|------|
| Payment post | Maker-checker via `requirePaymentApproval` tenant setting (default OFF). When ON: different manager + PIN required. |
| Return confirm | Always manager-gated — always PIN required regardless of tenant setting. |

## Status Summary vs Spec

| Feature | Status |
|---------|--------|
| Standard payment (partial, full) | EXISTS |
| Advance payment + allocation | EXISTS |
| Early-payment discount (splitDiscount) | EXISTS |
| FX gain/loss at settlement (F3) | EXISTS |
| Payment reversal | REQUIRES — spec says "corrections via a reversing payment document"; no reverse endpoint exists |
| Return from GRN (partial) | EXISTS |
| Return over-return guard | EXISTS |
| Debit note AP reduction | EXISTS (via confirm JE) |
| Return cancellation / reversal | REQUIRES — no cancel/void endpoint on returns |
| AP aging (dedicated report) | REQUIRES — overview service has `overdueAp` scalar; no bucket breakdown per supplier |
| Cheque payment method | REQUIRES — schema has `bank_transfer`/`cash` enums; cheque path in spec but not in DB enum |
