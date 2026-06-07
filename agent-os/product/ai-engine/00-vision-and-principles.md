# AI Engine — Vision & Principles

> Decided 2026-06-07 in a from-scratch brainstorm (Hussain + Claude). Supersedes `archive/agents-2025/` (copilot-first, 4-named-agents spec). This directory is the canonical AI spec.

## The Vision

Zerupt is marketed and built as an **agentic AI retail ERP**. The AI is not a feature bolted on — it is the product's identity. Every retail owner who tastes Zerupt should feel they hired a team, not bought software.

The customer-facing identity: **Zee, your AI partner** — one persona managing a named team of six agents, each with a specific job (see `04-zee-and-the-team.md`; per-agent responsibility contracts in `agents/`). Customers say "Zee found me 8,000 dirhams," not "the dead stock report showed."

## The Staged Identity (trust ladder = autonomy ladder)

The AI reveals itself in three stages over a customer's life. This is deliberate: autonomy is *earned* as trust and data accumulate.

| Stage | When | Feels like | Examples |
|-------|------|-----------|----------|
| **Fabric** | Day 0–1 | "This product is supernaturally easy" | Mira rebuilds your business from your old exports; invoice photo → posted purchase; imports just work; smart defaults everywhere |
| **Analyst** | Week 2–6 | "It watches my business and finds money" | Dead stock found, stockout predicted, shrinkage flagged — insight cards with 1-tap actions |
| **Employee** | Month 3+ | "It does the work, I approve" | Drafted POs, payment reminders, reconciliation — morning digest, owner taps approve |

## The Three Moments That Matter

0. **The onboarding (minute one).** Wedge = **drop your old system's exports — even broken reports — and watch Zerupt rebuild your business** (Mira). The first agent a customer ever meets, before Sami. Migration is the locked GTM wedge; Mira is its machinery. Marketing line: *"Don't clean your data. Don't learn our formats. Export whatever your old system gives you — even the broken reports — and watch Zerupt rebuild your business in minutes."* Full spec: `07-mira-migration-brain.md`.
1. **The ad click (day 0).** Acquisition hook = **invoice photo → posted in seconds** (Sami). Works on the first invoice with zero history. Visual, filmable, instantly understood by anyone who does 2 hours of data entry daily. Validated: skeptical retail veteran said "super valuable, if it actually works" — that skepticism IS the bar: boringly reliable, not impressive-when-it-works.
2. **The renewal (week 4+).** Retention engine = **money found** (Noor, Arjun, Tariq, Maya). "8,400 KWD trapped in dead stock" lands exactly when onboarding wow fades — because by then we have their data. Validated: dead-stock pain confirmed as the strongest angle by retail owner interview (2026-06-07).

## Core Principles

1. **Own the brain, rent the mouth.** Prediction/detection is OUR code on OUR infra (classic ML, CPU, ~$0/inference). Cloud LLMs are rented for language only. See `05-model-strategy.md`.
2. **Your numbers never leave Zerupt.** Hard architectural constraint, public promise, GCC sales weapon. Transactions, prices, customer data are processed only by Zerupt-owned models on Zerupt infra. LLMs see schema, headers, and user questions — never the books.
3. **Python thinks, NestJS acts.** The brain (`apps/ai`) produces scores/insights/drafts; NestJS — owner of tenant DBs, permissions, audit — decides what happens. The brain never writes to business tables. See `01-architecture.md`.
4. **Suggest → approve → (earned) autonomy.** Nothing posts without a human tap in v1. Autonomy is a per-capability, per-tenant dial unlocked by accuracy track record, not a launch feature. **The approve tap can be a *bulk* tap:** high-confidence matches/inferences auto-apply with a visible "AI matched/inferred" badge + a one-screen review/undo queue, so "approve" means *"✓ Accept all 49"*, never 49 dropdowns. Matching is never homework (see `07-mira-migration-brain.md`).
5. **Sell the wait.** Detectors need weeks of tenant data. We don't hide this — we market it: each agent "joins the team" when its data baseline is ready, Whoop-style. See `04-zee-and-the-team.md`.
6. **Every correction is training data.** From day 1, every user edit to an AI draft (extraction fix, mapping fix, dismissed insight) is captured. This is the dataset that lets us fine-tune and self-host our own models later — the data flywheel and the long-term moat.
7. **Deterministic first, learned second, LLM last.** (Carried over from the import ladder — it was right.) Exact rules → cached learnings → statistical/ML models → LLM for the ambiguous tail only.
8. **Graceful degradation always.** AI down → product still works. Detectors are our own code (no external dependency to fail); LLM features fall back to templates/manual flows.

## What This Replaces

The archived spec (`archive/agents-2025/`) designed Copilot-first + four rule-based "guardian" agents. What changed and why:

- **Copilot demoted** from centerpiece to later phase. Chat is the most LLM-dependent, least reliable surface; insight cards + digest deliver the agentic feel with deterministic reliability.
- **Rule-based checks → real ML.** The old agents were if-statements with LLM explanations. The new engine is forecasting, anomaly detection, and optimization models trained per-tenant — actual intelligence, defensible, improving with data.
- **Generic suggestion cards → named team + money framing.** "Suggestion #47" became "Noor found 6,200 KWD."
- The old spec's safety model (suggest-only, tenant isolation, rate limits, audit) **survives** — it was right and is carried into `01-architecture.md`.
