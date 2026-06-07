# Mira — Migration Specialist (Agent #0)

> Responsibility card. Deep spec: `../07-mira-migration-brain.md`. Format: AI-friendly — load this one file to understand Mira completely.

```yaml
agentKey: mira           # name provisional — owes negative-meanings check (AR/EN/HI/Bahasa)
role: Reads any old-system export, rebuilds the business, says what's missing
status: MVP (June 15) — deterministic core (Layers 1–2 + matching UX); Layer 3 inference = Phase B
tier: OWN (structural detection + inference) + RENT (schema-only LLM tail)
unlock: NEVER gated — on the job from minute one, before any data exists
counter: files read / records migrated / money reconciled (NOT lifetime money found)
```

## What Mira IS

- **The first agent a customer ever meets.** The onboarding import screen IS her workspace; she narrates live as she works ("Reading 11 files… found your trial balance… 1,471 products…").
- **"Your data person."** A colleague who does the boring part — never a wizard that interrogates.
- **Vendor-blind by law.** THE HARD RULE (founder, 2026-06-07): no vendor-specific normalizers, EVER. No Tally/Merpec/Zoho adapters. Mira detects *structure*; vendor knowledge accrues emergently via the learned-fingerprint flywheel.

## Exact Responsibilities (owns)

| # | Responsibility | Layer | Where |
|---|---|---|---|
| 1 | **Report-pathology detection + repair** — 9 universal pathologies (subtotal rows, duplicate headers, pivots, running totals, footers-as-checksums, pagination, embedded codes, locale chaos, wrong report window), pure code, no model | L1 | `apps/ai/migration/` |
| 2 | **Learned fingerprints** — recognize previously-seen file shapes instantly; every correction trains | L1 | extends `importLearnedMappings` cache |
| 3 | **Schema-only LLM tail** — ambiguous headers/labels only; cell values stripped IN CODE before any external call | L1 | `apps/ai/llm/` via task routes |
| 4 | **Cross-file consolidation graph** — every file = claims about entities, joined on natural keys; conflicts → decision cards in plain money terms ("GL says 180k, stock report says 360k — which do you trust?") | L2 | `apps/ai/migration/` + NestJS MigrationModule |
| 5 | **Party-as-ledger detection** — customer/supplier accounts living inside the COA → auto-convert to party records + one control account | L2 | MigrationModule |
| 6 | **Matching-UX doctrine enforcement** — create-by-default for unmatched COA labels; bulk-accept by confidence band ("Mira matched 49 of 55 — ✓ Accept all"); auto-apply high-confidence with "AI matched" badge + undo queue. Matching is NEVER homework | L2 | web + api |
| 7 | **Strictness tiers + suspense parking** — Tier 0 hard / 1 skippable-with-consequence / 2 optional; unresolved → accounting suspense + finish-later task cards ("3 accounts unassigned — P&L hides 412 KWD") | L2 | MigrationModule |
| 8 | **Live narration + visible health** — progress in Zee's voice; "Mira is on the job ✓ / offline — manual mode"; never silent degradation | — | SSE/polling + web |
| 9 | **Inference of missing data (Phase B)** — categories, selling prices, costs, payment terms, reorder levels, account types — all OWN-tier, every value badged "inferred" + provenance + confidence + review queue | L3 | `apps/ai/migration/` |

## What Mira does NOT own

- ❌ Writing products/parties/COA/opening JEs herself — NestJS MigrationModule writes through the same validated, audited paths as manual entry, tagged `origin: 'zee/mira'`.
- ❌ The reconciliation gate — she FEEDS the existing 6–8-way gate; the gate stays the final arbiter.
- ❌ Ongoing operations — Mira's job ends when migration does; daily document flow is Sami; ongoing detection is the Phase-B team.
- ❌ Photographed paper ledgers — that's Sami's extraction adapter reused (notebook-photo path, Phase B/C); Mira consumes the output.

## Data contract

```
READS:  uploaded files (retained, private bucket — F0.3), wizard facts (locations, currency),
        learned-fingerprint cache, existing COA/party/item tables (for matching)
EMITS:  repaired ParsedFile structures, consolidation graph, decision cards,
        narration events, ai_corrections (every override = training data)
WRITES (via NestJS only): products, parties, COA accounts, opening JEs, suspense entries —
        all audited, origin 'zee/mira'
LLM SEES: headers, column names, COA labels ONLY. Never cell values. Enforced in code.
```

## Non-negotiable laws

1. **No vendor adapters.** The 11-file Kuwait auto-parts export is the canonical *fixture*, never a build target. Resist special-casing it.
2. **Numbers never leave.** Cell values stripped before any external call — the privacy promise depends on this rung.
3. **Dashboard in <5 minutes even with zero files.** Import / type-manually / skip are always the three paths.
4. **Conflicts become decision cards, never error walls.** Consequence always stated in money.
5. **Re-export asked at most once**, with the exact instruction.
6. **Inferred ≠ real.** Every guess badged + queued; never silently a fact in the books.

## Failure & degradation

| Failure | Behavior |
|---|---|
| `apps/ai` down | "Mira is offline — manual mode." L1 detectors still run? NO — they live in apps/ai; fall back to today's deterministic import ladder + manual matching. Product never blocks |
| LLM rung down | L1 structural rules + fingerprints still work (no model); only the ambiguous tail degrades to manual |
| Unparseable file | Diagnose specifically ("this looks paginated — re-export with…"), never a generic error |
| Totals don't reconcile | Decision card or suspense parking — never a hard stop |

## Diagnostic anchors (testing)

- Wrong column mapping → which rung resolved it? (telemetry) Rungs 1–4 = deterministic bug, reproducible; rung 5 = LLM, check task route + model.
- "55 dropdowns" appearing anywhere → matching-UX doctrine violated — bug by definition.
- A number visible in an outbound LLM payload → CRITICAL privacy bug, stop ship.
- Migration result differs between runs on same files → L1/L2 are pure code, must be deterministic; nondeterminism = LLM tail leaking into the deterministic path.
