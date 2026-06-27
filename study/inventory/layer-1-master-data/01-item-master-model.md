# 01 — Item Master Model

Source: `packages/db/src/schema/inventory-items.ts`

## The `items` table — every column

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | uuid PK | — | random; stable forever |
| `tenant_id` | uuid NOT NULL | — | defense-in-depth; no FK (admin DB) |
| `sku` | varchar(100) NOT NULL | — | unique within tenant (case-insensitive, whitespace-normalized: `items_tenant_sku_norm_key` on `lower(btrim(sku))`) |
| `name` | varchar(300) NOT NULL | — | primary language |
| `name_alt` | varchar(300) | nullable | alternate language (Arabic) |
| `description` | text | nullable | long-form; catalog/import use |
| `image_url` | varchar(2048) | nullable | uploaded to tenant-assets bucket |
| `type` | `item_type` enum | NOT NULL default `flat` | `flat` | `matrix_parent` | `matrix_variant` |
| `parent_item_id` | uuid | nullable | self-FK (restrict); set only on `matrix_variant`; enforced by CHECK |
| `category_id` | uuid | nullable | FK → `item_categories.id` (set null on delete) |
| `unit` | varchar(20) NOT NULL | — | BASE unit of measure; canonical for ALL valuation |
| `cost_price` | numeric(19,6) NOT NULL default 0 | — | reference/standard cost; fallback before first receipt; not the WAC |
| `selling_price` | numeric(19,6) NOT NULL default 0 | — | default list price; overridden by price lists |
| `tax_group_id` | uuid | nullable | FK → `tax_groups.id` (restrict on delete); NULL = use tenant/category default |
| `valuation_method` | `costing_method` enum NOT NULL default `wac` | — | declared default at creation time; override lives in `item_costing_configs` |
| `reorder_level` | numeric(19,6) | nullable | low-stock alert threshold; NULL = no alert |
| `tracking_type` | `item_tracking_type` enum NOT NULL default `none` | — | `none` | `serial` | `batch`; master-data driver of Layer-0 enforcement |
| `weight_kg` | numeric(12,4) | nullable | for landed-cost by_weight allocation; CHECK > 0 when set |
| `part_number` | varchar(100) | nullable | OEM/manufacturer number; not unique (same OEM can map to multiple SKUs) |
| `is_active` | boolean NOT NULL default true | — | soft deactivation; never hard-delete while ledger history exists |
| `created_at` | timestamptz NOT NULL | — | system clock |
| `updated_at` | timestamptz NOT NULL | — | auto-updated |

## CHECK constraints (inventory-items.ts:185-201)

```
items_cost_price_non_negative_check      cost_price >= 0
items_selling_price_non_negative_check   selling_price >= 0
items_weight_kg_positive_check           weight_kg IS NULL OR weight_kg > 0
items_reorder_level_non_negative_check   reorder_level IS NULL OR reorder_level >= 0
items_matrix_parent_consistency_check    type='matrix_variant' ↔ parent_item_id IS NOT NULL
```

## Item types

### `flat` (MVP — all current rows)
Single standalone SKU. `parent_item_id` must be NULL (CHECK enforced). The dominant type
for MENA retail: one product → one row → one ledger dimension.

### `matrix_parent`
Non-transactable template. Defines the attribute axes (e.g. "T-Shirt": Size × Color).
Has no stock, no ledger entries, no cost. Cannot be sold or purchased directly.

### `matrix_variant`
Concrete variant (e.g. "T-Shirt / M / Red"). Has `parent_item_id` → the matrix_parent.
Fully transactable. Has its own ledger dimension, own cost, own barcodes, own pack units.

**Gap (G1):** `items` has no `attributes` column or `item_attributes` table. Matrix variants
exist in the enum/CHECK but there is nowhere to store the attribute values (Size=M, Color=Red).
Without attributes, `matrix_parent` and `matrix_variant` are structurally sound but
semantically incomplete — you can create variants but not describe what makes them distinct.

## Indexes (inventory-items.ts:207-253)

Key indexes for audit awareness:
- `items_tenant_sku_norm_key` — functional unique on `(tenant_id, lower(btrim(sku)))` — full
  (all rows, active+inactive) so inactive SKUs cannot shadow active ones.
- `items_tenant_active_idx` — partial on `is_active = true` for POS/Sales item search.
- `items_tenant_catalog_active_idx` / `items_tenant_catalog_delta_idx` — keyset pagination
  on `(tenant_id, updated_at, id)` for POS offline catalog sync (DEV-394).
- `items_tenant_part_number_lower_idx` — partial on non-null `lower(part_number)` for
  auto-parts lookup.

## Soft-delete vs deactivation (items.service.ts:531-543)

`softDelete()` sets `is_active = false` (UPDATE with `is_active = true` predicate → no-op on
already-inactive). Items with ledger history are permanently restricted by `onDelete: "restrict"`
on `stock_ledger_entries.itemId`, `materialized_stock_levels.itemId`, etc. — they can never be
hard-deleted while any ledger row references them. This is correct and permanent.

**Gap (G2):** No guard prevents changing `tracking_type` from `batch`→`none` on an item that
already has `item_batches` rows or ledger entries with `batch_id`. The service detects the
change (`trackingTypeChanged` at items.service.ts:481) but only emits an event — it does not
block the change. Silently removing batch enforcement after stock exists corrupts FEFO/recall.
