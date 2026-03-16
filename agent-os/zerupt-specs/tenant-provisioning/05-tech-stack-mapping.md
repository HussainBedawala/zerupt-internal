# Tech Stack Mapping — Where Everything Fits

## During Signup & Provisioning

| Step | Technology | What it does | Where it runs |
|------|-----------|-------------|---------------|
| User clicks "Start Free Trial" | **Next.js 16** | Renders marketing site + signup page | Vercel |
| Account creation | **Supabase Auth** | Creates user, hashes password, issues JWT (ES256) | Supabase cloud |
| Tenant record creation | **NestJS** + **Prisma** | Writes tenant/plan/subscription to admin DB | Railway |
| Admin DB storage | **Neon PostgreSQL** | `zerupt_admin` — tenant registry, plans, routing | Neon (ap-southeast-1) |
| Job enqueue | **BullMQ** | Adds provisioning job to Redis queue | Railway (NestJS) |
| Job queue | **Upstash Redis** | Stores BullMQ job payload (UUIDs only, no PII) | Upstash cloud |
| Database creation | **Neon PostgreSQL** | `CREATE DATABASE zerupt_tenant_{code}` | Neon |
| Schema migration | **Prisma Migrate** | `prisma migrate deploy` — creates all tables | Railway → Neon |
| Password encryption | **Node.js crypto** | AES-256-GCM with key versioning | Railway (NestJS) |
| Identity seeding | **Prisma** (tenant DB) | Upserts TenantIdentity with locale defaults | Railway → Neon |
| Status finalization | **Prisma** (admin DB) | Transaction: Ready + Active + Completed | Railway → Neon |
| JWT tenant_id injection | **Supabase Admin API** | Sets `app_metadata.tenant_id` on user | Railway → Supabase |
| Welcome event | **NestJS EventEmitter** | Emits `tenant.provisioned` for downstream listeners | Railway |
| Frontend polling | **TanStack Query** | Polls provisioning status every 1-2s | Browser → Railway |
| Progress UI | **React 19** + **shadcn/ui** | Shows "Setting up your workspace..." screen | Browser (Vercel) |

## During Every API Request (Runtime)

| Step | Technology | What it does | Where it runs |
|------|-----------|-------------|---------------|
| HTTP request | **Next.js** (frontend) | Sends API call with Bearer JWT | Vercel → Railway |
| ALS boundary | **Node.js AsyncLocalStorage** | Creates request-scoped tenant container | Railway (NestJS) |
| JWT verification | **jose** library | Verifies ES256 signature via JWKS endpoint | Railway |
| Connection cache check | **Upstash Redis** | Checks if tenant connection details are cached (5-min TTL) | Railway → Upstash |
| HMAC integrity | **Node.js crypto** | Verifies cache entry wasn't tampered with (SHA-256) | Railway |
| Admin DB fallback | **Prisma** (admin DB) | Queries `tenant_databases` on cache miss | Railway → Neon |
| Password decryption | **Node.js crypto** | AES-256-GCM decryption with versioned keys | Railway |
| Connection pool | **TenantConnectionService** | LRU cache of PrismaClient instances (max 50) | Railway (in-memory) |
| Tenant DB query | **Prisma** (tenant DB) | Executes business query against tenant's database | Railway → Neon |
| Response | **NestJS** | Returns JSON response | Railway → Vercel → Browser |

## During Normal ERP Usage

| Feature | Technology | What it does |
|---------|-----------|-------------|
| UI rendering | **React 19** + **shadcn/ui** + **Tailwind** | Components, RTL/LTR layout |
| RTL support | **CSS logical properties** + `tailwindcss-rtl` | `margin-inline-start` instead of `margin-left` |
| Translations | **next-intl v4** | Arabic + English, locale routing (`/ar/`, `/en/`) |
| Number/currency formatting | **Intl APIs** | Eastern Arabic digits for Arabic, Indian grouping for Hindi |
| Server state | **TanStack Query** | Caches API responses, handles stale/refresh |
| Client state | **Zustand** | Sidebar state, filters, UI preferences |
| Forms | **React Hook Form** + **Zod** | Validation contracts shared with backend |
| File uploads | **Supabase Storage** | Product images, documents (tenant-prefixed buckets) |
| Search | **Meilisearch** | Full-text search (products, customers, transactions) |
| Background jobs | **BullMQ** + **Upstash Redis** | Report generation, email, scheduled tasks |
| Email | **Resend** | Transactional emails (invoices, password resets) |
| Error tracking | **Sentry** | Catches + alerts on errors (frontend + backend) |
| Product analytics | **PostHog** | Usage tracking, feature flags |
| Audit trail | **Prisma** (tenant DB) | Immutable log of every data mutation |

