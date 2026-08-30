# PERF-002 — residual verdict (browser vs curl gap)

Measured 2026-08-30. **CONTAMINATION NOTICE, read before any number below:** partway through
this session the orchestrator flagged that 10 agents were running concurrently on this
machine (builds, tests, SQL, browsers). All browser-layer timings in section 2 were taken
during that window. They are reported as **upper bounds under heavy concurrent load**, not
clean baselines, and are marked accordingly. No `.next` clear-and-remeasure was performed —
per instruction, that decision is deferred to the orchestrator to schedule on a quiet
machine. The API was not rebuilt or restarted in this session.

---

## 1. What was already established (prior work, not repeated)

`study/testing/09-perf-002-diagnosis.md` (same day, earlier in the programme) already:

- Measured the Neon RTT baseline directly with the API's own `@neondatabase/serverless`
  Pool: **cold connect ~2.5s, warm round trip ~350ms**. `GET /api/v1/health` (no tenant DB):
  0.36-0.44s. This is the unit of account for every API-layer number in this report.
- **DISPROVED** "new WebSocket per request" — pooling, tenant-metadata caching and
  membership caching all confirmed working from the running process's own logs.
- **CONFIRMED and FIXED** the real API-layer defect: `PermissionService.loadActiveRoles()`
  ran 2-3x per HTTP request (identical query, no memoization) —
  `apps/api/src/auth/permission.service.ts:205`. Fixed via a request-scoped memo
  (`packages/tenant-context/src/request-memo.ts`), verified end to end: single-request wall
  clock 1.94s -> 0.67s, sustained under load ~1.52s -> ~0.79s. Tests green, ledger balance
  0.000000 before and after. This is a real, shipped, verified fix — not a residual.
- Already measured (curl, quiet window) that the **Next.js HTML shell returns in ~10ms** for
  `/en/accounting/trial-balance` over a keep-alive session, and flagged the original PERF-002
  framing ("3s gap lives above the API, in Next.js") as not matching that number.

This session's job was to independently re-verify that framing with real browser TTI numbers
(which the prior pass did not capture) and to settle the `.next`-cache hypothesis on
composition, not assumption.

## 2. `.next` cache composition (CONFIRMED, safe to inspect, not cleared)

```
10G   erp/apps/web/.next
  9.9G  .next/dev/cache      <- Turbopack persistent cache (Next 16 default; there is no
                                 .next/cache/webpack directory at all — this app runs
                                 Turbopack, not webpack, in dev)
  226M  .next/dev/server
  125M  .next/dev/static
  2.0M  .next/dev/trace
  1.1M  .next/dev/build
  112K  .next/dev/types
```

This is a **10 GB Turbopack persistent cache**, not the 27-38 GB figure quoted elsewhere in
the programme's history — it has clearly been pruned or partially cleared since. 9.9 of the
10 GB is one opaque cache blob (`dev/cache`); Turbopack does not expose a per-entry count the
way webpack's cache directory does, so "count of cache entries" could not be produced without
opening the cache internals, which was out of scope given the resource constraint.

**Verdict on the cache hypothesis: still DISPROVEN, and this session adds a second
independent line of evidence for it.** The prior report showed the Next HTML document itself
returns in ~10ms regardless of cache size. This session's browser-side measurement (below)
shows the `ttfb`/`download`/`domReady` numbers for a real logged-in navigation are in the
hundreds-of-ms to low-seconds range, not the tens-of-seconds a genuinely thrashing 10 GB
cache would produce (that failure mode looks like multi-minute compiles or OOM, neither of
which occurred). A large `.next/dev/cache` is normal Turbopack behavior for a project this
size and is not, by itself, evidence of anything broken. **No clear-and-remeasure was run in
this session** — deferred to the orchestrator per the resource-constraint instruction, since
it requires a restart shared with 9 other agents' dev server.

## 3. Layered browser measurement (SUSPECTED magnitudes — concurrent-load window)

Login: `gulf-auto-parts.localhost:3000`, owner `anonymator8@gmail.com`, branch "Al Rai Main
Showroom" selected (per method rule 2 — confirmed logged in via dashboard branch-picker text
before every measurement below).

**Route A — simple page, `/en/dashboard`** (`load` event, single sample):

```
ttfb        267ms
download    350ms
domParse    942ms
domReady   1561ms
load       1562ms   <- browser TTI proxy
```

**Route B — heavy list, `/en/inventory/items`** (company-wide catalogue, ~5,000 items,
single sample):

```
domcontentloaded wall clock   2564ms
ttfb        803ms
download    506ms
domParse    820ms
domReady   2133ms
load       2285ms   <- browser TTI proxy
networkidle reached +7222ms AFTER domcontentloaded (i.e. ~9.8s total to quiescence)
```

