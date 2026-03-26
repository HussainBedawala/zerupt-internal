# Document Numbering Service — Schema & API

> Schema: `packages/db/src/schema/document-sequence.ts`
> Enums: `packages/db/src/schema/enums.ts`
> Service: `apps/api/src/doc-numbering/doc-numbering.service.ts`
> Controller: `apps/api/src/doc-numbering/doc-numbering.controller.ts`
> Product spec: `agent-os/product/settings-admin/07-document-numbering.md`

## Overview

Generates sequential, formatted document numbers for every transaction type (POS receipts, invoices, journal entries, GRNs, etc.). Supports per-branch sequences, date-based resets, gap-free numbering, and concurrent-safe reservation via `SELECT FOR UPDATE`.

**Status: Fully implemented.** Schema, service, controller, DTOs, and tests are all in place.

---

## Table: `document_sequences`

Tenant-scoped. One sequence per (tenant, documentType, branch). If `branchId` is NULL, it's a tenant-wide fallback.

### Core Columns

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid | no | random | PK |
| `tenant_id` | uuid | no | — | Tenant isolation |
| `document_type` | enum | no | — | Which transaction type this sequence serves |
| `branch_id` | uuid | yes | — | Branch-specific sequence; NULL = tenant-wide |
| `prefix` | varchar(50) | no | — | e.g., `INV-`, `JRN-`, `POS-` |
| `suffix` | varchar(50) | yes | — | Optional trailing text |
| `date_segment` | varchar(50) | yes | — | Date format pattern (e.g., `YYYYMM`) inserted between prefix and counter |
| `padding` | smallint | no | 4 | Zero-pad width (e.g., 4 → `0001`) |
| `next_number` | bigint | no | 1 | Next counter value (incremented atomically) |
| `reset_policy` | enum | no | `never` | When to reset counter to 1 |
| `gap_policy` | enum | no | — | How to handle released numbers |
| `last_reset_at` | timestamp(tz) | yes | — | When counter was last reset |
| `is_active` | boolean | no | true | Soft-disable |

### Audit Columns

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `created_at` | timestamp(tz) | no | now() | — |
| `updated_at` | timestamp(tz) | no | now() | Auto-updated |

## Table: `sequence_reservations`

Tracks individual number reservations for audit trail and gap management.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid | no | random | PK |
| `sequence_id` | uuid | no | — | FK → document_sequences |
| `reserved_number` | varchar(200) | no | — | The formatted number string |
| `reserved_at` | timestamp(tz) | no | now() | When reserved |
| `status` | enum | no | `reserved` | `reserved` / `committed` / `released` |
| `source_document_id` | uuid | yes | — | The JE/invoice/POS receipt that used this number |
| `created_at` | timestamp(tz) | no | now() | — |

## Enums

### document_type (11)

`pos` · `so` · `inv` · `po` · `grn` · `prn` · `pay` · `rcv` · `adj` · `trf` · `jrn`

| Code | Full Name |
|------|-----------|
| `pos` | POS Receipt |
| `so` | Sales Order |
| `inv` | Sales Invoice |
| `po` | Purchase Order |
| `grn` | Goods Received Note |
| `prn` | Purchase Return Note |
| `pay` | Payment Voucher |
| `rcv` | Receipt Voucher |
| `adj` | Inventory Adjustment |
| `trf` | Stock Transfer |
| `jrn` | Journal Entry |

### reset_policy (3)

`never` · `yearly` · `monthly`

### gap_policy (2)

`strict` · `allow_gaps`

- **strict:** Released numbers decrement `next_number` (gap-free, required for tax invoices in some jurisdictions)
- **allow_gaps:** Released numbers are not reused

### reservation_status (3)

`reserved` · `committed` · `released`

## Constraints

| Constraint | Type | Rule |
|-----------|------|------|
| `document_sequences_tenant_id_document_type_branch_id_key` | UNIQUE | One sequence per (tenant, type, branch) |
| `document_sequences_tenant_type_no_branch` | UNIQUE (partial) | One tenant-wide sequence per type (`WHERE branch_id IS NULL`) |

## Indexes

| Index | Columns | Notes |
|-------|---------|-------|
| `document_sequences_tenant_id_idx` | `(tenant_id)` | List all sequences |
| `sequence_reservations_sequence_id_status_idx` | `(sequence_id, status)` | Find pending reservations |

