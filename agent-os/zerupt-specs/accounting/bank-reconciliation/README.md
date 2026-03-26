# Bank Reconciliation

CSV import → auto-match → manual match → reconcile wizard. Matches bank statements against system JE lines.

## Files

1. `01-design.md` — Schema (3 new tables), endpoints, auto-match algorithm, reconciliation summary, 3-step wizard UI

## Key Decisions

- **3 new tables** — statements, statement lines, CSV mappings (per bank account)
- **Auto-match before manual** — 3 methods in priority order, all require user confirmation
- **Cannot reconcile if difference ≠ 0** — hard enforcement
- **CSV mapping saved per bank** — import once, reuse mapping for future statements
- **Carry-forward** — unmatched items from previous period auto-appear in next
- **"No match needed"** — requires mandatory reason (audit trail)
