# Cross-Module Contracts

> What POS reads from other modules and what events POS emits for Accounting and Inventory to consume.

## POS Reads from Inventory

These are read-only queries POS makes against the Inventory module. See `inventory/11-cross-module-contracts.md` for the Inventory-side contract.

| Query | Purpose | Used When |
|-------|---------|-----------|
| Item catalog (name, SKU, type, tracking) | Display item in cart | Adding items |
| Barcode lookup | Scan-to-add | Adding items |
| Item search (name, SKU, partial match) | Manual item lookup | Adding items |
| Price resolution | Get selling price per pricing hierarchy | Adding items |
| Stock availability (per warehouse) | Show in-stock indicator | Adding items, optional |
| Serial number list (available) | Serial picker for serial-tracked items | Adding serial items |
| Batch list (available, FEFO order) | Batch selection for batch-tracked items | Adding batch items |
| Category list | Category-based item browsing | Browsing |
| Item cost (WAC or FIFO) | Capture `costAtSale` on transaction line | Completing transaction |
| Tax group for item | Calculate tax per line | Adding items |

### Offline Behavior

All reads above are served from the local cache (IndexedDB) when offline. See `06-offline-mode.md` for cache sync frequency.

## POS Reads from Accounting

| Query | Purpose | Used When |
|-------|---------|-----------|
| Tax groups and rates | Tax calculation per line | Adding items |
| Active fiscal period | Validate transaction date is in open period | Completing transaction |

## POS Reads from Customers

| Query | Purpose | Used When |
|-------|---------|-----------|
| Customer lookup (name, phone, code) | Link customer to transaction | Sale, return |
| Customer store credit balance | Validate store credit payment | Payment |
| Customer price list assignment | Price resolution | Adding items |

## Events POS Emits

### `pos.transaction.completed`

Emitted when a sale transaction is completed (payment finalized).

| Field | Type | Description |
|-------|------|-------------|
| `eventId` | UUID | Idempotency key |
| `eventType` | String | `pos.transaction.completed` |
| `tenantId` | UUID | Tenant |
| `branchId` | UUID | Branch |
| `sourceDocumentType` | String | `PosTransaction` |
| `sourceDocumentId` | UUID | Transaction ID |
| `sourceDocumentNumber` | String | Transaction number |
| `occurredAt` | DateTime | Transaction completion timestamp |
| `currency` | String | Transaction currency |
| `exchangeRate` | Decimal | Rate to functional currency |
| `payload.registerId` | UUID | Register |
| `payload.shiftId` | UUID | Shift |
| `payload.cashierId` | UUID | Cashier |
| `payload.customerId` | UUID | Customer (nullable) |
| `payload.lines[]` | Array | Transaction lines |
| `payload.lines[].itemId` | UUID | Item |
| `payload.lines[].variantId` | UUID | Variant (nullable) |
| `payload.lines[].serialNumber` | String | Serial (nullable) |
| `payload.lines[].batchId` | UUID | Batch (nullable) |
| `payload.lines[].quantity` | Decimal | Quantity sold |
| `payload.lines[].unitPrice` | Decimal | Price per unit |
| `payload.lines[].discountAmount` | Decimal | Line discount |
| `payload.lines[].taxAmount` | Decimal | Line tax |
| `payload.lines[].lineTotal` | Decimal | Line total |
| `payload.lines[].costAtSale` | Decimal | Item cost |
| `payload.lines[].warehouseId` | UUID | Stock deducted from |
| `payload.payments[]` | Array | Payment records |
| `payload.payments[].method` | Enum | Payment method |
| `payload.payments[].amount` | Decimal | Amount |
| `payload.payments[].reference` | String | Card auth code etc. |
| `payload.subtotal` | Decimal | Subtotal |
| `payload.taxTotal` | Decimal | Tax total |
| `payload.discountTotal` | Decimal | Discount total |
| `payload.grandTotal` | Decimal | Grand total |

**Consumers:**
- **Accounting** → Creates journal entries: DR Cash Register (1112) / Bank / Deposits → CR Sales (4110) / Tax (2131). Per line: DR COGS (5100) → CR Inventory (1141). See `accounting/07-event-mappings.md`.
- **Inventory** → Decreases stock, updates serial status to `Sold`. See `inventory/11-cross-module-contracts.md`.

