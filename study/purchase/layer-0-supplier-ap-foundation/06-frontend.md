# 06 — Frontend: Supplier Master + AP Overview

## Component Map

| File | Purpose |
|------|---------|
| `features/purchase/components/suppliers-list-panel.tsx` | Paginated supplier list with search + status filter |
| `features/purchase/components/supplier-detail-panel.tsx` | Supplier detail page with tabs (bills, payments, orders) |
| `features/purchase/components/supplier-kpi-strip.tsx` | 4-KPI card row: outstanding balance, open orders, last payment, supplier since |
| `features/purchase/components/supplier-form-panel.tsx` | Create/edit supplier form |
| `features/purchase/api/purchase-queries.ts` | TanStack Query hooks: `useSuppliersQuery`, `useSupplierQuery`, etc. |
| `features/purchase/types.ts` | `SupplierStatus` type, `SUPPLIER_STATUSES` constant |
| `features/purchase/lib/display.ts` | `displayMoney3`, `displayDateOnly`, `toAppLocale` helpers |

---

## Supplier List Panel

- Displays: code, name/nameAlt, phone, email, status badge, outstanding balance
- Search: ilike on code + name + nameAlt (server-side)
- Filter: status (all / active / inactive / blocked)
- Pagination: 20 per page, client controls page state
- Outstanding balance: returned by list API as computed aggregate

**Status badge tones:**
- `active` → success (green)
- `inactive` → neutral (grey)
- `blocked` → danger (red)

---

## Supplier KPI Strip (`supplier-kpi-strip.tsx`)

Four cards shown on the supplier detail page:

| KPI | Source | Notes |
|-----|--------|-------|
| Outstanding Balance | `supplier.outstandingBalance` from API | SUM(balance) on confirmed invoices |
| Open Orders | count from `useOrdersQuery` filtered to open statuses | statuses: `confirmed`, `partially_received` |
| Last Payment | amount + date from `usePaymentsQuery` | most recent posted payment |
| Supplier Since | `supplier.createdAt` formatted as month+year | |

---

## Frontend Gaps

### 1. No credit limit display

The spec (`01-supplier-model.md`) defines `creditLimit`. Neither the KPI strip nor the detail panel shows a credit limit or a utilization gauge. The schema doesn't have the field yet (Layer 0 gap), so the UI gap is downstream.

**REQUIRES:** Once `credit_limit` is added to schema, add a "Credit Used / Limit" KPI card and a visual indicator when `outstandingBalance > creditLimit`.

### 2. No default currency display

`defaultCurrency` is missing from the supplier form and the detail view. When this is added to schema, the form should show it alongside `paymentTermDays`.

### 3. Blocked reason not shown

The status badge shows "Blocked" in red but there is no blocked reason text shown anywhere in the UI. If `blockedReason` is added to the schema, the detail panel should surface it.

### 4. No AP aging breakdown in supplier detail

The KPI strip shows a single `outstandingBalance` number. A proper AP subledger view would show aging buckets (0–30 days, 31–60, 61–90, 90+) per supplier. There is no aging component in the supplier detail panel.

**REQUIRES:** An AP aging widget per supplier using `dueDate` buckets from `purchase_invoices`. Index `purchase_invoices_tenant_id_due_date_open_idx` already exists for this query.

### 5. Outstanding balance currency display

`displayMoney3` formats amounts to 3 decimal places. The outstanding balance aggregates bills in potentially mixed currencies. If a supplier has invoices in both USD and KWD, the sum is meaningless without a functional-currency conversion. The UI currently displays whatever the API returns (a raw sum in mixed currencies).

**REQUIRES:** The API should return `outstandingBalanceFn` (functional currency equivalent) alongside `outstandingBalance` (transaction currency sum, which is only meaningful for single-currency suppliers). Until `balance_fn` columns exist, note this as a display limitation.

### 6. No supplier tax number displayed

The `taxNumber` field (TRN/GSTIN) is in the schema and DTO response but is not shown in the `supplier-kpi-strip` or list. It appears in the form panel only. For VAT-regulated markets, the TRN should be prominently visible on the detail view.

---

## i18n Coverage

- Translations are under `purchases.suppliers.*` keys (next-intl)
- `toAppLocale` converts Next.js locale string to `AppLocale` type for display helpers
- Both `ar` and `en` locales supported via `displayMoney3` / `displayDateOnly`
- Bilingual name: list panel shows `nameAlt` when locale is `ar` (via `toAppLocale` logic)
