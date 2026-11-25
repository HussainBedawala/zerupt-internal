# Handover: Zerupt prod speed + cost optimization (session of 2026-11-22)

You are taking over a performance/cost program for Zerupt (multi-tenant retail ERP, LIVE customers in UAE + Kuwait). The founder (Hussain, solo, bootstrapped, not an infra expert) must be able to ask you ANY question about what was found, discussed, decided or built, and you must be able to continue the remaining work. Everything you need is below. Read it fully before acting.

Companion files (same folder, `/Users/hus3ain/Development/Zerupt/study/ops/perf/`):
- `perf-research.md`: the research brief (16 sources, findings with numbers, 12 principles).
- `review-findings-2026-11-22.md`: snapshot of the reviewer findings file (the live copy was `erp/.review-findings.md`, gitignored; it may have been trimmed by other agents).

---

## 0. Rules of engagement (founder's explicit preferences, learned this session)

- Read `/Users/hus3ain/Development/Zerupt/CLAUDE.md` and `erp/apps/web/CLAUDE.md` first. They are binding (lazy-first ladder, delegation mandate, money/tenant/auth never lazy, i18n ar+en, no em dashes in UI copy, logical CSS properties).
- NO commits, pushes, stashes, checkouts, resets or any git state change unless the founder explicitly says so in that message. An agent tried `git checkout` once this session; the permission layer blocked it. Subagents must be told this in every prompt.
- Prod setting changes need explicit per-change approval. Railway CLI IS allowed now (founder said "use railway CLI theres no issue"). Prefer `--skip-deploys` when setting variables so nothing restarts during business hours unless asked.
- TESTING (founder was frustrated by this, follow exactly):
  - Never run broad/large test patterns. Run ONE specific test FILE per command (`npx jest src/path/file.spec.ts --no-coverage` from `erp/apps/api`; `npx vitest run src/path/file.test.tsx` from `erp/apps/web`).
  - Strictly sequential. No batching many suites in one script, no parallel test processes (also not "agent runs tests while you run tests").
  - Never re-run something that already passed and has not changed since. "dont redo alr finished stuff".
  - Subagents WRITE tests but do not run them, unless you explicitly allow named single files with a run cap (3).
  - `tsc` for the API OOMs (exit 134) without memory: use `NODE_OPTIONS=--max-old-space-size=12288 pnpm --filter @zerupt/api typecheck`. Exit 134 means "unknown", not "clean".
  - `@zerupt/shared`, `@zerupt/db-admin`, `@zerupt/db` resolve to `dist/`: rebuild after src edits (`pnpm --filter @zerupt/shared build`). The shared build currently prints one error from another session's spec (`permission-implications.spec.ts`, retired `inventory.cost.view`) but still emits dist.
  - Architecture drift: `bash study/ops/graphify/check-drift.sh` from the ROOT repo (`/Users/hus3ain/Development/Zerupt`), read the "Upward-dependency violations" line (piping hides exit codes). Last result: 0 violations.
- Communicate in plain language, short, with tables. Give a recommendation, not a survey. Ask only when the decision is genuinely the founder's.
- Bootstrap: every drop of cost efficiency matters. Neon bills for every minute the DB is awake (5-minute minimum per wake). Anything that holds a DB connection open or wakes the DB on a timer is a cost bug.
- The working tree contains OTHER sessions' uncommitted work. Only touch/commit files from this program. Known foreign breakage (not ours, do not "fix" silently, report): `apps/web/src/features/ecommerce/orders/components/detail/order-detail-page.tsx` uses `manage` before declaration (TS2448, would crash the page); `apps/api/src/garage/billing/__tests__/garage-invoice-void.spec.ts` scenario 5 fails due to another session's rewrite of `sales-invoices.service.ts` voidInvoice (our new garage case in that file passes); `packages/shared/src/permission-implications.spec.ts` TS2367.

---

## 1. System facts

