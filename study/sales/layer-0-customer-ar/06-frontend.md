# 06 — Frontend: Customer Master + AR Overview

## Files

| File | Purpose |
|------|---------|
| `apps/web/src/features/customers/types.ts` | Type shapes for customers, invoices, receipts |
| `apps/web/src/features/customers/components/customer-form-panel.tsx` | Create/edit form |
| `apps/web/src/features/customers/components/customers-list-panel.tsx` | Customer list with outstanding balance |
| `apps/web/src/features/customers/components/customer-detail-panel.tsx` | Customer detail view |
| `apps/web/src/features/customers/components/customer-kpi-strip.tsx` | KPI strip (outstanding, open count, last payment) |
| `apps/web/src/features/customers/components/customer-invoices-tab.tsx` | Linked invoices tab |
| `apps/web/src/features/customers/components/customer-payments-tab.tsx` | Linked receipts tab |
| `apps/web/src/app/[locale]/(app)/sales/page.tsx` | Sales overview (AR aging dashboard) |

---

## Customer Type Shapes vs API

### `Customer` interface (`types.ts` lines 27–43)

| Field | Present | Notes |
|-------|---------|-------|
| id, tenantId, code, name, nameAlt | YES | |
| imageUrl, phone, email, taxNumber | YES | |
| defaultTaxGroupId | YES | |
| status | YES | `active | inactive | blocked` |
| notes, createdAt, updatedAt | YES | |
| `creditLimit` | **NO** | Backend has it; frontend type omits it |
| `defaultCurrency` | **NO** | Missing in backend schema too |
| `paymentTermsDays` | **NO** in Customer; YES in CustomerDetail | Inconsistency |

### `CustomerDetail` interface (`types.ts` lines 88–99)

Adds: `contacts`, `addresses`, `outstandingBalance`, `openInvoiceCount`, `lastPaymentAmount`, `lastPaymentDate`, `paymentTermsDays`.

Missing: `creditLimit`, `defaultCurrency`.

### `CreateCustomerPayload` / `UpdateCustomerPayload` (`types.ts` lines 101–131)

Both omit `creditLimit` and `defaultCurrency` — these cannot be set from the frontend.

---

## Customer List Panel

`customers-list-panel.tsx`:
- Displays: code, name, phone, status badge, outstanding balance.
- Outstanding balance is styled `text-destructive` when `status === 'blocked'` (line 232).
- `displayMoney3(c.outstandingBalance, locale)` — displays the raw SUM from invoice scan.
- Sort by outstanding balance is supported (triggers the `outstandingSub` subquery path).

---

## Customer KPI Strip

`customer-kpi-strip.tsx`:
- `outstandingBalance` — single total from invoice scan.
- `openInvoiceCount` — count of confirmed invoices with balance > 0.
- `lastPaymentAmount` / `lastPaymentDate` — from latest posted receipt voucher.

No credit limit display. No "used X% of credit limit" progress bar. No blocked reason display.

---

## Customer Form Panel

`customer-form-panel.tsx`:
Fields present: name, nameAlt, phone, email, taxNumber, defaultTaxGroupId, status, paymentTermsDays, notes.
Fields absent: `creditLimit` (no input), `defaultCurrency` (no input), `defaultPriceListId` (no input).

Status can be set to `blocked` from the form with no reason prompt — contradicts spec.

---

## AR Aging Overview (Sales page)

`apps/api/src/sales/overview/sales-overview.service.ts` powers the sales page KPIs and AR aging.

The AR aging buckets (`current / 1-30 / 31-60 / 61+`) are computed from `sales_invoices.balance` filtered by `dueDate` bands. This is correct logic for single-currency tenants but mixes currencies for multi-currency (see chapter 04).

The frontend displays the aging as four KPI cards. No currency-per-bucket breakdown.

---

## Missing Frontend Features vs Spec

| Feature | Spec reference | Frontend status |
|---------|---------------|-----------------|
| Credit limit field in customer form | `01-customer-model.md` | MISSING |
| Credit limit used/available display | `01-customer-model.md` | MISSING |
| Blocked reason prompt on status change | `01-customer-model.md` | MISSING |
| Default currency on customer form | `01-customer-model.md` | MISSING |
| Default price list on customer form | `01-customer-model.md` | MISSING |
| Manager PIN override for over-limit confirm | `01-customer-model.md` | MISSING |
