# Event Listeners

NestJS EventEmitter handlers for 32 business events. The core of the accounting engine — auto-creates JEs when modules emit events.

## Files

1. `01-design.md` — Architecture, all 28 active events grouped by module, implementation priority
2. `02-je-mappings-per-event.md` — Exact DR/CR lines for every event, error handling summary
3. `03-error-handling-and-retry.md` — Outbox pattern, retry strategy, dead letter queue, monitoring

## Key Decisions

- **One service with grouped handlers** — not 32 separate services
- **Listener builds payload, posting service posts** — clean separation
- **COGS integrated at listener level** — calls CostingService before building JE payload
- **FX integrated at listener level** — calls FxGainLossService for payment events
- **4-phase rollout** — POS first, then Sales+Cheques, then Purchase+Inventory, then Banking+Internal
- **Modules own their event payloads** — listeners only enrich with accounts and calculated amounts
