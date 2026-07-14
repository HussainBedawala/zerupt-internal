# Item Model

## Item Types

| Type | Description | When to Use |
|------|------------|-------------|
| **Flat** | Single SKU. Each variant is a separate item record. | Most items. Simple to manage. |
| **Matrix** | Parent item + variant combinations generated from attribute axes. | Apparel (size × color), shoes, etc. |

## Item Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | auto | |
| `tenantId` | string | auto | |
| `sku` | string | yes | Unique within tenant. Auto-generated or manual. |
| `name` | string | yes | Primary language |
| `nameAlt` | string | no | Alternate language |
| `type` | enum | yes | `Flat`, `MatrixParent`, `MatrixVariant` |
| `parentItemId` | string | MatrixVariant only | Reference to parent |
| `categoryId` | string | yes | Reference to category |
| `brandId` | string | no | |
| `description` | string | no | |
| `unit` | string | yes | Unit of measure: `pcs`, `kg`, `m`, `box` |
| `weight` | decimal | no | For landed cost allocation by weight |
| `dimensions` | object | no | `{ length, width, height, unit }` |
| `images` | array | no | URLs, first = primary |
| `isActive` | boolean | yes | Inactive items hidden from selection, history preserved |
| `trackingType` | enum | yes | `None`, `Serial`, `Batch` |
| `valuationMethod` | enum | yes | `WAC`, `FIFO`. Defaults from company setting. Batch items auto-FIFO. |
| `taxGroupId` | string | no | Tax group for sales/purchase. Null = use default. |
| `customFields` | object | no | Tenant-defined key-value pairs |
| `createdAt` | datetime | auto | |
| `updatedAt` | datetime | auto | |

## Matrix Items (as-built)

A matrix parent defines its own **attribute axes** (e.g., Size, Color) — axes are per-parent, not a shared tenant attribute library. The system generates all valid combinations as `MatrixVariant` items, with parent and variants both stored as rows in `items`.

**Parent item** stores: shared name, description, category, images, base price, tax group. Parents are DB-trigger enforced as non-stockable and non-sellable and cannot carry barcodes — a parent is a template row, never transacted against directly.

**Variant items** inherit everything from the parent at generation time (no live cascade — editing the parent after generation does not retroactively change existing variants) but can override:
- SKU (always unique per variant; auto-generated, see below)
- Barcode (always unique per variant)
- Price (optional override)
- Weight
- Images (optional — falls back to parent)

`type` and `parentItemId` are immutable once set — a variant can never be reparented or converted to a flat item, and vice versa.

### Attribute Axes

| Field | Description |
|-------|-------------|
| `name` / `nameAlt` | Axis name, bilingual: "Size" / "المقاس" |
| `values` | Ordered list of `{ value, valueAlt }` pairs, e.g. `[{value: "S", valueAlt: "صغير"}, ...]` |

Up to 3 axes per matrix parent (Size × Color × Material). Axes cannot be added or deleted after the parent is created — the axis set is locked at creation time. Value **rename** is supported post-creation and triggers a recompute of dependent variant names (SKU is not recomputed on rename). A hard cap of 250 generated variants per parent is enforced to bound combinatorics.

### Variant Generation

When a matrix parent is created:
1. System generates all combinations: `S/Red`, `S/Blue`, `M/Red`, `M/Blue`, ...
2. Each combination becomes a `MatrixVariant` item with auto-generated SKU: `{parent-sku}-{VAL1}-{VAL2}` (uppercased value tokens)
3. A `combo_key` per parent+combination is enforced unique at the database level as a backstop against duplicate variant generation
4. User can deactivate specific variants (e.g., "we don't carry XXL in Red") — deactivation, not deletion; history is preserved
5. Adding a new axis **value** (e.g., a new color) and re-running generation is idempotent: only the missing variants for the new value are created, existing variants are untouched (`generate-missing`)

### Deliberately not built (as of this ship)

- Adding or deleting an axis after the parent is created
- Converting a flat item to a matrix parent (or vice versa) after creation
- A tenant-wide shared attribute library (axes are defined per-parent, from scratch, every time)

## Categories

Hierarchical, up to 4 levels: `Electronics > Mobile Phones > Accessories > Cases`

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `name` | string | |
| `parentCategoryId` | string | null = top level |
| `sortOrder` | integer | Display order |
| `isActive` | boolean | |
| `defaultTaxGroupId` | string | Items in this category inherit this tax group unless overridden |
| `defaultAccountMappings` | object | Override accounting accounts for items in this category |

## Barcodes

Multiple barcodes per item. Any barcode resolves to exactly one item. Matrix parents cannot carry barcodes (DB-trigger enforced); only variants and flat items can.

| Field | Type | Description |
|-------|------|-------------|
| `barcode` | string | The barcode value (EAN-13, UPC-A, Code 128, etc.) |
| `itemId` | string | Item this barcode belongs to |
| `type` | enum | `EAN13`, `UPCA`, `Code128`, `Custom` |
| `isPrimary` | boolean | Used for label printing |
| `label` | string | Bilingual "barcode name" shown in UI (e.g., "Case barcode", "Store barcode") to disambiguate multiple barcodes on one item |

Constraint: barcode must be globally unique within a tenant.

### Alternate Codes (`item_alternate_codes`)

A second, distinct table for non-barcode identifiers a retailer needs to look items up by:

| Field | Type | Description |
|-------|------|-------------|
| `itemId` | string | Item this code belongs to |
| `code` | string | The alternate code value |
| `codeType` | enum | `oem`, `aftermarket`, `superseded`, `other` |
| `note` | string | Free-text context (e.g., "superseded by SKU-2024") |

