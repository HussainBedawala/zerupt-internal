# PERF-002 — API tenant-request latency: diagnosis, verdict, fix

Phase F. Measured 2026-08-30 against the running dev API (`localhost:3001`, compiled
`dist/main`, no watcher) and the Gulf Auto Parts tenant DB (Neon, Singapore).

CAVEAT ON ABSOLUTE NUMBERS: ~7 other agents were hammering this API throughout. Every
conclusion below rests on DIFFERENTIALS measured under comparable load, plus two
single-request traces captured in deliberately quiet windows.

---

## 1. Network baseline (measured, not assumed)

Direct probe from this machine using the same `@neondatabase/serverless` Pool the API uses
(script run from `apps/api`, tenant connection string):

```
connect+q1  2490ms      <- cold: DNS + TCP + TLS + WS upgrade + SCRAM/channel-binding + startup
q2           336ms
q3           358ms
q4           362ms
q5           383ms
bigq (count) 344ms      <- server-side work is negligible; this is pure RTT
```

`psql` agrees: 2.4-2.6s to open a session, ~0.5s per additional statement.

**One warm round trip to the tenant DB costs ~350ms. A cold connection costs ~2.5s.**
This is the unit of account for everything below.

`GET /api/v1/health` (no tenant DB): 0.36-0.44s. That is the fixed non-DB floor.

## 2. Verdict on the hypothesis: **DISPROVEN**

> Hypothesis: `TENANT_DB` establishes a NEW Neon WebSocket connection per HTTP request,
> with no pooling or reuse, paying a full handshake every time.

Three independent lines of evidence say no.

**(a) Arithmetic.** A fresh WebSocket + TLS + SCRAM handshake to Singapore costs ~2.5s,
measured above. Tenant requests were completing in 1.19-1.94s — *less than one cold
connect*. A per-request handshake is arithmetically impossible.

**(b) The code.** Reuse exists at three layers, all already correct:
- `packages/tenant-context/src/tenant-connection.service.ts` — process-wide LRU cache of
  Drizzle-plus-Pool entries keyed by database URL (max 50), with concurrent-creation
  dedup, a staleness ping, and dead-pool self-heal. Pools are reused across requests.
- `apps/api/src/tenant/tenant.module.ts` — `TENANT_CONNECTION_CACHE`, an in-process TTL
  cache (default 300s) of tenant connection metadata, so the admin DB is NOT consulted on
  the hot path.
- `MEMBERSHIP_STATUS_CACHE` — 60s TTL on the active-membership gate, likewise keeping the
  admin DB off the hot path.
- `TENANT_DB` itself (`apps/api/src/common/tenant-drizzle.module.ts`) is not a
  request-scoped provider at all; it is a singleton factory returning
  `getTenantContext().db` out of AsyncLocalStorage. It creates nothing.

**(c) The running process says so.** `/tmp/zerupt-logs/api.log` emits
`[TenantResolverGuard] Tenant connection cache hit` on tenant requests — the metadata
cache is hitting and the pooled connection is being reused.

The original PERF-002 framing (a browser-vs-curl gap "above the API") is also wrong: the
Next.js HTML shell for `/en/accounting/trial-balance` returns in ~10ms, and three requests
over one keep-alive curl session showed no improvement (1.53 / 2.50 / 1.51s). The 27 GB
`.next` cache is irrelevant to this finding — it sits on the layer that already responds
in 10ms.

**The cost is inside the API, and it is round-trip COUNT, not connection setup.**

## 3. Per-request round-trip accounting (instrumented)

Temporary instrumentation was added to the tenant `Pool` factory (wrapping `pool.query`
and `pool.connect().query` with high-resolution timers logging the SQL) plus a per-request
marker in `TenantContextMiddleware`, both gated behind `PERF002_TRACE=1`. Built, restarted,
measured, and **since removed** (see section 6).

Single isolated request, quiet window, owner user:
`GET /api/v1/tenant/accounts?legalEntityId=...&limit=1` — **1.94s wall clock**