## The Two Databases

### Central Admin DB (`zerupt_admin`)

The "phone book" — knows who exists and where to find them.

| Table | Purpose |
|-------|---------|
| `tenants` | Tenant registry (code, name, status, plan, owner) |
| `tenant_databases` | Connection details per tenant (host, port, dbName, encrypted password) |
| `plans` | Subscription plan definitions (starter, growth, enterprise) |
| `subscriptions` | Billing state per tenant (trial, active, cancelled) |
| `user_tenant_map` | Maps Supabase users to tenants (a user can be in multiple tenants) |
| `provisioning_jobs` | Tracks provisioning pipeline state (queued → in_progress → completed/failed) |

### Tenant DB (`zerupt_tenant_{code}`)

The customer's private world — all their business data.

| Table Group | Tables | Purpose |
|-------------|--------|---------|
| Identity | `tenant_identity` | Self-record (name, country, timezone, language) |
| Audit | `audit_log` | Immutable log of every mutation |
| RBAC | `roles`, `role_permissions`, `user_roles`, `role_permission_branches` | Dynamic permissions |
| Org Structure | `legal_entities`, `branches`, `warehouses`, `zones`, `bins`, `user_branches` | Physical hierarchy |
| Currency | `currency_policies`, `tenant_currencies` | Multi-currency config |
| Fiscal | `fiscal_settings`, `fiscal_years`, `fiscal_periods` | Accounting calendar |
| Tax | `tax_codes`, `tax_rates`, `tax_groups`, `tax_group_components` | Tax configuration |
| Doc Numbering | `document_sequences`, `sequence_reservations` | Auto-numbering (INV-0001) |
| Future | products, invoices, stock_ledger, journal_entries, ... | Business data (Phase 1+) |

## Visual Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CUSTOMER BROWSER                         │
│  Next.js 16 + React 19 + shadcn/ui + Tailwind + TanStack Query │
│  next-intl (ar/en) + Zustand (UI state)                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS (Bearer JWT)
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    NestJS API (Railway)                           │
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────┐  │
│  │ JWT Auth     │──▶│ Tenant       │──▶│ Business Logic       │  │
│  │ Guard        │   │ Resolver     │   │ (Controllers +       │  │
│  │ (Supabase    │   │ Guard        │   │  Services)           │  │
│  │  ES256 JWKS) │   │ (resolve DB) │   │                      │  │
│  └──────────────┘   └──────┬───────┘   │ getTenantContext()   │  │
│                            │           │  → prismaClient      │  │
│                     ┌──────▼───────┐   └──────────┬───────────┘  │
│                     │ Redis Cache  │              │               │
│                     │ (Upstash)    │              │               │
│                     │ 5-min TTL    │              │               │
│                     │ HMAC-signed  │              │               │
│                     └──────┬───────┘              │               │
│                            │ miss                 │               │
│                            ▼                      ▼               │
│  ┌─────────────────────────────┐  ┌──────────────────────────┐   │
│  │    Central Admin DB         │  │  Tenant DB               │   │
│  │    (Neon — zerupt_admin)    │  │  (Neon — zerupt_tenant_X)│   │
│  │                             │  │                          │   │
│  │  tenants, tenant_databases  │  │  All business data:      │   │
│  │  plans, subscriptions       │  │  products, invoices,     │   │
│  │  user_tenant_map            │  │  stock, accounting,      │   │
│  │  provisioning_jobs          │  │  audit_log, RBAC, tax    │   │
│  └─────────────────────────────┘  └──────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ BullMQ Workers (Upstash Redis)                              │  │
│  │  • Provisioning: CreateDB → Migrate → Seed → MarkReady     │  │
│  │  • Background: reports, email, scheduled tasks              │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘

External Services:
  Supabase Auth  — user accounts, JWT signing, session management
  Supabase Storage — file uploads (tenant-prefixed)
  Meilisearch    — full-text search
  Sentry         — error tracking
  PostHog        — product analytics
  Resend         — transactional email
```
