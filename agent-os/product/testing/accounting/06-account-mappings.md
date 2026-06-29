# Accounting — Account Mappings Testing Checklist

> Persona: **Accountant / system administrator.** They understand that every module event (POS sale, purchase receipt, stock adjustment) posts to the GL via a mapping rule. A wrong or missing mapping means wrong financial statements — they treat this screen as the wiring diagram of the accounting engine.

- **Route(s):** `/accounting/account-mappings`
- **Feature dir:** `apps/web/src/features/account-mappings/`
- **API:** `GET /tenant/account-mappings`, `PATCH /tenant/account-mappings/:id`, `POST /tenant/account-mappings/:id/toggle`, `POST /tenant/account-mappings/seed-defaults`
- **Depends on:** 01-chart-of-accounts (target accounts must exist), 15-dead-letters (missing-mapping effects observed there)

---

## 0. Preconditions

- [ ] COA seeded (at minimum: revenue, COGS, inventory, AR, AP, VAT output, VAT input, cash/bank accounts present).
- [ ] Seed defaults have been applied at least once (so the table is not empty).
- [ ] Logged in with accounting-admin or system-admin role; confirm a user without this permission cannot edit mappings (read-only view or access denied).
- [ ] Have at least one transaction in another module (POS, Sales, Purchase, Inventory) that should have generated an auto-posted JE, so the "change mapping → observe future postings" scenario can be tested.

---

## 1. Functional — actions and states

### 1.1 List view

- [ ] Page loads the full mapping list; each row shows: event type, line type, account code, account name, scope, active status, and created-at date.
- [ ] Loading state: skeleton or spinner shown while data fetches — list not blank/frozen.
- [ ] Error state: if the API call fails, a user-friendly error with a retry option is shown.
- [ ] Empty state: if no mappings exist (e.g., fresh tenant, seed not yet run), an explicit "no mappings" message is shown with a prompt to seed defaults — not a blank table.
- [ ] Pagination controls (Prev/Next) work; navigating pages does not lose the active filter.
- [ ] Total count (`meta.total`) is shown or implied by the pagination state.

### 1.2 Filters

- [ ] **Event type filter:** selecting a specific event type (e.g., `pos.sale`, `purchase.receive`, `inventory.adjustment`) returns only rows for that event. Clearing resets to all.
- [ ] **Line type filter:** filter by line type (e.g., `revenue`, `cogs`, `tax_output`) returns correct subset.
- [ ] **Scope filter:** filtering by scope (`system`, `tenant`, `warehouse`, `category`, `item`) returns only rows with that scope.
- [ ] **Active filter:** toggling to show only active (or only inactive) mappings returns the correct subset.
- [ ] Combining two filters (e.g., event type + scope) applies both; results are the intersection.
- [ ] Resetting all filters returns the full unfiltered list.

### 1.3 Edit a mapping (change target account)

- [ ] Clicking the edit (pencil) icon on a row opens the `EditMappingDialog`.
- [ ] The dialog shows the current mapping details and an account selector pre-populated with the current account.
- [ ] Changing the target account and saving: success toast shown; the table row updates to the new account code/name without a full page refresh.
- [ ] Selecting an inactive or non-existent account is prevented (the account selector only shows active accounts belonging to the entity).
- [ ] Clicking Cancel in the dialog closes it with no change to the mapping.
- [ ] While saving: button shows a loading state; dialog cannot be double-submitted.
- [ ] On API error: error message shown inside the dialog; current account code is not lost.
- [ ] After a successful edit, the `updatedAt` timestamp on the row reflects the change.

### 1.4 Toggle active / inactive

- [ ] The active toggle on a row can be switched from active to inactive and back.
- [ ] Toggle fires immediately with optimistic UI or a clear loading indicator; server error reverts the toggle.
- [ ] Deactivating a mapping shows a confirmation or at least a warning that future events of that type will have no mapping (and will land in the dead-letter queue).
- [ ] The filter for "active only" hides the row immediately after deactivation (or on next filter apply, depending on UX model — either is acceptable, but it must be consistent).

### 1.5 Seed defaults

