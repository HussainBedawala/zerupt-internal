# Configuration Pipeline

## Overview

After the onboarding questionnaire is submitted, the system executes a deterministic configuration pipeline that translates questionnaire answers into a fully configured tenant. The pipeline is visible to the user via a progress screen — not a black box.

Target execution time: 2–5 minutes.

---

## Pipeline Steps

### Step 0: Database Provisioning

- Triggered immediately after signup, before the questionnaire begins
- Creates a dedicated PostgreSQL database for the tenant via the provisioning pipeline (see `settings-admin/13-database-architecture.md`)
- Runs all schema migrations from `packages/db`
- Seeds minimal tenant identity record (id, code, name, countryCode)
- Status visible to user: "Setting up your workspace..."
- Target time: 30–60 seconds
- On failure: retry 3x with exponential backoff, then show support contact
- **Must complete before any subsequent pipeline steps execute**
- All subsequent steps run against the tenant's dedicated database

### Step 1: Tenant Settings

- Language, timezone, date format, number format
- Derived from `countryCode` + explicit answers
- Sets `tenant.languageDefault`, `tenant.timezone`, `tenant.isRtlDefault`

### Step 2: Branches and Warehouses

- One `Branch` entity per location entered in Step 2
- Default warehouse per branch (type: `Store`)
- Additional warehouses as specified
- `Transit` warehouse if inter-branch transfers enabled
- Per-branch country/timezone configuration for multi-country tenants

### Step 3: Chart of Accounts

- Select COA template based on `industry` + `inventoryConcept` + accounting depth preference
- Default: General Retail Template from `accounting/04-chart-of-accounts.md`
- Industry adjustments:
  - Electronics: add IMEI/serial-specific accounts
  - Grocery: add expiry/waste accounts
  - Fashion: add seasonal markdown accounts
- If `coaLevel = Custom`: skip this step entirely
- If `cheques = true`: add PDC Receivable (1161), PDC Payable (2161) accounts
- All system accounts created as non-deletable

### Step 4: Tax Profile and Components

- Country-specific tax profile from `settings-admin/06-tax-configuration-controls.md`
- Tax components with correct rates and effective dates
- Map output/input tax accounts from the COA created in Step 3
- Set applicability rules based on questionnaire answers (zero-rated, exempt, reverse-charge)
- For India: create CGST, SGST, IGST components with state-based rules
- For Malaysia: create Sales Tax and Service Tax components

### Step 5: Currency Policy

- Set functional currency from questionnaire
- Enable multi-currency if selected
- Add transaction currencies
- Set rounding mode (`HALF_UP` default)
- Create default exchange rate entries for common pairs

### Step 6: Fiscal Periods

- Generate periods for current fiscal year based on start month
- Set first period to `Open`
- Apply period close policy (`Open` default for new tenants)

### Step 7: Roles and Permissions

- Create role entities from selected role templates
- Each template maps to a predefined permission set from `settings-admin/03-roles-permissions-policy.md`
- Owner role always created with full permissions
- Permission sets adjusted for tenant configuration (e.g., no POS permissions if POS not enabled)

### Step 8: Document Numbering Sequences

- Per branch: `INV-{branch}-{seq}`, `PO-{branch}-{seq}`, etc.
- Based on `settings-admin/10-document-numbering.md` spec

### Step 9: Notification Preferences

- Default notification rules from `settings-admin/08-notifications-alert-policy.md`
- Low stock alerts ON, overdue payment alerts ON, anomaly alerts ON
- Agent suggestions enabled by default for all agents

### Step 10: Dashboard Defaults

- Role-based default widgets from `dashboard/07-role-based-defaults.md`
- Owner/Admin: full financial dashboard
- Cashier: POS-focused dashboard

---

## Progress UI

The user sees a real-time progress screen during pipeline execution:

```
[============================--------] 78%

Creating your system...

  ✓ Database provisioned
  ✓ Tenant settings configured
  ✓ 4 branches created (Kuwait City, Salmiya, Doha, Dubai)
  ✓ 8 locations set up (4 stores + 4 warehouses)
  ✓ Chart of accounts created (General Retail - 67 accounts)
  ✓ Tax profile configured (Kuwait - VAT-ready)
  ⟳ Setting up currency and fiscal periods...
  ○ Creating roles and permissions
  ○ Setting up document numbering
  ○ Configuring notifications
  ○ Preparing your dashboard
```

Each step reports: entity type, count created, and key details (names, template used, etc.).

## Review Screen

After pipeline completes, the user sees a summary organised by category. Each section is expandable.

```
Your HSN System is Ready!

Company: Star Alliance
Country: Kuwait | Currency: KWD | Fiscal Year: January – December

Branches (4):
  - Kuwait City HQ (Store + Warehouse)
  - Salmiya Branch (Store + Warehouse)
  - Doha Branch (Store + Warehouse)
  - Dubai Branch (Store + Warehouse)

Chart of Accounts: General Retail Template (67 accounts)
  [View accounts] [Customize later]

Tax: Kuwait (VAT-ready, currently zero-rated)

Roles: Owner, Admin, Accountant, Cashier, Warehouse Staff

[Everything looks good – Continue to Data Import]
[I need to change something – Go back]
```

## Idempotent Re-Configuration

When the user goes back to change questionnaire answers:

1. System computes a diff between old answers and new answers.
2. Only affected pipeline steps re-execute.
3. Entities that haven't changed are left untouched.
4. Entities that need updating are updated in-place (not deleted and recreated).
5. New entities are created; orphaned entities are soft-deleted.

| Answer Change | Affected Steps |
|---------------|----------------|
| Country changed | Steps 1, 4, 5, 8 (settings, tax, currency, numbering) |
| Branch added/removed | Step 2, 8 (locations, numbering) |
| COA depth changed | Step 3 (chart of accounts) |
| Role added/removed | Step 7 (roles and permissions) |
| POS toggled | Step 7 (adjust permissions), POS config |

## Error Handling

| Error Type | Behaviour |
|------------|-----------|
| Step fails | Pipeline pauses, shows error to user, offers retry. Previously completed steps are not rolled back. |
| Partial failure in a step | Completed entities within the step are kept. Failed entities are retried. |
| Unrecoverable error | Pipeline halts. User is shown a support contact option. Tenant remains in partial configuration state. |
| Timeout (step > 30s) | Retry once automatically, then show error. |

## Permissions

| Action | Required Key |
|--------|--------------|
| Execute configuration pipeline | `tenant.onboarding.configure` (owner-only by default) |
| Re-execute after answer change | `tenant.onboarding.configure` |

## Cross-Module Contracts

| Contract | Target |
|----------|--------|
| Pipeline completion → Data Import | `03-ai-import-assistant.md` becomes available after pipeline succeeds |
| Pipeline completion → tenant.onboardingState | Updates `onboardingState` with pipeline status |
| Review screen "Go back" → Questionnaire | `01-questionnaire.md` re-opens at the selected step |
