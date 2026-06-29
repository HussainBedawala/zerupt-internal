# Frontend — Payments, Returns, AP Overview

## Component Map

### Payments

| Component | File |
|-----------|------|
| Payments list | `components/payments-list-panel.tsx` |
| Payment create | `components/payment-create-panel.tsx` |
| Payment detail | `components/payment-detail-panel.tsx` |
| Post payment dialog | `components/post-payment-dialog.tsx` |
| Payment print | `print/supplier-payment-print-document.tsx` |
| API layer | `api/purchase-api.ts` (payments), `api/purchase-queries.ts` |

### Returns

| Component | File |
|-----------|------|
| Returns list | `components/returns/returns-list-panel.tsx` |
| Return create | `components/returns/return-create-panel.tsx` |
| Return detail | `components/returns/return-detail-panel.tsx` |
| API layer | `api/returns-api.ts`, `api/returns-queries.ts` |

### AP Overview

| Component | File |
|-----------|------|
| Overview panel | `components/overview/purchase-overview-panel.tsx` |
| KPI strip | `components/overview/purchase-overview-kpi-strip.tsx` |
| Recent documents table | `components/overview/recent-documents-table.tsx` |
| API layer | `api/overview-api.ts`, `api/overview-queries.ts` |

## Test Coverage

| Test | File |
|------|------|
| Post payment dialog unit test | `__tests__/post-payment-dialog.test.tsx` |
| Supplier detail panel | `__tests__/supplier-detail-panel.test.tsx` |
| Purchase API | `__tests__/purchase-api.test.ts` |
| Validation | `__tests__/validation.test.ts` |

## Defensive UX Checklist (CRITICAL — MENA users)

| State | Payment Create | Return Create |
|-------|---------------|---------------|
| Loading | Required | Required |
| Empty (no bills to allocate) | Required — explain why list is empty | Required |
| Error (API) | Required | Required |
| Success | Required — show PV number | Required — show PR number |
| Destructive confirm | N/A (post is irreversible) | Confirm dialog before PIN entry |

## Post Payment Dialog (`post-payment-dialog.tsx`)

Handles the Draft → Posted transition. Key UX concerns:
- Soft-lock period: must surface a reason input field when the period is soft-locked (period status returned in the validation response).
- Bank account selector: shown only when `paymentMethod === 'bank_transfer'` (ISSUE-72).
- Maker-checker: when `requirePaymentApproval` is enabled, show "approved by" + PIN fields.
- Debounce the submit button to prevent double-post.

## Return Create Panel (`return-create-panel.tsx`)

- GRN line picker must show only confirmed GRN lines.
- returnQty input: max = `grnLine.receivedQty − alreadyReturned` (server validates but UX should pre-calculate).
- Serial number input: shown when item is serial-tracked; count must match returnQty.
- PIN input: always required at confirm (no tenant setting bypass).

## AP Overview KPIs

Currently displayed from `purchase-overview.service.ts`:

| KPI | Exists in API |
|-----|--------------|
| Open PO count | YES |
| Pending receipts | YES |
| Outstanding AP (scalar) | YES |
| Overdue AP (scalar) | YES |
| Payments this month | YES |
| Draft bills count | YES |

**Missing from UI/API:** AP aging buckets (0-30 / 31-60 / 61-90 / 90+) per supplier — the overview only shows the aggregate overdue figure.

## EXISTS vs REQUIRES

| Feature | Status |
|---------|--------|
| Payment create + post UI | EXISTS |
| Payment list + detail | EXISTS |
| Payment print | EXISTS |
| Return create + confirm UI | EXISTS |
| Returns list + detail | EXISTS |
| AP overview KPIs | EXISTS |
| Post payment dialog (SoftLock reason + bank account + maker-checker) | EXISTS (test at `__tests__/post-payment-dialog.test.tsx`) |
| AP aging table (per-supplier buckets) | REQUIRES |
| Payment reversal UI | REQUIRES |
| Return void UI | REQUIRES |
| Advance allocation UI (apply advance to bills) | REQUIRES — create/post UI exists but no separate "allocate advance" dialog |
| FIFO allocation helper (auto-suggest oldest bills) | REQUIRES |
