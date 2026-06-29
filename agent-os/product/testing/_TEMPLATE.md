# <Module> — <Submodule> Testing Checklist

> Persona: **<who is using this — e.g. an accountant>**. Test every item as that person, with whatever dataset is loaded. Verify the *invariant*, not just that the button works.

- **Route(s):** `<url path(s)>`
- **Feature dir:** `<frontend feature path>`
- **API:** `<key endpoints>`
- **Depends on:** `<submodules that must be correct first>`

## 0. Preconditions

- [ ] Dataset loaded (imported or seeded); know roughly what it should contain.
- [ ] Logged in as a user whose role has the relevant permissions; (separately) confirm a user *without* the permission cannot reach the action.
- [ ] Relevant period/fiscal year is open (or note if testing a locked-period scenario).

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

- [ ] **<Action>** — does what it claims; success feedback shown; list/detail refreshes.
  - [ ] Loading state shown while in flight (no frozen UI, button debounced — no double-submit).
  - [ ] Error state on failure is user-friendly and does not lose entered data.
  - [ ] Empty state (no data yet) is clear and not a blank/broken screen.
- [ ] Filters / search / date-range return correct subsets; reset works.
- [ ] Pagination (if present) is correct and stable across pages.
- [ ] Export / print (if present) matches what is on screen.

## 2. Accounting / domain invariants

> The properties that MUST hold for any dataset. (Module README lists the cross-cutting ones; add submodule-specific ones here.)

- [ ] <invariant 1>
- [ ] <invariant 2>

## 3. Edge cases & defensive UX — "the dumbest thing a user could do"

- [ ] Destructive actions require confirmation; warn before data loss.
- [ ] Boundary inputs: zero, negative, very large, wrong sign, future/past dates, wrong currency/precision.
- [ ] Duplicate / double-submit / rapid re-click handled (race conditions).
- [ ] Stale data: act on something another session changed/deleted; act on a locked-period record.
- [ ] Client + server validation both reject bad input (don't trust the client).
- [ ] RTL (Arabic) + LTR render correctly; numbers/dates/currency localized.

## 4. Cross-module / integration

- [ ] Actions here that should post to the GL / affect other modules do so correctly.
- [ ] Drill-down / source-document links resolve to the right record.

## 5. Known gaps (from recon — verify or track)

- <gap, with severity>

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
