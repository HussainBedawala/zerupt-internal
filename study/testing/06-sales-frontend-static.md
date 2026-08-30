# Phase E — Sales Frontend Static Audit

Method: code-only (no browser — owned by another agent this session). All findings are
CONFIRMED via direct file read (file:line evidence below) unless marked SUSPECTED.
Scope: `erp/apps/web/src/features/{customers,sales-overview,sales,invoices,delivery-orders,
debit-notes,quotations,sales-orders,credit-notes,receipts}` + their routes under
`app/[locale]/(app)/sales/**`.

---

## HIGH

### H1 — No `placeholderData: keepPreviousData` on any sales list query (8 of 8)
CONFIRMED. Every sales list-query hook is a bare `useQuery` with no `placeholderData`.
Purchase/inventory already fixed this class (28 hits repo-wide, all in purchase/inventory/
audit/dashboard/pos/exchange-rates — **zero** in sales). Paging or filtering any sales list
unmounts the whole panel to a loading skeleton instead of keeping the old page visible.

Sites (all missing it):
- `features/invoices/api/invoices-queries.ts:66-72` — `useInvoicesQuery`
- `features/invoices/api/invoices-queries.ts:305-310` — `useCreditNotesQuery`
- `features/invoices/api/invoices-queries.ts:388-394` — `useReceiptsQuery`
- `features/customers/api/customers-queries.ts:49-58` — `useCustomersQuery`
- `features/debit-notes/api/debit-notes-queries.ts:7-11` — `useDebitNotesQuery`
- `features/delivery-orders/api/delivery-orders-queries.ts:29-38` — `useDeliveryOrdersQuery`
- `features/quotations/api/quotations-queries.ts:27-36` — `useQuotationsQuery`
- `features/sales-orders/api/orders-queries.ts:26-32` — `useOrdersQuery`
- `features/sales/api/sales-queries.ts:105-109` — `useDirectSalesQuery`

All 8 feed a list panel with pager controls (`credit-notes-list-panel.tsx`,
`customers-list-panel.tsx`, `debit-notes-list-panel.tsx`, `delivery-orders-list-panel.tsx`,
`invoices-list-panel.tsx`, `quotations-list-panel.tsx`, `orders-list-panel.tsx`,
`direct-sales-list-panel.tsx`, `payments-list-panel.tsx` via `useReceiptsQuery`). That's 9
panels affected (receipts shares the invoices-queries file). Fix is mechanical: add
`placeholderData: keepPreviousData` to each, matching `features/purchase/api/orders-queries.ts`.

### H2 — PERM-004: create forms fully interactive with no client-side create-permission gate
CONFIRMED for 6 of 7 sales create surfaces. Denial only happens when the create mutation
hits the API and the server returns 403 — the form itself never checks
`useHasPermission("sales.*.create")` before rendering, unlike the one place this was already
fixed correctly:

**Correct pattern (reference)**: `features/sales/components/direct/direct-sale-panel.tsx:164`
— `const canCreate = useHasPermission(PERMISSION_KEYS.sales.invoiceCreate);` gates the whole
form behind a "no permission" alert (lines ~465-494).

**Missing the gate** — verified by grepping the entire file for `permission` (case-insensitive,
zero hits) in each, and confirming the wrapping page (`app/[locale]/(app)/sales/**/new/page.tsx`)
also does no server-side redirect/check:
- `features/invoices/components/invoice-create-panel.tsx` (541 lines, 0 permission refs)
- `features/quotations/components/quotation-create-panel.tsx` (238 lines, 0 permission refs)
- `features/sales-orders/components/order-create-panel.tsx` (141 lines, 0 permission refs)
- `features/delivery-orders/components/delivery-order-create-panel.tsx` (332 lines, 0 permission refs)
- `features/receipts/components/payment-create-panel.tsx` (452 lines, 0 permission refs)
- `features/customers/components/customer-form-panel.tsx` (1456 lines, 0 permission refs)
- The credit-note create flow (`credit-note-create-panel.tsx` → `CreditNoteDialog` in
  `features/invoices/components/credit-note-dialog.tsx`) also has zero permission refs; its
  `canSubmit` only checks form completeness + `!isPending` + approval-PIN, never
  `sales.creditNote.create`.

