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
│  2. Look up account mapping for event type                   │
│  3. Calculate amounts (tax, FX, COGS)                        │
│  4. Create journal entry (balanced debit/credit lines)       │
│  5. Validate (debits = credits, period open, accounts exist) │
│  6. Post                                                     │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
                   General Ledger
```

## Event Payload

Every event must carry:

| Field | Type | Description |
|-------|------|-------------|
| `eventId` | UUID | Unique. Used for idempotency — engine rejects duplicates. |
| `eventType` | string | Event name (e.g., `sales.invoice.confirmed`) |
| `tenantId` | string | Tenant owner |
| `branchId` | string | Originating branch |
| `sourceDocumentType` | string | e.g., `SalesInvoice`, `GRN`, `POSTransaction` |
| `sourceDocumentId` | string | Source document ID |
| `sourceDocumentNumber` | string | Human-readable number (e.g., `INV-2026-0042`) |
| `occurredAt` | datetime | Business event date → becomes journal entry posting date |
| `currency` | string | Transaction currency code |
| `exchangeRate` | decimal | Rate from transaction currency to functional currency |
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
| **Numbering** | Sequential per tenant, no gaps: `JE-0001`, `JE-0002`. Prefix configurable. Optional reset per fiscal year. |
