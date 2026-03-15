# Neon Serverless Postgres

Study topics from DEV-215: Create Neon project and provision admin database.

---

## 1. Neon Architecture — Separation of Compute and Storage

**What:** Neon decouples PostgreSQL compute (the query engine) from storage (the data pages), connected via a custom WAL-based protocol.

**Why it matters:** This is what enables Neon's killer features — instant branching, scale-to-zero, and copy-on-write database copies. For Zerupt, it means per-tenant databases can be created in milliseconds (vs minutes with traditional Postgres) and cost nothing when idle.

**How it works:**
- **Pageserver** stores data pages and serves them to compute on demand
- **Safekeepers** replicate WAL for durability (similar to a distributed WAL archive)
- **Compute** is a standard Postgres instance that starts/stops on demand
- When a query needs a page not in local cache, compute fetches it from pageserver over the network
- This is why cold-start queries can be slower (page fault over network), but subsequent queries are fast

**Resources:**
- [Neon Architecture Overview](https://neon.tech/docs/introduction/architecture-overview)
- [Neon's Storage Engine (blog)](https://neon.tech/blog/architecture-decisions-in-neon)

---

## 2. Connection Pooling — Pooled vs Direct URLs

**What:** Neon provides two connection endpoints per database — a PgBouncer-pooled URL (with `-pooler` suffix) and a direct URL.

**Why it matters:** Using the wrong URL for the wrong purpose causes cryptic failures. Prisma Migrate needs direct connections (DDL uses prepared statements that PgBouncer doesn't support in transaction mode). App runtime should use pooled connections to handle concurrent requests efficiently.

**Key concepts:**
- **Pooled** (`-pooler` hostname): PgBouncer in transaction mode. Each SQL transaction gets a server connection, then releases it. Good for serverless/high-concurrency workloads. Cannot run `CREATE DATABASE`, `PREPARE`, or `SET` commands that persist across transactions.
- **Direct** (no `-pooler`): Dedicated Postgres connection. Required for migrations, DDL, `LISTEN/NOTIFY`, advisory locks. Limited by compute's `max_connections` (default ~100).
- Prisma 7+ requires connection URLs in `prisma.config.ts`, not in `schema.prisma`

```
# Pooled (app runtime)
postgresql://user:pass@ep-xyz-pooler.region.aws.neon.tech/db?sslmode=require

# Direct (migrations)
postgresql://user:pass@ep-xyz.region.aws.neon.tech/db?sslmode=require
```

**Resources:**
- [Neon Connection Pooling Docs](https://neon.tech/docs/connect/connection-pooling)
- [Prisma with Neon Guide](https://neon.tech/docs/guides/prisma)

---

## 3. Neon Branching — Copy-on-Write Database Copies

**What:** Neon branches are instant, zero-copy database clones that share storage pages with their parent until modified.

**Why it matters:** This is the core mechanism for Zerupt's per-tenant database strategy. Instead of `CREATE DATABASE` (which copies all data), a branch is created instantly via the Neon API. Each branch gets its own compute endpoint that scales to zero independently.

**How it works:**
- Branching creates a new pointer to the parent's page set (copy-on-write)
- Only modified pages are stored separately — storage cost is proportional to delta, not total size
- Each branch has its own compute endpoint (can be different size)
- Branches can be created from any point in the parent's history (point-in-time restore)
- Use case: create a "tenant template" branch with base schema + seed data, then branch from it for each new tenant

```bash
# Create a branch via Neon API
POST /projects/{project_id}/branches
{
  "branch": {
    "parent_id": "br-template-branch-id",
    "name": "tenant-acme-corp"
  }
}
```

**Resources:**
- [Neon Branching Docs](https://neon.tech/docs/introduction/branching)
- [Neon Branching Best Practices](https://neon.tech/docs/guides/branching-intro)

---

## 4. Scale-to-Zero — Compute Lifecycle

**What:** Neon computes automatically suspend after a configurable idle period (default: 5 minutes, configurable to 0 = immediate) and resume on the next connection.

**Why it matters:** For Zerupt with hundreds of tenants, most tenant databases will be idle most of the time. Scale-to-zero means you only pay for active tenants. A tenant that logs in once a day costs nearly nothing in compute.

**Key concepts:**
- **Suspend timeout:** How long after the last query before compute suspends (0 = immediate, 300 = 5 min)
- **Cold start:** First connection after suspension takes ~500ms-2s (compute starts + page cache warms)
- **Autoscaling:** Compute scales between min/max CU (compute units) based on load
- **Always-on option:** For latency-sensitive databases (e.g., admin DB), set min CU > 0 to prevent suspension
- Zerupt's admin DB: consider min 0.25 CU (always warm) since it's hit on every request for tenant routing

**Resources:**
- [Neon Autoscaling Docs](https://neon.tech/docs/introduction/autoscaling)
- [Neon Compute Lifecycle](https://neon.tech/docs/introduction/compute-lifecycle)

---

## 5. pgvector on Neon — Vector Search in Postgres

**What:** pgvector is a Postgres extension that adds vector data types and similarity search operators (cosine, L2, inner product) with index support (IVFFlat, HNSW).

**Why it matters:** Zerupt's AI layer (Phase 7) uses pgvector inside each tenant DB for natural language queries, anomaly detection, and report assistance. Having it in-database means no external vector service, no data sync, and tenant isolation comes for free.

**Key concepts:**
- `CREATE EXTENSION vector` — one command, available on all Neon databases
- `vector(1536)` column type stores embeddings (dimension matches your model — OpenAI ada-002 = 1536)
- HNSW index for approximate nearest neighbor search (fast, good recall)
- Neon runs pgvector 0.8.0 which supports HNSW + quantization for lower memory usage

**Resources:**
- [pgvector on Neon](https://neon.tech/docs/extensions/pgvector)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
