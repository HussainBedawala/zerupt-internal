# Chapter 01 — Allocation Methods

All math lives in `landed-costs-allocation.math.ts` — pure functions, no DB calls.

---

## Four Methods

| Method | Basis | Formula |
|--------|-------|---------|
| `by_value` | `receivedQty × unitCost` per line | `share = componentAmount × (lineValue / totalValue)` |
| `by_quantity` | `receivedQty` per line | `share = componentAmount × (lineQty / totalQty)` |
| `by_weight` | `receivedQty × item.weightKg` per line | `share = componentAmount × (lineWeight / totalWeight)` |
| `manual` | User-supplied per-line amounts | validated that `Σ amounts === componentAmount` (within ε = 0.000001) |

Each **component** can use a **different** method. Method is stored on `landed_cost_components.allocationMethod`.

---

## Rounding — Largest Remainder (Hamilton Method)

File: `landed-costs-allocation.math.ts:53`

1. Compute ideal (unrounded) fractional share per line.
2. Floor each share to 6 decimal places (`MONEY_SCALE = 6`).
3. Distribute remaining units (at 0.000001 precision) to lines with the largest fractional
   remainders until `Σ floored = componentAmount`.

**Invariant:** `Σ allocations === componentAmount` exactly — no penny residual.

---

## Edge Cases (EXISTS)

| Situation | Behaviour |
|-----------|-----------|
| `by_value` with all lines at zero cost (free goods) | Equal split across lines (`math.ts:100`) |
| `by_quantity` with total qty = 0 | Throws 422 |
| `by_weight` with any line missing `weightKg` | Throws 422 listing offending SKUs (`math.ts:153`) |
| `by_weight` with total weight = 0 (all zero-qty lines) | Throws 422 |
| Manual lines don't sum to componentAmount (diff > 0.000001) | Throws 422 (`math.ts:196`) |
| Allocation result is zero (e.g. zero-cost line in `by_value`) | Row skipped — not inserted (`service.ts:429`) |

---

## Where Method Is Chosen

- Stored per component at `addComponent` time (`service.ts:162`).
- `manualLines` (JSONB array `{grnLineId, amount}[]`) stored on the component for `manual` method.
- At post time (`service.ts:396`), basis lines are loaded **once** for all components (N=1 query),
  then each component's allocator is called in a loop.

---

## Multiple Components per LC

A single LC may have N components with N different methods. Each component independently
allocates its `amount` across the same set of GRN lines. The inventory listener receives
one event per **GRN line** with the **sum** of all component allocations for that line.

Aggregation code: `service.ts:472` — `allocSumByLine` Map sums across all insertedAllocations
before building `inventoryPayloads`.

---

## Multiple LCs per GRN (REQUIRES)

The schema allows it (unique constraint is on `componentId + grnLineId`, not `grnId`), but
there is **no guard** against posting a second LC targeting the same GRN. WAC/FIFO recalculation
is additive (each LC uplift is applied independently), so mathematically it works. However:
- No UI warning that a GRN already has landed costs.
- No aggregate "total landed cost per GRN" surface anywhere.

**REQUIRES:** Add a `GET /landed-costs?grnId=<id>` filter or annotation on GRN detail to
show previously allocated landed costs before creating another.

---

## Manual Method — Manager PIN

When any component uses `manual`, `post` requires:
- `approvedBy` (UUID of a different manager) + `approvalPin`
- Verified via `PinVerificationService.verifyApproval` with permission `purchase.landedcost.post`
  (`service.ts:347`)

---

## Landed Cost After Partial Billing (REQUIRES — GAP)

The spec is silent on whether a GRN line that has been partially billed (invoice created
against it) can still receive a landed cost. The service only checks `GRN.status = confirmed`
— it does NOT check whether a vendor bill already exists or whether the GRN is partially
received. The landed cost can be posted even after billing, but the AP liability from the
freight supplier is a separate component (see ch 03). No coordination with billing state.
