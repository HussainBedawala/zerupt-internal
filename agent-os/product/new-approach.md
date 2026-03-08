# HSN Agentic ERP: New Approach

**Internal Product Strategy Document**
**Date: March 2026**
**Status: Draft for alignment**

---

## Table of Contents

1. [Product Philosophy and Positioning](#1-product-philosophy-and-positioning)
2. [The Agentic Onboarding System](#2-the-agentic-onboarding-system)
3. [The AI Agent System](#3-the-ai-agent-system)
4. [What Changes in the Existing Specs](#4-what-changes-in-the-existing-specs)
5. [Updated Roadmap](#5-updated-roadmap)
6. [Competitive Moat](#6-competitive-moat)

---

## 1. Product Philosophy and Positioning

### What "Agentic ERP" Means for HSN

The term "agentic" in the context of HSN means something specific and different from what SAP, Oracle, or Odoo mean when they use similar language. Those vendors bolt AI capabilities onto existing monoliths that were designed 10-30 years ago around the assumption that a human consultant configures and maintains the system.

HSN Agentic ERP means:

1. **The system configures itself.** A new customer answers a questionnaire. AI agents translate those answers into a fully configured tenant: chart of accounts, tax profiles, branches, warehouses, currency settings, document numbering, roles and permissions. No consultant, no partner, no "implementation project.

2. **The system imports real data.** AI agents assist with mapping columns from the customer's existing Excel spreadsheets to HSN entities, validating data, suggesting fixes for errors, and executing the import. The customer does not need to understand HSN's data model. They upload what they have and the system figures it out.

3. **The system monitors itself.** Background agents continuously watch for accounting imbalances, inventory anomalies, tax misconfigurations, and operational risks. They surface suggestions to the right user at the right time. The user approves or dismisses. The system learns.

4. **The system teaches itself.** An onboarding coach agent tracks which features the customer has and has not used, and proactively suggests next steps. A conversational assistant (HSN Copilot) answers questions about data, helps build reports, and guides users through unfamiliar workflows.

The key constraint: **suggest-only autonomy.** No agent ever creates, modifies, or deletes data without human approval. Every suggestion is auditable. Every action taken on a suggestion is logged.

### How This Differs from the Competition

| Competitor | Their AI Approach | HSN Difference |
|---|---|---|
| **SAP (Joule)** | 600+ AI agents, but system still requires certified partners for implementation (3-6 months). AI helps users inside an already-configured system. | HSN eliminates the implementation phase entirely. AI is the implementation partner. |
| **Oracle (NetSuite Next)** | Autonomous close, 600+ embedded agents. Still requires NetSuite partners for setup. $200-500/user/month. | HSN targets the segment NetSuite ignores: mid-market retail in MENA at $40-60/user/month with same-day go-live. |
| **Odoo 19** | Deep AI across modules (98% invoice accuracy). But the open-source trap remains: real cost is in implementation partners at $50-150/hr. | HSN has no implementation partner model at all. The product IS the partner. |
| **Rillet** | AI-native GL, 4-week implementation. Raised $100M. | 4 weeks is still 4 weeks. HSN targets 2 hours. Rillet focuses on GL only; HSN is full ERP. |
| **Campfire** | AI-native ERP, $100M raised. Days-not-months. | "Days" is vague. HSN targets a measurable, specific SLA: 2 hours from signup to live with real data. |
| **Doss** | "Adaptive Resource Platform." Days-not-months. $18M raised. | Similar positioning but no MENA focus, no Arabic-first, no 10 years of retail domain knowledge. |

### The "Zero Implementation Partner" Thesis

Why is this achievable for mid-market retail when nobody has done it for enterprise?

1. **Constrained domain.** Mid-market retail in MENA has a finite set of configurations. There are maybe 50-100 meaningful combinations of country, retail vertical, branch count, warehouse topology, currency setup, and tax regime. This is not "configure SAP for a pharmaceutical supply chain." The decision tree is enumerable.

2. **Spreadsheet baseline.** Our target customer is currently running on Excel. Their data is messy but structurally simple: product lists, customer lists, supplier lists, and maybe opening balances. This is a tractable data import problem, not an enterprise data migration problem.

3. **10 years of domain truth.** The existing Merpec system has been running in production with 20+ retail businesses in Kuwait. Every COA template, every tax configuration, every workflow in our specs comes from real operational data. We are not guessing what the questionnaire should ask or what the defaults should be. We already know.

4. **GCC retail specificity.** Kuwait has no VAT currently. KSA has ZATCA. UAE has standard VAT. Qatar has none. The compliance matrix for these 6 countries is manageable and well-documented. This is not "support every tax jurisdiction on earth.

---

## 2. The Agentic Onboarding System

### Overview

The onboarding system is the single most important differentiator. It replaces the 3-18 month implementation cycle with a 2-hour self-serve flow. It consists of five phases:

```
Signup (2 min) -> Questionnaire (15 min) -> AI Configuration (5 min) -> Data Import (30-90 min) -> Go Live (5 min)
```

### Phase 1: Signup (2 minutes)

Standard SaaS signup. Minimal friction.

**Fields collected:**
- Full name
- Email
- Password
- Phone number (with country code, used to infer region)
- Company name

**Immediately after signup:**
- Supabase Auth creates the user
- A tenant record is created in the Central Admin DB with `status: PendingProvisioning`
- User is set as `ownerUserId`
- Tenant gets a slug (e.g., `star-alliance`) for potential future subdomain use
- A dedicated PostgreSQL database is provisioned for the tenant (30-60 seconds). User sees "Setting up your workspace..."
- Once DB is ready, `status` changes to `Active` and user lands in the onboarding wizard, not the empty ERP

### Phase 2: Questionnaire (15 minutes)

The questionnaire is the critical data-gathering step. It must feel like a conversation, not a form. It is structured as a multi-step wizard with conditional branching.

**Step 1: Your Business**
| Question | Type | Options/Validation | Maps To |
|---|---|---|---|
| What is your legal company name? | Text | Required | `tenant.name` |
| What is your trading/brand name? | Text | Optional | `tenant.tradingName` |
| Which country is your business registered in? | Dropdown | KW, SA, AE, BH, OM, QA, + others | `tenant.countryCode` |
| Company registration number | Text | Country-regex validated | `tenant.registrationNumber` |
| Tax registration number (if applicable) | Text | Country-regex validated | `tenant.taxRegistrationNumber` |
| What industry best describes your business? | Card select | Fashion/Apparel, Electronics/Mobile, Grocery/Supermarket, General Trading, Furniture/Home, Other | `tenant.industry` |
| How many years have you been operating? | Number | 0-99 | Metadata (used for data import expectations) |

**Step 2: Your Locations**
| Question | Type | Options/Validation | Maps To |
|---|---|---|---|
| How many stores/branches do you operate? | Number stepper | 1-50 | Branch count |
| For each branch: Name, Country, City, Timezone | Repeatable card | Pre-filled from country | `Branch` entities |
| Does each branch have a separate warehouse? | Yes/No | - | Warehouse topology |
| Do you have any standalone warehouses (not attached to a store)? | Yes/No + repeater | Name, linked to which branch | `Warehouse` entities of type `Warehouse` |
| Do you transfer stock between locations? | Yes/No | - | Creates `Transit` warehouse if yes |

**Step 3: Your Accounting**
| Question | Type | Options/Validation | Maps To |
|---|---|---|---|
| What is your main operating currency (that is mostly used)? | Dropdown | KWD, SAR, AED, BHD, OMR, QAR, USD, EUR | `currencyPolicy.functionalCurrency` |
| Do you transact in other currencies? | Yes/No + multi-select | Currency list | `currencyPolicy.transactionCurrencies` |
| When does your fiscal year start? | Month dropdown | January-December | `fiscalSettings.fiscalYearStartMonth` |
| How detailed do you want your chart of accounts? | Card select | Standard (recommended), Detailed, Custom (I'll set up my own) | COA template selection |
| Do you use post-dated cheques? | Yes/No | - | Enables cheque management accounts and workflows |

**Step 4: Your Tax Setup**
This step is conditionally rendered based on country.

| Country | Questions | Maps To |
|---|---|---|
| Kuwait | "Kuwait currently has no VAT. We'll set up your accounts VAT-ready for future compliance." | Tax profile with `ZeroRated` default |
| KSA | "Saudi Arabia uses ZATCA e-invoicing. What is your ZATCA registration status?" + VAT registration number | Tax profile with 15% standard rate, ZATCA compliance flags |
| UAE | "UAE has 5% VAT. Is your business VAT-registered?" | Tax profile with 5% standard rate |
| Bahrain | "Bahrain has 10% VAT. Is your business VAT-registered?" | Tax profile with 10% standard rate |
| Qatar, Oman | "No VAT currently. We'll configure your system VAT-ready." | Tax profile with `ZeroRated` default |

For VAT-registered businesses:
| Question | Type | Maps To |
|---|---|---|
| Do you deal with zero-rated supplies? | Yes/No | Adds `ZeroRated` tax component |
| Do you deal with exempt supplies? | Yes/No | Adds `Exempt` tax component |
| Do you do reverse-charge transactions? | Yes/No | Adds `ReverseCharge` tax component |

**Step 5: Your Team**
| Question | Type | Maps To |
|---|---|---|
| How many people will use the system? | Number | License estimation |
| What roles do you need? | Checkbox | Owner (auto), Admin, Accountant, Sales Manager, Salesperson, Cashier, Warehouse Staff, Viewer | Pre-built role templates |
| Want to invite team members now? | Optional repeater | Email + Role + Branch assignment | `Invitation` entities (sent after go-live) |

**Step 6: Your POS**
| Question | Type | Maps To |
|---|---|---|
| Will you use Point of Sale? | Yes/No | POS module activation |
| How many POS terminals per branch? | Number per branch | Register count |
| What receipt printer do you use? | Dropdown | Thermal 80mm, Thermal 58mm, A4, None (email only) | Receipt template config |
| Do you need bilingual receipts (Arabic + English)? | Yes/No | Receipt `isRtl` + bilingual template |
| What payment methods do you accept? | Checkbox | Cash, K-Net, Visa/MC, Store Credit, Gift Cards | Payment method configuration |

**Step 7: Your Existing Data**
| Question | Type | Purpose |
|---|---|---|
| Do you have existing product/item data to import? | Yes/No | Triggers product import step |
| Do you have existing customer data? | Yes/No | Triggers customer import step |
| Do you have existing supplier data? | Yes/No | Triggers supplier import step |
| Do you have opening balances (account balances as of a date)? | Yes/No | Triggers opening balance import step |
| What system are you currently using? | Card select | Excel/Google Sheets, Another ERP (which?), Paper-based, Nothing | Sets import expectations |

**Questionnaire UX Principles:**
- One question group per screen. No scrolling walls of form fields.
- Smart defaults based on previous answers (e.g., if Kuwait is selected, KWD is pre-selected as currency, Arabic is default language, AST timezone is set).
- "Not sure? Skip for now" on every non-critical question. The system can be reconfigured later.
- Progress bar showing completion percentage.
- Estimated time remaining.
- Ability to save and resume later (questionnaire state persisted in `tenant.onboardingState` JSON field).

### Phase 3: AI Configuration (5 minutes)

After the questionnaire is submitted, the system executes a configuration pipeline. This is NOT a black box. The user sees a progress screen showing what is being configured.

**Configuration Pipeline Steps:**

```
1. Create Tenant Settings
   - Language (locale), timezone, date format, number format, RTL/LTR direction
   - Derived from country + explicit language preference
   - See settings-admin/14-internationalization.md for full locale handling

2. Create Branches and Warehouses
   - One Branch entity per location entered
   - Default warehouse per branch (type: Store)
   - Additional warehouses as specified
   - Transit warehouse if inter-branch transfers enabled
   - Configure branch/warehouse according to its location, if it is in a separate country.

3. Create Chart of Accounts
   - Select template based on industry + accounting depth preference
   - The General Retail Template from accounting/04-chart-of-accounts.md is the default
   - If Electronics vertical: add IMEI/serial-specific accounts
   - If Grocery vertical: add expiry/waste accounts
   - All system accounts created as non-deletable

4. Create Tax Profile and Components
   - Country-specific tax profile
   - Tax components with correct rates and effective dates
   - Map output/input tax accounts from the COA
   - Set applicability rules based on questionnaire answers

5. Create Currency Policy
   - Set functional currency
   - Enable multi-currency if selected
   - Add transaction currencies
   - Set rounding mode (HALF_UP default)

6. Create Fiscal Periods
   - Generate periods for current fiscal year
   - Set first period to Open
   - Apply period close policy (Open default for new tenants)

7. Create Roles and Permissions
   - Create role entities from selected role templates
   - Each template maps to a predefined permission set from roles-permissions-policy.md
   - Owner role always created with full permissions

8. Create Document Numbering Sequences
   - Per branch: INV-{branch}-{seq}, PO-{branch}-{seq}, etc.
   - Based on document-numbering.md spec

9. Create Notification Preferences
   - Default notification rules from notifications-alert-policy.md
   - Low stock alerts ON, overdue payment alerts ON, anomaly alerts ON

10. Create Dashboard Defaults
    - Role-based default widgets from dashboard/07-role-based-defaults.md
    - Owner/Admin: full financial dashboard
    - Cashier: POS-focused dashboard
```

**Configuration Progress UI:**
```
[============================--------] 78%

Creating your system...

  [check] Tenant settings configured
  [check] 4 branches created (Kuwait City, Salmiya, Doha, Dubai)
  [check] 8 locations set up (4 stores + 4 warehouses)
  [check] Chart of accounts created (General Retail - 67 accounts)
  [check] Tax profile configured (Kuwait - VAT-ready)
  [spinning] Setting up currency and fiscal periods...
  [ ] Creating roles and permissions
  [ ] Setting up document numbering
  [ ] Configuring notifications
  [ ] Preparing your dashboard
```

**Review Screen:**

After configuration completes, the user sees a summary of everything that was created, organized by category. Each section is expandable.

```
Your HSN System is Ready!

Company: Star Alliance
Country: Kuwait | Currency: KWD | Fiscal Year: January - December

Branches (4):
  - Kuwait City HQ (Store + Warehouse)
  - Salmiya Branch (Store + Warehouse)
  - Doha Branch (Store + Warehouse)
  - Dubai Branch (Store + Warehouse)

Chart of Accounts: General Retail Template (67 accounts)
  [View accounts] [Customize later]

Tax: Kuwait (VAT-ready, currently zero-rated)

Roles: Owner, Admin, Accountant, Cashier, Warehouse Staff

[Everything looks good - Continue to Data Import]
[I need to change something - Go back]
```

The "I need to change something" button allows going back to any questionnaire step. Changes trigger a diff-based re-configuration (only reconfigure what changed, not the whole thing).

### Phase 4: Data Import (30-90 minutes)

This is where the AI agent does its most valuable work. The customer has Excel files with their products, customers, suppliers, and possibly balances. The AI assists with mapping, validation, and import.

**Import Flow (per entity):**

```
Upload File -> AI Column Mapping -> User Review -> Validation -> Preview -> Confirm -> Apply
```

**Step 4a: AI Column Mapping**

When the user uploads an Excel file, the AI Import Agent:

1. **Reads the file headers and sample rows** (first 10 rows).
2. **Infers the entity type** if not specified (is this a product list, customer list, or supplier list?).
3. **Maps columns to HSN fields** using a combination of:
   - Exact header matching ("Product Name" -> `name`)
   - Fuzzy matching ("Prod. Nm" -> `name`, "Barcode #" -> `barcode`)
   - Content analysis (a column of 13-digit numbers is likely a barcode, a column of email addresses is likely `email`)
   - Language detection (Arabic headers mapped to their English equivalents)
4. **Presents the mapping for review:**

```
We detected this is a Product List (245 rows)

Your Column          -> HSN Field              Confidence
--------------------------------------------------------------
"Item Name"          -> Product Name           [check] 98%
"Item Name Arabic"   -> Product Name (Alt)     [check] 95%
"Code"               -> SKU                    [check] 97%
"Barcode"            -> Barcode                [check] 99%
"Category"           -> Category               [check] 92%
"Buy Price"          -> Purchase Price         [check] 96%
"Sell Price"         -> Selling Price          [check] 96%
"Stock Qty"          -> Opening Stock          [check] 88%
"Color"              -> Attribute: Color       [?] 75%  [Change]
"Warehouse"          -> Location               [?] 70%  [Change]
"Notes"              -> [Unmapped]             [-]      [Map to...]

Unmapped HSN fields (optional):
  - Reorder Level
  - Supplier
  - Tax Category
  - Weight/Dimensions
```

The user can:
- Accept the AI's mapping (one click)
- Override any individual mapping (dropdown of HSN fields)
- Ignore columns they don't want to import
- Map to custom fields

**Step 4b: Validation**

After mapping is confirmed, the system validates all rows:

```
Validating 245 products...

Results:
  [check] 231 products ready to import
  [warning] 12 products have warnings (fixable)
  [error] 2 products have errors (must fix)

Errors:
  Row 45: "Samsung Galaxy S24" - Duplicate barcode (same as row 12)
  Row 189: "Office Chair" - Selling price is lower than purchase price

Warnings:
  Rows 3,17,44,56,78,91,103,118,134,167,201,230:
    Category "Misc" doesn't match any existing category.
    [AI suggestion: Create new category "Miscellaneous"?] [Yes] [No, map to...]
```

**AI Validation Assistance:**
- For duplicate barcodes: "Row 45 and Row 12 share barcode 1234567890123. These might be the same product. Keep row 12 and skip row 45?" [Yes] [No, keep both with different barcodes]
- For price anomalies: "Row 189: Selling price (15 KWD) is below purchase price (22 KWD). This might be a data entry error. Fix selling price to 22 KWD?" [Yes] [No, keep as is]
- For missing categories: Groups all unmapped categories and suggests bulk actions
- For missing required fields: Suggests defaults based on the industry and existing data patterns

**Step 4c: Preview and Confirm**

After validation passes, show a preview of first 20 rows as they will appear in the system. User confirms or goes back to fix.

**Step 4d: Apply**

Import executes using the existing import pipeline from `settings-admin/11-data-import-migration-controls.md`:
- Atomic per-chunk transactions
- Idempotency via import fingerprint
- Master entities before dependent entities (categories before products, products before opening stock)

**Import Order (enforced):**
1. Categories (extracted from product data if not separate)
2. Products / Items
3. Customers
4. Suppliers
5. Opening Stock (per location)
6. Opening Balances (accounting)

**Opening Balance Import:**

This is the most complex import. The AI assists by:
1. Accepting a trial balance or balance sheet from Excel
2. Mapping rows to COA accounts (fuzzy matching account names)
3. Creating the `OpeningBalance` journal entry
4. Verifying that `Opening Balance Equity (3900)` nets to zero
5. If it doesn't net to zero: "Your opening balances are off by 1,234.500 KWD. This usually means a missing account balance. Common causes: forgot bank balance, forgot inventory value, or a rounding difference. Want to park the difference in Opening Balance Equity for now and fix it later?" [Yes] [Show me the details]

### Phase 5: Go Live (5 minutes)

After data import (or if the user skips import):

1. **Send team invitations** (if entered in questionnaire)
2. **Show "Your system is ready" screen** with:
   - Quick-start checklist: "Try creating your first invoice", "Open the POS", "Check your dashboard
   - Link to HSN Copilot: "Have questions? Ask the assistant anything.
   - Video walkthrough (2-minute overview)
3. **Onboarding Coach agent activates** (background) to track feature adoption

**Total elapsed time target:** Under 2 hours, with the realistic breakdown:
- Signup: 2 min
- Questionnaire: 10-15 min
- AI Configuration: 2-5 min (automated)
- Data Import: 30-90 min (depends on data size and cleanliness)
- Go Live: 2-5 min

For users with no data to import (new businesses), the flow is under 30 minutes.

---

## 3. The AI Agent System

### Architecture Overview

The AI agent system consists of two user-facing surfaces and one infrastructure layer:

```
User-Facing:
  1. HSN Copilot (conversational assistant)
  2. Suggestion Cards (from background agents)

Infrastructure:
  3. Agent Runtime (FastAPI service)
```

### 3.1 HSN Copilot (Conversational Assistant)

**Where it lives in the UI:**

A floating action button (FAB) in the bottom-right corner of every screen, similar to Intercom but connected to actual business data. Clicking opens a slide-out panel (right side, 400px wide) with a chat interface. On mobile, it opens full-screen.

The Copilot is also embedded inline during onboarding (not as a separate panel, but as the primary interface guiding each step).

**What it can do:**

| Capability | Example | How It Works |
|---|---|---|
| **Natural Language Query (NLQ)** | "What were my top 10 products last month?" | Translates to `ReportDefinition` JSON, executes via query engine, returns formatted results in chat |
| **Data Exploration** | "Show me all overdue invoices over 500 KWD" | Same NLQ pipeline, but with drill-down: "Want to see details for customer Al-Rashid Trading?" |
| **Action Suggestions** | "How do I create a purchase order?" | Returns step-by-step walkthrough with deep links to the relevant screen |
| **Report Building** | "Create a report showing monthly sales by category" | Generates report definition, shows preview in chat, offers "Save as report" button |
| **Onboarding Help** | "How do I set up a new branch?" | Contextual guidance with links to Settings > Branches |
| **Data Entry Assistance** | "Add a new customer: Al-Rashid Trading, Kuwait City, credit limit 5000 KWD" | Generates the form pre-filled, shows preview, user clicks "Create" to confirm |
| **Anomaly Explanation** | (User clicks on an agent suggestion card) "Why is this flagged?" | Explains the anomaly in plain language with supporting data |

**What it CANNOT do:**

- Never executes create/update/delete without the user clicking a confirmation button
- Never accesses data outside the user's tenant (dedicated database per tenant — cross-tenant access is architecturally impossible)
- Never accesses data outside the user's RBAC scope (if a cashier asks about financial statements, Copilot says "You don't have permission to view financial reports. Ask your admin to grant access.")
- Never provides tax or legal advice ("Based on your configuration, your VAT rate is 5%. For tax compliance questions, please consult your accountant.")
- Never makes up data. If the query returns no results, it says so.

**How it accesses data safely:**

1. Every Copilot request includes the user's JWT (tenant-scoped, RBAC-scoped)
2. The NLQ pipeline generates SQL that is always wrapped with tenant and RBAC filters (the query engine from `reports/04-query-engine.md` already enforces this)
3. The Copilot never receives raw database credentials. It calls the NestJS API, which routes to the tenant's dedicated database.
4. All Copilot conversations are logged with `userId`, `tenantId`, `timestamp`, `query`, `response`, and `dataAccessed` fields
5. Copilot has no write access to the database. All "actions" are routed through standard API endpoints with standard authentication and authorization.

**Copilot Technical Implementation:**

The Copilot is a new plugin in the FastAPI AI service:

```
register("copilot", CopilotPlugin)
```

The CopilotPlugin orchestrates between:
- `NLQPlugin` for data queries
- `ReportAssistPlugin` for report building
- A new `ActionPlugin` for form pre-filling and workflow guidance
- A new `HelpPlugin` for documentation and onboarding guidance (RAG over product docs)

Conversation state is maintained per user session in Upstash Redis with a 24-hour TTL. Long-term conversation history is stored in PostgreSQL for training and improvement.

### 3.2 Background Agents

Background agents are invisible processes that monitor the tenant's data and surface suggestions. They do not interact with users directly. They produce **Suggestion Cards** that appear in the dashboard work queue and notification center.

**Suggestion Card Entity:**

| Field | Type | Description |
|---|---|---|
| `id` | UUID | |
| `tenantId` | UUID | |
| `agentKey` | string | `accounting_guardian`, `inventory_sentinel`, `compliance_watcher`, `onboarding_coach` |
| `severity` | enum | `Info`, `Warning`, `Critical` |
| `category` | string | E.g., `journal_imbalance`, `reorder_needed`, `tax_misconfiguration` |
| `title` | string | Human-readable summary |
| `description` | string | Detailed explanation |
| `suggestedAction` | json | Machine-readable action the user can approve |
| `contextData` | json | Supporting data (referenced documents, amounts, etc.) |
| `status` | enum | `Open`, `Accepted`, `Dismissed`, `Expired` |
| `createdAt` | datetime | |
| `expiresAt` | datetime | nullable |
| `resolvedByUserId` | UUID | nullable |
| `resolvedAt` | datetime | nullable |
| `dismissReason` | string | nullable |
| `feedbackRating` | enum | nullable, `Helpful`, `NotHelpful` |

This entity extends the existing `AlertCard` entity from `dashboard/06-alerts-and-work-queue.md` with agent-specific fields (`agentKey`, `suggestedAction`, `feedbackRating`).

#### Agent: Accounting Guardian

**Purpose:** Detect accounting anomalies and maintain data integrity.

**What it monitors:**
| Check | Trigger | Frequency |
|---|---|---|
| Journal balance check | Every posted journal entry | Event-driven (via `NestJS EventEmitter`) |
| Unbalanced journal detection | Scans all journals in current open period | Nightly batch (BullMQ cron) |
| Missing event-to-journal mappings | Business event fired but no journal entry created within 5 minutes | Event-driven with delayed check |
| Opening Balance Equity (3900) non-zero | Checks after any opening balance modification | Event-driven |
| Period close readiness | 3 days before configured close date | Scheduled |
| Suspense account buildup | GRN Accrual (2121), Opening Balance Equity (3900) growing | Weekly |
| FX revaluation due | Open FC balances exist and month-end approaching | 3 days before period end |

**Example suggestions:**
- CRITICAL: "Journal entry JE-2026-0342 is unbalanced by 0.005 KWD. This is likely a rounding error in the tax calculation for Invoice INV-KWT-1234. [Fix: Add 0.005 KWD to Cash Over/Short (6700)] [View Journal]
- WARNING: "GRN Accrual (2121) has a balance of 12,450.000 KWD across 8 unmatched goods receipts. These have been unmatched for over 30 days. [View unmatched GRNs] [Dismiss]
- INFO: "Period 2026-02 is ready to close. All journals balanced, no pending imports, no unposted drafts. [Close period] [Review first]

#### Agent: Inventory Sentinel

**Purpose:** Detect inventory anomalies, prevent stockouts, and flag shrinkage.

**What it monitors:**
| Check | Trigger | Frequency |
|---|---|---|
| Reorder level breach | Stock falls below `reorderLevel` | Event-driven (on stock movement) |
| Negative stock detection | Stock goes below zero (if policy allows soft negative) | Event-driven |
| Stock count variance | After `inventory.count.approved` | Event-driven |
| Slow-moving stock | Items with zero sales in 60+ days | Weekly |
| Dead stock | Items with zero sales in 180+ days | Monthly |
| Shrinkage pattern | Consistent negative variances at specific locations | After each stock count |
| Expiry risk (Phase 2) | Batch items approaching expiry with remaining stock | Daily |

**Example suggestions:**
- WARNING: "Stock for 'Samsung Galaxy S24 Ultra (256GB, Black)' at Salmiya Branch is at 2 units (reorder level: 5). Average weekly sales: 3 units. Estimated stockout in 4 days. [Create Purchase Order for 10 units from Mobile World Trading] [Dismiss]
- INFO: "23 items have had zero sales in the last 90 days with a total stock value of 8,750.000 KWD. [View slow-moving items report] [Transfer to discount location]
- CRITICAL: "Stock count at Kuwait City warehouse found -47 units variance across 12 items (total value: 3,200.000 KWD). Highest variance: 'Apple AirPods Pro' (-15 units). This exceeds your configured shrinkage threshold of 2%. [View count details] [Investigate]

#### Agent: Compliance Watcher

**Purpose:** Monitor tax configuration and flag potential compliance issues before they become problems.

**What it monitors:**
| Check | Trigger | Frequency |
|---|---|---|
| Tax rate effective date approaching | New rate version with future `effectiveFrom` | Daily |
| Invoices with zero tax in VAT-registered tenant | Invoice confirmed with no tax applied | Event-driven |
| Tax component mismatch | Item uses a tax component that doesn't match its category | Nightly |
| ZATCA compliance (KSA tenants) | e-invoice schema validation failures | Event-driven |
| Tax return data readiness | 5 days before filing deadline | Scheduled |
| Missing tax registration | Transactions exceed threshold but no TRN configured | Monthly check |

**Example suggestions:**
- WARNING: "New VAT rate of 10% takes effect on 2026-04-01 for Bahrain. 3 price lists have not been updated to reflect the new rate. [View affected price lists] [Dismiss]
- INFO: "Your VAT return for Q1 2026 is due in 12 days. All transactions are posted and reconciled. [Generate VAT return report] [Review transactions]
- CRITICAL: "Invoice INV-DXB-0891 was created with zero tax for a standard-rated item ('Office Desk'). This may indicate a tax configuration error. [View invoice] [Check tax setup]

#### Agent: Onboarding Coach

**Purpose:** Guide new users through feature discovery and system adoption.

**What it monitors:**
| Check | Logic | Timing |
|---|---|---|
| Feature adoption tracking | Has the tenant used POS? Created an invoice? Built a custom report? Set up a second user? | Continuous, checked daily |
| Configuration completeness | Are there branches with no warehouses? Roles with no users? Payment methods enabled but never used? | Daily for first 30 days |
| Data completeness | Products imported but no opening stock? Customers imported but no credit limits set? | Daily for first 14 days |
| Usage patterns | User logs in but only uses one module | After 7 days of activity |

**Example suggestions:**
- INFO: "You've been using POS for 5 days but haven't set up your daily closing process. Daily Z-reports help you track cash discrepancies and reconcile shifts. [Learn about Z-reports] [Set up shift closing]
- INFO: "You imported 245 products but 180 have no reorder levels set. Without reorder levels, the system can't alert you when stock is low. [Set reorder levels in bulk] [Skip for now]
- INFO: "You have 3 team members invited but none have logged in yet. Want to send a reminder? [Resend invitations] [Dismiss]
- INFO: "You haven't tried the Report Builder yet. You can create custom reports without any technical skills. [Build your first report] [Show me how]

The Onboarding Coach automatically deactivates after 60 days or when the tenant reaches a configurable "adoption score" threshold (e.g., 80% of core features used at least once).

### 3.3 Agent Infrastructure

**How agents run:**

| Agent | Execution Model | Why |
|---|---|---|
| Accounting Guardian | Hybrid: event-driven for per-transaction checks + nightly batch for aggregate checks | Transaction-level checks must be near-real-time. Aggregate checks don't need to block. |
| Inventory Sentinel | Hybrid: event-driven for stock level checks + weekly batch for slow-moving analysis | Stockout alerts must be immediate. Trend analysis can batch. |
| Compliance Watcher | Mostly event-driven for per-invoice checks + scheduled for deadline-based checks | Tax issues need catching at the point of creation. |
| Onboarding Coach | Scheduled daily | No urgency. Low-frequency, advisory only. |

**Implementation:**

All agents are implemented as BullMQ workers in the NestJS API service (not in FastAPI). Reasons:
1. Agents primarily need database access and business logic, not LLM calls
2. Simple rule-based checks don't need Python/ML infrastructure
3. When an agent DOES need LLM assistance (e.g., explaining an anomaly in natural language for the suggestion card), it calls the FastAPI AI service
4. This avoids giving the Python service write access to suggestion cards

**Agent runtime architecture:**

```
NestJS API
  ├── AgentModule
  │   ├── AccountingGuardianService
  │   │   ├── onJournalPosted(event)          # Event listener
  │   │   ├── nightlyBalanceCheck()            # BullMQ cron: 0 2 * * *
  │   │   └── periodCloseReadinessCheck()      # BullMQ cron: 0 8 * * *
  │   ├── InventorySentinelService
  │   │   ├── onStockMovement(event)           # Event listener
  │   │   ├── weeklySlowMovingCheck()          # BullMQ cron: 0 3 * * 1
  │   │   └── monthlyDeadStockCheck()          # BullMQ cron: 0 3 1 * *
  │   ├── ComplianceWatcherService
  │   │   ├── onInvoiceConfirmed(event)        # Event listener
  │   │   ├── dailyRateExpiryCheck()           # BullMQ cron: 0 7 * * *
  │   │   └── filingDeadlineCheck()            # BullMQ cron: 0 7 * * *
  │   ├── OnboardingCoachService
  │   │   └── dailyAdoptionCheck()             # BullMQ cron: 0 9 * * *
  │   └── SuggestionService
  │       ├── createSuggestion(card)
  │       ├── acceptSuggestion(id, userId)
  │       ├── dismissSuggestion(id, userId, reason)
  │       └── rateSuggestion(id, rating)
  │
  └── EventListeners (existing NestJS EventEmitter)
      ├── accounting.journal.posted -> AccountingGuardianService
      ├── inventory.stock.moved -> InventorySentinelService
      ├── sales.invoice.confirmed -> ComplianceWatcherService
      └── ... (all events from accounting/07-event-mappings.md)
```

**How suggestions are stored and presented:**

1. Agents call `SuggestionService.createSuggestion()` which inserts into the `suggestion_cards` table
2. NestJS WebSocket gateway (Socket.io) emits new suggestion events to connected clients on the tenant's channel
3. On the frontend, suggestions appear in two places:
   - **Dashboard Work Queue** (from `dashboard/06-alerts-and-work-queue.md`): a dedicated "AI Suggestions" tab alongside existing alert types
   - **Notification Bell**: critical suggestions also appear as notifications
4. Each suggestion card in the UI shows: severity icon, title, description, and action buttons (Accept / Dismiss / Ask Copilot)
5. Clicking "Accept" on a suggestion that has a `suggestedAction` executes the action through standard API endpoints (e.g., accepting a reorder suggestion creates a draft PO)
6. Clicking "Ask Copilot" opens the Copilot with the suggestion context pre-loaded

**How user feedback improves agents over time:**

1. Every accept/dismiss is logged with the suggestion ID and user ID
2. Dismiss reasons are categorized: "Not relevant", "Already handled", "Incorrect", "Not now
3. Monthly, a background job aggregates feedback metrics per agent per tenant:
   - Accept rate, dismiss rate, "Incorrect" rate
4. In Phase 2: these metrics feed back into agent threshold tuning. If a tenant consistently dismisses slow-moving stock alerts for items under 50 KWD, the agent raises its threshold for that tenant.
5. In Phase 3: aggregated anonymized feedback across tenants improves global agent defaults.

**Safety guarantees:**

| Guarantee | Implementation |
|---|---|
| Suggest-only | Agents write to `suggestion_cards` table only. No agent has write access to any business entity table. |
| Audit trail | Every suggestion creation, acceptance, and dismissal is in the immutable audit log |
| Tenant isolation | Each tenant has a dedicated database. Agent workers connect to the correct tenant DB via TenantConnectionService. `WHERE tenant_id = ?` retained as defense-in-depth. |
| Rate limiting | Each agent has a max suggestions-per-day-per-tenant limit to prevent alert fatigue. Defaults: Accounting Guardian: 20, Inventory Sentinel: 30, Compliance Watcher: 10, Onboarding Coach: 5 |
| Graceful degradation | If the AI service is down, agents that need LLM calls (e.g., for natural language explanations) fall back to template-based descriptions. Rule-based checks continue operating. |

---

## 4. What Changes in the Existing Specs

### Specs That Need Updates

| Spec File | Change Required |
|---|---|
| `settings-admin/11-data-import-migration-controls.md` | Add AI column-mapping step to the import workflow. Add `mappingConfidence` field to import job. Add `aiSuggestedFixes` to import error entity. The existing Upload -> Validate -> Preview -> Confirm -> Apply workflow remains, but a new "AI Map" step is inserted between Upload and Validate. |
| `dashboard/06-alerts-and-work-queue.md` | Extend `AlertCard` entity with agent-specific fields or create a new `SuggestionCard` entity that inherits from it. Add "AI Suggestions" as a new work queue type. Add feedback mechanism (accept/dismiss/rate). |
| `settings-admin/01-organisation-governance.md` | Add `onboardingState` JSON field to Tenant entity to track questionnaire progress. Add `onboardingCompletedAt` datetime field. Add `industry` enum values if not already exhaustive. |
| `settings-admin/08-notifications-alert-policy.md` | Add notification rules for agent suggestions. Define which suggestion severities trigger push notifications vs. just appear in the work queue. |
| `product/roadmap.md` | Major restructure to reflect the new phased approach (see Section 5 below). |

### Specs That Are Fine As-Is

| Spec File | Why No Changes Needed |
|---|---|
| `accounting/01-architecture.md` through `10-bank-reconciliation.md` | The accounting engine is designed correctly. Event-driven journal creation is exactly what the agents need to hook into. No changes. |
| `accounting/04-chart-of-accounts.md` | The COA template is comprehensive and works as the default for onboarding. Industry-specific variations are additive. |
| `accounting/07-event-mappings.md` | All 32 event mappings are correct and provide the event hooks that background agents subscribe to. |
| `settings-admin/04-branches-locations-warehouses.md` | Branch/warehouse model is correct. Onboarding wizard creates these entities using the same API. |
| `settings-admin/06-tax-configuration-controls.md` | Tax model is flexible enough. Onboarding just needs to select the right template per country. |
| `settings-admin/05-currency-fiscal-periods.md` | Currency and fiscal period model is correct. Onboarding creates these from questionnaire answers. |
| All POS specs (`pos/01` through `pos/09`) | POS is self-contained. No agent changes needed to POS internals. |
| All Sales specs (`sales/01` through `sales/08`) | Sales module is event-driven. Agents listen to events, not modify the module. |
| All Purchase specs (`purchase/01` through `purchase/08`) | Same as sales. |
| All Inventory specs (`inventory/01` through `inventory/11`) | The reorder engine (`inventory/09`) already has the logic agents need. |
| All Reports specs (`reports/01` through `reports/07`) | NLQ already planned. Report engine is the execution backend for Copilot queries. |
| `user-auth-management/*` | Auth model is correct. Agents run with system-level service accounts, not user tokens. |

### New Specs That Need to Be Written

| New Spec | Location | Content |
|---|---|---|
| **Onboarding Wizard Spec** | `product/onboarding/` (new directory) | Full spec for questionnaire steps, conditional logic, AI configuration pipeline, import assistance flow. 3-4 files: `01-questionnaire.md`, `02-configuration-pipeline.md`, `03-ai-import-assistant.md`, `04-go-live.md` |
| **AI Agent System Spec** | `product/agents/` (new directory) | Agent architecture, suggestion card entity, agent runtime model. 5 files: `01-architecture.md`, `02-copilot.md`, `03-accounting-guardian.md`, `04-inventory-sentinel.md`, `05-compliance-watcher.md`, `06-onboarding-coach.md`, `07-suggestion-model.md` |
| **Tenant Provisioning Spec** | `product/settings-admin/13-tenant-provisioning.md` | How a new tenant is created from questionnaire data. Configuration pipeline steps. Idempotent re-configuration on questionnaire changes. |
| **COA Templates Spec** | `product/accounting/11-coa-templates.md` | Industry-specific COA variations (Electronics, Grocery, Fashion, General Trading, Furniture). What accounts are added/removed per vertical. |

### Architecture Changes to the Tech Stack

**No major changes.** The existing stack supports this approach:

| Need | Already Supported By |
|---|---|
| Agent background jobs | BullMQ + Upstash Redis (already in stack) |
| Event-driven agent triggers | NestJS EventEmitter (already in stack) |
| Real-time suggestion delivery | NestJS WebSocket gateway with Socket.io (already in stack) |
| Copilot NLQ | FastAPI + NLQ Plugin (already in stack) |
| Copilot conversation state | Upstash Redis (already in stack) |
| RAG for help content | pgvector (already in stack) |
| Column mapping AI | FastAPI + LLM (already in stack) |

**One addition:** The FastAPI AI service needs a new `ImportAssistPlugin` for the column-mapping intelligence during onboarding. This fits cleanly into the existing plugin registry pattern.

---

## 5. Updated Roadmap

### 14-Day MVP (Weeks 1-2)

**Goal:** A working onboarding flow that configures a tenant from a questionnaire and lets them start using core ERP features. No AI agents yet. No data import AI yet. Just: questionnaire -> configuration -> manual use.

| Day | Deliverable |
|---|---|
| 1-2 | Tenant provisioning API: create tenant, branches, warehouses from a configuration payload |
| 3-4 | COA template seeding: API that takes industry + country and creates full COA |
| 5-6 | Tax profile seeding: API that takes country and creates tax profile with correct rates |
| 7-8 | Onboarding questionnaire UI: multi-step wizard (Steps 1-6 from Section 2) |
| 9-10 | Configuration pipeline: questionnaire answers -> API calls -> configured tenant |
| 11-12 | Post-onboarding: basic dashboard with role-based defaults, basic POS screen |
| 13-14 | Manual CSV/Excel import (existing spec, no AI mapping yet). End-to-end test: signup to configured tenant with imported products. |

**What the MVP DOES NOT include:**
- AI column mapping (manual mapping only)
- Background agents (no Accounting Guardian, Inventory Sentinel, etc.)
- HSN Copilot
- Custom subdomains
- Opening balance import (manual journal entry only)

### Weeks 3-6: AI Layer

| Week | Deliverable |
|---|---|
| 3 | AI Import Assistant: column mapping with LLM, validation suggestions, error fix suggestions |
| 4 | HSN Copilot v1: NLQ queries only. "Show me X" works. No actions, no report building yet. |
| 5 | Accounting Guardian + Inventory Sentinel: event-driven checks, suggestion cards in dashboard |
| 6 | Compliance Watcher + Onboarding Coach. Suggestion card feedback loop (accept/dismiss/rate). |

### Phase 2 (Weeks 7-12)

| Deliverable | Details |
|---|---|
| Copilot Actions | Pre-fill forms from natural language, workflow guidance, "how do I..." help via RAG |
| Opening Balance AI Import | Upload trial balance, AI maps to COA, creates opening balance journal |
| Agent Threshold Learning | Per-tenant feedback improves suggestion relevance |
| Copilot Report Building | "Create a report showing..." generates report definitions |
| Subscription and Billing | Stripe integration, trial-to-paid conversion, usage-based pricing |
| Custom Subdomains | `star-alliance.hsn.com` |

### Phase 3 (Months 4-6)

| Deliverable | Details |
|---|---|
| Advanced Agents | Bank reconciliation copilot (from AI/ML #2), fraud sentinel (from AI/ML #3), margin intelligence (from AI/ML #8) |
| Multi-tenant Agent Analytics | Anonymized cross-tenant learning for better defaults |
| Self-serve Plan Changes | Add modules, add users, upgrade/downgrade |
| ZATCA e-invoicing | Full KSA compliance for Saudi expansion |
| Mobile App | iOS/Android for POS and approvals |

---

## 6. Competitive Moat

### Why This Creates Defensibility

**1. Data flywheel from onboarding.**

Every tenant that completes onboarding teaches the system what column headers look like in real-world spreadsheets, what COA structures retailers actually use, what tax configurations are common for each country. After 100 onboardings, the AI column mapper has seen hundreds of real Excel files. After 1,000 onboardings, it handles edge cases that no pre-built template could anticipate. Competitors starting this approach later face a cold-start problem.

**2. Agent feedback loop.**

Every accepted/dismissed suggestion improves agent thresholds. After 6 months of production use across 100+ tenants, the Accounting Guardian knows that a 0.005 KWD rounding difference is cosmetic but a 50 KWD imbalance is critical. The Inventory Sentinel knows that electronics retailers have different seasonal patterns than grocery stores. This accumulated intelligence is a moat that grows with every customer-month of usage.

**3. Domain-specific LLM context.**

The NLQ system and Copilot build a corpus of real retail ERP queries in Arabic and English. "Show me slow-moving stock" in Arabic, "What's my margin on Samsung products," "How much does customer X owe me" -- these query patterns are domain-specific and language-specific. A generic AI ERP built in Silicon Valley will not have this MENA retail context.

**4. Speed-to-value as brand.**

If HSN can reliably deliver "signup to live in 2 hours" and this becomes the market expectation in MENA mid-market retail, any competitor that requires even 2 weeks of implementation is at a structural disadvantage. Speed-to-value becomes the brand, not a feature.

### MENA First-Mover Advantage

The MENA mid-market retail ERP space is a gap:
- SAP and Oracle serve the top end ($150-500/user) with long implementations
- Odoo and ERPNext serve the technical DIY segment
- Local legacy systems (including the current Merpec) serve the "we know the owner" segment
- Nobody serves the "I want a real ERP that works in 2 hours for $40-60/user/month" segment

Being first to fill this gap in Kuwait, then KSA, then UAE creates:
- Brand recognition in a market where word-of-mouth among business owners is the primary distribution channel
- A reference customer base that de-risks expansion (Kuwaiti retailers who expand to KSA bring HSN with them)
- Regulatory and compliance expertise (ZATCA, Kuwait VAT-readiness) that takes years to build

The window is approximately 18-24 months. After that, Odoo or a well-funded competitor (Campfire, Doss) may localize for MENA. Moving first and accumulating the data flywheel during this window is the strategy.

---

## Appendix A: Onboarding Questionnaire Decision Tree

```
Start
  |
  v
Step 1: Business Info
  -> Sets: country, industry, language defaults
  |
  v
Step 2: Locations
  -> If branches > 1: enable multi-branch
  -> If inter-branch transfers: create transit warehouse
  |
  v
Step 3: Accounting
  -> If "Custom COA": skip COA seeding, user builds manually
  -> If multi-currency: enable exchange rate management
  -> If cheques: enable cheque accounts in COA
  |
  v
Step 4: Tax (conditional on country)
  -> KW/QA/OM: minimal, VAT-ready defaults
  -> SA: ZATCA flow
  -> AE: UAE VAT flow
  -> BH: Bahrain VAT flow
  |
  v
Step 5: Team
  -> Creates role entities
  -> Queues invitations (sent after go-live)
  |
  v
Step 6: POS
  -> If no POS: skip POS config
  -> If POS: create registers, receipt templates
  |
  v
Step 7: Data
  -> Determines which import steps to show in Phase 4
  |
  v
AI Configuration Pipeline (automated)
  |
  v
Data Import (if selected)
  |
  v
Go Live
```

## Appendix B: Suggestion Card States

```
Created (by agent)
  -> Open (visible to user)
    -> Accepted (user approves action)
      -> Executed (action completed via API)
    -> Dismissed (user rejects)
      -> reason: "Not relevant" | "Already handled" | "Incorrect" | "Not now
    -> Expired (TTL reached without action)
```

## Appendix C: Agent Safety Matrix

| Guarantee | Accounting Guardian | Inventory Sentinel | Compliance Watcher | Onboarding Coach |
|---|---|---|---|---|
| Can read business data | Yes (tenant-scoped) | Yes (tenant-scoped) | Yes (tenant-scoped) | Yes (tenant-scoped) |
| Can write business data | NO | NO | NO | NO |
| Can create suggestion cards | Yes | Yes | Yes | Yes |
| Can call external APIs | No | No | No (ZATCA validation is internal) | No |
| Max suggestions/day/tenant | 20 | 30 | 10 | 5 |
| Runs during business hours only | No (24/7) | No (24/7) | No (24/7) | Yes (morning only) |
| Can be disabled per tenant | Yes | Yes | Yes | Yes (auto-disables after 60 days) |

---

### Critical Files for Implementation

- `/Users/hus3ain/Development/Cursor/Malakstar/ERP/agent-os/product/settings-admin/11-data-import-migration-controls.md` - Must be extended with AI column-mapping step; this is the foundation for the import assistant
- `/Users/hus3ain/Development/Cursor/Malakstar/ERP/agent-os/product/dashboard/06-alerts-and-work-queue.md` - Must be extended to support agent suggestion cards with feedback mechanisms
- `/Users/hus3ain/Development/Cursor/Malakstar/ERP/agent-os/product/accounting/04-chart-of-accounts.md` - COA template that the onboarding configuration pipeline seeds; needs industry-specific variants
- `/Users/hus3ain/Development/Cursor/Malakstar/ERP/agent-os/product/settings-admin/01-organisation-governance.md` - Tenant entity needs onboarding state fields; this is the anchor for the entire provisioning flow
- `/Users/hus3ain/Development/Cursor/Malakstar/ERP/agent-os/product/tech-stack.md` - AI architecture section defines the plugin registry pattern that all new agents and the Copilot must follow
