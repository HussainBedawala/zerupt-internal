# Layer 1 — Master Data: Index

| Chapter | Title | Key focus |
|---------|-------|-----------|
| 00 | Overview | What master data means; scope in/out; 10-year promise |
| 01 | Item master model | Every column on `items`; type enum; matrix; soft-delete; G1/G2 |
| 02 | Units of measure & pack units | Base-unit-canonical; `item_pack_units`; resolvePackUnit; snapshots; G3/G4 |
| 03 | Barcodes & identifiers | `item_barcodes`; uniqueness; symbologies; internal generation; G5/G6 |
| 04 | Categories & classification | `item_categories`; hierarchy; NULLS NOT DISTINCT; G7/G8 |
| 05 | Tracking type as master data | `tracking_type` enum; Layer-0 enforcement driver; change-mid-life gap G2 |
| 06 | Batch & serial master records | `item_batches`; `item_serial_numbers`; lifecycle; expiry; G9/G10 |
| 07 | Location hierarchy | legal_entity→branch→warehouse→zone→bin; bin_id deferred task |
| 08 | Master data integrity | Uniqueness map; soft-delete policy; multi-tenant isolation; G12 |
| 09 | Open questions / audit decisions | All 12 gaps consolidated; 4 founder decisions; hardening task list |
