# Financial Statements

Income Statement (P&L), Balance Sheet, and Cash Flow Statement. Deferred to Phase 6.

## Files

1. `01-design.md` — Three report layouts, query approach, shared endpoint pattern, frontend layout

## Key Decisions

- **Phase 6** — do not build before then. Trial Balance + GL are Phase 2 prerequisites.
- **cashFlowCategory already on schema** — no schema changes needed for cash flow report
- **Balance Sheet is cumulative** — sums from inception, not period-based
- **Current Year Earnings = live P&L** — not from RE account (avoids dependency on year-end close)
- **Comparison mode deferred** — current vs prior period is a future enhancement
