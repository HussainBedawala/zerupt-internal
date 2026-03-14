## 1. Fiscal Year vs Calendar Year

**What:** A fiscal year is the 12-month period a company uses for financial reporting. It doesn't have to align with the calendar year (Jan-Dec).

**Why it matters:** Zerupt targets MENA, India, and SEA — India mandates April-March fiscal years for tax, while UAE/Saudi use January-December. Your system must support both without hardcoding assumptions.

**How it works:**
- `FiscalSettings.fiscalYearStartMonth` stores the month (1-12) per legal entity
- When a fiscal year is created, 12 monthly periods are generated starting from that month
- A non-January start spans two calendar years: April 2026 start → April 2026 through March 2027

**Resources:**
- [India Income Tax Act — Previous Year definition](https://www.incometaxindia.gov.in/Pages/acts/income-tax-act.aspx)
- [UAE Federal Tax Authority — Tax Period](https://tax.gov.ae/en/taxes/vat.aspx)

## 2. Period Control (Open / Soft-Locked / Hard-Locked)

**What:** Each fiscal period (month) has a status that controls whether financial transactions can be posted into it. This is a fundamental accounting control.

**Why it matters:** Without period control, a user could accidentally (or intentionally) post a transaction into a closed month, corrupting financial reports that have already been filed with tax authorities.

**How it works:**
```
Open → SoftLocked → HardLocked
  ↑                      |
  └──────────────────────┘ (requires reason + audit)
```
- **Open:** All transactions allowed
- **Soft-Locked:** Warning shown. Permitted roles can override with a reason (logged)
- **Hard-Locked:** All transactions blocked. Must unlock first (admin-only, requires reason)

The `validatePeriod(legalEntityId, date)` function is called by every financial module (POS, Sales, Purchase, Inventory, Accounting) before persisting any transaction.

**Resources:**
- [IFRS Practice Statement — Period-End Close Procedures](https://www.ifrs.org/)

## 3. Date-Only Columns vs Timestamps in Financial Systems

**What:** Fiscal periods use `DATE` columns (timezone-naive) rather than `TIMESTAMPTZ` (timezone-aware) because fiscal periods are calendar concepts, not clock concepts.

**Why it matters:** A transaction at midnight in Dubai (UTC+4) is a different calendar date than midnight in UTC. If you store period boundaries as timestamps, a merchant in India (UTC+5:30) posting at 11:30 PM local time would hit the wrong period because 11:30 PM IST = 6:00 PM UTC = still the previous day in UTC.

**How it works:**
- Period `startDate` and `endDate` are `@db.Date` (not `@db.Timestamptz`)
- `validatePeriod` normalizes the transaction date to UTC midnight before comparing
- This ensures a transaction on "January 31" in any timezone matches the January period

```typescript
const dateOnly = new Date(Date.UTC(
  transactionDate.getFullYear(),
  transactionDate.getMonth(),
  transactionDate.getDate(),
));
```

**Resources:**
- [PostgreSQL DATE vs TIMESTAMP types](https://www.postgresql.org/docs/current/datatype-datetime.html)

## 4. Year-End Closing Process

**What:** At the end of a fiscal year, an accountant "closes the books" — all income/expense accounts are zeroed out and the net profit is transferred to Retained Earnings.

**Why it matters:** Year-end closing is why `FiscalYear.isClosed`, `closedAt`, `closedBy`, and `closingEntryId` exist. Without these, there's no way to track whether a year has been properly closed or who did it.

**How it works (Phase 2):**
1. Pre-closing checklist (advisory): all months soft-locked, bank reconciled, no unposted drafts
2. Generate closing journal entry (DR all income, CR all expenses, net to Retained Earnings)
3. Hard-lock all 12 periods
4. Auto-create next fiscal year with 12 open periods
5. Record closing entry ID and timestamp on the fiscal year

**Resources:**
- [Year-End Closing Procedures — AccountingTools](https://www.accountingtools.com/articles/year-end-closing-entries)

## 5. Denormalization for Query Performance

**What:** `FiscalPeriod.legalEntityId` is duplicated from `FiscalYear.legalEntityId`. This is intentional denormalization.

**Why it matters:** `validatePeriod` is called on every financial transaction. It needs to find the period containing a date for a specific legal entity. Without the denormalized column, the query would need a JOIN through `fiscal_years` to filter by `legalEntityId`. With it, a single indexed query on `(tenant_id, legal_entity_id, start_date, end_date)` finds the period directly.

**How it works:**
- The `fiscal_periods_date_lookup` composite index covers the validatePeriod query
- PostgreSQL can satisfy the query entirely from the index (index-only scan)
- Trade-off: 16 bytes extra per period row (UUID) vs JOIN on every transaction

**Resources:**
- [PostgreSQL Indexes — Multicolumn Indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html)
- [Denormalization Patterns in Financial Systems](https://martinfowler.com/bliki/DataClump.html)