Note: this is scoped to the initial **create** action. The corresponding **detail-page action
buttons** (confirm/void/post/cancel/approve) on all these documents DO correctly gate via
`useHasPermission` (e.g. `invoice-detail-panel.tsx:132-133`, `order-detail-panel.tsx:136`,
`credit-note-detail-panel.tsx:94,127`, `delivery-order-detail-panel.tsx:68-69`,
`payment-detail-panel.tsx:72`, `quotation-detail-panel.tsx:101-110`) — so the regression is
specifically the create entry points, not the module as a whole.

Also applies to the plain sales-order edit form: `features/sales-orders/components/
order-edit-panel.tsx` has zero references to `canEdit`/`edit.`/`permission` — it is always
fully interactive regardless of business-rule editability or RBAC, unlike
`invoice-edit-panel.tsx:525-527` (`if (!canEdit) { ... }`, server-driven) and
`direct-sale-edit-panel.tsx:135-136` which both gate on a server-returned `edit.canEdit`.

---

## MEDIUM

### M1 — Literal `"—"` em-dash placeholders instead of the shared `EMPTY_VALUE_PLACEHOLDER` constant
CONFIRMED. The shared constant is `packages/shared/src/format/empty-value.ts:15`:
`export const EMPTY_VALUE_PLACEHOLDER = "-";` (a plain hyphen, not an em dash). Sales has ~20
sites hardcoding a literal em dash `"—"` as an empty-value fallback instead of importing this
constant — inconsistent placeholder glyph and a real "no unnecessary docs"-style silent
constant-adoption gap:

- `features/customers/lib/display.ts:16` — `if (days === null || days === undefined) return "—";`
- `features/customers/lib/display.ts:29` — `if (!raw) return "—";`
- `features/sales-overview/lib/display.ts:14` — `if (!raw) return "—";`
- `features/invoices/lib/display.ts:12` — `if (!raw) return "—";`
- `features/customers/components/customers-list-panel.tsx:483,491`
- `features/customers/components/customer-kpi-strip.tsx:47`
- `features/customers/components/customer-statement-tab.tsx:153,184,189`
- `features/sales/components/direct/direct-sales-list-panel.tsx:326`
- `features/sales/components/direct/direct-sale-detail-lines.tsx:113`
- `features/invoices/components/invoice-detail-panel.tsx:1664`
- `features/invoices/components/credit-note-dialog.tsx:522`
- `features/invoices/components/invoices-list-panel.tsx:411,413`
- `features/delivery-orders/components/delivery-order-draft-lines-editor.tsx:447`
- `features/sales-orders/print/sales-order-print-document.tsx:130` — `name: customer?.name ??
  order.customerName ?? "—"` — **on a printed document**; not a raw-UUID leak (falls back to
  the denormalized customer name first) but does leak the wrong empty-glyph onto a fiscal print
  if both are absent.
- `features/sales-orders/components/orders-list-panel.tsx:343,346,350,352`
- `features/sales-orders/components/order-detail-panel.tsx:1119`

Same class as the founder's "no em dashes" rule, applied to empty-state rendering rather than
copy — worth a single find-and-replace sweep once the constant is confirmed as the intended
UI-empty-value token (it currently renders as `-`, so switching also changes the visual glyph
tenant-wide; flag for a design decision, not just a mechanical fix).

### M2 — `warehouseLabel` falls back to raw warehouse UUID on the invoice create line editor
CONFIRMED, but narrow blast radius. `features/invoices/components/
invoice-create-line-editor.tsx:149`:
```
const warehouseLabel = warehouses.find((w) => w.id === warehouseId)?.name ?? warehouseId;
```
Only reachable if `addItemLine` runs before the warehouses list has loaded/matched (the caller
already guards `if (!warehouseId) return;` one line above, but not on `warehouses` being
non-empty). Confirmed NOT print-reachable — this is a create-time line-add helper, not part of
`invoice-print-document.tsx` (which was already hardened: see below). Downgraded from the
"~40 known raw-id sites" class to MEDIUM because it is a single call site with a narrow
precondition, not a systemic pattern in sales.

**Positive control** — the print layer itself is already correctly hardened against this exact
class, referencing the prior purchase incident by name:
`features/invoices/components/invoice-print-document.tsx:84-91` resolves the customer name via
`useCustomerMap` (`useEntityMap`-backed) with an explicit comment: *"Resolved name, else the
denormalized name the invoice itself carries, else the shared placeholder. NEVER the raw
customer id: this is a customer-facing tax document (same class as PUR-036/PUR-056)."* All five
sales print documents checked (invoice, credit note, quotation, delivery order, sales order)
use `useCustomerMap`/`useItemMap` → `.get()`/`.getEntity()`, never a bare destructure of the
map or a raw-id `??` fallback. No raw-UUID leak found on any sales printed document.

