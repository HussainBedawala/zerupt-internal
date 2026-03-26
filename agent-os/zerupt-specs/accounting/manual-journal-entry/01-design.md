# Manual Journal Entry — Design

> Status: **Not implemented.** Critical UX gap — backend supports draft→posted but no frontend form.
> Route: `/accounting/journal-entries/new`

## What It Is

Form for creating adjusting entries, opening balances, and ad-hoc entries. Draft→post workflow.

## Backend

### New Endpoints

```
POST   /tenant/journal-entries          → create draft
PATCH  /tenant/journal-entries/:id      → update draft (lines, description, date)
POST   /tenant/journal-entries/:id/post → post draft (assigns entry number, validates)
DELETE /tenant/journal-entries/:id      → delete draft only
```

Permissions: `accounting.journal.create`, `accounting.journal.update`, `accounting.journal.post`, `accounting.journal.delete`

### Create Draft Payload

```ts
{
  legalEntityId: string;
  postingDate: string; // YYYY-MM-DD
  description?: string;
  descriptionAlt?: string;
  currency: string; // defaults to entity's functional currency
  exchangeRate?: string; // defaults to "1"
  lines: Array<{
    accountId: string;
    debit?: string; // XOR credit
    credit?: string;
    debitTC?: string; // XOR creditTC (for multi-currency)
    creditTC?: string;
    currency?: string; // line-level override
    exchangeRate?: string;
    taxCodeId?: string;
    description?: string;
    descriptionAlt?: string;
  }>; // min 2 lines
}
```

### Post Draft

1. Validate fiscal period for postingDate (same rules as auto-posting)
2. Validate all accounts exist, active, not headers, correct entity
3. Validate balance: `sum(debit) === sum(credit)`
4. Assign entry number via `DocNumberingService`
5. Set `status='posted'`, `source='manual'`, `postedAt`, `postedBy`
6. Emit `"accounting.journal-entry.posted"`

### Delete Draft

Only drafts can be deleted. Posted entries → must reverse.

## Frontend

### Form Layout

1. **Header section:**
   - Legal entity selector (locked after first line added)
   - Posting date picker (respects period locks — show warning for soft-locked, block hard-locked)
   - Currency selector (defaults to entity's functional currency)
   - Exchange rate field (shows only if currency ≠ functional currency)
   - Description field (bilingual: EN + AR toggle)

2. **Lines table (editable):**
   | # | Account | Description | Debit | Credit |
   - Account picker: typeahead search by code or name, filtered by entity, excludes headers
   - Debit/Credit: entering one clears the other (XOR)
   - Add line button (bottom)
   - Remove line button (per row, min 2 lines)
   - Tab navigation between cells

3. **Balance indicator:**
   - Running total: `Total Debit | Total Credit | Difference`
   - Green when balanced (difference = 0), red when unbalanced
   - Difference shown as absolute value with "DR"/"CR" suffix

4. **Action buttons:**
   - "Save Draft" — creates/updates draft, stays on page
   - "Post" — validates + posts, navigates to JE detail page
   - "Discard" — confirmation dialog → delete draft or navigate away

### Defensive UX

- Debit/Credit XOR enforced client-side (entering debit clears credit field)
- Cannot post if unbalanced (button disabled, tooltip explains)
- Period lock warning shown next to date picker (amber for soft, red for hard)
- Unsaved changes warning on navigation away
- Double-click prevention on Post button
- Account picker shows: `code — name` with hierarchy path tooltip

### Account Picker Component

Reusable `<AccountPicker>` with:
- Typeahead search by code or name (debounced 300ms)
- Filtered by: `legalEntityId`, `isActive=true`, `isHeader=false`
- Shows: `code — name (nameAlt)` with type badge
- Keyboard navigable (arrow keys, Enter to select)
- Used by: manual JE form, account mappings (future), and other modules
