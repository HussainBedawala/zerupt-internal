# COGS Calculation Engine

WAC (default) and FIFO (batch items) costing. Recalculates on purchase events, provides COGS amounts to event listeners.

## Files

1. `01-design.md` — WAC/FIFO formulas, triggers, schema, service API, retroactive adjustments
2. `02-returns-and-negative-stock.md` — Return cost policy (current WAC vs original), negative stock guard, edge cases

## Key Decisions

- **WAC default, FIFO for batch** — per item+warehouse combination
- **Recalculates only on inbound** — sales don't change WAC
- **Called by event listeners, not modules** — COGS is part of the JE payload, not a separate posting
- **Retroactive adjustment** — landed cost after sale triggers COGS correction entry
- **Cost layers table** — FIFO only, ordered by createdAt for consumption
