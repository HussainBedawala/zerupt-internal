# Neon Serverless Postgres

Study topics from DEV-215 and DEV-218: Neon project setup, admin DB, and first tenant DB provisioning.

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

---

## 6. Multi-Tenant Isolation — Database-per-Tenant vs Branch-per-Tenant vs RLS

**What:** Three approaches to tenant isolation on Neon, each with different cost/isolation/complexity tradeoffs.

**Why it matters:** This is the foundational architecture decision for Zerupt's SaaS model. The wrong choice either bleeds money at scale or fails to provide adequate isolation.

**How it works / Key concepts:**

| Approach | Isolation | Cost at 1,000 tenants | Complexity |
|----------|-----------|----------------------|------------|
| **Database-per-tenant (shared compute)** | Full DB isolation, shared compute | ~$20/mo (storage only) | Low — `CREATE DATABASE`, shared Neon endpoint |
| **Branch-per-tenant** | Full DB + compute isolation | ~$1,500/mo ($1.50/branch) | Medium — Neon API per tenant, separate endpoints |
| **Row-Level Security (shared DB)** | Logical isolation via policies | ~$5/mo (one DB) | High — RLS policies on every table, easy to misconfigure |

**Zerupt chose database-per-tenant on shared compute because:**
- True isolation: each tenant has a separate PostgreSQL database — no RLS policies to misconfigure
- Cost-effective: all databases share one Neon compute endpoint, $0 branch overhead
- Simple: `TenantDatabase` table in admin DB stores `dbHost`, `dbPort`, `dbName` per tenant — all pointing to the same Neon host with different `dbName`
- Escape hatch: if a large enterprise tenant needs dedicated compute, create a separate Neon project and store a different `dbHost` — no code changes

**The noisy neighbor tradeoff:** shared compute means one tenant running a heavy query can temporarily affect others. Neon's autoscaling (up to 16 CU on Launch plan) mitigates this. For the target market (MENA/SEA/India retailers), typical ERP operations are small, fast queries — not a practical concern at launch scale.

**Resources:**
- [Neon Multi-Tenancy Guide](https://neon.tech/docs/guides/multi-tenant-apps)
- [PostgreSQL CREATE DATABASE docs](https://www.postgresql.org/docs/current/sql-createdatabase.html)

---

## 7. Tenant DB Password Encryption — AES-256-GCM at Rest

**What:** Tenant database passwords stored in the admin DB's `tenant_databases.db_password_enc` column are encrypted using AES-256-GCM with key versioning for rotation support.

**Why it matters:** The admin DB contains connection credentials for every tenant database. If the admin DB is compromised, an attacker shouldn't be able to connect to tenant DBs directly. Application-layer encryption adds defense-in-depth beyond Postgres's at-rest encryption.

**How it works:**
- **Encryption format:** `enc:v{keyVersion}:{iv}:{ciphertext}:{authTag}` — all hex-encoded
- **AES-256-GCM:** Authenticated encryption — provides both confidentiality (encrypted) and integrity (tamper detection via auth tag)
- **Random IV:** Each encryption generates a unique 12-byte IV, so the same password encrypted twice produces different ciphertext (semantic security)
- **Key versioning:** Ciphertext carries its key version (`v1`, `v2`, etc.). Decryption reads the version from the prefix and fetches the correct key from env vars (`DB_ENCRYPTION_KEY_V1`, `DB_ENCRYPTION_KEY_V2`)
- **Key rotation:** Add a new key env var, set `DB_ENCRYPTION_KEY_CURRENT_VERSION=2`, restart. New encryptions use v2, old ciphertexts still decrypt with v1. No code deploy needed.

```typescript
// Encrypt
const ciphertext = encryptAes256Gcm(password, key, keyVersion);
// → "enc:v1:db72cbe756d4cc9c:949eedb7d449765436bd:b42bff1117fe2c9d"

// Decrypt (reads version from ciphertext, fetches correct key)
const password = decryptAes256Gcm(ciphertext, (v) => getKeyForVersion(v));
```

**Resources:**
- [NIST SP 800-38D — AES-GCM](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [Node.js crypto.createCipheriv](https://nodejs.org/api/crypto.html#cryptocreatecipherivalgorithm-key-iv-options)

---

## 8. Prisma Migrate Deploy vs Dev — Production Migration Strategy

**What:** `prisma migrate deploy` applies pending migrations without generating new ones or using a shadow database. It's the production-safe counterpart to `prisma migrate dev`.

**Why it matters:** When provisioning a new tenant database, you need to apply all existing migrations to bring the schema up to date. Using `migrate dev` in production would try to create a shadow database, run interactively, and potentially generate unwanted migration files.

**Key concepts:**
- **`migrate dev`:** Development only. Creates shadow DB, detects drift, generates new migrations, applies them. Interactive.
- **`migrate deploy`:** Production safe. Applies pending migrations in order, no shadow DB, no generation, exits with error on failure. Non-interactive.
- **Tenant provisioning flow:** `CREATE DATABASE` → `prisma migrate deploy` → seed identity data
- **Migration ordering:** Prisma replays migrations alphabetically by directory name (timestamp-prefixed). A new migration must have a later timestamp than any migration it depends on.

```bash
# Production: apply all migrations to a new tenant DB
DATABASE_URL="postgresql://.../<tenant-db>" npx prisma migrate deploy

# Dev: create + apply a new migration
npx prisma migrate dev --name add_new_table
```

**Resources:**
- [Prisma Migrate Deploy](https://www.prisma.io/docs/orm/prisma-migrate/workflows/deploy-migration)
- [Prisma Production Deployment](https://www.prisma.io/docs/orm/prisma-migrate/workflows/production)
