# Query Execution Engine

## Pipeline

```
ReportDefinition (JSON)
  → Query Builder (translate to SQL)
  → Tenant DB Routing (query executes in tenant's dedicated database)
  → Permission Filter (branch, field visibility at app level)
  → Pre-Aggregation Check (use cached data if available)
  → Execute Query
  → Paginate / Stream
  → Return Result Set
```

---

## Query Translation

| Definition Field | SQL Translation |
|-----------------|----------------|
| `entity` | FROM clause — maps to base table or view |
| `columns` | SELECT clause — validated against entity field list |
| `filters` | WHERE clause — parameterized (never string-interpolated) |
| `groupings` | GROUP BY clause — date extractions use `date_trunc()` or `EXTRACT()` |
| `calculations` | SELECT aggregates — `SUM()`, `AVG()`, `COUNT()`, etc. |
| `sort` | ORDER BY clause |
| `visualization` | No SQL impact — used by rendering layer only |

### Query Construction Rules

| Rule | Detail |
|------|--------|
| Parameterized queries only | All filter values passed as parameters, never interpolated |
| Entity validation | `entity` must exist in the allowed entity registry (`02-report-builder.md`) |
| Column validation | Every column must be a valid field for the chosen entity |
| Join resolution | Multi-entity reports (e.g., items + stock levels) use pre-defined join paths |
| Raw SQL forbidden | Users cannot inject SQL — all queries built from JSON definition |

---

## Tenant Isolation (Dedicated Database)

| Layer | Mechanism |
|-------|-----------|
| Database | Each tenant has a dedicated PostgreSQL database. Queries execute within the tenant's own DB — cross-tenant data is architecturally impossible. |
| Application | `TenantContextMiddleware` routes requests to the correct tenant DB based on JWT `tenant_id` claim |
| Defense-in-depth | `tenantId` columns retained on all entities. `WHERE tenant_id = $1` can be added as secondary safety. |

See `tech-stack.md` → Security → Multi-tenant isolation. See `settings-admin/13-database-architecture.md` for full architecture.

---

## Permission Filtering (Application Level)

Applied at application level, before result return.

| Filter Type | Mechanism |
|------------|-----------|
| Branch isolation | If user has branch restriction, append `branch_id IN (allowed_branches)` to WHERE |
| Field visibility | If user lacks `reports.viewFinancial`, strip financial columns (cost, margin, profit) from SELECT |
| Cost visibility | If user lacks `inventory.cost.view`, strip cost/valuation columns |
| Entity access | If user lacks module permission, block entire entity (e.g., no `journal_entries` without accounting access) |

See `07-permissions.md` for permission keys.

---

## Pre-Aggregation Layer

Common metrics pre-computed via BullMQ nightly jobs to avoid expensive real-time queries.

| Aggregation | Schedule | Data |
|------------|----------|------|
| `daily_sales_totals` | Nightly 2:00 AM | Per branch: invoice count, POS count, total sales, total tax, total cost, gross profit |
| `stock_snapshots` | Nightly 3:00 AM | Per item × warehouse: on_hand, on_order, committed, unit_cost, total_value |
| `ar_aging_snapshot` | Nightly 3:30 AM | Per customer: current, 1-30, 31-60, 61-90, 90+ buckets |
| `ap_aging_snapshot` | Nightly 3:30 AM | Per supplier: current, 1-30, 31-60, 61-90, 90+ buckets |

### Pre-Aggregation Rules

| Rule | Detail |
|------|--------|
| Automatic fallback | If pre-aggregated data exists and report date range aligns, use it |
| Real-time supplement | Current day's data always queried live and merged with pre-aggregated |
| Staleness indicator | UI shows "Data as of [last run time]" when using pre-aggregated data |
| Manual refresh | User can force a live query, bypassing pre-aggregation |
| Tenant-scoped | Each aggregation job runs per tenant |

---

## Pagination

| Setting | Value |
|---------|-------|
| Default page size | 50 rows |
| Max page size | 500 rows |
| Cursor-based | Use keyset pagination (not OFFSET) for stable results |
| Total count | Returned with first page, cached for subsequent pages |

---

## Performance Rules

| Rule | Value |
|------|-------|
| Max result rows | 50,000 (export bypasses this — streams to file) |
| Query timeout | 30 seconds |
| Query plan cost check | If estimated cost > threshold, suggest adding filters or using pre-aggregation |
| Concurrent report queries per tenant | 5 |
| Export queue | Large exports (>10,000 rows) queued via BullMQ, not inline |

---

## Financial Report Period Enforcement

Financial reports (`gl_balances`, `journal_entries`) must respect fiscal year/period boundaries.

| Rule | Detail |
|------|--------|
| Period filter required | Financial reports must include a period or date range filter |
| Fiscal year alignment | P&L reports aggregate within fiscal year boundaries (see `accounting/08-period-control.md`) |
| Balance Sheet cumulative | Balance Sheet sums all periods up to and including selected period |
| Closed period data | Read-only access — no special handling needed (Reports never writes) |
