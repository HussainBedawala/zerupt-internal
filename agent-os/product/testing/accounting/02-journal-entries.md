# Accounting — Journal Entries Testing Checklist

> Persona: **Accountant.** You are the person who reviews, posts, and signs off on journal entries. You expect the ledger to be a permanent, immutable record. A posted entry that can be edited or deleted is an audit failure, not a UX bug.

- **Route(s):** `/accounting/journal-entries`, `/accounting/journal-entries/new`, `/accounting/journal-entries/[id]`
- **Feature dir:** `features/journal-entries/`
- **API:** `GET /tenant/journal-entries`, `POST /tenant/journal-entries`, `PATCH /tenant/journal-entries/:id`, `POST /tenant/journal-entries/:id/post`, `POST /tenant/journal-entries/:id/reverse`, `DELETE /tenant/journal-entries/:id`
- **Depends on:** Chart of Accounts (01) must be complete. At least one open fiscal period must exist.

## 0. Preconditions

- [ ] Dataset loaded: have a mix of auto-posted entries (from POS, Sales, Purchase) and at least one manual draft you can work with.
- [ ] Know the fiscal period dates; know which periods are open vs locked.
- [ ] Logged in as a user with journal-entry write permission. Confirm a read-only user cannot post or reverse.

## 1. Functional — actions & states

### List view

- [ ] **List loads** — all journal entries for the selected legal entity appear, most recent first by default.
  - [ ] Loading state: skeleton or spinner visible; no empty flash before data appears.
  - [ ] Error state: API failure shows a human-readable message.
  - [ ] Empty state: if no entries exist, a clear empty-state message appears (not a blank table).
- [ ] Each row shows at minimum: JE number, posting date, source/type (Manual / POS / Sale / Purchase / etc.), status (Draft / Posted / Reversed), description, and total amount.
- [ ] **Filter by status** (Draft / Posted / Reversed): list updates correctly; reset clears filter.
- [ ] **Filter by source/type**: only entries from that source appear.
- [ ] **Filter by date range**: entries outside the range are excluded; boundaries are inclusive.
- [ ] **Text search** (description / reference): partial matches surface correct results; clear resets.
- [ ] **Export CSV**: downloaded file matches what is visible on screen (respects active filters). Verify numeric amounts render as numbers, not strings.
- [ ] Pagination: navigating pages is stable; going to page 2 then filtering resets to page 1.

### Create manual draft

- [ ] Clicking "New Journal Entry" navigates to `/accounting/journal-entries/new`.
- [ ] Form loads with today's date and the entity's functional currency pre-filled; exchange rate defaults to 1.
- [ ] **Account picker (`AccountPicker`)**: search by code or name returns matching active, non-header accounts. Inactive accounts and header accounts do not appear.
- [ ] **Debit/credit XOR**: entering a debit amount on a line clears the credit field and vice versa.
- [ ] **Balance indicator (`BalanceIndicator`)**: shows live running totals for debits and credits; turns visually "balanced" when Σ debits = Σ credits.
- [ ] Adding lines: "Add line" appends an empty row; minimum 2 lines enforced (remove button disabled when only 2 lines remain).
- [ ] Description (primary) and secondary description (bilingual, RTL for Arabic) both save correctly.
- [ ] **Auto-save (debounced 2 s on blur)**: after filling in two or more complete lines and blurring a field, a draft is silently created/updated and "Draft saved" appears briefly. Verify in the list view.
- [ ] **Manual save (Cmd/Ctrl+S or "Save Draft" button)**: saves immediately and returns to the list.
- [ ] On auto-save error: "Save failed" message shown; user is not left with a silent data loss.

### Edit draft

- [ ] Navigating to a draft JE (`/accounting/journal-entries/[id]`) with draft status loads all saved values into the form.
- [ ] Editing and saving updates the existing draft (PATCH), not a new record.
- [ ] Unsaved changes trigger a `beforeunload` browser warning when navigating away.

### Post (approve)

- [ ] The "Post" button is **disabled** while Σ debits ≠ Σ credits (unbalanced).
- [ ] Clicking "Post" (or Cmd/Ctrl+Enter) opens a confirmation dialog before any mutation fires.
- [ ] Confirming post calls the API; on success, user is redirected to the posted entry's detail view.
- [ ] Posted status badge appears correctly on the detail view and in the list.
- [ ] **Cannot post to a locked period**: if the posting date falls in a locked period, the API rejects the post with a clear message. Verify the client surfaces this (not a generic error).
- [ ] Double-click / rapid re-click on "Confirm Post": only one post request fires (button disabled while in flight).

### View posted entry detail

- [ ] Posted entry detail shows: JE number, posting date, status, source, description, all lines with account code/name/debit/credit, totals, and who posted it and when.
- [ ] No Edit or Delete buttons are available on a posted entry.
- [ ] "Reverse" button is available.