```
366ms  select ... from "userRoles" ... with role -> permissions     (round trip 1)
810ms  select ... from "userRoles" ... with role -> permissions     (round trip 2 — IDENTICAL)
737ms  select count(*) from "accounts" where tenant_id/legal_entity  \  (round trip 3,
742ms  select id, legal_entity_id, code, name, ... from "accounts"   /   these two in parallel)
```

366 + 810 + ~740 = ~1.92s. The whole response is accounted for by **three sequential waits
on the tenant DB**, and the actual controller work is only the last one.

**Round trips 1 and 2 are the same query, issued twice, in the same request:**
- `BranchAccessResolverService.resolve()` -> `PermissionService.isOwner()` -> `loadActiveRoles()`
- `PermissionGuard.canActivate()` -> `PermissionService.hasPermission()` -> `loadActiveRoles()`

`loadActiveRoles` (`apps/api/src/auth/permission.service.ts:205`) had no memoization of any
kind. `resolveFieldMask` / `getHeldPermissions` reach it a third time on routes that mask
fields. Non-owner users are worse still: `BranchAccessResolverService` (line 33 carries a
`ponytail:` note admitting "runs a fresh query on every request (no cache tier)") adds a
`user_branch_access` lookup and a `user_branches` select, each its own sequential round trip.

**So roughly half of every tenant request was one duplicated RBAC query.**

## 4. The Happy Eyeballs / NODE_OPTIONS question — not a factor here

The running API process (`node --enable-source-maps dist/main`) has **no** `NODE_OPTIONS`
set, so `--network-family-autoselection-attempt-timeout` is not applied. Measured whether
it matters, alternating runs of the identical probe:

```
WITHOUT flag   connect+q1 2667ms / q2 353ms
WITH flag=500  connect+q1 2538ms / q2 339ms
WITHOUT again  connect+q1 2723ms / q2 347ms
```

Within noise. The flag is a mitigation for `ETIMEDOUT` connect *failures*, not a latency
lever, and it only ever touches connection establishment — which, because pooling works
(section 2), happens approximately once per pool, not once per request. **Not the cause,
and setting it would not have moved these numbers.** Worth keeping in the boot env as
failure-mode insurance, but it is not a PERF-002 fix and should not be reported as one.

## 5. Fix implemented: per-request memoization of the RBAC role load

### Why this shape

The duplicate load is provably identical within a single request: same `userId`, same
tenant DB, microseconds apart. The correct scope for the cache is therefore **exactly one
request** — not a TTL. That choice is deliberate and is the whole safety argument:

- **No staleness window.** The memo dies with the request, so a role or permission change
  is picked up by the very next request, precisely as before. A TTL cache (the pattern used
  for membership status) would have delayed permission *revocation*, which on a money/auth
  path is a worse trade than the latency it buys. Not taken.
- **Tenant isolation cannot be violated by construction.** Entries are keyed by the *Drizzle
  db instance object*, not by tenant id or user id. This matters concretely: per
  `run-in-tenant-scope.ts`'s own header, a pg-boss job drained straight after its enqueue
  inherits the HTTP request's AsyncLocalStorage by accident of async propagation, and that
  job may legitimately run against a *different* tenant's db. Because a memo entry can only
  be read back through the identical db object it was written under, such a caller misses
  the memo and issues its own query. A cross-tenant read is impossible, not merely unlikely.
- **Outside a request scope it is a pass-through.** Jobs, pollers, and tests never enter
  `runWithRequestMemo`, so `compute()` always runs for them. Zero behaviour change.
- The in-flight *promise* is cached, so concurrent callers within one request share one
  query rather than racing duplicates. A rejected promise is evicted so a transient failure
  is not pinned for the rest of the request.

### Files changed

