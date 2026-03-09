# Study: Local Dev Environment

Concepts behind DEV-10 — Docker Compose for Zerupt local dev. DEV-11 — Seed scripts for development data.

---

## 1. Docker & Docker Compose

**What:** Docker packages apps into containers. Compose orchestrates multiple containers with a single file.

**Why it matters:** Every dev (and CI) gets an identical environment. No "works on my machine."

**Resources:**
- [Docker Compose getting started](https://docs.docker.com/compose/gettingstarted/)
- [Docker networking basics](https://docs.docker.com/network/)

---

## 2. PostgreSQL multi-database setup

**What:** One Postgres instance can host multiple databases. We use `zerupt_admin` (platform metadata) and `zerupt_tenant_dev` (dev tenant business data).

**Why it matters:** Mirrors the production architecture where each tenant gets its own DB, provisioned dynamically.

**Resources:**
- [Postgres CREATE DATABASE](https://www.postgresql.org/docs/16/sql-createdatabase.html)
- [docker-entrypoint-initdb.d pattern](https://hub.docker.com/_/postgres#initialization-scripts)

---

## 3. Health checks in Docker Compose

**What:** `healthcheck` tells Docker when a container is truly ready (not just started). Dependent services wait for `healthy` status.

**Why it matters:** Prevents race conditions where your app tries to connect before Postgres is ready.

**Resources:**
- [Docker healthcheck docs](https://docs.docker.com/engine/reference/builder/#healthcheck)
- [Compose depends_on with health](https://docs.docker.com/compose/compose-file/compose-file-v3/#depends_on)

---

## 4. Redis persistence modes

**What:** Redis has two persistence options — RDB (snapshots) and AOF (append-only file). We use AOF (`--appendonly yes`) for better durability.

**Why it matters:** Tenant connection cache data (BullMQ jobs) survives container restarts.

**Resources:**
- [Redis persistence guide](https://redis.io/docs/management/persistence/)

---

## 5. Environment variable management

**What:** `.env.example` documents all required vars; `.env` holds actual values (gitignored). Docker Compose reads `.env` automatically.

**Why it matters:** Secrets never get committed. New devs know exactly what to configure.

**Resources:**
- [Compose environment variables](https://docs.docker.com/compose/environment-variables/)

---

## 6. Prisma seed scripts

**What:** `prisma db seed` runs a script defined in `package.json` under `prisma.seed`. Prisma calls this automatically after `prisma migrate reset`. Use `tsx` (instead of `ts-node`) for faster TypeScript execution with no config overhead.

**Why it matters:** Seed scripts give every developer a known starting state: real-looking plans, a working test tenant, and a user mapping — so you can log in and test without manually inserting rows.

**How it works / Key concepts:**
```json
// package.json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```
- `prisma db seed` — runs seed manually
- `prisma migrate reset` — drops DB, re-runs migrations, then auto-runs seed
- Use `upsert` (not `create`) so seeds are idempotent — safe to re-run without errors

**Resources:**
- [Prisma seeding docs](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding)
- [tsx — TypeScript execute](https://github.com/privatenumber/tsx)

---

## 7. Idempotency in database seeds

**What:** An idempotent operation produces the same result no matter how many times it runs. In seeds, this means `upsert` over `create` — insert if missing, skip if already present.

**Why it matters:** Developers run seeds repeatedly (after resets, in CI, onboarding). A seed that crashes on the second run because a unique constraint fires is useless. Idempotency makes the seed a safe, repeatable tool.

**How it works / Key concepts:**
```typescript
// WRONG — crashes on second run (unique constraint)
await prisma.plan.create({ data: { id: PLAN_ID, slug: "starter", ... } });

// CORRECT — safe to re-run
await prisma.plan.upsert({
  where: { id: PLAN_ID },
  update: {},   // don't overwrite if already exists
  create: { id: PLAN_ID, slug: "starter", ... },
});
```
- Fixed UUIDs as IDs ensure `where: { id }` always finds the same record
- Empty `update: {}` means existing records are left untouched

**Resources:**
- [Prisma upsert docs](https://www.prisma.io/docs/orm/reference/prisma-client-reference#upsert)

---

## 8. Stub / placeholder pattern for blocked dependencies

**What:** When feature B is blocked by feature A (e.g. tenant DB seed blocked by schema creation), create a documented stub — a file that runs successfully, prints a clear message, and explains what needs to be done.

**Why it matters:** Avoids leaving broken or missing files that future developers have to investigate. The stub sets up the `prisma.seed` plumbing (package.json config, script path) so there's zero friction when the blocker is resolved — just fill in the implementation.

**How it works / Key concepts:**
```typescript
// packages/db/prisma/seed.ts
// ⚠️ BLOCKED: schema not defined yet (DEV-25)
async function main() {
  process.stdout.write("Tenant DB seed not yet implemented.\n");
  process.stdout.write("Blocked on: packages/db/prisma/schema.prisma (DEV-25)\n");
}
main().catch((err) => { process.stderr.write(`${String(err)}\n`); process.exit(1); });
```

**Resources:**
- [Stub vs mock vs fake (Martin Fowler)](https://martinfowler.com/articles/mocksArentStubs.html)
