# Chapter 2 — PO Line Schema

Source table: `purchase_order_lines` (`purchase.ts:724`).

---

## All Columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tenantId` | uuid NOT NULL | Defense-in-depth isolation |
| `orderId` | uuid FK → purchase_orders | CASCADE delete |
| `lineNumber` | integer | Sequential, unique within order |
| `itemId` | uuid FK → items | RESTRICT (history retention) |
| `description` | varchar(300) | Item name snapshot at PO creation |
| `warehouseId` | uuid FK → warehouses | RESTRICT — intended receive destination |
| `taxGroupId` | uuid FK → tax_groups | RESTRICT |
| `orderedQty` | numeric(19,6) | ALWAYS base units (= unitQty × conversionFactor) |
| `unitPrice` | numeric(19,6) | Per-base-unit, in PO currency |
| `discountAmount` | numeric(19,6) | Default 0 |
| `taxAmount` | numeric(19,6) | Calculated by TaxCalcService; frozen on PO confirm |
| `lineTotal` | numeric(19,6) | (orderedQty × unitPrice) - discountAmount + taxAmount |
| `receivedQty` | numeric(19,6) | Cumulative base units received via confirmed GRNs; default 0 |
| `returnedQty` | numeric(19,6) | Cumulative base units returned via purchase returns; default 0 |
| `unitPackId` | uuid FK → item_pack_units | Null = base unit only |
| `unitName` | varchar(40) | Pack unit name snapshot (e.g. "Carton") |
| `unitQty` | numeric(19,6) | How many base units one pack contains |
| `conversionFactor` | numeric(19,6) | Always > 0 (CHECK); = unitQty when pack selected |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | $onUpdate |

---

## CHECK Constraints

| Constraint | Rule |
|-----------|------|
| `ordered_qty_positive` | orderedQty > 0 |
| `conversion_factor_positive` | conversionFactor > 0 |
| `unit_price_non_negative` | unitPrice >= 0 |
| `discount_amount_non_negative` | discountAmount >= 0 |
| `tax_amount_non_negative` | taxAmount >= 0 |
| `line_total_non_negative` | lineTotal >= 0 |
| `received_qty_non_negative` | receivedQty >= 0 |
| `returned_qty_non_negative` | returnedQty >= 0 |

Source: `purchase.ts:781–806`.

---

## UOM / Pack-Unit Mechanics

- `orderedQty` is ALWAYS stored in **base units**.
- When a user enters a pack quantity (e.g. "5 cartons of 12"), the service calls `resolvePackUnit()`:
  - `baseQty = unitQty × conversionFactor` (e.g. 5 × 12 = 60 base units)
  - Snapshot columns (`unitPackId`, `unitName`, `unitQty`, `conversionFactor`) are stored for display + re-computation.
- `unitPrice` is per-**base** unit (so the total = `orderedQty × unitPrice` in base units).

Source: `purchase-orders.service.ts:186–228`.

---

## receivedQty Tracking

- `receivedQty` starts at 0 when the PO line is created.
- It is incremented by the GRN service when a GRN line is confirmed (`purchase_order_line_id` FK on `grn_lines`).
- Similarly `returnedQty` is incremented by the Purchase Returns service.
- Open qty = `orderedQty - receivedQty + returnedQty` (net unreceived).

**REQUIRES:** There is no DB-level CHECK ensuring `receivedQty <= orderedQty` — over-receipt is only blocked via a tolerance gate in the GRN service (which may require manager approval). A correct 10-year design should enforce this at the DB level or via a strict tolerance.

---

## Tax Per Line

- Tax is calculated by `TaxCalcService` on every `recompute()` call using the line's `taxGroupId`.
- On confirm the totals are **re-frozen** anchored to `order.orderDate` (ensures historical tax rates apply).
- Source: `purchase-orders.service.ts:344–345`.

---

## Currency

- All monetary values are stored in the **transaction currency** of the PO (inherited from the legal entity's functional currency via `resolveBranchContext()`).
- `exchangeRate` on the PO header is forward-compat (FX posting deferred to phase-4c; column exists but is nullable and unused in current accounting posting).

**REQUIRES:** Multi-currency POs (e.g. USD supplier billing KWD tenant) need FX gain/loss recognition at payment time. This is deferred but the columns are in place.
