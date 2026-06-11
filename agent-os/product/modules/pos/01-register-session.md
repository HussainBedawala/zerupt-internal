# Register & Session Model

> How registers are configured, shifts are opened/closed, and cashiers are assigned.

## Register

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Unique register identifier |
| `code` | String | Yes | Human-readable code, e.g. `REG-01` |
| `name` | String | Yes | Display name, e.g. "Register 1" |
| `branchId` | UUID | Yes | Branch this register belongs to |
| `warehouseId` | UUID | Yes | Warehouse stock is deducted from |
| `status` | Enum | Yes | `Active`, `Inactive`, `Maintenance` |
| `defaultCashFloat` | Decimal | Yes | Starting cash amount when shift opens |
| `receiptHeaderText` | String | No | Custom header for receipts on this register |
| `receiptFooterText` | String | No | Custom footer for receipts on this register |
| `printerType` | Enum | Yes | `Thermal80mm`, `Thermal58mm`, `None` |
| `cashDrawerConnected` | Boolean | Yes | Whether a cash drawer is attached |
| `createdAt` | DateTime | Yes | Auto-generated |

## Rules

1. A register belongs to exactly one branch and one warehouse
2. Multiple registers per branch are supported
3. Only `Active` registers can open shifts
4. Register `code` is unique per tenant

## Shift

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Unique shift identifier |
| `registerId` | UUID | Yes | Which register this shift is on |
| `shiftNumber` | Integer | Yes | Sequential per register, never resets |
| `cashierId` | UUID | Yes | User who opened the shift |
| `openedAt` | DateTime | Yes | When shift was opened |
| `closedAt` | DateTime | No | When shift was closed (null = open) |
| `openingFloat` | Decimal | Yes | Cash placed in drawer at open |
| `status` | Enum | Yes | `Open`, `Closing`, `Closed` |
| `expectedCash` | Decimal | No | Calculated at close time |
| `actualCash` | Decimal | No | Counted by cashier at close |
| `cashOverShort` | Decimal | No | `actualCash - expectedCash` |
| `closedById` | UUID | No | User who closed the shift (can differ from opener) |
| `notes` | String | No | Cashier notes at close |

## Shift Lifecycle

```
Open → [transactions occur] → Closing → Closed
```

### Opening a Shift

1. Cashier selects register and enters PIN
2. System verifies no open shift exists on that register
3. Cashier confirms or adjusts opening float amount
4. Shift record created with status `Open`
5. Cash drawer opens (if connected)

### Closing a Shift

1. Cashier or manager initiates close
2. Status changes to `Closing` — no new transactions allowed
3. Held transactions must be recalled or voided before close
4. System calculates `expectedCash` (see `08-z-report-shift-close.md`)
5. Cashier enters actual cash count by denomination
6. System records over/short
7. Manager reviews and approves if discrepancy exceeds threshold
8. Status changes to `Closed`
9. System emits `pos.shift.closed` event (see `accounting/07-event-mappings.md`)
10. Cash drawer opens for removal

## Rules

1. Only one open shift per register at a time
2. A cashier can have only one open shift across all registers
3. Shift cannot be closed with held transactions — must recall or void first
4. Shift number is sequential per register and never resets
5. Shifts older than 24 hours trigger a warning to close
6. Manager PIN required to close another cashier's shift
7. Opening float defaults to register's `defaultCashFloat` but can be overridden
8. All shift data is retained permanently — never deleted

## Register Assignment

| Scenario | Rule |
|----------|------|
| Cashier opens shift | Cashier is assigned to that register for the shift duration |
| Shift handover | Current shift must close, new cashier opens fresh shift |
| Manager override | Manager can close any shift on any register with PIN |
| Mid-shift break | No formal break state — shift stays open, register locked with PIN |
| Register lock | After 5 min inactivity, screen locks — cashier PIN to unlock |
