<!-- Feature catalog partition | Module: settings-admin | Generated: 2026-06-11 | Source: as-built audit -->
# Settings & Administration — Feature Catalog

> Status legend: `shipped` = in production code as of 2026-06-11 · `planned` = specced, not yet built.

---

## Organisation / Tenant Identity
- **Status:** shipped
- **Description:** Stores the tenant's trading name, logo, country, timezone, default language, and contact details. Displayed on documents and reports; shared across all branches.
- **Who it's for:** Business owner / account admin during initial setup and whenever company details change.
- **Constraints / notes:** Managed via `GET/PATCH tenant/settings`. Registration number and tax ID live on Legal Entities, not here. Changing timezone affects date display only — no backdated re-stamping of records.

---

## Legal Entity Management
- **Status:** shipped
- **Description:** Create and manage one or more legal entities (companies) under a single tenant account. Each entity has its own company registration number, tax registration number, functional currency, and country — enabling multi-country group operations from one login.
- **Who it's for:** Group operators with stores or subsidiaries in multiple GCC/MENA/SEA countries. Single-store merchants get one entity created automatically on sign-up.
- **Constraints / notes:** `functionalCurrency` and `countryCode` become immutable once the first journal entry is posted for that entity. The default entity cannot be deactivated. API: `tenant/legal-entities`. Consolidated financial statements are planned (Phase 6), not yet available.

---

## Branch / Outlet Management
- **Status:** shipped
- **Description:** Define physical or virtual selling locations (outlets, showrooms, kiosks) under a legal entity. Each branch can have its own address, contact info, and optional currency override.
- **Who it's for:** Any retailer with more than one location; also used as the unit for branch-level access control.
- **Constraints / notes:** A branch cannot be deactivated while it has active stock or open orders. Branch currency must exist in the tenant's supported currencies whitelist.

---

## Warehouse, Zone & Bin Hierarchy
- **Status:** shipped
- **Description:** Model physical storage spaces with up to four levels of precision: Warehouse → Zone → Bin. Enables bin-level inventory tracking, putaway, and pick-path optimisation.
- **Who it's for:** Merchants with dedicated storage facilities, fulfilment operations, or multi-shelf organised stockrooms.
- **Constraints / notes:** Zones belong to warehouses; bins belong to zones. API routes: `tenant/warehouses`, `tenant/zones`, `tenant/bins`. Bin-level costing and movement is consumed by the Inventory module.

---

## Team & User Management
- **Status:** shipped
- **Description:** Invite team members by email, assign roles, manage active/inactive status, and control which branches each user can access. Full user lifecycle from invitation to offboarding.
- **Who it's for:** Business owners and managers who need to grant staff access to specific parts of the system.
- **Constraints / notes:** Invitation tokens are time-limited; re-send available. Deactivating a user revokes all sessions. API: `tenant/users`, `tenant/invitations`.

---

## Roles & Permissions (RBAC)
- **Status:** shipped
- **Description:** Define custom roles with granular per-permission access control. Each role is a named set of permission keys (e.g., `sales.invoice.create`, `settings.audit.view`). Assign one or more roles per user.
- **Who it's for:** Businesses with defined staff hierarchies — owner, manager, cashier, accountant, warehouse staff — each needing different system access.
- **Constraints / notes:** System roles (Owner, Admin) cannot be deleted. Custom roles can be duplicated and edited. Permissions enforced on both API and UI. API: `tenant/roles`.

---

## Approval PIN
- **Status:** shipped
- **Description:** Managers set a numeric PIN stored with scrypt hashing. Staff tap "Request Approval" on sensitive actions (price overrides, discount exceptions, purchase authorisations); the manager enters their PIN inline without logging in. No workflow ticket is created — it is an immediate present-and-approve gesture.
- **Who it's for:** Retail managers approving floor staff actions at the point of sale or purchase panel, in markets where passing a device is operationally normal.
- **Constraints / notes:** PIN is scrypt-hashed — not recoverable, must be reset if forgotten. One PIN per user. Consumed by POS override flow and purchase module. API: `tenant/approval-pin`.

