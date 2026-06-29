# POS — Register & Session Testing Checklist

> Persona: **Counter cashier / shift supervisor.** You open the register at the start of a shift, handle a full day of transactions, and close at end of shift. Ask at every screen: **"what's the dumbest thing a cashier could do here, at speed, with a customer waiting?"**

- **Route(s):** `/pos`, `/pos/shifts`
- **Feature dir:** `apps/web/src/app/[locale]/(pos)/pos/`
- **API:** `POST tenant/pos/registers`, `GET/PATCH/DELETE tenant/pos/registers/:id`, `POST tenant/pos/shifts`, `GET tenant/pos/shifts/current`, `GET tenant/pos/shifts/:id`, `POST tenant/pos/shifts/:id/close`
- **Tables:** `pos_registers`, `pos_shifts`
- **Depends on:** User accounts with `pos:cashier` permission; at least one register configured before opening a shift.

## 0. Preconditions

- [ ] At least one register exists and is not already in an open shift. Know its name and ID.
- [ ] Logged in as a user with `pos:cashier` permission; separately confirm a user without this permission cannot reach `/pos` — the server rejects the request, not just the UI hiding it.
- [ ] Shift supervisor / manager account available for testing close-with-discrepancy flows.

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

### Register list & config

- [ ] **Register list loads** — all registers for the tenant appear with name, type, status, and current shift state.
  - [ ] Loading state: skeleton shown; not a blank screen.
  - [ ] Error state: API failure shows a human-readable message, not a raw stack trace.
  - [ ] Empty state (no registers yet): clear prompt to create one, not a broken table.
- [ ] **Create register** (`POST tenant/pos/registers`) — cashier fills name, type, optional printer/drawer config; saves; register appears in list immediately.
  - [ ] Duplicate register name: server-side rejection with clear message; form stays open with data intact.
  - [ ] Submit button disabled while in flight — no double-submit.
- [ ] **Edit register** (`PATCH tenant/pos/registers/:id`) — fields pre-populated; save updates list.
- [ ] **Delete register** (`DELETE tenant/pos/registers/:id`) — requires confirmation dialog; a register with an open or unclosed shift cannot be deleted (server rejects with clear message, not a silent 500).

### Open shift

- [ ] **Open shift** (`POST tenant/pos/shifts`) — cashier selects register, enters opening float, confirms; shift opens; POS cart screen loads.
  - [ ] Opening float = 0 is accepted (a cashier who forgets to count can open with zero).
  - [ ] Opening float field: numeric only, non-negative; negative value rejected client- and server-side.
  - [ ] If a shift is already open on this register: server rejects with a clear message ("register already has an open shift"); cashier is not silently dropped into a broken state.
  - [ ] If the same cashier already has an open shift on another register: server rejects ("you already have an open shift").
  - [ ] Loading state shown while shift open request is in flight — button debounced; cashier cannot double-tap to open two shifts.

### Active shift display

- [ ] **Current shift banner** (`GET tenant/pos/shifts/current`) — shift info (register name, cashier, opened-at, opening float) is visible throughout the POS session.
  - [ ] If the API call fails the POS should surface an error, not silently proceed with a stale or missing shift context.
- [ ] **Shift detail** (`GET tenant/pos/shifts/:id`) — supervisor can view full shift detail including all transactions, movements, and expected cash.

### Close shift

- [ ] **Close shift** (`POST tenant/pos/shifts/:id/close`) — supervisor enters actual cash count; system computes expected cash and over/short; confirmation required before finalising.
  - [ ] Closing with held (parked) transactions blocked — server rejects; clear message names how many held transactions remain.
  - [ ] Closing in status `closing` accepted (idempotent if already in-progress); status `completed` rejected (cannot re-close).
  - [ ] If actual cash differs from expected by more than the configured threshold, a manager PIN / approval is required before close proceeds.
  - [ ] Loading state while close request is in flight; button disabled to prevent double-close.
  - [ ] On success: shift transitions to `completed`; back-office shift list reflects the new status; Z-report is accessible.
- [ ] **Shift status transitions** — only valid transitions allowed: `open → closing → completed`; no backwards transitions; no `open → completed` skip (if `closing` is a mandatory step in the workflow).

### Filters & navigation

