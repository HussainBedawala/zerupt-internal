# Architecture Decisions — Tenant Isolation

## The Core Principle

Every customer gets their own **separate PostgreSQL database**. Not shared tables with row-level security. Not schemas within the same DB. A completely separate database with its own tables, its own data, its own migrations. Customer A literally cannot see Customer B's database.

## Three Options Evaluated

### Option A: Row-Level Security (shared database)

All tenants share one database. Every table has a `tenant_id` column. PostgreSQL RLS policies filter rows per request.

| Aspect | Detail |
|--------|--------|
| Isolation | Logical only — one misconfigured policy = data leak |
| Cost at 1,000 tenants | ~$5/month (one DB) |
| Complexity | High — RLS policies on every table, every query must set context |
| Risk | One bug in any RLS policy exposes all tenants' data |

**Rejected:** Too risky for financial/ERP data. One RLS bug could expose invoices, bank details, tax records across tenants.

### Option B: Branch-per-tenant (Neon branches)

Each tenant gets a Neon branch — separate compute endpoint, copy-on-write storage.

| Aspect | Detail |
|--------|--------|
| Isolation | Full — separate compute + storage |
| Cost at 1,000 tenants | ~$1,500/month ($1.50/branch after 10 included) |
| Complexity | Medium — Neon API per tenant, separate connection strings |
| Scale limit | 5,000 branches per project |

**Rejected:** $1.50/tenant/month kills unit economics for a bootstrapped SaaS targeting price-sensitive MENA/SEA/India retailers. At 1,000 tenants, branch overhead alone is $1,485/month before compute or storage.

### Option C: Database-per-tenant on shared compute (CHOSEN)

Each tenant gets a separate PostgreSQL database on the same Neon branch. All databases share one compute endpoint.

| Aspect | Detail |
|--------|--------|
| Isolation | Full database isolation — separate tables, separate data |
| Cost at 1,000 tenants | ~$20/month (storage only, ~50MB/tenant × $0.35/GB) |
| Complexity | Low — `CREATE DATABASE`, standard connection strings |
| Scale limit | Practically unlimited (PostgreSQL handles thousands of databases) |

**Chosen because:**
- True isolation: each tenant has a separate PostgreSQL database
- Cost-effective: all databases share one Neon compute endpoint, $0 branch overhead
- Simple: `tenant_databases` table stores `dbHost`, `dbPort`, `dbName` per tenant — all pointing to the same host with different `dbName`
- The `tenantId` column on every table is defense-in-depth (belt AND suspenders), not the primary isolation mechanism

## The Noisy Neighbor Tradeoff

Shared compute means one tenant running a heavy query can temporarily affect others.

**Why this is acceptable:**
1. Neon autoscales up to 16 CU on Launch plan under load
2. Target market (MENA/SEA/India retailers) runs small, fast queries — POS transactions, invoices, stock lookups
3. ERP workloads are OLTP (many small reads/writes), not OLAP (few massive analytical queries)
4. Scale-to-zero means idle tenants cost nothing in compute

**The escape hatch:** If a large enterprise tenant needs guaranteed resources, create a separate **Neon project** for them (not a branch — a whole new project with its own compute). The `tenant_databases` table already supports this — just store a different `dbHost`. No code changes needed. This becomes a premium plan feature: "Dedicated Compute."

## Cost Comparison at Scale

| Tenants | Branch-per-tenant | Database-per-tenant (chosen) |
|---------|------------------|------------------------------|
| 10 | $0 (included) | $0 |
| 50 | $60/month | ~$1/month |
| 200 | $285/month | ~$4/month |
| 1,000 | $1,485/month | ~$18/month |
| 5,000 | $7,485/month | ~$88/month |

Database-per-tenant storage cost: ~50MB/tenant × $0.35/GB-month. Compute cost is shared and scales to zero when idle.

## Neon Project Structure

```
Neon Project: Zerupt (restless-hill-33464873)
Region: ap-southeast-1 (Singapore — close to MENA + SEA)
Branch: production (default, primary)

Databases on production branch:
├── zerupt_admin           ← Central Admin DB (tenant registry, plans, routing)
├── zerupt_admin_shadow    ← Prisma shadow DB for admin migration validation
├── zerupt_tenant_dev      ← Local development tenant
├── zerupt_tenant_demo     ← First production demo tenant (DEV-218)
├── zerupt_tenant_{code}   ← Future: one per customer
└── ...
```

All databases share the same compute endpoint (pooler + direct). Connection details per tenant are stored in `tenant_databases` in the admin DB.
