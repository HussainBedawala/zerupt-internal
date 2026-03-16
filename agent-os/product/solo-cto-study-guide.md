# Solo CTO Study Guide: Stage-by-Stage Learning and Hiring Map

Purpose: Convert the roadmap into an execution order you can follow as a solo CTO. For each development stage, this guide defines what must be done first, which role types are required, what each role does, and the exact technical and business skills you should learn to direct that role.

---

## How to Use This Guide

- Treat each phase as a gate. Do not start the next phase until done criteria pass.
- If you use AI agents as your "team," each role below becomes an agent role specification.
- Your learning plan is the union of all role skills, prioritized by phase.
- Always learn both tracks in parallel: technical implementation and business logic correctness.

---

## Part 1: Priority Order Before and During Build

This is the minimum correct order to build the product safely.

### Priority 0 (Must happen first, before module coding)

1. Development infrastructure and deployment pipeline.
2. Internationalization (i18n) and RTL/LTR layout foundation — every UI component, form, table, and document must be locale-aware from day one.
3. Multi-tenant foundation (central admin schema, tenant provisioning, tenant routing middleware).
4. Audit trail spine (append-only tracking for every mutation).

### Priority 1 (Configuration backbone)

4. Settings/Admin module (roles, permissions, org hierarchy, fiscal/tax/currency setup, numbering).

### Priority 2 (Financial correctness backbone)

5. Accounting engine (COA, journals, mappings, tax model, multi-currency, period control, COGS rules).

### Priority 3 (Stock correctness backbone)

6. Inventory engine (items, stock ledger, costing, movement rules, pricing, reorder).

### Priority 4 (Revenue and procurement execution)

7. POS, Sales, and Purchase modules in parallel after Accounting + Inventory are stable.

### Priority 5 (Adoption and activation)

8. Onboarding orchestration (questionnaire to config pipeline, template seeding, import, go-live checks).

### Priority 6 (Read models and insight layer)

9. Dashboard, reports, and search after transactional data exists.

### Priority 7 (AI augmentation only after deterministic core)

10. AI services and agents for assistive intelligence, never replacing ledger/source-of-truth logic.

### Priority 8 (Commercialization and production hardening)

11. GTM systems, billing, trial lifecycle, scale/security testing, and launch operations.

---

## Part 2: Phase-by-Phase Role Map and Learning Paths

Each phase includes:
- Required employee/engineer types.
- Role job descriptions.
- Skills you must learn (technical + business).
- Exit criteria before moving on.

---

## Phase 0: Dev Environment and Infrastructure

### Role 1: Platform Engineer
- **Job description:** Build the monorepo, CI/CD, environment strategy, and deployment path for `web`, `api`, and `ai`.
- **Technical skills to learn:**
  - Turborepo + pnpm workspace architecture.
  - GitHub Actions pipeline (`lint`, `typecheck`, `test`, `build`, preview deploy).
  - Docker Compose for Postgres, Redis, Meilisearch.
  - Release safety: branch protection, rollback strategy, preview environments.
- **Business skills to learn:**
  - How release reliability impacts customer trust and churn.
  - Cost-awareness for infrastructure choices at pre-revenue stage.

### Role 2: Internationalization (i18n) Engineer
- **Job description:** Establish the i18n framework, RTL/LTR layout system, translation infrastructure, and locale-aware formatting so every module built on top is multilingual by default.
- **Technical skills to learn:**
  - i18n framework setup (next-intl or equivalent) with locale detection and switching.
  - CSS logical properties (`inline-start`/`inline-end`) and `dir` attribute propagation for RTL/LTR.
  - Translation file architecture (JSON per locale, namespaced by module, fallback chains).
  - Locale-aware number, currency, date, and percentage formatting (Intl API).
  - Bidirectional text handling in inputs, tables, and generated documents.
  - Font stacks for Arabic, Latin, and mixed-script rendering.
- **Business skills to learn:**
  - Why retrofitting RTL/multilingual support is 5-10x more expensive than building it in from day one.
  - Market requirements for Arabic-first ERP in MENA and multilingual needs in SEA/India.

### Role 3: Data Platform Engineer
- **Job description:** Implement central admin DB, tenant DB provisioning, migration orchestration, and tenant-aware routing.
- **Technical skills to learn:**
  - Multi-tenant architecture (dedicated DB per tenant).
  - Drizzle Kit migration strategy (expand-contract, no destructive migration in one step).
  - `TenantContextMiddleware` and `TenantConnectionService` patterns.
  - Seed and provisioning automation.
