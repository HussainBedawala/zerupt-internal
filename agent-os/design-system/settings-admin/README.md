# Settings & Admin

## Overview
The Settings & Admin section is the control center for the entire ERP platform. It provides a persistent sidebar layout with grouped categories, allowing administrators to configure every aspect of the business — from organisation identity and global tax frameworks to team access, branch locations, and integrations. The section is designed to support businesses in any country with a hybrid tax system: country presets auto-populate the correct tax framework (VAT, GST, multi-component, etc.) which can then be fully customised.

## User Flows
- **Category navigation** — Admin selects a settings category from the left sidebar; changes are saved via a "Save Changes" button (not auto-saved); unsaved changes trigger a warning when navigating away.
- **Tax setup** — Admin selects country → the matching tax framework loads with pre-filled components and rates → admin reviews and adjusts rates and groups → saves.
- **Invite user** — Enter email → select role → select branch access → send invite → user appears as "Pending" until accepted; invitations can be resent or revoked.
- **Create role** — Name the role → open the permission matrix → toggle permissions per module, action, and branch → save; existing role permissions can be copied as a starting point.
- **Add branch** — Fill the details form → configure operating hours per day → assign currency and tax overrides → assign staff → activate.
- **Data import** — Choose entity → download CSV/Excel template → upload filled file → review the preview table → confirm import → view row-level error report and import history.
- **Audit trail** — Filter the immutable action log by date, user, and module → browse entries → click any entry for full before/after detail and export to CSV.

## Design Decisions
- **Persistent left sidebar with grouped categories** — All 12 settings categories are always visible and grouped, making navigation predictable without breadcrumb-heavy flows.
- **Save Changes button (not auto-save)** — Explicit save with unsaved-changes warning prevents accidental configuration changes in a high-stakes settings area.
- **Country preset → customisable tax framework** — Selecting a country auto-populates the correct tax structure with an animated transition, then exposes full editing controls for local customisation.
- **Permission matrix as a scrollable grid with sticky headers** — The module × action × branch matrix is the most complex UI in the section; sticky column and row headers keep context visible while scrolling.
- **Virtualized audit trail table** — The audit log can be very large; virtualisation ensures the table remains performant without pagination lag.
- **Multi-step import wizard** — The data import flow uses a stepper component to guide users through template download → upload → preview → validate → confirm, reducing import errors.

## Data Shapes
**Entities:** `Address`, `DocumentNumbering`, `NumberFormat`, `Organisation`, `TaxComponent`, `TaxGroup`, `TaxFramework`, `OperatingHours`, `POSSettings`, `Branch`, `User`, `Permission`, `Role`, `Currency`, `ExchangeRate`, `NotificationThreshold`, `NotificationEvent`, `AuditLogEntry`, `ImportJob`, `ApiKey`, `Webhook`, `Integration`

## Visual Reference
See `screenshot.png` for the target UI design (if available).

## Components Provided
- `SettingsAdmin` — Root layout component providing the persistent left sidebar and content area for all settings panels.
- **panels/OrganisationPanel** — Company identity form: name, logo, addresses, registration numbers, fiscal year, document numbering, date/time format.
- **panels/TaxationPanel** — Country selector with animated framework transition, tax component editor, tax groups, applicability rules, and exemption management.
- **panels/LocationsPanel** — Branch list in card layout with status badges; multi-tab branch detail panel covering address, hours, currency, tax overrides, warehouses, and staff.
- **panels/TeamPanel** — User data table with inline status toggle, invite form, and resend/revoke invite actions.
- **panels/RolesPanel** — Role list, permission matrix grid (module × action × branch), field-level visibility overrides, and copy-from-role feature.
- **panels/CurrenciesPanel** — Base currency display, enable/disable additional currencies, manual exchange rate entry with effective date, and rate history view.
- **panels/PriceListsPanel** — Price list CRUD with type, applicability, and default-per-customer-group settings.
- **panels/NotificationsPanel** — Notification event list with per-event channel toggles, threshold configuration, and digest frequency selector.
- **panels/AuditPanel** — Virtualized audit log table with filters by user, module, action type, and date range; detail view and CSV export.
- **panels/ImportPanel** — Multi-step import wizard for Items, Customers, Suppliers, Opening Stock, Chart of Accounts, and Opening Balances; template download, upload, preview, and error report.
- **panels/IntegrationsPanel** — API key management, webhook configuration, and third-party integration cards with connection status.
- **panels/AppearancePanel** — Language toggle (Arabic/English with RTL), date/time format, number format, paper size, and document branding settings.

## Callback Props
| Callback | Triggered When |
|----------|----------------|
| `onSaveOrganisation` | Organisation settings form is saved |
| `onSaveTaxFramework` | Tax framework components and groups are saved |
| `onSaveBranch` | Branch create/edit form is saved |
| `onArchiveBranch` | Archive action is confirmed on a branch |
| `onInviteUser` | Invite user form is submitted with email, role, and branch access |
| `onUpdateUser` | User role, branch access, or status is changed |
| `onResendInvite` | Resend invite action is triggered for a pending user |
| `onRevokeInvite` | Revoke invite action is confirmed for a pending user |
| `onSaveRole` | Role permission matrix is saved (new or updated role) |
| `onDeleteRole` | Delete action is confirmed on a custom role |
| `onToggleCurrency` | A currency is enabled or disabled |
| `onAddExchangeRate` | A new exchange rate entry is saved for a currency |
| `onSaveNotificationEvent` | Notification event settings (channel, threshold, digest) are saved |
| `onStartImport` | Import is confirmed after the preview step in the import wizard |
| `onCreateApiKey` | New API key is generated with name and scopes |
| `onRevokeApiKey` | Revoke action is confirmed on an API key |
| `onSaveWebhook` | Webhook create/edit form is saved |
| `onDeleteWebhook` | Delete action is confirmed on a webhook |
| `onToggleIntegration` | Connect or disconnect action is triggered on a third-party integration |
