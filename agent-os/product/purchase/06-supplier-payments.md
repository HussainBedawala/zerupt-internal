# Supplier Payments (AP)

## Payment Voucher Header

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `number` | string | Sequential: `PV-0001` |
| `supplierId` | string | |
| `branchId` | string | |
| `status` | enum | `Draft`, `Posted` |
| `paymentDate` | date | |
| `paymentMethod` | enum | `Cash`, `BankTransfer`, `Cheque` |
| `bankAccountId` | string | Source bank/cash account |
| `currency` | string | Payment currency |
| `exchangeRate` | decimal | Rate at posting |
| `totalAmount` | decimal | Total paid in transaction currency |
| `totalAmountFN` | decimal | Total in functional currency |
| `type` | enum | `Standard`, `Advance` |
| `notes` | string | |
| `postedAt` | datetime | |
| `postedBy` | string | |
| `approvedBy` | string | Manager PIN |
| `createdAt` | datetime | |

## Payment Allocation Lines

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `paymentVoucherId` | string | |
| `sourceDocumentType` | enum | `GRN`, `PurchaseReturn` (credit offset) |
| `sourceDocumentId` | string | |
| `allocatedAmount` | decimal | Amount applied to this document (transaction currency) |
| `allocatedAmountFN` | decimal | Functional currency |
| `originalRate` | decimal | Exchange rate when document was booked |
| `fxGainLoss` | decimal | Realized FX difference (functional currency) |

---

## Payment Types

### Standard Payment

Applied against one or more outstanding GRNs/invoices. Partial payment allowed — allocate any amount up to document balance.

### Advance Payment

No allocation at posting. Amount credited to Supplier Prepayments (1161). See `accounting/04-chart-of-accounts.md`.

Later allocation to GRN:
```
DR  Trade Payables (2111)           [allocated amount]
CR  Supplier Prepayments (1161)     [same]
```

---

## Early Payment Discount

If payment within `paymentTerms.discountDays`:

| Field | Value |
|-------|-------|
| Discount amount | `allocatedAmount × discountPercent / 100` |
| Net paid | `allocatedAmount - discountAmount` |
| Account | Purchase Discount Income (4810) |

See `accounting/07-event-mappings.md` → `purchase.payment.posted` early discount entry.

---

## Multi-Currency Settlement

When payment currency differs from invoice booking rate, realized FX gain/loss calculated per allocation line:

```
fxGainLoss = allocatedAmountFN_at_payment_rate - allocatedAmountFN_at_original_rate
```

Favorable (paid less FN) → Realized FX Gain (4820).
Unfavorable (paid more FN) → Realized FX Loss (7210).

See `accounting/03-multi-currency.md`.

---

## State Machine

```
Draft → Posted
```

No reversal of payment voucher. Corrections via a new reversing payment document.

| Transition | Guard |
|-----------|-------|
| Draft → Posted | `validatePeriod(paymentDate)` must return `OPEN` or `SOFT_LOCKED` (see `accounting/08-period-control.md`). Manager PIN required (`approvedBy`). Bank/cash account has sufficient balance (if enforced). Total allocations ≤ `totalAmount`. |

---

## Post Side Effects

On `Draft → Posted`:

1. Emit `purchase.payment.posted` (see `08-event-mappings.md`)
2. Accounting: journal entry (see `accounting/07-event-mappings.md` → `purchase.payment.posted`)
3. Update supplier outstanding balance
4. If cheque: create cheque record with status `Issued` (see `accounting/07-event-mappings.md` → cheque events)

---

## Document Numbering

| Document | Default Prefix | Example |
|----------|---------------|---------|
| Payment Voucher | `PV-` | `PV-0001` |

Sequential, no gaps. Prefix configurable per tenant.
