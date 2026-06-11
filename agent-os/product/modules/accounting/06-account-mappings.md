# Account Mapping Configuration

## Concept

A configuration table that maps each event type to the accounts it debits and credits. Decouples accounting logic from hardcoded account codes. Tenants can override defaults.

## Override Hierarchy (most specific wins)

```
Item override > Category override > Warehouse override > Tenant default > System default
```

## Mapping Entry Fields

| Field | Description |
|-------|-------------|
| `eventType` | Event name (e.g., `sales.invoice.confirmed`) |
| `lineType` | Which journal line (e.g., `revenue`, `cogs`, `tax`, `receivable`) |
| `accountCode` | Account to use |
| `scope` | `system`, `tenant`, `warehouse`, `category`, `item` |
| `scopeId` | ID of the scope entity (null for system/tenant) |

## Default Mappings

| Event | Line Type | Account | Code |
|-------|-----------|---------|------|
| `sales.invoice.confirmed` | receivable | Trade Receivables | 1131 |
| `sales.invoice.confirmed` | revenue | Product Sales | 4110 |
| `sales.invoice.confirmed` | output_tax | Output Tax Payable | 2131 |
| `sales.invoice.confirmed` | cogs | Cost of Goods Sold | 5100 |
| `sales.invoice.confirmed` | inventory | Merchandise Inventory | 1141 |
| `sales.creditNote.confirmed` | returns | Sales Returns | 4200 |
| `purchase.grn.confirmed` | inventory | Merchandise Inventory | 1141 |
| `purchase.grn.confirmed` | payable | Trade Payables | 2111 |
| `purchase.grn.confirmed` | input_tax | Input Tax Recoverable | 1162 |
| `purchase.grn.confirmed` | accrual | GRN Accrual | 2121 |
| `pos.transaction.completed` | cash | Cash Register | 1112 |
| `pos.transaction.completed` | revenue | Product Sales | 4110 |
| `pos.shift.closed` | over_short | Cash Over / Short | 6700 |
| `cheque.status.received` | cheques_in_hand | Cheques in Hand | 1150 |
| `cheque.status.deposited` | transit | Cheques in Transit | 1129 |
| `cheque.status.issued` | outstanding | Cheques Issued | 2140 |
| `inventory.adjustment.posted` | loss | Inventory Write-Down | 5200 |
| `inventory.adjustment.posted` | gain | Inventory Gain/Loss | 5300 |
| `inventory.transfer.sent` | transit | Inventory in Transit | 1142 |
| `inventory.consumption.posted` | expense | Internal Consumption | 6800 |
| `bank.transfer.completed` | fee | Bank Charges | 7110 |

## Validation Rules

1. Referenced account must exist and be active
2. Account type must match line type (revenue → Income, cogs → Expense/CostOfSales, etc.)
3. Control accounts cannot be overridden by users
