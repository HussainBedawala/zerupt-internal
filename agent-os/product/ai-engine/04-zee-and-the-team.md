# Zee & The Team — Persona, Roster, Progressive Unlock

> The customer-facing identity of the AI engine. Marketed as: **Zee, your AI partner** — who manages a team of named agents working for the business. Customers get a *catalogue of their very own employees*.

## Zee (the master)

- **Name rationale:** born from Zerupt (brand echo in every mention), one syllable, pronounced identically in Arabic (زي), Hindi (ज़ी), Bahasa, English — region-neutral across MENA + India + SEA.
- **Role:** the single voice. The digest is from Zee; the team screen is "Zee's team"; future Copilot/chat = talking to Zee. Sub-agents are referenced by Zee ("Noor found..."), users never converse with sub-agents directly.
- **Voice:** warm, concise, money-first, evidence-backed, bilingual (ar/en; hi/bahasa later). Never accusatory (especially Tariq findings), never overclaims, always shows the math.

## The Team (cross-cultural by design)

Real shops in Dubai/Kuwait/Singapore have Arab, Indian, Filipino, Malay staff side by side — the roster mirrors the customer's actual world. Every name is common across ≥2 launch regions.

| Agent | Job title | Does | Name meaning |
|---|---|---|---|
| **Mira** | Migration Specialist | Reads your old exports, rebuilds your business, finds what's missing | "ocean/abundance/prosperous" (works AR/EN/HI) — **provisional**, owes the negative-meanings naming-rules check below |
| **Sami** | Invoice Scanner | Reads invoices, drafts purchases | "one who hears/perceives" (AR + IN) |
| **Noor** | Dead Stock Finder | Finds cash trapped in inventory | "light" (AR + Urdu/Hindi + Malay *Nur*) — shines light on hidden money |
| **Arjun** | Stockout Predictor | Forecasts demand, never lets you run dry | the archer who never misses (IN, known in SEA) |
| **Tariq** | Shrinkage Guard | Watches voids, refunds, variances | "morning star / night visitor" — the night watchman |
| **Maya** | Margin Watchdog | Catches pricing leaks + credit drift | universal across all three regions |

Each agent has a catalogue entry (separate tab/screen): name, avatar, job description in plain retail language, what data it learns from, what it has found so far (lifetime money counter), and its status.

**Mira is the exception to the lifetime-money counter:** she's never "in training" and never "joining in N days" — she's **on the job from minute one of onboarding**, before any data exists. Her lifetime counter is **files read / records migrated / money reconciled** (e.g. *"Mira — 11 files read, 1,471 products + 187 customers migrated, 14 accounts reconciled"*). Full spec: `07-mira-migration-brain.md`.

## Progressive Unlock = Hiring (the Whoop move)

Detectors need weeks of tenant data. We don't hide it — we **sell the wait**, framed as new employees joining:

```
Zee's Team
──────────────────────────────────────────────────────────
🟢 Mira    Migration Specialist ON THE JOB — 11 files read, 1,471 products migrated
🟢 Sami    Invoice Scanner      ON THE JOB — 47 invoices read
⏳ Maya    Margin Watchdog      starts in 9 days   ▓▓▓▓▓▓░░  learning your pricing
⏳ Tariq   Shrinkage Guard      starts in 11 days  ▓▓▓▓▓░░░  watching POS patterns
⏳ Noor    Dead Stock Finder    starts in 18 days  ▓▓▓▓░░░░  building sales baseline
⏳ Arjun   Stockout Predictor   starts in 31 days  ▓▓░░░░░░  needs 6 weeks of sales
──────────────────────────────────────────────────────────
Every sale you ring up trains your team.
```

During onboarding itself — before any of the above exists — the same screen is *Mira's workspace*: she narrates live as she works (*"Reading 11 files… found your trial balance… 1,471 products… built 23 categories…"*). Mira is the one agent who is on the job with zero data, so she never appears with a ⏳ progress bar.

Why this works (three jobs at once):
1. **Cold-start weakness → anticipation.** "Not enough data yet" becomes "your new hire is in training."
2. **Daily-usage incentive.** Every transaction visibly feeds the progress bars; importing historical sales accelerates hiring (an onboarding import incentive!).
3. **Churn = firing your team.** Leaving means losing employees who know your business — emotional lock-in no dashboard has.

Mechanics:
- "Starts in N days" = projected date the detector's per-tenant backtest passes its quality gate (see `03`, registry quality gates) — honest, data-driven, can accelerate with imports/volume.
- **First-day-on-the-job moment:** when an agent activates, its first digest lead is an introduction with an immediate finding: "Noor here — first day on the job. I already found 23 items worth 6,200 KWD that haven't sold in 90+ days."
- Agents can be "paused" per tenant (carries over per-tenant disable from old spec) — UI says paused, never fired.

## Naming Rules Going Forward

- New capabilities = new team members (catalogue grows; future: bank reconciliation, e-invoicing compliance, customer insights).
- Names must work in AR/EN/HI/Bahasa speech, ≤2 syllables preferred, no religious/royal names, checked for negative meanings in all four languages before adoption.
- **Outstanding check:** "Mira" is provisional (2 syllables, works AR/EN/HI) and still owes the negative-meanings check across AR/EN/HI/Bahasa before it's locked.
- The persona layer is UI copy only — `agentKey` in code stays functional (`mira|sami|noor|arjun|tariq|maya`) and renaming is a translation-file change.
