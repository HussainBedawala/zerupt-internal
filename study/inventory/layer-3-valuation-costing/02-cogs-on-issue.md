# 02 — COGS on Issue (All Channels)

## Standard outbound (sale, POS, adjustment decrease)

`inventory-event.listener.ts:331-516` (`applyOutbound`):

1. Pessimistic lock: `FOR UPDATE` on `materialized_stock_levels` row (line 351).
2. Calculate COGS via `CogsCalculatorService.calculateOutbound` (line 397):
   - WAC items: `WacEngineService.consume(qty, currentWac)` → `totalCost = qty × averageCost`.
   - FIFO items: `FifoEngineService.consumeLayers` — GUARDED BLOCKED (chapter 04).
   - Serial-specific: intercepted before step 2 if `cogsSpecificTotalCost` is present (line 388).
3. Write ledger row at `(unitCost, totalCost)` from cost result (line 402-429).
4. Insert outbox row for `DR COGS / CR Inventory` JE INSIDE the same transaction (line 438-449).
5. Decrement `materialized_stock_levels.onHand` and `totalValue` (line 452-463).
6. Post-commit in-process emit (fast path, line 505-515). Outbox poller is the durable backstop.

## C1 — Non-recoverable tax capitalized into cost

`resolveEffectiveUnitCost` (`inventory-event.listener.ts:639-650`):
On inbound, if `taxCategory === 'non_recoverable'`, `nonRecoverableTaxAmount` is added to
`unitCost`. This correctly capitalizes blocked input tax (UAE entertainment expenses, Indian
ineligible credits) into the inventory asset cost, per IAS 2.11.
The capitalized cost flows into WAC and becomes part of COGS when the item is sold. SOUND.

## Transfer (reclassification)

`isReclassificationMovement` (`inventory-event.listener.ts:757-764`) returns true for
`transfer_out`, `transfer_in`, `assembly_out`, `assembly_in`. No COGS JE is emitted.
Transfer GL JEs (DR Inventory in Transit / CR Inventory Asset) are emitted by
`StockTransfersService` via the transactional outbox. WAC is carried at the
SENDING warehouse cost — no averaging at the receiving warehouse on transfer-in.

SOUND — transfers are inventory reclassifications, not P&L events.

## Purchase return

`buildCogsPayload` (`inventory-event.listener.ts:770-856`):

A purchase return is NOT a standard COGS debit. The engine posts a 3-leg JE:
```
DR  Purchase Return Clearing (1192)      qty × originalUnitCost  (doc basis)
CR  Inventory (1141)                     qty × WAC               (pool basis)
DR/CR Purchase Price Variance (5210)     docCost − WAC           (balances the JE)
```

Key constraint: `originalUnitCost` is MANDATORY (line 807-815). If absent, the tx aborts
loudly rather than silently posting an unbalanced 1192 clearing leg. The AP-side JE credits
1192 at the same document cost, so the clearing account nets to zero across both JEs.

SOUND — the two-JE clearing flow prevents a permanent non-zero residual in the clearing
account. The variance is correctly classified to 5210, not COGS.

## Sale return (inbound)

Handled in `applyInbound` (`inventory-event.listener.ts:256-283`):
- Stock re-enters at CURRENT WAC (not original sale WAC). See chapter 07 for implications.
- COGS reversal JE posted to outbox INSIDE the transaction (line 261-267):
  ```
  DR  Inventory (1141)   qty × currentWac
  CR  COGS (5100)        qty × currentWac
  ```
- The reversal amount equals the ledger `totalCost` for this movement — GL and subledger stay
  in sync by construction (comment at line 250-255).

## GAP — COGS reversal amount differs from original COGS on WAC items

When a customer returns an item, the COGS reversal uses `currentWac` (WAC at return time).
The original sale posted COGS at `wacAtSaleTime`. If the WAC changed between sale and return
(e.g., a new shipment at a higher cost arrived), the two amounts differ:
- Original COGS: `qty × wacAtSaleTime`
- Reversal: `qty × currentWac`

The difference goes unrecorded — it is a "lost" variance that neither appears in COGS nor in
any variance account. Under IAS 2, returns should be reversed at the original cost when
identifiable. For WAC retail this is a known IAS 2 simplification (the original cost is
usually not stored per sale line), but it means the inventory asset can be slightly misstated
after a return in a period of rising costs.

Severity: LOW for most retail (WAC changes slowly). HIGH for items with volatile pricing.
A fix would require storing `wac_at_sale_time` on the `sales_invoice_lines` and threading it
to the credit note/return payload as `originalUnitCost`. No current mechanism does this.
