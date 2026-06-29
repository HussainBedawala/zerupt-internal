# Chapter 05 — Multi-Currency & Reversal

---

## Multi-Currency (PARTIALLY EXISTS)

### Schema

`landed_costs.currency` (varchar 3) and `landed_costs.exchangeRate` (numeric 18,10) are
persisted. Comment in schema: "forward-compat; FX deferred (phase-4c)"
(`packages/db/src/schema/purchase.ts:1173`).

### Current Behaviour

The `LcInventoryPayload` carries `currency` but the inventory listener uses `allocatedCostDelta`
as-is (no FX conversion applied). The accounting JE emitter (`buildLandedCostJePayload`)
hardcodes `exchangeRate: "1"` (`landed-cost.listener.ts:302`).

### What Is Missing (REQUIRES)

| Gap | Detail |
|-----|--------|
| FX conversion in allocation math | Component amounts are in LC currency; GRN lines are in PO/supplier currency. If different, `allocatedCostDelta` is in the wrong currency when it reaches the WAC engine. |
| FX gain/loss on freight AP | If freight is billed in USD but functional currency is KWD, the AP entry needs an FX rate and a gain/loss account on payment. Currently deferred. |
| Exchange rate field populated | `exchangeRate` is nullable; no service currently sets it. |

### Workaround

Until phase-4c: use LC currency = functional currency only. The UI should enforce this or
warn when a different currency is selected.

---

## Reversal (SPEC: "No Reversal — New Negative LC")

Per `04-landed-cost-allocation.md:61`:
> "No reversal of allocation document. Corrections via a new negative allocation."

### What "Negative LC" Means

The spec describes a new LC with negative component amounts. The allocation math supports
negative amounts (no positive-only guard in the math functions). However:

### REQUIRES (GAP — critical)

1. **Schema constraint:** `landed_cost_components` has
   `check("landed_cost_components_amount_positive_check", amount > 0)`
   (`purchase.ts:1266`). A negative reversal component **violates this constraint** and will
   be rejected at the DB level.

2. **Service guard:** `addComponent` does not add a sign check beyond the schema, but the
   schema constraint makes negative amounts impossible to store.

3. **No reversal UI:** The frontend has no "reverse" button or negative LC workflow.

**Conclusion:** The "new negative allocation" reversal pattern described in the spec is
**not implementable** with the current schema. A migration removing or relaxing the
`amount > 0` check (e.g. `amount <> 0`) is required before reversals can work. Additionally,
the `landed_cost_allocations.allocated_amount_positive_check` constraint must also be relaxed.

### Reversal GL Impact

A negative component would produce:
- CR Inventory 1141 (reducing capitalized cost)
- DR AP / Bank / Accrued Expense (unwinding the liability)

And the inventory listener would emit a negative `allocatedCostDelta`, reducing WAC or
creating a negative COGS adjustment (which maps to a COGS reduction — acceptable for an
error correction).

The listener code uses `Decimal` arithmetic throughout and would handle negative deltas
mathematically; the issue is purely the schema constraint.

---

## Summary of Multi-Currency & Reversal Gaps

| # | Gap | Severity |
|---|-----|---------|
| R1 | Negative component blocked by schema CHECK constraint | Critical (reversal impossible) |
| R2 | `allocated_amount_positive_check` also blocks negative allocation rows | Critical |
| R3 | No reversal UI or workflow | High |
| FX1 | `exchangeRate` never set; hardcoded to 1 in inventory JE | Medium (deferred to phase-4c) |
| FX2 | No FX conversion in WAC calculation when LC currency ≠ functional currency | Medium |
