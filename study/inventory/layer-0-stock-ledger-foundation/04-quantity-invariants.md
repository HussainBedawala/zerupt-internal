# 04 — Quantity Invariants

## The perpetual inventory equation

The foundation invariant of a perpetual inventory system is:

```
on_hand(item, warehouse) = Σ quantity FOR ALL ledger rows
                             WHERE item_id = ? AND warehouse_id = ?
```

This is the stock equivalent of the accounting trial balance: the sum of all signed
movements must always equal the current balance. If this invariant breaks, the on-hand
display is wrong, the COGS is wrong, the stockkeeper cannot trust the system.

The Zerupt inventory design enforces this through:
1. **DB-level constraints** on `stock_ledger_entries`
2. **Transactional atomicity** (ledger row + materialized level update in one DB transaction)
3. **Application-layer guards** (negative stock policy, never-silent-negative principle)

## DB-level constraints on quantity

### Non-zero quantity

```sql
CHECK (movement_type = 'landed_cost_adjustment' OR quantity != 0)
```
(`sle_quantity_nonzero_check`, inventory-costing.ts line ~136)

A zero-quantity ledger row has no effect on on-hand and indicates a bug in the posting
code. This constraint rejects it at the DB level before it can silently corrupt the
materialized total. The only exception is `landed_cost_adjustment`, which posts to adjust
cost on FIFO layers without changing quantity.

### Unit cost and total cost non-negative

```sql
CHECK (unit_cost >= 0)    -- sle_unit_cost_non_negative_check
CHECK (total_cost >= 0)   -- sle_total_cost_non_negative_check
```

A negative cost would mean "this stock has negative value" — economically meaningless and
a sign of a calculation error. Zero cost is valid (free goods, promotional samples).

### Currency format

```sql
CHECK (currency ~ '^[A-Z]{3}$')    -- sle_currency_format_check
```

Prevents garbage currency codes from corrupting cost calculations.

## The never-silent-negative rule

The `negative_stock_policy` enum (`strict` | `flexible`) controls what happens when an
outbound movement would drive `on_hand` below zero:

```
strict   — reject the movement with a BadRequestException
flexible — allow it (with explicit caller acknowledgment) + emit a negative-stock alert
```

This is enforced in `StockAdjustmentsService` (line ~137):

```typescript
const policy =
  direction === "decrease" ? await this.getNegativeStockPolicy(tenantId, tx) : "flexible";
```

The policy is read **inside the transaction** to avoid a TOCTOU window where a concurrent
settings change flips the policy between the read and the write.

**Why "never silent"?** A negative on-hand silently allowed means:
- COGS is computed against a negative denominator (WAC breaks)
- The stockkeeper's on-hand display is misleading
- Physical count reconciliation will show a discrepancy with no audit trail

Under `flexible` policy, the movement is allowed but an alert is emitted so the operator
knows and can investigate. Nothing is silently ignored.

## The `materialized_stock_levels.on_hand` invariant

`materializedStockLevels.onHand` must always equal the sum of all ledger quantities for
that `(item_id, warehouse_id)` pair. This is maintained by the transactional write pattern
described in Chapter 06.

There is NO DB trigger or computed column that enforces this — it is maintained
exclusively through the application layer. The audit should verify that every write path
(adjustments, domain listener, transfer service) correctly updates `materialized_stock_levels`
in the same transaction as the ledger write.

## `total_cost` denormalization and its integrity rules

`total_cost = abs(quantity) × unit_cost`. This is denormalized (redundant with the other
two columns) for query performance. The service layer is responsible for computing it
correctly. A CHECK constraint guards against negative values but does NOT verify that it
equals `abs(quantity) × unit_cost` — that would require a computed-column constraint or a
trigger.

**Gap for the audit:** There is no DB-level assertion that `total_cost = abs(quantity) ×
unit_cost`. A service bug could set `total_cost` to an arbitrary value, and the DB would
accept it as long as it is non-negative. The audit should consider adding:
```sql
CHECK (total_cost = round(abs(quantity) * unit_cost, 6))
```
This is possible in Postgres for immutable expressions and would catch service-layer
calculation bugs at commit time.

## The `materialized_stock_levels` consistency constraints

```sql
CHECK (on_hand <= 0 OR total_value >= 0)   -- msl_total_value_consistent_check
CHECK (average_cost >= 0)                   -- msl_average_cost_non_negative_check
CHECK (last_cost >= 0)                      -- msl_last_cost_non_negative_check
CHECK (currency ~ '^[A-Z]{3}$')            -- msl_currency_format_check
```

The `total_value` constraint is intentionally one-sided: `total_value >= 0` is only
required when `on_hand > 0`. When `on_hand <= 0` (negative stock allowed under flexible
policy), `total_value` can be 0 (the system resets it rather than allowing a negative
value-balance, per the WAC engine's design).

## In-transit quantity

`materialized_stock_levels.in_transit` is a **separate, informational column** — it does
NOT affect on-hand, WAC, COGS, or the ledger. It represents "quantity currently in
transit to this warehouse from another warehouse." It is:
- Incremented at the DESTINATION when a transfer is sent (`transfer_out` at source)
- Decremented at the DESTINATION when the transfer is received (`transfer_in` at dest)

A clamping guard prevents negative `in_transit`:
```sql
GREATEST(in_transit - qty, 0)    -- in decrementInTransit
```

This guard is necessary because a transfer-receive that arrives out of order (received
before the in-transit increment was processed) could otherwise drive `in_transit`
negative.

## Summary of quantity invariants and their enforcement

| Invariant | Enforced by |
|---|---|
| `quantity != 0` (except landed cost adj) | DB CHECK constraint |
| `unit_cost >= 0` | DB CHECK constraint |
| `total_cost >= 0` | DB CHECK constraint |
| `on_hand = Σ quantities` | Application: TX atomicity (Chapter 06) |
| `total_value >= 0 when on_hand > 0` | DB CHECK on `materialized_stock_levels` |
| `average_cost >= 0` | DB CHECK on `materialized_stock_levels` |
| Negative `on_hand` not silent | Application: `negative_stock_policy` + alerts |
| `total_cost = abs(qty) × unit_cost` | **MISSING** — no DB-level assertion |
| `in_transit >= 0` | Application: GREATEST(..., 0) clamp |