| File | Change |
|---|---|
| `erp/packages/tenant-context/src/request-memo.ts` | NEW. `runWithRequestMemo()` + `memoizeForRequest(namespace, dbInstance, key, compute)`. AsyncLocalStorage-backed, `Map -> WeakMap(db) -> Map(key)`. |
| `erp/packages/tenant-context/src/index.ts` | Export the new module. |
| `erp/apps/api/src/tenant/tenant-context.middleware.ts` | Wrap `tenantStore.run(...)` in `runWithRequestMemo(...)`. Established OUTSIDE `tenantStore` because the first RBAC load happens while the tenant context is still being resolved by `TenantResolverGuard`. |
| `erp/apps/api/src/auth/permission.service.ts` | `loadActiveRoles()` body wrapped in `memoizeForRequest("permission.activeRoles", db, userId, ...)`. |

No financial logic touched. No schema change. No migration.

### Before / after, measured the same way

Single isolated request, quiet window, `GET /api/v1/tenant/accounts?legalEntityId=...&limit=1`, owner:

| | wall clock |
|---|---|
| BEFORE | **1.94s** (3 sequential tenant-DB waits) |
| AFTER  | **0.67s** (2 sequential tenant-DB waits) |

Six consecutive samples after the fix, under the same concurrent-agent load as the
pre-fix samples:

```
AFTER : 0.79 0.75 0.91 0.70 0.86 0.74   (mean ~0.79s)
BEFORE: 1.49 1.56 1.60 1.92 1.37 1.19   (mean ~1.52s)
health: 0.44 0.40 0.36                  (non-DB control, unchanged)
```

**~0.7s removed from every tenant request; roughly a 2x improvement.** The residual 0.79s
decomposes cleanly as ~0.40s non-DB floor + ~0.35s for the one remaining RBAC round trip +
the parallel controller queries — which is exactly what the arithmetic predicts, and is a
useful cross-check that the dedupe really happened rather than the load merely easing.

### Verification

- `pnpm --filter @zerupt/tenant-context build` and `pnpm --filter @zerupt/api build`: clean.
- Freshness confirmed by grepping the COMPILED output for the new symbols
  (`memoizeForRequest` in `apps/api/dist/auth/permission.service.js`, `runWithRequestMemo`
  in `apps/api/dist/tenant/tenant-context.middleware.js`) — NOT `dist/main.js`, which does
  not change when only services recompile.
- `npx jest permission --no-coverage` from `apps/api`: **Test Suites: 1 failed, 6 passed, 7
  total; Tests: 1 failed, 134 passed, 135 total.** The single failure is
  `src/auto-parts/auto-parts-route-permissions.spec.ts` — "reports/fitment-coverage.controller.ts
  has exactly 1 route decorator(s)" — a route-decorator count assertion against another
  agent's in-flight controller edit. It does not touch `permission.service.ts` and is
  unrelated to this change.
- Ledger balance, before and after every restart:
  `SELECT round(sum(l.debit-l.credit),6) ... WHERE je.status IN ('posted','reversed')` =
  **0.000000** both times.

## 6. Instrumentation removed

The `PERF002_TRACE` query tracer in `tenant.module.ts` and the request marker in
`tenant-context.middleware.ts` have been deleted; `grep -c PERF002` returns 0 in both
files. The API was rebuilt and restarted without them.

## 7. What is right at scale (recommendations beyond what was implemented)

The fix above is the correct permanent change, not a local workaround: it removes work, and
removing a query is right whether the DB is 350ms away or 1ms away. But it is not the whole
story, and the remaining items are deliberately NOT implemented blind — they want founder
approval.

**A. Deploy topology is the dominant term, and no code change substitutes for it.**
At ~350ms per round trip, *any* endpoint needing N sequential queries costs 350N ms. In
production the API runs on Railway; it MUST be co-located with the Neon region serving that
tenant's cell (see the cell-based tenant routing work). Co-located, a round trip is 1-5ms
and the same request costs ~10ms rather than ~800ms. **The 1.5s figure in this report is a
local-development artefact of a Singapore DB and a Kuwait/India laptop; it is not what a
customer will see.** Do not size architecture decisions off it. Conversely, that also means
the round-trip-count problem is masked in production and will only resurface as a
cross-region issue — which is exactly why fixing the count is still worth doing.

