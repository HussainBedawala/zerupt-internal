<!-- Zerupt internal knowledge base | Migration intake: Layer 3a | Updated: 2026-10-02 -->
# Layer 3a: Items

Part of the [Zerupt Migration Intake Specification](README.md).

**In one line:** the things the business buys and sells, with their codes, names, prices and packing.

---

## 1. Headline findings

**1. An item needs almost nothing.** Only a **name** and a **unit**. The code is generated if we do not supply one, a category is optional, and prices default to zero. Legacy catalogues are usually far richer than our minimum, so nothing gets rejected for being too thin.

**2. There is already a proper bulk import for items**, built for exactly this. It writes in chunks of 500, can resume if interrupted, handles categories, cross-reference codes and auto-parts items in the same run. For 9,200 items that is about 19 chunks. **We should use it rather than build anything.**

**3. One hard requirement if the auto-parts pack is on: every part needs a family.** It is enforced by the database itself, not just the app. If the customer's catalogue does not map cleanly onto families, the import will refuse those rows. **We need a fallback family, such as "Unclassified", decided before the first import run.**

**4. Cost method is fixed to weighted average.** FIFO is blocked in the database. Fine for most customers, but a source system using FIFO cannot be reproduced exactly, and that has to be said out loud before migrating one.

---

## 2. What an item is

| Field | Type | Need | Notes |
|---|---|---|---|
| `name` | text, max 300 | **required** | |
| `unit` | text, max 20 | **required** | The base unit, such as PCS |
| `sku` | text, max 100 | optional | Generated if missing. **Unique**, ignoring case and spaces |
| `nameAlt` | text | optional | Second language, such as Arabic |
| `categoryId` | link | optional | An item does not need a category |
| `itemKind` | list | required | `stock`, `non_stock` or `service`. Defaults to `stock` |
| `costPrice` | money | required | Defaults to 0. This is a **buying default, not the stock value** |
| `sellingPrice` | money | required | Defaults to 0. The normal list price |
| `partNumber` | text | optional | Free text. Not unique, which is correct for parts |
| `brand` | text | optional | Free text |
| `taxGroupId` | link | optional | Empty means use the default |
| `valuationMethod` | list | required | **Weighted average only.** FIFO is blocked |
| `reorderLevel` | number | optional | |
| `trackingType` | list | required | `none`, `serial` or `batch`. Defaults to none |
| `weightKg` | number | optional | Must be above zero if set. Not allowed on services |
| `isActive` | true/false | required | Defaults to true. This is how items are "deleted" |

⚠️ **`costPrice` on the item is not the stock value.** It is a default for purchasing. The real cost of stock lives in the cost pool, covered in Layer 4. Confusing these two would be an expensive mistake.

**Deleting is blocked** once an item has any stock history, which is correct. Items are switched off, never removed.

---

## 3. Units and packs

- Every item has one **base unit**, and it is required.
- **Bigger units** (box, carton) are optional extras, each with how many base units it contains. Their prices are worked out from the base price, never stored separately.
- When a document uses a bigger unit, it **freezes** the conversion at that moment, so later changes do not rewrite history. Good behaviour, and it matches our fidelity rule.

For a customer using only PCS, nothing extra is needed. The item's unit is PCS and that is the end of it.

**Nothing is auto-created**, so whatever units the customer uses must be set on their items.

---

## 4. Categories and brands

| Thing | How it works here |
|---|---|
| **Categories** | A tree, up to 4 levels. Name required, code generated if missing |
| **Sub-categories** | Not a separate thing. A sub-category is just a category with a parent |
| **Brands** | Free text on the item. No separate brand list for ordinary items |

So a source system with categories and sub-categories maps cleanly: the sub-category becomes a child of the category.

The auto-parts pack has its own proper brand list, which is separate and only used for parts.

---

## 5. Barcodes and cross-reference codes

Two different things, often confused:

| | **Barcodes** | **Alternate codes** |
|---|---|---|
| What | The thing scanned at the counter | Other numbers the same part is known by |
| Examples | EAN, UPC, Code128 | OEM number, aftermarket number, superseded number, supplier code |
| Unique? | **Yes, across the whole tenant** | No. Many items may legitimately share an OEM number |
| How many per item | Many, one marked primary | Unlimited, no primary |
| Searchable | Exact scan | Exact **and fuzzy**, so a mistyped number still finds the part |

The alternate codes table supports these kinds: `oem`, `aftermarket`, `superseded`, `interchange`, `supplier`, `part_number`, `size`, `sku`, `other`.

So a source system with four cross-reference code columns maps straight in, one row per code. Four is nothing; there is no limit.

---

## 6. Prices

| Price | Where it lives |
|---|---|
| Cost | On the item, as a buying default |
| Retail or list | On the item, as `sellingPrice` |
| **Wholesale** | A **price list** called Wholesale. The import handles this |
| Bulk break prices | The same price list, with a minimum quantity per tier |
| Customer-specific prices | Price lists |

Each price list has its own currency. One list can be the default.

✅ **Resolved for the replay path: any number of named price levels.** The replay item record carries `prices`, a list of `{listName, amount}` (up to 50). Each entry is written onto the tenant's price list of that name, found or created, at a minimum quantity of 1. So wholesale, special and any other level travel the same way. Rules:

