# Zerupt Infra, Cost & Risk Audit — 2026-07-04

Four parallel read-only audits over real production infrastructure (Neon, Railway, Vercel/Sentry/Supabase, codebase cost sweep), triggered by the pre-launch security/performance push. Context: bootstrapped, ~30 days runway, June 15 launch shipped, live POS customers imminent. Nothing was modified.

## Priority queue (fix in this order)

### P0 — Security & correctness (fix now, $0 cost)

1. **drizzle-orm SQL injection (GHSA-gpj5-g38j-94v9)** — CONFIRMED runtime exposure: `apps/api > drizzle-orm` is < 0.45.2 (patched ≥ 0.45.2). This is the ORM every tenant query flows through. Patch + typecheck + test.
2. **AI import-classifier failure cluster** — 4 of top-10 Sentry issues, 71+ events (ZERUPT-AI-1/-2/-4/-8, ZERUPT-API-5): Groq TPM rate limits NOT absorbed by the fallback chain (fallbacks pile onto the same rate-limited Groq tier); stale Fireworks model id (`NotFoundError: Model not found`); ambiguous import-alias error ("account no" → both `code` and `partyCode`). This is the onboarding/import wedge — the core value prop — failing user-visibly.
3. **Unhandled @neondatabase/serverless error (ZERUPT-API-7)** — 17 events, still firing 4 days ago. Uncaught DB-driver error on the POS-critical API = closest silent-outage risk. Likely WebSocket connection drop/timeout not caught (known neon-serverless pooling gotcha).
4. **Rate limiting is OFF right now** — Upstash quota exhausted 2026-06-05; the web auth rate limiter (`apps/web/src/lib/auth/rate-limit.ts`) is fail-open, so signup/resend/forgot-password have been unthrottled for a month (also burns Resend quota). Fix = part of Upstash removal (below).

### P0.5 — Upstash removal (decided; cheap cleanup, not a migration)

