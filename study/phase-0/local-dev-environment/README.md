# Study: Local Dev Environment

Concepts behind DEV-10 — Docker Compose for Zerupt local dev.

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
