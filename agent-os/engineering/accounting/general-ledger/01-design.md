# General Ledger Drill-Down — Design

> Status: **Not implemented.** Phase 2 essential.
> Route: `/accounting/general-ledger?accountId=&fromDate=&toDate=` or sheet from COA tree

## What It Is

View all journal entry lines for a specific account within a date range. Essential for accountants auditing their books.

## Backend

### New Endpoint

```
GET /tenant/reports/general-ledger?accountId=&legalEntityId=&fromDate=&toDate=&page=&limit=
Permission: accounting.reports.read
```

### Query

```sql
SELECT
  jel.id, jel.posting_date, jel.debit, jel.credit, jel.debit_tc, jel.credit_tc,
  jel.currency, jel.exchange_rate, jel.description, jel.description_alt,
  je.entry_number, je.source, je.status,
  je.source_document_type, je.source_document_number
FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.journal_entry_id
WHERE jel.account_id = :accountId
  AND jel.tenant_id = :tenantId
  AND je.status = 'posted'
  AND jel.posting_date BETWEEN :fromDate AND :toDate
ORDER BY jel.posting_date ASC, je.entry_number ASC
LIMIT :limit OFFSET :offset
```

Uses existing index: `jel_account_id_posting_date_idx`.

### Response Shape

```ts
{
  data: {
    account: { id; code; name; nameAlt; type; normalBalance; };
    openingBalance: string; // sum of debit-credit before fromDate
    lines: Array<{
      id; postingDate; debit; credit; debitTC; creditTC;
      currency; exchangeRate; description; descriptionAlt;
      entryNumber; source; sourceDocumentType; sourceDocumentNumber;
      runningBalance: string; // computed server-side
    }>;
    closingBalance: string; // openingBalance + sum of lines
    summary: { totalDebit; totalCredit; netMovement; };
  };
  meta: { accountId; legalEntityId; fromDate; toDate; page; limit; total; };
}
```

### Running Balance

Computed server-side per line:
- For debit-normal accounts: `running += debit - credit`
- For credit-normal accounts: `running += credit - debit`
- Starting from `openingBalance`

## Frontend

### Access Points

1. **From Trial Balance** — click account row → navigates to GL page
2. **From COA tree** — click account → opens sheet/panel with GL view
3. **Direct navigation** — `/accounting/general-ledger?accountId=...`

### Page Layout

1. **Account header:** Code, Name, Type, Normal Balance
2. **Filter bar:** Date range picker (defaults to current FY)
3. **Opening balance row** (non-clickable, grey background)
4. **Table:** Date | Entry # | Description | Source Doc | Debit | Credit | Balance
   - Entry # links to `/accounting/journal-entries/:id`
   - Source doc links to source module (invoice, GRN, etc.)
5. **Closing balance row** (bold, bottom)
6. **Summary bar:** Total Debit | Total Credit | Net Movement

### Interactions

- Pagination (server-side, default 50 per page)
- Export CSV
- Click entry number → JE detail page
- Click source doc → source module page

### Empty/Error States

- No account selected → prompt
- No transactions → "No posted entries for this account in the selected period"
