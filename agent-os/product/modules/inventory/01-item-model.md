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

## Matrix Items

A matrix parent defines **attribute axes** (e.g., Size, Color). The system generates all valid combinations as `MatrixVariant` items.

**Parent item** stores: shared name, description, category, images, base price, tax group.

**Variant items** inherit everything from parent but can override:
- SKU (always unique per variant)
- Barcode (always unique per variant)
- Price (optional override)
- Weight
- Images (optional — falls back to parent)

### Attribute Axes

| Field | Description |
|-------|-------------|
| `name` | Axis name: "Size", "Color", "Material" |
| `values` | Ordered list of values: `["S", "M", "L", "XL"]` |

Up to 3 axes per matrix item (Size × Color × Material = max combinations).

### Variant Generation

When a matrix parent is created/updated:
1. System generates all combinations: `S/Red`, `S/Blue`, `M/Red`, `M/Blue`, ...
2. Each combination becomes a `MatrixVariant` item with auto-generated SKU: `{parent-sku}-{size}-{color}`
3. User can deactivate specific variants (e.g., "we don't carry XXL in Red")
4. Adding a new axis value (e.g., new color) auto-generates the missing variants

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

Multiple barcodes per item. Any barcode resolves to exactly one item.

| Field | Type | Description |
|-------|------|-------------|
| `barcode` | string | The barcode value (EAN-13, UPC-A, Code 128, etc.) |
| `itemId` | string | Item this barcode belongs to |
| `type` | enum | `EAN13`, `UPCA`, `Code128`, `Custom` |
| `isPrimary` | boolean | Used for label printing |

Constraint: barcode must be globally unique within a tenant.

## Barcode Lookup Resolution

When a barcode is scanned (POS, GRN, stock count):
1. Search barcodes table for exact match within tenant
2. If found → return the item
3. If not found → search by SKU
4. If not found → return "item not found"

For matrix items, the barcode resolves to the specific variant, not the parent.

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
