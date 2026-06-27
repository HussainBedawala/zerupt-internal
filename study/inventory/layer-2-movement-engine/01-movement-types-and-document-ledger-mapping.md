# Chapter 01 — Movement Types & the Document→Ledger Mapping

## The enum

`packages/db/src/schema/enums.ts:259` defines `stock_movement_type`:

| movementType | Direction | qty sign | P&L impact | Source |
|---|---|---|---|---|
| `grn_receipt` | Inbound | + | DR Inventory / CR AP accrual | Purchase GRN or invoice |
| `sale` | Outbound | – | DR COGS / CR Inventory | POS, Sales Invoice |
| `sale_return` | Inbound | + | DR Inventory / CR COGS (reversal) | POS Return, Credit Note |
| `purchase_return` | Outbound | – | DR Clearing / CR Inventory ± variance | Purchase Return doc |
| `adjustment_increase` | Inbound | + | DR Inventory / CR Inventory Gain | Manual adjustment |
| `adjustment_decrease` | Outbound | – | DR Inventory Loss / CR Inventory | Manual adjustment |
| `opening_balance` | Inbound | + | None (GL posted by accounting module separately) | Onboarding |
| `transfer_in` | Inbound | + | None (reclassification) | Transfer receive |
| `transfer_out` | Outbound | – | None (reclassification) | Transfer send |
| `assembly_in` | Inbound | + | None (reclassification) | Assembly (future) |
| `assembly_out` | Outbound | – | None (reclassification) | Assembly (future) |
| `consumption` | Outbound | – | (reserved for manufacturing) | Not yet used |
| `landed_cost_adjustment` | Neither | 0 | Adjusts cost layer unitCost | Landed cost confirm |

## Document→source_document_type mapping

`packages/db/src/schema/enums.ts:86` defines `document_type`. How each document stamps
the ledger's `source_document_type`:

| Business document | source_document_type | source_document_id |
|---|---|---|
| POS transaction | `pos` | posTransaction.id |
| POS return / void | `pos` | posTransaction.id (the return/void doc) |
| Sales invoice | `inv` | salesInvoice.id |
| Sales credit note | `cn` | salesCreditNote.id |
| GRN (goods receipt note) | `grn` | grn.id |
| Purchase invoice (direct, no GRN) | `pinv` | purchaseInvoice.id |
| Purchase return | `prn` | purchaseReturn.id |
| Stock adjustment | `adj` | stockAdjustment.id |
| Stock transfer | `trf` | stockTransfer.id |

## Per-line idempotency (the fan-out contract)

`inventory-domain.listener.ts:136` — `deriveLineEventId`:

```
lineEventId = uuidV5(sourceDocumentLineId ?? String(lineIndex), parentEventId)
```

**GAP / risk:** when `sourceDocumentLineId` is absent (some older emitters), the key
depends on **line order**. If a retry reorders lines, keys shift and the idempotency
check misses. The listener logs a warning but does NOT block. All emitters should
supply `sourceDocumentLineId`. Audit all callers.

## The "reclassification" guard

`inventory-event.listener.ts:715` — `isReclassificationMovement()`:

```typescript
return movementType === 'assembly_out' || movementType === 'assembly_in'
    || movementType === 'transfer_out' || movementType === 'transfer_in'
```

When true: no COGS `accounting.post` is emitted. Transfer GL JEs are handled by
`StockTransfersService` via the transactional outbox.

## SOUND vs RISKY

**SOUND:** Single enum for all movement types means every report, filter, and audit
trail uses the same vocabulary. The reclassification guard is explicit, not implicit.

**RISKY:** `assembly_in`/`assembly_out`/`consumption` are defined in the enum but no
Assembly module exists. If someone posts one of these movement types via a raw DB
insert, the guard skips the COGS JE — silent P&L gap. Guard should throw if movement
type is `consumption` or `assembly_*` until those modules exist.
