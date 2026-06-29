# Accounting — Bank Reconciliation Testing Checklist

> Persona: **accountant**. Bank reconciliation is the primary control that catches fraud, omissions, and timing differences between the bank and the books. A matched amount that is off by one cent, or a GL entry that can be matched twice, is a material control failure.

- **Route(s):** `/accounting/bank-reconciliation`, `/accounting/bank-reconciliation/new`, `/accounting/bank-reconciliation/[id]`
- **Feature dir:** `features/bank-reconciliation/`
- **API:** `GET /api/bank-reconciliation/statements`, `POST /api/bank-reconciliation/statements/import-csv`, `POST /api/bank-reconciliation/statements/import-file`, `GET /api/bank-reconciliation/statements/:id`, `GET /api/bank-reconciliation/statements/:id/summary`, `POST /api/bank-reconciliation/statements/:id/lines/:lid/match`, `POST /api/bank-reconciliation/statements/:id/lines/:lid/unmatch`, `POST /api/bank-reconciliation/statements/:id/lines/:lid/no-match`, `POST /api/bank-reconciliation/statements/:id/reconcile`
- **Depends on:** 01-chart-of-accounts (bank account must exist as a GL cash/bank account), 02-journal-entries (GL entries are what we match against), 10-fiscal-years-periods (period must be open to finalize)

## 0. Preconditions

- [ ] At least one bank (cash) GL account exists and has posted journal-entry lines.
- [ ] Logged in as a user with bank-reconciliation permission; a user without it cannot reach the route.
- [ ] A sample bank statement CSV is ready (at least 5 rows: 2 that match GL entries by amount/date, 1 that does not match, 1 duplicate of an existing row, 1 with a different date format).
- [ ] The relevant fiscal period is open.

---

## 1. Functional — statement list (`/accounting/bank-reconciliation`)

- [ ] **List statements** — shows statementDate, periodStart/End, openingBalance, closingBalance, currency, status badge (draft / in_progress / reconciled), importSource.
  - [ ] Loading skeleton shown while fetching; no frozen UI.
  - [ ] Empty state when no statements exist is clear with a prominent "Import Statement" action.
  - [ ] **Filter by bank account** — only statements for the selected bank account shown; clearing filter restores all.
  - [ ] **Filter by status** — filter `draft` / `in_progress` / `reconciled`; verify counts.
  - [ ] Pagination stable across pages.

---

## 2. Functional — import via CSV (column-mapping wizard)

- [ ] **Open import wizard** (`import-wizard`) — select bank account; provide statementDate, periodStart, periodEnd, openingBalance, closingBalance, currency; upload CSV file.
  - [ ] File picker accepts `.csv`; rejects `.pdf`, `.docx` with a clear error.
  - [ ] Loading state while parsing CSV client-side.

- [ ] **Column mapper** (`csv-column-mapper`) — shows parsed preview of CSV rows; accountant maps columns: date, description, amount (or separate debit/credit), optional reference; set dateFormat, skipHeaderRows; toggle saveMappingForFuture.
  - [ ] Preview refreshes when skipHeaderRows changes (header rows excluded from data preview).
  - [ ] Amount-only mode (single column) and debit/credit mode (two columns) both work.
  - [ ] dateFormat field: common formats (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MM-YYYY) all parsed correctly.
  - [ ] Required column mappings (date, description, at least one of amount or debit+credit) enforced; submit blocked if missing.
  - [ ] saveMappingForFuture = true: next import for the same bank account pre-fills the column mapping.

- [ ] **Submit import** — `POST /import-csv`; on success statement created in `draft` status; navigated to reconciliation workspace.
  - [ ] Loading state on submit; button disabled (no double-submit).
  - [ ] Error state (server rejects malformed CSV, wrong column index, empty file) shown without losing the mapping selections.

---

## 3. Functional — import via file (CSV/XLSX/XLS)