- **Business skills to learn:**
  - Why tenant isolation is a core commercial promise for B2B ERP.
  - Incident impact of cross-tenant data leakage.

### Role 4: Security and Observability Engineer
- **Job description:** Establish audit logging, runtime monitoring, and failure detection.
- **Technical skills to learn:**
  - Append-only audit trail design.
  - Sentry, PostHog, structured logs, and alert thresholds.
  - Secrets management and environment segmentation.
- **Business skills to learn:**
  - Audit/compliance expectations in financial systems.
  - How observability reduces downtime cost and support load.

### Exit criteria
- First tenant can be provisioned automatically.
- Tenant routing verified end-to-end in tests.
- Every mutation is audit-logged.
- CI blocks broken builds from merging.
- All UI renders correctly in both RTL (Arabic) and LTR (English) with locale switching working end-to-end.

---

## Phase 1: Settings and Admin Module

### Role 1: Identity and Access Engineer
- **Job description:** Build user lifecycle and dynamic RBAC permissions.
- **Technical skills to learn:**
  - Invite/activate/suspend/deactivate lifecycle.
  - Dynamic role and permission schema design.
  - Guard/middleware enforcement on all protected APIs.
- **Business skills to learn:**
  - Internal control principles (least privilege, segregation of duties).
  - Permission model differences across owner, accountant, cashier, and warehouse users.

### Role 2: Organization Configuration Engineer
- **Job description:** Build operational structures: branch, warehouse, zone, bin, tax, currency, fiscal periods, and numbering.
- **Technical skills to learn:**
  - Hierarchical location modeling.
  - Date-effective configurations (tax rates, fiscal settings).
  - Branch-aware sequence generation.
- **Business skills to learn:**
  - Practical setup flows used during ERP implementation.
  - Country-specific tax/fiscal setup risks.

### Role 3: Implementation Consultant (Business-side employee profile)
- **Job description:** Translate customer operating reality into system configuration.
- **Technical skills to learn:**
  - Configuration QA checklist and validation rules.
  - Data import pre-validation basics.
- **Business skills to learn:**
  - Discovery questions for branches, roles, tax profile, and document flow.
  - Go-live readiness criteria.

### Exit criteria
- New tenant can fully configure org + permissions without engineering intervention.
- Role enforcement and auditability pass integration tests.
- Tax/currency/fiscal setup supports at least one full accounting cycle.

---

## Phase 2: Accounting Engine

### Role 1: Accounting Domain Engineer
- **Job description:** Implement the journal engine and posting rules that all modules must use.
- **Technical skills to learn:**
  - Event-driven and idempotent posting.
  - COA model and account-mapping engine.
  - Soft/hard period locking and reversal patterns.
- **Business skills to learn:**
  - Double-entry accounting mechanics.
  - Financial statement flow (P&L, balance sheet, trial balance).
  - Posting controls and close discipline.

### Role 2: Tax and Compliance Engineer
- **Job description:** Implement `TaxCode -> TaxGroup -> TaxRate` with date-effectivity and regional compatibility.
- **Technical skills to learn:**
  - Tax calculation engine and rule versioning.
  - Precision/rounding policies and reconciliation checks.
- **Business skills to learn:**
  - VAT/GST scenarios across target geographies.
  - Input/output tax and filing implications.

### Role 3: Controller/Finance Reviewer (Business-side employee profile)
- **Job description:** Validate journal outputs and accounting correctness before release.
- **Technical skills to learn:**
  - Querying ledgers and reconciling test fixtures.
  - Constructing accounting scenario test packs.
- **Business skills to learn:**
  - Close checklist, control testing, and exception handling.
  - Materiality-focused review for defects.

### Exit criteria
- All core events post balanced journals correctly.
- Period lock behavior blocks unauthorized back-posting.
- Tax and FX flows reconcile with expected outcomes.

---

## Phase 3: Inventory Engine

### Role 1: Inventory Systems Engineer
- **Job description:** Build item catalog, stock ledger, movement model, and location-aware stock state.
- **Technical skills to learn:**
  - Immutable stock ledger design.
  - Serial and batch tracking models.
  - Negative stock controls and reservation behavior.
- **Business skills to learn:**
  - Warehouse operation patterns and traceability.
  - Inventory control and shrinkage prevention basics.

### Role 2: Costing Engineer
- **Job description:** Implement WAC/FIFO and cost layer handling with accounting alignment.
- **Technical skills to learn:**
  - Cost-layer computation by location.
  - COGS handoff correctness to accounting engine.
  - Landed cost allocation logic.
