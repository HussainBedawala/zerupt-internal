# 06 — Batch & Serial Master Records

Sources: `packages/db/src/schema/item-batches.ts`,
`packages/db/src/schema/serial-numbers.ts`

## Scope of this chapter

Batch and serial IDENTITY — what a batch or serial IS (attributes, lifecycle, expiry).
Quantity — what a batch CONTAINS — belongs to the ledger (Layer 0):
`item_batches.qty_remaining = Σ stock_ledger_entries.quantity WHERE batch_id`.
That column is a projection, not master data; it's the reconciliation target, not the source.

---

## `item_batches` table (item-batches.ts)

One row per (tenant, item, warehouse, batch_no). The batch is scoped to a warehouse because
the same lot number from the same supplier might split across two warehouses in a transfer;
each location needs its own FEFO row.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | defense-in-depth; no FK |
| `item_id` | uuid NOT NULL | FK → items (restrict) |
| `warehouse_id` | uuid NOT NULL | FK → warehouses (restrict) |
| `batch_no` | text NOT NULL | lot/batch number; free text |
| `manufactured_date` | date | nullable; production date |
| `expiry_date` | date | nullable; FEFO key |
| `qty_remaining` | numeric(19,6) NOT NULL default 0 | PROJECTION — see above |
| `unit_cost` | numeric(19,6) | cost at receipt (optional) |
| `supplier_batch_ref` | text | supplier's own lot reference |
| `grn_doc_id` | uuid | soft link to GRN (no FK — avoids cross-module coupling) |
| `status` | `batch_status` enum NOT NULL default `active` | lifecycle |
| `created_at` / `updated_at` | timestamptz | audit |

### Batch status lifecycle

```
active ──────────────────────────────────► exhausted (qty reaches 0 or write-off)
  │                                             ▲
  ▼                                             │
expiring (system job: 30-day before expiry) ──►│
  │                                             │
  ▼                                             │
expired (system job: past expiry_date) ─────────┘
```

Status transitions are made by a scheduled job (external to this schema). Operators can
manually write off a batch (qty_remaining → 0, status → exhausted).

### Unique constraint

`item_batches_tenant_item_warehouse_batch_no_key` on `(tenant_id, item_id, warehouse_id, batch_no)`.
The same batch number can exist in multiple warehouses (after a warehouse transfer).

### FEFO index

`item_batches_fefo_idx` on `(tenant_id, item_id, warehouse_id, status, expiry_date)` — covering
index for "pick earliest-expiry active batches" at POS/GRN time.

### Gap (G9): No CHECK on qty_remaining

`qty_remaining` has no `CHECK >= 0` constraint at DB level (item-batches.ts only mentions it
in a comment). A concurrent double-decrement could drive it negative. The service validates
before writing, but DB-level protection (as on materialized_stock_levels) would be safer.

### Gap (G10): grn_doc_id has no FK

`grn_doc_id` is a soft UUID reference with no FK to any GRN table. If the GRN document is
ever voided/deleted (not current behavior, but a future possibility), the batch's provenance
link becomes a dangling pointer with no detection mechanism.

---

## `item_serial_numbers` table (serial-numbers.ts)

One row per physical unit. Serial numbers unique per (tenant, item) — the same serial can
appear for two different items (e.g., two different brands can have "SN-001") but not twice
for the same item.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | defense-in-depth |
| `item_id` | uuid NOT NULL | FK → items (restrict) |
| `warehouse_id` | uuid NOT NULL | FK → warehouses (restrict); current location |
| `serial_no` | text NOT NULL | human-readable serial (IMEI, custom, etc.) |
| `status` | `serial_number_status` enum NOT NULL default `available` | lifecycle |
| `acquisition_cost` | numeric(19,6) | nullable; cost at receipt |
| `purchase_doc_type` / `purchase_doc_id` | text / uuid | backref to receipt document |
| `sale_doc_type` / `sale_doc_id` | text / uuid | backref to consuming document |
| `notes` | text | freeform |
| `warranty_months` | integer | nullable; warranty duration |
| `warranty_expiry` | date | nullable; computed at sale time |
| `warranty_terms` | text | nullable; vendor policy |
| `created_at` / `updated_at` | timestamptz | audit |

### Serial status lifecycle

```
available ──► reserved (SO/sales order hold)
           ──► sold (POS/invoice consumed)
           ──► in_transit (transfer dispatched)
reserved   ──► available (reservation released)
           ──► sold
any        ──► returned
           ──► defective
```

### Warranty tracking

The `warranty_*` fields embed warranty data directly on the serial row (no separate warranty
table). `warranty_expiry` is indexed (`item_serial_numbers_tenant_id_warranty_expiry_idx`) for
"expiring warranties in next 30 days" dashboard widget.

### Gap for audit

No `bin_id` on either `item_batches` or `item_serial_numbers`. When bins are wired into the
ledger (Layer 1 deferred task from Layer 0 hardening log), batches and serials at a warehouse
may need further sub-location granularity. This is a deliberate deferral, not oversight.
