# Accounting — Cheques (PDC Register) Testing Checklist

> Persona: **Accountant**. Every cheque movement must post a balanced journal entry through the listener. Test every lifecycle transition for both accounting correctness and UI state consistency.

- **Route(s):** `/accounting/cheques`
- **Feature dir:** `features/cheques/`
- **API:** `POST /tenant/accounting/cheques`, `POST /tenant/accounting/cheques/:id/:action`
- **Depends on:** Chart of Accounts (01), Account Mappings (06), Fiscal Years & Periods (10), Journal Entries (02)

---

## 0. Preconditions

- [ ] At least one open fiscal period exists covering today's date.
- [ ] Account mappings for cheques-receivable, cheques-payable, bank clearing, bounce-charge income are configured.
- [ ] At least one customer (incoming) and one supplier (outgoing) counterparty exists.
- [ ] Logged in as a user with cheque read + write permissions; separately confirm a read-only user cannot create or transition.

---

## 1. Functional — actions & states

### 1.1 Cheque list

- [ ] **List loads** — table renders with correct columns: direction badge, counterparty name, cheque number, bank, amount + currency, cheque date, status, linked document.
  - [ ] Loading skeleton shown while fetching; no blank/broken screen.
  - [ ] Empty state ("No cheques yet") is clear with a call-to-action, not a white void.
- [ ] **Filter by direction** — selecting "Incoming" shows only received/deposited/cleared/bounced/cancelled incoming cheques; "Outgoing" shows only outgoing; "All" restores both.
- [ ] **Filter by status** — each status value (received, deposited, issued, presented, cleared, bounced, cancelled) filters correctly; combining direction + status filters correctly.
- [ ] **Filter reset** — clearing filters restores full list without page reload.
- [ ] **Pagination** — second page does not repeat first-page records; page count matches total from meta; navigating back to page 1 is stable.

### 1.2 Aging summary widget

- [ ] **Widget renders** — aging buckets appear above the table (e.g. Current, 1–30 days, 31–60 days, 61–90 days, >90 days) with amounts per bucket.
- [ ] **Amounts match cheque list** — sum of amounts across all buckets equals the sum of non-terminal outstanding cheques visible in the list.
- [ ] **Bucket assignment by due date** — a cheque whose cheque date is 45 days past today falls in the 31–60 bucket, not the current bucket.
- [ ] **Direction sensitivity** — confirm whether widget shows incoming, outgoing, or both; totals must be consistent with the direction selected.
- [ ] **Loading / empty states** — spinner while loading; "No outstanding cheques" state is clean.

### 1.3 Create cheque

- [ ] **Open dialog** — "Add Cheque" button opens the creation dialog; cancel discards without saving.
  - [ ] Loading state on submit (button disabled, spinner shown); no double-submit on rapid click.
  - [ ] Error state (e.g. duplicate cheque number, missing account mapping) is user-friendly, preserves form data.
- [ ] **Direction field** — selecting Incoming vs Outgoing changes the counterparty label (Customer vs Supplier) and sets correct initial status (received vs issued).
- [ ] **Counterparty lookup** — searching by name returns matches; selecting one populates counterpartyId correctly.
- [ ] **Cheque number** — required; duplicate cheque number for the same counterparty is rejected with a clear message.
- [ ] **Bank name** — free text; required; stored and displayed correctly.
- [ ] **Amount** — required; must be positive; zero and negative are rejected; very large amounts (e.g. 9,999,999.9999) accepted without truncation.
- [ ] **Currency** — defaults to entity's functional currency; changing to a foreign currency is permitted only if multi-currency is enabled.
- [ ] **Cheque date** — date picker; required; past and future dates accepted (PDC = post-dated cheque by definition); date stored as entered, not converted.
- [ ] **Linked document** — optional; selecting a document type + ID links correctly; link renders in table.
- [ ] **Notes** — optional; free text; stored and displayed.
- [ ] **On success** — dialog closes, list refreshes, new cheque appears with correct status (received for incoming, issued for outgoing).

### 1.4 Lifecycle transitions — Incoming

For each transition: open the transition dialog, confirm the action, verify the resulting status and the posted JE.

- [ ] **Received → Deposit (action: deposit)**
  - [ ] Dialog confirms cheque details; submit triggers `POST /:id/deposit`.
  - [ ] Status changes to "deposited".
  - [ ] JE posted: DR Cheques-Receivable Clearing / CR PDC Receivable (or per mapping). Verify via Journal Entries screen.
  - [ ] JE is balanced and links back to this cheque as source document.
- [ ] **Deposited → Clear (action: clear)**
  - [ ] Status changes to "cleared".
  - [ ] JE posted: DR Bank / CR Cheques-Receivable Clearing.
  - [ ] "cleared" is terminal — no further transition buttons shown.
- [ ] **Deposited → Bounce (action: bounce)**
  - [ ] Status changes to "bounced".
  - [ ] JE posted: reversal of the deposit entry (DR PDC Receivable / CR Cheques-Receivable Clearing).
  - [ ] "bounced" is terminal — no further transition buttons shown.
- [ ] **Bounce with charge amount**
  - [ ] Entering a bounceChargeAmount posts an additional JE: DR Bank Charges / CR Bank (net charge posted to income account per mapping).
  - [ ] Charge amount JE is balanced independently.
