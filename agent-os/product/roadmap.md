# Product Roadmap

> Sequenced by dependency order — each phase unlocks the next. No time estimates; phases complete when done.

## Module Dependency Graph

```
Settings/Admin ──┐
                 ├──→ Accounting ──┐
                 │                 ├──→ Inventory ──┐
                 │                 │                ├──→ POS
                 │                 │                ├──→ Sales
                 │                 │                ├──→ Purchase
                 │                 │                │
                 │                 │                ├──→ Dashboard
                 │                 │                └──→ Reports
                 │                 │
Onboarding ──────┘ (orchestrates Settings creation)
```

**Key constraints:**
- Accounting before POS/Sales/Purchase — they call `validatePeriod()` and need account mappings
- Inventory before POS/Sales/Purchase — they read item catalog, prices, stock
- POS, Sales, Purchase can be built in parallel — no cross-dependencies
- Dashboard and Reports are read-only consumers — built last
- Onboarding orchestrates Settings/Admin configuration — needs Settings entities to exist

---

## Phase 0: Dev Environment & Infrastructure

Everything else depends on this. No module work until infra is solid.

**Monorepo & Tooling:**
- Turborepo + pnpm workspaces + TypeScript strict mode
- GitHub repo + branch protection + conventional commits
- CI/CD pipeline (GitHub Actions: lint → typecheck → test → build → preview)
- ESLint, Prettier, Husky pre-commit hooks

**Local Dev:**
- Docker Compose: Postgres, Redis, Meilisearch
- Seed scripts for development data

**Cloud Services:**
- Supabase project (Auth + Storage)
- Railway (API + AI containers)
- Vercel (frontend)
- Upstash Redis
- Sentry (error tracking) + PostHog (product analytics)

**Internationalization (i18n) & Layout Foundation:**
- i18n framework (next-intl) with locale detection, URL-based routing (`/ar/dashboard`, `/en/dashboard`), and user preference persistence
- RTL/LTR layout engine: CSS logical properties only (no physical `left`/`right`), `dir` attribute propagation, Tailwind RTL plugin, mirrored UI components
- Translation file structure: JSON per locale, namespaced by module (`ar/settings.json`, `en/accounting.json`)
- **Launch locales:** Arabic (`ar`) and English (`en`)
- **Phase 2 locales:** Hindi (`hi`), Malay (`ms`) — extensible architecture, no code changes required to add locales
- **Phase 3 locales:** Indonesian (`id`), Filipino (`tl`), Vietnamese (`vi`)
- Locale-aware formatting utilities via `Intl.*` APIs: numbers (Western vs Eastern Arabic digits, Indian grouping), currencies (symbol placement, decimal handling), dates (locale-specific calendars), relative time
- Bidirectional text handling: `dir="auto"` for user content, explicit direction for known content, Unicode bidi isolation
- Font stack: Inter (Latin), Noto Sans Arabic, Noto Sans Devanagari — with `font-display: swap`
- User-level locale preference (overrides tenant default)
- See `settings-admin/14-internationalization.md` for full i18n spec

**Multi-Tenancy Foundation:**
- Central Admin DB schema + first migration
- Tenant DB provisioning pipeline (automated create → migrate → seed)
- `TenantContextMiddleware` + `TenantConnectionService`
- Audit trail spine (append-only log, every mutation tracked)

**Tools to use in this phase (and when):**
- **Linear** — create epics/issues for infra, tenancy, CI/CD, and hard dependency gates
- **Cursor** — implement repo bootstrap, schemas, and middleware with fast iteration
- **Claude Code CLI** — run larger multi-file setup tasks (monorepo scaffolding, CI wiring, seed pipelines)
- **Raycast** — quickly jump between GitHub, Linear, and terminal tasks during setup

---

## Phase 1: Settings & Admin Module

The configuration backbone. Every other module reads from Settings.

- Tenant entity + governance (plan, status, feature flags)
- User lifecycle (invite → activate → suspend → deactivate)
- Dynamic roles + permissions (RBAC with granular feature/action scopes)
- Branch / warehouse / zone / bin hierarchy
- Currency configuration + fiscal period setup
- Tax configuration framework (tax codes, groups, rates)
- Document numbering sequences (per document type, per branch)
- Notification preferences
- Audit trail (immutable append-only log)

**Tools to use in this phase (and when):**
- **Linear** — track RBAC, org hierarchy, tax/currency/fiscal setup as separate deliverables
- **Cursor** — build settings forms, APIs, and authorization guards
- **Claude Code CLI** — accelerate repetitive CRUD + policy wiring across settings entities
- **Loom** — record short walkthroughs of admin flows for async review and QA handoff

