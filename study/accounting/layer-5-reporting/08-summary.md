# 08 — Summary and the Accountant's Close Checklist for Reports

## What Layer 5 is and is not

Layer 5 adds nothing to the ledger. It reads the ledger. Its job is to read it correctly,
present it clearly, and prove it is right.

Every chapter in this layer has said some variation of the same thing: derive the report
from the GL; prove the report ties to the trial balance; do not trust a report that cannot
be traced to a posted journal entry. That principle is worth restating clearly at the
end, because it is the one that gets violated most often in practice — not maliciously,
but through performance shortcuts, caching, denormalization, and the natural pressure to
"just make the report work."

## What each chapter established

**Chapter 00 — Overview**
Three reports: the income statement (flows over a period), the balance sheet (balances at
a point in time), the cash flow statement (cash movements over a period). Every number in
every report must trace to the trial balance. The TB is the source of truth; reports are
views of it.

**Chapter 01 — Income Statement**
Revenue minus COGS equals gross profit. Gross profit minus operating expenses equals
operating income. Add/subtract other income and expense to reach net income. The P&L is
period-scoped: flows, not balances. Sign conventions must be applied consistently. A P&L
that does not tie to the TB income/expense net is broken.

**Chapter 02 — Balance Sheet**
Assets = Liabilities + Equity. Always. To the cent. The accounting equation is not a
recommendation. Current-year net income must appear in equity and must match the P&L.
Balance-sheet accounts are permanent: they carry their balances across fiscal years and
are never zeroed.

**Chapter 03 — Cash Flow Statement**
Cash is not profit. The indirect method starts with net income and adjusts for non-cash
items and working-capital movements to arrive at operating cash flow. The three sections
(operating, investing, financing) must sum to the actual change in cash, which must match
the closing bank/cash balance on the balance sheet. If they do not, the cash flow
statement has an error.

**Chapter 04 — Multi-Currency Reporting**
Reports present in the functional currency. Foreign-currency monetary balances must be
retranslated to the period-end closing rate (IAS 21 revaluation) before the balance sheet
is run. Non-monetary items (inventory, PP&E) stay at historical rates. The revaluation
difference goes to the P&L as FX gain or loss. Sub-reports in foreign currency must use
the same period-end rate as the GL revaluation.

**Chapter 05 — AR/AP Aging**
Aging is a sub-ledger report. It must be derived from GL lines, not from a denormalized
invoices table. The sum of all customer (or supplier) balances in the aging must equal
the control account balance on the TB. Multi-currency aging uses the same period-end
rates as the GL. The aging drives provisioning decisions and payment runs.

**Chapter 06 — Comparatives and Periods**
Flow reports filter to a date range; balance reports filter to an as-at date. YTD is
different from a single period. Off-by-one errors on period boundaries (using `<` instead
of `<=` for the end date) silently exclude the last day of the period. Comparatives run
the same query against a different set of dates. The year-end close entry must be excluded
from P&L queries but included in balance-sheet queries.

**Chapter 07 — Report Integrity and Pitfalls**
The danger list: reports derived from non-GL sources, sign/classification errors,
mis-rollup and double-counting, reversed-entry filter errors, period boundary off-by-one,
currency mixing, draft-entry inclusion, missing accounts, and year-end close entry
polluting the P&L. Each has a specific detection method and fix. The TB tie-out is the
universal detection tool.

## The accountant's close checklist for reports

This is the sequence a real accountant runs at the end of a period before publishing any
financial statement. Think of it as the Layer 5 equivalent of the Layer 4 close checklist.

### Pre-conditions (must pass before running any report)

- [ ] **TB balances.** Run the trial balance. Confirm SUM(debits) = SUM(credits). If it
  does not balance, stop. Do not run any reports. Fix the ledger first.
- [ ] **FX revaluation run.** Confirm that period-end FX revaluation has been posted for
  all open foreign-currency monetary balances. Check the revaluation log.
- [ ] **Period locked (or soft-closed).** Confirm no new entries can be backdated into the
  period. A locked period cannot have entries added; a soft-closed period should have
  no entries added after the close run.
- [ ] **Sub-ledger tie-outs pass.** AR control account balance = sum of AR sub-ledger
  balances. AP control account balance = sum of AP sub-ledger balances. Inventory
  control account balance = sum of inventory valuation records.