Constraint: unique per item (not globally unique — the same alternate code can appear against different items, unlike barcodes). Wired into the POS/scanner lookup ladder between the SKU rung and the supplier-code rung (see Barcode Lookup Resolution below).

### Scale Barcodes

For weighed goods (produce, deli, bakery), scales print GS1-style barcodes encoding a PLU/item reference and a weight or price segment. The server parses the standard GS1 "2x" prefix format for parity with physical scales. Governed per-tenant by `tenantIdentity` settings:

| Setting | Description |
|---------|-------------|
| `scaleBarcodeEnabled` | Turns scale-barcode parsing on for the tenant |
| `scaleBarcodePluSource` | Which field the scale's PLU segment maps to: `sku` or `barcode` |

## Barcode Lookup Resolution

When a code is scanned (POS, GRN, stock count), the lookup ladder is tried in order and stops at the first match:
1. **Scale barcode** — if scale parsing is enabled and the scanned value matches the GS1 "2x" pattern, parse and resolve via the configured PLU source
2. **Barcode** — exact match against the barcodes table within tenant
3. **Normalized SKU** — exact match against item SKU (case/whitespace normalized)
4. **Alternate codes** — match against `item_alternate_codes`
5. If not found → return "item not found"

For matrix items, all of the above resolve to the specific variant, never the parent — matrix parents return a 400 if looked up directly (they carry no barcode and are not transactable).

## Pack Units / UOM

Each item's `unit` field (e.g. `pcs`) is the **base unit** — all stock ledger quantities and on-hand balances are always stored and displayed in base units, regardless of what unit a transaction was entered in. Retailers who buy in cartons and sell by the piece (or similar) define additional **pack units** per item in `item_pack_units`:

| Field | Type | Description |
|-------|------|-------------|
| `itemId` | string | Item this pack unit belongs to |
| `name` / `nameAlt` | string | Pack unit name, bilingual: "Carton" / "كرتون" |
| `conversionFactor` | decimal | Base units per pack (e.g., 12 for a carton of 12 pieces); must be > 0, fractional factors allowed |
| `barcode` | string | Optional dedicated barcode for the pack itself (e.g., scan the carton, not a piece) |

Constraint: pack unit names are unique per item; a conversion factor of 0 or negative is rejected at the API and DB level.

### `resolvePackUnit` — shared resolver

Every module that accepts a quantity in a pack unit (POS, Sales Order lines, Purchase Order/GRN lines, Stock Adjustments, Transfers) calls the same shared resolver: `resolvePackUnit(packUnitId, quantity)` returns `quantity × conversionFactor`, and that resolved value — never the pack-unit quantity — is what gets written to the stock ledger. No module implements its own ad-hoc conversion.

- Conversion is applied at the point of movement entry; it is not retroactive. Editing a pack unit's conversion factor later never alters ledger entries already written under the old factor.
- Deleting a pack unit does not corrupt or alter existing ledger entries (already stored in base units).
- Multi-location movements (transfers) apply the conversion at both source and destination — a 1-carton transfer moves 12 base units out of the source and 12 into the destination, not 1.

## Industry Capability Profile

A shared profile (`packages/shared/item-field-visibility.ts`) governs which optional item fields and template columns are surfaced, per tenant industry, so the item form and bulk-import template don't overwhelm merchants with fields irrelevant to their trade:

| Capability | Gated by industry | Field(s) shown |
|---|---|---|
| Variants (matrix) | `apparel_fashion` | matrix parent/variant creation UI |
| Alternate codes | part-number industries (auto, electronics, hardware) | `item_alternate_codes` section |
| Scale barcode setting | `grocery` | `scaleBarcodeEnabled` / `scaleBarcodePluSource` toggle |
| Serial emphasis | `electronics` | serial-tracking prioritized in UI copy/defaults |
| Batch emphasis | `grocery`, `cosmetics` | batch-tracking prioritized in UI copy/defaults |
| Part number, weight, wholesale price | industry-specific | respective fields |

Rule enforced everywhere the profile is consulted: a field shows if **the industry flag is on OR data already exists** for that field on the item (so a tenant that switches industries, or has legacy data, never loses visibility into data it already has). Fields not covered by the active industry's profile are hidden behind a "Show more fields" disclosure in the item form rather than removed outright. The same profile gates which columns appear in the bulk-import template (see Bulk Import below).

## Item Lifecycle

```
Draft → Active → Inactive
```

- **Draft**: Created but not yet available for transactions. Can be edited freely.
- **Active**: Available in POS, Sales, Purchase. Can be edited (with restrictions on cost method changes).
- **Inactive**: Hidden from selection. History preserved. Can be reactivated. Cannot be deleted if transactions exist.

## Bulk Import

CSV/Excel import with these steps:
1. Download template with required/optional columns
2. Upload filled file
3. System validates: required fields, unique SKU/barcode, valid category IDs, data types
4. Preview: show valid rows (green) and error rows (red) with error messages per row
5. Confirm: import valid rows, skip error rows
6. Result: import count + error report download

**Template v1.1.0 (as-built):** the flat-item import path is unchanged. New in this version:
- `variantGroup` column plus up to 3 option-pair columns, so a spreadsheet of variant rows can be grouped and imported as a matrix parent + variants in one pass
- A dedicated **Alternate Codes** sheet (item reference + code + codeType + note)
- 10 new hold reasons surfaced in the preview/error report, including `variantGroupTooLarge` (>250 combinations), `itemSkuIsMatrixParent` (a row tries to transact against a parent SKU), and `parentNotStockable`
- Which columns appear at all (variants, alternate codes, scale barcode setting, etc.) is gated by the tenant's Industry Capability Profile (see above)
- Re-imports are idempotent: re-running the same file does not duplicate variants or alternate codes
