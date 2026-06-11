# Tax Exemption Resolution Chain — Design

> Status: **Not implemented.** `TaxCalcService` takes a `taxGroupId` per line — no resolution logic to determine which tax group applies based on exemptions.
> Priority: **P1** — blocks correct tax calculation in POS/Sales/Purchase.
> Depends on: `tax-configuration/01-design.md`, `taxation/05-design-implications.md`
> Product spec reference: `product/accounting/02-tax-model.md`

## Problem

When a sales or purchase line is created, the system must determine which tax treatment applies. The product spec defines a priority chain (item > customer > category > default) but no implementation spec exists for this resolution logic.

## Resolution Priority Chain

Tax group resolution follows a strict priority order. The **first match wins**:

```
1. Transaction-level override    (user explicitly selected a tax group on the line)
   ↓ if null
2. Item-level tax group          (item.taxGroupId — specific tax for this product)
   ↓ if null
3. Customer/Supplier exemption   (party.taxExemptionStatus + party.taxGroupId)
   ↓ if null
4. Item category tax group       (itemCategory.taxGroupId — category default)
   ↓ if null
5. Legal entity default          (taxGroups WHERE isDefault = true AND legalEntityId = ...)
   ↓ if null
6. Error                         (no tax group resolvable — block the transaction)
```

## Schema Additions

### `items` table — add column

| Column | Type | Notes |
|--------|------|-------|
| taxGroupId | uuid (nullable) | FK → taxGroups. Item-level tax override. |

### `item_categories` table — add column

| Column | Type | Notes |
|--------|------|-------|
| taxGroupId | uuid (nullable) | FK → taxGroups. Category-level default. |

### `customers` / `suppliers` table — add columns

| Column | Type | Notes |
|--------|------|-------|
| taxExemptionStatus | enum (nullable) | `exempt`, `zero_rated`, `reverse_charge`, `null` (= taxable) |
| taxGroupId | uuid (nullable) | FK → taxGroups. Override when exemption applies. |
| taxExemptionCertificateNo | varchar (nullable) | Certificate reference for audit. |
| taxExemptionExpiry | date (nullable) | Null = no expiry. Expired = treated as taxable. |

## Backend — New Service: `TaxResolutionService`

### Core Method

```ts
interface TaxResolutionInput {
  tenantId: string;
  legalEntityId: string;
  transactionDate: string;
  direction: 'sale' | 'purchase';
  lines: ReadonlyArray<{
    lineId: string;
    itemId: string;
    overrideTaxGroupId?: string;     // User-selected override
    customerId?: string;             // For sales
    supplierId?: string;             // For purchases
  }>;
}

interface TaxResolutionOutput {
  lines: ReadonlyArray<{
    lineId: string;
    taxGroupId: string;
    resolvedFrom: 'override' | 'item' | 'party_exemption' | 'category' | 'entity_default';
    exemptionApplied: boolean;
    exemptionCertificateNo?: string;
  }>;
}
```

### Resolution Logic (per line)

```
1. If line.overrideTaxGroupId is set → return it (resolvedFrom = 'override')

2. Look up item.taxGroupId
   - If set → return it (resolvedFrom = 'item')

3. Look up party (customer or supplier based on direction)
   - If party.taxExemptionStatus is set AND not expired:
     - If party.taxGroupId is set → return it (resolvedFrom = 'party_exemption')
     - If party.taxExemptionStatus = 'exempt' → find zero-rate group for entity
     - If party.taxExemptionStatus = 'zero_rated' → find zero-rate group for entity
     - If party.taxExemptionStatus = 'reverse_charge' → find reverse-charge group for entity

4. Look up item's category → itemCategory.taxGroupId
   - If set → return it (resolvedFrom = 'category')

5. Look up entity default → taxGroups WHERE isDefault = true AND legalEntityId
   - If found → return it (resolvedFrom = 'entity_default')

6. Throw TaxResolutionError — no tax group resolvable
```

### Expiry Check

```ts
function isExemptionActive(party: { taxExemptionExpiry: Date | null }, transactionDate: string): boolean {
  if (party.taxExemptionExpiry === null) return true; // No expiry = always active
  return new Date(transactionDate) <= party.taxExemptionExpiry;
}
```

If exemption is expired, skip step 3 and continue to step 4 (category). Log a warning: "Tax exemption expired for {partyType}={partyId} on {expiryDate}".

## Integration with TaxCalcService

`TaxResolutionService.resolve()` runs **before** `TaxCalcService.calculate()`:

```
Invoice line created
  → TaxResolutionService.resolve(lines) → returns taxGroupId per line
  → TaxCalcService.calculate({ lines: [{ lineId, netAmount, taxGroupId }] })
  → Returns tax amounts per component
```

The calling module (POS, Sales, Purchase) orchestrates both calls.

## India-Specific: Jurisdiction Resolution

For India GST, after the tax group is resolved, the system must also determine **which group variant** (intra-state CGST+SGST vs inter-state IGST):

```
If entity.taxSystem = 'GST_DUAL':
  supplierState = first 2 digits of supplier GSTIN
  recipientState = first 2 digits of recipient GSTIN (or entity's state)
  If supplierState === recipientState → use intra-state group (CGST + SGST)
  Else → use inter-state group (IGST)
```

This requires tax groups to be linked in pairs:

| Column on `tax_groups` | Type | Notes |
|------------------------|------|-------|
| pairedGroupId | uuid (nullable) | FK → taxGroups. Links intra ↔ inter variants. |
| jurisdictionType | enum (nullable) | `intra_state`, `inter_state`, `null` (non-India) |

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Item has taxGroupId + customer is exempt | Customer exemption wins (step 3 before step 2? **No** — item wins per product spec) |
| Customer exempt but certificate expired | Treated as taxable — falls through to item/category/default |
| No tax codes exist for entity (Kuwait) | Entity default is a "No Tax" group with 0% rate |
| Reverse charge supplier | `resolvedFrom = 'party_exemption'`, tax engine handles reverse charge category |
| Mixed exemption on multi-line invoice | Each line resolved independently |

## API

No new endpoints — resolution is internal. The resolved tax group is returned as part of invoice line responses so the UI can show "Tax: VAT 5% (from item)" or "Tax: Exempt (customer certificate #123)".

## Frontend Impact

- **Item form:** Add optional "Tax Group" dropdown
- **Category form:** Add optional "Tax Group" dropdown
- **Customer/Supplier form:** Add "Tax Exemption" section:
  - Status dropdown: None, Exempt, Zero Rated, Reverse Charge
  - Tax Group override (shown when status is set)
  - Certificate number (text)
  - Expiry date (date picker)
- **Invoice line:** Show resolved tax source as a subtle label: "VAT 5% · from item"

## Audit

Every resolution is logged on the invoice line:

| Field | Value |
|-------|-------|
| `taxGroupId` | Resolved group |
| `taxResolvedFrom` | `override`, `item`, `party_exemption`, `category`, `entity_default` |
| `taxExemptionRef` | Certificate number (if party exemption applied) |