- Web: Next.js 16.2.7 App Router, next-intl v4, `proxy.ts`. Vercel team `bedawalahussain553-1196s-projects`, project `zerupt` serves `app.zerupt.com` + `*.zerupt.com` (tenant subdomains). `website` project serves `zerupt.com` (marketing). `merpec` = Kuwait white-label (recent deploys "Blocked"; NOT yet moved to sin1; not investigated). `gazmin-proposal-site` serves gazmin.zerupt.com.
- API: NestJS on Railway project `zerupt` (env production): services `@zerupt/api` (api.zerupt.com, Southeast Asia), `@zerupt/ai`, `zerupt-internal` (mcp.zerupt.com). Single API replica (no numReplicas in `apps/api/railway.json`; overlapSeconds 30, drainingSeconds 30, preDeployCommand `node dist/migration/migrate-all.cli`).
- DB: Neon project `restless-hill-33464873`, prod branch `br-red-term-a1vs9ndl`, endpoint `ep-patient-surf-a1adanmx` (Singapore, PG 17.12), autoscale 0.25-2 CU, scale-to-zero 300s, pooler off. Admin DB + 39 tenant DBs on the same compute. Largest tenant DB name: `zerupt_tenant_al_fatemi_salah_al_awadi_auto_s_ad6a36cd` (1.5 GB, ~274k journal lines, 12,233 posted receipts all KWD). Others ~1.17 GB (autotab), 0.84 GB (salah_al_awadi). pg_stat_statements NOT installed. "Cells": brands can live on other Neon computes (Merpec Kuwait), so admin DB may not share a tenant's compute.
- Users: ~94.5% enter Vercel edge in Mumbai (bom1).
- Auth: Supabase JWT (ES256, app_metadata tenant), web sends `Authorization: Bearer` cross-origin to api.zerupt.com (cookies not used for API).

## 2. Root cause of "the app suddenly got slow" (evidence)

