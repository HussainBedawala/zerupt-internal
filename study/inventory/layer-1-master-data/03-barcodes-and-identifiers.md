# 03 — Barcodes & Identifiers

Source: `packages/db/src/schema/inventory-items.ts` (itemBarcodes, lines 261-314)

## `item_barcodes` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `item_id` | uuid NOT NULL | FK → items (cascade delete) |
| `pack_unit_id` | uuid | nullable; FK → item_pack_units (cascade delete) |
| `barcode` | varchar(100) NOT NULL | the scanned value |
| `type` | `barcode_type` enum NOT NULL | `ean13` | `upca` | `code128` | `custom` |
| `is_primary` | boolean NOT NULL default false | for label printing |
| `created_at` / `updated_at` | timestamptz | audit |

## Uniqueness rules

**Barcode globally unique per tenant:**
`item_barcodes_tenant_id_barcode_key` — unique on `(tenant_id, barcode)`.
Scan resolution is always unambiguous: one barcode → one item (+ optionally one pack unit).

**At most one primary per item:**
`item_barcodes_one_primary_per_item` — partial unique index on `(item_id)` WHERE `is_primary = true`.
Prevents two "primary" barcodes from confusing label-print selection.

## Barcode types

`barcodeType` enum (enums.ts:327): `ean13`, `upca`, `code128`, `custom`.

| Type | Description | Length |
|------|-------------|--------|
| `ean13` | International Article Number, 13 digits | 13 |
| `upca` | Universal Product Code-A, 12 digits | 12 |
| `code128` | Variable-length alphanumeric | 1-48 |
| `custom` | Tenant-defined internal barcodes | any |

**Gap (G5):** The `barcode` column is a free-form varchar(100) with no format validation.
An `ean13` row could contain 10 characters and pass. A CHECK on `type = 'ean13' AND barcode ~ '^[0-9]{13}$'`
(and similar for upca/code128) would catch scanner mis-reads and import errors at write time.
Without this, a bad barcode silently fails to scan at POS — only discovered under time pressure.

## Internal barcode generation

`documentType` enum includes `bar` (enums.ts line: `"bar"`) — a sequence counter for
store-printed EAN-13-shaped internal barcodes (prefix-2 signals "internal/in-store item").
This allows the system to assign barcodes to items that have no manufacturer barcode.

## Item identifiers in summary

An item can be found by:
1. `sku` — primary business identifier, unique per tenant (case/whitespace normalized).
2. `barcode` — scan at POS, unique per tenant.
3. `part_number` — OEM/manufacturer reference, NOT unique (case-insensitive index).
4. `id` — internal UUID, used by all inter-service references.
5. `name` / `name_alt` — full-text search (no dedicated FTS index exists yet).

**Gap (G6):** No full-text search index on `items.name`. Name-based item search at POS
currently relies on `ILIKE '%query%'` which is a sequential scan on large catalogs.
A GIN index on `to_tsvector('english', name)` (and Arabic for name_alt) is needed for
10,000+ SKU tenants. This is a Layer 1 master-data infrastructure gap, not a movement issue.
