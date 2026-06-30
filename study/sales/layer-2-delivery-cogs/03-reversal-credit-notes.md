# Sales Layer 2 — Reversal Mechanics (Credit Notes)

## No Direct Invoice Void

The invoice spec explicitly states: "No reversal of invoice. Corrections via credit note."  
Source: `agent-os/product/modules/sales/04-sales-invoice.md:55`

There is no `voidInvoice()` method in `SalesInvoicesService`. Once confirmed, the ONLY way to reverse stock and COGS is via a credit note.

---

## Credit Note Types

| Type | Stock Effect | COGS Effect |
|------|-------------|-------------|
| `goods_return` | Stock back IN (sale_return inbound) | COGS reversed by inventory engine |
| `price_adjustment` | No stock movement | No COGS change; only AR/Revenue JE reversal |

Source: `credit-notes.events.ts:49-51`; `credit-notes.service.ts:319-329`

---

## Credit Note Confirm Sequence (`credit-notes.service.ts`)

1. **Manager PIN required** (`PinVerificationService.verifyApproval`): `credit-notes.service.ts:238`
2. **Lock invoice FOR UPDATE** (`lockInvoice`): `credit-notes.service.ts:294` — serializes concurrent CN confirms + receipt posts against same invoice
3. **Validate credit quantities** (`validateCreditQuantities`): prior confirmed credits + this CN <= original invoiced qty: `credit-notes.service.ts:305`
4. **Snapshot return cost** (`snapshotReturnCosts`): uses `salesInvoiceLines.costAtSale` (original per-unit COGS); falls back to current WAC only if zero: `credit-notes.service.ts:320-328`
5. **Claim returned serials** (`claimReturnedSerials` → `SerialAllocationService.claimForReturn`): atomically moves `sold → returned` and relocates to return warehouse, inside confirm tx: `credit-notes.service.ts:326-328`
6. **Balance guard**: CN total must not exceed invoice balance: `credit-notes.service.ts:334-341`
7. **Apply credit to invoice**: `paidAmount += total`, `balance -= total`, `balanceFn -= total * exchangeRate`: `credit-notes.service.ts:365-377`
8. **Outbox insert** (durable): `credit-notes.service.ts:383-395`
9. **Post-commit emit**: `sales.creditNote.confirmed` → both `InventoryDomainEventListener` and `SalesAccountingListener`

---

## COGS Reversal Path

`sales.creditNote.confirmed` → `InventoryDomainEventListener.handleSalesCreditNoteConfirmed()` → `fanOutSaleReturn()` → `applyInbound()` with `movementType: "sale_return"`

The return `unitCost` = `returnCost` snapshotted from original `costAtSale`. This means COGS reversal is at original cost, not current WAC. Net-zero for the specific sale:
```
Original: DR COGS / CR Inventory  at cost X
Reversal: DR Inventory / CR COGS  at cost X (same X)
```
Correctly prevents WAC drift from distorting the reversal.

---

## AR/Revenue Reversal Path

`SalesAccountingListener.handleCreditNoteConfirmed()` posts:
```
DR Sales Returns (5xxx)
DR Output Tax (reversal)
CR Trade Receivables (party-tagged)
```
Source: `sales.listener.ts:300-332`

---

## GAP: Batch-Tracked Return Cost

- `snapshotReturnCosts` reads from `salesInvoiceLines.costAtSale` which for batch lines = WAC snapshot (not FEFO actual per-lot cost)
- The return cost and the original COGS JE may differ by FEFO rounding
- Risk: COGS reversal != original COGS if WAC snapshot and FEFO engine diverged

---

## Partial Credit / Over-Credit

- Partial credit of a line is allowed (creditQty < invoiced qty)
- Over-credit is blocked: `validateCreditQuantities` inside FOR UPDATE tx: `credit-notes.service.ts:562-626`
- Multiple credit notes against the same invoice are supported (cumulative sum check)
