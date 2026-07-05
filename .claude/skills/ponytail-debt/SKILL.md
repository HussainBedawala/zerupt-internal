---
name: ponytail-debt
description: >
  Harvest every `ponytail:` comment in the Zerupt codebase into a debt ledger,
  so the deliberate shortcuts and deferrals left behind get tracked instead of
  rotting into "later means never". Use when the user says "ponytail debt",
  "/ponytail-debt", "what did ponytail defer", "list the shortcuts", "ponytail
  ledger", "what did we mark to do later", or before a go-live / hardening pass
  to see what corners are still cut. One-shot report, changes nothing.
---

Every deliberate ponytail shortcut is marked `// ponytail: <ceiling>, <upgrade path>`.
This collects them into one ledger so a deferral can't quietly become permanent
in a pre-launch financial ERP.

## Scan

Grep the monorepo, skipping build output and deps:

`grep -rnE '(#|//|/\*) ?ponytail:' erp/apps erp/packages`

Each hit is one ledger row. The comment prefix keeps prose that merely mentions
the convention out of the ledger.

## Output

One row per marker, grouped by app/package, ranked by risk:

`<file>:<line>, <what was simplified>. ceiling: <the limit named>. upgrade: <the trigger to revisit>.`

Pull the ceiling and trigger straight from the comment. Want an owner per row?
add `git blame -L<line>,<line>`.

**Risk flags** (surface these first — this is a financial ERP):
- `no-trigger` — a `ponytail:` comment naming no upgrade path or trigger. These are the ones that silently rot.
- `money-path` — the shortcut sits in a money/accounting/tax/GL/costing path. A cut corner here is never acceptable at go-live; escalate it, don't just log it.
- `tenant-path` — the shortcut touches multi-tenant scoping/isolation.

End with `<N> markers, <M> no-trigger, <K> on money/tenant paths.`
Nothing found: `No ponytail: debt. Clean ledger.`

## Boundaries

Reads and reports only, changes nothing. To persist it, ask and it writes the
ledger to `study/<module>/_ponytail-debt.md` (aligns with the hardening-log
convention). One-shot. "stop ponytail-debt" or "normal mode" to revert.
