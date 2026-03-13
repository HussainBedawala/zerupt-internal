# Accounting Engine Architecture

## Pattern

```
Module emits event → Accounting Engine receives → Journal Entry created
```

```
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│   POS   │  │  Sales  │  │Purchase │  │Inventory│  │ Cheques │
└────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
     │ emit       │ emit       │ emit       │ emit       │ emit
     ▼            ▼            ▼            ▼            ▼
┌──────────────────────────────────────────────────────────────┐
│                    ACCOUNTING ENGINE                          │
│  1. Receive event                                            │
│  2. Resolve legal entity from branch                         │
│  3. Look up COA + account mapping for this entity            │
│  4. Calculate amounts (tax, FX → entity functional currency) │
│  5. Create journal entry (balanced debit/credit lines)       │
│  6. Validate (debits = credits, period open, accounts exist) │
│  7. Post to entity's ledger                                  │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
                   General Ledger (per legal entity)
```

## Legal Entity Context

Every financial operation is scoped to a **legal entity**:

| Concept | Scope | Why |
|---------|-------|-----|
| COA | Per legal entity | Each entity may have country-specific accounts (VAT vs GST) |
| Journal entries | Per legal entity | Financial statements are per entity |
| JE numbering | Per legal entity | Sequential, gap-free per entity (e.g., `JE-0001`) |
| Fiscal periods | Per legal entity | Different entities can have different fiscal year starts |
| Functional currency | Per legal entity | JE amounts posted in entity's functional currency |
| Consolidated view | Across entities (future) | Phase 6: currency translation + inter-company elimination |

**How the engine resolves the entity:**
1. Event carries `branchId`
2. Engine looks up `Branch.legalEntityId`
3. Entity provides: functional currency, COA, fiscal period, JE sequence

## Event Payload

Every event must carry:

| Field | Type | Description |
|-------|------|-------------|
| `eventId` | UUID | Unique. Used for idempotency — engine rejects duplicates. |
| `eventType` | string | Event name (e.g., `sales.invoice.confirmed`) |
| `tenantId` | string | Tenant owner |
| `branchId` | string | Originating branch. Engine resolves `legalEntityId` from this. |
| `sourceDocumentType` | string | e.g., `SalesInvoice`, `GRN`, `POSTransaction` |
| `sourceDocumentId` | string | Source document ID |
| `sourceDocumentNumber` | string | Human-readable number (e.g., `INV-2026-0042`) |
| `occurredAt` | datetime | Business event date → becomes journal entry posting date |
| `currency` | string | Transaction currency code |
| `exchangeRate` | decimal | Rate from transaction currency to entity's functional currency |
| `payload` | object | Event-specific data (line items, amounts, tax breakdown) |

## Event Naming

Pattern: `{module}.{entity}.{action}`

Examples: `pos.transaction.completed`, `sales.invoice.confirmed`, `cheque.status.changed`

## Rules

| Rule | Detail |
|------|--------|
| **Idempotency** | Same `eventId` processed twice → only one journal entry. Duplicates silently ignored. |
| **Transactional** | Journal entry creation must be in the same DB transaction as the source document state change. If journal entry fails, source document rolls back. |
| **Auto-generated entries** | Posted immediately. No draft state. Never editable — corrections via reversals only. |
| **Manual entries** | Draft → Posted workflow. Drafts are editable. Posted entries cannot be edited — must reverse. |
| **Reversals** | Never delete a posted entry. Create a new reversing entry (debits/credits swapped). Link both: `reversalOfEntryId` ↔ `reversedByEntryId`. |
| **Numbering** | Sequential per legal entity, no gaps: `JE-0001`, `JE-0002`. Prefix configurable per entity. Optional reset per fiscal year. |
| **Entity isolation** | JEs for different legal entities never mix. Each entity has its own ledger, numbering, and trial balance. |
| **Functional currency lock** | On the first posted JE for an entity, the engine sets `LegalEntity.functionalCurrencyLockedAt = now()`. After this, the entity's `functionalCurrency` and `countryCode` are immutable. |

## Cross-Reference

| Reference | Alignment |
|-----------|-----------|
| `settings-admin/15-multi-entity-architecture.md` | LegalEntity model, hierarchy, functional currency |
| `settings-admin/05-currency-fiscal-periods.md` | Currency policy, supported currencies, fiscal settings |
| `03-multi-currency.md` | Exchange rate table, dual-amount JE lines, FX gain/loss |
| `04-chart-of-accounts.md` | COA per legal entity, account properties |
| `08-period-control.md` | Fiscal period locking per legal entity |
