# 01 — Customer Identity Model

## Schema: `sales_customers` Table

File: `packages/db/src/schema/sales.ts` lines 69–127

| Column | DB type | Nullable | Notes |
|--------|---------|----------|-------|
| `id` | uuid PK | N | |
| `tenant_id` | uuid | N | tenantId on every row |
| `code` | varchar(50) | N | CUST-0001; unique per tenant (unique constraint line 121) |
| `name` | varchar(300) | N | Legal/trade name |
| `name_alt` | varchar(300) | Y | Alternate-language name |
| `phone` | varchar(50) | Y | |
| `email` | varchar(320) | Y | |
| `tax_number` | varchar(50) | Y | VAT TRN / GSTIN — no uniqueness constraint |
| `default_tax_group_id` | uuid FK→taxGroups | Y | restrict on delete |
| `status` | enum | N | `active` / `inactive` / `blocked` |
| `payment_terms_days` | integer | Y | Flat integer; no PaymentTerms master |
| `credit_limit` | numeric(18,4) | Y | Nullable = no limit |
| `notes` | text | Y | |
| `image_url` | varchar(2048) | Y | Supabase bucket path |
| `created_at` | timestamptz | N | |
| `updated_at` | timestamptz | N | |

### Indexes / Constraints (lines 120–126)

| Constraint | Definition |
|-----------|-----------|
| `sales_customers_tenant_id_code_key` | UNIQUE (tenant_id, code) |
| `sales_customers_tenant_id_idx` | INDEX (tenant_id) |
| `sales_customers_default_tax_group_id_idx` | INDEX (default_tax_group_id) |

---

## Spec vs Schema Comparison

| Spec field (`01-customer-model.md`) | Schema column | Status |
|-------------------------------------|---------------|--------|
| `id` | `id` | EXISTS |
| `tenantId` | `tenant_id` | EXISTS |
| `code` | `code` | EXISTS |
| `name` | `name` | EXISTS |
| `nameAlt` | `name_alt` | EXISTS |
| `taxNumber` | `tax_number` | EXISTS (no uniqueness) |
| `defaultCurrency` | — | **MISSING** |
| `defaultTaxGroupId` | `default_tax_group_id` | EXISTS |
| `defaultPaymentTermsId` | `payment_terms_days` (integer only) | PARTIAL — flat int, no PaymentTerms master |
| `defaultPriceListId` | — | **MISSING** |
| `creditLimit` | `credit_limit` | EXISTS (nullable, numeric) |
| `status` | `status` | EXISTS |
| `notes` | `notes` | EXISTS |
| `createdAt` | `created_at` | EXISTS |
| `updatedAt` | `updated_at` | EXISTS |

---

## Status Lifecycle

Spec (`01-customer-model.md`):
```
Active ⇄ Inactive
Active → Blocked
Blocked → Active
```

Schema enforces: `salesCustomerStatus` enum = `active | inactive | blocked` (`enums.ts` line ~405 area).

### Blocked Transition Guards

Spec: "Blocking requires a reason (stored in audit trail)."

- Schema: NO `blocked_reason` column, NO `blocked_at` timestamp.
- Service: `customers.service.ts` `updateCustomer()` sets `status: 'blocked'` with no reason validation or audit entry.
- The audit trail comment in the spec is not implemented — blocking is a silent status flip.

---

## Customer Code Sequencing

`customers.service.ts` lines ~365–395:
- `CUSTOMER_DOC_TYPE = 'CUS'`, prefix `'CUST-'`, padding 4 → `CUST-0001`.
- Uses `DocNumberingService.reserveNumber()` with lazy creation of the default sequence.
- Code is immutable after creation (update path does not include `code`).

---

## Tax Number Uniqueness Gap

- Schema: `tax_number varchar(50) NULL` — no unique constraint.
- Two customers within the same tenant can share the same TRN/GSTIN.
- For VAT-registered GCC/India tenants this is a compliance gap (a TRN uniquely identifies one legal entity).
- Compare purchase: `packages/db/src/schema/purchase.ts` — suppliers also lack a taxNumber unique constraint (same gap flagged in Purchase Layer 0).

---

## Normalization / Dedup

`customers.service.ts`:
- No name normalization (trim, case-fold) before insert.
- No phone/email dedup check.
- Uniqueness is by `code` only — two customers with identical names/phones are allowed.
- Compare spec: no explicit dedup mandate on customers (unlike suppliers where TRN uniqueness is a compliance need).

---

## Customer Contacts

`sales_customer_contacts` table (`sales.ts` lines 131–152):
- Columns: `id`, `customer_id` FK (cascade), `name`, `role` (free text), `phone`, `email`, `is_primary`.
- Service: `addContact()` — if `isPrimary`, demotes existing primary in the same transaction.
- MISSING: `updatedAt` column on contacts (contacts can be added but the row has no update timestamp).

## Customer Addresses

`sales_customer_addresses` table (`sales.ts` lines 157–180):
- Columns: `id`, `customer_id` FK (cascade), `label`, `line1`, `line2`, `city`, `state`, `postal_code`, `country`, `is_primary`.
- Same isPrimary demotion pattern as contacts.
