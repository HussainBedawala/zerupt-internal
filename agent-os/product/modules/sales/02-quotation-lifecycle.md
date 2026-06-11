# Quotation Lifecycle

## Quotation Header

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `number` | string | Sequential: `QT-0001` |
| `customerId` | string | |
| `branchId` | string | |
| `currency` | string | Transaction currency |
| `exchangeRate` | decimal | Informational (rate at creation) |
| `status` | enum | See state machine |
| `validUntil` | date | Expiry date |
| `subtotal` | decimal | |
| `taxTotal` | decimal | |
| `total` | decimal | |
| `notes` | string | |
| `salesOrderId` | string | Set when converted to SO |
| `createdBy` | string | |
| `createdAt` | datetime | |

## Quotation Line

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `quotationId` | string | |
| `itemId` | string | |
| `description` | string | Free text override |
| `quantity` | decimal | |
| `unitPrice` | decimal | Resolved from pricing engine or manual |
| `taxGroupId` | string | |
| `taxAmount` | decimal | |
| `lineTotal` | decimal | |

---

## State Machine

```
Draft → Sent → Accepted → Converted
              ↘ Rejected
Draft → Expired (auto, if validUntil passes)
Sent  → Expired (auto, if validUntil passes)
```

| Transition | Guard |
|-----------|-------|
| Draft → Sent | At least one line. Customer active. |
| Sent → Accepted | Manual action (customer accepted). |
| Sent → Rejected | Manual action (customer declined). |
| Accepted → Converted | Creates a Sales Order from this quotation. Sets `salesOrderId`. |
| Any open → Expired | System auto-transitions when `validUntil < today`. |

---

## Conversion to Sales Order

On `Accepted → Converted`:

1. Create a new Sales Order with status `Draft`
2. Copy header fields (customer, currency, branch)
3. Copy all lines (items, quantities, prices, tax)
4. Link: `quotation.salesOrderId = newSO.id` and `salesOrder.quotationId = quotation.id`
5. SO must still be explicitly confirmed (Draft → Confirmed)

---

## No Financial or Inventory Effects

Quotations are informational. They:
- Do not reserve stock
- Do not create journal entries
- Do not emit events to Accounting or Inventory
- Do not enforce credit limits

---

## Document Numbering

| Document | Default Prefix | Example |
|----------|---------------|---------|
| Quotation | `QT-` | `QT-0001` |

Sequential, no gaps. Prefix configurable per tenant.
