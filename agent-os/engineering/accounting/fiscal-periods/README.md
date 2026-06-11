# Fiscal Periods

Three-tier period locking (open/soft/hard), 12-month auto-generation, cross-module enforcement, pre-closing checklist, auto-create next year on close.

## Files

1. `01-schema-and-generation.md` — Tables, period generation algorithm, country defaults
2. `02-locking-and-validation.md` — Status transitions, validatePeriod, close/reopen, API, checklist

## Key Decisions

- **Singleton settings per entity** — auto-created on legal entity creation with country default
- **Start month immutable after first FY** — prevents structural confusion
- **Closed year overrides period status** — forces HardLocked regardless of individual period status
- **Reopen preserves period locks** — admin must manually unlock (safety-first)
- **Auto-create next FY on close** — idempotent, failure doesn't block close
- **UTC date normalization** — avoids timezone mismatch in MENA/India/SEA regions
