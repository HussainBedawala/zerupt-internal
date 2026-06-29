# Accounting — Fiscal Years & Periods Testing Checklist

> Persona: **accountant**. Fiscal periods are the calendar that controls what can be posted and when. A closed period that can be re-opened without an audit trail, or a gap in period coverage, is a compliance failure.

- **Route(s):** `/accounting/fiscal-years`, `/settings/fiscal`
- **Feature dir:** `features/fiscal/`
- **API:** `GET/POST /api/fiscal-years`, `GET /api/fiscal-years/:id`, `PATCH /api/fiscal-years/:id/periods/:pid/status`, `POST /api/fiscal-years/:id/periods/batch-lock`, `POST /api/fiscal-years/:id/periods/batch-unlock`, `GET/POST /api/fiscal-years/:id/pre-closing-checklist`, `GET/POST /api/fiscal-years/:id/closing-entry-preview`, `POST /api/fiscal-years/:id/close`, `POST /api/fiscal-years/:id/reopen`, `GET/PATCH /api/fiscal/settings`
- **Depends on:** 01-chart-of-accounts (retained earnings account must be mapped), 02-journal-entries (year-end closing entry), 06-account-mappings (retained earnings mapping for close)

## 0. Preconditions

- [ ] Logged in as a user with fiscal-management permission; a user without it cannot reach these routes.
- [ ] At least one legal entity exists.
- [ ] COA has at least one income account, one expense account, and a retained earnings equity account.
- [ ] Account mappings include "Retained Earnings" → a valid equity account (required for year-end close).
- [ ] Know the current fiscal settings (start month, close policy) before making changes.

---

## 1. Functional — fiscal settings (`/settings/fiscal`)

- [ ] **View fiscal settings card** — displays fiscalYearStartMonth, periodClosePolicy (Open/SoftLocked/HardLocked), allowSoftLockOverride, softLockOverrideRoles.
  - [ ] Loading state shown; error state if API down.

- [ ] **Update fiscal settings** — change start month (e.g. 1 → 4 for April), close policy, override flag; save.
  - [ ] Success feedback; reload confirms persisted values.
  - [ ] Changing start month does NOT alter existing fiscal years (only affects future year creation).
  - [ ] Invalid month (0, 13) rejected client-side and server-side.
  - [ ] softLockOverrideRoles accepts only valid role identifiers (server validates).

---

## 2. Functional — fiscal years list

- [ ] **List fiscal years** — table shows label, start date, end date, isClosed, closedAt.
  - [ ] Empty state when no fiscal years exist is clear and offers a "Create" action.
  - [ ] Pagination stable across pages.

- [ ] **Create fiscal year** — enter calendarYear (e.g. 2025), optional initialPeriodStatus; submit.
  - [ ] System auto-generates 12 periods aligned to fiscalYearStartMonth.
  - [ ] Success: year appears in list; clicking it opens the timeline with 12 period rows.
  - [ ] Creating a duplicate year (same calendarYear + legalEntityId) rejected with a clear error.
  - [ ] Loading state on submit button; no double-submit.

---

## 3. Functional — period timeline

- [ ] **Period timeline view** — 12 period rows shown in chronological order; each displays periodNumber, label (e.g. "Jan 2025"), startDate, endDate, status badge.
  - [ ] Status badge styles: Open (green), SoftLocked (amber), HardLocked (red). Verify `period-status-styles.ts` logic.

- [ ] **Lock a single period** — click lock on one period; choose SoftLocked or HardLocked; confirm.
  - [ ] Status badge updates immediately (optimistic update via `optimistic-period-update.ts`).
  - [ ] Confirm on server via reload: period status persisted.
  - [ ] Locking does not affect adjacent periods.

- [ ] **Unlock a single period** — provide a reason (required field); confirm.
  - [ ] Unlock without a reason is rejected (client-side and server-side).
  - [ ] After unlock: period status returns to Open; posting becomes available again (verify by creating a JE dated within that period).

- [ ] **Batch lock all periods** — batch-lock-dialog; choose SoftLocked or HardLocked; confirm.
  - [ ] All 12 periods transition to the selected status.
  - [ ] Progress/loading state during batch operation.
  - [ ] Error handling if one period fails mid-batch (partial success communicated, not silently ignored).

- [ ] **Batch unlock all periods** — reason required; confirm.
  - [ ] All periods return to Open.

---

## 4. Functional — year-end close

- [ ] **Pre-closing checklist** — trigger from year-actions-menu; checklist loads; each item shows key, label, status (passed/failed/skipped), detail message.
  - [ ] Failed items are highlighted clearly; their detail explains what must be fixed.
  - [ ] "Close Year" action is blocked (button disabled or server rejects) until all required checks pass.
  - [ ] Skipped checks are shown with reason; an accountant understands what was bypassed.

