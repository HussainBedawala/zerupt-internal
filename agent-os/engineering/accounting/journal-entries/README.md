# Journal Entries

Double-entry journal engine: event-driven auto-posting, manual drafts, immutable-once-posted, multi-currency with IAS 21 compliance.

## Files

1. `01-schema-design.md` — Tables, columns, constraints, indexes
2. `02-posting-pipeline.md` — 10-step event pipeline, idempotency, numbering, API

## Key Decisions

- **Immutable posted entries** — corrections via reversal only, never edit
- **Dual amounts** — functional currency + transaction currency on every line
- **Gap-free numbering** — NULL for drafts, assigned atomically at posting
- **Two-layer idempotency** — pre-check query + DB unique index on eventId
- **Financial precision** — Decimal.js precision=28, ROUND_HALF_EVEN, 6dp storage
- **Event-driven** — listens on `accounting.post`, emits `accounting.journal-entry.posted`