- [ ] **Year-end close run (if end of fiscal year).** Confirm the year-end close entry
  exists, balances, and has moved net income to retained earnings.

### Income statement checks

- [ ] **P&L ties to TB.** Net income on the P&L = (sum of credit balances of income
  accounts) − (sum of debit balances of expense accounts) on the TB for the same period.
  Any discrepancy is a reporting defect.
- [ ] **No income/expense accounts missing.** Verify that every account with a balance in
  the income or expense categories on the TB appears on the P&L. A new account added
  during the period that is missing from the P&L query will cause a discrepancy.
- [ ] **COGS reconciles to inventory.** The COGS posted in the period should reconcile to
  the decrease in inventory (opening inventory + purchases − closing inventory = COGS).
  Differences may indicate inventory postings not yet made or valuation inconsistencies.
- [ ] **Sign conventions applied correctly.** Sales returns deducted from revenue, not
  added to expenses. Contra-accounts shown as deductions from their primary account.

### Balance sheet checks

- [ ] **Balance sheet balances.** Assets = Liabilities + Equity to the cent. If not, find
  the account that is missing or double-counted.
- [ ] **Current-year net income matches P&L.** The current-year net income line in equity
  equals the net income from the P&L for the full period from fiscal year start to the
  report date.
- [ ] **Retained earnings correct.** Prior retained earnings + current year net income
  (before year-end close) = closing retained earnings. After year-end close: prior
  retained earnings + current year net income = new retained earnings; current year net
  income line = zero.
- [ ] **FX monetary balances at closing rate.** Spot-check one or two foreign-currency
  receivables or payables. Confirm the SAR value on the balance sheet equals the foreign
  amount × the period-end closing rate used in the revaluation.
- [ ] **No income/expense accounts on balance sheet.** Run a query to confirm that no
  account with type Income or Expense has a non-zero balance after the year-end close.

### Cash flow checks

- [ ] **Cash flow closes.** Opening cash + net cash from all three sections = closing cash
  balance. Closing cash balance = sum of bank and petty cash accounts on the balance sheet.
  If it does not close, the cash flow statement has an error.
- [ ] **Depreciation is added back.** The non-cash depreciation charge on the P&L is
  added back in the operating section. Confirm the add-back equals the depreciation
  expense on the P&L.
- [ ] **Asset purchases in investing, not operating.** Any cash paid for fixed assets
  appears in investing activities, not in operating activities.
- [ ] **Working-capital movements reconcile.** The change in each working-capital account
  in the cash flow statement equals the difference between opening and closing balances of
  that account on the balance sheet.

### AR/AP aging checks

- [ ] **AR aging ties to AR control account.** Sum all customer balances in the aging as
  at the period-end date. It must equal the AR control account balance on the TB.
- [ ] **AP aging ties to AP control account.** Same for AP.
- [ ] **No entries without party reference.** If any GL line on the AR or AP control
  account lacks a customer or supplier reference, it cannot appear in the aging. Investigate
  and assign it to the correct party.
- [ ] **FX rates consistent.** If the aging includes foreign-currency customers or suppliers,
  the functional-currency equivalent uses the same period-end rate as the GL revaluation.

### Publication gate

- [ ] All pre-conditions pass.
- [ ] All income statement checks pass.
- [ ] All balance sheet checks pass.
- [ ] Cash flow closes.
- [ ] Aging ties to control accounts.
- [ ] All three primary statements have been generated from the same period parameters
  (same start date, end date, fiscal year, tenant context).
- [ ] Reports are labeled with the correct period, currency, and date of generation.

Only when all boxes are ticked should the financial statements be published to management,
investors, or regulators.

## The principle that unifies all of Layer 5

> Financial statements are three reorganizations of one ledger. The ledger is ground
> truth. Every report must prove it agrees with the ledger before it is published. No
> exception for "the report has always looked right before." No exception for "we're
> in a hurry." A report that cannot be tied to the trial balance is not a financial
> statement — it is a set of numbers that resembles one.

This is Layer 5. Chapter 09 — how Zerupt implements these principles in its specific
codebase — will be written separately once the implementation settles.