### `pos.return.completed`

Emitted when a return transaction is completed.

| Field | Type | Description |
|-------|------|-------------|
| `eventId` | UUID | Idempotency key |
| `eventType` | String | `pos.return.completed` |
| `tenantId` | UUID | Tenant |
| `branchId` | UUID | Branch |
| `sourceDocumentType` | String | `PosReturn` |
| `sourceDocumentId` | UUID | Return transaction ID |
| `sourceDocumentNumber` | String | Return transaction number |
| `occurredAt` | DateTime | Return completion timestamp |
| `currency` | String | Transaction currency |
| `exchangeRate` | Decimal | Rate to functional currency |
| `payload.originalTransactionId` | UUID | Original sale |
| `payload.registerId` | UUID | Register |
| `payload.shiftId` | UUID | Shift |
| `payload.lines[]` | Array | Returned lines (same structure as sale) |
| `payload.refunds[]` | Array | Refund payments |
| `payload.refunds[].method` | Enum | Refund method |
| `payload.refunds[].amount` | Decimal | Refund amount |

**Consumers:**
- **Accounting** → DR Sales Returns (4200) / Tax (2131) → CR Cash Register (1112) / Bank. DR Inventory (1141) → CR COGS (5100). See `accounting/07-event-mappings.md`.
- **Inventory** → Increases stock, restores serial status to `Available`. See `inventory/11-cross-module-contracts.md`.

### `pos.void.completed`

Emitted when a completed transaction is voided.

| Field | Type | Description |
|-------|------|-------------|
| `eventId` | UUID | Idempotency key |
| `eventType` | String | `pos.void.completed` |
| `tenantId` | UUID | Tenant |
| `branchId` | UUID | Branch |
| `sourceDocumentType` | String | `PosVoid` |
| `sourceDocumentId` | UUID | Original transaction ID |
| `sourceDocumentNumber` | String | Original transaction number |
| `occurredAt` | DateTime | Void timestamp |
| `payload.voidedById` | UUID | Manager who voided |
| `payload.voidReason` | String | Reason |
| `payload.originalTransaction` | Object | Full original transaction data |

**Consumers:**
- **Accounting** → Full reversal of original sale journal entries. See `accounting/07-event-mappings.md`.
- **Inventory** → Full reversal of original stock movements.

### `pos.shift.closed`

Emitted when a shift is closed.

| Field | Type | Description |
|-------|------|-------------|
| `eventId` | UUID | Idempotency key |
| `eventType` | String | `pos.shift.closed` |
| `tenantId` | UUID | Tenant |
| `branchId` | UUID | Branch |
| `sourceDocumentType` | String | `PosShift` |
| `sourceDocumentId` | UUID | Shift ID |
| `sourceDocumentNumber` | String | `{registerCode}-SHIFT-{shiftNumber}` |
| `occurredAt` | DateTime | Shift close timestamp |
| `payload.registerId` | UUID | Register |
| `payload.cashierId` | UUID | Cashier |
| `payload.openingFloat` | Decimal | Opening cash |
| `payload.expectedCash` | Decimal | Calculated expected |
| `payload.actualCash` | Decimal | Counted actual |
| `payload.cashOverShort` | Decimal | Difference |
| `payload.bankDeposit` | Decimal | Amount deposited to bank |
| `payload.payIns` | Decimal | Total pay-ins during shift |
| `payload.payOuts` | Decimal | Total pay-outs during shift |
| `payload.salesSummary` | Object | Transaction count, gross, net, tax, discounts |
| `payload.paymentBreakdown` | Object | Totals per payment method |

**Consumers:**
- **Accounting** → Cash over/short: DR/CR Cash Register (1112) ↔ Cash Over/Short (6700). Bank deposit: DR Bank → CR Cash Register (1112). See `accounting/07-event-mappings.md`.

## Event Contract Rules

1. All events follow the standard event envelope (see `accounting/01-architecture.md`)
2. `eventId` is used for idempotency — duplicate events are ignored
3. Events are emitted after the POS transaction is persisted locally
4. Offline events are queued and emitted on sync (see `06-offline-mode.md`)
5. Events are processed in order per register
6. POS never creates journal entries or stock movements directly — only emits events
7. Consuming modules are responsible for their own logic (accounting creates JEs, inventory creates movements)
