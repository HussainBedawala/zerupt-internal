# Accounting — Chart of Accounts Testing Checklist

> Persona: **Accountant.** You are setting up and maintaining the COA for a live legal entity. Every account code, type, and hierarchy directly affects how every other module posts — errors here corrupt every downstream report.

- **Route(s):** `/accounting/chart-of-accounts`
- **Feature dir:** `features/accounts/`
- **API:** `GET /tenant/accounts/tree`, `GET /tenant/accounts`, `POST /tenant/accounts`, `PATCH /tenant/accounts/:id`, `DELETE /tenant/accounts/:id`, `GET /tenant/accounts/suggest-code`, `GET /tenant/accounts/cash-bank`, `POST /tenant/accounts/seed-template`, `POST /tenant/accounts/bulk`
- **Depends on:** Legal entity and fiscal year must exist. Run this checklist before Journal Entries (02).

## 0. Preconditions

- [ ] Logged in as a user with `accounting:write` permission; confirm that a user with only `accounting:read` cannot see Add / Edit / Delete controls (server rejects the mutation, not just hidden in UI).
- [ ] Know what accounts your dataset should contain (either seeded from a template or imported from a trial balance). Count the rough number of accounts per type so anomalies are obvious.
- [ ] At least one legal entity is selected in the entity switcher.

## 1. Functional — actions & states

### Tree view (expand/collapse)

- [ ] **Tree loads** — all accounts for the selected legal entity appear grouped under their parent nodes.
  - [ ] Loading state: spinner or skeleton shown; tree is not blank/broken mid-load.
  - [ ] Error state: API failure shows a human-readable message, not a raw stack trace or blank screen.
  - [ ] Empty state: if no accounts exist, an empty-state prompt (not a broken tree) is shown, ideally with a "Seed from template" call to action.
- [ ] Expanding a parent node reveals its children. Collapsing hides them. State survives a filter/search round-trip.
- [ ] Leaf accounts (no children) have no expand toggle; parent/header accounts are visually distinguished.

### Search by name or code

- [ ] Typing in the search box filters the tree to matching accounts and their ancestors (so context is preserved).
  - [ ] Partial code match (e.g. "11") shows all accounts whose codes start with or contain "11".
  - [ ] Partial name match is case-insensitive.
  - [ ] Clearing the search restores the full tree.
- [ ] No results state is a clear "No accounts found" message, not a blank panel.

### Filter by type

- [ ] Selecting a type filter (Asset / Liability / Equity / Revenue / Expense) shows only accounts of that type.
- [ ] Combining type filter + search works correctly.
- [ ] "All types" / reset restores full tree.

### Add account

- [ ] Clicking "Add account" opens the account dialog.
  - [ ] **Auto-suggest next code**: the code field pre-fills with the suggested next code for the selected type and parent; the placeholder shows "Suggesting…" while the API call is in flight.
  - [ ] User can override the suggested code; validation enforces numeric-dot format (`/^[0-9]+(\.[0-9]+)*$/`, min 3 chars, max 30).
  - [ ] Duplicate code rejected with a clear message (server-side check, not just client).
  - [ ] Type dropdown shows all five types; subType dropdown updates to valid options for the selected type.
  - [ ] `isHeader` checkbox creates a non-postable parent account; `isContra` marks contra accounts.
  - [ ] Cash flow category and currency code are optional; blank currency means functional currency.
  - [ ] Both primary name and secondary name (bilingual) fields accept input; `dir="auto"` on the secondary field renders RTL Arabic correctly.
  - [ ] Submit button is disabled while save is in flight (no double-submit).
  - [ ] On success: dialog closes, tree refreshes, new account appears in the correct position.
  - [ ] On API error: dialog stays open, error message shown inline, entered data preserved.