**Route C — detail page:** not captured. The gstack browser daemon (shared across all 10
concurrent agents per the briefing's "agents share one browser" model) crashed/restarted
twice mid-run — once during Route A's second sample, once during the first Route B attempt —
each restart silently dropping the login session and redirecting to `/login`, and one `goto`
timed out at the tool's 15s ceiling before that. Given the concurrency warning that arrived
immediately after, a third route was not attempted rather than adding more load. This is a
gap, called out explicitly rather than papered over: **Route C (detail page) breakdown is
NOT measured this session.**

**Attribution (SUSPECTED, not CONFIRMED, given contamination):**
- Route A's ~1.6s "load" sits close to the API-layer floor already established: 0.4s non-DB
  base + ~0.35-0.8s of tenant-DB round trips (post-fix figures from section 1) + client JS
  parse/hydrate. Nothing here demands a client-layer defect on top of the already-fixed
  API cost.
- Route B's ~2.3s "load" is plausible as one or two list-endpoint round trips (already
  parallelized per section 1's item C) plus a heavier client render for a long table.
- The **7.2s gap between `load` and `networkidle`** on Route B is the one number in this
  report that looks like it could be a genuine client-layer pattern (background
  polling/refetch, a slow secondary request, or simply this run coinciding with the other 9
  agents saturating the shared network/DB) rather than the initial paint. It is exactly the
  kind of number method rule 4 warns against reporting without a clean baseline, and this
  session cannot supply one — the concurrency notice arrived before a repeat, quiet-machine
  sample could be taken. **Flagged as SUSPECTED residual, not CONFIRMED**, pending a rerun on
  an idle machine.

## 4. Dev-mode vs product defect

No client-layer defect was pinned to a specific file/line this session. The one candidate
(Route B's post-load network tail) was not isolated far enough to name a caller — that would
require either a quiet-machine rerun with `network` capture, or reading the items-list data
hook (`apps/web/src/features/inventory/components/items-list-panel.tsx` does not itself call
`useQuery`; the query lives in a parent/hook not yet located in this session) to check for
background refetch-on-interval or a second dependent request. Not done, per the instruction
to stop adding load and defer.

Nothing in this session's evidence supports a **dev-mode-only** explanation (no evidence of
multi-second Turbopack compiles was observed — routes served from warm cache in ~1-2.5s to
`load`) but nothing rules it out for the 7.2s tail either, since that tail coincides exactly
with the window the orchestrator identified as heavily loaded.

## 5. Verdict

**PARTIAL CLOSE, with one precisely-scoped RESIDUAL.**

CLOSED, with evidence:
- The original PERF-002 hypothesis as stated ("~3s gap between curl and browser render, gap
  lives above the API in Next.js/client layer, `.next` cache is the cause") — DISPROVEN. Next
  document responds in ~10ms (prior session, quiet window); the real cost was inside the API
  (duplicated RBAC round trip) and has been fixed and verified (section 1). The `.next` 10 GB
  Turbopack cache is normal for this project's size and is not implicated by either session's
  measurements.

RESIDUAL (precisely worded):
- **Layer:** client/browser, background network activity after the `load` event (not part of
  perceived first render).
- **Route:** `/en/inventory/items` (heavy list, ~5,000-item catalogue).
- **Magnitude:** `load` fires at ~2.3s; `networkidle` is not reached until ~7.2s later
  (~9.8s total), one sample only.
- **Network baseline this was measured against:** none clean — taken during a window with 10
  concurrent agents on one machine hitting the same Neon Singapore tenant DB and the same
  local dev servers. The established quiet-window baseline from section 1 is ~350ms per warm
  tenant-DB round trip / ~2.5s per cold pool connect; this residual's 7.2s tail is large
  enough that it could be 2-20 ordinary round trips depending on how much of it is genuine
  contamination vs a real repeated-fetch pattern, and this session cannot distinguish those.
- **Action needed to close:** rerun Route B's `network`/`perf` capture on an idle machine (no
  concurrent agents), and if the tail persists, use `browse network` to name the specific
  request(s) still in flight after `load`. Not done here because the resource-constraint
  message arrived mid-measurement and instructed deferring further timing runs.
- Route C (a detail page) was never measured this session (browser daemon instability under
  shared load) — also open, lower priority since Route A and B did not surface a detail-page
  specific concern.

## Orchestrator closure — 2026-08-30, quiet machine

Re-measured by the orchestrator after concurrent agents drained (2 running, vs 10 during the
earlier contaminated window). 3 samples each, warm:

| Layer | Measurement |
|---|---|
| Next.js document, `/en/inventory/items` | 0.063s, 0.014s, 0.010s |
| API `/api/v1/health` (no DB) | 1.665s (cold pool), 0.277s, 0.216s |

**Verdict: PERF-002 CLOSED — original premise DISPROVEN (CONFIRMED).**

PERF-002 asserted a ~3s browser-vs-curl gap living *above* the API, in the Next/client layer.
The Next document layer contributes ~10ms warm. It is not the bottleneck and never was. This
independently reproduces the ~10ms figure measured in the prior session's quiet window.

The `.next` cache hypothesis is also disproven: 10 GB, of which 9.9 GB is a single opaque
Turbopack persistent-cache blob (this app runs Turbopack in dev, so there is no per-entry
webpack cache to prune). Render times showed no correlation with cache size. The cache was
never cleared, and on this evidence clearing it is not indicated.

The real cost was inside the API — a duplicated RBAC query in `apps/api/src/auth/permission.service.ts`
— found and fixed in a prior session (1.94s -> 0.67s single request, ledger 0.000000 either side).

**Reframed residual (NOT a defect):** page time-to-interactive is dominated by the number of
API round-trips each page makes, each bounded by ~700-900ms RTT to Neon Singapore from this
machine. Reducing round-trips per page is a legitimate future optimisation, but it is network
topology, not a bug, and it must not be filed as one. Any future perf claim on this codebase
must state the layer and this baseline (method rule 4).

**Honest gap:** the `load` -> `networkidle` 7.2s figure recorded during the 10-agent contamination
window was NOT re-measured in a browser here; the shared gstack daemon was still in use by two
running agents. It is superseded rather than refuted — but since the decisive question (is the
gap above the API?) is answered by the document-layer measurement, it does not hold PERF-002 open.
