# 09 — Open Questions & Audit Decisions

## Confirmed gaps (enumerated across chapters)

| # | Gap | Chapter | Severity | Decision needed |
|---|-----|---------|----------|-----------------|
| G1 | `matrix_parent` / `matrix_variant` item types have no `item_attributes` table — variants cannot describe their differentiating properties (Size=M, Color=Red) | Ch01 | HIGH | Build `item_attributes` + `item_attribute_values` OR defer matrix to post-MVP and document clearly |
| G2 | `tracking_type` can be changed from `batch`/`serial` → `none` on an item with existing batch/serial ledger history — silently corrupts FEFO/recall integrity | Ch01, Ch05 | CRITICAL | Add service-layer guard: block change if any `stock_ledger_entries` row exists with `batch_id IS NOT NULL` (or `serial_number_id IS NOT NULL`) for this item |
| G3 | No global `units_of_measure` table — `items.unit` is free-form varchar; synonyms ("pcs"/"piece"/"pieces") are indistinguishable; no ZATCA UNECERec20 mapping | Ch02 | MEDIUM | Decide: add UOM registry now OR accept manual consistency via import normalization |
| G4 | No DB-level partial unique index on `(item_id) WHERE is_default_sell = true` or `is_default_purchase = true` — multiple defaults per item possible | Ch02 | MEDIUM | Add two partial unique indexes to `item_pack_units` |
| G5 | Barcode format not validated against declared `type` (ean13 row could carry 7 digits) | Ch03 | MEDIUM | Add CHECK constraints per barcode type |
| G6 | No full-text search index on `items.name` — ILIKE scan on large catalogs | Ch03 | MEDIUM | Add GIN index on `to_tsvector` for name + name_alt |
| G7 | No `tax_group_id` on `item_categories` — category-level tax defaults require per-item configuration | Ch04 | MEDIUM | Add nullable `tax_group_id` FK to `item_categories`; resolve up the tree |
| G8 | Category-level `account_mappings` resolution path needs audit verification | Ch04 | MEDIUM | Trace `account_mappings` resolution in the service to confirm category scope works |
| G9 | `item_batches.qty_remaining` has no `CHECK >= 0` at DB level | Ch06 | HIGH | Add CHECK constraint (mirrors the `materialized_stock_levels` pattern) |
| G10 | `item_batches.grn_doc_id` is a soft UUID with no FK | Ch06 | LOW | Accept as soft link OR add FK once GRN table is stable |
| G11 | `bins` have no `capacity` / `capacity_unit` field | Ch07 | LOW | Out of MVP scope; document for 10-year roadmap |
| G12 | No guard prevents hard-deleting a pack unit used on historical transaction lines | Ch08 | MEDIUM | Add service-layer check: restrict delete if any transaction line references pack_unit_id |

## Open questions requiring founder decision

### OQ-L1-01: Wire bin_id into the ledger NOW or wait for bin operations?

Layer 0 hardening deferred `bin_id` to Layer 1 with a clear plan: add nullable
`bin_id uuid REFERENCES bins(id)` to `stock_ledger_entries`. This is the Layer 1 hardening
task. The question is whether to also update the `materialized_stock_levels` granularity to
`(item, warehouse, bin)` now, or keep it at `(item, warehouse)`.

Recommendation: add `bin_id` to the LEDGER (immutable audit dimension) now. Keep
`materialized_stock_levels` at (item, warehouse) for now — bin-level on-hand is derived via
`Σ ledger.quantity WHERE bin_id = X`, consistent with the batch projection pattern.

### OQ-L1-02: Matrix items — scope for MVP?

`item_type` enum has `matrix_parent` and `matrix_variant` but no `item_attributes` table.
The schema is forward-compat but not functional. Should Layer 1 hardening include building
`item_attributes` + `item_attribute_values`? Or explicitly mark matrix as post-MVP and
add a service-layer guard blocking `type = 'matrix_parent'` creation until the tables exist?

### OQ-L1-03: Global UOM registry?

Free-form `unit` varchar is fast to ship but creates long-term reporting fragmentation.
A `units_of_measure` table with `code` (canonical), `name`, `synonyms[]`, and `unece_rec20_code`
would enable unit normalization at import and ZATCA compliance. Decide now or defer.

### OQ-L1-04: Category-level tax and GL defaults?

For a retailer with 200 items across 20 categories, setting tax group and GL account mapping
per-item is impractical. Should the audit add `tax_group_id` to `item_categories` now?
The COA module has a precedent (account group inheritance). This is a master-data ergonomics
decision with no ledger impact.

## Hardening tasks locked for Layer 1

Based on the above, the Layer 1 hardening work is:

1. **Wire bin_id** — add nullable `bin_id` FK column to `stock_ledger_entries`; supporting index.
2. **Fix G2** — guard `tracking_type` change in `items.service.ts` when history exists.
3. **Fix G4** — add partial unique indexes for default sell/purchase pack units.
4. **Fix G5** — add barcode format CHECK constraints per type.
5. **Fix G9** — add `CHECK qty_remaining >= 0` to `item_batches`.
6. **Fix G12** — add service-layer guard for pack unit hard-delete.
7. **Decide G1, G3, G7** — founder call on matrix items, UOM registry, category tax defaults.
8. **Verify G8** — trace account_mappings category resolution in service; fix if broken.

Generate migration after schema fixes; apply to dev tenant DB; validate; push to prod via Railway.