---

## Phase 2: Accounting Engine

The financial backbone. POS/Sales/Purchase cannot exist without this.

- Chart of Accounts (CRUD + templates per country/industry)
- Journal entry engine (event-driven, idempotent — all modules post through this)
- Account mappings (event → debit/credit rules, configurable per tenant)
- Tax model (`TaxCode → TaxGroup → TaxRate`, date-effective rates)
- Multi-currency (functional vs transaction currency, automatic FX gain/loss)
- Period control (soft lock for warnings, hard lock for enforcement)
- COGS logic (WAC default, FIFO for batch-tracked items)
- COA template seeding per country + industry combination

**Tools to use in this phase (and when):**
- **Linear** — manage accounting engine milestones by risk level (journals, locks, tax, FX)
- **Cursor** — implement posting engine and accounting rules with tight test loops
- **Claude Code CLI** — generate and refactor multi-module posting/mapping logic faster
- **Loom** — share accounting scenario demos (postings, reversals, period lock behavior)

---

## Phase 3: Inventory Engine

The item and stock backbone. Transaction modules read catalog, prices, and stock from here.

- Item model (flat items + matrix variants with attributes)
- Location hierarchy (branch → warehouse → zone → bin)
- Stock ledger (perpetual, immutable movement records)
- Cost engine (WAC/FIFO, cost layers per location)
- Stock movements (adjustment, transfer, consumption, assembly)
- Serial / batch tracking
- Pricing engine (price lists, quantity breaks, promotions, date-effective)
- Negative stock control (configurable per location)
- Reorder engine (safety stock, lead times, suggested POs)

**Tools to use in this phase (and when):**
- **Linear** — break inventory work into ledger, costing, movement, and pricing streams
- **Cursor** — implement inventory engine and stock movement validations
- **Claude Code CLI** — accelerate cross-file work for ledger/costing integrations
- **Loom** — demo stock movement and valuation scenarios for fast validation

---

## Phase 4: Transaction Modules (parallel tracks)

POS, Sales, and Purchase have no cross-dependencies — build them in parallel.

### POS
- Register sessions (open / close / shift handover)
- Transaction lifecycle (cart → checkout → payment → receipt)
- Payment methods (cash, card, split tender)
- Returns / exchanges
- Z-report / shift close reconciliation
- Receipt model (thermal print layout, bilingual support for all RTL/LTR locale pairs)
- Offline mode (IndexedDB queue, sync-on-reconnect via background sync)

### Sales
- Customer model (profile, contacts, addresses, credit terms)
- Quotation → Sales Order → Invoice lifecycle
- Credit notes
- Customer payments + AR tracking
- Credit limit enforcement (block/warn on exceed)

### Purchase
- Supplier model (profile, contacts, payment terms)
- Purchase Order → GRN → Purchase Invoice lifecycle
- Landed cost allocation (freight, customs, insurance → item cost)
- Purchase returns / debit notes
- Supplier payments + AP tracking

**Tools to use in this phase (and when):**
- **Linear** — run POS, Sales, and Purchase as parallel tracks with shared dependency checks
- **Cursor** — build transaction UIs/workflows and integration tests
- **Claude Code CLI** — handle large multi-file implementations in parallel tracks
- **Loom** — capture end-to-end transaction demos for stakeholder feedback

---

## Phase 5: Onboarding System

Orchestrates Settings/Admin configuration for new tenants. Depends on Settings entities existing.

- Multi-step questionnaire UI (business info, locations, accounting, tax, team, POS, data)
- Configuration pipeline (questionnaire answers → Settings/Admin entity creation)
- COA + tax template seeding (driven by country + industry selection)
- Manual CSV/Excel import (products, customers, suppliers — no AI yet)
- Go-live checklist (validates all required configuration is complete)
- Team invitation flow (bulk invite with role assignment)

**Tools to use in this phase (and when):**
- **Linear** — model onboarding as checklist-driven tasks with explicit done criteria
- **Cursor** — implement questionnaire UX, mapping rules, and validation flows
- **Claude Code CLI** — speed up import pipeline and orchestration logic work
- **Cal.com** — schedule onboarding calls with pilot customers during activation

---

## Phase 6: Dashboard + Reports + Search

Read-only consumers of all prior modules. Built last because they need data to display.