---

## Security Settings
- **Status:** shipped
- **Description:** Configure organisation-wide password policy (minimum length, complexity, expiry), session timeout durations, and failed-login lockout thresholds.
- **Who it's for:** IT administrators and business owners managing staff account hygiene and compliance requirements.
- **Constraints / notes:** Policies are enforced at the Supabase Auth + API layer. Changes take effect on next login/session refresh. API: `tenant/security-settings`.

---

## Currency Configuration
- **Status:** shipped
- **Description:** Maintain a tenant-wide whitelist of accepted currencies with symbol, decimal precision, and symbol position (critical for right-to-left MENA currencies). Toggle multi-currency mode; set rounding mode (HALF_UP or Banker's rounding).
- **Who it's for:** Any business accepting or reporting in more than one currency, especially GCC merchants dealing in KWD (3 decimals), BHD (3 decimals), or USD alongside their functional currency.
- **Constraints / notes:** A currency in use on posted transactions can be deactivated but not deleted. Every legal entity's functional currency must be in this whitelist. API: `currency-config` routes.

---

## Exchange Rates
- **Status:** shipped
- **Description:** Enter manual exchange rates between any two tenant currencies, effective-dated so historical rates are preserved. Optionally configure auto-fetch from an external provider.
- **Who it's for:** Finance teams managing multi-currency purchases, sales, or intercompany transfers.
- **Constraints / notes:** Rates are tenant-wide (shared across legal entities). Missing rate blocks posting in financial modules. Rate corrections create a new effective-dated record — no in-place edits. Manual rate entry requires a reason; manager approval can be required by policy.

---

## Fiscal Period Management
- **Status:** shipped
- **Description:** Configure fiscal year start month per legal entity and set period-locking policy — Open, Soft-Locked (override with permitted role), or Hard-Locked (requires Manager PIN + reason + audit entry).
- **Who it's for:** Accountants and finance managers controlling when a period is closed to prevent accidental backdated postings.
- **Constraints / notes:** Policy ownership is Settings/Admin; enforcement is in the Accounting module. Hard-lock reopening requires Manager PIN. Soft-lock override is restricted to specified roles. API: `fiscal-period` routes.

---

## Tax Configuration
- **Status:** shipped
- **Description:** Define tax codes (VAT 15%, VAT 5%, Zero-Rated, Exempt) and group them into tax groups that can be attached to items, customer categories, or branches. Supports multi-rate groups for compound tax scenarios.
- **Who it's for:** Businesses in VAT-registered countries (KSA 15%, UAE 5%, Bahrain 10%, India GST). Also used for zero-rating export sales.
- **Constraints / notes:** Tax codes can be scoped to a legal entity for multi-country tenants. Tax calculation is handled by the `tax-calc` module at transaction time. API: `tenant/tax-codes`, `tenant/tax-groups`.

---

## Document Numbering / Sequences
- **Status:** shipped
- **Description:** Customise the prefix, suffix, padding, and starting number for every document type (invoices, purchase orders, receipts, credit notes, etc.). Sequences are guaranteed-unique and gapless within each document type.
- **Who it's for:** Any business that needs document numbers to match their existing paper/legacy system series or regulatory formats.
- **Constraints / notes:** Consumed by Sales, Purchase, POS, and Inventory modules. Sequences cannot be rolled back once used. API: `tenant/doc-sequences`.

---

## Localisation Settings
- **Status:** shipped
- **Description:** Set the organisation's default language (Arabic / English), number format (decimal separator, thousands grouping), date format, and timezone. Controls how all dates, numbers, and labels render across the application.
- **Who it's for:** Any tenant — especially relevant for Arabic-first MENA merchants who need RTL layout and Arabic numerals.
- **Constraints / notes:** UI ships full ar/en bilingual; this setting controls the default. Individual users can override locale in their profile. API: `tenant/localization`.

---

## Notification Policies & Preferences
- **Status:** shipped
- **Description:** Define alert rules at the organisation level (e.g., "notify warehouse manager when stock falls below reorder point") and let individual users set their own channel preferences (in-app, email, WhatsApp).
- **Who it's for:** Managers who need proactive alerts on inventory, payment due dates, or system events; staff who want to control notification noise.
- **Constraints / notes:** Policy rules are per-event-type; preferences are per-user. API: `tenant/notification-policies`, `tenant/notification-preferences`.

---

## API Keys
- **Status:** shipped
- **Description:** Generate named API keys with scoped permissions to allow third-party tools, integrations, or custom scripts to access Zerupt data programmatically. Keys are shown once on creation and stored hashed.
- **Who it's for:** Developers, systems integrators, and technical owners connecting Zerupt to external platforms (e-commerce, BI tools, accounting exports).
- **Constraints / notes:** Keys can be revoked instantly. Audit log records every API-key-authenticated action. API: `tenant/api-keys`.

---

## Webhooks
- **Status:** shipped
- **Description:** Register outbound webhook endpoints to receive real-time event notifications (order created, payment posted, stock adjusted, etc.) in any external system.
- **Who it's for:** Technical integrators building real-time pipelines to e-commerce platforms, ERP connectors, or notification services.
- **Constraints / notes:** Webhook dispatch is handled by the `WebhooksService`. Failed deliveries are retried. API: `tenant/webhooks`.

---

## Audit Trail
- **Status:** shipped
- **Description:** Every create, update, delete, login, export, and approval action across the entire system is written to an immutable, tamper-evidenced audit log. View who did what, when, from which IP, with before/after field diffs.
- **Who it's for:** Business owners, auditors, and compliance officers who need a full record of all system activity — required for VAT audits, financial due-diligence, and staff accountability.
- **Constraints / notes:** Audit rows cannot be edited or deleted. Daily chain hashes provide tamper evidence. PII fields are masked in the view layer; raw data retained per policy. API: `tenant/audit-logs`.

---

## Data Retention Policy
- **Status:** shipped
- **Description:** Configure how long audit logs and system records are retained before archival and purge. Set legal holds to suspend purge jobs during investigations or regulatory proceedings.
- **Who it's for:** Finance and compliance teams in regulated markets where data must be kept for a minimum number of years.
- **Constraints / notes:** Minimum retention is 3 years. Legal hold overrides all purge schedules. Purge operations are themselves audit-logged. API: `retention` routes.

---

## Data Import (AI-Assisted Migration)
- **Status:** shipped
- **Description:** Upload CSV or XLSX files for items, customers, suppliers, chart of accounts, opening stock, opening balances, and users. The AI engine automatically maps source columns to Zerupt fields (including Arabic header detection), flags low-confidence mappings for review, and suggests row-level fixes for validation errors. Apply is atomic per chunk with automatic rollback on failure.
- **Who it's for:** Any business migrating from a legacy system or spreadsheets; particularly high-value during onboarding. AI column mapping removes the technical burden for non-technical owners.
- **Constraints / notes:** Supports 7 entity types. Duplicate handling is configurable (Reject or Merge). Financial imports require period and currency prerequisites. Manual rollback is available if no dependent posted transactions exist. Imported files are retained per the retention policy. API: `import` routes.

---

## Data Export
- **Status:** shipped
- **Description:** Export system data (audit logs, transactional records) in CSV or JSON format for external analysis, compliance reporting, or migration.
- **Who it's for:** Finance teams, auditors, and operations managers needing offline data.
- **Constraints / notes:** Every export action creates an audit log entry. Branch-scoped exports enforced unless the user has owner-level access. API: `data-export` routes.

---

## Multi-Entity Architecture
- **Status:** shipped
- **Description:** A single tenant account can contain multiple legal entities, each with its own registration, tax ID, functional currency, and country. All entities are managed from one login; data is partitioned by entity. New tenants start with one entity; additional entities can be added in Settings.
- **Who it's for:** Group operators, franchise owners, and MENA/SEA holding companies running retail brands across multiple GCC or regional markets.
- **Constraints / notes:** Consolidated financial statements (cross-entity P&L/BS with currency translation) are planned for Phase 6 and not yet available. Inter-company transaction matching is also deferred. Entity-level user access scoping (as distinct from branch-level) is a future enhancement.

---

## Billing & Subscription Management
- **Status:** shipped
- **Description:** View the current plan, active seat count, and entitlement limits. Plan tiers gate feature access across the application (enforced via the `entitlement` module).
- **Who it's for:** Business owner managing their Zerupt subscription.
- **Constraints / notes:** Payment processing and invoice history are not in-app as of this date; managed via external billing provider. API: `tenant/billing`.

---

## User Profile (Self-Service)
- **Status:** shipped
- **Description:** Each user can update their own display name, avatar, password, and personal locale/timezone preference without needing admin intervention.
- **Who it's for:** All staff users.
- **Constraints / notes:** Personal locale overrides the organisation default for that user's session. API: `tenant/me`.

---

## Shared Address Book
- **Status:** shipped
- **Description:** Central repository of reusable address records (branches, warehouses, customer delivery addresses) that can be referenced across sales, purchase, and logistics documents.
- **Who it's for:** All modules — avoids re-entering addresses on every document.
- **Constraints / notes:** API: `tenant/addresses`.

---

## Founding Seats / Waitlist Endpoint
- **Status:** shipped
- **Description:** Public endpoint tracks remaining Founding 50 seats and registers waitlist interest. Powers the website's "Join Founding 50" offer.
- **Who it's for:** Marketing / growth — captures early-adopter signups before full launch.
- **Constraints / notes:** Public (unauthenticated) endpoint. API: `public/founding-seats`. No admin UI — data consumed by the website.

---

## Tenant Signup & Provisioning
- **Status:** shipped
- **Description:** End-to-end new-tenant registration: account creation, Supabase Auth setup, per-tenant Postgres database provisioning, seed data (default COA, currencies, document sequences, one legal entity, one branch), and initial admin user — all in a single signup flow.
- **Who it's for:** New businesses signing up; also underpins onboarding wizard (Step 1).
- **Constraints / notes:** Provisioning jobs tracked in the admin DB. Failures surface via `describeError` with `.cause`. Admin DB migrations auto-applied on pre-deploy to prevent provisioning drift. API: `tenant-signup`.

---

## Consolidated Financial Statements
- **Status:** planned
- **Description:** Cross-entity profit & loss, balance sheet, and cash flow reports in a group currency, with automatic translation at current (balance sheet) and average (P&L) rates.
- **Who it's for:** Group CFOs and holding company finance teams.
- **Constraints / notes:** Requires currency translation engine and inter-company elimination. Deferred to Phase 6 (Reports).

---

## Inter-Company Transaction Matching
- **Status:** planned
- **Description:** Automatic matching and elimination of transactions between entities in the same group (e.g., Entity A sells to Entity B).
- **Who it's for:** Multi-entity groups with intra-group trading.
- **Constraints / notes:** Deferred to Phase 6 or later. Depends on consolidated statements feature.

---

## Auto-Fetched Exchange Rates
- **Status:** planned
- **Description:** Automatic daily/hourly pull of live FX rates from a configured provider, removing the need for manual rate entry.
- **Who it's for:** Multi-currency merchants wanting always-current rates without manual maintenance.
- **Constraints / notes:** Data model and policy fields are in place; external provider integration not yet wired. Manual rate entry is fully available today.

---

## Per-Entity User Access Scoping
- **Status:** planned
- **Description:** Restrict a user's access to specific legal entities, independent of branch assignment. Currently access is implicitly scoped by branch membership.
- **Who it's for:** Multi-entity tenants that need strict data separation between entities at the user level.
- **Constraints / notes:** Deferred to a future phase. Branch-level scoping is the current access model.
