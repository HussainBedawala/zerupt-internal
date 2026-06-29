# Accounting — Opening Balances Testing Checklist

> Persona: **Accountant / bookkeeper** migrating from a previous system. They expect the cutover balance to be exact, perfectly balanced, and impossible to post twice. They will spot a penny discrepancy.

- **Route(s):** `/accounting/opening-balances` (index), `/accounting/opening-balance` (wizard)
- **Feature dir:** `apps/web/src/features/opening-balance/`
- **API:** `POST /tenant/opening-balances`
- **Depends on:** 01-chart-of-accounts (accounts must exist), 10-fiscal-years-periods (fiscal year covering the opening date must exist and be open)

---

## 0. Preconditions

- [ ] Chart of accounts seeded with at least assets, liabilities, equity, AR control, and AP control accounts.
- [ ] A fiscal year exists that covers the intended opening date, and the period is open.
- [ ] Logged in as a user with accounting-write permission; separately confirm a read-only user cannot access the wizard.
- [ ] No prior opening balance has been posted for this entity (test both the first-time path and the re-run path separately).

---

## 1. Functional — actions and states

### 1.1 Index page (`/accounting/opening-balances`)

- [ ] Page loads and explains the two entry paths (manual wizard and Mira AI import); not a blank screen.
- [ ] Links to both `/accounting/opening-balance` (wizard) and `/import` (Mira TB import) are visible and correct.
- [ ] Empty state (no opening balance posted yet) renders clearly with a call-to-action, not a broken table.
- [ ] If an opening balance has already been posted, the index shows the posted journal entry number, asOfDate, total Dr, total Cr, and OBE balance — or a clear "already posted" indicator. (GAP: currently no GET endpoint for review — see section 5.)

### 1.2 Wizard — Step 1: Opening date

- [ ] Date picker requires a valid date; blank or future date (beyond fiscal year end) is rejected before proceeding.
- [ ] The date selected here becomes the `asOfDate` sent to the API — confirm it in the Step 3 review panel.
- [ ] Changing the date after going forward and coming back retains the new date and does not silently revert.
- [ ] Loading state shown while accounts tree is fetched after date confirmation.
- [ ] If accounts tree fails to load (network error), an error message is shown and the user can retry — not a frozen wizard.

### 1.3 Wizard — Step 2: Balance entry table

- [ ] Accounts are grouped by type (Assets / Liabilities / Equity / Revenue / Expenses) with section headers.
- [ ] Running Dr and Cr totals update on every field change; they match what Step 3 shows.
- [ ] Only leaf (postable) accounts accept input; header accounts are read-only or not shown.
- [ ] A single account cannot have both a debit and a credit value simultaneously — entering one clears the other, or the system rejects it.
- [ ] Zero-value lines are excluded from the payload (confirmed by Step 3 showing only non-zero lines).
- [ ] Very large amounts (e.g., 9 digits before the decimal) and 4-decimal values are accepted and displayed correctly.
- [ ] Negative amounts are rejected client-side with a clear message (use Dr vs Cr to express direction).
- [ ] Decimal precision: enter 1234.5678 — confirm it is not rounded or truncated.
- [ ] The "Review" button is disabled until at least one non-zero balance line exists.

### 1.4 Wizard — Step 3: Review and post

- [ ] Review panel lists every non-zero line with account code, account name, Dr, and Cr columns.
- [ ] Totals row shows Σ Dr and Σ Cr; they match Step 2 running totals exactly (to the cent).
- [ ] OBE indicator is GREEN with "Balanced" when Σ Dr = Σ Cr.
- [ ] OBE indicator is AMBER with the difference amount and direction (Dr/Cr) when not balanced; the `obeWarning` message is shown below.
- [ ] The "Post" button is present whether balanced or not (OBE goes to Opening Balance Equity / Suspense account when unbalanced — system handles it server-side).
- [ ] Clicking "Post" opens a confirmation dialog (AlertDialog) — not an immediate post.
- [ ] Confirmation dialog describes the consequence (irreversible); Cancel returns to review without posting.
- [ ] While posting: spinner shown on the button; button is disabled; Cancel is also disabled; no double-submit on rapid clicks.
- [ ] On success: the posted journal entry number (`entryNumber`) and totals (`totalDebit`, `totalCredit`, `obeBalance`, `obeDirection`) from the API response are displayed or the user is routed to the success state.
- [ ] On API error: the error message from the response is shown in the `postError` banner (not "Something went wrong"); entered data is not lost.
- [ ] After a successful post, navigating back to the wizard or index shows the posted state — the "Post" button is not available again.

### 1.5 Mira AI import path (`/import` — TB import)

