# Accounting Module — Study Guide

> A from-zero learning path for the Zerupt accounting module. Written to be re-read.
> Organized by **layer** (foundation → derived), not by build-phase.
>
> Older build-phase notes live in `study/phase-2*`. They are organized by *when* we built
> things; this guide is organized by *what you must understand and in what order*.

## How this guide is layered

We are perfecting accounting top-down, foundation first. The chapters mirror that:

| Layer | Folder | What it covers | Why it's at this level |
|-------|--------|----------------|------------------------|
| **0** | `layer-0-ledger-foundation/` | Double-entry, accounts, journals, the general ledger, money in software, immutability, atomic & idempotent posting | The bedrock. Every transaction in the entire ERP becomes a balanced journal posting. If this is wrong, nothing downstream can be right. |
| **1** | `layer-1-chart-of-accounts/` | Account types, normal balances, hierarchy, classification, system roles, seeded COA | Every posting and report keys off correct account typing. |
| **2** | `layer-2-posting-pipeline/` | Business events → JE payloads → outbox → poster → ledger. POS, sales, purchase, inventory, cheques, FX. | One audited chokepoint = audit one place, not five. |
| 3 | `layer-3-subledgers-valuation/` | AR/AP control vs subledger (party), inventory WAC→COGS, VAT/GST | Where "balanced GL but wrong detail" bugs hide. |
| 4 | `layer-4-period-balance/` | Trial balance, opening balances, period close, year-end, FX (IAS 21) | Integrity over time. |
| 5 | `layer-5-reporting/` | P&L, Balance Sheet, Cash Flow (TBD) | Pure derivation from the ledger. |

Layers 0–4 are hardened and merged. **Layer 5 (reporting) is next.**
Layer 4 chapters: `layer-4-period-balance/00-orientation.md` … `06-the-close-checklist.md`
(concepts) + `09-how-zerupt-implements-layer-4.md` (as-built).

## Layer 0 chapters (read in order)

1. `00-orientation.md` — What an ERP ledger is, and what "Layer 0" means for Zerupt
2. `01-double-entry-from-zero.md` — The single idea the whole system rests on
3. `02-debits-credits-and-normal-balances.md` — The part everyone finds confusing, made simple
4. `03-accounts-and-the-chart-of-accounts.md` — The five account types and how they behave
5. `04-the-journal-entry-the-atom.md` — The indivisible unit of all accounting
6. `05-general-ledger-and-trial-balance.md` — From entries to balances to "do the books balance?"
7. `06-money-in-software.md` — Why money is never a float, minor units, rounding, currency
8. `07-immutability-audit-and-reversals.md` — Why you never edit history, only reverse it
9. `08-atomic-and-idempotent-posting.md` — The two software guarantees that keep books trustworthy
10. `09-how-zerupt-implements-layer-0.md` — Our actual schema & posting engine (written after code audit)

## The one sentence to remember

> Every economic event in Zerupt becomes one **balanced** (debits = credits), **immutable**,
> **atomically-written**, **idempotent** journal entry, posted through **one** code path, into a
> ledger that can *always* be proven to balance.

Everything in Layer 0 exists to make that sentence true with no exceptions.

## Layer 2 chapters (read in order)

1. `00-orientation.md` — What Layer 2 is: the bridge from business events to journal entries
2. `01-from-business-event-to-journal-entry.md` — The general pattern: event → listener → payload → outbox → poster → ledger
3. `02-account-mapping-and-roles.md` — How line types resolve to real accounts via mappings + system roles
4. `03-pos-sale-accounting.md` — Cash sale, card, mixed tender, VAT, COGS split, return, void, shift close
5. `04-sales-invoicing-accounting.md` — Credit sale (AR), receipt, advance, discount, credit note, multi-rate VAT
6. `05-purchase-accounting.md` — GRN accrual, invoice, recoverable/non-recoverable/reverse-charge VAT, payment, advance, return, landed costs
7. `06-inventory-cogs-accounting.md` — WAC COGS trigger, adjustments, inter-branch transfers, GL control account invariant
8. `07-cheques-and-fx-accounting.md` — Full cheque lifecycle (received/deposited/cleared/bounced/cancelled, in/out), FX gain/loss on settlement
9. `08-reliability-and-correctness.md` — Exactly-once via outbox + unique eventId + SKIP LOCKED; always-balanced via buildJePayload; dead-letter lifecycle
10. `09-how-zerupt-implements-layer-2.md` — Code map: constants, helpers, listeners, outbox service, poller, account mapping service, emit points, hardening targets

## Layer 1 chapters (read in order)

1. `00-orientation.md` — What Layer 1 is, and what depends on the COA
2. `01-what-is-a-chart-of-accounts.md` — The COA as the table of contents; a real retailer's COA
3. `02-account-types-and-the-equation.md` — The 5 types deep, Balance Sheet vs P&L, permanent vs temporary
4. `03-sub-types-and-classification.md` — Sub-types, current vs non-current, report grouping/ordering
5. `04-normal-balance-and-contra-accounts.md` — Normal balance per type, contra accounts, the DB constraint
6. `05-hierarchy-headers-and-leaves.md` — Parent/child, headers, leaves, roll-ups, depth, account codes
7. `06-system-accounts-and-roles.md` — 21 system roles, role binding table, control accounts, multi-region
8. `07-account-lifecycle-and-integrity.md` — Create/activate/deactivate/never-delete-if-used, multi-entity
9. `08-seeded-coa-and-localization.md` — Pre-built regional COA, base + country + industry overlays, bilingual
10. `09-how-zerupt-implements-layer-1.md` — Code audit: schema, enums, seed pipeline, role registry, what to watch