**Dashboard:**
- Role-based default views (owner, accountant, cashier, warehouse)
- KPI widgets (revenue, cash flow, stock alerts, AR/AP aging)
- Work queue (pending approvals, open tasks)
- Alert feed (from agents, system events)

**Report Engine:**
- Report definition builder (columns, filters, grouping, formulas)
- Query engine with pre-aggregation for performance
- Pre-built report templates per module (P&L, balance sheet, trial balance, stock valuation, sales summary, purchase summary)
- Export pipeline (PDF, Excel, CSV)
- Report scheduling (BullMQ jobs + Resend email delivery)

**Search:**
- Meilisearch integration (products, customers, suppliers, transactions)
- Multilingual tokenization: Arabic, English, Hindi (Phase 2), Malay (Phase 2)
- Searchable `name` and `nameAlt` fields for bilingual entity discovery
- Federated search across entity types

**Tools to use in this phase (and when):**
- **Linear** — track dashboard/report/search work as separate read-model tracks
- **Cursor** — build KPI widgets, report builders, and search integration
- **Claude Code CLI** — accelerate report template generation and query wiring
- **Vercel Analytics** — monitor dashboard/report frontend performance once deployed to preview/prod

---

## Phase 7: AI Layer

Layered on top of a working ERP. AI enhances — it doesn't replace core functionality.

- FastAPI AI service + plugin registry
- AI Import Assistant (LLM-powered column mapping, validation suggestions)
- HSN Copilot v1 (natural language queries only — "show me X")
- Accounting Guardian + Inventory Sentinel (event-driven anomaly detection)
- Compliance Watcher + Onboarding Coach
- Suggestion card system + feedback loop (accept/dismiss/rate)
- Socket.io WebSocket gateway for real-time delivery (replaces Supabase Realtime)

**Tools to use in this phase (and when):**
- **Linear** — prioritize AI features only after deterministic core acceptance is complete
- **Cursor** — implement AI integration points, safety boundaries, and feedback UX
- **Claude Code CLI** — execute larger plugin/agent refactors and integration work
- **Loom** — record AI behavior reviews to align on safety and usefulness

---

## Phase 8: GTM & Launch

Product is feature-complete. Now make it sellable and reliable.

- Landing page / marketing site
- Stripe billing integration (plans, trial → paid conversion, usage metering)
- Trial lifecycle automation (welcome email → usage nudges → expiry warning → grace period → deletion)
- Custom subdomains (`tenant.hsn.com`)
- Onboarding polish (UX edge cases, error handling, loading states)
- Load testing (k6: POS throughput, concurrent tenant isolation)
- Security audit (OWASP top 10, auth flows, tenant isolation verification)
- Production deployment + monitoring dashboards

**Tools to use in this phase (and when):**
- **Linear** — run launch readiness checklist (billing, security, performance, reliability)
- **Cal.com** — coordinate live demos and onboarding slots with early customers
- **Typefully** — schedule product updates/threads for X during launch window
- **Later** or **Buffer** — schedule Instagram/social distribution of launch content
- **Loom** — publish product walkthroughs and release notes asynchronously
- **Vercel Analytics** — watch live frontend performance and conversion behavior post-launch

---

## Future Phases (post-launch)

| Area | Items |
|---|---|
| AI Enhancements | Copilot Actions (form pre-fill, workflow guidance), Opening Balance AI Import, agent threshold learning per tenant |
| Compliance | ZATCA e-invoicing (KSA), MyInvois (Malaysia) |
| Mobile | iOS/Android app (POS + approvals) |
| New Modules | Bank reconciliation, HR & Payroll, CRM & Loyalty, E-commerce |
| Platform | Public API / marketplace, white-label program |
| Migration | Merpec customer migration tooling |
| **Localization** | Hindi (`hi`) and Malay (`ms`) translations (Phase 2); Indonesian (`id`), Filipino (`tl`), Vietnamese (`vi`) translations (Phase 3); community translation contribution workflow |

---

## Recommended Tools by Phase (When to Use)

| Tool | Phase(s) | When to use |
|---|---|---|
| **Linear** | 0-8 | Always-on execution system for epics, dependencies, acceptance criteria, and launch checklists |
| **Cursor** | 0-7 | Primary implementation IDE for daily coding, reviews, and refactors |
| **Claude Code CLI** | 0-7 | Multi-file implementation bursts, scaffolding, and complex cross-module changes |
| **Raycast** | 0-4 | Fast context switching across GitHub, Linear, and terminal during heavy build phases |
| **Loom** | 1-8 | Async demos of workflows, risk areas, and release updates |
| **Vercel Analytics** | 6-8 | Observe frontend performance and user behavior once dashboard and GTM surfaces are live |
| **Cal.com** | 5, 8 | Book onboarding calls and launch demos with early customers |
| **Typefully** | 8 | Schedule launch and product education threads on X |
| **Later** or **Buffer** | 8 | Schedule launch/supporting social content distribution |

