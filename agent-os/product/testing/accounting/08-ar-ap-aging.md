# Accounting — AR and AP Aging Testing Checklist

> Persona: **Accountant / credit controller.** They use the aging report to chase overdue receivables and manage payables before they go past due. They will immediately notice if a customer's total does not match the invoice ledger, or if a payment is not reducing the balance.

- **Route(s):** `/reports/ar-aging`, `/reports/ap-aging`
- **Feature dir:** `apps/web/src/features/reports/`
- **API:** `GET /tenant/reports/ar-aging`, `GET /tenant/reports/ap-aging`
- **Depends on:** 02-journal-entries, 03-general-ledger (AR/AP control account balances), Sales invoices/credit notes (Sales module), Purchase invoices/bills (Purchase module)

---

## 0. Preconditions

- [ ] Dataset has at least: one open (unpaid) sales invoice, one partially paid invoice, one fully paid invoice, one overdue invoice (due date in the past), and one credit note applied to a customer.
- [ ] Equivalently on the AP side: open purchase bills, a partial payment, a fully paid bill, and an overdue bill.
- [ ] AR and AP control accounts are set up in the COA and have postings flowing from the Sales and Purchase modules via account mappings.
- [ ] Logged in with reports-read permission.

---

## 1. Functional — actions and states

### 1.1 AR Aging (`/reports/ar-aging`)

- [ ] Page loads with default `asOf` = today; report generates automatically.
- [ ] Loading state: spinner or skeleton shown; page is not blank during fetch.
- [ ] Error state on API failure: user-friendly message with retry; no raw error stack exposed.
- [ ] Empty state (no AR outstanding as of `asOf`): shows "no outstanding receivables" clearly — not a broken table with only a totals row.
- [ ] **asOf date input:** changing the date and clicking "Generate" re-runs the query with the new date. Editing the date field alone (without clicking Generate) does not fire a new request (confirmed in code: explicit Generate pattern).
- [ ] **Branch filter:** selecting a branch narrows the report to invoices originating from that branch. "All branches" (no filter) shows entity-wide AR.
- [ ] Customer rows display: customer code, customer name, and one amount per bucket (Current, 1-30, 31-60, 61-90, 90+), plus a row total.
- [ ] Totals row at the bottom shows column sums matching Σ of all customer rows for each bucket.
- [ ] Column sort: clicking a column header sorts the table by that column (ascending/descending).
- [ ] **CSV export:** exported file contains the same rows and totals as the on-screen table.
- [ ] **PDF export:** PDF is legible with proper column alignment.

### 1.2 AP Aging (`/reports/ap-aging`)

- [ ] Same functional checks as AR Aging above, substituting "supplier" for "customer" and purchase bills for sales invoices.
- [ ] Supplier code, supplier name, and bucket columns present.
- [ ] "Generate" pattern confirmed: branch filter change alone does not silently re-run.

---

## 2. Accounting / domain invariants

### Subledger-to-GL tie (CRITICAL)

- [ ] **AR aging total = AR control account balance:** run AR aging as of today; the `totals.total` from the report equals the balance of the AR control account on the General Ledger as of today. Verify by opening `/accounting/general-ledger` and filtering by the AR control account.
- [ ] **AP aging total = AP control account balance:** same check for the AP control account.
- [ ] If there is a discrepancy, it indicates either a posting that bypassed the subledger or an unapplied payment — log it as CRITICAL.

### Bucket assignment (HIGH)

- [ ] **Each invoice falls in exactly one bucket** based on `due_date` vs `asOf`:
  - Current: `due_date >= asOf` (not yet due)
  - 1-30: `asOf - 30 days <= due_date < asOf`
  - 31-60: `asOf - 60 days <= due_date < asOf - 30 days`
  - 61-90: `asOf - 90 days <= due_date < asOf - 60 days`
  - 90+: `due_date < asOf - 90 days`
- [ ] Spot-check: take an invoice with a known due date; set `asOf` to various dates and verify the invoice moves between buckets as expected. At the exact boundary (e.g., due date = asOf): it is Current. One day past due: 1-30. 30 days past due: 1-30. 31 days past due: 31-60.
- [ ] An invoice does not appear in two buckets simultaneously — its remaining balance is in exactly one bucket.

### Payments and credit notes reduce the balance

- [ ] A fully paid invoice does not appear on the aging report (balance = 0, excluded from results).
- [ ] A partially paid invoice appears with the remaining balance only — the full invoice amount is not shown.
- [ ] A credit note applied to a customer reduces that customer's outstanding balance in the relevant bucket.
- [ ] The payment's application date (not the invoice date) determines the remaining balance; the due date of the invoice determines the bucket.

### Overpayments and unapplied credits (HIGH)

