# Purchase — AP Aging / Overview Dashboard Testing Checklist

> Persona: **Purchasing clerk / shop owner.** This is the screen you glance at every morning to know how much you owe and to whom, and which bills are overdue before the supplier calls. You will notice immediately if the total does not match what the bills say, or if a payment you just made this morning doesn't show up.

- **Route(s):** `/purchase` (overview dashboard)
- **Feature dir:** `apps/web/src/features/purchase/components/overview/`
- **API:** `GET tenant/purchase/overview`, `GET tenant/purchase/overview/ap-aging[?supplierId]`
- **Depends on:** 01-suppliers, 03-direct-purchase, 05-purchase-invoices, 07-supplier-payments, 08-purchase-returns (everything feeding AP must be correct first)

---

## 0. Preconditions

- [ ] Dataset has: at least one open PO, one pending (draft) GRN, several confirmed bills with varying due dates (some overdue, some current), at least one draft bill, and at least one payment recorded this month.
- [ ] Know the expected total AP (Σ open bill balances across both suppliers) and each supplier's individual balance before starting.
- [ ] Logged in with purchase-read permission for the overview; separately confirm a user from a different tenant cannot see this tenant's data.

---

## 1. Functional — actions & states

### 1.1 KPI strip (`purchase-overview-kpi-strip.tsx`)
- [ ] **Open orders count** shows confirmed + partially-received POs only (not draft, cancelled, or fully-received/closed POs).
- [ ] **Pending receipts count** shows draft GRNs only (received but not yet confirmed).
- [ ] **Outstanding AP** = sum of functional-currency balance on all confirmed bills with balance > 0; matches manual sum of open bills.
- [ ] **Overdue AP** = sum of functional-currency balance on confirmed bills with balance > 0 AND due date before today; is a subset of (≤) Outstanding AP.
- [ ] **Payments this month** = sum of posted payments with payment date in the current calendar month, converted to functional currency; resets correctly on the 1st of a new month.
- [ ] **Draft bills count** shows bills still in draft status (not yet confirmed / posted to AP).
- [ ] Loading state (skeleton) shown while KPIs fetch; no layout shift/flash once loaded.
- [ ] Error state on KPI fetch failure: user-friendly message with retry, not a blank strip.

### 1.2 AP Aging table (`ap-aging-table.tsx`)
- [ ] Loads bucketed data from `GET tenant/purchase/overview/ap-aging`; buckets are current / 1-30 / 31-60 / 61-90 / 90+.
- [ ] Loading state: skeleton rows shown, not a blank area.
- [ ] Error state: friendly message + retry button; no raw error text.
- [ ] Empty state (no outstanding AP): clear "no outstanding payables" message, not a broken table with only a totals row.
- [ ] **Per-supplier drill-down:** passing `supplierId` renders a single-supplier view (no supplier column, bucket columns only) — verify from a supplier detail page link.
- [ ] Amounts are formatted via `displayMoney` with tenant functional currency and correct precision (KWD 3dp for Asala) — never hardcoded 2dp.

### 1.3 Recent documents table
- [ ] Shows the most recent orders and bills combined, sorted by date descending, capped at the expected limit.
- [ ] Each row links to the correct document (`/purchase/orders/[id]` or `/purchase/invoices/[id]`) and resolves.
- [ ] Opening-balance carry-forward bills are excluded from "recent bills" (they are not current-period purchases).

---

## 2. Domain invariants

### Reconcile invariant (CRITICAL)
- [ ] **Total AP aging (sum of all bucket totals across all suppliers) = Outstanding AP KPI = Σ open bill balances = supplier 2111 GL balance sum.** Cross-check all four numbers land on the same figure for the same `asOf` date.
- [ ] **Per-supplier aging row total = that supplier's 2111 balance** — spot-check both Asala suppliers individually.
- [ ] **Bucket assignment is correct:** an invoice with due date exactly today is Current; one day overdue is 1-30; 30 days overdue is 1-30; 31 days overdue is 31-60 (boundary-consistent with the accounting AR/AP aging convention).
- [ ] **A fully paid bill does not appear** in the aging table or contribute to Outstanding AP.
- [ ] **A partially paid bill appears with the remaining balance only**, not the original bill total.
- [ ] **A returned (post-return) bill's aging reflects the reduced balance** immediately after the return confirms.

### Freshness
- [ ] **Recording a payment updates Outstanding AP, Overdue AP, and the aging table on next load/refetch** — no stale cache showing the pre-payment figure after a page revisit.
- [ ] **Confirming a new bill increases Outstanding AP and adds a row/bucket entry** on next load.
- [ ] **Voiding a return or reversing a payment restores the prior AP figures** correctly.

### Tenant isolation
- [ ] All KPIs, aging rows, and recent documents belong to the current tenant only; switching tenants (if testable) shows entirely different figures, never a mix.

---

## 3. Edge cases & defensive UX

- [ ] **Zero outstanding AP** (all bills paid): KPI shows 0, aging table shows the empty state, not an error.
- [ ] **A supplier with only overdue bills** appears correctly in the 90+ (or relevant) bucket, not miscategorized as Current.
- [ ] **Double-click retry** on an errored KPI/aging fetch does not fire duplicate requests or duplicate the totals row.
- [ ] **CSV export (if present) matches the on-screen aging table** exactly, including the `asOf` date in the export so it is self-describing.
- [ ] **RTL (Arabic):** column headers, supplier names, and amounts render correctly; amount columns stay right-aligned with numbers in the expected direction.
- [ ] **Currency label is visible** on the KPI strip / aging table header so the clerk knows the figures are in KWD, not assumed.

---

## 4. Cross-module / integration

- [ ] **AP aging total ↔ Accounting AR/AP aging report:** if the tenant also uses `/reports/ap-aging` (Accounting module), the purchase-module figure for the same `asOf` matches the accounting-module figure (both derive from the same party-tagged 2111 ledger).
- [ ] **AP aging total ↔ Balance Sheet AP line:** running the Balance Sheet as of the same date shows the same AP figure in Current Liabilities.
- [ ] **Recent documents link ↔ source record:** clicking a recent order/bill navigates to the correct detail page.
- [ ] **Per-supplier drill-down ↔ Supplier detail page:** the aging figures shown embedded on a supplier's own detail page match the standalone `/purchase` overview figures for that supplier.

---

## 5. Known gaps (from recon — verify or track)

- **No invoice-level drill-down from an aging bucket cell** — clicking a bucket does not open the underlying bills contributing to it; the clerk must cross-reference `/purchase/invoices`. Consistent with the accounting-module AR/AP aging gap. **MEDIUM**.
- **KPI strip has no explicit currency label confirmed in code** — verify at least one visible "KWD" tag near the numbers; if absent, log as a defensive-UX gap. **LOW**.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
