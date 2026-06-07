# Mira — Migration Brain (the first agent a customer ever meets)

> The onboarding hook: **drop whatever files your old system gave you — even the broken reports — and watch Zerupt rebuild your business in minutes.** Mira reads any export, reconstructs your products, parties, stock, and books, and tells you what's missing. The bar: *no homework, no formats to learn, dashboard in under 5 minutes — even with zero files.* Migration is the GTM wedge (see locked migration-wedge strategy); Mira is its machinery.

## Who Mira Is

- **The first agent on the job — minute one of onboarding, before Sami.** The onboarding import screen IS her workspace. Customers meet Mira before they meet the product.
- Narrative: **"your data person."** She reads whatever files you drop, rebuilds your business from them, and tells you what's missing. Never a wizard step that interrogates you — a colleague who does the boring part.
- **Live progress narration** during import, in Zee's voice: *"Reading 11 files… found your trial balance… 1,471 products… built 23 categories… 187 customer accounts to convert…"* — the wow is watching her work.
- **Name is provisional.** "Mira" works in AR/EN/HI, 2 syllables. It still owes the negative-meanings / naming-rules check across AR/EN/HI/Bahasa per `04-zee-and-the-team.md` before adoption. `agentKey: mira` in code is functional and renaming is a translation-file change.

## The Hard Rule (founder, 2026-06-07)

**No vendor-specific normalizers. Ever.** No "Merpec adapter," no "Tally adapter," no per-vendor parsers. Mira detects *structure*, not brands. Vendor knowledge becomes **emergent**: the learned-fingerprint flywheel means that after N onboardings we have effectively "seen" Tally/Merpec/Zoho shapes without a line of vendor code. A real Kuwait auto-parts retailer's full 11-file export is the **canonical test fixture** (it exhibits nearly every pathology below) — a fixture, never a build target. The legacy vendor is not named in the spec as something we code against.

## v1 Scope (deterministic core — pre-launch wedge)

**IN:** Layer 1 (file understanding / report-pathology repair) · Layer 2 (cross-file consolidation → decision cards) · matching-UX doctrine + bulk-accept · Tier 0/1/2 strictness model · suspense parking + finish-later task cards · live narration · AI health check + visible status.

**OUT (Phase B/C):** Layer 3 inference (categories, prices, costs, terms, reorder levels, account types) ships alongside the money-found engine · notebook-photo path (photograph the paper ledger → Sami-style VLM extraction → opening outstanding per customer) · vertical/region markup priors.

## The Migration Brain — Three Layers (all vendor-agnostic)

### Layer 1 — File understanding

A taxonomy of universal **report pathologies**, each with a deterministic structural detector and a repair. Generic shape detection only — no vendor strings.

| Pathology | Structural detector | Repair |
|---|---|---|
| Hierarchy rows mixed with data | nested grouping column; subtotal arithmetic where parent ≈ Σ children | keep leaves; use subtotal math as verification, not data |
| Repeated / duplicate header names | infer roles via column arithmetic — the D/C pair whose totals match the footer = closing balances | role-assign columns, drop the rest |
| Pivot layouts | header row matches known entity names (e.g. warehouses from the wizard) | auto-unpivot to long form |
| Running-total / serial columns | monotonic; equals cumsum of another column | drop |
| Footer / total rows | row ≈ Σ of rows above | drop, but **use as checksum** |
| Paginated exports | suspiciously round row counts + cross-file count contradiction | ask for one re-export, with the exact instruction |
| Embedded codes in name fields | consistent suffix/prefix pattern across the column | extract as a code field |
| Locale chaos | day>12 + as-of date disambiguates dd/mm vs mm/dd; comma decimals; dash placeholders; Arabic-Indic digits | normalize to canonical types |
| Wrong report window | detail Σ ≪ control total from another file | diagnose; offer "proceed with unassigned remainder" |

