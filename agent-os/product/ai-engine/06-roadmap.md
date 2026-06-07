# AI Engine — Roadmap

> Staged identity: fabric → analyst → employee. Each stage ships when the previous earned trust + data. Dates from 2026-06-07.

## Phase A — MVP (now → June 15): the hook + the wedge

- **Sami / Invoice Scanner v1** (full spec: `02-invoice-scanner.md`): purchase invoices, photo+PDF, draft + 1-tap approve & post, correction capture, AR/EN. June 15 window untouched.
- **Mira / Migration deterministic core** (full spec: `07-mira-migration-brain.md`) — pre-launch wedge work, because **migration IS the GTM wedge** (see locked migration-wedge strategy): Layer 1 report-pathology detection + repair, Layer 2 cross-file consolidation → decision cards, matching-UX doctrine (create-by-default + bulk accept by confidence band), suspense parking + finish-later task cards, sub-5-minute zero-file path, AI health check + visible status. All vendor-agnostic (no per-vendor adapters); the 11-file Kuwait auto-parts export is the canonical test fixture.
  - Builds on the **AR/AP per-party opening import** built 2026-06-07 (branch `phase-5/import-dialog-ux`): opening-receivables/payables endpoints, party-tagged JE lines, mutual exclusion with TB per control account, reconciliation tie-out. Mira's Layer 2 sits on top of it.
  - Near-term infra fixes (`01`, `05`): party-matching AI rung, un-muzzle column-mapping rung 5, health check / no-silent-degradation, `AI_SERVICE_URL` explicit, model-routing refresh.
- Team screen v0: roster with **Mira on the job from minute one** + Sami active, others "starting in N days" (static projections OK for launch).
- Launch content: the scanner IS the demo reel; the migration rebuild is the onboarding wow; money-found is teased via the team screen.

## Phase B — Money-Found Engine (June 16 → ~mid-July): the analyst

0. **Mira Layer 3 — inference** (the WOW / marketing moment): categories, selling prices, costs, payment terms, reorder levels, account types — all OWN-tier on our infra, each value badged "inferred" with provenance + confidence into a review queue. Ships here, alongside the money-found engine, because inference is the same statistical substrate.
0b. **Notebook-photo path** (Phase B/C): photograph the paper ledger → Sami-style VLM extraction → opening outstanding per customer. Reuses Sami's extraction adapter (`apps/ai/extraction/`), no new model.
1. Substrate: feature pipeline, model registry + quality gates, scoring jobs, `insight_cards`, insights feed, digest v1 (in-app + push/email), real unlock mechanics. ~1.5 wks.
2. **Noor** (dead stock — validated pain, biggest headline number)
3. **Maya** (margin/receivables — rules-based, fills the feed fast)
4. **Tariq** (shrinkage — baselines ready by then for first tenants)
5. **Arjun** (stockout forecast — longest history requirement; its forecasting core is deliberately the future PO-drafting brain)

Exit criteria: a real tenant's digest shows a true, defensible money number weekly.

## Phase C — The Employee (Aug–Oct): earned autonomy

- Arjun's forecast → **drafted POs** (qty, supplier, lead-time aware) in the digest, 1-tap approve. First "employee" act.
- Maya → drafted payment reminders, price-update drafts.
- Sami v1.1: expense receipts, multi-page, bulk scan.
- Autonomy dial per capability per tenant ("post supplier X's invoices automatically after 50 clean approvals") — unlocked by track record, off by default.
- WhatsApp channel (Business API): digest + approve-by-reply.

## Phase D — The Voice (Oct+): Zee Copilot

- Chat with Zee: NLQ where the LLM writes the query plan, our server executes (numbers stay home), results rendered locally.
- "Why?" on any insight card → evidence walked through conversationally.
- Deliberately LAST: chat is the most LLM-dependent surface; by now Zee has months of earned trust and a corpus of real questions to eval against.

## Phase E — The Flywheel (when data justifies, ~100+ tenants)

- Fine-tuned extraction model (scan corrections) → self-hosted, serverless GPU.
- Import-mapping SLM + COA classifier (onboarding corrections).
- Cross-tenant priors (anonymized aggregates): better cold-start defaults per industry/region.
- Sovereign tier: fully self-hosted LLMs for gov/enterprise.
- New team members: bank reconciliation agent, compliance/e-invoicing (ZATCA) agent, customer-insight agent.

## Explicitly Deferred / Demoted

| Old-spec item | Disposition |
|---|---|
| Copilot-first | Demoted to Phase D (reliability + trust sequencing) |
| 4 rule-based guardians (Accounting Guardian etc.) | Replaced by ML detectors + named team; their valid checks (journal balance, period close, tax config) become Maya/compliance-agent rules over time |
| Suggestion model & safety rails | Carried over into `insight_cards` (renamed, money-framed) |
| Onboarding Coach | Folded into Zee's digest behavior for new tenants, not a separate agent |

## Validation Loop (continuous)

- $5–10/day ad tests per angle (photo→posted, dead stock, shrinkage, stockout) → landing pages → WhatsApp-start as the intent metric. Dead stock + scanner already validated qualitatively (2026-06-07 interview).
- Every phase's marketing claim must trail measured accuracy, never lead it.
