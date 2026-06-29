# Accounting — Dead Letters (Event Retry) Testing Checklist

> Persona: **Accountant**. This screen is the safety net for the event-driven accounting system. Any auto-posting failure that lands here is a bookkeeping gap — the GL is incomplete until the dead letter is resolved. Nothing should be silently dropped.

- **Route(s):** `/accounting/dead-letters`
- **Feature dir:** `features/dead-letters/`
- **API:** `GET /tenant/accounting/dead-letters`, `POST /tenant/accounting/dead-letters/:id/retry`
- **Depends on:** Account Mappings (06), Fiscal Years & Periods (10), Journal Entries (02)

---

## 0. Preconditions

- [ ] At least one failed accounting event exists — OR — a way to deliberately trigger one (e.g. temporarily remove an account mapping, then perform a sale/cheque transition, then restore the mapping).
- [ ] Logged in as a user with accounting write permissions; confirm a read-only user can see dead letters but cannot retry.
- [ ] An open fiscal period exists (needed to verify successful retry posts correctly).

---

## 1. Functional — actions & states

### 1.1 Dead letters list

- [ ] **List loads** — table renders with: event type, error message (truncated with expand), attempt count, created-at timestamp.
  - [ ] Loading state shown while fetching (spinner or skeleton); no blank screen.
  - [ ] **Empty state** — when there are no dead letters, a reassuring "All accounting events have been processed successfully" message is shown (not a broken/blank view).
- [ ] **Error detail** — each row shows a readable error reason (e.g. "Account mapping not found for event type: sale.completed", "Fiscal period is closed for date 2024-03-31"). Not a raw stack trace.
- [ ] **Attempt count** — displays how many times the event has already been retried automatically; increments after each manual retry attempt that also fails.
- [ ] **Payload visibility** — the original event payload is accessible (expandable or via a detail view) so the accountant can understand what triggered the failure.
- [ ] **Pagination** (if > 1 page of dead letters): pages are stable and counts are correct.

### 1.2 Global alert banner

- [ ] **Banner present** — when dead letters exist, a banner or badge is visible in the global shell/navigation (not just on the dead-letters page itself) alerting the accountant that unprocessed events need attention.
- [ ] **Banner count** — the banner shows the count of pending dead letters.
- [ ] **Banner navigates** — clicking the banner takes the user directly to `/accounting/dead-letters`.
- [ ] **Banner dismisses when queue is empty** — after all dead letters are resolved, the banner disappears on the next data refresh; it does not linger.
- [ ] **Banner loading state** — on initial app load, the banner does not flash a false "N dead letters" before the query resolves; it shows nothing or a neutral state while loading.

### 1.3 Retry individual dead letter

- [ ] **Retry button** — each row has a "Retry" button (or equivalent action).
  - [ ] Button shows a loading/spinner state while the retry is in flight; disabled to prevent double-retry.
  - [ ] Error state: if retry fails again (same root cause not yet fixed), the row remains in the list, the attempt count increments, and the new error message is shown.
  - [ ] Success state: on a successful retry, the row is removed from the dead-letters list; a toast/notification confirms "Event processed successfully".
- [ ] **List refreshes** — after a successful retry, the list and banner count both update without requiring a manual page reload.

---

## 2. Accounting / domain invariants

- [ ] **Nothing silently dropped** — perform a sale/cheque transition/purchase receipt while a required account mapping is missing; confirm the failed event appears in dead letters within a few seconds, NOT silently ignored. The GL must NOT have a partial or missing entry.
- [ ] **Retry posts the correct JE** — after restoring the missing mapping (or fixing the root cause), retry the dead letter; open the resulting journal entry and verify: it is balanced (Σ debits = Σ credits), it is dated with the original event date (not the retry date), it links back to the correct source document.
- [ ] **Retry is idempotent — no double-post** — retry a dead letter that has already been successfully processed (simulate by retrying a just-resolved item if the UI allows, or by calling the API twice rapidly); the second attempt must return an error or no-op, NOT create a second JE.
- [ ] **Attempt count is accurate** — each auto-retry (if the system retries automatically on failure) and each manual retry increments the count. The final count reflects total attempts.
- [ ] **Original event date preserved** — the JE posted via retry uses the date from the original event payload, not today's date. Verify this against the journal entry date after a successful retry.
- [ ] **Closed period blocks retry** — if the original event date falls in a now-closed period, the retry returns a "period closed" error (not a server crash) and the dead letter remains with an updated error message. The accountant must open the period or use an adjustment date.
- [ ] **Unbalanced event never posts** — if the event payload itself contains data that would produce an unbalanced JE (degenerate case), the retry rejects with a balance error rather than posting a broken entry.
- [ ] **Dead letter count in banner matches list count** — these two must always agree; a discrepancy indicates a stale cache bug.

---

## 3. Edge cases & defensive UX

- [ ] **Root cause not fixed before retry** — retrying with the same missing configuration fails gracefully, increments attempt count, shows updated error. No crash, no data corruption.
- [ ] **Retry during active transaction** — if the source document (e.g. a sale order) is being edited at the same moment the retry runs, the retry either succeeds with the current document state or fails with a clear concurrency message.
- [ ] **Many dead letters (stress)** — with 50+ dead letters, the list renders without timeout; pagination works; the banner count is correct.
- [ ] **Retry all / bulk retry** (if feature exists) — confirm bulk retry does not double-post any event and is also idempotent.
- [ ] **Stale page** — dead letters resolved by another user session are no longer shown after a page refresh (or auto-refresh interval).
- [ ] **Permissions** — a user without accounting-write cannot click Retry; the button is either hidden or disabled with an explanatory tooltip (not just an API 403 with no UI message).
- [ ] **RTL** — dead-letters list, error messages, and banner render correctly in Arabic locale; timestamps are correctly formatted.
- [ ] **Very long error message** — a 2000-character error string is truncated in the list with a "Show more" expand; full text is readable without breaking the layout.

---

## 4. Cross-module / integration

- [ ] **Account Mappings config gap** — the most common cause of dead letters is a missing account mapping. Confirm the error message names the specific missing mapping (e.g. event type + required account code) so the accountant can go directly to `/accounting/account-mappings` and fix it.
- [ ] **Journal Entries** — a successfully retried dead letter creates a JE visible at `/accounting/journal-entries` with the correct source reference.
- [ ] **Cheque lifecycle** — a failed cheque transition (e.g. deposit during a closed period) appears in dead letters; after the period is re-opened, retry succeeds and posts the cheque JE.
- [ ] **POS / Sales / Purchase events** — failures from any auto-posting source (not just cheques) all land here. Test at least one non-cheque event (e.g. a POS transaction with an unmapped account).
- [ ] **Audit trail** — each retry attempt (success or failure) writes an audit record visible at `/accounting/audit-trail`, capturing who retried, when, and the outcome.

---

## 5. Known gaps

- [MEDIUM] No bulk-retry-all button; with many dead letters from a config mistake the accountant must retry one-by-one.
- [LOW] No filter by event type or date range on the dead-letters list; hard to triage when many events are queued.
- [LOW] No direct link from the dead-letter row to the source document (sale order, cheque, etc.) to help the accountant understand the context.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
