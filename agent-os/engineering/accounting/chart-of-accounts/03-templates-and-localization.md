# COA Templates & Localization

> Template: `apps/api/src/accounts/coa-template.ts`

## Base Template Structure

100+ accounts, topologically sorted by depth for FK-safe bulk insertion.

### Top-Level Categories (Depth 0)

| Code | Name | Type |
|------|------|------|
| 1000 | Assets | Asset |
| 2000 | Liabilities | Liability |
| 3000 | Equity | Equity |
| 4000 | Income | Income |
| 5000 | Cost of Sales | Expense |
| 6000 | Operating Expenses | Expense |
| 7000 | Other Income & Expenses | Income/Expense |

Depth 1–3 provides sub-categories and leaf accounts. Full tree goes 3–4 levels deep in practice.

### System Accounts (15)

Marked `isSystemAccount: true` — immutable, cannot be renamed/moved/deactivated. Used by the journal posting engine for automatic entries.

Key system accounts:
- `1112` Cash Register
- `1131` Trade Receivables (control)
- `1141` Merchandise Inventory (control)
- `2111` Trade Payables (control)
- `3200` Retained Earnings - Prior Years
- `4100` Sales Revenue
- `5100` Cost of Goods Sold

Control accounts (`isControlAccount: true`) only accept engine-generated postings, not manual journal entries.

## Country Overlays

Applied on top of the base template when `countryCode` is provided during seeding.

| Overlay | Countries | What Changes |
|---------|-----------|-------------|
| GCC VAT | AE, SA, BH, OM, QA | Uses generic `1162` (Input VAT) and `2131` (Output VAT) |
| India GST | IN | Adds split accounts: `1162.01`/`.02`/`.03` (Input CGST/SGST/IGST), `2131.01`/`.02`/`.03` (Output CGST/SGST/IGST) |
| Singapore GST | SG | Renames `1162`/`2131` to GST-specific names |
| Malaysia SST | MY | Renames `1162`/`2131` to SST-specific names |

Overlays are **additive** (new accounts) or **override** (rename existing). They never remove base template accounts.

## Bilingual Support

Every account has `name` (primary) and `nameAlt` (alternate). The template provides both English and Arabic names for all accounts.

At runtime, the UI displays whichever language matches the user's locale, falling back to the primary name.

## Idempotency

The seeding process:
1. Fetches all existing account codes for the legal entity
2. Filters the template to only accounts not yet present
3. Inserts in topological order (parents before children)
4. Returns `{ created, skipped }` counts

Safe to re-run after partial failures or when adding a country overlay to an already-seeded entity.
