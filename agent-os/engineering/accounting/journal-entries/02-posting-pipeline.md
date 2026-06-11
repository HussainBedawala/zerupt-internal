# Journal Entries — Posting Pipeline

> Service: `apps/api/src/journal-entries/journal-posting.service.ts`

## Event-Driven Flow

```
Module emits "accounting.post" → JournalPostingService.handleAccountingPost()
  → postFromEvent() → 10-step pipeline → emits "accounting.journal-entry.posted"
```

## 10-Step Pipeline

| Step | Action | Failure |
|------|--------|---------|
| 1 | Zod parse `postEventPayloadSchema` | BadRequest |
| 2 | Idempotency: query DB for `eventId` | Return `null` (duplicate) |
| 3 | Resolve `legalEntityId` from `branchId` | NotFound |
| 4 | Validate fiscal period for `occurredAt` date | BadRequest/Conflict (see period rules) |
| 5 | Batch resolve account mappings for all lineTypes | NotFound |
| 6 | Validate all accounts exist, active, correct entity | BadRequest |
| 7 | Build lines with exchange rate resolution | — |
| 8 | Balance check: `sum(debit) === sum(credit)` | BadRequest |
| 9 | Atomic transaction: reserve number → insert header + lines → lock FC | Unique violation → `null` |
| 10 | Emit `"accounting.journal-entry.posted"` | — |

## Exchange Rate Resolution (Step 7)

Priority order:
1. Line-level `exchangeRate` from event payload
2. Header-level `exchangeRate` from event payload
3. DB lookup via `ExchangeRateService.getRate()` (only when rate is "1" and currencies differ)

Conversion: `Decimal.js` with `precision=28, ROUND_HALF_EVEN`. Amounts stored at 6dp.

## Idempotency

Two layers:
1. **Fast path:** pre-check query on `eventId` → return `null`
2. **Concurrent safety:** DB unique partial index on `eventId` → catch error code 23505 → return `null`

## Numbering

- `DocNumberingService.reserveNumber(tenantId, { documentType: "JRN", branchId })` inside transaction
- Prefix + sequential per legal entity, gap-free
- NULL for drafts, assigned only at posting

## Functional Currency Lock

First posted JE for a legal entity sets `LegalEntity.functionalCurrencyLockedAt = now()`. After this, `functionalCurrency` and `countryCode` are immutable.

## Event Payload Schema

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| eventId | UUID | yes | Idempotency key |
| eventType | string 1-100 | yes | e.g. `sales.invoice.confirmed` |
| tenantId | UUID | yes | |
| branchId | UUID | yes | Engine resolves legalEntityId |
| occurredAt | Date | yes | Becomes postingDate |
| currency | `^[A-Z]{3}$` | yes | Transaction currency |
| exchangeRate | string | no | Default "1" |
| lines | array (min 2) | yes | Each: lineType, debitTC/creditTC (XOR), description |

## API Endpoints

| Method | Route | Permission |
|--------|-------|-----------|
| GET | `/tenant/journal-entries` | `accounting.journal.list` |
| GET | `/tenant/journal-entries/:id` | `accounting.journal.read` |
| POST | `/tenant/journal-entries/:id/reverse` | `accounting.journal.reverse` |

List filters: `legalEntityId`, `status`, `source`, `fromDate`, `toDate`. Pagination: page/limit (max 100).
