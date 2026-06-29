# Accounting — Financial Reports Testing Checklist

> Persona: **Accountant / finance manager.** They run the P&L, Balance Sheet, and Cash Flow to close the month, file VAT, and present to ownership. Every number must tie to the GL. A single line that does not reconcile is a showstopper.

- **Route(s):** `/reports/profit-and-loss`, `/reports/balance-sheet`, `/reports/cash-flow-statement`
- **Feature dir:** `apps/web/src/features/reports/`
- **API:** `GET /tenant/reports/profit-and-loss`, `GET /tenant/reports/balance-sheet`, `GET /tenant/reports/cash-flow-statement`
- **Depends on:** 02-journal-entries (source data), 03-general-ledger (must tie), 04-trial-balance (must tie), 05-opening-balances (opening equity), 10-fiscal-years-periods

---

## 0. Preconditions

- [ ] Dataset has at least one full accounting period with real postings: revenue transactions (POS / Sales invoices), COGS postings, operating expense JEs, and at least one cash/bank movement.
- [ ] Opening balances posted (so equity on the Balance Sheet has a non-zero retained earnings component).
- [ ] Fiscal year and period covering the test date range are configured.
- [ ] Logged in with a role that has reports-read permission; confirm a user without this permission sees an access-denied state, not an empty report.

---

## 1. Functional — actions and states

### 1.1 Profit and Loss (`/reports/profit-and-loss`)

- [ ] Page loads with default period (current month or last closed month); report generates automatically without requiring manual "Generate" click.
- [ ] Loading state: skeleton or spinner shown while data fetches; report area is not blank.
- [ ] Error state on API failure: user-friendly message with a retry option.
- [ ] Empty period (no transactions in the selected range): shows a clean "no data for this period" state, not zeros mixed with broken layout.
- [ ] **Period picker:** changing `periodStart` and `periodEnd` and regenerating updates the report; the displayed period header matches the selected dates.
- [ ] **Branch filter:** selecting a specific branch filters the report to that branch's revenue and expenses; "All branches" (no filter) shows the entity-wide total.
- [ ] **Legal entity filter:** changing the entity reloads the report for that entity's COA.
- [ ] **Collapsible sections:** Revenue, COGS, and Operating Expenses sections can be collapsed/expanded independently; totals remain visible when a section is collapsed.
- [ ] Section total labels match what is displayed in the total row.
- [ ] **CSV export:** clicking export downloads a CSV; column headers and amounts match what is on screen.
- [ ] **PDF export:** clicking PDF export produces a readable document with the same figures.
- [ ] (GAP note: if export buttons are absent, record under Known Gaps.)

### 1.2 Balance Sheet (`/reports/balance-sheet`)

- [ ] Page loads with a default `asOfDate` (today or end of last closed month); report generates.
- [ ] Loading / error / empty states handled as above.
- [ ] **asOfDate picker:** changing the date and regenerating updates all balances; the header date matches.
- [ ] Sections present: Current Assets, Non-Current Assets, Current Liabilities, Non-Current Liabilities, Equity (with retained earnings and current-period net income separately identified).
- [ ] `isBalanced` flag from the API: if the response returns `isBalanced: false`, the UI must display a visible warning — do not silently render an unbalanced sheet.
- [ ] Currency label matches the entity's functional currency.
- [ ] **Legal entity filter** changes the report to the selected entity.

### 1.3 Cash Flow Statement (`/reports/cash-flow-statement`)

- [ ] Page loads with a default period; report generates.
- [ ] Sections present: Operating Activities (net profit + adjustments + working capital changes), Investing Activities, Financing Activities, and — when present — Unclassified.
- [ ] Opening cash and closing cash displayed; net change in cash = closing − opening.
- [ ] If `hasUnclassified` is true, the Unclassified section is shown with a warning that some movements have not been classified — not silently hidden.
- [ ] `reconciles` flag: if false, a visible reconciliation-failure warning is shown. The accountant must not have to do the arithmetic themselves to discover a discrepancy.
- [ ] Period picker and legal entity filter behave as in P&L.

---

## 2. Accounting / domain invariants

### Profit and Loss

- [ ] **Formula check:** Revenue total − COGS total = Gross Profit; Gross Profit − Operating Expenses total = Net Profit. Verify all three computed values match their formula for the loaded dataset.
- [ ] **GL tie-out:** for each account line in the P&L, open the GL filtered to the same period and account — the GL net movement equals the P&L line amount (to 2dp as displayed, to 4dp in the raw API response).
- [ ] **Trial balance tie-out:** run the Trial Balance for the same period; the sum of all Revenue account credits minus debits equals the P&L Revenue total; the sum of all Expense account debits minus credits equals Operating Expenses total.
- [ ] **Zero-balance accounts excluded:** accounts with no activity in the period do not appear as zero-amount lines cluttering the report.
- [ ] **Branch filter is additive:** P&L for branch A + P&L for branch B (for the same period) = P&L for "all branches". Verify at least the Revenue and Net Profit rows for a dataset with two branches.
- [ ] **Sign convention:** Revenue amounts are positive (credit-normal displayed as positive); Expense amounts are positive (debit-normal displayed as positive); the sign labeling does not flip for contra-revenue (returns/allowances) — they reduce the Revenue total.

