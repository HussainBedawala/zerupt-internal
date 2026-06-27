# 04 — Categories & Classification

Source: `packages/db/src/schema/inventory-items.ts` (itemCategories, lines 41-88)

## `item_categories` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `name` | varchar(200) NOT NULL | primary language name |
| `name_alt` | varchar(200) | alternate language (Arabic) |
| `parent_id` | uuid | self-FK → item_categories (restrict on delete); NULL = root |
| `sort_order` | integer NOT NULL default 0 | display order among siblings |
| `image_url` | varchar(2048) | nullable; category display image |
| `is_active` | boolean NOT NULL default true | soft deactivation |
| `created_at` / `updated_at` | timestamptz | audit |

## Hierarchy

Self-referencing tree via `parent_id`. Up to 4 levels deep — this is a service-layer business
rule (not expressed in DDL — Postgres cannot check recursive depth in a CHECK constraint).

Example tree:
```
Electronics (level 1)
  └── Mobile Phones (level 2)
        ├── Android (level 3)
        │     └── Budget (level 4)  ← max depth
        └── iPhone (level 3)
```

`onDelete: "restrict"` on `parent_id` prevents deleting a category that has children,
forcing explicit reparenting first. This is correct — orphaned subtrees would be invisible.

When a category is deleted, `items.category_id` → `onDelete: "set null"` (inventory-items.ts:128).
Items become "uncategorized" rather than cascade-deleted. This is safe: categories are
classification, not item identity.

## Uniqueness

`item_categories_tenant_parent_name_key` — unique on `(tenant_id, parent_id, name)` with
`NULLS NOT DISTINCT`. The `NULLS NOT DISTINCT` clause is critical: without it, a plain unique
constraint treats all NULL parent_ids as distinct, allowing unlimited duplicate root-level
category names. With it, two top-level categories in the same tenant cannot share a name.

## Indexes (inventory-items.ts:83-87)

- `item_categories_tenant_parent_idx` on `(tenant_id, parent_id, sort_order)` — tree
  navigation: list children of a parent in display order.
- `item_categories_parent_id_idx` on `(parent_id)` — FK restrict-check performance.

## Classification gaps

**Gap (G7):** No category-level defaults for tax group or costing method. Currently, an item's
`tax_group_id = NULL` means "use tenant default". A retailer with 20 product categories —
some zero-rated (fresh food), some standard-rated (electronics), some exempt (medicines) —
cannot assign a tax default at category level. Every item must be individually tax-configured.
A `tax_group_id` on `item_categories` with a "walk up the tree until a non-null is found"
resolution (same pattern as COA group inheritance) would eliminate per-item tax setup for
tenants with consistent category-level tax policies.

**Gap (G8):** No account mapping at category level for inventory GL. The `account_mappings`
table supports `mapping_scope` = `category` (enums.ts:158-164), but the category-level
mapping resolution path needs verification during the audit — does the system actually resolve
category → account when an item has no item-level mapping? If not, every item needs an
explicit GL mapping, which is impractical for large catalogs.
