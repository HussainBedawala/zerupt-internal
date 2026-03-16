---
name: neon-postgres
description: Neon Serverless Postgres patterns for Zerupt — project setup, branching for dev/CI, connection pooling, Prisma integration, pgvector, and cost optimization. Use when working with Neon projects, databases, branches, migrations, or connection strings.
---

# Neon Serverless Postgres

Neon is Zerupt's production Postgres provider. It separates compute and storage, offering branching, autoscaling, scale-to-zero, and instant restore.

## Zerupt Neon Architecture

| Resource | Purpose |
|----------|---------|
| Project: `Zerupt` | Production Neon project (Singapore region) |
| Branch: `main` | Production data |
| Branch: `dev` | Local development |
| Branch: `shadow` | Prisma shadow DB for migration validation |
| Database: `zerupt_admin` | Central Admin DB (tenant registry, billing, user-tenant mapping) |
| Per-tenant DBs | Provisioned via Neon API at onboarding (Phase 5) |

## Connection Strings

Neon provides two connection string formats:

- **Pooled** (for app runtime): hostname contains `-pooler` suffix — uses PgBouncer
- **Direct** (for Prisma migrations): no `-pooler` — required for `prisma migrate dev`

```env
# Pooled — used by NestJS app at runtime
DATABASE_ADMIN_URL="postgresql://user:pass@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/zerupt_admin?sslmode=require"

# Direct — used by Prisma CLI for migrations
DATABASE_ADMIN_DIRECT_URL="postgresql://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/zerupt_admin?sslmode=require"
```

## Prisma Integration

Both `packages/db-admin/` and `packages/db/` schemas must use `directUrl`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_ADMIN_URL")
  directUrl = env("DATABASE_ADMIN_DIRECT_URL")
}
```

The `prisma.config.ts` must load both URLs from the root `.env`.

## Branching Workflow

### Development
- `dev` branch = local development — point `.env` `DATABASE_ADMIN_URL` here
- Branch from `main` for isolated feature work if needed

### CI/CD (future)
- GitHub Actions: create Neon branch per PR, run migrations, delete on merge
- Use `neondatabase/create-branch-action@v5` and `neondatabase/delete-branch-action@v3`

### Shadow DB
- `shadow` branch = Prisma shadow database
- Set `SHADOW_DATABASE_URL` to the shadow branch's direct connection string
- Prisma uses this to validate migration replay from scratch

## Neon Local Development (Docker replacement)

Neon replaces Docker Postgres for local dev. Use `neondatabase/neon_local` Docker image if you need offline access:

```yaml
db:
  image: neondatabase/neon_local:latest
  ports:
    - '5432:5432'
  environment:
    NEON_API_KEY: ${NEON_API_KEY}
    NEON_PROJECT_ID: ${NEON_PROJECT_ID}
    PARENT_BRANCH_ID: ${PARENT_BRANCH_ID}
```

## pgvector

Enabled on all Neon databases by default. Activate per-database:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Used in tenant DBs for AI features (NLQ, anomaly detection, import assist).

## Key Neon MCP Tools

When the Neon MCP server is connected, use these tools:

- `create_project` — Create new Neon project
- `create_branch` — Create branch (dev, shadow, per-PR)
- `run_sql` — Execute SQL on any branch
- `get_connection_string` — Get pooled/direct URLs
- `describe_branch` — Check branch status
- `prepare_database_migration` / `complete_database_migration` — Migration workflow

## Cost Optimization

- **Scale to zero**: idle computes suspend after 5 min (free tier)
- **Branching is free**: copy-on-write, no data duplication
- **Egress**: use `neon-postgres-egress-optimizer` skill for query optimization
- **Column selection**: never `SELECT *`, always specify columns
- **Pagination**: always `LIMIT` + cursor-based pagination

## Fetching Neon Docs

Any Neon doc page can be fetched as markdown:
- Append `.md` to URL: `https://neon.com/docs/introduction/branching.md`
- Docs index: `https://neon.com/docs/llms.txt`

## Related

- Agent: `database-reviewer` — Full database review workflow
- Skill: `postgres-patterns` — General PostgreSQL patterns
- Skill: `database-migrations` — Migration best practices
- Skill (plugin): `neon-postgres-egress-optimizer` — Egress cost optimization
