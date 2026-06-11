# FX Gain/Loss

Realized FX calculation on payment settlement. Pure helpers used by payment modules. Unrealized revaluation spec'd but not yet implemented.

## Files

1. `01-calculation-and-lines.md` — Realized calculation, line building, unrealized spec, account mapping

## Key Decisions

- **Book value based** — uses actual posted FC amount, not recomputed from rate (avoids rounding drift)
- **Pure functions** — no DB access, no side effects
- **Bilingual** — auto-generated EN + AR descriptions
- **Unrealized auto-reverses** — spec requires reversal on period start (future implementation)
