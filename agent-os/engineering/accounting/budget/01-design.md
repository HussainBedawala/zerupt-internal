# Budget vs Actual — Design

> Status: **Not implemented.** P3 priority — Phase 6 (Reports).
> Route: `/accounting/budgets`
> Schema: `packages/db/src/schema/budget.ts` (does not exist yet)

## Purpose

Allow businesses to set expected amounts per account per period, then compare actual JE totals against those budgets. Essential for retail cost control: "We budgeted SAR 50K for rent this quarter — are we on track?"

---

## Table: `budgets`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | no | PK |
| tenantId | uuid | no | |
| legalEntityId | uuid | no | FK → legalEntities RESTRICT |
| fiscalYearId | uuid | no | FK → fiscalYears RESTRICT |
| name | varchar(200) | no | e.g. "2026 Operating Budget" |
| status | enum | no | `draft`, `approved`, `closed` |
| createdBy / updatedBy | uuid | no/yes | |
| createdAt / updatedAt | timestamp | no | |

### Status Transitions

```
draft → approved    (manager approves — locks amounts)
approved → draft    (reopen for revision — only before period starts)
approved → closed   (fiscal year closed)
```

### Constraints

- Unique: `(legal_entity_id, fiscal_year_id, name)` — one budget per name per year per entity
- Only 1 budget can be `approved` per legal entity per fiscal year (partial unique index)

---

## Table: `budget_lines`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | no | PK |
| budgetId | uuid | no | FK → budgets CASCADE |
| accountId | uuid | no | FK → accounts RESTRICT |
| fiscalPeriodId | uuid | no | FK → fiscalPeriods RESTRICT |
| amount | numeric(19,6) | no | Budgeted amount for this account+period |
| notes | varchar(500) | yes | |

### Constraints

- Unique: `(budget_id, account_id, fiscal_period_id)` — one amount per cell
- `amount >= 0` (budgets are always positive; DR/CR direction inferred from account type)

### Indexes

- `(budget_id, fiscal_period_id)` — period column view
- `(budget_id, account_id)` — account row view

---

## Budget vs Actual Query

The core report. No materialized view — computed on read from JE lines.

```sql
SELECT
  bl.account_id,
  a.code AS account_code,
  a.name AS account_name,
  bl.fiscal_period_id,
  fp.name AS period_name,
  bl.amount AS budget_amount,
  COALESCE(SUM(jel.debit) - SUM(jel.credit), 0) AS actual_amount,
  bl.amount - (COALESCE(SUM(jel.debit) - SUM(jel.credit), 0)) AS variance,
  CASE
    WHEN bl.amount = 0 THEN NULL
    ELSE ROUND(((COALESCE(SUM(jel.debit) - SUM(jel.credit), 0)) / bl.amount) * 100, 2)
  END AS utilization_pct
FROM budget_lines bl
JOIN accounts a ON a.id = bl.account_id
JOIN fiscal_periods fp ON fp.id = bl.fiscal_period_id
LEFT JOIN journal_entry_lines jel
  ON jel.account_id = bl.account_id
  AND jel.posting_date BETWEEN fp.start_date AND fp.end_date
  AND jel.journal_entry_id IN (
    SELECT id FROM journal_entries
    WHERE status = 'posted'
      AND legal_entity_id = :legalEntityId
  )
WHERE bl.budget_id = :budgetId
GROUP BY bl.account_id, a.code, a.name, bl.fiscal_period_id, fp.name, bl.amount
ORDER BY a.code, fp.start_date;
```

### Variance Interpretation

| Account Type | Positive Variance | Meaning |
|-------------|-------------------|---------|
| Expense | `budget > actual` | Under budget (good) |
| Expense | `budget < actual` | Over budget (alert) |
| Revenue | `budget > actual` | Under target (alert) |
| Revenue | `budget < actual` | Over target (good) |

The API response includes a `varianceDirection` field: `favorable` or `unfavorable`, computed based on account type.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/accounting/budgets` | List budgets for legal entity. Filter: fiscalYearId, status |
| GET | `/accounting/budgets/:id` | Budget detail with all lines |
| POST | `/accounting/budgets` | Create budget (draft) |
| PATCH | `/accounting/budgets/:id` | Update name/status |
| POST | `/accounting/budgets/:id/approve` | Lock budget |
| PUT | `/accounting/budgets/:id/lines` | Bulk upsert budget lines (spreadsheet-style save) |
| GET | `/accounting/budgets/:id/vs-actual` | Budget vs actual report. Query params: `periodId` (optional, for single period) |
| GET | `/accounting/budgets/:id/vs-actual/export` | CSV/Excel export |

### Validation

- Cannot modify lines when status = `approved` or `closed`
- All accountIds must exist, be active, and be detail accounts (not parent/group)
- All fiscalPeriodIds must belong to the budget's fiscal year
- Approve requires at least 1 budget line

---

## UI Components

| Component | Notes |
|-----------|-------|
| BudgetList | Table: name, year, status, actions |
| BudgetEditor | Spreadsheet grid — rows = accounts, columns = periods, cells = amounts |
| BudgetVsActual | Report table with color-coded variance (green = favorable, red = unfavorable) |
| BudgetVsActualChart | Bar chart: budget vs actual per period, with variance line |

### Spreadsheet Grid UX

```
              | Jan 2026 | Feb 2026 | Mar 2026 | ... | Total
Rent (6110)   | 15,000   | 15,000   | 15,000   |     | 180,000
Salaries      | 45,000   | 45,000   | 45,000   |     | 540,000
Utilities     |  3,000   |  3,200   |  3,100   |     |  37,200
...
Total         | 63,000   | 63,200   | 63,100   |     | 757,200
```

- Inline editing with auto-save (debounced PATCH)
- "Distribute evenly" button: enter annual total → divides by 12
- Copy from previous year's budget (if exists)
- Import from CSV

---

## Future Enhancements (Out of Scope)

- **Budget revisions** — versioned budgets with revision history
- **Department/cost center budgets** — budget per cost center (requires cost center implementation)
- **Rolling forecasts** — replace past actuals + future budget into a forecast view
- **Approval workflow** — multi-level approval before budget is locked
