# Account Mappings

Maps business events to COA accounts with a 5-level override hierarchy (system → tenant → warehouse → category → item).

## Files

1. `01-resolution-and-crud.md` — Schema, resolution algorithm, CRUD rules, line type rules, seed defaults, API

## Key Decisions

- **5-level override** — most specific scope wins, checked against caller-provided context
- **System mappings read-only** — seeded by template, only admin can change via direct DB
- **Batch resolution** — single DB query for all lineTypes in one event (used by posting pipeline)
- **Account type enforcement** — 24 line type rules prevent e.g. mapping revenue to an asset account
- **Idempotent seeding** — safe to re-run, warns on missing COA accounts