- [ ] "Seed defaults" button opens the `SeedDefaultsDialog`.
- [ ] Dialog clearly warns that this action will overwrite all existing mappings with system defaults.
- [ ] Confirming seed: a loading state is shown; response shows `created` count, `skipped` count, and any `warnings`.
- [ ] After seeding, the mapping list refreshes and shows the default set.
- [ ] Cancelling the dialog does nothing.
- [ ] Seeding on a fresh tenant (no prior mappings): all defaults created, `skipped` = 0.
- [ ] Seeding on a tenant with existing custom edits: those edits are overwritten — confirm the row reverts to the default account.
- [ ] If warnings are returned in the response (e.g., an account code referenced in defaults does not exist in this entity's COA), the warnings are shown to the user — not silently swallowed.

---

## 2. Accounting / domain invariants

- [ ] **Coverage: every active module event has a mapping.** For each event type that should auto-post (POS sale, POS void, purchase receive, purchase return, inventory adjustment, sales invoice, credit note, payment received, payment made): at least one active mapping row exists for each line type that event generates (e.g., `pos.sale` needs `revenue`, `cogs`, `tax_output`, `cash` or `ar` line types covered).
- [ ] **Account-type correctness:** a revenue line type maps to a Revenue-type account; a COGS line type maps to a COGS/Expense-type account; a tax-output line type maps to a VAT/Tax Liability account (credit-normal); a tax-input line type maps to a VAT/Tax Asset account (debit-normal); an AR line type maps to the AR control account (asset). Mismatches here cause incorrect financial statements.
- [ ] **Scope specificity:** when multiple mappings exist for the same event/line (different scopes), the most specific scope wins (item > category > warehouse > tenant > system). Confirm this by: (a) editing the tenant-scope mapping for `pos.sale / revenue` to account X; (b) posting a POS sale; (c) verifying the GL line hits account X.
- [ ] **Future-only effect:** editing a mapping does not repost historical transactions. The GL entries already posted remain unchanged. Only transactions after the edit use the new mapping.
- [ ] **Missing mapping = dead letter, not silent skip:** deactivate a mapping for a known event type; trigger that event in the source module; confirm the posting attempt lands in the dead-letter queue (`/accounting/dead-letters`) with the event type identified, rather than being silently ignored.
- [ ] **No mapping to a wrong entity's account:** the account selector only surfaces accounts from the current legal entity's COA. Cross-entity account codes must not appear.

---

## 3. Edge cases and defensive UX

- [ ] Deactivating the last active mapping for a critical event type (e.g., `pos.sale / revenue`) — the system should warn the user that this will break auto-posting for that event.
- [ ] Two users editing the same mapping simultaneously — the second save receives a conflict response or overwrites (document which behavior is expected) — the result is not a corrupted row.
- [ ] Seeding defaults immediately after a partial seed that errored midway — idempotent, no duplicate rows created.
- [ ] Very long account names in the table do not overflow the row; they truncate with a tooltip or ellipsis.
- [ ] Arabic locale: event-type and line-type labels (if translated), account names, and dates render correctly in RTL layout.
- [ ] Scope `scopeId` displayed: for warehouse/category/item scope, the scopeId is shown alongside the scope label so an accountant can identify which warehouse/category it applies to — not just "warehouse" with no ID.

---

## 4. Cross-module / integration

- [ ] **POS sale posts to the mapped revenue account:** complete a POS transaction; open GL and confirm the revenue credit line is to the account specified in the `pos.sale / revenue` mapping.
- [ ] **Changing the revenue mapping redirects future postings:** update the `pos.sale / revenue` mapping to a different account; complete another POS transaction; confirm the new GL line is to the new account; old transaction's GL line is unchanged.
- [ ] **Dead-letter queue linkage:** deactivate a mapping, trigger the event, open `/accounting/dead-letters` — the dead-letter record references the event type that has no active mapping. Re-activating the mapping and retrying the dead letter posts it to the correct account.
- [ ] **Tax mapping consistency:** the VAT output account in the mapping matches the account used in the Tax Summary report. Run a tax report and cross-reference.

---

## 5. Known gaps (from recon — verify or track)

- **No create-custom-rule from UI (MEDIUM):** there is no "Add mapping" button. An accountant who needs a new event type or a warehouse-scope override must rely on seed-defaults or a developer action. This is a gap for multi-warehouse or multi-category setups where category-level revenue split is needed.
- **No account-type validation in the edit dialog (MEDIUM):** the account selector in `EditMappingDialog` does not enforce that the chosen account is of the correct type for the line type (e.g., it may allow mapping a `revenue` line to a Liability account). Relies on the accountant knowing what they are doing.
- **Scope scopeId not always shown (LOW):** when `scope` is `warehouse`, `category`, or `item`, the table shows the scope label but the `scopeId` value (the actual warehouse/category/item name) may not be resolved to a human-readable name — just a UUID.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
