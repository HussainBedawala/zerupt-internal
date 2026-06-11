# AI Engine — Architecture

> Principle: **Python thinks, NestJS acts.** Decided 2026-06-07. Chosen to survive 10 years: Python owns the ML ecosystem (sklearn/XGBoost/statsmodels/PyTorch and everything coming next); NestJS owns tenant data, permissions, and audit.

## The Split

```
┌────────────────────────── apps/ai (FastAPI, Railway) ──────────────────────────┐
│  THE BRAIN — reads tenant data, never writes business tables                   │
│                                                                                │
│  engine/features/    SQL → per-tenant feature frames (sales velocity, stock    │
│                      age, void rates, margin series, debtor aging)             │
│  engine/models/      forecast (demand) · anomaly (POS/shrinkage) ·             │
│                      deadstock scoring · margin/receivables rules+scoring      │
│  engine/registry/    per-tenant trained model artifacts + metrics              │
│                      (Postgres bytea/S3; versioned; per-tenant isolation)      │
│  engine/jobs/        nightly train · daily/hourly score → insights             │
│  extraction/         invoice/doc extraction (VLM behind an adapter)            │
│  migration/          report-pathology detectors + consolidation graph +        │
│                      inference (Mira) — structural, vendor-agnostic            │
│  llm/                existing import/COA assist + future language features     │
│  routers/            /ai/insights · /ai/extract · /ai/import · /ai/coa ·       │
│                      /ai/migrate (detect/consolidate/infer)                    │
└───────────────┬────────────────────────────────────────────────────────────────┘
                │ scored insights / drafts / extractions (JSON, internal token)
┌───────────────▼────────────────────────── apps/api (NestJS) ───────────────────┐
│  THE ACTOR — owns tenant DBs, RBAC, audit, money                               │
│                                                                                │
│  ZeeModule          insight cards table · digest assembly · delivery channels  │
│  ScannerModule      scan job lifecycle · matching · draft purchase · post      │
│  MigrationModule    Mira: import session · consolidation graph · decision      │
│                     cards · create-by-default matching · suspense parking ·    │
│                     writes products/parties/COA/opening JEs (audited)          │
│  + existing modules (purchase, inventory, accounting) execute approved actions │
└───────────────┬────────────────────────────────────────────────────────────────┘
                │
┌───────────────▼────────────────────────── apps/web ────────────────────────────┐
│  THE FACE — Zee surfaces                                                       │
│  Team screen (roster + unlock progress) · Insights feed · digest ·             │
│  Scan & review flow · approve/dismiss actions                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Rules of the Boundary

1. **The brain reads, never writes business data.** `apps/ai` gets read-only access to tenant DBs (read-only connection role) for feature extraction. All writes — insight cards, draft purchases, postings — happen in NestJS with RBAC + audit.
2. **NestJS is the only actor.** An approved insight action executes through the same service path as a manual user action (same validation, same audit log, same events). AI-originated mutations are tagged (`origin: 'zee'`, `agentKey`, `insightId`) in the audit trail.
3. **Insights are data, not side effects.** The brain returns scored insights; NestJS persists them to `insight_cards` (tenant DB), applies rate limits and dedup, and routes to delivery channels.
4. **Internal auth as today:** shared-secret `x-internal-token` between NestJS ↔ FastAPI. No public ingress to `apps/ai`.

## Tenant Isolation

- Per-tenant DBs remain the hard wall (unchanged).
- Models are trained **per tenant** on that tenant's data only; artifacts keyed by tenantId in the registry. No cross-tenant feature mixing in v1.
- Cross-tenant learning (priors, global defaults) is a later phase and only on anonymized aggregates — never raw rows.

## Scheduling

- Nightly per-tenant: feature refresh → (re)train where due → score → push insights to NestJS.
- Orchestrated by pg-boss in NestJS (it owns tenant registry + job infra post-DEV-388): NestJS enqueues per-tenant jobs that call `apps/ai` endpoints. Keeps one queue system; the brain stays stateless per request.
- Event-driven hooks (e.g., large void at POS) come later; v1 detectors are batch.

## Insight Card Model (tenant DB, NestJS-owned)

Carried over from the old spec's suggestion model, renamed and money-framed:

```
insight_cards
  id · tenantId-scoped DB · agentKey (mira|sami|noor|arjun|tariq|maya)
  severity (info|warning|critical) · title · body (markdown, bilingual keys)
  moneyAmount + currency (nullable — the headline number when present)
  suggestedAction (typed JSON: createPO | viewReport | adjustPrice | ...)
  contextData (JSON: SKUs, docIds, evidence)
  status (open|accepted|dismissed|expired) · dismissReason · feedback
  modelVersion · confidence · createdAt · expiresAt · resolvedBy/At
```

Safety carried over verbatim from the archived spec: suggest-only writes, immutable audit on every lifecycle event, per-agent daily rate limits, critical bypasses limits, per-tenant agent disable.

## Near-Term Infra Fixes (current-state audit, 2026-06-07)

Found while specifying Mira; carry into the migration build (model-routing items live in `05-model-strategy.md`):

1. **Party matching has no AI rung.** Customer/supplier matching is pure exact-match today — add fuzzy + LLM ladder rungs (Arabic/English mixed names; Qwen-class models are notably strong here). Same ladder shape as Sami's product matching.
2. **Column-mapping rung 5 is muzzled.** Its output is clamped to the review band and never auto-applied. Un-muzzle: auto-apply above threshold with a badge + bulk accept (the matching-UX doctrine).
3. **No health signal — silent degradation everywhere.** AI service down / missing key currently returns empty suggestions with no signal. Add a health check at onboarding start, a visible status ("Mira is on the job ✓ / offline — manual mode"), and telemetry of AI-resolved vs manual-resolved per import.
4. **`AI_SERVICE_URL` silently defaults to `localhost:3002`.** Must be set explicitly in Railway and documented in local `.env`.

## Degradation Matrix

| Component down | Effect |
|---|---|
| `apps/ai` | No new insights/scans; everything else untouched. Scanner shows "Sami is offline — enter manually." Migration shows "Mira is offline — manual mode": Layer 1 structural detectors still run (pure code, no model), only the schema-LLM tail + inference degrade to manual matching. |
| Cloud VLM (extraction) | Scanner degrades to manual entry; queued photos retried. |
| Cloud LLM (language) | Detector cards already use templates — zero effect on money-found. Import assist degrades as today. |
| Model not yet trained (new tenant) | Agent shows as "joining in N days" — by design, not an error. |
