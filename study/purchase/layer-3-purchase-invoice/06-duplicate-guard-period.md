# 06 — Duplicate-Bill Guard, Period Control, and Immutability

## Duplicate-Bill Guard

### Supplier Invoice Number Uniqueness

```sql
UNIQUE INDEX purchase_invoices_tenant_supplier_supplier_number_key
  ON (tenant_id, supplier_id, supplier_invoice_number)
  WHERE supplier_invoice_number IS NOT NULL
```

(Schema: `purchase.ts:370-372`)

- Partial index: only enforced when `supplierInvoiceNumber` is provided
- Scoped per tenant + supplier (not global) — different suppliers can reuse numbers
- Catches double-entry of the same supplier invoice at the DB level

### Service-Layer Catch

`isUniqueViolation(error)` checks for PG SQLSTATE `23505`. Caught in `create()` and `fromGrn()`:

```typescript
if (isUniqueViolation(error)) {
  throw new ConflictException("A bill with this supplier invoice number already exists for this supplier");
}
```

`purchase-invoices.service.ts:172, 313`

### Internal Bill Number Uniqueness

```sql
UNIQUE(tenant_id, number)    -- purchase_invoices_tenant_id_number_key
```

Draft bills use `DRAFT-{UUID}` placeholder. Number becomes `PINV-NNNN` only at confirm.

### Gap-Free PINV Number

`DocNumberingService.reserveNumber()` reserves before the transaction. If the transaction rolls back, `releaseReservation()` is called to reclaim the number (lines 649-651). Committed via `safeCommitReservation()` post-commit.

## Period Control

### Fiscal Period Validation

Called at `confirm()` before any write:

```typescript
const period = await this.fiscalPeriod.validatePeriod(tenantId, ctx.legalEntityId, occurredAt);
```

Where `occurredAt = new Date(bill.invoiceDate + "T00:00:00.000Z")` — the supplier's bill date (not today).

| Period Status | Behaviour |
|--------------|-----------|
| Open | Allowed, proceed |
| SoftLocked | Allowed only with `softLockOverrideReason` in request body |
| HardLocked | 422 "The fiscal period for the bill date is locked" |
| (Closed) | Rejected by `validatePeriod` |

### SoftLock Override Flow

1. `assertSoftLockOverrideAllowed(tenantId, userId, period)` — checks role + policy; throws 403 if not allowed
2. `buildSoftLockOverride(isSoftLocked, userId, reason)` → produces override object
3. Passed into the outbox payload and threaded onto every `accounting.post` event
4. The accounting engine accepts the post into the soft-locked period

(`purchase-invoices.service.ts:526-548`)

### Posting Date = Invoice Date

The JE's `occurredAt` = the supplier's invoice date. This is deliberate: the expense/liability must be recognised in the period the invoice is dated, not when it was entered in the system. This can span period boundaries (backdating is common in MENA retail).

## Immutability

### Draft → Confirmed (one-way)

```sql
UPDATE purchase_invoices SET status='confirmed' WHERE status='draft'
```

`WHERE status='draft'` guards are in the UPDATE itself (line 611-617). If status is already confirmed (concurrent race), `updated` is null → `ConflictException`.

### No Edit After Confirm

`requireDraft()` throws 409 for any `addLine`, `updateLine`, `removeLine` on a confirmed bill. Corrections must go through purchase returns.

### Line Lock During Confirm

`lockDraftBill()` takes `FOR UPDATE` on the bill row before recomputing totals, preventing concurrent line edits from slipping in between the tax recompute and the status flip (lines 953-965).

### No Void / Cancel

There is no bill void endpoint. The schema has no `cancelled` status. Reversal is via purchase return (Layer 5), which posts a credit-note-style JE.

### Opening-Balance Bills

`isOpening = true` bills are special stub rows from the AP import flow. They are pre-confirmed (the JE was already posted by the opening-balance import). They must link to `openingJournalEntryId` (DB CHECK: `is_opening = false OR opening_journal_entry_id IS NOT NULL`, line 356).

## EXISTS vs REQUIRES

| Feature | Status |
|---------|--------|
| Supplier invoice number uniqueness (partial index) | EXISTS |
| DB-level unique violation caught as 409 | EXISTS |
| Gap-free PINV numbering with reserve/release | EXISTS |
| Period control (open/softlocked/hardlocked) | EXISTS |
| SoftLock override with role check | EXISTS |
| Posting date = invoice date (not system date) | EXISTS |
| Immutability after confirm (status guard in UPDATE) | EXISTS |
| Concurrent edit/confirm guard (FOR UPDATE) | EXISTS |
| Opening-balance bill link to JE | EXISTS |
| Duplicate check across tenants | N/A (by design — per-tenant) |
| Supplier invoice number fuzzy/OCR dedup | REQUIRES |
