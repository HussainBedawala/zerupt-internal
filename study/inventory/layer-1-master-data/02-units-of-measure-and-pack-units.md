# 02 — Units of Measure & Pack Units

Sources: `packages/db/src/schema/inventory-items.ts` (itemPackUnits),
`apps/api/src/inventory/shared/pack-unit.helper.ts` (resolvePackUnit)

## The base-unit-canonical model

Every item has a single `unit` (varchar(20), NOT NULL, `items` table line 136).
This is the BASE unit — the atomic, irreducible quantity of the item:

```
Bottled Water  →  base unit: "bottle"
Rice           →  base unit: "kg"
Paracetamol    →  base unit: "tablet"
Cable          →  base unit: "meter"
```

**The golden rule:** ALL valuation flows exclusively in base units.
- `stock_ledger_entries.quantity` — always base units.
- `materialized_stock_levels.on_hand` — always base units.
- `inventory_cost_layers.unit_cost` — cost per base unit.
- WAC = total_value / on_hand (both in base units).

Pack units define LARGER groupings for buying/selling convenience. They never touch the
ledger directly; `resolvePackUnit` converts pack qty → base qty before any ledger write.

## `item_pack_units` table (inventory-items.ts:332-394)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `item_id` | uuid NOT NULL | FK → items (cascade delete) |
| `name` | varchar(40) NOT NULL | e.g. "Box", "Carton" |
| `name_alt` | varchar(40) | Arabic name |
| `conversion_factor` | numeric(19,6) NOT NULL | how many BASE units; always > 0 (CHECK) |
| `discount_type` | varchar(10) | `amount` | `percent` | NULL (CHECK enforced) |
| `discount_value` | numeric(19,6) | pack-level discount magnitude (>= 0 CHECK) |
| `is_default_sell` | boolean NOT NULL default false | pre-select on new sale lines |
| `is_default_purchase` | boolean NOT NULL default false | pre-select on new purchase lines |
| `sort_order` | integer NOT NULL default 0 | display order |
| `is_active` | boolean NOT NULL default true | soft deactivation |

**Key design decision:** pack selling price is DERIVED, never stored.
`gross_pack_price = item.selling_price × conversion_factor`, then pack-level discount applied.
This means changing the item's base selling price instantly propagates to all packs.
No stale pack prices. No sync drift.

**Unique constraint:** `(tenant_id, item_id, name)` — pack unit names unique per item.

**No global UOM table.** The `unit` field on `items` is a free-form varchar, and pack unit
names are also free-form. There is no `units_of_measure` master table mapping "pcs" → "pieces"
or normalizing synonyms.

**Gap (G3):** No global UOM registry means:
- "pcs", "Pcs", "piece", "pieces" are four different base units.
- Reporting cannot group by unit family (all "weight" items, all "volume" items).
- Import/AI resolution cannot canonicalize units without a lookup table.
- Interoperability with ZATCA (which uses UNECERec20 unit codes) is manual.
For 10-year scale, a `units_of_measure` table with a canonical code + synonyms column is needed.

## Conversion mechanics (`resolvePackUnit`)

Located at `apps/api/src/inventory/shared/pack-unit.helper.ts`.
Called by stock-adjustments, transfers, GRN receipt — any movement that may carry a pack unit.

Logic:
1. If `packUnitId` is null → quantity is already in base units; return as-is.
2. If `packUnitId` is set → fetch `item_pack_units` row, validate it belongs to the item.
3. `base_qty = input_qty × conversion_factor` (rounded to 6 decimal places).
4. Snapshot the `conversion_factor` at time of posting (stored on the transaction line).

**Why snapshot?** Changing a pack definition later must not rewrite history. A receipt of
"5 boxes of 12" must always mean 60 units, even if the box is redefined to 10.
Transaction lines carry `conversion_factor` at posting time — permanently.

## Pack units and barcodes

`item_barcodes.pack_unit_id` (nullable, FK → `item_pack_units`, cascade delete).
A barcode can identify either:
- A base-unit SKU (pack_unit_id = NULL) → scans to 1 base unit.
- A pack-unit SKU (pack_unit_id = box_id) → scans to N base units (the conversion factor).

This enables a single item to have separate barcodes for "each" and "box", serving both
POS (each) and goods-receipt (box) scan workflows.

## Default sell/purchase pack

`is_default_sell` / `is_default_purchase` (boolean flags, no partial unique index).

**Gap (G4):** No DB-level constraint preventing multiple `is_default_sell = true` rows per
item. Service layer must enforce "at most one default sell / one default purchase" per item.
A race condition or bulk import could create two defaults; the UI would pick arbitrarily.
A partial unique index `WHERE is_default_sell = true` on `(item_id)` would lock this.
Same for `is_default_purchase`.