- [ ] A customer who has overpaid (credit balance) appears with a negative total in the aging report — not hidden or zeroed out.
- [ ] An unapplied credit note (not yet matched to an invoice) shows as a negative amount in the Current bucket for that customer.
- [ ] The totals row correctly includes negative amounts from credit balances; the grand total can be less than the sum of positive buckets.

### asOf date sensitivity

- [ ] Running the report for `asOf = yesterday` vs `asOf = today` produces different results if a payment was received today — the yesterday report shows the invoice as outstanding; today shows it as paid/reduced.
- [ ] Running the report for a date before any invoices were issued returns an empty (or zero-total) report — not an error.
- [ ] Running for a future date is either blocked with a clear message, or returns the current state with a warning that future dates are not supported — whichever is the intended behavior, it is consistent.

### Per-party drill-down

- [ ] The per-customer (or per-supplier) row total = sum of that row's bucket amounts: `current + days1To30 + days31To60 + days61To90 + days90Plus = total`. Verify for at least three rows.
- [ ] The column totals row = sum of all customer totals for that bucket. Cross-check: sum of `total` column = sum of all bucket totals = `totals.total`.

### Foreign-currency receivables / payables

- [ ] If the entity has invoices in a foreign currency, the aging report shows all amounts converted to the entity's functional (base) currency — not the original transaction currency.
- [ ] The exchange rate used for conversion is the rate at the time of the transaction (transaction-date rate), not today's spot rate.
- [ ] No foreign-currency amount is displayed in its original currency alongside the base amount unless the report explicitly labels it as such — mixing currencies without labels confuses an accountant.

---

## 3. Edge cases and defensive UX

- [ ] **Customer with only credit notes (no invoices):** the customer appears with a negative total — not hidden.
- [ ] **Very large number of customers (100+):** the report renders completely; pagination or virtual scrolling handles the list without browser freeze.
- [ ] **Customer name in Arabic / mixed script:** isolateText wrapping applied; names do not bleed into neighboring cells in RTL layout.
- [ ] **Identical customer codes:** if two customers share a code (data quality issue), they appear as separate rows — not merged.
- [ ] **asOf date typed as an invalid date:** the input is rejected with a validation message; the old report is not cleared.
- [ ] **Branch filter + asOf date change:** changing both filters before clicking Generate does not fire two separate queries; only one query fires on Generate.
- [ ] **Double-click Generate:** only one query fires; the totals row is not duplicated.
- [ ] **Zero-balance customers:** customers with total = 0 (fully paid) are excluded from the report; they do not appear as zero rows.
- [ ] **Arabic locale / RTL:** column headers, customer names, amounts, and date fields all render correctly in RTL. Amount columns remain right-aligned with numbers in the expected format.
- [ ] **Currency code shown:** the report header or column headers identify the currency (functional currency of the entity) — an accountant must know which currency the amounts are in.

---

## 4. Cross-module / integration

- [ ] **AR aging ↔ Sales invoices:** open a specific customer's outstanding invoices in the Sales module; sum their remaining balances; confirm the sum equals that customer's `total` in the AR aging report for the same `asOf` date.
- [ ] **AP aging ↔ Purchase bills:** same verification for a specific supplier's outstanding purchase bills vs their AP aging row total.
- [ ] **Payment recorded in Sales / Purchase:** record a payment against an invoice; re-run the aging report; confirm the customer's/supplier's balance decreases by the payment amount.
- [ ] **AR aging total ↔ Balance Sheet AR line:** run Balance Sheet as of the same `asOf` date; the AR line in Current Assets equals the AR aging `totals.total`. If not, there is a GL-subledger mismatch — log CRITICAL.
- [ ] **AP aging total ↔ Balance Sheet AP line:** same check for AP (Current Liabilities section).
- [ ] **Credit note applied ↔ aging:** apply a credit note in the Sales module against an invoice; the AR aging for that customer reduces accordingly.

---

## 5. Known gaps (from recon — verify or track)

- **No invoice-level drill-down from aging row (MEDIUM):** clicking a customer row or bucket cell does not open a list of the underlying invoices contributing to that bucket. An accountant must manually cross-reference the Sales module. Common expectation for aging reports.
- **No per-currency breakdown in foreign-currency entities (MEDIUM):** in an entity with invoices in multiple currencies, all amounts are collapsed to functional currency; there is no way to see "USD 5,000 + EUR 2,000 = AED 25,000" in one view.
- **No export on all filter combinations (LOW):** CSV/PDF export may not preserve the active branch filter label in the export header, making the export ambiguous if printed without context.
- **No "as of" label on export (LOW):** confirm the exported CSV/PDF includes the `asOf` date so the document is self-describing for auditors.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
