# Study: Cloud Services Setup (DEV-12, DEV-16)

Concepts behind what was built. Study these between dev sessions.

---

## 1. JWT & Custom Claims

**What:** JSON Web Tokens (JWTs) are signed tokens that carry claims (key-value data). Supabase issues them on login. NestJS validates and reads them on every request.

**Why it matters:** We inject `tenant_id` into the JWT so NestJS knows which DB to connect to — without hitting the DB on every request just to look up the tenant.

**How it works:**
- User logs in → Supabase Auth runs `custom_access_token_hook` → Postgres function reads `user_tenant_map` → adds `tenant_id` to `app_metadata` → JWT is signed and returned
- NestJS `TenantContextMiddleware` decodes the JWT, extracts `tenant_id`, routes to correct Prisma client

**Resources:**
- [JWT.io — interactive JWT decoder](https://jwt.io)
- [Supabase: Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)
- [What is app_metadata vs user_metadata?](https://supabase.com/docs/guides/auth/managing-user-data)

---

## 2. Row Level Security (RLS)

**What:** A Postgres feature that adds WHERE clauses automatically to every query based on policies you define. Supabase Storage uses it to control file access.

**Why it matters:** Instead of checking permissions in application code (which can have bugs or be bypassed), RLS enforces it at the database level — even if you write bad code, the DB won't leak data.

**How our storage RLS works:**
```sql
-- Only allows access if the first folder in the path matches your tenant_id from JWT
(storage.foldername(name))[1] = (auth.jwt()->'app_metadata'->>'tenant_id')
```
So `tenant-abc/products/img.jpg` is only accessible by users whose JWT has `tenant_id = tenant-abc`.

**Resources:**
- [Supabase: RLS Guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Postgres RLS docs](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

---

## 3. Supabase Storage Architecture

**What:** Supabase Storage is a managed S3-compatible file store. Files go to S3 under the hood; metadata (bucket, path, owner, size) is stored in Postgres `storage.objects`. RLS policies run against that Postgres table.

**Bucket types:**
- **Public** — anyone can read without auth (good for CDN assets like logos)
- **Private** — requires auth + RLS policy to access (our `tenant-assets` is private)

**Path convention we use:** `{tenant_id}/{module}/{filename}`
- Example: `abc-123/products/shoe-photo.jpg`
- Example: `abc-123/receipts/invoice-99.pdf`

**Resources:**
- [Supabase Storage Overview](https://supabase.com/docs/guides/storage)
- [Storage Buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets)

---

## 4. Environment Variables & Secret Tiers

**The three tiers of Supabase keys:**

| Key | Safe to expose? | Used by |
|-----|----------------|---------|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (browser) | Next.js frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | No — server only | NestJS backend (bypasses RLS) |
| `SUPABASE_JWT_SECRET` | No — server only | NestJS JWT verification |

**Why the service role key is dangerous:** It bypasses ALL RLS. If leaked, anyone can read/write any tenant's data. Keep it only in server env vars, never in frontend code.

**Resources:**
- [Supabase: API Keys](https://supabase.com/docs/guides/api/api-keys)
- [12-factor app: Config](https://12factor.net/config)

---

## 5. Error Tracking with Sentry

**What:** Sentry captures unhandled exceptions and performance traces across all services. Each service (NestJS, Next.js, FastAPI) has its own DSN (Data Source Name) — a URL that identifies which Sentry project to send events to.

**Why it matters:** In production you can't attach a debugger. Sentry gives you the full stack trace, request context, user info, and a timeline of events leading up to the crash — without logging everything manually.

**Key concepts:**
- **DSN** — unique URL per project, identifies where to send errors. Never mix DSNs across services.
- **tracesSampleRate** — what % of requests to trace for performance. `1.0` = 100% (dev only), `0.1` = 10% (production). High rates = high cost.
- **instrument.ts must be imported first** — Sentry patches Node.js internals at startup. If anything imports before it, those modules won't be instrumented.
- **Source maps** — uploaded to Sentry so stack traces show your original TypeScript, not minified JS. Only upload in production builds.

**How our setup works:**
```
NestJS: instrument.ts → imported at top of main.ts before NestJS bootstrap
Next.js: sentry.client.config.ts (browser) + sentry.server.config.ts (Node) + sentry.edge.config.ts (Edge Runtime)
FastAPI: sentry_sdk.init() called at module load before app = FastAPI(...)
```

**Resources:**
- [Sentry: NestJS Setup](https://docs.sentry.io/platforms/javascript/guides/nestjs/)
- [Sentry: Next.js Setup](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry: FastAPI Setup](https://docs.sentry.io/platforms/python/integrations/fastapi/)
- [Understanding tracesSampleRate](https://docs.sentry.io/platforms/javascript/configuration/sampling/)

---

## 6. Product Analytics with PostHog

**What:** PostHog tracks user behaviour — which features are used, where users drop off, session replays, feature flags. Unlike Sentry (errors), PostHog answers "what are users doing?"

**Why it matters as a solo founder:** You need to know if users are actually using what you built. PostHog replaces Google Analytics + Mixpanel + LaunchDarkly in one tool. Feature flags let you ship to 10% of users before rolling out to everyone.

**Key concepts:**
- **Project token (`phc_xxx`)** — public, safe in frontend. Identifies your PostHog project.
- **`person_profiles: "identified_only"`** — only creates a person profile after you call `posthog.identify(userId)`. Cheaper and privacy-friendly.
- **`capture_pageview: false`** — disable automatic pageview capture because Next.js is a SPA. You manually track route changes instead (added in DEV-17 when next-intl routing is set up).
- **EU vs US hosting** — we use `eu.i.posthog.com` for MENA data residency compliance. Data never leaves EU servers.

**Resources:**
- [PostHog: Next.js Integration](https://posthog.com/docs/libraries/next-js)
- [PostHog: Feature Flags](https://posthog.com/docs/feature-flags)
- [PostHog: Person Profiles](https://posthog.com/docs/data/persons)

---

## 7. Redis: Upstash vs Local Docker

**What:** Redis is an in-memory key-value store. We use it for two things: BullMQ job queues (async background jobs) and tenant connection caching (avoid DB lookup on every request).

**Upstash vs standard Redis:**
| | Docker Redis (local) | Upstash Redis (prod) |
|-|---------------------|---------------------|
| Connection | TCP socket (persistent) | HTTP REST (stateless) |
| Client | ioredis / `REDIS_URL` | `@upstash/redis` / REST URL + token |
| Cost | Free (self-hosted) | Pay per request |
| Good for | BullMQ (needs TCP) | Serverless, caching, edge |

**Why two different clients:**
- **BullMQ** uses `ioredis` under the hood — it needs a persistent TCP connection, so it uses `REDIS_URL` (the `rediss://` format)
- **Tenant connection cache** (DEV-28) will use `@upstash/redis` HTTP client — stateless, works in any environment, uses `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

**`rediss://` vs `redis://`:** The double-s means TLS encrypted. Always use `rediss://` in production.

**Resources:**
- [Upstash: Getting Started](https://upstash.com/docs/redis/overall/getstarted)
- [BullMQ: Redis connection](https://docs.bullmq.io/guide/connections)
- [Upstash: @upstash/redis vs ioredis](https://upstash.com/docs/redis/sdks/ts/overview)

---

## 8. Search with Meilisearch

**What:** Meilisearch is a full-text search engine. You index documents (products, customers, etc.) and it returns relevant results instantly with typo tolerance, filters, and ranking.

**Why not just use Postgres ILIKE?**
- `ILIKE '%shoe%'` does a full table scan — slow at scale
- Meilisearch pre-builds inverted indexes — searches in <50ms even with millions of records
- Built-in: typo tolerance, faceted filtering, multilingual (Arabic + English), relevance ranking

**Key concepts:**
- **Index** — like a table, but optimised for search. Each entity type (products, customers) gets its own index.
- **Master key** — full admin access. Used to create search-only keys. Never expose in frontend.
- **Search-only key** — read-only, safe to use in browser. Create via API before Phase 6.
- **Sync strategy** — Meilisearch is NOT your source of truth. Postgres is. You sync to Meilisearch after writes (via BullMQ job or NestJS event).

**Resources:**
- [Meilisearch: Quick Start](https://www.meilisearch.com/docs/learn/getting_started/quick_start)
- [Meilisearch: API Keys](https://www.meilisearch.com/docs/reference/api/keys)
- [Meilisearch: Index Settings](https://www.meilisearch.com/docs/reference/api/settings)
