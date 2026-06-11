# Unrealized FX Revaluation

Month-end revaluation of foreign currency balances per IAS 21. Posts unrealized gain/loss entries with auto-reversal on next period start.

## Key Decisions

- **Book value approach** — uses actual posted FC amounts, not recomputed from rates (avoids drift)
- **Auto-reversal** — separate JE posted on first day of next period
- **EventEmitter** — avoids circular dependency with JournalEntriesModule
- **Idempotent** — event ID derived from entity + date prevents duplicates

## Files

- [01-unrealized-revaluation.md](01-unrealized-revaluation.md) — Algorithm, API, JE structure, gaps

## Status

**Code: Fully implemented.** Tests: Missing. Preview endpoint: Not implemented.
