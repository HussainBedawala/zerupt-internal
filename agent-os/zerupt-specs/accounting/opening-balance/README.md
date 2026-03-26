# Opening Balance Wizard

Guided flow for entering opening balances when migrating from another system. Auto-balances via Opening Balance Equity (3900).

## Files

1. `01-design.md` — Backend endpoint, auto-balancing logic, 3-step wizard UI

## Key Decisions

- **Single JE** — all opening balances posted as one journal entry
- **Auto-balancing** — Opening Balance Equity (3900) line added automatically
- **OBE should net to zero** — if non-zero, user hasn't finished entering all balances
- **Grouped by account type** — Assets / Liabilities / Equity sections for clarity
- **Draft save** — partial entry can be saved and resumed
