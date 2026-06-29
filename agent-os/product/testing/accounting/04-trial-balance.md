# Accounting — Trial Balance Testing Checklist

> Persona: **Accountant.** The Trial Balance is the first reconciliation checkpoint before producing financial statements. You are verifying that it balances, that every account's figure ties to the GL, and that the date parameters produce the correct cumulative vs period figures.

- **Route(s):** `/accounting/trial-balance`
- **Feature dir:** `features/trial-balance/`
- **API:** `GET /tenant/reports/trial-balance`
- **Depends on:** Chart of Accounts (01), Journal Entries (02), and General Ledger (03) all verified first.

## 0. Preconditions

- [ ] Posted journal entries exist covering at least two accounts on each side (debit-normal and credit-normal). Opening balances should be imported or seeded so the TB is non-trivial.
- [ ] Know the fiscal year / period boundaries so you can verify the date range semantics.
- [ ] Logged in as a user with `accounting:read` or higher.

## 1. Functional — actions & states

### Date range selection

- [ ] From-date and to-date fields are both present and required before Generate is enabled.
- [ ] Selecting a date range spanning the full fiscal year produces a TB that should balance to the same figures as the Balance Sheet accounts at year-end.
- [ ] Invalid dates (from > to) disable Generate or produce a validation error — not a silently empty or wrong TB.

### Include zero balances toggle

- [ ] Toggle is a Switch control, labelled "Include zero balances."
- [ ] When off (default): accounts with a net zero balance for the period are hidden from the table. Verify the total debits and total credits are unchanged by toggling (zero-balance accounts net to zero, so they don't affect totals).
- [ ] When on: all accounts with any posting activity (or with a configured account code) appear, including those that net to zero. The overall debit/credit totals remain identical to the off state.
- [ ] Toggling does not re-fire the API call — it is a client-side filter applied to already-fetched data. Verify by watching network requests.

### Search within results

- [ ] After generating, the search input appears (`data-testid="tb-search-input"`).
- [ ] Typing a partial account code or name filters the displayed rows. The footer totals should NOT change (search filters display only, not the aggregate).
- [ ] Clearing the search restores all rows.

### Generate

- [ ] Clicking Generate calls the API and renders the TB table.
  - [ ] Loading state: spinner or skeleton visible; old results do not linger while new ones load.
  - [ ] Error state: API failure shows a human-readable message.
  - [ ] Empty state (no activity in range): "No account balances found for the selected period" — not a broken table with empty totals.
  - [ ] Success state: grouped account rows with debit/credit columns and footer totals.
- [ ] Re-generating (same or different range) replaces results cleanly.

### TB table structure

- [ ] Accounts are grouped by type (Asset, Liability, Equity, Revenue, Expense) with visible group headers.
- [ ] Each row shows: account code, account name, debit balance, credit balance. An account should appear in only one column (debit OR credit) — not both.
- [ ] Footer row shows total debits and total credits.

### Reset

- [ ] Clicking Reset clears the date range, results, and search field. Generate is disabled again.

## 2. Accounting / domain invariants

> Cross-cutting invariants are in [`README.md`](README.md). The following are specific to the Trial Balance.

- [ ] **TB balances:** Σ(debit column) = Σ(credit column) in the footer, to 4 decimal places. Any imbalance is CRITICAL — it means a journal entry slipped through without proper double-entry enforcement.
- [ ] **TB ties to GL per account:** for at least 3 accounts, open the GL (03) for the same date range and verify: GL closing balance = TB balance for that account. If TB uses a cumulative (as-of) figure, the GL from-date should be the entity's inception date; if TB uses a period figure, the GL from-date should match.
- [ ] **Date-range semantics — verify which mode applies:** the TB appears to use a from/to range. Confirm with the API response whether the debit/credit figures represent (a) cumulative balances as of to-date (all history through to-date, ignoring from-date for balance-sheet accounts) or (b) period movements only. Document the confirmed behavior; verify it matches what accountants would expect. Flag as CRITICAL if the semantics are ambiguous or wrong (e.g., a balance-sheet account showing only period movements instead of a cumulative balance would be incorrect for a Balance Sheet).
- [ ] **Zero-balance toggle is display-only:** run the TB with toggle off; note the footer totals. Toggle on; totals must be identical. The API is not re-called.
- [ ] **Search is display-only:** run the TB; note the footer totals. Type a search that filters to 3 rows; footer totals must remain unchanged (they reflect all data, not just visible rows).
- [ ] **Accounts grouped and typed correctly:** Assets appear under Assets, Liabilities under Liabilities, etc. No account appears under the wrong type.
- [ ] **Contra accounts sign:** a contra-asset account (e.g., Accumulated Depreciation) carries a credit balance and appears in the credit column of the TB, not the debit column, even though it is under the Asset type grouping.
- [ ] **No header accounts in TB:** header (non-postable) accounts should not appear as independent rows in the TB (they have no direct postings). If they appear as group subtotals, that is acceptable and expected.
- [ ] **TB at fiscal year-end ties to financial reports:** generate the TB for the full fiscal year. The net position (Revenue minus Expense) must equal the net profit/loss on the P&L for the same period. Balance-sheet account closing balances must match the Balance Sheet as of the same date.
- [ ] **Tenant isolation:** TB results belong exclusively to the currently selected legal entity. Switching legal entity produces a separate, independent TB.

## 3. Edge cases & defensive UX

- [ ] **No posted entries in range:** generate a TB for a date range with no activity; empty state is clear, totals show 0.00 / 0.00 (still balanced).
- [ ] **From-date = to-date (single day):** TB generates for that one day's activity without error.
- [ ] **Very large date range (multi-year):** TB generates without timeout; all accounts are included.
- [ ] **Accounts with both debit and credit movements that net to a debit balance:** verify the net balance appears in the debit column, not split across both.
- [ ] **All-zero TB (new entity with no entries):** if opening balances are zero and no JEs exist, the TB shows 0.00 / 0.00 totals or an empty state — not a crash.
- [ ] **Generate with from-date after to-date:** blocked by UI (Generate disabled) or API returns validation error — not an inverted or incorrect result.
- [ ] **RTL locale:** account names in Arabic render correctly; numeric columns remain LTR; totals row aligns correctly in RTL layout.
- [ ] **Switching legal entity while TB is displayed:** results clear or re-fetch; no stale data from prior entity.

## 4. Cross-module / integration

- [ ] Run TB for a period that includes POS sales. The Revenue and Tax Liability accounts should show balances consistent with total sales and VAT collected.
- [ ] AR control account on TB = AR Aging total for the same as-of date (when AR Aging is available — see 08-ar-ap-aging.md).
- [ ] AP control account on TB = AP Aging total for the same as-of date.
- [ ] Inventory control account on TB = inventory valuation report total for the same date.

## 5. Known gaps

- **[MEDIUM] No export button:** there is no CSV or PDF export for the Trial Balance. Accountants routinely need to export the TB to Excel for working-paper preparation. Track in `_findings.md` and Linear.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
