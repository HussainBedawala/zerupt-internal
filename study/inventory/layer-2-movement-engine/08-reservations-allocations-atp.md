# Chapter 08 — Reservations / Allocations / Available-to-Promise (Current State)

## What is ATP?

Available-to-Promise (ATP) = `onHand − committed_to_open_orders`.

A warehouse manager or salesperson needs to know not just what is physically on hand but
what is AVAILABLE to sell — i.e. on-hand minus any quantity already promised to open
orders that have not yet shipped.

## Current state: effectively no reservation system

### What exists

1. **`materialized_stock_levels.inTransit`** (`inventory-costing.ts:456`) — tracks
   quantity in transit TO a warehouse. Informational only; not a reservation.

2. **`item_serial_numbers.status = 'reserved'`** (`serial-numbers.ts:36`) — a serial can
   be marked `reserved`. This is serial-level reservation, not quantity-level. There is
   no `reserved_qty` column on `materialized_stock_levels`.

3. **`item_batches.status`** — no `reserved` status on batches.

4. **No `stock_reservations` table** — no general reservation document linking an open
   Sales Order / POS layaway to a quantity commitment.

### What is missing

| Concept | Missing? |
|---|---|
| Reserved quantity on materialized_stock_levels | YES — no column |
| stock_reservations table (order → item → warehouse → qty) | YES — no table |
| ATP formula: `onHand - reservedQty` | YES — can't be computed |
| Reserve-on-SO-confirm, release-on-ship | YES — no workflow |
| Reserve-on-layaway, release-on-pickup (POS) | YES — no workflow |
| Batch-level reservation (reserve batch for an order) | YES |
| Serial-level reservation already exists | Partial (serial.status='reserved') |

## Current behaviour without reservations

The sales invoice confirm (`salesInvoices.service.ts` — not read here) calls
`applyOutbound` which checks `onHand` at confirm time. If two concurrent orders confirm
simultaneously for the last unit, the second hits the negative-stock guard (for non-POS)
and fails — effectively a last-write-wins race rather than a reservation system.

For POS: negative stock is allowed — no race protection at all.

## What a proper ATP implementation would need

### New table: `stock_reservations`

```sql
stock_reservations (
  id uuid PK,
  tenant_id uuid NOT NULL,
  item_id uuid REFERENCES items(id) RESTRICT,
  warehouse_id uuid REFERENCES warehouses(id) RESTRICT,
  batch_id uuid REFERENCES item_batches(id),        -- optional
  serial_number_id uuid REFERENCES item_serial_numbers(id), -- optional
  source_document_type document_type NOT NULL,       -- 'so', 'pos' (layaway)
  source_document_id uuid NOT NULL,
  source_document_line_id uuid,
  reserved_qty numeric(19,6) NOT NULL CHECK (reserved_qty > 0),
  status varchar CHECK (status IN ('active', 'released', 'fulfilled')),
  reserved_at timestamptz NOT NULL,
  expires_at timestamptz,                            -- optional auto-expiry
  released_at timestamptz,
  created_by uuid NOT NULL
)
```

### `materialized_stock_levels` additions

- `reserved_qty numeric(19,6) DEFAULT 0` — maintained transactionally alongside
  `stock_reservations` changes.
- `available_qty` = `on_hand - reserved_qty` — computed column or service-derived.

### Workflow changes

| Event | Action |
|---|---|
| SO / layaway confirmed | INSERT reservation, increment `reserved_qty` |
| SO shipped (invoice confirmed) | Release reservation, `reserved_qty` decrements, `applyOutbound` fires |
| SO cancelled / expired | Release reservation |
| POS sale (no layaway) | No reservation — direct outbound |

## GAP severity: HIGH for any multi-order or e-commerce scenario

For a retail stockkeeper managing walk-in POS only: current state is acceptable (POS
uses last-write-wins).

For any scenario with advance orders, sales orders, B2B, or layaway: the absence of
ATP means:
- Two reps can both promise the last 10 units.
- The second invoice confirm fails (for non-POS) — frustrating the customer.
- Or POS goes negative silently — the order ships nothing.

The serial `reserved` status is a partial workaround for single-unit high-value goods
(e.g. electronics). It does not help for fungible goods sold in quantity.

## SOUND vs RISKY

**SOUND:** The schema is clean enough to add reservations without migration conflicts.
The `inTransit` pattern (informational quantity on materialized levels) provides a
precedent for the `reserved_qty` column.

**RISKY (HIGH):** No reservation system = no ATP = overbooking risk for any non-POS
sales channel. This is a known gap, not a design flaw — but it must be called out
for the 10-year audit.