- [ ] Adding a child account (from a parent node's context menu): parent is pre-populated and locked; type inherits from parent; code suggestion scoped to parent.

### Edit account

- [ ] Clicking Edit on an existing account opens the dialog pre-populated with current values.
- [ ] Code and type fields are **disabled** in edit mode (only name, secondary name, cash flow category, currency editable).
- [ ] System accounts show a warning banner; they can still be renamed but their type/code cannot change.
- [ ] Saving with no changes is harmless (no spurious mutation call).
- [ ] On success: dialog closes, tree node updates in place without full reload.

### Delete / deactivate

- [ ] Attempting to delete an account that has posted journal entry lines is rejected with a clear message ("Account has transaction history — deactivate instead").
- [ ] Deleting an account with no history succeeds after a confirmation dialog.
- [ ] Deactivating an account (soft-delete) removes it from the account picker in journal entry forms but it still appears in the COA tree (visually marked inactive) and in historical reports.
- [ ] Deleting a parent account that still has children is blocked until children are removed or re-parented.

### Export CSV

- [ ] CSV export button triggers a download.
- [ ] Downloaded file contains all accounts visible in the current filter/search state (not just one page).
- [ ] Columns include at minimum: code, name, secondary name, type, subType, isHeader, isContra, active status.
- [ ] Numeric codes render as text in the CSV (no Excel scientific notation).

### Seed from template

- [ ] Selecting country + industry and confirming seed populates the COA with the correct accounts for that overlay (GCC VAT accounts appear for GCC, TDS accounts for India).
- [ ] Seeding on a **non-empty** COA does not create duplicate codes — the API merges or skips existing codes.
- [ ] Seeding does not clobber custom accounts the user already added.
- [ ] Loading indicator shown during seed; result summary (accounts created vs skipped) displayed.

## 2. Accounting / domain invariants

> Cross-cutting invariants are defined in [`README.md`](README.md). The following are specific to the COA.

- [ ] **Code uniqueness per legal entity:** no two active accounts share the same code within a legal entity. Attempting to create a duplicate is rejected server-side.
- [ ] **Type → normal balance mapping:** Asset and Expense accounts are debit-normal; Liability, Equity, and Revenue accounts are credit-normal. Verify the `balance-indicator` component and any balance display in the tree reflect this correctly.
- [ ] **Parent/child type consistency:** a child account's type matches its parent's type (e.g., a Revenue parent cannot have an Asset child). The API enforces this; the UI should surface the rejection clearly.
- [ ] **Header accounts are non-postable:** accounts with `isHeader = true` must not appear in the account picker in journal entry forms. Verify they are excluded from `GET /tenant/accounts/cash-bank` and any picker endpoint.
- [ ] **Control accounts exist and are correctly typed:** confirm the COA contains at minimum — AR receivables account (Asset), AP payables account (Liability), Inventory account (Asset), VAT output (Liability), VAT input (Asset), Retained Earnings (Equity). Verify their types are correct.
- [ ] **Contra accounts carry opposite normal balance:** an account flagged `isContra = true` under Assets (e.g., Accumulated Depreciation) carries a credit normal balance. Confirm reports and balance indicators treat it correctly.
- [ ] **Tenant isolation:** every account returned by the tree API belongs to the currently selected legal entity. Switch to a second legal entity (if available) and verify a completely separate COA is shown.

## 3. Edge cases & defensive UX

- [ ] **Blank name:** submitting the form with an empty name is blocked client-side and server-side.
- [ ] **Very long name:** a name at the 200-character limit saves and displays correctly (no truncation bug in the tree node).
- [ ] **Code with leading zeros:** code `001` is valid per the regex; verify it is not coerced to `1` anywhere.
- [ ] **Invalid code formats:** `abc`, `1.`, `.1`, `1..2` are all rejected by the client-side regex before the API is called.
- [ ] **Rapid double-click on Save:** only one create request fires (submit button disabled on first click).
- [ ] **Deleting an account another session just posted to:** API returns a clear conflict error; the UI surfaces it without crashing.
- [ ] **Switching legal entities mid-edit:** if the entity switcher changes while the dialog is open, the dialog either closes or re-validates against the new entity's COA.
- [ ] **RTL rendering:** account names in Arabic render right-to-left in the tree; code numbers remain LTR. The `dir="auto"` attribute on secondary name fields is present.
- [ ] **Large COA (500+ accounts):** tree renders without hang; search still feels instant (client-side filter).

## 4. Cross-module / integration

- [ ] Accounts created here appear immediately in the account picker (`AccountPicker` component) in the Journal Entry form.
- [ ] Deactivated accounts no longer appear in the account picker for new lines but still appear in GL/TB for historical data.
- [ ] Control accounts (AR, AP, Inventory, VAT) used by other modules (POS, Sales, Purchase) match the accounts configured in Account Mappings (`/accounting/account-mappings`). Mismatches cause silent mis-posting.
- [ ] After seeding from template, run the Trial Balance (04) to confirm totals are zero (no seed process should create opening balances).

## 5. Known gaps

- No known gaps specific to COA at time of writing. File any findings in `_findings.md`.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
