# Accounting — General Ledger Testing Checklist

> Persona: **Accountant.** The GL is the source of truth for every account's movement history. You are verifying that every posted entry appears here exactly once, in the right order, with a running balance that mathematically ties to the opening balance plus period movements.

- **Route(s):** `/accounting/general-ledger`
- **Feature dir:** `features/general-ledger/`
- **API:** `GET /tenant/reports/general-ledger`
- **Depends on:** Chart of Accounts (01) complete; Journal Entries (02) posted (including at least a few auto-posted entries from other modules).

## 0. Preconditions

- [ ] At least one account with a non-zero balance and multiple posted transactions exists.
- [ ] Know the expected opening balance for at least one account (from your opening-balance import or prior period close) so you can verify the running balance arithmetic manually.
- [ ] Logged in as a user with `accounting:read` or higher. Confirm read-only users can view (no edit controls shown).

## 1. Functional — actions & states

### Account selection

- [ ] **Account picker / selector** loads a searchable list of accounts for the selected legal entity.
  - [ ] Loading state: spinner or placeholder while the account list loads; not a blank dropdown.
  - [ ] Only active accounts appear; inactive accounts are absent.
  - [ ] Search by code and by name both work.
- [ ] Selecting an account does not immediately trigger a GL fetch — only after clicking "Generate" with a date range.
- [ ] Empty state: if no account is selected and the user clicks Generate, a clear validation message appears (button is disabled without an account and both dates).

### Date range

- [ ] From-date and to-date are both required before Generate is enabled.
- [ ] Date inputs accept ISO date format; an invalid date disables the Generate button.
- [ ] Selecting a range that spans multiple fiscal periods is valid.
- [ ] Selecting a future to-date is accepted (shows activity up to and including today if data exists; future dates show no lines).

### Generate

- [ ] Clicking "Generate" calls the API and renders the GL table.
  - [ ] Loading state: spinner or skeleton shown over the table area during the fetch.
  - [ ] Error state: API failure shows a human-readable message; the table does not partially render with stale data.
  - [ ] Empty state (no transactions in range): a clear "No transactions found for this account in the selected period" message appears — not a blank table.
  - [ ] Success state: table renders with opening balance row, one row per posted line, and closing balance row.
- [ ] Generating again (same or different range) replaces previous results cleanly.

### GL table columns

- [ ] Every row shows: date, journal entry number (linkable), description, debit, credit, and running balance.
- [ ] Opening balance row appears at the top, reflecting the cumulative balance of the account before the from-date.
- [ ] Running balance column increments correctly row-by-row: each row's balance = prior row's balance + debit - credit (for debit-normal accounts) or prior balance - debit + credit (for credit-normal accounts). Verify the sign convention is consistent.
- [ ] Closing balance row at the bottom equals the last running-balance value in the table.

### Pagination

- [ ] If the result set is large (many lines), pagination controls appear.
- [ ] Navigating to subsequent pages continues the running balance correctly from the last row of the prior page.
- [ ] Page count and current page are clearly indicated.

### Reset

- [ ] Clicking "Reset" clears the account selection, date range, and results.
- [ ] After reset, Generate is disabled until both date fields and an account are re-selected.

## 2. Accounting / domain invariants

> Cross-cutting invariants are in [`README.md`](README.md). The following are specific to the General Ledger.

- [ ] **Running balance math is correct:** manually verify for at least 5 consecutive rows: balance[n] = balance[n-1] + debit[n] - credit[n] (debit-normal) or balance[n-1] - debit[n] + credit[n] (credit-normal). No rounding leak between rows.
- [ ] **Opening balance + period movements = closing balance:** add up all debits and credits in the rendered table (excluding the opening/closing summary rows) and verify: closing balance = opening balance + net period movement.
- [ ] **GL ties to Trial Balance:** the closing balance for an account on the GL for a given date range must equal that account's balance on the Trial Balance (04) generated for the same to-date (with from-date = start of the entity's history or fiscal year). Test at least 2 accounts.
- [ ] **Every GL line links to a valid JE:** click 3–5 JE number links; each resolves to the correct journal entry detail page with matching date, amount, and account.
- [ ] **No duplicate lines:** each posted journal line appears exactly once. Verify by counting lines against the journal entry's line count for a known entry.
- [ ] **Date-range boundaries are inclusive:** a transaction posted on exactly the from-date appears in the GL; a transaction posted on exactly the to-date appears in the GL; a transaction one day outside either boundary does not.
- [ ] **Ordering is chronological and stable:** rows are ordered by posting date ascending, then by JE number ascending within the same date. Pagination does not reorder rows.
- [ ] **Tenant isolation:** GL results belong exclusively to the currently selected legal entity. No lines from other tenants or other legal entities appear.

## 3. Edge cases & defensive UX

- [ ] **Account with only an opening balance and no period transactions:** GL shows just the opening balance row and a closing balance row equal to the opening balance; no transaction rows; no crash.
- [ ] **Account with zero opening balance and transactions:** opening balance row shows 0.00; running balance starts from zero.
- [ ] **Reversed entry pair:** both the original and reversal lines appear in the GL if they fall within the date range; their net contribution to the running balance is zero.
- [ ] **Very large date range (multi-year):** GL generates without timeout or blank result; pagination handles the large row count.
- [ ] **From-date after to-date:** Generate button should be disabled or the API should return a validation error, not an empty result that looks like "no transactions."
- [ ] **Foreign-currency account:** GL displays amounts in the functional currency (base amounts), not the transaction currency. If the UI shows both, verify the functional-currency column is the one that feeds the running balance.
- [ ] **Switching legal entities while GL is displayed:** results should clear or re-fetch for the new entity automatically; no stale data from the prior entity lingers.
- [ ] **RTL locale:** date, description, and amount columns render legibly in Arabic locale; numbers remain LTR; column headers align correctly.

## 4. Cross-module / integration

- [ ] Generate the GL for the AR control account; the closing balance for a given date should equal the AR Aging total as of the same date (cross-reference with 08-ar-ap-aging.md when available).
- [ ] Generate the GL for the VAT output account; the closing balance should tie to the tax liability on the tax report for the same period.
- [ ] Pick a POS auto-posted entry visible in the GL; its JE link opens the auto-posted journal entry that links back to the POS transaction.

## 5. Known gaps

- **[MEDIUM] No export button:** there is no CSV or PDF export for the GL report. An accountant cannot download GL data for a period without manually copying from the screen. Track in `_findings.md` and Linear.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
