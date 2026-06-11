# Model Strategy & Privacy — Own the Brain, Rent the Mouth

> The build-vs-rent decision for a bootstrapped solo founder who refuses the easy-wrong way. Decided 2026-06-07.

## The Four-Way Split

| Tier | What | Tech | Cost | Where |
|---|---|---|---|---|
| **OWN** | All prediction & detection: demand forecast, dead stock, shrinkage anomalies, margin/debtor scoring, reorder optimization; **Mira's migration inference** (categories, prices, costs, terms, reorder levels, account types) + structural report-pathology detection | statsmodels / scikit-learn / XGBoost — classic ML, CPU only | ~$0/inference | Our Railway infra, next to the data |
| **BORROW** | Document extraction (invoices) | Cloud VLM (Gemini Flash class) behind an adapter → later self-hosted fine-tuned Qwen-VL-class on serverless GPU (pay-per-second, $0 idle) | ~$0.002/invoice now | Cloud now → ours later |
| **RENT** | Language only: import/COA assist (existing), Mira's schema-only ambiguous-tail + fuzzy party-name matching, future Copilot/NLQ, digest phrasing (optional — templates default) | Frontier/efficient LLM via LiteLLM (existing router, env-driven per-task routing) | per-token, scrubbed | Cloud, restricted inputs |
| **TRAIN LATER** | Import-mapping SLM, COA classifier, extraction model | Fine-tuned small models on accumulated correction data | when ≥100 tenants of corrections exist | Ours |

Why this wins for retail specifically: **80% of retail AI value is prediction on the tenant's own transaction stream** — which needs domain calibration and good features, not model size. Big competitors can rent the same LLMs we can; they cannot shortcut per-tenant calibrated forecasting and the correction datasets we accumulate. The moat is the OWN + TRAIN-LATER tiers.

## Privacy: "Your numbers never leave Zerupt" (hard constraint + public promise)

| Data | Where it's processed |
|---|---|
| Sales, prices, costs, customers, stock, GL — *the books* | ONLY Zerupt-owned code/models on Zerupt infra. Never sent to any external AI API. |
| Column headers, COA labels (import assist) | Cloud LLM, schema-level only (as today) |
| Supplier invoice images (scanner) | Cloud VLM in v1 — *supplier documents*, disclosed honestly; migrates to self-hosted |
| Future Copilot questions | Cloud LLM writes the *query plan*; OUR server executes it; numbers stay home. Results rendered locally, PII-scrubbed summaries only if LLM phrasing is ever needed. |

Marketing line: *"Your sales, your prices, your customers — never sent to OpenAI, Google, or anyone. Zerupt's own AI runs where your data lives."* Roadmap option: fully-sovereign tier (self-hosted LLMs, nothing touches cloud APIs) for gov/enterprise later.

## Cold-Start Data Plan (assuming Merpec didn't exist)

| Capability | Day-1 source | Gets smarter with |
|---|---|---|
| Forecasting | Public datasets (M5/Walmart, Favorita) to validate the *pipeline*; per-tenant models self-train on THEIR sales after 4–8 wks | each tenant's stream |
| Anomaly/shrinkage | No training data needed — tenant's own baseline (control charts) after ~2 wks | tenant baseline; cross-tenant priors later |
| Doc extraction | Pre-trained VLM works day 1 | every user correction |
| Import mapping | Existing ladder + alias dictionaries | every onboarding (existing cache) |

Merpec-era data = optional calibration/validation gold (only if consented + anonymized), never a dependency.

## Cost Guardrails (bootstrapped)

- OWN tier: $0 marginal — runs on existing Railway box; nightly CPU training for hundreds of tenants is trivial compute.
- BORROW: ~$0.002/invoice → 10,000 invoices/mo ≈ $20. Self-host trigger: when monthly VLM spend > ~$150 or privacy tier demands it.
- RENT: existing telemetry + soft budgets carry over; LLM remains last-rung.
- No idle GPUs ever. Serverless GPU (Modal/RunPod) only, pay-per-second, when we get there.

## Existing Code Disposition

- `apps/ai` LiteLLM router, prompts, import/COA endpoints: **keep** — they're the RENT tier, well built.
- **Party (customer/supplier) matching has no AI rung today** — pure exact match. Add fuzzy + LLM rungs (Arabic/English mixed names; Qwen-class models notably strong here). Same ladder shape as Sami's product matching.
- **Column-mapping rung 5 is muzzled** — clamped to the review band, never auto-applied. Un-muzzle: auto-apply above threshold with a badge + bulk accept (matching-UX doctrine, `07`).
- Unused `pgvector`/`psycopg2` deps: psycopg2 becomes used (feature pipeline reads tenant DBs); pgvector stays until RAG/Copilot phase decides.

## Model Routing Refresh (near-term, 2026-06-07)

- **Stale defaults to retire:** `gpt-5`/`gpt-5-mini` placeholders, OpenAI-only, stale "Sonnet" comment. Move to **env-driven per-task routing** via the existing LiteLLM router (different task → different model, set by env, no code change).
- **Candidates under evaluation:** DeepSeek V3-class, Qwen3-class (strong on Arabic/English mixed names — good for party matching), Gemini Flash class (extraction), OpenRouter as an optional single-key gateway across providers.
- `AI_SERVICE_URL` must be set explicitly in Railway + local docs (currently silently defaults to `localhost:3002`).
- **Resolved 2026-06-07** — see model selection matrix below; per-task routing decisions are final.

