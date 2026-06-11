# Purchase Event Mappings

Every purchase event with its payload schema. Journal entry details are in `accounting/07-event-mappings.md`. Stock movement details are in `inventory/05-stock-movements.md`.

---

## Event Envelope

All events follow the standard envelope defined in `accounting/01-architecture.md`:

| Field | Type | Description |
|-------|------|-------------|
| `eventId` | UUID | Unique. Idempotency key — duplicate `eventId` silently ignored by consumers. |
| `eventType` | string | Event name |
| `tenantId` | string | |
| `branchId` | string | Originating branch |
| `sourceDocumentType` | string | `PurchaseOrder`, `GRN`, `LandedCost`, `PurchaseReturn`, `PaymentVoucher` |
| `sourceDocumentId` | string | |
| `sourceDocumentNumber` | string | Human-readable (e.g., `PO-0042`) |
| `occurredAt` | datetime | Business date → journal entry posting date |
| `currency` | string | Transaction currency |
| `exchangeRate` | decimal | Rate to functional currency |
| `payload` | object | Event-specific (see below) |

---

## `purchase.order.confirmed`

**Emitted when:** PO transitions Draft → Confirmed.

**Consumers:** Inventory (increase `onOrder` qty).

**No accounting entry.** PO confirmation is a commitment, not a financial transaction.

```json
{
  "purchaseOrderId": "uuid",
  "purchaseOrderNumber": "PO-0042",
  "supplierId": "uuid",
  "warehouseId": "uuid",
  "lines": [
    {
      "lineId": "uuid",
      "itemId": "uuid",
      "orderedQty": 100,
      "unitPrice": 10.000
    }
  ]
}
```

---

## `purchase.order.cancelled`

**Emitted when:** PO transitions Confirmed → Cancelled (only if zero GRNs exist).

**Consumers:** Inventory (decrease `onOrder` qty).

**No accounting entry.**

```json
{
  "purchaseOrderId": "uuid",
  "purchaseOrderNumber": "PO-0042",
  "lines": [
    {
      "lineId": "uuid",
      "itemId": "uuid",
      "cancelledQty": 100
    }
  ]
}
```

---

## `purchase.grn.confirmed`

**Emitted when:** GRN transitions Draft → Confirmed.

**Consumers:** Inventory, Accounting.

**Inventory effect:** GRN_RECEIPT movement — see `inventory/05-stock-movements.md`.

**Accounting effect:** See `accounting/07-event-mappings.md` → `purchase.grn.confirmed`.

```json
{
  "grnId": "uuid",
  "grnNumber": "GRN-0015",
  "purchaseOrderId": "uuid",
  "purchaseOrderNumber": "PO-0042",
  "supplierId": "uuid",
  "warehouseId": "uuid",
  "hasSupplierInvoice": false,
  "supplierInvoiceNumber": null,
  "lines": [
    {
      "lineId": "uuid",
      "itemId": "uuid",
      "receivedQty": 50,
      "unitPrice": 10.000,
      "taxGroupId": "uuid",
      "taxBreakdown": [
        { "taxCodeId": "uuid", "rate": 5.00, "amount": 25.000 }
      ],
      "lineTotal": 525.000,
      "serialNumbers": ["SN001", "SN002"],
      "batchInfo": { "batchNumber": "B001", "expiryDate": "2027-06-30" }
    }
  ],
  "subtotal": 500.000,
  "taxTotal": 25.000,
  "total": 525.000
}
```

---

## `purchase.landedCost.allocated`

**Emitted when:** Landed Cost transitions Draft → Posted.

**Consumers:** Inventory, Accounting.

**Inventory effect:** WAC recalculation or FIFO layer update — see `inventory/04-cost-engine.md`. Retroactive COGS adjustment if items sold — see `accounting/05-cogs-logic.md`.

**Accounting effect:** See `accounting/07-event-mappings.md` → `purchase.landedCost.allocated`.

```json
{
  "landedCostId": "uuid",
  "landedCostNumber": "LC-0003",
  "components": [
    {
      "componentId": "uuid",
      "description": "Sea Freight",
      "amount": 500.000,
      "creditAccountType": "Payable",
      "creditEntityId": "uuid"
    }
  ],
  "allocations": [
    {
      "grnId": "uuid",
      "grnLineId": "uuid",
      "itemId": "uuid",
      "allocatedAmount": 250.000,
      "receivedQty": 50,
      "additionalCostPerUnit": 5.000
    }
  ],
  "totalAmount": 500.000
}
```

---

## `purchase.return.confirmed`

**Emitted when:** Purchase Return transitions Draft → Confirmed.

**Consumers:** Inventory, Accounting.

**Inventory effect:** PURCHASE_RETURN movement — see `inventory/05-stock-movements.md`.

**Accounting effect:** See `accounting/07-event-mappings.md` → `purchase.return.confirmed`.

```json
{
  "purchaseReturnId": "uuid",
  "purchaseReturnNumber": "PR-0005",
  "grnId": "uuid",
  "purchaseOrderId": "uuid",
  "supplierId": "uuid",
  "warehouseId": "uuid",
  "reason": "Damaged goods",
  "lines": [
    {
      "lineId": "uuid",
      "itemId": "uuid",
      "returnQty": 10,
      "unitCost": 10.500,
      "unitPrice": 10.000,
      "taxGroupId": "uuid",
      "taxBreakdown": [
        { "taxCodeId": "uuid", "rate": 5.00, "amount": 5.000 }
      ],
      "lineTotal": 105.000,
      "serialNumbers": ["SN001"]
    }
  ],
  "subtotal": 100.000,
  "taxTotal": 5.000,
  "total": 105.000
}
```

---

## `purchase.payment.posted`

**Emitted when:** Payment Voucher transitions Draft → Posted.

**Consumers:** Accounting.

**No inventory effect.**

**Accounting effect:** See `accounting/07-event-mappings.md` → `purchase.payment.posted`.

```json
{
  "paymentVoucherId": "uuid",
  "paymentVoucherNumber": "PV-0010",
  "supplierId": "uuid",
  "paymentMethod": "BankTransfer",
  "bankAccountId": "uuid",
  "type": "Standard",
  "totalAmount": 525.000,
  "totalAmountFN": 161.175,
  "allocations": [
    {
      "sourceDocumentType": "GRN",
      "sourceDocumentId": "uuid",
      "allocatedAmount": 525.000,
      "allocatedAmountFN": 161.175,
      "originalRate": 0.307,
      "paymentRate": 0.307,
      "fxGainLoss": 0.000
    }
  ],
  "discountAmount": 0.000,
  "discountAccountCode": "4810"
}
```

---

## Idempotency

- Every event carries a unique `eventId` (UUID)
- Consumers (Accounting Engine, Inventory Engine) reject duplicate `eventId` silently
- If a GRN confirmation fails mid-transaction, the event is not emitted (transactional with source document state change)
- Retry-safe: re-emitting the same event with the same `eventId` is a no-op

---

## Period Validation

Before emitting any financial event (`purchase.grn.confirmed`, `purchase.landedCost.allocated`, `purchase.return.confirmed`, `purchase.payment.posted`), the Purchase module must call `validatePeriod(date)`:

| Result | Action |
|--------|--------|
| `OPEN` | Proceed |
| `SOFT_LOCKED` | Proceed with warning logged |
| `HARD_LOCKED` | Block. Do not emit event. Return error to user. |

See `accounting/08-period-control.md`.
