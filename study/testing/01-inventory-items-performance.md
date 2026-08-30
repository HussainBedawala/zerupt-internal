# Items list performance — investigated, and largely a DEV-ENVIRONMENT artifact

## The headline correction
The raw browser numbers (5-21s) look alarming and would justify a re-architecture. **They do not.**
Most of that time is this laptop's network distance to Neon in **ap-southeast-1 (Singapore)**,
not product code.

### Measured, layer by layer
| Layer | Time |
|---|---|
| **Postgres execution** (EXPLAIN ANALYZE, page 1, limit 25) | **5.5 ms** (planning 1.0 ms) |
| Nest API via curl, warm, same query | **1.86 - 1.95 s** |
| Browser, same warm query | **5.1 s** |

And the decisive measurement — raw network to the Neon host from this machine:

| Sample | TCP connect (~1 RTT) | TLS handshake | Total |
|---|---|---|---|
| 1 | 0.93 s | 1.54 s | 2.61 s |
| 2 | 0.71 s | 1.17 s | 2.68 s |
| 3 | 3.19 s | 3.59 s | 4.31 s |

**RTT to the database is roughly 700-900 ms, occasionally 3 s.** Every SQL round trip on this
machine costs about a full second before Postgres does 5 ms of work.

### That reconciles everything
The API issues **4 serialized round trips** per items request:
1. Permission check in `PermissionGuard` (`inventory.item.list`)
2. **A SECOND permission check** in `ItemsController` (`inventory.cost.view`) - same user, same
   request, same query shape
3. `rowsQuery` (items + 4 correlated subqueries)
4. `count()` for pagination

4 x ~700 ms ≈ 2.8 s, against a measured warm API floor of ~1.9 s. The floor is round-trip
latency, not query cost.

**In production this mostly evaporates.** The API runs on Railway co-located with Neon, where RTT
is single-digit milliseconds: the same 4 round trips cost ~40 ms, not ~2.8 s.

**Do NOT re-architect the items list based on the raw dev numbers.**

---

## What IS genuinely worth fixing (portable, real in production too)

### PERF-001 — MEDIUM — Redundant permission round trip on every request
`apps/api/src/auth/permission.guard.ts` loads the user's roles to check `inventory.item.list`.
Then `apps/api/src/inventory/items/items.controller.ts:99-104` (and again at 121, 201, 220)
calls `permissionService.hasPermission(...)` a SECOND time for `inventory.cost.view` - same user,
same request, same query shape.

`permission.service.ts` has **zero request-level caching** (its own comment says so: "the roles
are read fresh on every call"), and it ALREADY exposes `evaluatePermissions()` designed to
evaluate several keys off ONE role load. The guard and controller just never share.

25% of the round trips on this endpoint are pure waste, in every environment.
**This is auth code**, so it goes through review rather than a quick patch.

### PERF-002 — HIGH, still unexplained — a ~3 second gap between curl and browser
Identical warm request: **1.9 s via curl** vs **5.1 s in the browser**. That ~3 s sits ABOVE the
API, in the Next.js/client layer, and would affect real users in production too.
This is now the single largest unexplained cost. Candidates: an SSR proxy hop, a client-side
request waterfall, or a token refresh per navigation.
**Not yet investigated. Higher value than any API-side fix.**

### PERF-003 — LOW, preventive — `items` is still a Seq Scan
Trivial at 5,000 rows (1.3 ms) and NOT today's problem, but the plan is one growth cycle from
mattering. A `(tenant_id, created_at desc, sku)` composite index would future-proof it.

### PERF-004 — observed — intermittent connection-pool eviction
`/tmp/zerupt-logs/api.log` shows `Tenant pool ping failed: ping query timeout` followed by
`Health check failed, evicting stale client`, then cache hits resume. The LRU pool logic in
`packages/tenant-context/src/tenant-connection.service.ts` is correctly written and self-heals.
Given a 700-900 ms RTT, a ping timing out on this connection is expected. This explains the
worst OUTLIERS (20.8 s cold load) but not the steady floor.
**Likely a dev-network symptom. Re-measure in production before tuning anything.**

---

## Ruled OUT (measured, not assumed)
- **Deep OFFSET pagination.** page=50 and page=150 returned in 1.92 s / 1.82 s - no growth with
  page depth. At 5,000 rows OFFSET is cheap. Not a cause.
- **N+1 in row mapping.** Per-row work (on-hand, average cost, barcode, category) is already
  pushed into correlated SQL subqueries inside ONE query, not a JS loop. Verified by reading
  `list()` end to end. This part is well built.
- **Index coverage.** Every subquery hits its index: `msl_item_warehouse_idx`,
  `icp_tenant_item_entity_idx`, `item_barcodes_item_id_idx`, `item_categories_tenant_parent_idx`.

## Method note
The earlier "nothing under 4 seconds" table was measured through a browser on a laptop ~800 ms
from the database. Any future performance claim in this programme must state which layer it
measured and what the network baseline was, or it is not actionable.
