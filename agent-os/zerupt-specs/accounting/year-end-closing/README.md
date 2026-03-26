# Year-End Closing

Zeros income/expense accounts and transfers net to Retained Earnings. Supports preview, generation, and reversal (for reopen).

## Files

1. `01-closing-entry-generation.md` — Algorithm, line building, RE transfer, preview, reversal

## Key Decisions

- **Two RE accounts** — Current Year (3300) absorbs net, then transfers to Prior Years (3200)
- **Preview before commit** — same algorithm, no writes
- **Crash-safe reversal** — handles already-reversed closing entry gracefully
- **No entry for no activity** — returns null if zero balances everywhere
- **Posting date** — last period of the fiscal year
