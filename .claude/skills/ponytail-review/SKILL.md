---
name: ponytail-review
description: >
  Code review focused exclusively on over-engineering in the Zerupt codebase.
  Finds what to delete: reinvented shared primitives, unneeded dependencies,
  speculative abstractions, dead flexibility, a second implementation of a
  service that already exists. One line per finding: location, what to cut,
  what replaces it. Use when the user says "review for over-engineering", "what
  can we delete", "is this over-engineered", "simplify review", or invokes
  /ponytail-review. Complements correctness-focused review, this one only hunts
  complexity.
---

Review diffs for unnecessary complexity. One line per finding: location, what
to cut, what replaces it. The diff's best outcome is getting shorter.

## Format

`L<line>: <tag> <what>. <replacement>.`, or `<file>:L<line>: ...` for
multi-file diffs.

Tags:

- `delete:` dead code, unused flexibility, speculative feature. Replacement: nothing.
- `reuse:` hand-rolled thing that already lives in `packages/shared`, `packages/ui`, or a shared service (money/qty/percent inputs, entity pickers, `ApAgingService`, `resolvePackUnit`, `runDurableGated`, etc.). Name the existing primitive.
- `native:` dependency or app code doing what the platform already does (Postgres CHECK/constraint, Drizzle helper, Next/Nest built-in, shadcn/ui primitive, CSS logical property). Name the feature.
- `yagni:` abstraction with one implementation, config nobody sets, layer with one caller.
- `shrink:` same logic, fewer lines. Show the shorter form.

## Examples

✅ `L12-38: reuse: hand-rolled currency formatter. formatMoneyAmount in @zerupt/shared.`
✅ `line-entry.tsx:L44: reuse: raw <input> for quantity. QuantityInput primitive (per-item precision built in).`
✅ `aging.ts:L88: reuse: second AP-balance calc off bill rows. ApAgingService derives from GL party-tagged 1131.`
✅ `L4: native: moment.js imported for one format call. Intl.DateTimeFormat / date-fns already installed, 0 new deps.`
✅ `repo.ts:L30: yagni: AbstractRepository with one implementation. Inline it until a second exists.`
✅ `L52-71: delete: retry wrapper around an idempotent local call. Nothing replaces it.`

## Scoring

End with the only metric that matters: `net: -<N> lines possible.`
If there is nothing to cut, say `Lean already. Ship.` and stop.

## Boundaries

Scope: over-engineering and complexity ONLY. Correctness bugs, security holes,
tenant-isolation gaps, and performance are explicitly out of scope — route them
to a normal review pass (code-reviewer / accounting-reviewer / security-reviewer).
NEVER flag as bloat: tests on financial/accounting/auth/tenant paths (those are
the 100%-coverage tier), input validation at trust boundaries, error handling
that prevents data loss, defensive-UX states, or i18n string extraction. A
smoke test or assert-based self-check is the ponytail minimum, not bloat.
Does not apply the fixes, only lists them.
"stop ponytail-review" or "normal mode": revert to verbose review style.
