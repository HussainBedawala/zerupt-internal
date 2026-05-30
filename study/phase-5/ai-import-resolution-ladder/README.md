# AI Import — The Column Resolution Ladder

*Phase 5 · Onboarding · DEV-342 · the foundational AI layer*

## The problem

A new retail customer hands you a spreadsheet exported from whatever they used
before (Merpec, Tally, a hand-rolled Excel sheet). The columns are named however
that system or that shopkeeper felt like — `Prod. Nm`, `اسم الصنف`, `Item Code`,
`Scan`, `Sell Pr`. Before any of it can become inventory, every column has to be
bound to a canonical Zerupt field (`name`, `sku`, `barcode`, `unitPrice`, …).

The naive instinct is "throw the whole sheet at an LLM and ask it to map the
columns." That is expensive, slow, non-deterministic, unauditable, and gets *no
cheaper* the thousandth time you import the same Merpec export. It also fails the
trust test: an LLM silently mismapping `cost` to `unitPrice` corrupts margins.

## The core idea: a ladder, where the LLM is the last rung

Resolution is a **ladder of techniques ordered cheapest-and-most-certain first**.
You evaluate top-down and stop at the first confident bind. Each rung only sees
the columns the rungs above it could not resolve.

| Rung | Technique | Cost | Confidence |
|------|-----------|------|-----------|
| 1 | Exact header match | free, instant | 1.0 |
| 2 | Alias dictionary (en + ar synonyms) | free | 0.9 |
| 3 | Content heuristics (sniff the *values*) | free | 0.6 |
| 4 | Learned-mapping cache (we've seen this file shape before) | free | 0.95 |
| 5 | **LLM assist** | $, slow, rare | clamped, never auto-applied |

The whole design is a refutation of "AI-native means call the model for
everything." It is *more* AI-native, not less: the system **learns and gets
cheaper with every import** (rung 4), and reserves the expensive, fallible
reasoning for the genuinely novel tail. A healthy import of a known source should
reach rung 5 for **few or zero** columns. If rung 5 fires on most columns, that's
a *bug in rungs 1–4*, not a cost of doing business — which is why it's
instrumented.

## Why each deterministic rung earns its place

- **Rung 1 (exact)** is trivial but catches the well-behaved exports for free.
- **Rung 2 (alias dictionary)** is the workhorse. A hand-built, *versioned*,
  unit-tested synonym map across ~40 fields in English **and Arabic**, plus the
  known legacy-export spellings. Every alias it holds is a column you never pay an
  LLM to infer — *forever*. It's the highest-ROI artifact in the whole feature
  precisely because it's boring and permanent.
- **Rung 3 (content heuristics)** sniffs the *data*, not the header: a 13-digit
  numeric column is a barcode; an `@`-bearing column is email; currency-shaped
  values are a price. This rescues columns whose headers are useless (`Col4`).
  Heuristics are *lower* confidence (0.6) because shape is suggestive, not proof —
  so they surface as suggestions, not silent auto-binds.
- **Rung 4 (learned cache)** is the scaling moat. On a *confirmed* import we
  persist the mapping keyed by a **source fingerprint**. Next time a
  structurally-identical file arrives, we pre-apply the known mapping at high
  confidence. The first Merpec migration is the only expensive one.

## The source fingerprint

The cache key is the interesting bit. It must be **stable** (same logical file
shape → same key) and **order-independent** (column order shouldn't matter). The
answer: hash the *normalized set* of headers (sorted, lowercased, trimmed), scoped
by the *detected source system*. Two product exports from Merpec with the columns
in a different order produce the same fingerprint and hit the same cache row; a
Tally export with overlapping column names but a different signature does not.

Entity type is part of the key too: the same header set can describe a product
*or* a supplier export, so `(fingerprint, entityType)` together identify a cache
entry.

## Confidence as a first-class output

Every bind carries a confidence score, and scores fall into **bands** that decide
the UX:

- **≥ 0.9** → auto-mappable (exact, learned, alias).
- **0.75–0.9** → review (probable, show it pre-filled, let the user confirm).
- **< 0.75** → suggest/flag (we're guessing; make the user choose).

This is what makes the import *auditable*: every column's binding has a provenance
(which rung) and a confidence, not just an answer.

## Rung 5 and the trust boundary

The LLM rung is special because its output is **untrusted by construction**. The
discipline that makes it safe:

1. **It only sees the unresolved tail** — a few columns + ≤10 sample rows, never
   the full file, no PII retained. Less data exposure, fewer tokens, lower cost.
2. **Its output is never silently auto-applied.** LLM suggestions land in a
   *suggestions* list for human review, never written directly into the accepted
   mapping. Even a confident LLM answer is capped at the "review" band.
3. **Defense-in-depth on both sides of the network call.** The Python service
   validates its own output against a schema and only proposes target fields from
   the allowed set; the calling service *re-validates*, clamps confidence to
   [0,1], and drops any suggestion referencing a column or field it never sent.
4. **Prompt-injection awareness.** Sample row values are untrusted user content —
   a cell could say "ignore your instructions." The prompt explicitly frames all
   headers and values as *data, never instructions*, and the downstream
   suggestion-only + field-allowlist + human-review layers contain the blast
   radius even if the model is fooled.
5. **Graceful degradation.** If the AI service times out or errors, it returns an
   empty result and the import falls back to manual mapping. The deterministic
   rungs keep working with no AI at all. **Import is never blocked by LLM
   availability.** This is the single most important reliability property.

## Cost philosophy: route by task, learn don't re-infer

Two ideas underpin the economics:

- **Route by task, not by one default model.** Column mapping is *extraction with
  low reasoning* — the cheapest fast model handles it. Heavyweight reasoning models
  are reserved for genuinely hard tasks (e.g. chart-of-accounts reconciliation
  advice) and never run on something a regex could do. The router config, not the
  code, decides — so the model can change without touching business logic.
- **Learn, don't re-infer.** Rung 4 means inference cost trends to zero for any
  source system you've seen before. The expensive path is paid once per *novel*
  file shape, not once per import.

Instrumentation makes this visible: per-import LLM-call count and token cost are
logged, with a soft per-onboarding budget alert. A budget breach is a *signal of a
ladder gap* (rungs 1–4 are missing an alias or heuristic), not expected spend.

## The transferable lesson

When you add an LLM to a system, ask: *what's the cheapest, most certain technique
that could answer this, and how do I make the model the fallback rather than the
front door?* Order your techniques by cost-and-certainty, let the system memoize
what it learns, and treat every model output as untrusted input that a human
confirms before it touches real data. That's how you get a feature that is
accurate, auditable, fast, near-free at scale, and *more* AI-native for using the
AI less.
