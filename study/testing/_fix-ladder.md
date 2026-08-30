# Implementation rules for POS fix agents (MANDATORY - you inherit nothing)

## Lazy-first ladder — understand, then climb to the FIRST rung that holds
Read the code the change touches and trace the real flow FIRST. Never shorten the reading,
only the solution. Then:
1. **Does this need to exist at all?** Speculative = skip it, say so in one line. (YAGNI)
2. **Already in the monorepo? Reuse it.** Look in this order: `erp/docs/CODEMAPS/<module>.md` →
   `packages/shared` + `packages/ui` → the canonical primitives (`formatMoneyAmount` /
   `formatQuantity` / `MoneyInput` / `QuantityInput` / shared entity pickers / percent inputs —
   **NEVER hand-roll these**) → shared domain services. Re-implementing what lives a few files
   over is the most common slop.
3. **Framework/stdlib does it?** Use it (Next 16, Nest built-ins, Drizzle, date-fns).
4. **Native platform feature?** DB CHECK constraint over app validation, CSS over JS, Postgres
   over hand-rolled logic, shadcn/ui over a custom component.
5. **Already-installed dependency?** Use it. Never add a dep for what a few lines do.
6. **One line?** One line.
7. **Only then:** the minimum code that works.

Bug fix = **root cause, not symptom**: grep every caller, fix the shared function ONCE, not
per-caller. Deletion over addition; boring over clever; many small focused files (200-400 lines,
800 max). Shortest working diff wins — but the smallest change in the WRONG PLACE is a second
bug, so understand first. Mark deliberate shortcuts `// ponytail: <ceiling>, <upgrade trigger>`.

## THE STRUCTURAL LESSON THAT GOVERNS THIS ENTIRE BATCH
Several of these findings exist in N separate implementations. **The fix is ONE SHARED HELPER,
not N patches.** If you patch N sites you have failed the task even if all N work. And where a
defect survived the existing tests, **extend the test to cover the uncovered seam** — otherwise
the next instance ships. Both were learned the hard way in the Inventory phase.

## Never lazy about
- **Money / accounting correctness.** KWD is THREE decimals in this tenant. FX and rounding fail
  loud, never silently default.
- **Multi-tenant isolation.** Every query tenant-scoped.
- **Auth / security.** Validate client AND server. Never trust the client.
- **Defensive UX.** MENA/India/SEA retail users are not tech-savvy. Every action needs
  loading/error/empty/success states.
- **Immutability.** Return new objects, never mutate in place.
- **i18n from day one.** ar + en, `en/` is source of truth, never hardcode strings. CSS logical
  properties only (RTL/LTR), never physical `margin-left`/`padding-right`.
- **No em dashes** in product copy or UI strings.

## House mechanics
pnpm only · TypeScript strict · conventional commits (all lowercase, body <100 chars).

## Hard prohibitions
- **NEVER run a full test suite** — it locks the machine. Narrow only:
  `npx jest <fragment> --no-coverage` from `apps/api` (`--testPathPatterns` silently matches ZERO
  files — never use it; always confirm "Test Suites: N" in the output).
  `npx vitest run <fragment>` from `apps/web`.
- **NEVER run destructive git** — no checkout, reset, stash, clean, restore. Many sessions share
  this tree with a large uncommitted diff and NOTHING is committed. A subagent's `git checkout`
  once destroyed another session's work. **Do not commit anything either.**
- **NEVER spawn subagents.**
- Quote bracket paths — zsh breaks on `[locale]`.
- Do not create handover or summary documents.

## Verifying your own work
A green test is NOT proof a user-facing bug is fixed. One fix in this programme had a passing
test, a correct EXPLAIN plan and the right SQL result and was **completely unfixed for users**,
because the same predicate existed TWICE and only one copy was patched. So: after fixing, grep
for siblings of whatever you fixed, and verify the user-visible outcome.