- [ ] COA preview step shows the accounts parsed from the uploaded file before committing.
- [ ] Subledger preview shows AR and AP lines broken down by party (customer/supplier).
- [ ] Journal preview shows the balanced opening entry before commit — Dr total = Cr total (with OBE to Suspense if needed).
- [ ] User must explicitly confirm ("Commit") after reviewing all three previews; no silent auto-post on upload.
- [ ] Re-uploading the same file (same `apply_claim_key`) does not create a second journal entry — idempotency guard fires and the user is informed.
- [ ] Uploading a file with a different date from an already-posted opening balance is rejected or warned, not silently applied.

---

## 2. Accounting / domain invariants

- [ ] **Opening entry balances:** Σ Dr = Σ Cr in the posted journal entry. If the user's input is unbalanced, the system posts the difference to the Opening Balance Equity (OBE) / Suspense account (account type Equity or a dedicated Suspense account) and the final JE still balances. Verify by looking up the posted JE in General Ledger.
- [ ] **OBE / Suspense used correctly:** when the wizard posts an unbalanced entry, `obeBalance` is non-zero and `obeDirection` is "debit" or "credit"; a line to the OBE account appears in the GL with the matching amount and opposite direction. If the entry was balanced, `obeDirection` = "zero".
- [ ] **Opening date as cutover:** all GL account balances as of `asOfDate - 1 day` are zero (or match any prior system); the opening JE lands exactly on `asOfDate`. Run a Trial Balance for `asOfDate` and confirm each account's balance equals the entered amount.
- [ ] **Cannot post twice:** attempting to POST a second opening balance (same entity) returns a 409 / conflict error — not a silent duplicate. The existing JE is unaffected.
- [ ] **Subledger-to-control tie (import path):** after importing via Mira, the AR aging total as of `asOfDate` equals the AR control account balance; likewise for AP. Run checklists 08 and 03 to verify.
- [ ] **Immutability:** the posted opening JE appears in the Journal Entries list as "posted" and has no Edit or Delete button — only Reverse (which requires a separate action).
- [ ] **Period check:** if the fiscal period covering `asOfDate` is closed, the API rejects the post with a clear "period closed" error.
- [ ] **Functional currency only:** all entered amounts are in the entity's functional currency (`baseCurrency`). If the entity's currency is not USD, confirm the currency label in the wizard matches and amounts are not silently converted.
- [ ] **Account belongs to entity:** accounts shown in the entry table all belong to the selected legal entity's COA; no cross-entity account leakage.

---

## 3. Edge cases and defensive UX

- [ ] Go back from Step 2 to Step 1, change the date, go forward again — confirm the entry table is not stale (dates that affect fiscal period must re-validate).
- [ ] Enter balances, navigate away mid-wizard without posting — the wizard does not auto-save a partial entry to the GL.
- [ ] Enter the same account on two lines (not possible in this UI since each account appears once, but verify the table does not allow duplicate rows).
- [ ] Post with all zero amounts — "Post" button should remain disabled (`hasAnyBalance` guard).
- [ ] Very fast double-click on "Post Confirm" — only one POST fires (button disabled during flight).
- [ ] Upload a TB file that is completely unbalanced (all assets, no liabilities/equity) — the OBE account absorbs the difference; the final JE is still balanced.
- [ ] Arabic locale: account names in the entry table display in Arabic where `accountNameAlt` is set; Dr/Cr labels, currency codes, and number formatting follow the locale.
- [ ] RTL layout: the balance entry table columns (Account / Dr / Cr) reflow correctly in RTL; numbers remain left-to-right (LTR isolation).
- [ ] Mobile viewport: the Step 2 table is scrollable horizontally, not clipped.

---

## 4. Cross-module / integration

- [ ] After posting, open `/accounting/general-ledger` and filter by the opening date — every account with a non-zero opening balance has a matching GL line linked to the opening JE number.
- [ ] Open `/accounting/trial-balance` with `asOfDate` as the end date — each account balance matches the entered opening amount.
- [ ] Open `/accounting/journal-entries` — the opening JE appears with the correct entry number, is marked "posted", and the line count matches `lineCount` from the API response.
- [ ] If a subledger opening was entered via Mira: `/reports/ar-aging` as of `asOfDate` total equals the AR control account balance from the GL.

---

## 5. Known gaps (from recon — verify or track)

- **No UI to view a posted opening balance (MEDIUM):** `POST /tenant/opening-balances` is write-only; there is no `GET` endpoint and no index screen that shows the already-posted entry with its lines. An accountant who wants to verify what was posted must go through the Journal Entries screen. Track as a usability gap.
- **Two separate routes for one concept (LOW/MEDIUM):** the wizard lives at `/accounting/opening-balance` (singular) but the index is `/accounting/opening-balances` (plural). The Mira import path is at `/import`, which is not obviously part of the accounting opening-balance flow from the sidebar. Discoverability is low for non-technical users.
- **No line-level edit after review (LOW):** once on Step 3, the only way to change a balance is to go back to Step 2. There is no inline edit on the review screen.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
