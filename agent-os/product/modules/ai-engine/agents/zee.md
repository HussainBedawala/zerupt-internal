# Zee — The Master Agent ("Your AI Partner")

> Responsibility card. Deep specs: `../04-zee-and-the-team.md` (persona/roster), `../01-architecture.md` (insight cards, boundary). Format: AI-friendly — load this one file to understand Zee completely.

```yaml
agentKey: zee            # the master; sub-agents: mira, sami, noor, arjun, tariq, maya
gender: female           # founder decision 2026-06-07 — Zee is "she" in all copy/translations
role: The single customer-facing voice and orchestrator of the agent team
status: persona live at launch (team screen + digest framing); Copilot/chat = Phase D
tier: RENT (language only) — Zee has NO models of her own
```

## What Zee IS

- **The voice, not a worker.** Zee never detects, extracts, or migrates anything. Sub-agents produce results; Zee *presents* them. "Noor found 6,200 KWD" is Zee speaking about Noor's output.
- **The orchestration identity.** The digest is from Zee. The team screen is "Zee's team." Future chat (Phase D Copilot) = talking to Zee. Users NEVER converse with sub-agents directly.
- **The trust account.** Every accurate finding deposits; every wrong claim withdraws. This is why Zee never overclaims and always shows the math.

## Exact Responsibilities (owns)

| # | Responsibility | Where it lives |
|---|---|---|
| 1 | **Digest assembly** — collect open insight cards across all agents, rank by money/severity, dedupe, assemble morning digest | `apps/api` ZeeModule |
| 2 | **Delivery channels** — in-app feed v1; push/email Phase B; WhatsApp Phase C (channel abstraction from day 1) | ZeeModule |
| 3 | **Insight card lifecycle** — persist `insight_cards`, rate limits (per-agent daily caps, critical bypasses), dedup, expiry, status transitions (open→accepted/dismissed/expired) | ZeeModule + tenant DB `insight_cards` |
| 4 | **Team screen state** — roster, per-agent status (on the job / starts in N days / paused), unlock projections, lifetime counters | ZeeModule + web team screen |
| 5 | **Voice & language** — all customer-facing copy in Zee's voice: warm, concise, money-first, evidence-backed, bilingual ar/en. Templates default; LLM phrasing optional and PII-scrubbed | translation files + (Phase D) `apps/ai/llm/` |
| 6 | **Copilot / NLQ (Phase D only)** — LLM writes the query plan, OUR server executes it, numbers stay home, results rendered locally | Phase D |

## What Zee does NOT own (common confusions)

- ❌ Any detection/prediction/extraction — that's the sub-agents.
- ❌ Writes to business tables — NestJS service paths do, tagged `origin: 'zee'` + `agentKey` + `insightId` in audit.
- ❌ Unlock *dates* — those come from each detector's per-tenant backtest quality gate (`../03-money-found-engine.md`); Zee only displays them.
- ❌ Model routing, telemetry, corrections — foundation services (F0), shared by all agents.

## Data contract

```
READS:  insight_cards (all agentKeys), agent unlock/status registry, tenant prefs (paused agents, channels)
WRITES: insight_cards lifecycle fields only (status, resolvedBy/At) — via NestJS, audited
NEVER:  business tables (products, JEs, invoices…)
```

## Voice rules (enforced in copy review)

1. Money-first headline when a money number exists.
2. Always evidence-backed: "show the math" link/expansion on every claim.
3. Never accusatory — especially Tariq (shrinkage) findings: "patterns worth a look," never "theft."
4. Never overclaims: claims trail measured accuracy (corrections data), never lead it.
5. Sub-agents referenced in third person by Zee.

## Failure & degradation

| Failure | Behavior |
|---|---|
| LLM down | Zero effect on digest/cards — templates are the default; LLM phrasing is optional garnish |
| No insights yet (new tenant) | Digest leads with team-progress story ("Noor starts in 12 days") — by design, not an error |
| Agent paused by tenant | Shows "paused" on team screen, excluded from digest — never "fired" |

## Diagnostic anchors (testing)

- Wrong/missing digest item → check `insight_cards` rows + rate-limit/dedup logic in ZeeModule, NOT the detector.
- Wrong unlock date → check the detector's quality-gate projection, not Zee.
- A business write attributed to Zee → audit log must show `origin: 'zee'`, `agentKey`, `insightId`, and a human approver (v1: nothing posts without a tap; bulk tap counts).
