# Accounting — Audit Trail Testing Checklist

> Persona: **Accountant**. The audit trail is a legal record. Every financial mutation must be captured immutably with who/when/what and before/after values. An accountant reviewing this screen must be able to reconstruct exactly what happened to any entry, by whom, and when — with no gaps and no edits.

- **Route(s):** `/accounting/audit-trail`
- **Feature dir:** `features/audit/`
- **API:** `GET /tenant/audit-logs`, `GET /tenant/audit-logs/entity-types`
- **Depends on:** All accounting submodules (audit captures actions across all of them)

---

## 0. Preconditions

- [ ] A dataset with diverse accounting activity loaded: at least one of each — created account, posted JE, reversed JE, closed period, updated account mapping, created cheque + transitions.
- [ ] Logged in as a user with audit-read permissions; confirm a non-admin cannot access the audit trail (server-side check, not just hidden navigation).
- [ ] At least two distinct users (emails) have made mutations, so filtering by user is testable.

---

## 1. Functional — actions & states

### 1.1 Audit log list

- [ ] **List loads** — table renders with: timestamp, actor (email), action (create/update/delete), source (api/job/event/system), entity type, entity ID, correlation ID (if present).
  - [ ] Loading state shown while fetching; skeleton or spinner, no blank screen.
  - [ ] Empty state (no audit records yet) shows a clear message, not a broken layout.
- [ ] **Chronological order** — most recent record appears first by default; order is stable across pages.
- [ ] **Pagination** — page size is 25 (per `AUDIT_PAGE_SIZE`); page 2 does not repeat page 1 records; total count in meta matches the visible count across all pages.

### 1.2 Filters

- [ ] **Filter by action** — selecting "create", "update", or "delete" returns only records of that type; "all" restores everything.
- [ ] **Filter by entity type** — the entity-type dropdown is populated from the API (`GET /tenant/audit-logs/entity-types`); selecting "JournalEntry" shows only JE audit records; selecting "Account" shows only account mutations; etc. Applies correctly for all accounting entity types.
- [ ] **Filter by user** — selecting a specific userId shows only that user's actions.
- [ ] **Filter by date range** — dateFrom and dateTo filter correctly; records outside range are excluded; boundary dates (inclusive/exclusive) behave as expected.
- [ ] **Search** — free-text search (if present) matches against entity ID, email, or correlation ID; no results returns an "empty" state, not a broken screen.
- [ ] **Combined filters** — applying entity type + action + date range together returns the correctly intersected subset.
- [ ] **Filter reset** — clearing all filters restores the full, unfiltered list.

### 1.3 Record detail / diff view

- [ ] **Before/after diff** — clicking a record (or "View diff") opens the diff dialog; it shows the before and after states of the mutated entity in a readable field-by-field format.
- [ ] **Create records** — before = null; after = the full created object.
- [ ] **Update records** — before = old values; after = new values; unchanged fields are either hidden or clearly marked as unchanged.
- [ ] **Delete records** — before = the object as it was; after = null.
- [ ] **Diff dialog closes** — clicking away or pressing Escape closes the dialog without side effects.

### 1.4 Deep link from entity detail

- [ ] **Entity-scoped view** — navigating to a journal entry detail (or account detail) and clicking "History" or equivalent link opens the audit trail filtered to that specific entityType + entityId.
- [ ] **Only that entity's records** — the deep-linked view shows no records for other entities; the filter is applied correctly server-side, not just client-side.
- [ ] **Back navigation** — returning from the deep-linked audit view takes the user back to the source entity, not to the unfiltered audit list.

### 1.5 Export

- [ ] **Export button** — if present, exports the current filtered view (not just the current page) to a file (CSV or PDF).
- [ ] **Exported content matches screen** — columns, filters, and date range in the export match what is visible.
- [ ] **Loading state on export** — button shows a spinner; not disabled for too long; large exports do not time out the browser.

---

## 2. Accounting / domain invariants