- [ ] **Closing entry preview** — opens before committing close; shows every line (accountCode, accountName, debit, credit); summary shows totalDebit, totalCredit, netProfitOrLoss.
  - [ ] totalDebit = totalCredit (balanced closing entry).
  - [ ] Lines include: debits to all income accounts zeroing them out, credits to all expense accounts zeroing them out (or vice versa for losses), net to retained earnings.
  - [ ] Figures match the P&L net profit for the fiscal year (cross-check against `/reports/profit-loss`).

- [ ] **Close fiscal year** — confirm dialog; provide optional reason; submit.
  - [ ] isClosed = true on the year record; closedAt and closedBy populated.
  - [ ] Closing JE posted to the GL and linked via closingEntryId on the fiscal year record.
  - [ ] All periods automatically transition to HardLocked (or the policy-defined final status).
  - [ ] After close, no new JEs can be posted into any period of this year (server rejects; test by attempting a manual JE dated within the year).

- [ ] **Reopen fiscal year** — reason required; confirm.
  - [ ] isClosed reverts to false; closingEntryId remains (closing entry is reversed, not deleted, if applicable).
  - [ ] Audit trail records who reopened and when.
  - [ ] After reopen, posting into the year is possible again (within period lock constraints).

---

## 5. Accounting / domain invariants

- [ ] **Periods are contiguous and non-overlapping.** For every fiscal year: period[n].endDate + 1 day = period[n+1].startDate. No gaps; no overlaps. Verify all 12 periods cover the full fiscal year exactly.
- [ ] **Periods cover the full year.** period[1].startDate = fiscalYear.startDate; period[12].endDate = fiscalYear.endDate.
- [ ] **Locking blocks posting — client + server.** Attempt to create a manual JE dated inside a HardLocked period: the client should warn and the server must reject with a period-locked error. Verify both.
- [ ] **SoftLocked behavior.** With allowSoftLockOverride = true and the user having an override role: SoftLocked period allows posting. With allowSoftLockOverride = false (or user lacks the role): SoftLocked blocks posting like HardLocked.
- [ ] **HardLocked always blocks.** Even with override roles, HardLocked periods must not accept new postings.
- [ ] **Year-end closing entry balances.** totalDebit = totalCredit in the closing entry preview and in the posted JE. Verify in GL: the closing JE is balanced.
- [ ] **Post-close income/expense accounts zero out.** After year-end close: every income and expense account has a zero balance for the closed year. Run a Trial Balance as of the last day of the year, post-close — income/expense accounts should show zero; retained earnings should have increased (or decreased) by the net profit (or loss).
- [ ] **Retained earnings receives the net.** Retained earnings account balance change = prior balance + P&L net profit. Verify against the Balance Sheet equity section.
- [ ] **Changing fiscalYearStartMonth does not corrupt existing years.** Existing fiscal years and periods are unchanged; only newly created years respect the new start month.
- [ ] **Duplicate year creation rejected.** Two fiscal years for the same calendarYear + legalEntityId cannot coexist.

---

## 6. Edge cases & defensive UX

- [ ] Creating a fiscal year with a year that has already passed (historical entry) is allowed (for migration); system does not block historical years.
- [ ] Closing a year with unposted or draft journal entries: pre-closing checklist check "unposted items" fails and close is blocked.
- [ ] Batch lock on a year with one already-locked period does not error — idempotent.
- [ ] Reopen without a reason: rejected client-side (required field) and server-side.
- [ ] Rapid double-click on "Close Year": only one close operation fires (button disabled on first click).
- [ ] Two browser sessions: Session A locks a period; Session B tries to post a JE into it — Session B gets a period-locked error, not a silent failure.
- [ ] RTL: period labels, dates, and status badges render correctly in Arabic locale; numbers are localized.
- [ ] Fiscal year with a non-January start (e.g. April): periods are labeled correctly (Period 1 = Apr, Period 12 = Mar of next year); closing entry posts correctly.

---

## 7. Cross-module / integration

- [ ] A closed fiscal year causes rejection of auto-posted JEs from Sales, Purchase, POS, and Inventory events dated within it (verify via dead-letter queue — failed events should appear there, not be silently dropped).
- [ ] The year-end closing JE appears in the GL for the retained earnings account; clicking the JE number resolves to the journal-entry detail.
- [ ] Trial Balance run for the closed year reflects the post-close balances (income/expense zeroed, retained earnings updated).
- [ ] Period lock status is respected by the close-management module (period-close runs that attempt to lock an already-HardLocked period behave gracefully).

---

## 8. Known gaps

- No known UI gaps at time of writing. Fiscal settings, year creation, period locking, batch operations, pre-closing checklist, closing entry preview, close, and reopen are all present in the feature.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Year-end closing entry is balanced and retained earnings is correct.
- [ ] Findings logged in `_findings.md`.
