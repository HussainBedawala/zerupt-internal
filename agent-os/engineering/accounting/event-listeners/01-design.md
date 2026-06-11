# Event Listeners — Design

> Status: **Not implemented.** 32 events spec'd in `product/accounting/07-event-mappings.md`, no NestJS listeners exist.
> This is the core of the accounting engine — without it, only manual JEs work.

## Architecture

```
Module emits NestJS event → AccountingEventListener receives
  → Builds JE payload (resolves accounts, calculates amounts, handles COGS/FX)
  → Calls JournalPostingService.postFromEvent()
```

### New Service: `AccountingEventListenerService`

One `@OnEvent()` handler per event group. Each handler:
1. Extracts amounts from event payload
2. Calls `CostingService` for COGS amounts (if applicable)
3. Calls `FxGainLossService` for FX lines (if applicable)
4. Builds `PostEventPayload` with correct lineTypes
5. Calls `JournalPostingService.postFromEvent()`

## Event Groups & Handlers

### POS (4 events)

| Event | Handler | COGS? | FX? |
|-------|---------|-------|-----|
| `pos.transaction.completed` | Revenue + COGS entries | Yes | No (POS = local currency) |
| `pos.return.completed` | Revenue reversal + COGS reversal | Yes | No |
| `pos.shift.closed` | Cash over/short + cash transfer | No | No |
| `pos.void.completed` | Full reversal of original sale | Yes | No |

### Sales (3 events)

| Event | Handler | COGS? | FX? |
|-------|---------|-------|-----|
| `sales.invoice.confirmed` | Revenue + COGS | Yes | Possible |
| `sales.creditNote.confirmed` | Revenue reversal + conditional COGS reversal | Conditional | Possible |
| `sales.receipt.posted` | Payment + FX gain/loss + advance/discount handling | No | Yes |

### Purchase (4 events)

| Event | Handler | COGS? | FX? |
|-------|---------|-------|-----|
| `purchase.grn.confirmed` | Inventory + tax + payable/accrual | No (triggers WAC recalc) | Possible |
| `purchase.landedCost.allocated` | Inventory uplift + retroactive COGS adjustment | Yes (retroactive) | No |
| `purchase.return.confirmed` | Reverse GRN entries | No (triggers WAC recalc) | Possible |
| `purchase.payment.posted` | Payment + FX gain/loss + advance/discount | No | Yes |

### Inventory (6 events)

| Event | Handler | COGS? | FX? |
|-------|---------|-------|-----|
| `inventory.adjustment.posted` | Write-down or gain | No | No |
| `inventory.transfer.completed` | Transit entries (two-step) or no-op (same warehouse) | No | No |
| `inventory.consumption.posted` | Internal consumption expense | No | No |
| `inventory.assembly.completed` | FG in, components out + scrap | No | No |
| `inventory.disassembly.completed` | Reverse of assembly | No | No |
| `inventory.count.approved` | Creates adjustment entries per variance | No | No |

### Cheques (7 events)

| Event | Handler | COGS? | FX? |
|-------|---------|-------|-----|
| `cheque.status.received` | DR Cheques in Hand / CR AR | No | No |
| `cheque.status.deposited` | DR Cheques in Transit / CR Cheques in Hand | No | No |
| `cheque.status.cleared` (received) | DR Bank / CR Transit | No | No |
| `cheque.status.bounced` | Reopen AR + bank fee | No | No |
| `cheque.status.issued` | DR AP / CR Cheques Issued | No | No |
| `cheque.status.cleared` (issued) | DR Cheques Issued / CR Bank | No | No |
| `cheque.status.cancelled` | Reverse original entry | No | No |

### Banking (1 event)

| Event | Handler | COGS? | FX? |
|-------|---------|-------|-----|
| `bank.transfer.completed` | DR Target Bank / CR Source Bank + fee + FX | No | Possible |

### Accounting Internal (3 events)

| Event | Handler | COGS? | FX? |
|-------|---------|-------|-----|
| `accounting.fxRevaluation.completed` | Unrealized FX per open FC balance | No | Yes |
| `accounting.yearEnd.closed` | Handled by YearEndClosingService (already built) | No | No |
| `accounting.openingBalance.posted` | DR/CR each account + Opening Balance Equity (3900) | No | No |

## Implementation Priority

Build in this order (each unlocks a module):

| Phase | Events | Unlocks |
|-------|--------|---------|
| 1 | POS (4) + Inventory adjustment/transfer (2) | POS module |
| 2 | Sales (3) + Cheques (7) | Sales module |
| 3 | Purchase (4) + Inventory remaining (4) | Purchase module |
| 4 | Banking (1) + FX revaluation (1) + Opening balance (1) | Full accounting |

## Payload Contract

Every event emitted by modules must follow `PostEventPayload` schema (see `journal-entries/02-posting-pipeline.md`). Each module is responsible for including: `eventId`, `eventType`, `branchId`, `occurredAt`, `currency`, `lines[]`.

The event listener enriches with: resolved account IDs, COGS amounts, FX lines.
