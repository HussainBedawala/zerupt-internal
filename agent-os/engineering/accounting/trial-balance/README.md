# Trial Balance

Report showing all accounts with debit/credit totals for a period. Essential for verifying books balance.

## Files

1. `01-design.md` — Backend query, API contract, frontend layout, interactions

## Key Decisions

- **LEFT JOIN** — show all active accounts even if zero activity (accountant expects to see full COA)
- **Posted entries only** — drafts and reversed entries excluded
- **Tree hierarchy preserved** — indented by depth, headers in bold
- **Balance indicator prominent** — green/red badge, top-right, immediate visual feedback
- **Links to GL drill-down** — click any account to see its transaction history
