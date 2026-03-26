# Tax Configuration UI — Design

> Status: **Not implemented.** Schema exists (`packages/db/src/schema/tax.ts`), no service or UI.
> Spec: `agent-os/product/accounting/02-tax-model.md`
> Route: `/accounting/tax-configuration` (new section in accounting sidebar)

## What Exists

Schema for 4 tables: `tax_codes`, `tax_rates`, `tax_groups`, `tax_group_components`. See `02-tax-model.md` for full data model.

## Backend — New Endpoints

### Tax Codes

| Method | Route | Permission |
|--------|-------|-----------|
| GET | `/tenant/tax-codes?legalEntityId=` | `settings.tax.read` |
| GET | `/tenant/tax-codes/:id` | `settings.tax.read` |
| POST | `/tenant/tax-codes` | `settings.tax.create` |
| PATCH | `/tenant/tax-codes/:id` | `settings.tax.update` |

Create payload:
```ts
{
  legalEntityId: string;
  code: string; // e.g. "VAT5", "CGST9"
  name: string;
  rate: string; // decimal, e.g. "5.0000"
  type: "exclusive" | "inclusive";
  category: "standard" | "zero_rated" | "exempt" | "reverse_charge" | "non_recoverable";
  outputAccountId?: string; // must be liability account
  inputAccountId?: string; // must be asset account
  jurisdiction?: string;
  hsnCode?: string; // India HSN/SAC code
}
```

Validations:
- Code unique per `(tenantId, legalEntityId)`
- If `outputAccountId` → must be active liability account in same entity
- If `inputAccountId` → must be active asset account in same entity
- Rate: 0-100, precision 4

### Tax Rates (versioned)

| Method | Route | Permission |
|--------|-------|-----------|
| GET | `/tenant/tax-codes/:id/rates` | `settings.tax.read` |
| POST | `/tenant/tax-codes/:id/rates` | `settings.tax.create` |

Create payload: `{ rate: string, effectiveFrom: string, effectiveTo?: string }`

Validations:
- `effectiveFrom < effectiveTo` (if provided)
- Rate: 0-100
- No overlapping date ranges for same taxCode

### Tax Groups

| Method | Route | Permission |
|--------|-------|-----------|
| GET | `/tenant/tax-groups?legalEntityId=` | `settings.tax.read` |
| POST | `/tenant/tax-groups` | `settings.tax.create` |
| PATCH | `/tenant/tax-groups/:id` | `settings.tax.update` |

Create payload:
```ts
{
  legalEntityId: string;
  name: string;
  isDefault?: boolean; // only one default per entity (partial unique index enforces)
  components: Array<{ taxCodeId: string; sortOrder: number; isCompound: boolean; }>;
}
```

Validations:
- Name unique per `(tenantId, legalEntityId)`
- Components: all taxCodes must belong to same entity
- At most one `isDefault=true` per entity (DB enforces via partial unique index)

## Frontend

### Navigation

New sidebar item: "Tax Configuration" under Accounting section.

### Page Layout — Tabs

**Tab 1: Tax Codes**
- Table: Code | Name | Rate | Type | Category | Jurisdiction | Status
- Add button → dialog form
- Edit via row click → dialog form
- Toggle active/inactive

**Tab 2: Tax Groups**
- Table: Name | Components (comma-joined codes) | Default badge | Status
- Add button → dialog with component builder
- Component builder: sortable list of tax codes, compound toggle per component
- Default toggle (with confirmation — changes existing default)

**Tab 3: Rate History** (per tax code)
- Accessible by clicking "Rate History" on a tax code row
- Timeline: effectiveFrom → effectiveTo | rate
- Add new rate period

### Country Quick Setup

"Quick Setup" button in toolbar:
- Select country → auto-creates standard tax codes + groups based on `taxation/` reference files
- UAE: VAT 5% exclusive
- Saudi: VAT 15% exclusive
- India: CGST + SGST + IGST groups at 5%, 12%, 18%, 28%
- Kuwait: No Tax group (0%)
- Idempotent (skips existing codes)