- [ ] **Bounce with rebill-to-customer flag**
  - [ ] With bounceChargeRebilled = true (and a charge amount), an extra JE is posted: DR AR (customer) / CR Fee Income.
  - [ ] Rebill appears in AR aging for that customer.
- [ ] **Received → Cancel (action: cancel)**
  - [ ] Status changes to "cancelled".
  - [ ] No JE posted (cheque was never deposited; nothing to reverse). Verify no spurious JE created.
  - [ ] "cancelled" is terminal.

### 1.5 Lifecycle transitions — Outgoing

- [ ] **Issued → Present (action: present)**
  - [ ] Status changes to "presented".
  - [ ] JE posted: DR PDC Payable / CR Bank Clearing (per mapping).
- [ ] **Presented → Clear (action: clear)**
  - [ ] Status changes to "cleared".
  - [ ] JE posted: DR Bank Clearing / CR Bank.
  - [ ] Terminal — no further actions.
- [ ] **Presented → Bounce (action: bounce)**
  - [ ] Status changes to "bounced".
  - [ ] JE posted: reversal of present entry.
  - [ ] Terminal.
- [ ] **Issued → Cancel (action: cancel)**
  - [ ] Status changes to "cancelled"; no JE posted.
  - [ ] Terminal.

---

## 2. Accounting / domain invariants

- [ ] **Every lifecycle JE is balanced** — for each transition above, open the resulting journal entry and confirm Σ debits = Σ credits to the currency's decimal precision.
- [ ] **No skipping states** — attempt to call `clear` directly on a "received" cheque (bypass deposit); server must reject with 400/422. UI must not offer the button.
- [ ] **No backwards transitions** — a "cleared" or "bounced" or "cancelled" cheque shows no transition buttons; attempting a transition via API returns an error.
- [ ] **Status-vs-posting consistency** — if a JE post fails (e.g. closed period), the cheque status must NOT advance. The pair is atomic.
- [ ] **Bounce charge requires charge amount** — submitting a bounce with rebillToCustomer = true but no bounceChargeAmount is rejected server-side.
- [ ] **Cheque currency matches JE currency** — the JE lines use the same currency as the cheque; if foreign, base-currency equivalent is also stored.
- [ ] **Linked document resolves** — the linked invoice/payment link in the cheque table navigates to the correct source document.
- [ ] **Aging buckets are date-accurate** — re-test aging widget with a cheque whose cheque date is exactly on a bucket boundary (e.g. exactly 30 days ago).
- [ ] **Currency consistent with bank** — if a bank account is configured for a specific currency, a cheque in a different currency is either blocked or explicitly warned.
- [ ] **Functional currency amounts stored** — for foreign-currency cheques, open the JE and confirm both original-currency and functional-currency amounts are present on each line.

---

## 3. Edge cases & defensive UX

- [ ] **Destructive transitions** — bounce and cancel transitions ask for confirmation ("Are you sure?"); accidental tap does not immediately post.
- [ ] **Zero-amount cheque** — rejected on create with a clear validation message.
- [ ] **Negative amount** — rejected on create.
- [ ] **Amount precision** — entering more decimal places than the currency allows is either truncated with a warning or rejected; not silently floored.
- [ ] **Future cheque date (true PDC)** — a cheque dated 90 days ahead is accepted; its aging bucket shows it as "Current" or in the correct future bucket.
- [ ] **Past cheque date** — accepted; falls in the correct overdue aging bucket.
- [ ] **Closed period for transition** — if the cheque date or today falls in a locked period, the transition is blocked by the server with a "period closed" message; status does not advance.
- [ ] **Double-submit on transition** — clicking "Confirm" twice rapidly does not create two JEs. Button is disabled after first click.
- [ ] **Session stale cheque** — another user cancels a cheque while first user has the transition dialog open; submitting returns a clear error ("cheque is no longer in the expected state"), not a silent failure.
- [ ] **RTL / Arabic** — direction badges, status labels, amounts, and dates render correctly in Arabic locale; currency symbol position follows currency definition.
- [ ] **Counterparty with no open balance** — linking a cheque to a customer that has no AR balance is allowed (cheque can exist independently); no constraint error.
- [ ] **Long cheque number / bank name** — UI truncates gracefully; full value visible on hover or detail view.

---

## 4. Cross-module / integration

- [ ] **Journal Entries screen** — every transition-generated JE is visible at `/accounting/journal-entries` with the correct source document reference and can be drilled into.
- [ ] **General Ledger** — cheques-receivable / cheques-payable accounts show the correct running balance after each lifecycle step.
- [ ] **AR Aging** — bounce-with-rebill creates a new AR line for the customer; it appears in AR aging totals immediately.
- [ ] **Account Mappings** — if a required mapping (e.g. cheques-receivable clearing account) is deleted or unmapped, the transition fails and the dead letter appears in `/accounting/dead-letters` rather than silently posting to a wrong account.
- [ ] **Audit trail** — creating a cheque and each transition each write an audit record visible at `/accounting/audit-trail`.

---

## 5. Known gaps

- No bulk-transition (e.g. mass-clear multiple cheques) — LOW for MVP, track for V2.
- No cheque print / PDF export from the register — LOW.
- Bounce charge rebill triggers AR entry but it is unclear whether a formal invoice/debit note is generated — MEDIUM: accountant needs a document to send to the customer.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
