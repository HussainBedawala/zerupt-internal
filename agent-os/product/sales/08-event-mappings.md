# Sales Event Mappings

Every sales event with its payload schema. Journal entry details are in `accounting/07-event-mappings.md`. Stock movement details are in `inventory/05-stock-movements.md`.

---

## Event Envelope

All events follow the standard envelope defined in `accounting/01-architecture.md`:

| Field | Type | Description |
|-------|------|-------------|
| `eventId` | UUID | Unique. Idempotency key — duplicate `eventId` silently ignored by consumers. |
| `eventType` | string | Event name |
| `tenantId` | string | |
| `branchId` | string | Originating branch |
| `sourceDocumentType` | string | `SalesOrder`, `SalesInvoice`, `CreditNote`, `ReceiptVoucher` |
| `sourceDocumentId` | string | |
| `sourceDocumentNumber` | string | Human-readable (e.g., `INV-0042`) |
| `occurredAt` | datetime | Business date → journal entry posting date |
| `currency` | string | Transaction currency |
| `exchangeRate` | decimal | Rate to functional currency |
| `payload` | object | Event-specific (see below) |

---

## `sales.order.confirmed`

**Emitted when:** SO transitions Draft → Confirmed.

**Consumers:** Inventory (increase `committed` qty).

**No accounting entry.** SO confirmation is a commitment, not a financial transaction.

```json
{
  "salesOrderId": "uuid",
  "salesOrderNumber": "SO-0042",
  "customerId": "uuid",
  "lines": [
    {
      "lineId": "uuid",
      "itemId": "uuid",
      "orderedQty": 100,
      "warehouseId": "uuid",
      "unitPrice": 25.000
    }
  ]
}
```

---

## `sales.order.cancelled`

**Emitted when:** SO transitions Confirmed → Cancelled (only if zero invoices exist).

**Consumers:** Inventory (decrease `committed` qty).

**No accounting entry.**

```json
{
  "salesOrderId": "uuid",
  "salesOrderNumber": "SO-0042",
  "lines": [
    {
      "lineId": "uuid",
      "itemId": "uuid",
      "cancelledQty": 100,
      "warehouseId": "uuid"
    }
  ]
}
```

---

## `sales.invoice.confirmed`

**Emitted when:** Invoice transitions Draft → Confirmed.

**Consumers:** Inventory, Accounting.

**Inventory effect:** SALE movement — decrease stock, decrease committed qty (if from SO), update serials/batches. See `inventory/05-stock-movements.md` → Sale.

**Accounting effect:** See `accounting/07-event-mappings.md` → `sales.invoice.confirmed`.

```json
{
  "invoiceId": "uuid",
  "invoiceNumber": "INV-0042",
  "salesOrderId": "uuid",
  "customerId": "uuid",
  "dueDate": "2026-04-01",
  "lines": [
    {
      "lineId": "uuid",
      "itemId": "uuid",
      "quantity": 50,
      "unitPrice": 25.000,
      "warehouseId": "uuid",
      "costAtSale": 15.000,
      "taxGroupId": "uuid",
      "taxBreakdown": [
        { "taxCodeId": "uuid", "rate": 5.00, "amount": 62.500 }
      ],
      "lineTotal": 1312.500,
      "serialNumber": null,
      "batchId": null
    }
  ],
  "subtotal": 1250.000,
  "taxTotal": 62.500,
  "total": 1312.500
}
```

---

## `sales.creditNote.confirmed`

**Emitted when:** Credit Note transitions Draft → Confirmed.

**Consumers:** Inventory (if `GoodsReturn`), Accounting.

**Inventory effect (GoodsReturn only):** SALE_RETURN movement — increase stock, restore serial status. See `inventory/05-stock-movements.md` → Sale Return.

**No inventory effect for `PriceAdjustment` type.**

**Accounting effect:** See `accounting/07-event-mappings.md` → `sales.creditNote.confirmed`.

```json
{
  "creditNoteId": "uuid",
  "creditNoteNumber": "CN-0005",
  "invoiceId": "uuid",
  "invoiceNumber": "INV-0042",
  "customerId": "uuid",
  "type": "GoodsReturn",
  "reason": "Defective items",
  "lines": [
    {
      "lineId": "uuid",
      "itemId": "uuid",
      "creditQty": 10,
      "unitPrice": 25.000,
      "warehouseId": "uuid",
      "returnCost": 15.000,
      "taxGroupId": "uuid",
      "taxBreakdown": [
        { "taxCodeId": "uuid", "rate": 5.00, "amount": 12.500 }
      ],
      "lineTotal": 262.500,
      "serialNumbers": []
    }
  ],
  "subtotal": 250.000,
  "taxTotal": 12.500,
  "total": 262.500
}
```

---

## `sales.receipt.posted`

**Emitted when:** Receipt Voucher transitions Draft → Posted.

**Consumers:** Accounting.

**No inventory effect.**

**Accounting effect:** See `accounting/07-event-mappings.md` → `sales.receipt.posted`.

```json
{
  "receiptVoucherId": "uuid",
  "receiptVoucherNumber": "RV-0010",
  "customerId": "uuid",
  "paymentMethod": "BankTransfer",
  "bankAccountId": "uuid",
  "type": "Standard",
  "totalAmount": 1312.500,
  "totalAmountFN": 403.138,
  "allocations": [
    {
      "sourceDocumentType": "Invoice",
      "sourceDocumentId": "uuid",
      "allocatedAmount": 1312.500,
      "allocatedAmountFN": 403.138,
      "originalRate": 0.307,
      "paymentRate": 0.307,
      "fxGainLoss": 0.000
    }
  ],
  "discountAmount": 0.000,
  "discountAccountCode": "4300"
}
```

---

## Idempotency

- Every event carries a unique `eventId` (UUID)
- Consumers (Accounting Engine, Inventory Engine) reject duplicate `eventId` silently
- If an invoice confirmation fails mid-transaction, the event is not emitted (transactional with source document state change)
- Retry-safe: re-emitting the same event with the same `eventId` is a no-op

---

## Period Validation

Before emitting any financial event (`sales.invoice.confirmed`, `sales.creditNote.confirmed`, `sales.receipt.posted`), the Sales module must call `validatePeriod(date)`:

| Result | Action |
|--------|--------|
| `OPEN` | Proceed |
| `SOFT_LOCKED` | Proceed with warning logged |
| `HARD_LOCKED` | Block. Do not emit event. Return error to user. |

See `accounting/08-period-control.md`.