- [ ] Shift list (`/pos/shifts`) filterable by register, cashier, date range, status; reset works.
- [ ] Pagination stable across pages.

## 2. Domain invariants (cash / GL / stock)

- [ ] **At most one open shift per register at any time:** a second `POST tenant/pos/shifts` for the same register while one is `open` or `closing` is rejected — confirm whether this is enforced by a DB-level partial unique index on `(registerId, status='open'/'closing')` or service-only (service-only is a race risk under concurrent requests).
- [ ] **Cashier holds at most one open shift:** a cashier cannot open a second shift on a different register while their first is still open. Server enforces this, not just the UI.
- [ ] **shiftNumber is monotonically increasing per register with no resets:** the sequence must never gap or repeat within a register's lifetime, even after soft deletes or data imports.
- [ ] **A shift in `closing` or `completed` status accepts no new transactions:** any `POST tenant/pos/transactions` referencing a non-open shift is rejected; closing is not interruptible by new sales.
- [ ] **A shift cannot close while held transactions exist:** `POST :id/close` returns an error if `pos_transactions` has rows with `status='held'` linked to this shift; the cashier must recall and complete or void them first.
- [ ] **openingFloat ≥ 0:** no shift record has a negative opening float; the DB `CHECK` constraint or service validation enforces this.
- [ ] **Shifts are never hard-deleted:** soft-delete or archive only; a completed or voided shift row must remain for audit trail; `DELETE tenant/pos/shifts/:id` should not exist or must be restricted to admin-only with a soft-delete flag.

## 3. Edge cases & defensive UX — "the dumbest thing a cashier could do here"

- [ ] **Double-tap open shift:** cashier taps "Open Shift" twice quickly — only one shift is created; the button is disabled after the first tap.
- [ ] **Close shift with held transactions:** cashier tries to close; system surfaces a count of held transactions with a link to recall them — not a generic error code.
- [ ] **Opening float = large number:** cashier accidentally types the sale amount into the float field — no upper-bound validation will block a legitimate float, so the number should display back clearly for cashier to verify before confirming.
- [ ] **Stale session:** cashier's session expires mid-shift; returning to `/pos` should re-attach to the existing open shift, not create a duplicate.
- [ ] **Concurrent close from two supervisor windows:** second close attempt after first succeeds is rejected gracefully, not a 500.
- [ ] **Register deleted mid-shift:** another admin deletes the register while a shift is open — shift close still succeeds; the register reference is retained on the shift record even after deletion.
- [ ] **RTL (Arabic) UI:** shift open/close dialogs, float input, and shift list all render correctly under RTL; dates and currency amounts are localized.
- [ ] **Empty float field:** cashier skips the float field and taps Open — either defaults to 0 (with a confirmation) or rejects with a clear message; never submits `null`.

## 4. Cross-module / integration

- [ ] Opening a shift with a non-zero float posts an opening cash movement visible in the Z-report (`pos_cash_movements` or equivalent).
- [ ] Closing a shift triggers `pos.shift.closed` event → Accounting listener posts over/short JE to account 6700 and bank deposit JE (DR Bank → CR 1112); confirm both JEs appear in the GL trial balance.
- [ ] Shift detail drill-down links to individual transactions and their receipts resolve correctly.
- [ ] The shift cashier is the user shown on the Z-report and on individual receipt headers.

## 5. Known gaps (from recon — verify or track)

- **No DB-level partial unique index on `(registerId, status='open')`** — if enforcement is service-only, a race condition between two simultaneous open-shift requests can create two open shifts for the same register. Confirm index exists in the migration; if not, this is a **CRITICAL** data-integrity gap.
- **Stale open shifts (>24 h / >48 h) only get a UI nudge, not a hard block** — a cashier who forgot to close can keep transacting indefinitely; no automatic shift timeout or forced close. Track as **MEDIUM** (operational risk, not data corruption).
- **`closing` intermediate status flow** — whether `closing` is a mandatory state or can be skipped is unclear from the API surface alone; test the actual state machine. **LOW** if `closing` is just a UI concern; **MEDIUM** if business logic differs.
- **No audit log on register config changes** — `PATCH/DELETE tenant/pos/registers/:id` changes are not reflected in an immutable audit trail. Track as **LOW** for MVP.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