Neon daily CU-seconds: Sep 30-Oct 3 ~11-14k/day; Oct 4 ~30k (commit 028cc8a66 "revamp dashboard around money, attention and performance"); Nov 17-19 56-64k (~5x).
1. Dashboard revamp: shared `LIVE` config `refetchInterval: 60_000` on ~17 dashboard hooks (6 heavy: money position, attention, AR/AP aging, stock health, performance, sales chart). Dashboards stay open all day. AR aging scanned journal_entry_lines repeatedly (0.7-1.1s, "2.6M rows" was cumulative scans, not table size); trial-balance/P&L ~1.0s.
2. Small cold DB: 0.25 CU min, scale-to-zero; heap cache hit 94-96% on big tenants (research says <99% = working set doesn't fit). Autoscale averages ~0.7 CU by day.
3. parts-list.sql.ts "shelves" CTE top query by total time (~925 calls x ~200ms); inventory aging 515ms mean. NOT fixed yet.
4. Web functions ran in iad1 (Washington) while API+DB in Singapore.

Neon compute history (ops log): prod sleeps/wakes many times a night; starts at exactly 02:00 and 03:00 UTC = cron batches (6-9 min each). Daytime awake ~19h/day (Nov 21: 03:00-21:50 UTC). Cost split estimate: ~85-90% daytime awake compute, ~5% night jobs, rest night user cycles.

## 3. Logs and measurements gathered

- Vercel MCP observability returned 404; used Vercel CLI instead (`vercel inspect`, curl headers).
- Before promote: live `app.zerupt.com` pointed at 3-day-old deploy `zerupt-ppkld5vlm` (dpl_2y85f4npScTEd4U95CTE33XNF6fP, commit e9d75e2, functions iad1). Headers `x-vercel-id: bom1::iad1::...`. `/en/login` 2.4s, `/api/health` 0.57s, `/favicon.ico` 500 (matched `/500`).
- New sin1 deploy `zerupt-qcfnctq9x` (dpl_HvoL8bYUocJj3U3pG7KmGWNHDqTH) was a "Redeploy of 2y85f4npS", SAME commit e9d75e2 (verified via `vercel api /v13/deployments/...` githubCommitSha). Founder promoted it (they had deleted yesterday's buggy deploy after a rollback; we verified it was not the buggy one). After: `bom1::sin1::`, `/en/login` TTFB 0.56-0.79s warm (4.8s first cold hit). ~3x faster.
- Railway API HTTP logs (`railway logs --service @zerupt/api --http`, 5000-line cap = ~12 min window 08:48-09:00 UTC):
  - OPTIONS (CORS preflight) = 2,427 of 5,000 requests (~half).
  - Top by total time: GET items/search 380 calls avg 420ms max 6.9s; GET sales/customers/:id 32 avg 1.4s max 8.1s; POST sales/direct-sales/preview 90 avg 468ms max 6.9s; stock-levels/batch 131 avg 234ms max 5.4s; legal-entities 99 avg 293ms max 3.3s; me/permissions 122 calls avg 186ms max 5.4s; dashboard receivables-payables avg 1.5s, stock-health 1.3s, performance 1.3s; sales-invoice pdf avg 3.9s.
  - Many simple routes max 5-7s => cold DB / storage reads.
  - billing/subscription 1216ms seen.
- AI service log: one line in 24h (POST /ai/scan/extract 200), barely used.
- Neon EXPLAIN (read-only) on largest tenant: AR aging rows query 510ms = line scan ~58ms (BitmapAnd jel_entry_party_idx + jel_account_id_gl_keyset_idx), 48,689 nested-loop PK lookups into journal_entries ~185ms, grouping ~250ms (47,641 groups). Backfill aggregate for rollup 282ms -> 4,811 rows.
- `pg_default_acl` on prod: `<db>_app=arwd`, `<db>_readonly=r` for tables created by `neondb_owner` (migrator role) => new tables inherit app privileges.

## 4. Research read (details in perf-research.md)

Dean & Barroso "Tail at Scale" (fan-out amplifies p99; hedged requests); Nielsen 0.1/1/10s limits; Grigorik HPBN (latency not bandwidth; connection reuse 264ms->96ms; SSE ~5 bytes vs polling 500-800 bytes overhead); MDN CORS (default preflight cache 5s; Chrome caps Access-Control-Max-Age at 7200); Google "Speed Matters" (100-400ms delay reduced searches, effect persisted weeks); Deloitte "Milliseconds Make Millions" (+8.4% retail conversion per 0.1s, consumer data); Core Web Vitals thresholds (LCP 2.5s, INP 200ms, CLS 0.1); web.dev performance budgets; Meta regression detection; PostgreSQL docs (indexes vs write cost, materialized aggregates); Neon docs (cache = 75% RAM, hit <99% => undersized, scale-to-zero 5 min). Not fetched: Amazon 100ms/1% claim, Brutlag PDF, FBDetect PDF.

## 5. Platform changes DONE (live)

1. Vercel `zerupt`: function region iad1 -> sin1 (deployed + promoted). Build machine switched to Enhanced (8 vCPU/16 GB); if OOM, revert to Elastic. Build still runs in iad1 (normal).
2. Railway: founder moved `@zerupt/ai` and `zerupt-internal` to Singapore. All of web/API/AI/DB now in Singapore. (No Middle East region exists on Neon or Railway; don't move to Dubai.)
3. Railway `@zerupt/api` variables SET with `--skip-deploys` (no restart yet): `TENANT_POOL_IDLE_TIMEOUT_MS=300000`, `TENANT_POOL_STALE_MS=300000` (live code reads them in `apps/api/src/tenant/tenant.module.ts:154,166`, takes effect at next restart/deploy), `DASHBOARD_STREAM_TICKET_SECRET` (random 64 hex, only used by new code). NOT set on purpose: `DASHBOARD_CHANGES_MULTI_INSTANCE` (set to `true` only if the API ever runs 2+ replicas). Optional: `PERMISSION_CACHE_TTL_SECONDS` (default 30, max 60).
4. Neon: no change. Recommendation agreed: keep min 0.25 CU; revisit after deploy if spikes continue.

## 6. Code changes BUILT (uncommitted, reviewed, final-pass verified)

All verified in the final pass: every touched test file passes (one file at a time), API typecheck 0 errors, web typecheck 0 errors in our code, i18n parity OK, drift 0 violations. Integration test `gl-daily-balances.integration` 18/18 on local PG17 (`INTEGRATION_TEST_PG_URL=postgresql://<osuser>@localhost:5432/postgres npx jest --config jest-integration.config.js gl-daily-balances --no-coverage -i`; never point at Neon).

### 6.1 Event-driven dashboard (no polling)
- Web: 60s polling removed (`apps/web/src/features/dashboard/api/dashboard-queries.ts`, LIVE = staleTime only). Generic hook `apps/web/src/lib/hooks/use-live-changes.ts` (`useLiveChanges({keysForTopics, allKeys, enabled, keepAlive})` returns `{paused, wake, denied}`); `use-dashboard-changes.ts` is a thin wrapper. Shared `src/lib/topic-buffer.ts` (3s trailing coalesce, 10s maxWait). `src/lib/hooks/use-resilient-stream.ts` extended (named eventNames, onError on null/failed getUrl, generation race fix, hidden tab = disconnect, getUrl every connect).
- Behaviour: stream only while a live screen is mounted; idle 15 min (pointer/key/wheel/touch/mousemove/scroll) closes it, shows shared `src/components/live-updates-notice.tsx` ("Live updates paused. Tap to refresh", en+ar in `messages/*/common.json` `liveUpdates`); hidden tab disconnects; reconnect invalidates all; first open invalidates queries older than mount; heartbeat event every 25s, watchdog 75s; hideAmounts disables money-position fetch only (other cards show non-money info); 403 on ticket = stop for good.
- Auth: `GET /api/v1/tenant/dashboard/changes/ticket` (normal guard pipeline; GET not POST so view-only impersonation/entitlement-limited tenants work) returns `{ticket, expiresInMs:60000}`, HMAC-signed stateless ticket {tenantId,userId,impersonation?,topics,closeAtMs,exp,jti}, single-use per instance, 20 mints/user/min. SSE `GET /api/v1/tenant/dashboard/changes?ticket=`. Frames: `change {topics}`, `heartbeat {}`, `end {reason: expired|revoked|shutdown}`. Topics: gl, stock, pos, docs, garage, handover (shared constants `packages/shared/src/change-topics.ts`). Per-user cap 5 streams, per-tenant 50/instance, 1s emit rate cap. Stream lifetime = min(JWT exp, 60 min; impersonated 15 min). Revalidator every 5 min: membership + re-resolved topics (narrows or ends with revoked).
- API files: `apps/api/src/dashboard/changes/*` (controller, service, mapping, permissions, ticket, ticket service, revalidator, types, specs incl. AppModule smoke spec), `apps/api/src/common/listen-connection.ts` (refcounted `ResilientListener`: LAZY LISTEN only while >=1 subscriber, 30s idle grace, backoff only with subscribers, keepAlive, 10s connect timeout, 30s SELECT 1 probe; job-progress uses it too), `apps/api/src/tenant/membership-gate.ts` (extracted from TenantResolverGuard). Channel per environment `dashboard_changes_<env>`. `publish()` runs pg_notify on pooled ADMIN_DB, and SKIPS when this instance has no open streams unless `DASHBOARD_CHANGES_MULTI_INSTANCE=true` (avoids waking the admin compute from another cell). Event mapping via EventEmitter2.onAny + frozen table: accounting.journal-entry.posted->gl; POS events->pos+stock; inventory adjustment/transfer/landed-cost->stock; sales/purchase docs->docs(+stock); garage events->garage; `transfers.collector_handover.changed`->handover. STOCK_INBOUND/OUTBOUND removed (never emitted).
- Cost point the founder asked: "does pinging keep the DB awake?" -> only while someone has a live screen open and active; LISTEN is lazy; idle close prevents overnight wake by an unattended shop PC.

### 6.2 Precomputed GL running totals ("rollup")
- Founder insisted: do the efficient solution now, no half measures. Founder principle: "dashboard is display-only, no calculations" -> numbers come from canonical report services; reports themselves made fast.
- Tables (per tenant DB): `gl_daily_balances` (tenant, legal_entity, account, branch nullable, posting_date; debit, credit, debit_tc, credit_tc numeric(24,6), line_count; UNIQUE NULLS NOT DISTINCT; fillfactor 70), `gl_daily_balance_deltas` (staging, no PK), `gl_daily_balance_flush_pending` (one sentinel per txn), `gl_rollup_state` (ready_at). Migrations `packages/db/drizzle/0607_gl_daily_balances.sql`, `0608_gl_daily_balance_commit_flush.sql`, `0609_gl_rollup_readiness.sql`; snapshot regenerated, `snapshot:equivalence` OK.
- Mechanics: statement-level triggers stage deltas (only posted/reversed entries count), one deferred commit flush per transaction folds them in key order (deadlock-free), shrink path via UPDATE with row-count check, drift marks not-ready instead of failing postings, TRUNCATE guards, READ COMMITTED guard, `rebuild_gl_daily_balances()`, `gl_daily_balances_drift()`, `gl_rollup_verify_and_mark()`, `gl_current_txid()` (pg_current_xact_id). 20k-line txn test proves no O(N^2).
- Go-live safety: migration only creates structures (lock header first, ms once granted, lock_timeout 5s). Backfill is opt-in per tenant: `node dist/migration/gl-rollup-tie-out.cli --rebuild [--tenant=]` (rebuild -> zero-drift verify -> mark ready). Readers check `isGlRollupReady` (cached 10s; unknown = not ready) and fall back to exact raw queries. Nightly drift sweep (`journal-entries/gl-rollup/gl-rollup-drift.scheduler.ts`, in the nightly window) alerts via Sentry and flips ready off.
- Readers switched: `reports/shared/account-balance.ts` fetchAccountBalances (money position, COA tree), `reports/profit-and-loss.service.ts` (full P&L + dashboard performance + balance sheet via P&L), sales chart gross profit, AR/AP aging control total (`sumControlMovementFromRollup`, parallel reads). Shared helpers: `reports/shared/gl-rollup-source.ts`, `gl-rollup-readiness.ts`, `ledger-movement.ts`.
- NOT switched (on purpose): AR/AP aging rows (invoice allocation matching; a party-by-date rollup cannot reproduce it; the founder got the "Ahmed invoice A/B" explanation), trial balance (next Reports pass). Wide covering index for aging was removed (not worth write cost per EXPLAIN).

### 6.3 Sales overview on canonical reports (founder APPROVED value changes)
- `apps/api/src/sales/overview/*`: invoiced/series/sales-today = DailySalesService invoiceSales (pre-tax, functional, incl. debit notes); collected = shared reader `reports/shared/receipts-received.ts` (functional = round(total x stored rate), by payment date, reversals netted on reversal day, null + logged if foreign receipt at rate 1 or mixed functional currency); overdue/AR/top customers/today panel = one ArAgingService call (`overdueFunctional` added to aging rows, required); overdue count = customers. Per-widget permission gating and per-widget failure -> null (never zero, never whole page). Branch-restricted users get branch-scoped AR (Customers page too via `customer-collection-facts.ts`). `arWarnings` exposed (not rendered yet). `CustomerArBalanceService.agingBucketTotals` deleted. Dashboard payments-in tile uses the same reader. Receipts index `(tenant_id, payment_date) WHERE status IN ('posted','reversed')` via deferred-ddl manifest.
- Open confirmation asked, unanswered: overdue count no longer applies the small-balance threshold (not displayed anywhere today).

### 6.4 Inventory overview
- One `GET /tenant/inventory/overview` (`apps/api/src/inventory/overview/*`, action `INVENTORY_ACTIONS.overviewData`), fields omitted (not zero) when not permitted. Shared `inventory/shared/stock-reorder-kpis.ts` used by overview + reorder page; `inventory/shared/overview-conditions.ts` shared with StockCounts/StockTransfers list. Suggested PO value per functional currency `{currency, value, costUnknownRows}`; cost query skipped without cost view; `redactCost` masks suggestedPo/suggestedPoByCurrency. Web: one query (3 calls instead of 6), 4-part error tile (ref `ZR-INV-OVERVIEW`), stale note on background failure, invalidated by all inventory/item/GRN/count mutations + refetchOnMount always; shared formatter `features/inventory/lib/suggested-po.ts`.

### 6.5 Polling removed elsewhere
- Garage board/list/technician/work screen and sales handovers now use the live stream (garage board `keepAlive` for wall displays). Every board-affecting garage write emits after commit (`GARAGE_EVENTS.changed` catch-all + existing events; timer start/stop too). Handover emits from the service. Dead-letters, admin impersonation sessions, technician timer: no interval, focus refetch. POS other-register backlog is local IndexedDB only (no API). POS stock refresh 5 min kept but skips hidden tab; catalog 15 min kept (offline guarantee).

### 6.6 Permissions cache + CORS
- API `auth/permission-set-cache.ts`: per (tenant, user, impersonation session) role set, TTL 30s (max 60), capped at JWT exp and role expiresAt, never caches empty sets, deep-frozen, generation-keyed invalidation on every role/user-role/membership/branch/owner-transfer/invite/provisioning write (finally blocks), fail-closed to DB. Only PermissionGuard, owner check, GET /me/permissions use it; service-layer checks read fresh. Cross-instance staleness bounded by TTL (no broadcast, to keep Neon able to sleep). Wiring spec asserts one instance reaches all writers.
- Web permissions query staleTime 5 min (founder accepted: newly granted permission can take up to ~5 min in an already-open tab; revocation self-heals on first 403; "Refresh my access" button on no-permission states). Global mutation->dashboard invalidation now only for `meta.affectsDashboard` (none set; live stream + first-open cover it).
- CORS `apps/api/src/cors-options.ts` maxAge 7200 (founder: keep 2h, do NOT route API through app domain; per-URL preflight remains for distinct query strings; if POS search ever feels slow, change how search sends the query instead).

### 6.7 Nightly maintenance (one DB wake per night)
- Founder decision: everything at 02:00 UTC (06:00 UAE / 05:00 Kuwait), including reminders and the POS stale-shift alert. `apps/api/src/common/maintenance/*`: `@NightlyJob` decorator, plan (24 jobs: prep 6, backup 1, maintain 8, reconcile 4, notify 5), orchestrator (phases sequential, jobs within a phase concurrent, per-job timeouts, failure isolation + Sentry), per-night claim + heartbeat + per-job completion markers in admin table `nightly_maintenance_runs` (migration `packages/db-admin/drizzle/0063_nightly_maintenance_runs.sql`), resume on boot, isDependencyTreeStatic filter. Audit purge depends on backup success and skips exactly tenants whose backup failed (fails closed if ledger unreadable). Backup re-entrancy guard. Dormant-tenant skip (`dormant-tenant.filter.ts`: no activity 14 days from audit_log + pos_transactions, snapshot must be <48h old, unreadable facts never mark dormant) applies to 6 jobs; order-waiting reminder never skips (storefront orders aren't audited). Queue sweeper and outbox idle sweep moved into the window / piggyback on activity (idle-system recovery bound up to ~24h; boot sweeps cover crashes). Wakes from schedules: up to 11/day -> 1/night.

## 7. Deploy checklist (not done; founder must say go)

1. Founder browser test (dashboard live updates, hide amounts, idle pill; sales overview vs reports; inventory overview refresh + multi-currency; garage/handovers live; Refresh my access).
2. Decide on foreign breakage (section 0) and commit ONLY this program's files (conventional, lowercase, body <100 chars, erp repo, `cd erp`). One commit, one push to main, off-peak.
3. Migrations apply automatically pre-deploy (tenant 0607-0609, admin 0063, deferred-DDL receipts index).
4. After deploy: run rollup rebuild per tenant off-peak; spot-check login TTFB, dashboard stream, Neon ops log should show one ~02:00 UTC wake at night; Sentry nightly-maintenance check-in.

## 8. Remaining work (continue in this order, measure before/after each)

1. App shell: sidebar links `prefetch={false}` (82 links prefetch); favicon (no `public/favicon.ico`, `/favicon.ico` hits `[locale]`, static-to-dynamic error ~84/day; fix with `dynamicParams=false` in `[locale]/layout.tsx` + brand-aware static icon routes); cache successful workspace-slug lookups on login ~5 min (Next fetch `next:{revalidate}` / `unstable_cache`; `cacheComponents` NOT enabled) + add the missing `failed` test + fix stale comment ~L38-47 in `apps/web/src/app/[locale]/(auth)/login/page.tsx` (uses `lookupWorkspaceSlug`; only genuine 404 drops to generic page); gate PosSyncProvider 10s health ping to POS routes; `useBillingQuoteQuery` enabled only when banner shows; timeout on `(app)` layout `verifyTenantOrClear`.
2. Reports pass: move trial balance, tax summaries (GL-derived), daily sales/purchases/receipts totals, stock value onto rollup/running figures with old-vs-new parity tests; trial balance can use `rollupConditions`.
3. Page weight: per-route i18n namespaces instead of all 88 (/en/login HTML 2.45 MB raw); shrinks Vercel Fast Origin Transfer.
4. Slow queries: parts-list.sql.ts shelves CTE, inventory aging (515ms), review ~446 unused indexes per tenant (write cost), items/search (420ms avg), sales customer detail (1.4s avg), direct-sales preview, sales invoice PDF (3.9s).
5. Efficiency standard (founder asked for it explicitly): add a "Performance budget" section to root CLAUDE.md (no polling < 5 min without justification and never without hidden-tab/idle stop; push over poll via the shared live stream; dashboards/overviews display-only from canonical services; precompute what is read often; every new query EXPLAINed + indexed + tenant-scoped; never hold DB connections open idle; schedules go in the nightly window; cache safe reads; per-page payload budget), plus a `perf-reviewer` agent in `.claude/agents/` added to reviewer dispatch, plus mechanical checks where possible (bundle size, refetchInterval lint). Base it on perf-research.md principles and the bugs in this handover.
6. Other open items: role-based start page (cashier -> New sale, owner -> dashboard, user override; founder hasn't decided build timing); `merpec` Vercel project region + "Blocked" deploys; verify Vercel latency history; Nov 12 UI revamp (cb00010fd) and Nov 5 garage module (3be67c4c9) effects unverified; Razorpay checkout reuse fix (`billing.service.ts resolveCheckoutReuse` + `startMatchesTrialEnd`) and login safety net are uncommitted work from before this session, keep them.

## 9. Cost picture (Vercel, Nov 22)

Nov to date $26. Last 30d: Pro $20, build minutes $7.57 (5,874 min, ~4.4 min/deploy -> batch pushes), Fast Origin Transfer $3.15 (41 GB; shrinks with i18n fix), Fluid CPU $2.15, invocations $0.93 (3.2M; shrinks with prefetch/polling fixes). CDN hit 18% normal for logged-in app. Runtime Cache unused (slug cache will use it).

## 10. Decisions log (quick reference for founder questions)

- Promote sin1 redeploy: yes (same commit e9d75e2). Done.
- Railway CLI: allowed.
- Dashboard: event-driven, only when open, hidden numbers not fetched (money card only), idle close 15 min. Approved.
- Running totals now, not later. Approved. Aging stays exact (explained why).
- Overview pages display-only, numbers from reports. Approved; sales value changes approved.
- Permissions cache option A (in-process + invalidation), following session timeout. Approved; 5-min new-grant delay accepted by default.
- CORS 2h, no API rerouting. Approved.
- Nightly: single 02:00 UTC window for everything. Approved.
- Landing on New sale for everyone: recommended role-based instead; pending.
- Reports incremental "from last calculation": answered that daily running totals are the correct form of this (back-dated entries safe); rest of reports in Reports pass.
- Neon min CU: keep 0.25.
