---
name: ponytail-audit
description: >
  Whole-repo audit for over-engineering in the Zerupt monorepo. Like
  ponytail-review, but scans the tree instead of a diff: a ranked list of what
  to delete, simplify, or replace with a shared primitive / native / stdlib
  equivalent. Use when the user says "audit this codebase", "audit for
  over-engineering", "what can I delete", "find bloat", "ponytail-audit", or
  "/ponytail-audit". One-shot report, does not apply fixes.
---

ponytail-review, repo-wide. Scan the tree instead of a diff. Rank findings
biggest cut first. Start from `erp/docs/CODEMAPS/` to map the surface before
hunting — do not blind-grep the whole tree.

## Tags

Same as ponytail-review:

- `delete:` dead code, unused flexibility, speculative feature. Replacement: nothing.
- `reuse:` hand-rolled thing already in `packages/shared` / `packages/ui` / a shared service. Name the primitive.
- `native:` dep or code doing what Postgres/Drizzle/Next/Nest/shadcn/CSS already does. Name the feature.
- `yagni:` abstraction with one implementation, config nobody sets, layer with one caller.
- `shrink:` same logic, fewer lines.

## Hunt

Deps the platform already ships, single-implementation interfaces, factories
with one product, wrappers that only delegate, duplicate/parallel service
implementations (the drift that bit AP-subledger and outbox), files exporting
one thing, dead flags and config, hand-rolled versions of the shared
money/qty/percent/picker primitives.

## Output

One line per finding, ranked: `<tag> <what to cut>. <replacement>. [path]`.
End with `net: -<N> lines, -<M> deps possible.` Nothing to cut: `Lean already. Ship.`

## Boundaries

Scope: over-engineering and complexity ONLY. Correctness, security, tenant
isolation, and performance are out of scope — route to a normal pass. NEVER
flag financial/auth/tenant tests, trust-boundary validation, defensive-UX
states, or i18n extraction as bloat. Lists findings, applies nothing. One-shot.
"stop ponytail-audit" or "normal mode" to revert.