- A list whose currency does not match is skipped with the warning `price_list_currency_mismatch`, because a number in the wrong currency on a live list is a wrong price.
- A list named twice for one item keeps the first and warns `price_duplicate`.
- A list or row that fails to write warns `price_list_failed` or `prices_failed`.

The base `sellingPrice` and `costPrice` stay on the item itself.

---

## 7. The auto-parts pack

| Table | What it holds | Required? |
|---|---|---|
| `partFamilies` | The kind of part (brake pad, filter) | **Yes, if the pack is on** |
| `partBrands` | Proper brand records for parts | Optional |
| `partGrades` | Quality levels | Optional |
| `partDetails` | The extra part information on an item | One per item, if the pack is on |
| `vehicleMakes`, `vehicles`, `fitments` | Which vehicles a part fits | Entirely optional |

**The one hard rule: every part must have a family.** The database enforces it, with a test guarding it. Position, size, drive side, warranty and grade are all optional.

So before importing an auto-parts catalogue we must decide the family list, and decide what happens to items that do not fit any of them. A catch-all family is the sensible answer.

An item with no part details is still a perfectly good ordinary item, so the pack really is an overlay.

---

### Item fields in the replay record

On top of the base item, the replay record accepts:

| Field | Notes |
|---|---|
| `brandName` | Brand **by name**. With the auto-parts pack off it lands in the item's free-text brand. With the pack on, a part brand is found or created by name |
| `partNumber` | The item's part number (up to 100 characters) |
| `alternateCodes` | Up to 100 cross-reference codes, each `{code, type}`. A code with no type lands as `other` |
| `prices` | Named price-list prices, see section 6 |
| `familyCode`, `fitments` | **Auto-parts pack only.** Fitments are make, model, optional year range and engine (up to 200 per item) |

**Pack-only fields on a tenant without the pack are a blocking problem:** `pack_fields_without_pack`. The same check runs at validate time and again in the writer, so such an item is never half-written. Note also that with the pack on, a part with no `familyCode` is still given a family by the product (a singleton family per part), so no catch-all family is created by the replay.

**Child rows are warnings, not failures.** Alternate codes, price tiers, packs and barcodes are written after the item commits. One that does not land warns on the item (`alternate_codes_failed`, `price_list_failed`, `prices_failed`, `price_duplicate`, `price_list_currency_mismatch`, `pack_failed`, `pack_duplicate`, `barcodes_failed`, `barcode_rejected`, `barcode_collision`) and never rolls the item back. **On a resume, the idempotent children (alternate codes, price tiers) are written again for the items this migration itself created**, so a crash between the item and its children heals itself. An item that was only linked to an existing row is the operator's own record, and its children are never touched.

One known gap: the item's `taxCodeRef` is not written to the item, because items carry a tax group and the record carries a tax code. Document lines resolve tax from their own `taxCodeRef`.

*Code: `layers/masters-items.writer.ts` and `masters-items.extras.ts`; schema in `packages/shared/src/migration-replay/records-masters.ts`.*

---

## 8. How items get created

| Path | Use |
|---|---|
| One at a time, through the normal item endpoint | Manual work |
| **The bulk import** | **What a migration uses** |

The bulk import already handles categories, cross-reference codes, wholesale prices, matrix items, duplicates, and **routes auto-parts items through their own branch when the pack is active**, resolving or creating families and brands as it goes. It writes in chunks of 500 and can recover mid-run.

No throughput concern for 9,200 items.

---

## 9. What the old system must tell us

| We need | Notes |
|---|---|
| Item code | Becomes the SKU. **Must be unique, ignoring case and spaces** |
| Name, and second-language name | |
| Base unit | |
| Category, and sub-category | Becomes a two-level tree |
| Brand | Free text |
| Part number | Free text, not unique |
| Cross-reference codes, each with its kind | Unlimited |
| Barcodes, with their kind | Must be unique across the tenant |
| Cost price and selling price | |
| Other price levels, with their list names | |
| Active or inactive | |
| Reorder level, weight, pack sizes | Optional |
| For parts: family, and optionally brand, grade, position, size, vehicle fitment | **Family is required** |

---

## 10. Traps

| Trap | Consequence |
|---|---|
| **Item codes that differ only in case or spaces** | `FLT-001` and `flt-001 ` collide. Must be cleaned before import |
| Confusing the item's cost price with stock value | Two different things. Layer 4 covers the real one |
| Assuming FIFO can be set per item | It cannot. Weighted average only |
| Forgetting part families | The database refuses those rows |
| Barcodes duplicated across items | Refused. Must be cleaned first |
| Sending a price list in a different currency from the existing list | Skipped with `price_list_currency_mismatch` |
| Sending family or fitment data to a tenant without the auto-parts pack | Blocked with `pack_fields_without_pack` |

---

## 11. Open questions

1. ~~Is a fourth price level supported?~~ **Resolved for the replay path** through `prices`. The older template import still wires only wholesale.
2. **Where is the auto-parts pack switched on and checked?** The auditor could not find the entitlement check inside the auto-parts code. Needs a targeted look, because everything above assumes the pack is on for parts customers.
3. **Is anything auto-created at signup for units, categories or price lists?** Nothing was found, but the onboarding steps were not read in full.

---

## 12. Worth noting

The audit found a folder in the codebase called `migration/unified-import`, holding a price-list import service. So some migration machinery already exists. **Domain 12 of this audit is specifically about finding everything we already have**, so we build as little as possible.