- [ ] **Import file endpoint** (`POST /import-file`) — upload `.csv`, `.xlsx`, `.xls`; all three accepted.
  - [ ] `.xlsx` and `.xls` parsed correctly; non-numeric characters in amount cells (e.g. comma-thousand separators, currency symbols) stripped before parsing.
  - [ ] File with BOM (byte-order mark, common in Excel CSV exports) parsed without encoding artifacts.
  - [ ] Arabic column headers do not break parsing.
  - [ ] Empty file (0 data rows after header) returns a user-friendly error, not a 500.
  - [ ] Extremely large file (1000+ rows) — loading indicator; no browser timeout.

---

## 4. Functional — reconciliation workspace (`/accounting/bank-reconciliation/[id]`)

- [ ] **Workspace loads** — shows statement header (bank account, period, opening/closing balance, currency, status), statement lines list, and reconciliation summary panel.
  - [ ] Loading state; 404 friendly message if statement ID invalid.
  - [ ] Each statement line shows: date, description, reference, amount, matchStatus badge (unmatched / matched / reconciled / no_match_needed).

- [ ] **Auto-match** — trigger auto-match; system matches statement lines to GL journal-entry lines by amount and approximate date (fuzzy).
  - [ ] Lines that match update to `matched` status with the matched JE line linked.
  - [ ] Lines that do not match remain `unmatched`.
  - [ ] Auto-match does NOT match lines with different amounts (even if description is similar).
  - [ ] Auto-match does NOT match a statement line to a GL entry already matched to another statement line (no double-match).
  - [ ] Progress/loading state during auto-match; error state if it fails.

- [ ] **Manual match** — click a statement line → select a GL journal-entry line from the picker → confirm match.
  - [ ] Statement line transitions to `matched`; the matched GL entry is no longer available to match to other lines.
  - [ ] Amount on the GL entry must equal the statement line amount (server enforces; UI should warn if different before confirming).
  - [ ] Matching a line that is already matched is blocked (action disabled or server rejects).

- [ ] **Unmatch** — click "Unmatch" on a matched line.
  - [ ] Statement line returns to `unmatched`.
  - [ ] The previously matched GL entry becomes available again for matching.
  - [ ] Unmatching a `reconciled` line (on a completed reconciliation) is blocked with a clear message.

- [ ] **Flag no-match** (`no-match-dialog`) — click "No Match Needed" on an unmatched line; dialog requires a reason; confirm.
  - [ ] Line transitions to `no_match_needed`; noMatchReason stored.
  - [ ] No reason → rejected client-side and server-side.
  - [ ] `no_match_needed` lines do not contribute to the unreconciled difference (they are acknowledged differences).

- [ ] **Reconciliation summary panel** — displays in real time as matches change:
  - `bookBalance` — GL cash account balance as of statement period end.
  - `depositsInTransit` — matched GL deposits not yet on bank statement.
  - `outstandingCheques` — matched GL payments not yet on bank statement.
  - `adjustedBookBalance` = bookBalance + depositsInTransit − outstandingCheques.
  - `bankClosingBalance` — closing balance from the statement.
  - `difference` = adjustedBankBalance − adjustedBookBalance (must be zero to finalize).
  - `canReconcile` = true only when difference = 0.

- [ ] **Complete reconciliation** (`reconcile-confirm-dialog`) — button enabled only when `canReconcile = true`; confirm.
  - [ ] On success: statement status → `reconciled`; reconciledAt and reconciledBy populated.
  - [ ] Statement is now read-only; match/unmatch actions disabled.
  - [ ] Completing an already-reconciled statement is idempotent (server returns success, not an error).

---

## 5. Accounting / domain invariants