---

## LOW

### L1 — Tax visibility: single correct mechanism confirmed, no drift found
Checked for Purchase's "three inconsistent tax-visibility mechanisms" pattern. Sales uses
exactly ONE: a server-derived `taxMode: "none" | "exclusive" | "inclusive"` threaded through
every document type (`invoices/types.ts:530`, `quotations/types.ts:306`,
`sales-orders/types.ts:105`, `sales/api/sales-api.ts:107`), with repeated in-code comments
warning against the wrong source (`legal_entities.tax_system`, hardcoded to `'vat'`) at
`direct-sale-totals.tsx:6-8`, `invoice-create-totals.tsx:6-8`, `quotations/types.ts:290`,
`invoices/types.ts:528`. No hardcoded tax rows found; Kuwait (taxMode "none") correctly hides
all tax UI everywhere checked. This is the healthy state — no finding, recorded as a negative
control per method rule 5.

### L2 — Money formatting: no 2dp or hand-rolled formatting found
`formatMoneyAmount` is used in 43 sales files. The only `toFixed(2)` hit in scope
(`invoice-detail-panel.tsx:1173`) is a CSS progress-bar width percentage, not a money value —
not a finding. No `minimumFractionDigits: 2` / hand-rolled `Intl.NumberFormat` money formatting
found in sales. No evidence of KWD rendering at 2dp.

### L3 — RTL / logical CSS properties: clean
No `ml-*`, `mr-*`, `pl-*`, `pr-*` Tailwind physical-direction classes found anywhere in the
sales feature scope.

### L4 — Submit-button double-submit guard: spot-checked, correct
`credit-note-dialog.tsx:228-232` — `canSubmit` explicitly includes `!isPending`
(`isPending = submitting || createCreditNote.isPending || confirmCreditNote.isPending`), so
the submit button is genuinely disabled mid-flight; not a duplicate-POST risk. Other create
panels (invoice, order, delivery order) use a local `submitting` state disabling their buttons
(`invoice-create-panel.tsx:379,394,419,448,488`; `order-create-panel.tsx:118,131`;
`delivery-order-create-panel.tsx:293,312`). No missing-disable found among the panels checked.

---

## Not found / negative controls (checked, no defect)

- **`useWarehousesQuery` false-empty-on-403** — the briefing named 4 known call sites shared
  across sales/inventory; call sites found in sales are `invoice-create-panel.tsx`,
  `credit-note-dialog.tsx`, `invoice-detail-panel.tsx`, `invoice-edit-panel.tsx`,
  `delivery-order-detail-panel.tsx`, `delivery-order-create-panel.tsx`,
  `edit-credit-note-fields.tsx` (plus test files). Did not verify the fix status of the
  underlying hook itself (that lives outside `features/sales*`, in the shared inventory/
  warehouses hook) — SUSPECTED only, not independently confirmed against the hook
  implementation; flagging call sites for the reviewer who owns that hook rather than
  re-litigating it here.
- **Client-side write timeouts** — the shared `lib/api-client.ts` sets `WRITE_TIMEOUT_MS =
  120_000` (line 347) and no sales file passes a per-call `timeoutMs` override. This already
  reflects the fix from the purchase-module incident (previously 30s); not a sales-specific
  finding.
- **Printed documents calling `useTranslations`/`useLocale`** — checked all five sales print
  documents (`invoice-print-document.tsx`, `credit-note-print-document.tsx`,
  `quotation-print-document.tsx`, `delivery-order-print-document.tsx`,
  `sales-order-print-document.tsx`); each uses `useTranslations`/`useLocale` only for the
  *screen chrome* around the print button (toast copy, button labels), not for the document
  body itself, which is built from `TaxDocumentData` per the shared print-label-dictionaries
  pattern. Did not fully trace every label inside the renderer tree to rule out a stray
  UI-locale read inside a shared sub-component — SUSPECTED clean, not exhaustively verified.

---

## Summary of severities
- HIGH: 2 (H1 pagination flicker across 9 list panels; H2 PERM-004 across 6 create surfaces + 1 edit panel)
- MEDIUM: 2 (M1 em-dash placeholder drift ~20 sites; M2 one raw-warehouse-id fallback, narrow)
- LOW: 4 (all negative/positive controls, recorded for completeness)
