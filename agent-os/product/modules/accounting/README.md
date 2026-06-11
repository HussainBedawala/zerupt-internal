# Accounting Engine

> Rules for how every business event produces financial records. Each file is self-contained.

## Files

| File | What It Covers |
|------|---------------|
| `01-architecture.md` | Event-driven pattern, idempotency, reversals, auto vs manual entries |
| `02-tax-model.md` | TaxCode, TaxGroup, TaxRate, calculation logic, exemptions |
| `03-multi-currency.md` | Functional/transaction currency, FX gain/loss, revaluation |
| `04-chart-of-accounts.md` | Default COA template, account properties, system accounts |
| `05-cogs-logic.md` | WAC and FIFO calculation, when COGS fires, retroactive adjustments |
| `06-account-mappings.md` | Which accounts are debited/credited for each event type |
| `07-event-mappings.md` | Every business event → journal entry (the complete list) |
| `08-period-control.md` | Fiscal years, soft/hard locks, cross-module enforcement |
| `09-year-end-closing.md` | Closing entries, pre-close checklist, retained earnings |
| `10-bank-reconciliation.md` | Statement import, matching, reconciliation process |

## Design Decisions

- Country-agnostic — no hardcoded currencies, tax rates, or jurisdictions
- Functional currency is per-tenant (set at onboarding)
- Event-driven — modules emit events, accounting engine creates journal entries
- WAC default, FIFO for batch-tracked items
- Never delete journal entries — always reverse
- Auto-generated entries post immediately; manual entries go through draft → posted