**B. Remaining duplicate round trips on the hot path — recommended, not done.**
- `apps/api/src/tenant/branch-access-resolver.service.ts` runs `user_branch_access` and
  `user_branches` as two sequential awaits after the roles load. Its own `ponytail:` note
  (line 33) already flags the missing cache tier. These two are independent of each other
  and could at minimum be issued with `Promise.all` — one round trip instead of two, no
  semantic change, no isolation risk. Low risk, worth doing.
- `TenantResolverGuard` resolves branch access on every request including ones that never
  read a branch-scoped table. A per-request memo of the resolved branch set (same mechanism
  just added, same db-identity keying) would collapse it further.
- The `count(*)` + page `select` pair in list endpoints already runs in parallel. Good; keep
  that pattern, and audit other list endpoints for it.

**C. Do NOT reach for a TTL cache on RBAC.** It is the obvious next idea and it is the wrong
one. Permissions and role revocation are on the auth path; a 60s TTL means a de-permissioned
user keeps their access for up to 60s. The per-request memo gets most of the win with none
of that exposure. If a TTL cache is ever wanted, it needs explicit invalidation on every
role/permission mutation, and that is a bigger, riskier change than the latency justifies.

**D. Neon pooled connection string / keeping the socket warm.** Already in use — the URL is
built from `dbHostPooled` (`tenant-db-resolver.service.ts`), and pools are held with
`idleTimeoutMillis` 30s and `maxUses` 500. Nothing to change. Note the interaction: with a
30s idle timeout and 60s `staleAfterMs`, a genuinely idle single-tenant dev instance can pay
the ~2.5s cold reconnect on its first request after a lull. That is correct behaviour (it is
what keeps half-open Neon sockets from being reused dead) and must not be "optimized" away
by lengthening the idle timeout — the ZERUPT-API-7 / ISSUE-39 incidents are the reason those
values are what they are.

**E. Set `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=500` in the API boot
env anyway.** Not for latency — section 4 shows it buys nothing there — but as insurance
against the known Happy Eyeballs `ETIMEDOUT` failure mode on cold connects. Cheap, and it
should be recorded as a reliability setting, never as a PERF-002 fix.

## 8. Findings summary

| # | Severity | Status | Finding |
|---|---|---|---|
| 1 | MEDIUM | CONFIRMED | `PermissionService.loadActiveRoles` ran 2-3x per HTTP request, each a full tenant-DB round trip — ~50% of tenant request latency. FIXED (section 5), 1.94s -> 0.67s isolated / ~1.52s -> ~0.79s under load. |
| 2 | LOW | CONFIRMED | `BranchAccessResolverService.resolve` issues two independent lookups sequentially that could run in parallel. NOT fixed; recommended in 7B. |
| 3 | — | DISPROVEN | The per-request-new-WebSocket hypothesis. Pooling, metadata caching, and membership caching all work correctly. No action. |
| 4 | — | DISPROVEN | The `.next` 27 GB cache / "gap above the API" framing. The Next layer returns in ~10ms. No action. |
| 5 | — | DISPROVEN | Missing `--network-family-autoselection-attempt-timeout` as a latency cause. Measured, within noise. Recommended for reliability only (7E). |

---

## 9. Final state verification (post-cleanup restart)

API rebuilt without instrumentation and restarted plainly
(`node --enable-source-maps dist/main`, no `PERF002_TRACE`). Five consecutive requests:

```
2.87  <- FIRST request after restart: cold pool creation (~2.5s handshake) + the request.
0.80     Independent confirmation of the section-1 cold-connect measurement, and of the
0.97     fact that this cost is paid ONCE PER POOL, not per request — which is itself the
0.72     final nail in the disproven hypothesis.
1.03
```

Ledger balance after the final restart: **0.000000**.