## Model selection matrix (researched 2026-06-07)

### Per-task routing decisions

| Task | Primary | Fallback | Pricing (in/out per Mtok) | Why |
|---|---|---|---|---|
| **T1** Column mapping (headers → schema fields) | Gemini 2.5 Flash-Lite | DeepSeek V4-Flash via Fireworks (~$0.14/$0.28 + ~30% host premium) | $0.10 / $0.40 | Cheapest solid JSON-schema output; US/GDPR-safe |
| **T2** COA label classification (EN-dominant) | DeepSeek V4-Flash direct — schema-only strings, no PII | Groq Llama 3.1 8B ($0.05/$0.08) | $0.14 / $0.28 | Excellent instruction-following + native JSON |
| **T2** COA classification (AR-dominant) | Qwen3 32B on Groq | — | $0.29 / $0.59 | Materially better Arabic; US-hosted, no training on data |
| **T3** Schema inference (headers + sample rows) | DeepSeek V4-Flash (1M ctx) | Gemini 2.5 Flash (messy/ambiguous CSVs) | $0.14 / $0.28 primary; $0.30 / $2.50 fallback | Long context for wide CSVs; Gemini for noisy inputs |
| **T4** Entity/party matching at scale (AR/EN mixed names, batches) | Qwen3 32B on Groq (131K ctx) | Qwen3 235B on Cerebras free tier (1M tok/day free, 8K ctx cap → ~100 names/call) | $0.29 / $0.59; fallback $0 | Best AR+EN mixed quality; ~$0.004 per 500-name batch |
| **Invoice VLM** (Sami) | Gemini 2.5 Flash | Gemini 2.5 Flash-Lite for clean PDFs | $0.30 / $2.50 primary; $0.10 / $0.40 fallback | **Gemini 2.0 Flash deprecated/shutdown June 2026 — do not use** |

### Cost reality

Full onboarding AI (T1–T4) ≈ **$0.40–1.50 per 1,000 onboarding operations**; ~$1.50/mo at 100 onboardings/mo. Cost is NOT the constraint for migration AI — the rung-5 muzzle never saved meaningful money. Real cost watch = future real-time POS/copilot volume.

### Provider postures

| Provider | Jurisdiction / Privacy | Notes |
|---|---|---|
| **DeepSeek direct API** | China servers; trains on inputs; no SOC2/DPA | Allowed ONLY for pure schema/header/label strings (no PII). Disclose in privacy policy. Privacy-clean path: Fireworks or Together (US, SOC 2 Type 2, explicit no-training), ~30–50% premium. |
| **DashScope (Alibaba direct)** | Similar jurisdiction concerns; intl free tier needs CN phone | Prefer Qwen via Groq or Cerebras. |
| **Groq** | US; no training on data | Free tier: 30 RPM / 1K RPD. Ultra-fast inference. |
| **Cerebras** | US; no training on data | Most generous free tier: 1M tok/day, no card required; Qwen3 32B/235B + Llama 3.3 70B; 8K ctx cap on free tier → dev/staging inference bill = $0. |
| **Mistral** | EU/GDPR; cheap | Weak Arabic — EN-only fallback at best. |
| **OpenRouter** | Varies per model | Use as ONE provider inside the existing LiteLLM router (not a replacement). BYOK: first 1M req/mo fee-free, then 5%; 5.5% credit-purchase fee; no SLA (3 outages/8mo). Enable ZDR globally + training opt-out. Value = automatic cross-provider fallback for a no-ops-team setup. Verify per-model markup before routing Anthropic traffic through it. |
| **opencode / Zen** | N/A | Interactive coding tool, not runtime infra — irrelevant to `apps/ai`; possibly useful as a founder dev tool. |

### LiteLLM routing shape

```yaml
# env-driven; no code change to switch models
routes:
  column-mapper:        gemini/gemini-2.5-flash-lite-preview-06-17
  coa-classifier-en:   deepseek/deepseek-chat          # V4-Flash
  coa-classifier-ar:   groq/qwen-qw3-32b
  schema-infer:        deepseek/deepseek-chat
  entity-matcher:      groq/qwen-qw3-32b
  invoice-vlm:         gemini/gemini-2.5-flash

fallbacks:
  column-mapper:        fireworks/deepseek-v4-flash
  schema-infer:         gemini/gemini-2.5-flash
  entity-matcher:       cerebras/qwen3-235b            # free tier, 8K ctx cap

globals:
  response_format:      json_schema                    # structured output everywhere
  num_retries:          2
  timeout:              30                             # seconds
  t4_batch_size:        400                            # names per call

env_keys:
  - GEMINI_API_KEY
  - DEEPSEEK_API_KEY
  - GROQ_API_KEY
  - CEREBRAS_API_KEY
  - FIREWORKS_API_KEY                                  # privacy-clean DeepSeek path
```

### Uncertainty flags (verify before build)

- Fireworks/Together V4-Flash SKU pricing — confirm current rates before wiring.
- DashScope intl access — confirm if non-CN phone works; prefer Groq path until confirmed.
- OpenRouter Claude markup — verify actual markup per model before routing Anthropic traffic through it.
- Gemini 3.x GA status — treat Gemini 2.5 Flash-Lite as the stable production tier until GA confirmed.
