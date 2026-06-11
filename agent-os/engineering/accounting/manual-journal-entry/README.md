# Manual Journal Entry

Draft→post form for adjusting entries, opening balances, and ad-hoc entries. Creates a reusable `<AccountPicker>` component.

## Files

1. `01-design.md` — Backend endpoints, create/post flow, frontend form, defensive UX, account picker

## Key Decisions

- **Draft workflow** — save as draft (editable), then post (immutable). Allows review before commitment.
- **Separate post endpoint** — posting is an explicit action, not an update. Runs all validations.
- **Account picker reusable** — typeahead component used across modules
- **Balance enforced at UI level** — post button disabled when unbalanced, with visual indicator
- **Period lock visible** — warning shown next to date picker before user fills the form
