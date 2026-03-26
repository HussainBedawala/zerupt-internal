# Tax Account Type Validation

## Why validate account types on tax codes?

Tax codes reference two GL accounts:
- **outputAccountId** → where tax collected on sales is posted (must be a **liability** account, e.g., "VAT Payable")
- **inputAccountId** → where tax paid on purchases is posted (must be an **asset** account, e.g., "VAT Receivable")

If these point to wrong account types, every downstream journal entry using the tax code will debit/credit the wrong side of the balance sheet. A tax code pointing `outputAccountId` to an expense account would silently misstate both tax liability and expenses on every sale.

## The tenant isolation dimension

In a multi-tenant system, account validation must scope queries by `tenantId`. Without this:
- Tenant A could reference Tenant B's account ID
- The validation would pass (account exists, type matches)
- A cross-tenant FK is stored, creating a data integrity violation

Even with per-tenant databases, defense-in-depth requires the `WHERE` clause to include `tenantId`.

## TOCTOU consideration

Account type validation happens before the INSERT/UPDATE. Between validation and write:
- The account could theoretically be deleted or its type changed
- This is a Time-of-Check-to-Time-of-Use (TOCTOU) race condition
- For tax configuration (low-frequency admin operation), this risk is negligible
- For financial transactions (high-frequency), wrap validation + write in a single transaction

## Pattern: field-specific validator

```
validateAccountType(db, tenantId, accountId, expectedType, fieldName)
  → NotFoundException if account doesn't exist for this tenant
  → BadRequestException if account.type !== expectedType
  → void if valid
```

The `fieldName` parameter allows the error message to specify which field failed ("outputAccountId must reference a liability account") without leaking the internal account UUID.

## Key concepts
- **Account type constraints**: enforce correct GL account classification at configuration time, not at posting time
- **Tenant-scoped validation**: always include `tenantId` in account lookups, even in per-tenant DBs
- **Error message safety**: don't leak internal IDs in API error responses — use field names instead
- **Defense-in-depth**: validate at both the tax code level (configuration) and the JE posting level (runtime)