- [ ] **Every create mutation captured** — create a new COA account; open audit trail; the record appears with action=create, entityType=Account (or equivalent), before=null, after=the account object.
- [ ] **Every update mutation captured** — edit an account name; the audit record shows before={old name} and after={new name}.
- [ ] **Post JE captured** — post a manual journal entry; the audit record appears with action=update (status change to posted) or equivalent; before shows "draft", after shows "posted".
- [ ] **Reverse JE captured** — reverse a posted JE; two audit records appear: one for the reversal JE creation, one for the original JE status update (if applicable).
- [ ] **Period close captured** — closing a fiscal period writes an audit record with entityType=FiscalPeriod (or equivalent), showing before={status:open} and after={status:closed}.
- [ ] **Account mapping change captured** — editing or creating an account mapping writes an audit record.
- [ ] **Cheque transition captured** — each cheque lifecycle transition (deposit, clear, bounce, cancel) writes an audit record for the cheque entity showing before/after status.
- [ ] **Records are immutable** — there is no edit or delete button on any audit record; no API endpoint permits UPDATE or DELETE on audit_logs. Attempting `DELETE /tenant/audit-logs/:id` returns 404 or 403.
- [ ] **Actor email accurate** — the userEmail on each record matches the logged-in user who performed the action; system/job actions show source=system or source=job with a descriptive actor identifier.
- [ ] **Timestamps accurate** — audit record timestamps are within a few seconds of the action being performed; they are in UTC (or the entity's local timezone consistently).
- [ ] **Source field accurate** — mutations from the UI show source=api; event-driven auto-postings show source=event; scheduled jobs show source=job.
- [ ] **Correlation ID** — related records (e.g. a sale that triggers a JE that triggers a tax entry) share the same correlationId, allowing the accountant to trace a chain of events.
- [ ] **Covers ALL accounting submodules** — the entity-type list includes at minimum: Account, JournalEntry, JournalLine, FiscalYear, FiscalPeriod, AccountMapping, TaxCode, Cheque, BankReconciliation. Confirm each appears at least once in the test dataset.

---

## 3. Edge cases & defensive UX

- [ ] **No edit/delete affordance** — the audit trail UI has no buttons or controls that could mutate a record; it is strictly read-only.
- [ ] **High-volume list** — with 1000+ records, the list loads within a reasonable time (< 3 seconds); pagination is used, not a full dump; filters narrow the set quickly.
- [ ] **Large before/after payload** — a JE with 20 lines has a large "after" object; the diff dialog renders it without overflowing or crashing; scrollable if needed.
- [ ] **Null before/after** — a record with before=null (create) or after=null (delete) renders cleanly in the diff dialog — not "null" as a raw string or a blank broken panel.
- [ ] **Filtering by an entity type with zero records** — returns an empty state, not a 500 error.
- [ ] **Entity deleted** — the entity-ID link in an audit record for a deleted entity fails gracefully (404 page or "record deleted" message), not a JS crash.
- [ ] **RTL / Arabic locale** — audit table, diff dialog, timestamps, and filter labels all render correctly in Arabic; timestamps use the correct locale format.
- [ ] **IP address and user agent** — if ipAddress and userAgent are shown, they are display-only and cannot be edited; sensitive (internal) IP addresses are not a security concern in this internal-only tool.
- [ ] **Permissions boundary** — a user with accounting-read-only can view the audit trail but cannot retry dead letters, post JEs, or perform any mutation from any link within the audit trail.

---

## 4. Cross-module / integration

- [ ] **Journal Entries deep link** — on the JE detail screen, a "History" or "Activity" tab links to the audit trail scoped to that JE's entityId; all revisions (draft → posted, or post → reversed) are visible.
- [ ] **COA account detail** — account edit history accessible via deep link; every name change, classification change, and active/inactive toggle is recorded.
- [ ] **Period close management** — closing a period at `/accounting/close-management` writes a record visible here; the period's before/after status change is clear.
- [ ] **Cheque register** — each cheque transition (received → deposited → cleared, etc.) is linked from the cheque detail to the audit trail.
- [ ] **Dead letters** — retry attempts on dead letters (success and failure) each write audit records showing who retried and the outcome.

---

## 5. Known gaps

- [LOW] No export-to-PDF with digital signature for regulatory submission; CSV export is the only format.
- [LOW] No built-in alerting when a sensitive action (e.g. period close, JE reversal) is performed — accountant must manually review the trail.
- [LOW] Correlation ID linking is present in the data model but there is no "show all related events for this correlation ID" filter in the UI.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