### Balance Sheet

- [ ] **Accounting equation:** `assets.total` = `totalLiabilitiesAndEquity`; equivalently Assets = Liabilities + Equity. If the API returns `isBalanced: false`, this equation fails — the UI must warn.
- [ ] **Retained earnings:** `equity.items` includes a retained earnings line equal to the cumulative net profit from prior periods (i.e., all closed periods' net profit, not the current period). `equity.currentPeriodNetIncome` = current period's P&L net profit. Together they sum to total equity (less any opening equity contributions).
- [ ] **Current vs non-current classification:** accounts marked as current in the COA appear under Current sections; non-current under Non-Current. Spot-check at least one from each.
- [ ] **AsOfDate semantics:** the Balance Sheet reflects all JEs with a posting date on or before `asOfDate`. A JE posted tomorrow should not appear today.
- [ ] **Opening balance equity:** the OBE/Suspense account balance (from opening balance posting) appears in Equity; if it is zero (perfectly balanced opening), it is not shown or shown as zero.

### Cash Flow Statement (indirect method)

- [ ] **Net profit ties to P&L:** `operating.netProfit` = P&L `netProfit` for the same period.
- [ ] **Net change in cash ties to Balance Sheet:** `netChangeInCash` = cash/bank account balances as of `periodEnd` (from BS) minus those same accounts as of `periodStart` (from BS on start date). Verify by running two Balance Sheets.
- [ ] **Closing cash ties:** `closingCash` = `openingCash` + `netChangeInCash`.
- [ ] **Operating formula:** `operating.total` = `operating.netProfit` + Σ `operating.adjustments` amounts + Σ `operating.workingCapital` amounts.
- [ ] **Grand total:** `operating.total` + `investing.total` + `financing.total` + `unclassified.total` = `netChangeInCash`.
- [ ] **Unclassified warning visible:** if any cash account movement cannot be classified into operating/investing/financing (because the source account has no CFS classification), `hasUnclassified` is true and a visible "unclassified items" callout directs the accountant to review and classify those accounts.

---

## 3. Edge cases and defensive UX

- [ ] **Period with no revenue but has expenses:** P&L shows negative net profit; the layout does not break.
- [ ] **AsOfDate before any transactions:** Balance Sheet returns all zeros (or opening equity only); not an error state.
- [ ] **Future asOfDate:** Balance Sheet as of a future date — either blocked with a clear message or correctly returns the current GL state (document which behavior is intended).
- [ ] **Very long period (e.g., full year):** P&L for 12 months loads within a reasonable time; no timeout or blank response.
- [ ] **Large number of accounts:** P&L with 200+ lines does not overflow the layout; collapsing sections reduces visible noise.
- [ ] **Single branch with no transactions:** branch filter returning an empty branch shows "no data", not a division-by-zero error.
- [ ] **Arabic locale:** all account names, section labels, and dates render in Arabic; numbers use Arabic-Indic digits or Western digits consistently (whichever the tenant locale dictates); currency symbol position follows locale conventions.
- [ ] **RTL layout:** columns reflow correctly; amounts remain right-aligned (or left-aligned in RTL — consistent with other screens).
- [ ] **`reconciles: false` on Cash Flow:** system shows a clear accounting error banner — the accountant is not left to discover the discrepancy by hand.

---

## 4. Cross-module / integration

- [ ] **P&L → GL drill-down (if implemented):** clicking an account line on the P&L opens the GL filtered to that account and period. If drill-down is not implemented, note it as a gap.
- [ ] **BS equity = P&L cumulative:** run P&L for each prior closed period; sum net profits; this sum equals retained earnings on the BS (excluding current period net income).
- [ ] **Cash Flow ↔ BS cash:** closing cash on CFS = cash/bank total on BS as of `periodEnd`.
- [ ] **Tax postings flow into P&L:** VAT-exclusive sales: the revenue line on P&L excludes VAT (VAT is on the liability account, not in revenue). VAT-inclusive sales: revenue is net of VAT. Verify whichever model the entity uses is consistent in the P&L.

---

## 5. Known gaps (from recon — verify or track)

- **No print / export on any financial report (MEDIUM):** the `buildCsv`/`exportTableToPdf` utilities exist in the feature lib, but if export buttons are not wired into all three report screens, accountants cannot produce a hardcopy for auditors. Verify for each report and log any that are missing.
- **No comparative period column (MEDIUM):** P&L and Cash Flow show only one period at a time; no side-by-side prior-year or prior-month comparison. Common accountant expectation.
- **No account-level drill-down from report lines (MEDIUM):** clicking a P&L line does not navigate to the GL for that account and period; the accountant must navigate manually.
- **Cash Flow classification depends on COA setup (LOW/MEDIUM):** accounts not tagged with a CFS classification produce `hasUnclassified: true`. There is no in-app guide for how to set CFS classifications on the COA. Newly seeded accounts may all land in Unclassified until manually tagged.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
