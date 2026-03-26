# General Ledger Drill-Down

Account activity view showing all JE lines for a specific account + date range. Accessible from Trial Balance, COA tree, and direct URL.

## Files

1. `01-design.md` — Backend query, running balance, API contract, frontend layout

## Key Decisions

- **Running balance server-side** — computed per line using account's normal balance direction
- **Opening balance** — all activity before `fromDate` (from inception)
- **Uses existing index** — `jel_account_id_posting_date_idx` (no schema changes needed)
- **Links everywhere** — entry numbers link to JE detail, source docs link to source modules
- **Multiple entry points** — Trial Balance, COA tree sheet, direct URL
