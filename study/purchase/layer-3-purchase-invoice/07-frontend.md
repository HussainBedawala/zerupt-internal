# 07 — Frontend (Bill UI)

## Location

`erp/apps/web/src/features/purchase/` — bill creation, list, detail views.

## Key User Flows

### Flow A: Bill from GRN

1. User opens Purchase → Bills → "New from GRN"
2. Selects supplier → lists confirmed, unbilled GRNs for that supplier
3. Selects one or more GRNs → calls `POST /tenant/purchase-invoices/from-grn`
4. Draft bill opens with pre-populated lines (qty = unbilled remainder, price = GRN cost)
5. User enters supplier invoice number (optional), bill date, notes
6. User clicks Confirm → `POST /tenant/purchase-invoices/:id/confirm`
7. Success: PINV-NNNN shown, status=confirmed

### Flow B: Manual Bill

1. New bill → enter supplier, date, lines (item, qty, price, tax group)
2. Add/edit lines → live total updates via TanStack Query
3. Confirm → period checked server-side; if soft-locked, override reason required

### Flow C: Direct Purchase

1. POS-adjacent express path
2. Single form: supplier + lines + settlement (paid/credit) + optional approval
3. Calls `POST /tenant/purchase/direct`
4. Returns grnNumber, billNumber, paymentId in one response

## Defensive UX Requirements

Per CLAUDE.md "Defensive UX (CRITICAL)" — MENA retail users:

| State | Requirement |
|-------|-------------|
| Loading | Spinner on confirm button, disabled during submit |
| Error | Toast with server error message (period locked, duplicate, etc.) |
| Empty | Empty state on GRN selector (no confirmed GRNs) |
| Success | Flash PINV number, navigate to bill detail |
| Soft-lock | Prompt for override reason with clear explanation |
| Destructive | No delete on confirmed bills (immutable) |
| Race condition | Confirm button debounced; server returns 409 on double-click |

## GRN-Linked Line Constraints in UI

- Price field: read-only on GRN-linked lines (frozen to GRN cost)
- Discount field: hidden/disabled on GRN-linked lines
- Quantity field: editable but capped at unbilled remainder (show remaining as helper text)
- Tax group: read-only (copied from GRN line)

## Supplier Invoice Number

- Optional text input on bill header
- If entered: validated unique per supplier on save/confirm (409 → inline error "This invoice number already exists for this supplier")
- If omitted: allowed (partial-index skips nulls)

## Period Warning

When `invoiceDate` is in a soft-locked period, the UI should proactively warn ("This date is in a closed-for-edits period. An override reason is required.") before the user hits confirm — reduces friction.

## Multi-Currency

Exchange rate field shown when supplier's `defaultCurrency` differs from branch functional currency. Rate pre-filled from tenant exchange rates table.

## AP Aging (read)

Bill list shows:
- Outstanding balance
- Due date with overdue indicator (today > dueDate)
- Aging buckets (0-30, 31-60, 61-90, 90+) derived from `dueDate`

## EXISTS vs REQUIRES

| Feature | Status |
|---------|--------|
| Bill from GRN flow | EXISTS (feature/purchase/) |
| Manual bill creation | EXISTS |
| Direct purchase form | EXISTS |
| GRN-linked line price/discount lock (UI) | VERIFY — backend enforces; UI should show readonly |
| Proactive soft-lock period warning | REQUIRES |
| Unbilled remainder helper text on line qty | REQUIRES |
| Duplicate supplier invoice number inline error (not just toast) | REQUIRES |
| AP aging buckets on bill list | REQUIRES (basic balance shown; buckets not yet) |
| Input VAT display per line | VERIFY |
| i18n (Arabic) of all bill UI | REQUIRES verification |
