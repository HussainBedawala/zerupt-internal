---
title: Tech Stack
description: Implementation-facing stack reference for AI agents. Source of truth for major technical choices.
updated: 2026-06-07
---

## TL;DR (10 Critical Decisions)

1. Frontend is `Next.js 16.1.6 + React 19` on Vercel; backend is `NestJS` on Railway.
2. Architecture is a **modular monolith first**, with extraction only when scaling pressure is proven.
3. Auth is **centralized Supabase Auth**; JWT includes `tenant_id` for backend routing.
4. Multi-tenancy uses **one PostgreSQL database per tenant** plus a **Central Admin DB** for platform metadata.
5. Tenant DB connections resolved by middleware + cache, injected as tenant-scoped Drizzle instances.
6. Background jobs use **pg-boss on Neon** (zero-polling, ^10.4.2); Upstash Redis for cache only.
7. AI follows a **plugin contract** (`name`, `description`, `invoke`, `health`) and uses LiteLLM for provider portability.
8. Vector search uses **pgvector inside each tenant DB** (no separate vector platform by default).
9. Reporting is JSON-defined (`ReportDefinition`) executed via tenant-safe SQL, pre-aggregation, and export pipelines.
10. Security baselines are non-negotiable: strict tenant isolation, immutable audit logs, dynamic RBAC, staged CI/CD with migration safety.

---

## 1) Architecture Snapshot

```
┌──────────────────────────────────────────────────────┐
│                  Vercel (CDN/Edge)                    │
│   Next.js 16.1.6 (React 19) — UI · SSR · Middleware  │
└────────────────────┬─────────────────────────────────┘
                     │ REST API
┌────────────────────┼─────────────────────────────────┐
│              Railway (Containers)                     │
│  NestJS Modular Monolith (apps/api)                   │
│  ┌──────┐ ┌──────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ POS  │ │Sales │ │Purchase  │ │Inventory / Acctg │ │
│  └──────┘ └──────┘ └──────────┘ └──────────────────┘ │
│  ┌─────────────────────────────────────────────────┐  │
│  │  AI/Agent module → pg-boss workers (see §5)     │  │
│  └─────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────┐  │
│  │  TenantContextMiddleware · WebSocket/Socket.io  │  │
│  └──────────────────────┬──────────────────────────┘  │
│  FastAPI AI Service (apps/ai) — plugin execution      │
└────────────────────┬────────────────────────────────-─┘
                     │
┌────────────────────┼─────────────────────────────────┐
│              Database Layer                           │
│  Central Admin DB (Neon)   Per-Tenant DBs (Neon)      │
│  tenants · plans ·         one Postgres per tenant    │
│  subscriptions · jobs      + pgvector per tenant      │
│  Supabase Auth (JWT)       Supabase Storage (S3)      │
└──────────────────────────────────────────────────────┘
```

**Summary:**

| Layer | Hosting | Tech |
|---|---|---|
| Frontend | Vercel | Next.js 16.1.6 + React 19 |
| API | Railway | NestJS modular monolith |
| AI service | Railway | FastAPI + LiteLLM |
| Jobs/queue | Neon (pg-boss) | pg-boss ^10.4.2 — zero-polling |
| Cache | Upstash | Redis (@upstash/redis) |
| Auth + files | Supabase | Supabase Auth + Storage |
| Databases | Neon | Admin DB + per-tenant DBs + pgvector |

---

## 2) Monorepo Structure

```
erp/
├── apps/
│   ├── web/        # Next.js frontend
│   ├── api/        # NestJS modular monolith
│   └── ai/         # FastAPI AI service
├── packages/
│   ├── shared/     # Types, constants, Zod schemas
│   ├── db/         # Drizzle schema — tenant DBs
│   ├── db-admin/   # Drizzle schema — central admin DB
│   ├── tenant-context/  # tenant router + request context
│   └── ui/         # shared UI components
└── turbo.json
```

---

## 3) Core Stack by Layer

### Frontend

| Tool | Version | Purpose |
|---|---|---|
| Next.js | 16.1.6 | App shell, SSR, routing, middleware |
| React | 19 | UI |
| TypeScript | strict | Typing |
| shadcn/ui + Tailwind | v4 | Accessible UI; CSS logical properties for RTL (no tailwindcss-rtl) |
| TanStack Query | ^5 | Server-state caching |
| Zustand | ^5 | Local UI state |
| next-intl | ^4.8.3 | i18n: locale routing, translations. Launch: `ar`, `en` |
| IBM Plex Sans / Mono | — | Latin, Arabic, Devanagari (same family) + monospace |
| React Hook Form + Zod | — | Form validation |

