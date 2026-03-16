# Zerupt — System Design Architecture

> **Single Source of Truth** | Last updated: 2026-03-04
>
> This document defines the system architecture for Zerupt, designed for 3 scale levels:
> Level 1 (1 user / MVP), Level 2 (100 users), Level 3 (100,000 users).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Core Foundation Layer](#2-core-foundation-layer)
3. [Application Layer](#3-application-layer)
4. [Data Layer](#4-data-layer)
5. [AI / Agent Layer](#5-ai--agent-layer)
6. [Infrastructure & Deployment](#6-infrastructure--deployment)
7. [Security](#7-security)
8. [Scale Levels](#8-scale-levels)
9. [Data Flow Diagrams](#9-data-flow-diagrams)
10. [Production Infrastructure](#10-production-infrastructure)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                      │
│  Next.js 15 (Vercel) │ POS Offline (IndexedDB) │ Mobile (Future)   │
└──────────────┬──────────────────────┬───────────────────────────────┘
               │ HTTPS                │ WebSocket
               ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    EDGE & CDN (Vercel)                               │
│  Edge Middleware: Auth │ Locale (RTL/LTR) │ Region Routing │ CDN    │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  API GATEWAY (NestJS on Railway)                     │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ TenantContextMiddleware → JWT → tenant_id → DB resolution   │    │
│  │ RBAC Guards → Dynamic permissions per tenant                │    │
│  │ Audit Trail Interceptor → Immutable mutation log            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌─────┐ ┌───────┐ ┌────────┐          │
│  │Accounting│ │Inventory │ │ POS │ │ Sales │ │Purchase│          │
│  └──────────┘ └──────────┘ └─────┘ └───────┘ └────────┘          │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌───────┐ ┌──────┐       │
│  │Onboarding│ │ Reports  │ │Dashboard│ │Agents │ │Search│       │
│  └──────────┘ └──────────┘ └─────────┘ └───────┘ └──────┘       │
│                                                                     │
│  EventEmitter2 (in-process event bus)                               │
│  Socket.io Gateway (real-time notifications)                        │
└──────┬──────────────┬───────────────────┬───────────────────────────┘
       │              │                   │
       ▼              ▼                   ▼
┌──────────┐  ┌──────────────┐  ┌─────────────────────────────────────┐
│ FastAPI  │  │   BullMQ     │  │           DATA LAYER                │
│ AI Svc   │  │   Workers    │  │                                     │
│ (Railway)│  │  (Upstash    │  │  Central Admin DB (Supabase PG)     │
│          │  │   Redis)     │  │  Per-Tenant DBs (Supabase → Neon)   │
│ LiteLLM  │  │              │  │  Redis Cache (Upstash)              │
│ Plugins: │  │  Agents      │  │  Search (Meilisearch)               │
│ - Copilot│  │  Provisioning│  │  Storage (Supabase S3)              │
│ - NLQ    │  │  Reports     │  │  Vector (pgvector per tenant)       │
│ - Import │  │  Email       │  │                                     │
│ - Anomaly│  │  Migration   │  └─────────────────────────────────────┘
└──────────┘  └──────────────┘
                                  ┌─────────────────────────────────────┐
                                  │        AUTH (Supabase Auth)          │
                                  │  JWT: { tenant_id, role_ids }       │
                                  │  JWKS verification in NestJS        │
                                  │  Multi-tenant user mapping          │
                                  └─────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Hosting |
|-------|-----------|---------|
| Frontend | Next.js 15 + React 19, shadcn/ui, Tailwind, next-intl | Vercel |
| Backend API | NestJS modular monolith | Railway |
| AI Service | FastAPI + LiteLLM | Railway |
| Auth | Supabase Auth | Supabase |
| ORM | Drizzle ORM (→ Neon serverless driver at L3) | — |
| Central Admin DB | PostgreSQL | Supabase |
| Tenant DBs | PostgreSQL + pgvector | Supabase → Neon at scale |
| Cache / Queues | Redis + BullMQ | Upstash |
| Search | Meilisearch | Railway |
| Real-time | Socket.io | Railway (NestJS) |
| Storage | S3-compatible | Supabase Storage |
| Observability | Sentry + PostHog + Uptime Kuma | SaaS / Railway |
| Payments | Stripe (global), Tap/MyFatoorah (GCC), Razorpay (India) | SaaS |
| Email | Resend | SaaS |
| Export | Puppeteer + ExcelJS + @react-pdf/renderer | Railway |

---

## 2. Core Foundation Layer

### 2.1 Authentication & Authorization Flow

```
Browser → Supabase Auth (login) → JWT issued
  JWT payload: {
    sub: "user-uuid",
    email: "user@company.com",
    app_metadata: {
      tenant_id: "tenant-uuid",
      role_ids: ["role-uuid-1"],
      active_branch_id: "branch-uuid"
    }
  }
  → Next.js Edge Middleware validates JWT, rejects expired/missing
    → NestJS TenantContextMiddleware:
       1. Verify JWT signature (Supabase JWKS)
       2. Extract tenant_id from app_metadata
       3. Resolve tenant DB connection:
          a. Redis: GET tenant:conn:{tenant_id} (TTL 5 min)
          b. Miss → Central Admin DB: SELECT connection_string FROM tenant_databases
          c. Cache in Redis
       4. Get or create tenant-scoped Drizzle instance (AsyncLocalStorage)
       5. RBAC Guard: load role permissions (Redis cache → tenant DB fallback)
       6. Check @RequiresPermission('module.entity.action') decorator
```

**RBAC enforcement:**
- Permission key format: `{module}.{entity}.{action}` (e.g., `sales.order.create`)
- Permissions loaded from Redis (`tenant:rbac:{user_id}`, TTL 5 min)
- Invalidated on role change event
- Module entitlement guard checks subscription plan includes the module

### 2.2 Multi-Tenancy Routing & Connection Pooling

```typescript
// TenantConnectionService (NestJS singleton)
class TenantConnectionService {
  private pool: Map<string, { client: DrizzleInstance; lastUsed: Date }>;
  private maxPoolSize: number; // L1: 10, L2: 100, L3: 2000 (LRU)

  async getClient(tenantId: string): Promise<DrizzleInstance> {
    // 1. Check in-memory pool
    // 2. If found and < 10 min idle: return, update lastUsed
    // 3. If missing: resolve from Redis/AdminDB, create Drizzle instance
    // 4. If pool full: evict least-recently-used client
  }

  // Runs every 60s: disconnect clients idle > 10 min
  @Cron('*/60 * * * * *')
  evictStale() { ... }
}
```

**Level 3 shift:** Replace Drizzle direct connections with Neon serverless driver (HTTP-based, stateless queries). Eliminates the Drizzle instance pool problem entirely. Each query is a single HTTP request through Neon's infrastructure.

### 2.3 Event Bus Design

NestJS `EventEmitter2` — in-process, synchronous within the monolith.

```typescript
// Shared event contract (packages/shared/events)
interface DomainEvent {
  eventType: string;          // 'sales.invoice.confirmed'
  tenantId: string;
  payload: Record<string, unknown>;
  metadata: {
    userId: string;
    timestamp: string;
    correlationId: string;    // traces event chain
    source: string;           // originating module
  };
}
```

**Cross-module event flow example:**
```
SalesModule.confirmInvoice()
  → emit('sales.invoice.confirmed')
    → AccountingModule → posts journal entry (DR Receivable, CR Revenue, CR Tax)
    → InventoryModule → decrements stock, updates cost layers
    → ComplianceWatcher → validates tax configuration
    → SearchIndexer → updates Meilisearch index
```

Listener failures are caught, logged to Sentry, and do not roll back the source transaction. The audit trail records the source event for manual replay if needed.

### 2.4 API Routing

No dedicated API gateway service. Vercel Edge Middleware handles routing.

```
NestJS route structure:
  /api/v1/accounting/*     → AccountingModule
  /api/v1/inventory/*      → InventoryModule
  /api/v1/pos/*            → POSModule
  /api/v1/sales/*          → SalesModule
  /api/v1/purchase/*       → PurchaseModule
  /api/v1/settings/*       → SettingsModule
  /api/v1/onboarding/*     → OnboardingModule
  /api/v1/reports/*        → ReportModule
  /api/v1/dashboard/*      → DashboardModule
  /api/v1/copilot/*        → proxied to FastAPI AI service
  /api/v1/agents/*         → AgentModule (suggestion CRUD)
  /api/v1/search/*         → SearchModule (Meilisearch proxy)
```

---

## 3. Application Layer

### 3.1 Module Boundaries

```
apps/api/src/modules/
  settings/       # Tenant config, RBAC, branches, tax, currency, doc numbering
  accounting/     # COA, journals, period control, year-end, bank recon
  inventory/      # Items, stock ledger, cost engine, pricing, serial/batch
  pos/            # Register sessions, transactions, payments, offline sync
  sales/          # Customers, quotes, orders, invoices, credit notes, AR
  purchase/       # Suppliers, POs, GRNs, purchase invoices, AP
  onboarding/     # Questionnaire, config pipeline, provisioning, import
  reports/        # Report definitions, query engine, export, scheduling
  dashboard/      # KPI aggregation, work queue, widget data
  agents/         # Background agent services, suggestion CRUD
  copilot/        # Copilot proxy to FastAPI, conversation history
  notifications/  # Socket.io gateway, notification preferences
  search/         # Meilisearch sync service
  tenant/         # TenantConnectionService, TenantContextMiddleware
  auth/           # JWT validation, RBAC guards, user-tenant resolution
```

**Cross-module rules:**
- Communicate via events (EventEmitter2) or direct service injection for sync reads
- No module imports another module's repository/entity directly
- Shared contracts in `packages/shared` (event types, DTOs, Zod schemas)

### 3.2 Request Lifecycle

```
1. HTTP request → NestJS
2. TenantContextMiddleware: JWT validation → tenant DB resolution → Drizzle instance in AsyncLocalStorage
3. ValidationPipe (Zod schemas via nestjs-zod)
4. RBAC Guard (@RequiresPermission)
5. Module entitlement guard (subscription plan check)
6. Controller → Service (business logic) → Repository (tenant Drizzle instance)
7. Domain events emitted (EventEmitter2)
8. Audit trail interceptor logs mutation
9. Response serialized and returned
```

### 3.3 Background Job Processing

```
BullMQ queues (Upstash Redis backend):

  Agent queues:
    agent:accounting-guardian     # Nightly balance checks, period readiness
    agent:inventory-sentinel      # Weekly slow-moving, monthly dead stock
    agent:compliance-watcher      # Daily rate expiry, filing deadlines
    agent:onboarding-coach        # Daily adoption checks

  System queues:
    tenant:provisioning           # New tenant DB creation + migration
    tenant:migration              # Rolling tenant DB schema migrations
    reports:scheduled             # Scheduled report generation + email
    reports:export                # PDF/Excel generation
    search:reindex                # Meilisearch full/partial reindex
    notifications:email           # Resend email delivery
    suggestions:expiry            # Hourly suggestion card expiry check
```

**Worker model:**
- L1/L2: Workers run in the same NestJS process
- L3: Dedicated Railway worker services per region, consuming regional queues

**Tenant iteration for batch agents:**
```typescript
async processAllTenants(agentFn: (db: DrizzleInstance) => Promise<void>) {
  const tenants = await adminDb.query.tenants.findMany({ where: eq(tenants.status, 'ACTIVE') });
  for (const tenant of tenants) {
    const client = await tenantConnectionService.getClient(tenant.id);
    try { await agentFn(client); }
    catch (err) {
      Sentry.captureException(err, { extra: { tenantId: tenant.id } });
    }
  }
}
```

### 3.4 Agent Execution Pipeline

```
Trigger (event or cron)
  → Agent service method with tenant Drizzle instance
    → Rule-based check (pure business logic, no LLM)
      → If anomaly detected:
        → [Optional] POST to FastAPI for natural language explanation
        → SuggestionService.createSuggestion() → INSERT suggestion_cards
          → Socket.io emit to tenant room → frontend notification badge
```

### 3.5 Real-Time (Socket.io)

```
NestJS WebSocket Gateway:
  - Client connects with JWT → gateway validates, extracts tenant_id
  - Joins room: tenant:{tenant_id}
  - User-specific room: tenant:{tenant_id}:user:{user_id}

Events:
  suggestion:new         → new suggestion card
  suggestion:expired     → auto-expired card
  notification:system    → system alerts
  pos:sync:complete      → offline transaction synced
  import:progress        → data import progress
  onboarding:step        → onboarding pipeline progress
```

---

## 4. Data Layer

### 4.1 Database Strategy

**Central Admin DB** (single Supabase PostgreSQL):
```sql
tenants (id, name, slug, status, plan, region, created_at)
tenant_databases (id, tenant_id, connection_string, region, status, db_provider)
subscriptions (id, tenant_id, plan, stripe_sub_id, status, current_period_end)
user_tenant_map (user_id, tenant_id, role_ids[], is_primary, invited_at)
provisioning_jobs (id, tenant_id, status, step, error, started_at, completed_at)
platform_config (key, value)  -- feature flags, global settings
```

**Per-Tenant DB** (one PostgreSQL per tenant):
- All business entities (items, customers, journals, invoices, POS transactions, etc.)
- `suggestion_cards` — agent-generated suggestions
- `audit_trail` — immutable append-only log
- `copilot_conversations` — conversation history
- `embeddings` — pgvector (1536 dims) for RAG, import mapping, anomaly patterns

### 4.2 Connection Pooling Strategy

| Level | Strategy | Max Connections |
|-------|----------|-----------------|
| L1 (1 user) | Direct Drizzle (default pool of 5) | ~5 |
| L2 (100 users) | Supabase Supavisor + LRU Drizzle instance cache (max 100) | ~1,000 |
| L3 (100K users) | Neon serverless driver (HTTP, stateless) or PgBouncer per region | ~200 actual per region |

At L3, the Neon serverless driver eliminates the need for persistent connection pools. Each query is an HTTP request. Alternative: `drizzle-orm/neon-serverless` with Neon's WebSocket pooler.

### 4.3 Caching Strategy (Upstash Redis)

```
L1: tenant:conn:{tenant_id}          → connection string (TTL 5 min)
L2: tenant:config:{tenant_id}        → serialized settings (TTL 10 min)
L3: tenant:rbac:{user_id}            → permission set (TTL 5 min)
L4: tenant:items:{tenant_id}:page:*  → paginated catalog (TTL 2 min)
L5: copilot:session:{session_id}     → conversation context (TTL 24h)
L6: rate:api:{tenant_id}:{endpoint}  → rate limit counter (TTL 1 min)
L7: rate:agent:{tenant_id}:{agent}   → daily suggestion count (TTL midnight)
L8: dashboard:kpi:{tenant_id}        → pre-computed KPIs (TTL 5 min)
```

Invalidation is event-driven: `settings.updated` → invalidate L2/L3 for that tenant.

### 4.4 Search (Meilisearch)

- Tenant-prefixed indexes: `{tenant_id}:items`, `{tenant_id}:customers`, etc.
- Multilingual tokenization (Arabic + English)
- Real-time sync via domain events; weekly full reindex via BullMQ
- Tenant isolation via Meilisearch tenant tokens (per-tenant API keys)
- L3: multiple Meilisearch instances per region, or migrate to Typesense Cloud

### 4.5 Vector Storage (pgvector)

```sql
-- Per-tenant DB
CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(100),  -- 'help_article', 'transaction_pattern'
  entity_id UUID,
  embedding VECTOR(1536),    -- text-embedding-3-small
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

Use cases: Copilot RAG, import column mapping, anomaly pattern similarity.

### 4.6 File Storage (Supabase Storage)

```
Bucket: tenant-{tenant_id}/
  imports/       → uploaded CSVs/Excel
  exports/       → generated PDFs/Excel
  receipts/      → POS receipt archives
  attachments/   → user-uploaded files
  logos/         → company logos

Access: Supabase Storage policies enforce tenant_id from JWT. Signed URLs (1h TTL). Max file: 50MB.
```

---

## 5. AI / Agent Layer

### 5.1 Copilot Request Flow

```
User: "Show me top 10 products last month"
  → POST /api/v1/copilot/message { message, sessionId, screenContext }
    → NestJS validates JWT, resolves tenant
      → Forward to FastAPI: POST /copilot/invoke
        → Intent classification (LLM): "NLQ" (confidence 0.94)
        → NLQPlugin: LLM generates ReportDefinition JSON
        → Validates against table/column whitelist
      → NestJS ReportQueryEngine executes against tenant DB (read-only role)
      → Format results (table/chart/text)
      → Store conversation in Redis (session) + Postgres (history)
    → Return { response, suggestedFollowups }
```

**Action requests** ("Create customer: Al-Rashid Trading, KW"):
→ ActionPlugin generates pre-filled form JSON → frontend navigates to form → user confirms.

### 5.2 FastAPI AI Service

```python
# apps/ai/main.py
Plugin registry:
  copilot     → conversational assistant
  nlq         → natural language → ReportDefinition JSON
  import_assist → column mapping for data imports
  anomaly     → natural language explanation of detected issues
  report_assist → report building from plain language
  reorder     → (future) demand forecasting

LiteLLM integration:
  Default: gpt-4o-mini (fast, cheap, good structured output)
  Complex: gpt-4o (when mini confidence < threshold)
  Embeddings: text-embedding-3-small (1536 dims, $0.02/1M tokens)
  Temperature: 0.1 (deterministic)
  Response format: JSON (structured output)
```

### 5.3 Agent Safety & Rate Limiting

**Safety guarantees:**
- Agents write to `suggestion_cards` ONLY — never mutate business tables
- Every suggestion creation/accept/dismiss logged in audit trail
- Each agent runs against correct tenant DB via TenantConnectionService
- Graceful degradation: if AI service down, use template-based descriptions

**Rate limits:**
| Agent | Max Suggestions/Day/Tenant |
|-------|---------------------------|
| Accounting Guardian | 20 |
| Inventory Sentinel | 30 |
| Compliance Watcher | 10 |
| Onboarding Coach | 5 |
| Copilot | 60 msg/hour/user, 200 msg/day/user |
| FastAPI endpoints | 100 req/min/tenant |

Critical severity suggestions bypass rate limits.

---

## 6. Infrastructure & Deployment

### 6.1 Services Map

| Service | Technology | Hosting | Replicas (L1/L2/L3) |
|---------|-----------|---------|---------------------|
| Frontend | Next.js 15 | Vercel | Edge (global) |
| API | NestJS | Railway | 1 / 2 / 4+ per region |
| AI Service | FastAPI | Railway | 1 / 2 / 4+ per region |
| Workers | NestJS BullMQ | Railway | (in API) / 1 / 2+ per region |
| Search | Meilisearch | Railway | 1 / 1 / 2+ per region |
| Central Admin DB | PostgreSQL | Supabase | 1 / 1 / 1 primary + replicas |
| Tenant DBs | PostgreSQL + pgvector | Supabase → Neon | per tenant |
| Cache/Queues | Redis | Upstash | 1 / 1 / regional |
| Auth | Supabase Auth | Supabase | managed |
| Storage | S3-compatible | Supabase Storage | managed |

### 6.2 CI/CD Pipeline

```
GitHub Actions:

push to any branch:
  1. pnpm install (Turborepo cache)
  2. Lint (ESLint + Prettier)
  3. Type check (tsc --noEmit)
  4. Unit tests (Vitest for TS, pytest for Python)
  5. Build (Turborepo selective)
  6. Preview deploy to Vercel

push to main:
  1. All above + integration tests (Supertest + test DB)
  2. Deploy to Railway (API + AI)
  3. Deploy to Vercel (production)
  4. drizzle-kit migrate on Central Admin DB
  5. Enqueue rolling tenant DB migrations (BullMQ batches of 10)
     - Circuit breaker: 3 consecutive failures → pause + alert
```

### 6.3 Observability

| Tool | Purpose |
|------|---------|
| Sentry | Error tracking, performance monitoring, release tracking |
| PostHog | Product analytics, feature flags, session recording |
| Uptime Kuma (→ BetterStack at L3) | Uptime monitoring, status page |

**Custom metrics:** provisioning success rate, agent accept/dismiss rates, copilot confidence distribution, P95 API latency.

---

## 7. Security

### 7.1 Eight-Layer Tenant Isolation

```
Layer 1: Separate PostgreSQL database per tenant (hard isolation)
Layer 2: tenant_id column on all tables (defense-in-depth)
Layer 3: TenantContextMiddleware validates every request
Layer 4: Tenant-scoped Drizzle instance (cannot query wrong DB)
Layer 5: Supabase Storage policies enforce tenant_id from JWT
Layer 6: Meilisearch tenant tokens (per-tenant API keys)
Layer 7: Socket.io rooms scoped by tenant_id
Layer 8: BullMQ jobs carry tenant_id, workers validate before processing
```

### 7.2 API Security

```
Rate limiting: 1000 req/min/tenant (Upstash Redis sliding window)
CORS: app.zerupt.com, *.zerupt.com, localhost:3000 (dev)
CSP: default-src 'self'; connect-src *.supabase.co *.posthog.com *.sentry.io
Headers: X-Frame-Options DENY, HSTS, X-Content-Type-Options nosniff
TLS 1.3 everywhere (Vercel, Railway, Supabase enforce)
At-rest encryption: AES-256 (Supabase/Neon default)
App-level: sensitive fields encrypted with AES-256-GCM (tenant-specific derived keys)
```

### 7.3 Audit Trail

```sql
CREATE TABLE audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL,    -- CREATE, UPDATE, DELETE, APPROVE
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Append-only: NO UPDATE or DELETE grants
-- Index: (tenant_id, entity_type, created_at)
```

### 7.4 NLQ Safety

- Whitelist of queryable tables/columns per module
- Read-only database role for Copilot
- Parameterized queries only (no string interpolation)
- Confidence < 0.70 → ask clarification; < 0.50 → suggest Report Builder
- Tenant isolation: query executes against dedicated tenant DB

---

## 8. Scale Levels

### Level 1: Single User (MVP) — ~$50-80/mo

**Deploy:**
- 1 Vercel deployment (Next.js)
- 1 Railway service (NestJS API + workers in-process)
- 1 Railway service (FastAPI AI)
- 1 Supabase project (Auth + Central Admin DB + 1 tenant DB + Storage)
- 1 Upstash Redis
- 1 Meilisearch on Railway (512MB volume)

**Skip:** Connection pooling, Redis caching for connections, monitoring dashboards, multi-region, load testing.

**Keep (non-negotiable):** Separate Admin/Tenant DBs, JWT with tenant_id, TenantContextMiddleware, audit trail, RBAC, EventEmitter2, input validation (Zod).

### Level 2: 100 Users (~50-100 tenants) — ~$300-600/mo

**Changes from L1:**
- 50-100 tenant DBs on Supabase/Neon
- Supabase Supavisor connection pooling
- LRU Drizzle instance cache (max 100)
- Full Redis caching (8 layers)
- 2 API replicas + dedicated worker service + 2 AI replicas
- PITR backups, PostHog, Uptime Kuma
- Meilisearch tenant tokens

### Level 3: 100,000 Users (~10K-50K tenants) — ~$15K-40K/mo

**Regional deployment (3 regions):**

```
GCC Region (Bahrain/UAE):
  Railway (API + AI + Workers) → Neon cluster (GCC tenant DBs)
  Upstash Redis (regional) → Meilisearch cluster (2 nodes)

India Region (Mumbai):
  Railway (API + AI + Workers) → Neon cluster (India tenant DBs)
  Upstash Redis (regional) → Meilisearch cluster (2 nodes)

SEA Region (Singapore):
  Railway (API + AI + Workers) → Neon cluster (SEA tenant DBs)
  Upstash Redis (regional) → Meilisearch cluster (2 nodes)

Central:
  Central Admin DB primary (write) + read replicas per region
  Global Upstash Redis (write-through)
```

**Key L3 patterns:**
- **Neon serverless driver** — HTTP-based queries, no persistent pools, scale-to-zero for inactive tenants
- **Regional queue partitioning** — `agent:accounting-guardian:gcc`, `:india`, `:sea`
- **Read replicas** — reports and Copilot NLQ routed to replicas
- **Canary deployments** — new version to 1 of 4 replicas, monitor 30 min, then roll
- **PagerDuty** — P1/P2 alerting with phone escalation

---

## 9. Data Flow Diagrams

### 9.1 Authentication → Tenant Resolution → API Request

```
Browser          Supabase Auth    Vercel Edge    NestJS API    Redis    Central Admin DB    Tenant DB
  │                   │               │              │           │            │                │
  │── login ─────────►│               │              │           │            │                │
  │◄── JWT ───────────│               │              │           │            │                │
  │                   │               │              │           │            │                │
  │── GET /api/v1/sales/orders (Bearer JWT) ────────►│           │            │                │
  │                   │               │              │           │            │                │
  │                   │               │    verify JWT│           │            │                │
  │                   │               │    GET conn ─┼──────────►│            │                │
  │                   │               │    ◄─ HIT ───┼───────────│            │                │
  │                   │               │    (or MISS) │           │            │                │
  │                   │               │    SELECT ───┼───────────┼───────────►│                │
  │                   │               │    ◄─────────┼───────────┼────────────│                │
  │                   │               │              │           │            │                │
  │                   │               │    RBAC check│           │            │                │
  │                   │               │    SELECT orders ────────┼────────────┼───────────────►│
  │                   │               │    ◄─────────┼───────────┼────────────┼────────────────│
  │◄── 200 { orders } ┼───────────────┼──────────────│           │            │                │
```

### 9.2 POS Transaction → Event → Journal Posting

```
POS Frontend    NestJS API       EventEmitter2    AccountingModule    InventoryModule    Tenant DB
  │                │                  │                 │                  │                │
  │── POST /pos/transactions ───────►│                  │                  │                │
  │                │── validate       │                  │                  │                │
  │                │── INSERT ────────┼──────────────────┼──────────────────┼───────────────►│
  │                │── emit('pos.transaction.completed') │                  │                │
  │                │                  │──────────────────►                  │                │
  │                │                  │   build journal: │                  │                │
  │                │                  │   DR Cash/Bank   │                  │                │
  │                │                  │   CR Revenue     │                  │                │
  │                │                  │   CR Tax Payable  │                  │                │
  │                │                  │   DR COGS        │                  │                │
  │                │                  │   CR Inventory   │                  │                │
  │                │                  │   INSERT journals┼──────────────────┼───────────────►│
  │                │                  │──────────────────┼─────────────────►│                │
  │                │                  │                  │    decrement stock│               │
  │                │                  │                  │    UPDATE stock   ┼───────────────►│
  │◄── 201 ────────│                  │                  │                  │                │
```

### 9.3 Agent Pipeline → Suggestion Card

```
BullMQ Cron    NestJS Worker    Tenant DB    FastAPI AI    Socket.io    Frontend
  │                │                │            │             │            │
  │── trigger ────►│                │            │             │            │
  │                │── get tenants  │            │             │            │
  │                │── for each:    │            │             │            │
  │                │   SELECT SUM(dr), SUM(cr) FROM journals ►│            │
  │                │   ◄────────────│            │             │            │
  │                │   IF imbalance:│            │             │            │
  │                │── POST /anomaly/explain ───►│             │            │
  │                │◄── explanation ─────────────│             │            │
  │                │── INSERT suggestion_cards ──►             │            │
  │                │── emit suggestion:new ──────┼────────────►│            │
  │                │                │            │             │───event───►│
  │                │                │            │             │            │ show badge
```

### 9.4 Copilot NLQ

```
Frontend       NestJS API      FastAPI AI (LiteLLM)    Tenant DB (read replica)
  │                │                    │                       │
  │── POST /copilot/message            │                       │
  │   { "top 10 products last month" } │                       │
  │                │── POST /copilot/invoke                    │
  │                │                    │── intent classify     │
  │                │                    │   → "NLQ" (0.94)     │
  │                │                    │── NLQPlugin:          │
  │                │                    │   LLM → ReportDef    │
  │                │                    │   validate whitelist  │
  │                │◄── { reportDef }   │                       │
  │                │── execute query ───┼───────────────────────►
  │                │◄── results ────────┼────────────────────────
  │                │── format response  │                       │
  │◄── { response, followups }          │                       │
```

### 9.5 Onboarding → Tenant Provisioning

```
Frontend    NestJS API    Central Admin DB    BullMQ    DB Provider (Neon)    FastAPI AI
  │            │                │                │            │                  │
  │── POST /onboarding/start   │                │            │                  │
  │            │── INSERT provisioning_job ─────►│            │                  │
  │◄── { questionnaire } ──────│                │            │                  │
  │                            │                │            │                  │
  │── POST /onboarding/answers │                │            │                  │
  │            │── validate    │                │            │                  │
  │            │── enqueue ────┼────────────────►            │                  │
  │◄── { provisioning }        │                │            │                  │
  │                            │       Worker:  │            │                  │
  │                            │       1. CREATE DB ─────────►                  │
  │                            │       2. drizzle-kit migrate│                  │
  │                            │       3. Seed COA + tax     │                  │
  │                            │       4. Create roles       │                  │
  │                            │       5. INSERT tenant_databases ──►          │
  │                            │       6. UPDATE job → READY │                  │
  │                            │                │            │                  │
  │── Upload CSV (products)    │                │            │                  │
  │            │── POST /import_assist ─────────┼────────────┼─────────────────►
  │            │◄── { column_mapping } ─────────┼────────────┼──────────────────
  │            │── validate + INSERT items      │            │                  │
  │◄── { imported: 500 }       │                │            │                  │
```

---

## 10. Production Infrastructure

### 10.1 Multi-Region Strategy

```
Phase 1 (L1-L2): Single region (US-East or EU-West)
  - All services in one Railway region
  - Vercel CDN handles global frontend delivery
  - Latency to GCC/India/SEA: 150-300ms (acceptable for MVP)

Phase 2 (L3): Three regions
  - GCC: Railway + Neon in me-west-1 or eu-central-1
  - India: Railway + Neon in ap-south-1 (Mumbai)
  - SEA: Railway + Neon in ap-southeast-1 (Singapore)
  - DNS routing: tenant region in Central Admin DB
  - Vercel Edge Middleware rewrites to regional backend
```

### 10.2 Deployment Strategy

- **Vercel**: automatic preview deployments, instant rollback
- **Railway**: rolling deployments with health check gates
- **L3 canary**: new version to 1 of 4 replicas → monitor error rates 30 min → roll or kill

### 10.3 Backup & Recovery

| Provider | Backup | PITR | Retention |
|----------|--------|------|-----------|
| Supabase | Daily automated | WAL archiving | 7 days (Pro), 30 days (Team) |
| Neon | Continuous | Any second | 30 days |
| Central Admin DB | Streaming replication + daily S3 logical backup | Yes | 30 days |

**RPO:** < 1 minute | **RTO:** < 15 minutes

### 10.4 Incident Response

```
P1 (Critical, < 15 min):  API 5xx > 5%, DB unreachable, auth down, payment failures
P2 (High, < 1 hour):      P95 latency > 2s, queue depth > 1000, provisioning failures
P3 (Medium, < 4 hours):   Search sync lag > 30 min, AI degraded (fallback mode)
P4 (Low, next business day): Analytics lag, non-critical job failures

Channels: P1/P2 → PagerDuty + Slack | P3 → Slack | P4 → email digest
```

### 10.5 SLA Targets

| Metric | Target |
|--------|--------|
| API availability | 99.9% (43 min downtime/month) |
| POS availability | 99.95% (offline mode covers gaps) |
| Data durability | 99.999999% (Neon/Supabase) |
| API latency (P95) | < 500ms (< 200ms for POS) |
| Copilot latency (P95) | < 3 seconds |
| Provisioning time | < 5 minutes |
| Backup RPO | < 1 minute |
| Backup RTO | < 15 minutes |