---

## API — Sequence CRUD

### `POST /doc-numbering/sequences`

Create a new sequence for a document type.

**Request body:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `documentType` | enum | yes | — |
| `branchId` | uuid | no | NULL = tenant-wide fallback |
| `prefix` | string | yes | e.g., `INV-` |
| `suffix` | string | no | — |
| `dateSegment` | string | no | e.g., `YYYYMM` |
| `padding` | number | no | Default: 4 |
| `resetPolicy` | enum | no | Default: `never` |
| `gapPolicy` | enum | yes | `strict` or `allow_gaps` |

### `GET /doc-numbering/sequences`

List all sequences for the tenant. Supports filtering by `documentType` and `branchId`.

### `GET /doc-numbering/sequences/:id`

Single sequence with current `nextNumber`.

### `PATCH /doc-numbering/sequences/:id`

Update prefix, suffix, padding, etc. Cannot change `documentType` or `branchId` (delete and recreate).

### `DELETE /doc-numbering/sequences/:id`

Delete sequence. Blocked if any `committed` reservations exist (409 Conflict).

---

## API — Number Reservation

### `reserveNumber(documentType, branchId?)`

**The core function.** Called by `JournalPostingService`, POS, Sales, Purchase modules when creating a new document.

**Algorithm:**

```
1. Find sequence: exact match on (tenant, documentType, branchId)
2. If no branch-specific sequence: fallback to tenant-wide (branchId IS NULL)
3. If no sequence at all: throw SequenceNotFoundError
4. BEGIN transaction
5. SELECT ... FOR UPDATE on the sequence row (lock)
6. Check reset_policy:
   - If yearly: compare last_reset_at year vs current year → reset if different
   - If monthly: compare last_reset_at month vs current month → reset if different
7. Format number: prefix + dateSegment(now) + zeroPad(nextNumber, padding) + suffix
   Example: INV-202603-0042
8. Increment next_number
9. Insert into sequence_reservations (status = 'reserved')
10. COMMIT
11. Return { reservationId, formattedNumber }
```

**Concurrency:** `SELECT FOR UPDATE` ensures only one caller increments at a time. Other callers wait on the row lock. Safe under high POS throughput.

### `commitReservation(reservationId, sourceDocumentId)`

Called after the document (JE, invoice, etc.) is successfully saved.

```
1. Find reservation by ID
2. Verify tenant ownership
3. Update status → 'committed', set sourceDocumentId
```

### `releaseReservation(reservationId)`

Called if the document creation fails or is cancelled.

```
1. Find reservation by ID
2. Verify status = 'reserved' (cannot release committed)
3. Update status → 'released'
4. If gap_policy = 'strict': decrement next_number on the parent sequence
```

### `listReservations(sequenceId, status?)`

List reservations for a sequence, optionally filtered by status. Used for auditing gap-free compliance.

---

## Integration Points

| Caller | When | Method |
|--------|------|--------|
| `JournalPostingService.post()` | Step 4 of posting pipeline | `reserveNumber('jrn', branchId)` → `commitReservation()` on success |
| POS module | New receipt | `reserveNumber('pos', branchId)` |
| Sales module | Confirm invoice | `reserveNumber('inv', branchId)` |
| Purchase module | Confirm GRN | `reserveNumber('grn', branchId)` |
| Any module on failure | Rollback | `releaseReservation()` |

---

## Design Decisions

- **SELECT FOR UPDATE:** Chosen over optimistic locking because POS environments have high concurrent throughput. Pessimistic locking is simpler and avoids retry loops.
- **Branch fallback to tenant-wide:** Reduces configuration burden. Tenants with one branch only need one sequence per type. Multi-branch tenants can override per branch.
- **Reservation lifecycle:** Three states (reserved → committed / released) provide a full audit trail. A reserved-but-never-committed number indicates a failed transaction.
- **Date segment in number:** Common in MENA/SEA accounting. Tax authorities often require the year/month to be visible in the document number.
- **Gap-free for tax compliance:** Some jurisdictions (UAE, India) require sequential invoice numbers with no gaps. The `strict` gap policy + `releaseReservation` decrement supports this.