### Reverse posted entry

- [ ] Clicking "Reverse" opens a dialog asking for an effective date (defaults to today; must be in an open period).
- [ ] Confirming reversal creates a **new** journal entry with mirrored lines (debits and credits swapped) and status Posted.
- [ ] The reversal entry links back to the original entry (a "Reversed by JE-XXXX" indicator appears on the original; "Reversal of JE-XXXX" on the new entry).
- [ ] The reversal entry is itself balanced (Σ debits = Σ credits).
- [ ] The original entry is marked "Reversed" in status; it is not deleted or mutated.
- [ ] **Cannot reverse into a locked period**: choosing a date in a locked period is rejected.

### Discard draft

- [ ] "Discard" button on the form opens a confirmation dialog (data loss warning).
- [ ] Confirming discard deletes the draft from the database and returns to the list.
- [ ] If the draft was never auto-saved (no draft ID yet), discard simply navigates away without an API call.

### Navigate to source document

- [ ] Auto-posted entries have a "Source document" link (e.g., Invoice #INV-001, POS receipt, Purchase Order).
- [ ] Clicking the link navigates to the correct source record in the correct module.
- [ ] If the source record has been voided or deleted, the link shows a meaningful fallback (not a 404 crash).

## 2. Accounting / domain invariants

> Cross-cutting invariants are in [`README.md`](README.md). The following are specific to journal entries.

- [ ] **Balance before post is enforced server-side:** even if the client check is bypassed (direct API call), posting an unbalanced entry must be rejected by the API.
- [ ] **Posted entries are immutable:** there is no PATCH or DELETE route that accepts a posted JE's ID. Attempt via direct API call must return 4xx.
- [ ] **Reversal is a new entry, never a mutation:** after reversing, verify the original entry's line amounts are unchanged in the database. The reversal is a distinct JE with its own sequential number.
- [ ] **JE numbers are sequential and gap-free per legal entity:** look at the list; numbers should increment without gaps. Any gap should be flagged as a potential delete of a posted entry.
- [ ] **Auto-posted entries from other modules balance:** pick 3–5 auto-posted entries (from POS, Sales, Purchase). Open each detail and verify Σ debits = Σ credits to 4 decimal places.
- [ ] **Account picker excludes inactive/header accounts:** confirm in the form UI that accounts you deactivated in COA (01) do not appear as selectable options.
- [ ] **Exchange rate stored correctly:** for a foreign-currency entry, verify the stored exchange rate matches what was entered, and that the functional-currency line amounts equal transaction-currency amounts × exchange rate (to the precision stored, typically 6 dp on the rate).
- [ ] **Memo / description persists:** the description and secondary description saved on the draft are still present after posting. They appear on the GL line.

## 3. Edge cases & defensive UX

- [ ] **All-zero amounts:** attempting to post a JE where every line is 0.00 is rejected (both client and server).
- [ ] **Negative amounts:** entering a negative debit or credit should be rejected or handled explicitly — a line should not have a negative debit as a proxy for a credit.
- [ ] **Very large amounts:** enter an amount with many integer digits and 4 decimal places; verify it stores and displays without float precision loss.
- [ ] **Posting date in the future:** confirm the API accepts or rejects future dates per configured rules; the UI should not silently coerce the date.
- [ ] **Posting date in a locked period:** entering a date in a closed period and pressing Post must be blocked — not just warned — with the locked-period message.
- [ ] **Deleting an account used in a draft line:** if COA removes an account that's in a saved draft line, opening the draft should surface a clear "account no longer available" error, not a broken picker.
- [ ] **Concurrent session edit:** open the same draft in two browser tabs; edit and save in tab 1; attempt to save in tab 2 — the second save should either merge or surface a conflict, not silently overwrite.
- [ ] **Auto-save race condition:** blur multiple fields in rapid succession; verify only one save fires at a time (`isSavingRef` guard) and the final state is correct.
- [ ] **Navigating away with unsaved lines:** the `beforeunload` warning fires if the form has any filled lines, even before the first auto-save.
- [ ] **RTL layout:** the secondary description field (`dir="rtl"`) renders correctly in both LTR and RTL locales. Debit/credit columns remain LTR (numbers are LTR in all locales).

## 4. Cross-module / integration

- [ ] After posting a manual JE, open the General Ledger (03) for one of the accounts used. The new line appears with the correct date, debit/credit, and running balance updated.
- [ ] After posting, the Trial Balance (04) for those accounts reflects the updated closing balance.
- [ ] A reversed JE cancels out in the GL: the original line and reversal line together net to zero for the affected accounts.
- [ ] Auto-posted entries from POS/Sales/Purchase appear in the list with the correct source label and link back to the originating document.

## 5. Known gaps

- No known gaps specific to this submodule at time of writing. File findings in `_findings.md`.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