- **Business skills to learn:**
  - Margin impact of costing method choices.
  - Audit implications of valuation errors.

### Role 3: Warehouse Operations Lead (Business-side employee profile)
- **Job description:** Validate movement workflows against real warehouse behavior.
- **Technical skills to learn:**
  - Scenario-based testing for adjustments, transfers, and assemblies.
- **Business skills to learn:**
  - SOP design for receiving, picking, transfer, and cycle counts.

### Exit criteria
- Stock ledger remains consistent under concurrent movements.
- Cost outputs reconcile with accounting postings.
- Serial/batch traceability works end-to-end.

---

## Phase 4: Transaction Modules (POS, Sales, Purchase in Parallel)

### Role 1: POS Engineer
- **Job description:** Build register sessions, checkout lifecycle, payment methods, returns, and close reconciliation.
- **Technical skills to learn:**
  - POS state machine and receipt generation.
  - Offline queueing, conflict handling, and sync replay.
  - Shift close and Z-report calculations.
- **Business skills to learn:**
  - Cashier workflow design for speed and error prevention.
  - Cash handling controls and reconciliation discipline.

### Role 2: Order-to-Cash Engineer (Sales)
- **Job description:** Build quotation to invoice lifecycle, AR tracking, and credit control.
- **Technical skills to learn:**
  - Document state transitions and irreversible milestones.
  - Credit note and payment allocation logic.
- **Business skills to learn:**
  - Credit policy design and aging risk.
  - Customer account governance.

### Role 3: Procure-to-Pay Engineer (Purchase)
- **Job description:** Build PO to invoice lifecycle, AP tracking, returns, and landed cost flow.
- **Technical skills to learn:**
  - GRN and invoice matching logic.
  - Debit note handling and supplier payment allocation.
- **Business skills to learn:**
  - Supplier term negotiation levers and procurement controls.
  - Cost capture discipline for true gross margin visibility.

### Role 4: QA Automation Engineer
- **Job description:** Create automated tests around high-risk transactional and financial workflows.
- **Technical skills to learn:**
  - Integration and E2E tests for O2C/P2P/POS.
  - Regression packs for posting, stock movement, and permissions.
- **Business skills to learn:**
  - Risk-based test prioritization around money and stock.

### Exit criteria
- POS, Sales, and Purchase run independently without data integrity drift.
- All transactional outputs reconcile to inventory and accounting.
- Offline POS does not corrupt financial or stock source-of-truth.

---

## Phase 5: Onboarding System

### Role 1: Onboarding Product Engineer
- **Job description:** Build questionnaire UI and config pipeline that creates ready-to-operate tenants.
- **Technical skills to learn:**
  - Multi-step form architecture.
  - Mapping logic from answers to settings/entities.
  - Validation and failure recovery in provisioning pipeline.
- **Business skills to learn:**
  - Implementation onboarding flow design.
  - Friction reduction for time-to-value.

### Role 2: Data Migration Specialist (Business/technical hybrid profile)
- **Job description:** Define import templates and validation for products/customers/suppliers.
- **Technical skills to learn:**
  - CSV/Excel parsing and schema validation.
  - Import error reporting UX.
- **Business skills to learn:**
  - Data hygiene standards for go-live.
  - Migration cutover planning.

### Exit criteria
- New tenant reaches go-live through onboarding only.
- COA/tax templates seeded correctly by country + industry.
- Import path works for core master data.

---

## Phase 6: Dashboard, Reports, and Search

### Role 1: Analytics Engineer
- **Job description:** Build role-based dashboards and KPI widgets from transactional data.
- **Technical skills to learn:**
  - Read-model design and pre-aggregation strategy.
  - Permission-aware KPI query patterns.
- **Business skills to learn:**
  - KPI definitions for owner/accountant/cashier/warehouse personas.
  - Decision-oriented metric design.

### Role 2: Reporting Engineer
- **Job description:** Build report definition engine, templates, exports, and scheduling.
- **Technical skills to learn:**
  - Dynamic query builder constraints and safe execution.
  - PDF/Excel/CSV export pipeline and job scheduling.
- **Business skills to learn:**
  - Financial and operational report semantics.
  - Audit-ready reporting expectations.

### Role 3: Search Engineer
- **Job description:** Implement Meilisearch indexing and federated search.
- **Technical skills to learn:**
  - Index lifecycle, update pipelines, ranking, and filters.
  - Arabic tokenization and multilingual search tuning.
- **Business skills to learn:**
  - Search relevance trade-offs by role workflow.