**The ladder (consistent with principle #7, deterministic-first):**
1. **Structural rules** — the detectors above, pure code, no model.
2. **Learned fingerprints** — every onboarding trains; each correction feeds the flywheel so the same shape is recognized instantly next time. This is where vendor knowledge accrues *emergently*.
3. **Schema-only LLM** for the ambiguous tail — column names / headers / labels only, never cell data. Consistent with **"your numbers never leave Zerupt"**: the books are processed only on our own infra; the LLM sees structure, not numbers.

### Layer 2 — Cross-file consolidation

Every file becomes a set of **claims about entities**, joined on natural keys (item code, party code/name, account code) into one graph. Conflicts never become error walls — they become **decision cards** with the consequence spelled out in plain money terms.

- *"Your GL says inventory is 180k; your stock report values it at 360k at cost. Which do you trust?"* → one tap, consequence stated.
- Join item master (no cost) to stock report carrying cost price.
- Merge a per-warehouse pivot (no cost) with a valued stock report (no warehouse) → cost × location matrix.
- **Party-as-ledger COA detection:** *"We found 187 customer accounts inside your chart of accounts — we'll convert them to customer records and keep one control account."* (Auto-create, not match — see doctrine below.)
- Σ(outstanding) vs TB control mismatch → diagnosed, not dumped.

The existing **5-way reconciliation gate** remains the final arbiter, now fed by the consolidation graph instead of file-by-file guesses.

### Layer 3 — Inference of missing data (the WOW / marketing moment) — Phase B

All **OWN-tier** (stats/ML on our infra — the privacy promise holds; no cell data leaves). Every inferred value carries **provenance + confidence**, wears an **"inferred" badge** (same amber treatment as Sami's low-confidence fields), and lands in a **review queue**.

| Inferred | From |
|---|---|
| Categories | token / prefix clustering of product names |
| Selling prices | cost × learned category markup distribution (vertical/region priors land in Phase E) |
| Costs | joins, or TB inventory-value allocation by quantity |
| Payment terms | aging-days distribution per customer |
| Reorder levels | opening qty now; sales velocity later (feeds Arjun's cold start) |
| Account types | COA hierarchy path + label classifier |

## Strictness / Skip Model

Founder priority: **dashboard in under 5 minutes even with zero files.** Skip is first-class everywhere; import / type-manually / skip are *always* the three paths.

| Tier | What | Behavior |
|---|---|---|
| **0 — Hard** | business identity, one location, currency/tax | manual in the wizard; non-negotiable; stated plainly |
| **1 — Needed but skippable** | opening stock, opening balances, parties | consequence stated, then skippable: *"No opening stock → margins are wrong until you count. You can start selling anyway."* |
| **2 — Optional** | categories, payment terms, price history | inferable → never blocks |

Unresolved things **park in migration suspense**, never block:
- **Accounting:** a suspense account holds unassigned amounts.
- **Data:** a finish-later queue, surfaced as **Mira's task cards on the dashboard**, money-framed: *"3 accounts still unassigned — your P&L hides 412 KWD until then."*

## Matching UX Doctrine (kills the "55 accounts don't match — match manually" wall)

This is a design law, learned from a real testing failure (founder hit a 55-row manual-match wall, 2026-06-07).

1. **Matching is never homework.** The default action for an unmatched COA label is **CREATE it** — classified into the right section by hierarchy path / label — *not* map it. Matching is only for true duplicates.
2. **Bulk by confidence band.** *"Mira matched 49 of 55 — ✓ Accept all"* + the handful of uncertain ones with a best-guess pre-selected. Worst case is a few taps, never N dropdowns. Same pattern for parties, items, and accounts.
3. **Inference posture (decided):** auto-apply high-confidence with a visible **"AI matched / inferred" badge** + a one-screen review/undo queue. "Suggest → approve" (principle #4) is satisfied by **one-tap bulk accept** — the human tap is the bulk accept, not 55 individual ones.

## AI Health & Honesty

- **Health check at onboarding start.** Visible status: *"Mira is on the job ✓"* / *"Mira is offline — manual mode."* No silent degradation.
- **Telemetry:** AI-resolved vs manual-resolved counts per import → a real accuracy metric per pathology and per file shape from day one (mirrors Sami's accuracy discipline).
- Degradation: AI service down → Mira falls back to deterministic structural rules (Layer 1 still works — it's pure code) and manual matching; the product never blocks on the LLM rung.

## Architecture Fit

- **Python thinks, NestJS acts** (principle #3): `apps/ai` does structural detection + consolidation graph + inference scoring; NestJS owns the actual writes (products, parties, COA, opening JEs) through the same validated, audited service paths as manual entry, tagged `origin: 'zee/mira'`.
- **Builds on today's work:** the AR/AP per-party opening import (opening-receivables / payables endpoints, party-tagged JE lines, mutual exclusion with TB per control account, reconciliation tie-out) was **built 2026-06-07** on branch `phase-5/import-dialog-ux`. Mira's Layer 2 consolidation sits on top of it.
- Reuses the **5-way reconciliation gate** as the final arbiter and the existing import-ladder + alias caches as the seed of the learned-fingerprint store.
- Notebook-photo path reuses **Sami's extraction adapter** (`apps/ai/extraction/`) — same VLM interface, opening outstanding per customer as the output.

## Build Plan Sketch

| Slice | Work |
|---|---|
| 1 | Layer 1 pathology detectors + repairs (pure code, fixture-driven against the 11-file canonical set) + tests |
| 2 | Layer 2 consolidation graph + decision cards + party-as-ledger detection, fed into the 5-way gate |
| 3 | Matching-UX doctrine: create-by-default, bulk-accept by confidence band, undo queue — across COA / parties / items |
| 4 | Tier 0/1/2 strictness + suspense parking (accounting suspense + finish-later task cards) + sub-5-min zero-file path |
| 5 | Live narration + AI health check + visible status + per-pathology telemetry |
| (Phase B) | Layer 3 inference (own-tier) with provenance/confidence badges + review queue; notebook-photo path |

## Risks / Honesty Discipline

- **Over-claiming the rebuild.** The narration ("rebuilt your business in minutes") must trail what Mira actually reconstructs correctly on the fixture set — measured before marketed, same rule as Sami.
- **Inferred ≠ real.** Every inferred price/category/cost is badged and queued; we never silently treat a guess as a fact in the books.
- **Re-export friction.** Asking for a re-export (paginated exports) costs a user; do it at most once, with the exact instruction, never as a generic error.
- **Schema-only LLM boundary.** The "numbers never leave" promise depends on the LLM rung seeing structure only. The boundary is enforced in code, not convention — cell values are stripped before any external call.
- **Fixture ≠ universe.** The 11-file Kuwait fixture is canonical but one vendor's shape; the flywheel (not hand-coded coverage) is what generalizes. Resist the temptation to special-case it.
