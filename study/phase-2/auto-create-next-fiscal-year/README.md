# Auto-Create Next Fiscal Year on Close

## Concepts

### Fiscal Year Lifecycle
A fiscal year progresses through stages: Open → Periods Soft-Locked → Year Closed. When a year closes, the next year must exist so the business can continue posting transactions. Auto-creating the next FY eliminates a manual step that could block operations.

### Idempotency in Financial Operations
Financial operations must be safe to retry. The auto-create uses two layers of idempotency:
1. **Application-level check**: query before insert to avoid unnecessary work
2. **Database-level constraint**: unique index on `(tenant_id, legal_entity_id, start_date)` prevents duplicates even under concurrent access

### TOCTOU (Time-of-Check-to-Time-of-Use)
A classic race condition where the state changes between checking and acting. Example: two concurrent close requests both check "does next FY exist?" → both get "no" → both insert → duplicate. Solutions:
- **Unique constraints** (preferred): let the DB enforce uniqueness, catch the constraint violation
- **Pessimistic locking**: `SELECT FOR UPDATE` before check
- **Serializable transactions**: highest isolation level, most expensive

### Atomic Transactions for Related Records
When creating a parent record (fiscal year) and its children (12 periods), both must succeed or fail together. A partial insert (year without periods) creates an orphaned record that blocks future operations because the idempotency check sees the year as "already created."

### Graceful Degradation
The auto-create is a convenience feature — it should never cause the primary operation (closing the year) to fail. The `try/catch` ensures the close succeeds even if auto-create fails, while logging the error for investigation.

## Calendar Year Calculation
For January-start fiscal years (e.g., FY 2026 = Jan–Dec 2026), the end date's year equals the FY year, so next FY = endYear + 1.

For non-January starts (e.g., April: FY 2026-2027 = Apr 2026–Mar 2027), the end date's year (2027) is already the calendar year the next FY begins in. This is why `nextCalendarYear = startMonth === 1 ? endYear + 1 : endYear`.
