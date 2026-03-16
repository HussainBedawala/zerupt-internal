# Tech Stack

Compact, implementation-facing stack reference for AI agents. This is the source-of-truth for major technical choices.

## TL;DR (10 Critical Decisions)

1. Frontend is `Next.js 15 + React 19` on Vercel; backend is `NestJS` on Railway.
2. Architecture is a **modular monolith first**, with extraction only when scaling pressure is proven.
3. Auth is **centralized Supabase Auth**; JWT includes tenant context for backend routing.
4. Multi-tenancy uses **one PostgreSQL database per tenant** plus a **Central Admin DB** for platform metadata.
5. Tenant DB connections are resolved by middleware + cache, then injected as tenant-scoped Drizzle instances.
6. Background automation uses **BullMQ workers in NestJS**; FastAPI handles AI plugin capabilities.
7. AI follows a **plugin contract** (`name`, `description`, `invoke`, `health`) and uses LiteLLM for provider portability.
8. Vector search uses **pgvector inside each tenant DB** (no separate vector platform by default).
9. Reporting is JSON-defined (`ReportDefinition`) and executed via tenant-safe SQL, pre-aggregation, and export pipelines.
10. Security and delivery baselines are non-negotiable: strict tenant isolation, immutable audit logs, dynamic RBAC, staged CI/CD with migration safety.

---

## 1) Architecture Snapshot

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Vercel (CDN/Edge)                          │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                   Next.js 15 (React 19)                       │  │
│  │          UI · SSR · API Routes · Middleware                    │  │
│  └──────────────────────┬────────────────────────────────────────┘  │
└─────────────────────────┼──────────────────────────────────────────┘
                          │ REST API
┌─────────────────────────┼──────────────────────────────────────────┐
│                    Railway (Containers)                             │
│  ┌──────────────────────┴────────────────────────────────────────┐  │
│  │              NestJS Modular Monolith (apps/api)               │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐           │  │
│  │  │   POS   │ │  Sales  │ │Purchase │ │Inventory │           │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └──────────┘           │  │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────────────────┐           │  │
│  │  │  Acctg  │ │  Auth   │ │  Report Engine       │           │  │
│  │  └─────────┘ └─────────┘ └──────────────────────┘           │  │
│  │  ┌──────────────────────────────────────────────┐            │  │
│  │  │  AgentModule (BullMQ workers)                │            │  │
│  │  │  Accounting Guardian · Inventory Sentinel    │            │  │
│  │  │  Compliance Watcher · Onboarding Coach       │            │  │
│  │  │  SuggestionService                           │            │  │
│  │  └──────────────────────────────────────────────┘            │  │
│  │  ┌──────────────────────────────────────────────┐            │  │
│  │  │  OnboardingModule                            │            │  │
│  │  │  Questionnaire · ConfigPipeline · Provisioning│           │  │
│  │  └──────────────────────────────────────────────┘            │  │
│  │  ┌──────────────────────────────────────────────┐            │  │
│  │  │  TenantContextMiddleware + WebSocket Gateway  │           │  │
│  │  │  Tenant Router · Socket.io                    │           │  │
│  │  └──────────────────────────────────────────────┘            │  │
│  └──────────────────────┬────────────────────────────────────────┘  │
│                         │                                           │
│  ┌──────────────────────┴────────────────────────────────────────┐  │
│  │              FastAPI AI Service (apps/ai)                     │  │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐          │  │
│  │  │   NLQ   │ │Anomaly  │ │ Import   │ │ Report   │          │  │
│  │  │ Plugin  │ │ Plugin  │ │ Assist   │ │ Assist   │          │  │
│  │  └─────────┘ └─────────┘ └──────────┘ └──────────┘          │  │
│  │                  Plugin Registry                              │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬──────────────────────────────────────────┘
                          │