- [ ] **Difference must reach zero to finalize.** `canReconcile = false` when `difference != 0`. Attempting to finalize with a non-zero difference is rejected by the server (not just the UI).
- [ ] **A GL entry line matches at most one statement line.** Verify: after matching GL entry X to statement line A, GL entry X does not appear in the picker for statement line B.
- [ ] **A statement line matches at most one GL entry.** After matching, the line shows one and only one `matchedJournalEntryLineId`. The server must reject a second match attempt on the same statement line.
- [ ] **Amounts agree to the cent.** When a manual match is confirmed, the statement line amount and the GL entry line amount must be equal. A mismatch is flagged before or at confirmation. No silent rounding.
- [ ] **Unmatch restores both sides.** After unmatch: statement line.matchStatus = `unmatched`, matchedJournalEntryLineId = null. The GL entry is available for matching again.
- [ ] **Auto-match does not mis-match on amount.** If the bank shows 1,000 and the closest GL entry is 1,000.01, they should NOT be auto-matched (amount tolerance should be zero or very tight, defined by spec).
- [ ] **`no_match_needed` is acknowledged, not matched.** These lines are excluded from the `difference` calculation because they are intentional acknowledgements, not reconciled pairs.
- [ ] **Finalize is idempotent.** Calling reconcile on an already-reconciled statement does not change reconciledAt/reconciledBy or create a second reconciliation record.
- [ ] **Reconciliation is scoped to the correct GL cash account.** Summary `bookBalance` reflects only the nominated `bankAccountId`'s GL movements for the period — not a sum of all cash accounts.

---

## 6. Edge cases & defensive UX

- [ ] **Duplicate CSV rows** — import a CSV where two rows are identical (same date, description, amount). System should either import both as separate lines (correct; they may be legitimate duplicate transactions) and flag them for manual review, or deduplicate with a warning. Silently dropping one is wrong.
- [ ] **CSV with wrong column mapping** — dateColumn points to the amount column; system shows a preview with garbled dates and allows the accountant to correct the mapping before submitting (not silently import bad data).
- [ ] **Empty file** (0 bytes or 0 data rows after header) — returns a clear "no data rows found" error, not a 500 or a blank statement.
- [ ] **Bad encoding** (Windows-1256 Arabic CSV) — either auto-detected or clearly flagged. Arabic descriptions must not appear as garbage characters in the workspace.
- [ ] **Opening balance mismatch** — entered openingBalance does not match the prior period's closingBalance; server should warn (or block) to prevent an undetected gap.
- [ ] **Negative amounts** — bank credits (deposits) and debits (withdrawals) may be signed differently across bank formats; verify the amount sign convention is handled consistently (a withdrawal reduces the book balance; verify it posts with correct sign).
- [ ] **Future statement date** — statementDate in the future accepted or rejected (per business rules); if accepted, period must be open.
- [ ] **Stale workspace** — another session matches a GL entry; current session tries to match the same entry → server rejects with a clear "already matched" message; workspace refreshes.
- [ ] **Rapid double-click "Complete Reconciliation"** — only one reconciliation event fires; statement not double-finalized.
- [ ] RTL (Arabic) layout: statement line descriptions in Arabic, date columns, amount columns with correct right-alignment and sign display.
- [ ] Very large statement (500+ lines) — pagination or virtual scroll in the workspace; no browser freeze.

---

## 7. Cross-module / integration

- [ ] GL entries available for matching are the journal-entry lines posted to the selected `bankAccountId`. Verify by cross-checking with the GL for that account over the statement period.
- [ ] After reconciliation, the GL cash account balance for the period should equal the statement's closing balance (difference = 0 is the proof).
- [ ] The reconciled statement's `reconciledBy` links to a real user record; display name shown in the UI.
- [ ] Close-management module's `reconcile_bank` task — completing a bank reconciliation for the period should allow that task to be marked complete in a close run for the same period.

---

## 8. Known gaps

- **No delete / void statement — MEDIUM.** Once a bank statement is imported, there is no UI action to delete it or void it (even in `draft` status). If an accountant imports the wrong file or for the wrong period, they have no recourse from the UI — they must contact support or use the API. Track until a delete/void action (with appropriate permission and audit trail) is added for draft statements.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Reconciliation difference is zero on the completed statement; GL balance equals statement closing balance.
- [ ] Findings logged in `_findings.md`.
