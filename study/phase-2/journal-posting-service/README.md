# Journal Posting Service — Study Topics

## Event-Driven Accounting Architecture

The accounting engine sits between all business modules and the general ledger. No module writes journal entries directly — they emit events, and the posting service translates those events into double-entry journal entries.

**Why event-driven?** Decouples business logic from accounting rules. A POS module doesn't need to know which accounts to debit/credit — it just says "a sale happened" and the accounting engine handles the rest. This means:
- Account mappings can change without touching business modules
- New event types can be added without modifying the posting service
- The same event can produce different JEs for different legal entities (country-specific COAs)

## Idempotency in Financial Systems

Idempotency means "processing the same request twice produces the same result as processing it once." This is critical in accounting because:
- Network retries can send the same event twice
- Queue consumers may replay messages after a crash
- Concurrent requests can arrive for the same business event

**Implementation layers:**
1. **Application check** — query first to avoid unnecessary work (fast path)
2. **DB unique index** — partial unique index on `eventId` is the true safety net
3. **Catch unique constraint violation** — handle the concurrent duplicate gracefully (return null, not 500)

The check-then-act pattern alone has a race condition window. The DB constraint + error handling makes it truly safe.

## Decimal Arithmetic for Money

IEEE 754 floating-point cannot represent most decimal fractions exactly: `0.1 + 0.2 === 0.30000000000000004`. In an accounting engine, this causes:
- Balance checks that falsely pass or fail
- Stored amounts that diverge from correct values
- Rounding errors that compound over thousands of transactions

**Solution:** Use a decimal library (`decimal.js`) that performs base-10 arithmetic with configurable precision. All monetary operations — multiplication, addition, comparison — must use it. The DB stores values as `numeric(19,6)` which is exact decimal.

## Double-Entry Bookkeeping

Every financial transaction has two sides: where money comes from and where it goes. This is expressed as debit and credit entries that must always balance.

**The fundamental invariant:** `sum(debits) = sum(credits)` for every journal entry. This is enforced at:
1. Application level (decimal comparison before insert)
2. DB level (CHECK constraint `je_posted_balanced_check`)

**Why both?** Defense in depth. Application bugs can bypass the app check, but the DB constraint is the last line of defense. An unbalanced entry literally cannot exist in the database.

## Account Mapping Override Hierarchy

Rather than hardcoding "sales revenue goes to account 4110", the system uses a configurable mapping table. The override hierarchy allows customization at increasing specificity:

```
System default (fallback for all tenants)
  └── Tenant default (tenant-wide override)
      └── Warehouse override (warehouse-specific)
          └── Category override (product category)
              └── Item override (specific product)
```

Most specific match wins. This enables scenarios like: "Electronics go to a different revenue account than clothing" without changing business logic.

## IAS 21 — Multi-Currency Accounting

International Accounting Standard 21 governs how foreign currency transactions are recorded:
- **Transaction currency (TC):** The original amount in the currency it occurred in
- **Functional currency (FC):** The legal entity's reporting currency
- **Exchange rate:** Applied per-line, not just per-entry (different lines can have different rates)
- **Exchange rate date:** When the rate was sourced (may differ from posting date)

Each journal entry line stores both TC and FC amounts, enabling audit trails for currency conversion.

## Gap-Free Sequential Numbering

Regulators require journal entry numbers to be sequential with no gaps (e.g., JE-0001, JE-0002, JE-0003). Gaps suggest deleted entries, which is a red flag in audits.

**Challenge:** If number reservation happens before the transaction, and the transaction fails, you get a gap. **Solution:** Reserve the number inside the same database transaction as the JE insert. If the transaction rolls back, the number reservation rolls back too.

## Functional Currency Lock

Once a legal entity posts its first journal entry, the functional currency becomes immutable. This prevents currency changes after financial data exists, which would invalidate all previously recorded amounts. The lock is set atomically in the same transaction as the first JE.
