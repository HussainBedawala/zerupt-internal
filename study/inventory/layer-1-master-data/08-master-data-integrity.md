# 08 — Master Data Integrity

## Uniqueness guarantees

| Table | Uniqueness rule | Constraint name |
|-------|----------------|-----------------|
| `items` | SKU per tenant (case/whitespace normalized) | `items_tenant_sku_norm_key` (functional unique) |
| `items` | SKU per tenant (exact) | `items_tenant_id_sku_key` |
| `item_categories` | name per (tenant, parent) — NULLS NOT DISTINCT | `item_categories_tenant_parent_name_key` |
| `item_barcodes` | barcode per tenant | `item_barcodes_tenant_id_barcode_key` |
| `item_barcodes` | one primary per item | `item_barcodes_one_primary_per_item` (partial) |
| `item_pack_units` | pack name per (tenant, item) | `item_pack_units_tenant_item_name_key` |
| `item_batches` | batch_no per (tenant, item, warehouse) | `item_batches_tenant_item_warehouse_batch_no_key` |
| `item_serial_numbers` | serial_no per (tenant, item) | `item_serial_numbers_tenant_item_serial_key` |
| `legal_entities` | code per tenant | `legal_entities_tenant_id_code_key` |
| `legal_entities` | one default per tenant | `legal_entities_one_default_per_tenant` (partial) |
| `branches` | code per tenant | `branches_tenant_id_code_key` |
| `warehouses` | code per (tenant, branch) | `warehouses_tenant_id_branch_id_code_key` |
| `warehouses` | one default per branch | `warehouses_one_default_per_branch` (partial) |
| `zones` | code per (tenant, warehouse) | `zones_tenant_id_warehouse_id_code_key` |
| `bins` | code per (tenant, zone) | `bins_tenant_id_zone_id_code_key` |

## Soft-delete vs hard-delete policy

All master tables use `is_active` for soft deactivation. Hard DELETE is blocked by
`onDelete: "restrict"` FK chains wherever history exists:

- `items.id` referenced by `stock_ledger_entries`, `materialized_stock_levels`,
  `inventory_cost_layers`, `item_costing_configs` (all restrict).
- `warehouses.id` referenced by `item_batches`, `item_serial_numbers`,
  `stock_ledger_entries`, `materialized_stock_levels`, `inventory_cost_layers` (all restrict).
- `item_batches.id` referenced by `stock_ledger_entries.batch_id` (restrict — added in Layer 0).
- `item_serial_numbers.id` referenced by `stock_ledger_entries.serial_number_id` (restrict).
- `item_pack_units.id` referenced by `item_barcodes.pack_unit_id` (cascade — barcodes own the pack).
- `item_categories.id` → items.category_id (set null — items survive, become uncategorized).

This is the correct layered policy:
- Classification (categories) → set null → items survive.
- Identity (items, warehouses, batches, serials) → restrict → history is forever.
- Derived identifiers (barcodes) → cascade → meaningless without their parent.

## Multi-tenant isolation

Every table carries `tenant_id uuid NOT NULL`. No table has a FK to the tenants registry
(which lives in the admin DB — a separate Neon project). Enforcement is via:
1. `TenantContextMiddleware` — injects `tenantId` from JWT into every query context.
2. Service layer — all queries include `WHERE tenant_id = $tenantId`.
3. Defense-in-depth column — `tenant_id` column present on every table even if a DB-level
   policy ever changes.

Row-Level Security (RLS) is NOT enabled on tenant DBs. The isolation model is app-layer
+ per-tenant DB (each tenant has their own Postgres database on Neon). RLS would be
redundant on a per-tenant DB and would add overhead.

## Referential safety across movement types

| Pack unit deleted | Effect |
|-------------------|--------|
| `item_pack_units` deleted | Cascade-deletes all barcodes pointing at that pack unit. Historical transaction lines already SNAPSHOTTED the conversion_factor — no history corruption. |

This is correct. Pack units are deleted (not deactivated) only when they've never been
used on a posted transaction. Once used (conversion_factor snapshotted), the pack unit
row should be deactivated (`is_active = false`), not deleted.

**Gap (G12):** No guard prevents deleting an `item_pack_unit` that has been used on a
historical transaction line (GRN line, SO line, adjustment line). Transaction lines carry
the snapshotted `conversion_factor` directly, so the history is not lost, but the pack
unit row itself being gone means you cannot look up "what was this pack?" from the line's
`pack_unit_id` foreign key. Add a service-layer check: if any transaction line references
this pack_unit_id, require `is_active = false` (deactivation) rather than delete.

## Identity immutability (SKU stability)

SKU (`items.sku`) is a core business identifier referenced in physical labels, purchase
orders, supplier communications, and external system integrations. Renaming a SKU mid-life
is dangerous.

**Current state:** SKU updates are allowed via the standard update path (`items.service.ts`).
No guard prevents renaming a SKU that has 10,000 historical ledger entries. The ledger
references `item_id` (stable UUID), so ledger history is not broken, but external references
(supplier EDI feeds, printed barcode labels, ERP integrations) are silently invalidated.

**Recommendation for audit:** Add a flag or at minimum an audit-log entry whenever `sku` is
changed on an item with historical transactions. Optionally block SKU changes entirely after
first movement (allow only via an explicit "rename with acknowledgment" flow).