---

## Recommended Voltagent Subagents by Phase

Use this matrix as the default staffing/orchestration pattern for each phase.

| Phase | Technical subagents (primary) | Business/Product subagents (primary) | Orchestration and governance |
|---|---|---|---|
| **0 — Dev Environment & Infrastructure** | `platform-engineer`, `devops-engineer`, `deployment-engineer`, `docker-expert`, `database-administrator`, `postgres-pro`, `typescript-pro`, `sql-pro` | `project-manager` | `agent-organizer`, `multi-agent-coordinator`, `task-distributor`, `context-manager`, `error-coordinator` |
| **1 — Settings & Admin** | `backend-developer`, `api-designer`, `frontend-developer`, `ui-designer`, `nextjs-developer`, `react-specialist`, `typescript-pro`, `sql-pro` | `business-analyst`, `product-manager`, `ux-researcher`, `legal-advisor` | `code-reviewer`, `architect-reviewer`, `technical-writer` |
| **2 — Accounting Engine** | `backend-developer`, `api-designer`, `typescript-pro`, `sql-pro`, `postgres-pro`, `fintech-engineer` | `business-analyst`, `risk-manager`, `compliance-auditor`, `legal-advisor` | `code-reviewer`, `architect-reviewer`, `qa-expert`, `test-automator` |
| **3 — Inventory Engine** | `backend-developer`, `api-designer`, `typescript-pro`, `sql-pro`, `postgres-pro`, `database-optimizer` | `business-analyst`, `risk-manager`, `product-manager` | `qa-expert`, `test-automator`, `performance-engineer`, `code-reviewer` |
| **4 — POS/Sales/Purchase** | `fullstack-developer`, `frontend-developer`, `backend-developer`, `nextjs-developer`, `react-specialist`, `websocket-engineer`, `typescript-pro`, `sql-pro` | `business-analyst`, `product-manager`, `ux-researcher`, `sales-engineer` | `qa-expert`, `test-automator`, `accessibility-tester`, `code-reviewer`, `debugger` |
| **5 — Onboarding System** | `fullstack-developer`, `frontend-developer`, `backend-developer`, `nextjs-developer`, `react-specialist`, `sql-pro`, `typescript-pro` | `customer-success-manager`, `business-analyst`, `project-manager`, `ux-researcher` | `technical-writer`, `qa-expert`, `test-automator` |
| **6 — Dashboard/Reports/Search** | `frontend-developer`, `backend-developer`, `data-engineer`, `data-analyst`, `search-specialist`, `postgres-pro`, `database-optimizer`, `typescript-pro` | `product-manager`, `business-analyst`, `customer-success-manager` | `performance-engineer`, `qa-expert`, `code-reviewer` |
| **7 — AI Layer** | `ai-engineer`, `llm-architect`, `prompt-engineer`, `python-pro`, `nlp-engineer`, `backend-developer`, `websocket-engineer`, `mlops-engineer` | `risk-manager`, `compliance-auditor`, `business-analyst`, `product-manager` | `security-auditor`, `penetration-tester`, `architect-reviewer`, `error-detective` |
| **8 — GTM & Launch** | `deployment-engineer`, `devops-engineer`, `sre-engineer`, `security-engineer`, `performance-engineer`, `payment-integration`, `nextjs-developer` | `content-marketer`, `customer-success-manager`, `sales-engineer`, `product-manager`, `project-manager`, `seo-specialist`, `legal-advisor` | `incident-responder`, `devops-incident-responder`, `knowledge-synthesizer`, `performance-monitor` |

### Cross-phase specialists (activate when relevant)

- **Architecture/API patterns:** `microservices-architect`, `graphql-architect` (only if GraphQL scope is confirmed)
- **Developer productivity:** `build-engineer`, `dependency-manager`, `tooling-engineer`, `dx-optimizer`, `git-workflow-manager`, `refactoring-specialist`
- **Quality/security escalation:** `security-auditor`, `penetration-tester`, `compliance-auditor`, `chaos-engineer`
- **Domain acceleration:** `api-documenter`, `technical-writer`, `fintech-engineer`, `risk-manager`
