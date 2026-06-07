# AI Engine — Foundation Plan (current-state audit → solid core)

> Audited 2026-06-07 against the code on `phase-5/import-dialog-ux` (commits 99e909e, 4a092af). This is the gap map and the build order for a core that anything — Mira, Sami, the detectors, Copilot — can stand on without rework.

## A. What We Have (verified solid — build on, don't rebuild)

| Asset | State | Why it matters |
|---|---|---|
| Column ladder rungs 1–5 (`apps/api/src/import/resolver/`) | Real, tested, AR-aware (windows-1256, `;` delimiters) | Mira's Layer-1 ladder seed |
| Learned-mapping cache (`importLearnedMappings`, fingerprint-keyed, graceful-degrade) | Real | THE flywheel primitive — Mira's learned-fingerprint store extends this |
| `ParsedFile {headers, rows}` contract + staging (`importJobs`/`importJobRows`, resumable, idempotent) | Real | Pre-processors can be inserted before it without touching downstream |
| Reconciliation gate (`reconciliation.service.ts`) — actually 6–8 way: 5 source totals + ledger-balanced + inventory/AR/AP sub-ledger cross-checks, advisory-lock mutual exclusion, OBE park | Production-grade | Mira Layer 2's final arbiter, as specced |
| AR/AP per-party opening import (4a092af): party-tagged JE lines, control-account locks, tie-out | Real, new | Layer 2 sits directly on it |
| `apps/ai` LLM plumbing: structured output, retry-once, injection defense, hermetic tests, internal token, Sentry | Real | RENT-tier base |
| Tenant registry (`tenant_databases`, AES-256-GCM creds, `resolveAllActive()`) + LRU connection pool | Real | The brain's path to tenant data exists — behind NestJS only |
| pg-boss (generic ensureQueue/send/fetch) | Real, provisioning-only | New job types are cheap to add |
| Dialog import flow (5 steps, auto-band pre-confirm, resume) | Real | Mira's workspace shell |

## B. What's Wrong / Missing (the honest gap map)

### Foundation blockers (cross-cutting — fix once, everything benefits)