BullMQ/ioredis already gone (DEV-388 → pg-boss on Neon). Only two Upstash uses remain, both gracefully degrading:
- **Tenant connection cache** (`packages/tenant-context/src/tenant-cache.ts`, wired in `apps/api/src/tenant/tenant.module.ts`, used by `tenant-resolver.guard.ts`) → replace with in-process TTL Map (single Railway instance; faster than Upstash's HTTP hop; drops HMAC complexity). Falls back to admin-DB lookup today.
- **Web auth rate limit** (`apps/web/src/lib/auth/rate-limit.ts`, `@upstash/ratelimit`) → replace with in-memory sliding window (or small admin-DB table). Closes the open abuse hole.

Then: remove `@upstash/*` from 3 package.jsons (web, api, tenant-context), purge env vars (`UPSTASH_REDIS_REST_URL/TOKEN`, `CACHE_HMAC_SECRET`, `TENANT_CACHE_TTL_SECONDS`) from `.env.example` + Railway + Vercel, cancel subscription, update CLAUDE.md tech-stack table. ~half day incl. tests. Caveat: if API ever goes multi-replica, in-memory cache becomes per-instance (fine — just more admin-DB reads).

### P1 — Cost cuts (recurring $)

5. **Neon prod never-suspends** — `suspend_timeout_seconds: 0`; compute active 24/7 for 13+ days serving 2 tenants (largest DB 22 MB); billed active-time ≈ 2× actual CPU. Biggest single Neon lever. Recommendation: set ~300s autosuspend now (cold start ≈ 0.5–1s, invisible pre-scale); revisit always-warm as the "POS insurance premium" when live cashier traffic exists. Also: dev branch inherits never-suspend if un-archived — fix the default.
6. **Vercel bot bleed** — ~35 of 50 prod runtime-error groups are scanner probes (`/admin.php`, `/.env.old`, `/wp-*`, `/secrets.json`) forcing the `[locale]` catch-all from static → dynamic SSR (headers() via next-intl), i.e. every probe = paid function invocation. `/robots.txt` + `/sitemap*.xml` also render dynamically on every crawler hit (69/30/27/27 hits). Fix: Vercel Firewall block/rate-limit rules for those path patterns; make robots/sitemap static. Also check Image Optimization usage + remotePatterns restriction.
7. **Railway: delete dead `meilisearch`** — REMOVED since 2026-03-15, 0 CPU/RAM, still registered. Delete unless search is returning.
8. **Railway: `zerupt-internal` watchPatterns = []** — every docs-only commit to the internal repo triggers a full Docker rebuild of the zerupt-mcp server (5 rebuilds in 24h for study-notes commits). Scope to `/tools/zerupt-mcp/**`.
9. **Cancel Upstash** once P0.5 lands.

### P2 — Reliability & observability (before live POS customers)

10. **`@zerupt/ai` service: no healthcheck + 100 consecutive SKIPPED deploys** — trusting a months-old image; a hung-but-listening process would never restart. Add healthcheckPath; do one deliberate redeploy (matches memory: AI service needs redeploy for model-id fixes — likely related to P0 item 2).
11. **API single-replica** — restartPolicy ON_FAILURE is fine, but one crash = seconds of POS downtime with no standby. Decide on 2nd replica before live cashier traffic. (Interacts with in-memory tenant cache choice.)
12. **Install `pg_stat_statements` on Neon prod+dev** — list_slow_queries currently errors; we are blind on query performance. Prereq for the perf audit.
13. **Stale-chunk error (ZERUPT-WEB-1)** — 36 events on `/:locale/sales`: users on an old tab break after each deploy. Add chunk-load-failure → "new version, reload" handler.
14. **Supabase public-bucket discipline** — public `upload()` in `supabase-storage.service.ts` returns getPublicUrl(); 5 call sites (tenant-settings, suppliers, customers, item-categories, items). No RLS, service-role key bypasses policies → no second line of defense if a caller passes a sensitive bucket. Audit call sites; confirm bucket public/private flags in dashboard; check cache-control on public assets (egress cost). Private `import-files` path is well built (tenant-scoped paths, signed URLs, TTL sweep).
15. **Sentry hygiene** — (a) ZERUPT-API-3 `EADDRINUSE :3001` = 94 local-dev events polluting prod triage → fix environment tagging/DSN scoping; (b) ZERUPT-AI-5 "LLM fallback used" logged as error → downgrade to info/warn; (c) no `Sentry.setUser()` anywhere → all issues show 0 users, impact invisible; (d) `AuthApiError: Invalid Refresh Token` (~35 events) — confirm clean redirect-to-login, not error page.
16. **Audit-log retention** — immutable-by-design, no purge/archive policy exists. Not urgent at MB scale; flag for a partition/archive tier before Neon storage compounds.

### P3 — The deep audit (scoped, not yet run)

Four tracks, report-first, adversarially verified findings only:
- **Security**: tenant isolation (every endpoint: guard + tenant scoping), auth/JWT, injection/validation, secrets, file-import pipeline (Mira takes arbitrary customer files), admin/provisioning surface. Opus for tenant-isolation + auth reviewers.
- **Performance at scale**: indexes vs real query patterns (GL lines, stock ledger, POS txns), N+1s, unpaginated endpoints, aging/valuation/report paths, Neon connection lifecycle, frontend waterfalls. Evidence via EXPLAIN ANALYZE + pg_stat_statements (needs #12).
- **POS resilience / failure modes** (deepest track): per-dependency death matrix (Neon/Supabase/Railway) at the checkout moment; offline-mode boundary testing (what silently needs network mid-sale?); JWT expiry mid-shift; p99/tail latency — cold starts, hot-row lock contention (stock rows, GL sequence, register sessions), anything synchronous on the sale-commit path that should be queued; cashier-facing error states (every failure needs a path forward).
- **Observability & recovery**: p99 + queue-depth alerting, Neon PITR restore rehearsal, per-tenant rate limits on expensive report endpoints, dependency CVE sweep (partially done — see P0 #1).

## What's healthy (verified, no action)

- Neon: 2 branches only, no orphans; tenant registry ↔ tenant DBs match exactly (prod: al_asala 22MB, merpec 18MB + admin 10MB); pg-boss job=23/archive=12 rows, archive+prune working; storage trivial (~77MB total).
- Railway: zero crash loops; API 0.0% errors, p50 32ms, ~250MB RAM; healthcheck + 30s overlap + preDeploy migrations on API = solid; Hobby plan bills by usage so 8vCPU/8GB ceilings cost nothing.
- Codebase cost discipline: Gemini 2.5 Flash workhorse w/ reasoning_effort=none, no expensive-model defaults, no LLM retry multiplication; ai.score/ai.train have NO scheduler (unbuilt, not leaking); ElevenLabs double-cached + daily-capped; pg-boss pg-cron disabled deliberately for autosuspend; no dormant paid services; dashboard polling reasonable (60s).
- pnpm audit: 79 advisories (19 high) but almost all transitive/dev-tooling (hono via @prisma/dev, undici, picomatch, lodash template, fastify adapter unused) — only drizzle-orm is confirmed runtime (P0 #1).

## Suggested execution order

Day 1: P0 items 1–4 + P0.5 Upstash removal + quick config wins (P1 5–9, mostly dashboard clicks). Then launch the P3 deep audit against the cleaned-up baseline; fold P2 into its fix queue.