┌─────────────────────────┼──────────────────────────────────────────┐
│                   Database Layer                                    │
│                                                                     │
│  ┌──────────────────────┐  ┌─────────────────────────────────────┐ │
│  │  Central Admin DB    │  │  Per-Tenant Databases               │ │
│  │  (Single Instance)   │  │  (One PostgreSQL per tenant)        │ │
│  │                      │  │                                     │ │
│  │  - tenants           │  │  ┌──────────┐ ┌──────────┐         │ │
│  │  - tenant_databases  │  │  │Tenant A  │ │Tenant B  │ ...     │ │
│  │  - plans             │  │  │+pgvector │ │+pgvector │         │ │
│  │  - subscriptions     │  │  └──────────┘ └──────────┘         │ │
│  │  - user_tenant_map   │  │                                     │ │
│  │  - provisioning_jobs │  │                                     │ │
│  └──────────────────────┘  └─────────────────────────────────────┘ │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐                                │
│  │ Supabase Auth│  │Supabase      │                                │
│  │ (Centralized)│  │Storage (S3)  │                                │
│  │ JWT + tenant │  │Tenant-prefixed│                               │
│  └──────────────┘  └──────────────┘                                │
└────────────────────────────────────────────────────────────────────┘
```

- **Web**: Next.js 15 (React 19) on Vercel
- **Core API**: NestJS modular monolith on Railway
- **AI service**: FastAPI plugin service on Railway
- **Search**: Meilisearch
- **Cache/queues**: Upstash Redis + BullMQ
- **Auth + files**: Supabase Auth + Supabase Storage
- **Databases**:
  - **Central Admin DB**: tenant registry, plans, subscription/billing, tenant DB metadata, user-tenant mapping, provisioning jobs. Full schema: `settings-admin/13-database-architecture.md`.
  - **Per-tenant PostgreSQL DBs** (one DB per tenant): all business data + pgvector + audit trail

### Why modular monolith (not microservices)

1. ERP transactions cross modules by default (sales/inventory/accounting/POS).
2. Solo CTO + fast delivery requires low ops complexity.
3. Per-module pricing is entitlement/RBAC logic, not a service boundary.
4. Future extraction remains possible module-by-module via existing event contracts.

---

## 2) Monorepo Structure (Target)

```txt
erp/
├── apps/
│   ├── web/             # Next.js frontend
│   ├── api/             # NestJS modular monolith
│   └── ai/              # FastAPI AI service
├── packages/
│   ├── shared/          # Shared types/constants/zod schemas
│   ├── db/              # Drizzle schema for tenant DBs
│   ├── db-admin/        # Drizzle schema for central admin DB
│   ├── tenant-context/  # tenant router + request context utilities
│   └── ui/              # shared UI components
├── turbo.json
├── package.json
└── docker-compose.yml   # local redis/meilisearch (DBs on Neon)
```

---

## 3) Core Stack by Layer

### Frontend

| Tool | Purpose |
|---|---|
| Next.js 15 + React 19 | App shell, SSR, routing, middleware |
| TypeScript | Strict typing |
| shadcn/ui + Tailwind | Accessible UI + RTL-ready styling (CSS logical properties) |
| tailwindcss-rtl | RTL utility class variants (`rtl:`, `ltr:`) |
| TanStack Query | Server-state caching and freshness |
| Zustand | Local UI state |
| next-intl | Full i18n: locale routing, translations, formatting. Launch: `ar`, `en`. Phase 2: `hi`, `ms`. See `settings-admin/14-internationalization.md`. |
| Intl APIs | Locale-aware number/currency/date/relative-time formatting |
| Noto Fonts | Arabic, Devanagari, and Latin script support |
| React Hook Form + Zod | Shared form validation contracts |
| @react-pdf/renderer | Client-side PDF (simple docs) |

### Backend

| Tool | Purpose |
|---|---|
| NestJS | ERP domain modules + APIs |
| Drizzle ORM | ORM/migrations for admin + tenant DBs (lightweight, type-safe, first-class pgvector + Neon support) |
| NestJS EventEmitter | Cross-module side effects/events |
| BullMQ + Upstash Redis | Jobs, schedulers, async processing |
| FastAPI | AI plugin execution, LLM orchestration |

---

## 4) Auth + Tenant Routing (Critical Path)

### Decision

- **Supabase Auth (single centralized auth project)** is the default.

### Why over NextAuth

- NestJS APIs need first-class token validation outside Next.js.
- Supabase JWT works across frontend/backend with less custom glue.
- JWT carries `tenant_id` for DB routing and authorization context.

### Request flow

1. User logs in via Supabase Auth and receives JWT (`tenant_id` claim).
2. NestJS `TenantContextMiddleware` validates token and extracts tenant.
3. Middleware resolves tenant DB connection (Redis cache, fallback to Central Admin DB lookup).
4. Request gets tenant-scoped Drizzle instance.
5. Domain modules execute without embedding tenancy logic in every service.

---

## 5) Agent + Onboarding Architecture

### Agent execution model

- Agents run in **NestJS BullMQ workers** (not in FastAPI) because they need business DB access and deterministic rule checks.
- FastAPI is called only when an agent needs LLM-generated explanations or ML-heavy assistance.

### Agent module (NestJS)

- `AccountingGuardianService`
- `InventorySentinelService`
- `ComplianceWatcherService`
- `OnboardingCoachService`
- `SuggestionService` (create/accept/dismiss/rate)

### Onboarding module (NestJS)

- `QuestionnaireService`
- `ConfigPipelineService`
- `TenantProvisioningService`
- `COATemplateService` (industry + country -> full COA)

---

## 6) AI Service Architecture (FastAPI)

### Plugin model

Each plugin implements:

- `name`
- `description`
- `invoke(context, params)`
- `health()`

### Initial plugins

- `NLQPlugin` (natural language -> tenant-scoped SQL)
- `ImportAssistPlugin` (import column mapping)
- `AnomalyPlugin` (abnormal trends)
- `ReorderPlugin` (replenishment suggestions)
- `ReportAssistPlugin` (natural language -> report definition JSON)

### LLM + vector strategy

- **LiteLLM** for provider portability (OpenAI/Anthropic/local).
- **pgvector** inside each tenant DB (no external vector service by default).

---

## 7) Reporting Platform Capability

### ReportDefinition (JSON contract)

Core fields:

- `entity`, `columns`, `filters`, `groupings`, `calculations`, `sort`, `visualization`

### Pipeline

1. UI builds definition
2. JSON stored
3. Query builder compiles tenant-safe SQL + RBAC filters
4. Nightly pre-aggregations via BullMQ
5. Render table/chart/KPI
6. Export PDF/Excel/CSV
7. Schedule via cron jobs + Resend

---

## 8) Infra, Ops, and Integrations

### Hosting

| Service | Responsibility |
|---|---|
| Vercel | Next.js frontend |
| Railway | NestJS API, FastAPI, Meilisearch |
| Supabase | Auth (JWT, users, MFA) + Storage (S3) |
| Neon | All PostgreSQL — admin DB + per-tenant DBs + pgvector |
| Upstash | Redis cache + BullMQ backend |

**Production database architecture (decided March 2026):**

```
Supabase → Auth only (JWT, users, MFA)
Neon     → All PostgreSQL (admin DB + per-tenant DBs + pgvector)
Railway  → Compute only (API + AI + Meilisearch)
Upstash  → Redis (cache + BullMQ)
```

**Why Neon for all databases (not Supabase Postgres):**
- Neon's database-per-tenant model on shared compute costs ~$20/mo for 1,000 tenants
- Scale-to-zero compute means idle tenant DBs cost nothing
- `CREATE DATABASE` works via SQL — no API needed for provisioning
- Pooled (PgBouncer) and direct endpoints per database out of the box
- pgvector supported natively for AI layer (Phase 7)
- Supabase Postgres would require one project per tenant (~$25/tenant/mo) or RLS (complexity risk)

### Payments

- Stripe (global)
- Tap / MyFatoorah (GCC rails)
- Razorpay (India)

### Observability + notifications + exports

- Sentry (errors/perf)
- PostHog (product analytics + feature flags)
- Uptime Kuma (uptime/status)
- Resend (transactional email)
- Socket.io gateway (in-app live notifications/suggestion cards)
- Puppeteer + ExcelJS + @react-pdf/renderer (export stack)

---

## 9) Security Baseline

- Dedicated DB per tenant (hard isolation), plus `tenantId` on entities for defense-in-depth.
- Centralized JWT auth with refresh rotation and MFA roadmap.
- API hardening: rate limits, input validation, CORS.
- Encryption: TLS in transit, encrypted-at-rest credentials/secrets.
- Immutable audit log for data/permission mutations.
- Dynamic RBAC/permissions per tenant (not hardcoded global roles).
- Module entitlement enforced in API middleware.

---

## 10) Testing + CI/CD

### Testing matrix

| Layer | Tooling | Scope |
|---|---|---|
| Unit | Vitest / Jest / pytest | pure logic + calculations |
| Integration | Supertest + Drizzle test instances | module + DB behavior |
| E2E | Playwright | critical user/business flows |
| Load | k6 | POS/report throughput and concurrency |

### Delivery flow

`push -> lint + type-check + test + build -> preview deploy`  
`release -> full tests -> production deploy`

Required controls:

- Turborepo selective caching
- PR preview environments
- Drizzle migrations for admin DB in CI
- Rolling tenant DB migrations in batches with circuit breaker
- Feature flags for gradual rollouts

---

## 11) Non-Negotiable Principles

1. Modular monolith first; extract only when scaling pressure proves it.
2. API-first contracts; frontend is a consumer.
3. Multi-tenant by default via tenant context routing.
4. Event-driven side effects between modules.
5. JSON metadata for configurable behavior (reports, dashboards, permissions).
6. Managed services over custom infrastructure.
7. Region-ready from day one (tax, COA templates, currency, compliance for GCC/India/SEA).
8. Native-language-first: full multilingual support with proper RTL/LTR layouts. See `settings-admin/14-internationalization.md`.