### Exit criteria
- Dashboard and reports are permission-correct and performant.
- Scheduled reports deliver reliably.
- Search returns relevant cross-entity results in Arabic and English.

---

## Phase 7: AI Layer

### Role 1: AI Platform Engineer
- **Job description:** Build AI service framework, plugin registry, and real-time suggestion delivery.
- **Technical skills to learn:**
  - FastAPI service design and plugin contracts.
  - Queue-driven agent execution and websocket eventing.
  - Resilience patterns when AI providers fail.
- **Business skills to learn:**
  - Human-in-the-loop UX for recommendation systems.
  - Defining safe automation boundaries.

### Role 2: AI Safety and Governance Engineer
- **Job description:** Enforce read/write boundaries, tenant scoping, and prompt safety.
- **Technical skills to learn:**
  - Prompt injection defenses and query sanitization.
  - Confidence thresholds and fallback policies.
  - Telemetry for model output quality.
- **Business skills to learn:**
  - Risk governance for AI suggestions in finance/operations.
  - Policy design: AI suggests, humans approve.

### Exit criteria
- AI can assist but cannot mutate core business data directly.
- AI behavior is tenant-safe, observable, and reversible.
- Suggestion feedback loop captures user acceptance signals.

---

## Phase 8: GTM and Launch

### Role 1: Growth Engineer
- **Job description:** Build landing pages, trial conversion flows, and billing integration.
- **Technical skills to learn:**
  - Stripe plan/trial/subscription integration.
  - Lifecycle automation and event-driven messaging.
- **Business skills to learn:**
  - SaaS funnel design (activation to conversion).
  - Pricing/packaging experiment basics.

### Role 2: Site Reliability Engineer
- **Job description:** Validate scale, reliability, and operational readiness pre-launch.
- **Technical skills to learn:**
  - k6 load testing and bottleneck profiling.
  - Runbooks, SLOs, incident response workflows.
- **Business skills to learn:**
  - Reliability economics (downtime cost and retention impact).

### Role 3: Security Engineer
- **Job description:** Execute security audit and tenant isolation verification for production readiness.
- **Technical skills to learn:**
  - OWASP testing across auth/session/input paths.
  - Isolation testing across tenant boundaries.
- **Business skills to learn:**
  - Security posture communication for enterprise trust.

### Role 4: Customer Success Lead (Business-side employee profile)
- **Job description:** Own onboarding completion, adoption quality, and early customer retention.
- **Technical skills to learn:**
  - Reading product telemetry and issue patterns.
  - Structured escalation into engineering backlog.
- **Business skills to learn:**
  - Account health scoring and churn prevention actions.

### Exit criteria
- Billing, trials, and lifecycle messaging run without manual ops.
- Performance and security gates pass documented thresholds.
- Early customers can onboard and operate with low support burden.

---

## Part 3: Solo CTO Learning Sequence (What to Study First)

This is the strict personal learning order derived from dependency risk.

1. Internationalization and RTL/LTR layout: i18n framework, CSS logical properties, locale-aware formatting, bidirectional text — must be internalized before building any UI.
2. Multi-tenant architecture, migrations, and tenant routing safety.
3. Security baseline: auth, RBAC, audit trail, secrets, OWASP basics.
4. Accounting core: journals, COA, tax, FX, period locks, reversals.
5. Inventory core: ledger, costing, stock movement control, traceability.
6. Transaction engines: POS, Sales, Purchase state machines and reconciliation.
7. Onboarding orchestration and implementation playbooks.
8. Reporting/search architecture and query performance.
9. AI safety architecture and suggestion workflows.
10. GTM systems: billing, trial automation, launch reliability.

---

## Part 4: Weekly Execution Cadence (Solo CTO + AI Team)

- **Monday:** Lock phase goals, role assignments (agent prompts), and acceptance criteria.
- **Tuesday to Thursday:** AI implementation and your architectural/risk reviews.
- **Friday:** Integration tests, release decision, and post-release audit (financial, stock, security, UX).
- **Always-on:** No financial/stock logic merges without tests + scenario-based reconciliation.

---

## Part 5: Non-Negotiable Quality Gates

- No phase starts before dependency phases pass.
- No direct edits to historical financial/stock entries; only reversals and adjusting entries.
- No cross-tenant query execution under any circumstance.
- No AI write access to authoritative ledgers or stock source-of-truth.
- No production deploy without rollback procedure and observability checks.

---

## Part 6: Voltagent Subagent Assignment (Technical + Business)