### Backend

| Tool | Version | Purpose |
|---|---|---|
| NestJS | ^11 | ERP domain modules + APIs |
| Drizzle ORM | ^0.45 | ORM/migrations — admin + tenant DBs |
| NestJS EventEmitter | — | Cross-module side effects |
| pg-boss | ^10.4.2 | Job queue on Neon Postgres — zero-polling workers |
| @upstash/redis | ^1.36 | Cache only (not queue) |
| FastAPI | 0.136 | AI plugin execution, LLM orchestration |

### AI Service (FastAPI / Python)

| Tool | Version | Purpose |
|---|---|---|
| FastAPI | 0.136.3 | Plugin server |
| LiteLLM | 1.86.2 | Provider-portable LLM routing |
| pgvector | 0.3.2 | Vector ops inside tenant DBs |
| pydantic | 2.x | Validation |

---

## 4) Auth + Tenant Routing (Critical Path)

**Supabase Auth** (single centralized project) — JWT carries `tenant_id`.

Request flow:
1. User logs in → Supabase Auth issues JWT with `tenant_id` claim.
2. NestJS `TenantContextMiddleware` validates token, extracts tenant.
3. Middleware resolves tenant DB connection (Redis cache → Central Admin DB fallback).
4. Request gets tenant-scoped Drizzle instance injected via `TENANT_DB` DI token.
5. Domain modules execute without embedding tenancy logic.

---

## 5) Agent Architecture

> **Canonical spec:** `agent-os/product/ai-engine/` (redesigned 2026-06-07 — Zee + named team).
> The old BullMQ worker / named-service list in this doc is superseded. Read the ai-engine spec.

Key decisions:
- Agents run as **pg-boss workers** (not BullMQ, not FastAPI) — business DB access + deterministic rules.
- FastAPI called only when agent needs LLM inference.
- **AI cost philosophy:** deterministic-first → learn/cache → route by task (Haiku for extraction, Sonnet for reasoning). LLM is the last rung.

---

## 6) Infra & Integrations

### Hosting

| Service | Responsibility |
|---|---|
| Vercel | Next.js frontend |
| Railway | NestJS API + FastAPI AI (port 8080) |
| Supabase | Auth (JWT, users, MFA) + Storage (S3) |
| Neon | All Postgres — admin DB + per-tenant DBs + pgvector + pg-boss queue |
| Upstash | Redis cache |

### Payments

- Stripe (global) · Tap / MyFatoorah (GCC) · Razorpay (India)

### Observability + Exports

- Sentry · PostHog · Resend · Socket.io (live notifications) · Puppeteer + ExcelJS (export stack)

---

## 7) Reporting

`ReportDefinition` JSON contract: `entity`, `columns`, `filters`, `groupings`, `calculations`, `sort`, `visualization`.

Pipeline: UI builds definition → stored as JSON → query builder compiles tenant-safe SQL → nightly pre-aggregations via pg-boss → render table/chart/KPI → export PDF/Excel/CSV → schedule via cron + Resend.

---

## 8) Security Baseline

- Dedicated DB per tenant (hard isolation) + `tenantId` on entities for defense-in-depth.
- Centralized JWT auth with refresh rotation; MFA roadmap.
- API hardening: rate limits, input validation, CORS.
- Encryption: TLS in transit, encrypted-at-rest secrets.
- Immutable audit log for data/permission mutations.
- Dynamic RBAC per tenant (not hardcoded global roles).
- Module entitlement enforced in API middleware.

---

## 9) Testing + CI/CD

| Layer | Tooling | Scope |
|---|---|---|
| Unit | Vitest (web) / Jest (api) / pytest (ai) | Pure logic |
| Integration | Supertest + Drizzle test instances | Module + DB |
| E2E | Playwright | Critical user/business flows |
| Load | k6 | POS/report throughput |

**Coverage:** 80%+ general · 100% financial/accounting · 100% auth/security.

Delivery: `push → lint + typecheck + test + build → preview deploy` → `release → full tests → production deploy`.

---

## 10) Non-Negotiable Principles

1. Modular monolith first; extract only when scaling pressure proves it.
2. API-first contracts; frontend is a consumer.
3. Multi-tenant by default via tenant context routing.
4. Event-driven side effects between modules (NestJS EventEmitter).
5. JSON metadata for configurable behavior (reports, dashboards, permissions).
6. Managed services over custom infrastructure.
7. Region-ready from day one (GCC/India/SEA — tax, COA, currency, compliance).
8. Native-language-first: full ar/en from day one, proper RTL/LTR via CSS logical properties.
