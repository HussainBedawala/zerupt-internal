# 01 — Supplier Identity Model

## Current Schema (`packages/db/src/schema/purchase.ts` lines 77–134)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid PK | | auto-random |
| `tenant_id` | uuid NOT NULL | index | defense-in-depth |
| `code` | varchar(50) NOT NULL | UNIQUE(tenant_id, code) | auto SUP-0001 or manual |
| `name` | varchar(300) NOT NULL | | legal/trade name |
| `name_alt` | varchar(300) | | bilingual (Arabic) |
| `phone` | varchar(50) | | E.164 validated at DTO |
| `email` | varchar(320) | | RFC email validated at DTO |
| `tax_number` | varchar(50) | | TRN/GSTIN; NOT unique |
| `payment_term_days` | integer | CHECK 0..3650 | Net-N flat term only |
| `default_tax_group_id` | uuid | FK → tax_groups RESTRICT | optional |
| `status` | enum | default 'active' | active / inactive / blocked |
| `image_url` | varchar(2048) | | Supabase storage path |
| `notes` | text | | |
| `created_at` | timestamptz | defaultNow | |
| `updated_at` | timestamptz | $onUpdate | |

## Status Lifecycle

```
active ⇄ inactive
active  → blocked
blocked → active
```

Spec (`01-supplier-model.md`):
- `inactive`: no new POs; existing POs and payments continue
- `blocked`: no new POs; no new payments; open POs frozen

**CURRENT STATE:** Status transitions are enum-only. The service (`suppliers.service.ts`) applies no guard on status transitions — any status can be set via `updateSupplier`. No `blockedReason` column, no `blockedAt` timestamp, no audit log specifically recording the block event.

**REQUIRES (10-year):**
- Transition guard in service: `blocked → inactive` should be disallowed (spec shows no edge)
- `blocked_reason text` column with NOT NULL when status = blocked (CHECK constraint)
- `blocked_at timestamptz` for AP aging / audit
- Block must emit an event consumed by purchase-order and payment guards

## Code Assignment

Service auto-generates `SUP-NNNN` via `nextSupplierCode()` (`suppliers.service.ts` lines 134–151). Uses `MAX(substring(code, regex)::int) + 1`. Retry-on-unique-conflict up to 3 attempts. Manual code allowed if caller provides `code` in DTO.

**REQUIRES:** Gap-free sequential guarantee is advisory only (concurrent creates can consume different codes, leaving gaps if one fails after sequence computation). For audit purposes this is acceptable, but document that supplier codes are NOT guaranteed gap-free.

## Uniqueness

| Constraint | Enforced? | Notes |
|-----------|-----------|-------|
| code unique per tenant | YES — DB unique | `suppliers_tenant_id_code_key` |
| name unique per tenant | NO | Two suppliers can share a name |
| tax_number unique per tenant | NO | Two suppliers can share a TRN/GSTIN |

**REQUIRES:** Partial unique index on `(tenant_id, tax_number)` WHERE `tax_number IS NOT NULL`. VAT-registered countries (KSA, UAE, Kuwait, India GST) require one TRN per legal entity; allowing duplicates means paying the same supplier twice under two records.

## Deferred Spec Fields (DEV-300 MVP note)

| Spec field | Status | Where deferred |
|-----------|--------|---------------|
| `defaultCurrency` | MISSING from schema and DTO | DEV-300 |
| `creditLimit` (decimal) | MISSING from schema | DEV-300 |
| `defaultWarehouseId` | MISSING from schema | deferred |
| `defaultPaymentTermsId` (master FK) | Not built; `paymentTermDays` integer used instead | DEV-301 |

The DTO note at `suppliers.dto.ts` line 35 explicitly defers `defaultTaxGroupId` exposure until purchase-invoice UI ships.

## service-layer validation gaps

- `taxNumber` is stored as-is; no format validation per country (GSTIN format vs TRN format). DTO validates nothing beyond `max(50)`.
- Status field accepts any valid enum value; no transition matrix enforced.
- `code` update is blocked (immutable) — good.

## supplier_item_codes FK gap

`packages/db/src/schema/supplier-item-codes.ts` line 27: `supplierId` is a plain `uuid` column with NO `.references()` FK. If a supplier is deleted (which is currently blocked by RESTRICT on purchase_invoices), orphaned supplier_item_codes rows could remain.

**REQUIRES:** Add FK `supplier_item_codes.supplier_id → suppliers.id ON DELETE CASCADE` so cache rows are cleaned when a supplier is (eventually) hard-deleted.
