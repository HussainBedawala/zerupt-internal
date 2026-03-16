# Tenant Provisioning & Database Architecture

How Zerupt provisions a completely isolated database for every customer — from signup to working ERP in under 5 seconds.

## Files

1. `01-architecture-decisions.md` — Database-per-tenant vs alternatives, cost analysis, Neon strategy
2. `02-signup-to-ready-flow.md` — Complete flow from customer signup to working system
3. `03-provisioning-pipeline.md` — The 4-step BullMQ pipeline (CreateDB → Migrate → Seed → MarkReady)
4. `04-request-lifecycle.md` — How every API request routes to the correct tenant database
5. `05-tech-stack-mapping.md` — Where each technology fits in the provisioning and runtime flow

## Key Decisions

- **Database-per-tenant on shared compute** — not branch-per-tenant ($0 vs $1.50/tenant/month), not RLS
- **Async provisioning via BullMQ** — reliable, resumable, retryable (not synchronous HTTP)
- **AES-256-GCM encrypted credentials** — tenant DB passwords encrypted at rest in admin DB
- **AsyncLocalStorage for tenant context** — invisible to business logic, automatic isolation
- **LRU connection pool** — max 50 cached PrismaClient instances, health-checked
- **Redis connection cache with HMAC** — 5-minute TTL, tamper-proof, graceful degradation
