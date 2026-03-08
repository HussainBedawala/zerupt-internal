# Accounting Engine Specification — Shaping Notes

## Scope

A comprehensive specification document defining how every business event in the Merpec retail ERP flows through the accounting system. This is a systematic instruction document — not database schemas, API designs, or code. It tells developers "when X happens, Y must occur" so they can design their own architecture.

## Decisions

- **Country-agnostic**: No hardcoded currencies, VAT rates, or jurisdiction assumptions. The system must handle any country's taxation and accounting requirements.
- **No fixed base currency**: Functional currency is always determined by where the tenant is located. There is no system-wide base currency.
- **Event-driven architecture**: Modules emit typed events, the accounting engine listens and creates journal entries. NestJS EventEmitter is the transport.
- **WAC default, FIFO for batch-tracked items**: Weighted Average Cost is the default valuation method. Batch-tracked items automatically use FIFO.
- **Never delete, always reverse**: Corrections are made via reversing journal entries, never by deleting entries.
- **Auto-generated entries post immediately**: Only manual journal entries go through draft → posted workflow.
- **All 5 P0 audit gaps addressed**: Tax model, multi-currency, COGS, year-end closing, bank reconciliation.
- **All 13+ undefined business events mapped**: Every event identified in the audit plus additional events discovered during spec writing.

## Context

- **Visuals:** None — this is a backend/logic spec, not a UI spec
- **References:** All existing module specs (POS, Sales, Purchase, Inventory, Accounting, Reports, Settings), the accounting audit, data shape, and tech stack
- **Product alignment:** This spec is the foundation that all other modules depend on. Without it, developers cannot design database schema, APIs, or system architecture.

## Standards Applied

- None defined yet (agent-os/standards/index.yml is empty)
