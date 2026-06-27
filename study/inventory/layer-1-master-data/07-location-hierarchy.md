# 07 — Location Hierarchy

Source: `packages/db/src/schema/org-structure.ts`

## The five-level hierarchy

```
Tenant (admin DB — not in tenant schema)
  └── LegalEntity    (legal_entities)
        └── Branch   (branches)
              └── Warehouse  (warehouses)    ← LEDGER DIMENSION (active)
                    └── Zone (zones)
                          └── Bin  (bins)    ← LEDGER DIMENSION (deferred — Layer 1 task)
```

The stock ledger currently uses (item, warehouse, branch, legal_entity) as dimensions.
Zone and bin exist in the schema but are NOT yet wired into the ledger.
The Layer 0 hardening log explicitly deferred `bin_id` to Layer 1 as a nullable column backfill.

---

## `legal_entities` (org-structure.ts:24-55)

| Column | Notes |
|--------|-------|
| `code` varchar(50) | unique per tenant |
| `name` / `name_alt` | bilingual |
| `country_code` varchar(2) | ISO 3166-1 alpha-2 |
| `functional_currency` varchar(3) | ISO 4217; locked after first transaction |
| `functional_currency_locked_at` | timestamp when currency was locked |
| `registration_number` | company registration |
| `tax_registration_number` | VAT/GST registration |
| `tax_system` | `tax_system_type` enum: `vat` | `gst_dual` | `sst` | `sales_tax` | `none` |
| `is_default` boolean | one per tenant (partial unique index) |
| `is_active` boolean | soft deactivation |

Multiple legal entities per tenant are supported. Each legal entity has its own
functional currency (multi-currency valuation at entity level). The ledger carries
`currency` as a snapshot of the legal entity's functional currency at posting time.

---

## `branches` (org-structure.ts:58-96)

| Column | Notes |
|--------|-------|
| `legal_entity_id` | FK → legal_entities (restrict) |
| `code` varchar(50) | unique per tenant |
| `currency_code` | optional override (branch-level currency for reporting) |
| `timezone` varchar(100) | default UTC; per-branch shift/opening times |
| `tax_profile_id` | nullable UUID (soft link — no FK) |
| Full address fields | city, state, postal_code, country_code, addressLine1/2 |
| `contact_phone` / `contact_email` | branch contact |
| `opened_at` date | branch opening date |

**Note:** `tax_profile_id` on branches is a soft UUID with no FK. There is no `tax_profiles`
table in the tenant schema — this field appears to reference a future or external table.
Verify during audit.

---

## `warehouses` (org-structure.ts:122-164)

| Column | Notes |
|--------|-------|
| `branch_id` | FK → branches (restrict) |
| `code` varchar(50) | unique per (tenant, branch, code) |
| `type` | `warehouse_type` enum: `store` | `warehouse` | `transit` |
| `is_default` boolean | one default per branch (partial unique index) |
| `is_active` boolean | soft deactivation |

The `transit` warehouse type is a system-managed virtual location for in-transit stock
during warehouse transfers. A transfer creates a `transfer_out` ledger entry from the source
warehouse and a `transfer_in` entry to the transit warehouse; when received, another entry
moves from transit to destination.

**Indexes:** case-insensitive code/name lookup for the opening-stock import:
`warehouses_tenant_code_lower_idx`, `warehouses_tenant_name_lower_idx`.

---

## `zones` (org-structure.ts:167-194)

Sub-warehouse physical areas (e.g., "Refrigerated", "Shelf A", "Receiving Dock").

| Column | Notes |
|--------|-------|
| `warehouse_id` | FK → warehouses (restrict) |
| `code` varchar(50) | unique per (tenant, warehouse, code) |
| `name` | display name |
| `is_active` | soft deactivation |

Zones have no ledger dimension yet. They are location-management masters ready for use.

---

## `bins` (org-structure.ts:198-220)

The most granular physical location. A shelf, slot, or floor position within a zone.

| Column | Notes |
|--------|-------|
| `zone_id` | FK → zones (restrict) |
| `code` varchar(50) | unique per (tenant, zone, code) |
| `name` | display name |
| `is_active` | soft deactivation |

**Deferred ledger dimension:** The Layer 0 hardening log locked the decision to add a
nullable `bin_id` column to `stock_ledger_entries` in Layer 1. This is a backfill-free
migration (bins aren't operationally used yet, so all existing ledger rows simply get
`bin_id = NULL`). Layer 1 hardening should:
1. Add `bin_id uuid REFERENCES bins(id)` (nullable, restrict) to `stock_ledger_entries`.
2. Add supporting index `sle_bin_id_idx`.
3. No backfill needed; no existing constraint violated.

**Gap (G11):** Bins have no `capacity` or `capacity_unit` field. A real WMS needs bin
capacity for putaway rules (don't place 20 pallets in a 5-pallet slot). This is out of MVP
scope but should be in the 10-year design.

---

## Location hierarchy integrity summary

| Deletion rule | Effect |
|---------------|--------|
| legal_entity deleted | BLOCKED if any branch, warehouse, ledger rows, cost layers, or materialized levels reference it |
| branch deleted | BLOCKED if any warehouse references it |
| warehouse deleted | BLOCKED if any stock_ledger_entries, materialized_stock_levels, inventory_cost_layers, item_batches, or item_serial_numbers reference it |
| zone deleted | BLOCKED if any bin references it |
| bin deleted | BLOCKED if any stock_ledger_entries reference it (once bin_id wired) |

No cascade deletes in the location hierarchy — every reference is `onDelete: "restrict"`.
This is correct: a warehouse that ever held stock cannot be removed without historical distortion.