Use this as your default AI team composition for each phase. Treat "technical" and "business" lanes as parallel tracks.

### Phase 0: Dev Environment and Infrastructure
- **Technical subagents:** `platform-engineer`, `devops-engineer`, `deployment-engineer`, `docker-expert`, `database-administrator`, `postgres-pro`, `typescript-pro`, `sql-pro`
- **Business/operations subagents:** `project-manager`
- **Control/orchestration:** `agent-organizer`, `multi-agent-coordinator`, `task-distributor`, `context-manager`, `error-coordinator`

### Phase 1: Settings and Admin
- **Technical subagents:** `backend-developer`, `api-designer`, `frontend-developer`, `ui-designer`, `nextjs-developer`, `react-specialist`, `typescript-pro`, `sql-pro`
- **Business subagents:** `business-analyst`, `product-manager`, `ux-researcher`, `legal-advisor`
- **Control/orchestration:** `code-reviewer`, `architect-reviewer`, `technical-writer`

### Phase 2: Accounting Engine
- **Technical subagents:** `backend-developer`, `api-designer`, `typescript-pro`, `sql-pro`, `postgres-pro`, `fintech-engineer`
- **Business subagents:** `business-analyst`, `risk-manager`, `compliance-auditor`, `legal-advisor`
- **Control/orchestration:** `code-reviewer`, `architect-reviewer`, `qa-expert`, `test-automator`

### Phase 3: Inventory Engine
- **Technical subagents:** `backend-developer`, `api-designer`, `typescript-pro`, `sql-pro`, `postgres-pro`, `database-optimizer`
- **Business subagents:** `business-analyst`, `risk-manager`, `product-manager`
- **Control/orchestration:** `qa-expert`, `test-automator`, `performance-engineer`, `code-reviewer`

### Phase 4: POS, Sales, and Purchase
- **Technical subagents:** `fullstack-developer`, `frontend-developer`, `backend-developer`, `nextjs-developer`, `react-specialist`, `websocket-engineer`, `typescript-pro`, `sql-pro`
- **Business subagents:** `business-analyst`, `product-manager`, `ux-researcher`, `sales-engineer`
- **Control/orchestration:** `qa-expert`, `test-automator`, `accessibility-tester`, `code-reviewer`, `debugger`

### Phase 5: Onboarding System
- **Technical subagents:** `fullstack-developer`, `frontend-developer`, `backend-developer`, `nextjs-developer`, `react-specialist`, `sql-pro`, `typescript-pro`
- **Business subagents:** `customer-success-manager`, `business-analyst`, `project-manager`, `ux-researcher`
- **Control/orchestration:** `technical-writer`, `qa-expert`, `test-automator`

### Phase 6: Dashboard, Reports, and Search
- **Technical subagents:** `frontend-developer`, `backend-developer`, `data-engineer`, `data-analyst`, `search-specialist`, `postgres-pro`, `database-optimizer`, `typescript-pro`
- **Business subagents:** `product-manager`, `business-analyst`, `customer-success-manager`
- **Control/orchestration:** `performance-engineer`, `qa-expert`, `code-reviewer`

### Phase 7: AI Layer
- **Technical subagents:** `ai-engineer`, `llm-architect`, `prompt-engineer`, `python-pro`, `nlp-engineer`, `backend-developer`, `websocket-engineer`, `mlops-engineer`
- **Business subagents:** `risk-manager`, `compliance-auditor`, `business-analyst`, `product-manager`
- **Control/orchestration:** `security-auditor`, `penetration-tester`, `architect-reviewer`, `error-detective`

### Phase 8: GTM and Launch
- **Technical subagents:** `deployment-engineer`, `devops-engineer`, `sre-engineer`, `security-engineer`, `performance-engineer`, `payment-integration`, `nextjs-developer`
- **Business subagents:** `content-marketer`, `customer-success-manager`, `sales-engineer`, `product-manager`, `project-manager`, `seo-specialist`, `legal-advisor`
- **Control/orchestration:** `incident-responder`, `devops-incident-responder`, `knowledge-synthesizer`, `performance-monitor`

### Specialist Pool (Use as needed)

- **Architecture and APIs:** `microservices-architect`, `graphql-architect` (activate only if GraphQL is adopted), `api-documenter`
- **Developer experience:** `build-engineer`, `dependency-manager`, `tooling-engineer`, `dx-optimizer`, `git-workflow-manager`, `refactoring-specialist`
- **Reliability and security deep dives:** `chaos-engineer`, `security-auditor`, `penetration-tester`, `compliance-auditor`
