# Purchase Module Hardening — Log (2026-06-29 → 2026-06-30)

🏁 **PROGRAM COMPLETE.** All 6 layers shipped to `main`; dev migrated; prod auto-applies via the
Railway pre-deploy migrator. Per-layer fix detail (resolved) lives in the commits + the
`/tmp/purchase-hardening/layer-*-{audit,fixes}.md` reports; this log keeps the summary + what's
still OPEN.

## What was delivered
| # | Layer | Commit | Migration |
|---|-------|--------|-----------|
| 0 | Supplier master + AP subledger foundation | `33c7a688` | 0124 |
| 1 | PO lifecycle + direct-purchase dual path | `53b0de52` | 0125 |
| 2 | GRN receipt + stock handoff + GR/IR + void | `e5635748` | 0126+0127 |
| 3 | Purchase invoice — 3-way/2-way match + input VAT + AP + bill void | `2fc7d4b8` | 0128 |
| 4 | Landed cost allocation + inventory revaluation + reversal | `8cefc2ad` | 0129 |
| 5 | Supplier payments + returns + AP aging + period integrity | `f63a230d` | 0130 |

Each layer: study → audit → harden → 6/7-agent reviewer panel (incl. accounting balance-proof +
security) → all findings fixed same session → real `node dist/main` boot DI gate → dev migration →
ship. 0 CRITICAL remaining on any layer.

## Outcome (the invariants now guaranteed)
- **Dual path** first-class everywhere: direct-purchase express AND PO→GRN→bill→payment.
- **AP subledger-of-record** derived from the immutable party-tagged 2111 ledger; reconcile
  invariant HOLDS after every pay / return / reversal / void.
- **Full reversal coverage, never a dead-end:** PO cancel, GRN void, bill void, landed-cost
  reverse, payment reverse, return void — all idempotent, net-zero contra, PIN+SoD, period-gated.
- Reverse-charge + input VAT + PPV + GR/IR clearing + landed-cost all GL-correct (balance-proofed).
- Backend AND frontend hardened. Modular boundary protected (reorder→purchase inverted to event).

## ⚠️ STILL OPEN — founder go-live TODOs (do before launch)
1. **Verify a full purchase cycle end-to-end on a real dev tenant** — reviews were
   code/test/boot-gate level, not a live click-through.
2. **Confirm prod tenant provisioning seeds the new account mappings** (`purchase_variance` 5210,
   `landed_cost_accrual` 2122). New tenants get them at provisioning; existing tenants need
   `seed:system-accounts --apply` (done on dev).

## ⚠️ STILL OPEN — deferred capabilities (not bugs; build when needed)
- **Full multi-currency FX** — currently FAIL-LOUD module-wide (rate≠1 rejected at bill /
  landed-cost / payment). The single biggest deferred capability. Nothing is silently wrong.
- Credit-note / refund-receivable for an over-value return beyond the unpaid balance (today the
  guard requires reversing the payment first).
- Period-end unrealized-FX AP revaluation; FIFO auto-allocation on payments; reversing an
  already-applied advance.
- In-process PIN lockout → move to Redis before horizontal scaling.
- Perf/polish: N+1 in applyGrnMatching/reverseGrnMatching (batch); index voidApprovedBy/voidedBy
  for the reports layer; bin-level GRN receipt; per-supplier over-receipt tolerance; manual
  PO-close endpoint; landed-cost allocation-preview endpoint+UI; soft-lock-override-on-confirm +
  near-dup-invoice-warning UX.

## Reusable gotcha (keep for sales/reports/POS hardening)
Drizzle `migrate()` wraps ALL pending migrations in ONE transaction → a newly-added enum value
cannot be referenced by literal in a CHECK in the same run. Cast `status::text` in the CHECK.
Run `npx drizzle-kit check` after any schema change.
