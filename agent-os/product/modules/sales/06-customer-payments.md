# Customer Payments (AR)

## Receipt Voucher Header

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `number` | string | Sequential: `RV-0001` |
| `customerId` | string | |
| `branchId` | string | |
| `status` | enum | `Draft`, `Posted` |
| `paymentDate` | date | |
| `paymentMethod` | enum | `Cash`, `BankTransfer`, `Cheque` |
| `bankAccountId` | string | Destination bank/cash account |
| `currency` | string | Payment currency |
| `exchangeRate` | decimal | Rate at posting |
| `totalAmount` | decimal | Total received in transaction currency |
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
| `receiptVoucherId` | string | |
| `sourceDocumentType` | enum | `Invoice`, `CreditNote` (offset) |
| `sourceDocumentId` | string | |
| `allocatedAmount` | decimal | Amount applied (transaction currency) |
| `allocatedAmountFN` | decimal | Functional currency |
| `originalRate` | decimal | Exchange rate when document was booked |
| `fxGainLoss` | decimal | Realized FX difference (functional currency) |

---

## Payment Types

### Standard Payment

Applied against one or more outstanding invoices. Partial payment allowed — allocate any amount up to invoice balance.

### Advance Payment

No allocation at posting. Amount credited to Customer Deposits (2151). See `accounting/04-chart-of-accounts.md`.

Later allocation to invoice:
```
DR  Customer Deposits (2151)        [allocated amount]
CR  Trade Receivables (1131)        [same]
```

### Overpayment

If `totalAmount > sum(allocations)`, excess amount posted to Customer Deposits (2151).

---

## Early Payment Discount

If payment within `paymentTerms.discountDays`:

| Field | Value |
|-------|-------|
| Discount amount | `allocatedAmount × discountPercent / 100` |
| Net received | `allocatedAmount - discountAmount` |
| Account | Sales Discounts (4300) |

See `accounting/07-event-mappings.md` → `sales.receipt.posted` early discount entry.

---

## Multi-Currency Settlement

When payment currency differs from invoice booking rate, realized FX gain/loss calculated per allocation line:

```
fxGainLoss = allocatedAmountFN_at_payment_rate - allocatedAmountFN_at_original_rate
```

Favorable (received more FN) → Realized FX Gain (4820).
Unfavorable (received less FN) → Realized FX Loss (7210).

See `accounting/03-multi-currency.md`.

---

## State Machine

```
Draft → Posted
```

No reversal of receipt voucher. Corrections via a new reversing receipt document.

| Transition | Guard |
|-----------|-------|
| Draft → Posted | `validatePeriod(paymentDate)` must return `OPEN` or `SOFT_LOCKED` (see `accounting/08-period-control.md`). Manager PIN required (`approvedBy`). Total allocations ≤ `totalAmount`. |

---

## Post Side Effects

On `Draft → Posted`:

1. Emit `sales.receipt.posted` (see `08-event-mappings.md`)
2. Accounting: journal entry (see `accounting/07-event-mappings.md` → `sales.receipt.posted`)
3. Update invoice `paidAmount` and `balance` for each allocated invoice
4. Update customer outstanding balance
5. If cheque: create cheque record with status `Received` (see `accounting/07-event-mappings.md` → cheque events)

---

## Document Numbering

| Document | Default Prefix | Example |
|----------|---------------|---------|
| Receipt Voucher | `RV-` | `RV-0001` |

Sequential, no gaps. Prefix configurable per tenant.