1. **Python has no eyes.** `apps/ai` has zero DB connectivity (psycopg2 installed, never called). No read-only tenant role exists (single owner role per tenant DB), no credential vending. The entire OWN tier (detectors, Layer-3 inference) is blocked on this.
2. **No scheduler anywhere.** pg-boss `schedule:false` (Neon cost, DEV-388), no `@nestjs/schedule`. Nightly train/score loops have nowhere to hang.
3. **Single-file imports only.** No migration session / cross-file graph; one `entityType` per job; 50k-row sync-only cap. Mira Layer 2 has no spine.
4. **Parser assumes clean tables.** Zero structural pre-processing: no subtotal/footer detection, no pivots, no title-row discovery, no Arabic-Indic digits, no `DD/MM/YYYY` parsing, first-sheet-only. Mira Layer 1 is 0% built.
5. **Raw files are discarded after parse.** No replay with improved pre-processing, no fixture accumulation, no training corpus. Must retain (private bucket, signed URLs — today's storage service only does public URLs).
6. **No push channel.** No WebSocket/SSE; everything polls. Mira's live narration and scan progress need at least SSE.
7. **Model routing can't express the 05 matrix.** Two global config fields (`extraction_model`/`reasoning_model`), direct `acompletion`, no LiteLLM Router, no fallbacks, stale `gpt-5*` defaults, only OpenAI/Anthropic keys plumbed.
8. **Silent degradation everywhere.** AI down → empty suggestions, no signal; `AI_SERVICE_URL` silently defaults to localhost; Sentry in `apps/api` is a stub (DEV-229); LLM telemetry is in-memory only. We cannot *measure* the AI we ship — violates the measured-before-marketed rule.

### Product-layer gaps (per agent)

- **Mira:** no pathology detectors, no consolidation graph/decision cards, no COA create-by-default (the 55-account wall is real and verified: every below-threshold label = one dropdown), no bulk-accept for attention cards, no suspense parking, no narration, no zero-file fast path.
- **Sami:** nothing exists (extraction adapter, scan jobs, matching, review screen, correction capture).
- **Detectors (Phase B):** no `insight_cards`, no feature pipeline, no model registry, no scoring jobs — all green-field, but cheap once blockers 1–2 land.

## C. The Foundation (F0) — the bedrock layer, built first

Everything below is agent-agnostic plumbing. Order chosen so each item unblocks the most downstream work per day spent.

| # | Work | Unblocks | Size |
|---|---|---|---|
| F0.1 | **Per-task LiteLLM routing**: Router instance + env-driven task→model map per the 05 matrix (column-mapper, coa-classifier-en/ar, schema-infer, entity-matcher, invoice-vlm) + fallback chains + provider keys (Gemini/DeepSeek/Groq/Cerebras/Fireworks) + retire `gpt-5*` defaults | Every LLM call present & future | 1 d |
| F0.2 | **No silent degradation**: `/health` consumed by NestJS at onboarding/scan start → visible agent status; explicit `AI_SERVICE_URL` (fail-fast in prod); re-enable Sentry in api; AI-resolved vs manual-resolved counters with a real sink (PostHog or Sentry metrics) | Trust, the accuracy discipline, debugging everything | 1 d |
| F0.3 | **File retention**: private `import-files` bucket + signed URLs + store fileRef on `importJobs`/scan jobs; retention policy | Replay, fixtures, correction corpus, Sami photos | 0.5 d |
| F0.4 | **Read-only tenant role + vending**: `zerupt_readonly` role provisioned in `create-db.step.ts` + backfill migration across tenants; `dbUserReadonly`/`dbPasswordReadonlyEnc` columns; internal NestJS endpoint vends per-tenant read-only URLs to `apps/ai`; Python `db.py` (connection cache, statement timeout, `options=-c default_transaction_read_only=on` belt-and-suspenders) | The entire OWN tier | 2 d |
| F0.5 | **Scheduler**: `@nestjs/schedule` cron in API container → enqueues per-tenant pg-boss jobs (keeps `schedule:false` on Neon); job type registry pattern for `ai.*` queues | Nightly train/score, digest assembly | 1 d |
| F0.6 | **Progress channel (SSE)**: one generic `@Sse()` job-progress endpoint backed by Postgres NOTIFY (no new infra); web hook `useJobProgress(jobId)` | Mira narration, Sami scan progress, long imports | 1.5 d |
| F0.7 | **Correction-capture primitive**: one generic `ai_corrections` table (tenant DB: domain, refId, fieldPath, suggested, corrected, confidence, modelVersion) + tiny write API — used by import mapping today, Sami and Mira immediately | The flywheel, principle #6, train-later tier | 0.5 d |

**F0 total ≈ 7.5 focused days.** It contains zero throwaway work — every line is load-bearing for all six agents.

## D. Build Order on Top of F0

```
F0 (bedrock)
 ├─ F1 Mira deterministic core (needs F0.1–.3, .6)         ← MVP wedge
 │    1. migration_sessions + multi-file intake (files → jobs DAG; raw files retained)
 │    2. Layer-1 pathology detectors (pure code, apps/ai/migration/, fixture-driven
 │       on the 11-file Kuwait set) emitting repairs into the ParsedFile contract
 │    3. Matching-UX doctrine: COA create-by-default + bulk-accept by band + undo
 │       queue (kills the 55-account wall; web + api)
 │    4. Layer-2 consolidation graph + decision cards → feeds existing recon gate
 │    5. Strictness tiers + suspense parking + zero-file <5-min path + narration (SSE)
 ├─ F2 Sami scanner (needs F0.1–.3, .6, .7)                ← MVP hook
 │    extraction adapter (invoice-vlm route) → scan jobs → matching (reuses ladder
 │    shapes; adds the missing party fuzzy/LLM rungs) → review screen → 1-tap post
 └─ F3 Detector substrate (needs F0.4, .5, .7)             ← Phase B, post-launch
      feature pipeline → model registry + quality gates → scoring jobs →
      insight_cards + feed + digest → Noor → Maya → Tariq → Arjun
```

## E. Reality Check vs June 15 (8 days, solo, MVP close-out in parallel)

F0 (7.5d) + F1 (≈5 slices) + F2 (≈6d) does not fit in 8 days. The honest cut:

- **MVP-critical F0 subset (~3 d):** F0.1 routing + F0.2 health/no-silent-degradation + F0.3 file retention + F0.7 corrections table. Defer F0.4/F0.5 (OWN-tier plumbing — needed for Phase B, not for launch) and F0.6 (narration can ship as fast polling first, SSE in Phase B).
- **Then pick ONE agent to be real at launch.** Recommendation: **Mira slices 1–3** (multi-file intake + Layer-1 detectors for the top 4 pathologies + matching-UX doctrine) — migration is the locked GTM wedge and the current 55-account wall actively hurts every onboarding TODAY. Sami follows immediately after launch as the content/ads engine (his spec is self-contained; nothing in F0 rots).
- Alternative if launch content demands the scanner: ship Sami thin (extract → draft, manual completion) and Mira slice 3 only (the matching wall fix). Decide by which promise launch is making.

## F. Foundation Quality Bars (apply to every F-item)

- Tenant isolation proven by test (read-only role cannot write; vending endpoint auth'd).
- Every AI call: task name, model, tokens, cost, latency, resolved-vs-corrected → telemetry sink. No unmeasured AI in production.
- Every new table: Drizzle schema + migration + audit pattern where mutating.
- Every external dependency: explicit health + degraded-mode behavior written in code, not assumed.
- Fixtures: the 11-file Kuwait set checked into a test-fixtures location (anonymized) and run in CI against Layer-1 detectors.
