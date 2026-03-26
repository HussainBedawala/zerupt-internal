# Trial Balance — Design

> Status: **Not implemented.** Phase 2 essential.
> Route: `/accounting/trial-balance`

## What It Is

A report showing all accounts with their debit/credit totals for a selected period. Must balance: `total debits = total credits`. First thing an accountant checks.

## Backend

### New Endpoint

```
GET /tenant/reports/trial-balance?legalEntityId=&fromDate=&toDate=
Permission: accounting.reports.read
```

### Query

```sql
SELECT
  a.id, a.code, a.name, a.name_alt, a.type, a.sub_type,
  a.parent_account_id, a.depth, a.is_header,
  COALESCE(SUM(jel.debit), 0)  AS total_debit,
  COALESCE(SUM(jel.credit), 0) AS total_credit,
  COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0) AS net_balance
FROM accounts a
LEFT JOIN journal_entry_lines jel
  ON jel.account_id = a.id
  AND jel.posting_date BETWEEN :fromDate AND :toDate
LEFT JOIN journal_entries je
  ON je.id = jel.journal_entry_id
  AND je.status = 'posted'
WHERE a.tenant_id = :tenantId
  AND a.legal_entity_id = :legalEntityId
  AND a.deactivated_at IS NULL
GROUP BY a.id
ORDER BY a.code
```

### Response Shape

```ts
{
  data: {
    accounts: Array<{
      id: string; code: string; name: string; nameAlt: string | null;
      type: AccountType; subType: AccountSubType;
      parentAccountId: string | null; depth: number; isHeader: boolean;
      totalDebit: string; totalCredit: string; netBalance: string;
    }>;
    summary: {
      totalDebit: string; totalCredit: string;
      isBalanced: boolean; // totalDebit === totalCredit
      currency: string; // entity's functional currency
    };
  };
  meta: { legalEntityId: string; fromDate: string; toDate: string; };
}
```

## Frontend

### Page Layout

1. **Filter bar:** Legal entity selector + date range picker (defaults to current fiscal year)
2. **Balance indicator:** Green badge "Balanced" or red "Imbalanced by X" — prominent, top-right
3. **Table:** Code | Account Name | Debit | Credit | Net Balance
   - Indented by `depth` (tree hierarchy via `parentAccountId`)
   - Header accounts in bold, no amounts (or subtotals if we sum children)
   - Type grouping: Asset → Liability → Equity → Income → Expense
4. **Footer row:** Totals for Debit / Credit columns

### Interactions

- Click account row → navigate to GL drill-down (see `general-ledger/01-design.md`)
- Export CSV button
- Print-friendly layout (hide sidebar, full-width table)

### Empty/Error States

- No entity selected → prompt to select
- No data → "No posted journal entries for this period"
- Imbalanced → warning banner with amount (data corruption indicator)
