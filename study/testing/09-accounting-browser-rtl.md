# Phase F — Browser + RTL verification, accounting module

Logged in as `accountant1` (permission-sensitive checks) unless noted. Owner login was not used for
any conclusion in this report. Dev server responded in ~0.5-1.1s per request throughout (cache
clear held).

Ledger gate (status-aware): `0.000000` before AND after this pass. No documents were created or
modified; the one manual-JE draft opened during testing was Discarded, never saved, so
`_documents-created.md` has nothing to log.

## Coverage

Of the 24 listed screens, **13 of 24 were opened and read in English**, **10 of those 13 also
compared in Arabic**. Not reached in the time available: `bank-reconciliation/new`, `bank-reconciliation/:id`,
`cheques/:id`, `close-management/:id` (reached, see below), `fiscal-years` deep interactions,
`journal-entries/:id`, `opening-balance` (singular, distinct from `opening-balances`),
`opening-balances/new`, `opening-balances/import`. This is a partial pass, not a full 24-screen
sign-off — see Gaps.

## Per-screen table

| Screen | EN OK | AR OK | RTL logical props | 3dp money | States | Notes |
|---|---|---|---|---|---|---|
| account-mappings | Yes | Yes | Not deep-checked | N/A (no money col) | Loaded, 176 rows paginated | Breadcrumb translated correctly |
| amendments | Yes | Partial | Not deep-checked | N/A | Empty state ("Every correction finished cleanly") is a real, honest empty state | **Breadcrumb segment "Amendments" not translated in AR** (see findings) |
| audit-trail (`/settings/audit`) | Yes | Not checked | Not checked | N/A | Loaded, "Load more" pagination | Shows short id fragments (`#cef72a21…`) for some event types |
| bank-reconciliation | Yes | Not checked | N/A | N/A | Feature-flagged "coming soon", honest copy, no dead end | Matches briefed context (accountant1 403 on matching elsewhere, not re-tested) |
| bank-reconciliation/new, /:id | Not reached | — | — | — | — | Gap |
| chart-of-accounts | Yes | Yes | Nav mirrors to right in RTL (confirmed via bounding rect) | Yes (10,252,531.451) | Loaded | ZZTEST probe accounts visible as expected, ignored |
| cheques | Yes | Yes | Not deep-checked | Yes (7.500 KWD etc.) | **Totals widget error, self-heals on retry** (finding below) | List loads fine even while totals widget errors |
| cheques/:id | Not reached | — | — | — | — | Gap |
| close-management | Yes | Yes | Not deep-checked | N/A | "In progress" close correctly shown, honest "This close was reopened" banner | |
| close-management/:id | Yes (drilled in) | Not checked | Not checked | N/A | Task list with correct segregation-of-duties gating | accountant1 blocked from signing off 3 of 7 tasks ("waiting for someone to review it") — by design, not a bug |
| dead-letters | Yes (direct nav, no nav entry — as briefed) | Yes | Not deep-checked | N/A | Shows 4 failed postings with retry | Error text exposes a raw account UUID (finding, LOW) |
| fiscal-years (`/settings/fiscal`) | Yes | Not checked | Not checked | N/A | Full period timeline rendered | |
| fx-revaluation | Yes | Yes | Not deep-checked | N/A (KWD-only tenant, "Nothing to update") | Correct empty state, explains why | **Breadcrumb segment "Fx Revaluation" not translated in AR** (finding) |
| general-ledger | Yes | Yes | No body horizontal scroll at 375/768/1280/1920 | N/A (no data generated) | Requires account selection to generate; no default account pre-selected | |
| journal-entries | Yes | Yes | No body horizontal scroll at any breakpoint; table has its own `overflow-x-auto` container | Yes (KWD 3dp; AED shown correctly as 2dp for FX lines, expected) | List loads, 155 entries, filters present | |
| journal-entries/new | Yes | Not checked | Not checked | Footer summary format N/A (see below) | Form pre-fills date/currency/legal entity | See click-count analysis below |
| journal-entries/:id | Not reached | — | — | — | — | Gap |
| opening-balance (singular) | Not reached | — | — | — | — | Gap — distinct route from `opening-balances` |
| opening-balances | Yes | Yes | Not deep-checked | Yes (1,500.000 etc.) | 4 posted OB journals shown by document number, 637 lines | No raw UUIDs — all shown as OB-0001 / OB_AR-0001 / OB_AP-0001 / OB_INV-0001 |
| opening-balances/new, /import | Not reached | — | — | — | — | Gap |
| trial-balance | Yes | Yes | Nav/table mirror confirmed | Yes (10,281,953.738) | "No data" empty state until date entered; "Balanced" status shown after generate | As-of date NOT defaulted to today (finding) |

## Findings

### MEDIUM — cheques totals widget fails intermittently, self-heals on retry (CONFIRMED)
On `/en/accounting/cheques` as accountant1, the page loaded with: "Could not load the cheque
totals, so nothing is shown here rather than a figure that may be wrong." with a "Try again"
button, while the cheque list itself loaded and rendered correctly below it. Clicking "Try again"
immediately resolved it — the totals widget then loaded normally. This is good defensive UX (no
fake number shown, actionable retry, no dead end) but the underlying transient failure on this
widget specifically is worth a look.
Screenshot: `study/testing/f-browser-cheques-error-en.png`

### LOW — Arabic breadcrumb leaves two segment labels untranslated (CONFIRMED)
- `/ar/accounting/amendments` renders the breadcrumb as "المحاسبة/Amendments" — the trailing
  segment stays in English while the page title/body below it ("تصحيحات متوقفة") is fully
  translated.
- `/ar/accounting/fx-revaluation` renders "المحاسبة/Fx Revaluation" the same way, while the page
  content is correctly translated ("قيمة الأرصدة بالعملات الأجنبية" / "إعادة تقييم العملات").
This is a real, if narrow, i18n gap that escaped the lint guard because it is presumably a
missing translation key on the breadcrumb/nav-label layer specifically, not the page content
layer. Screenshot: `study/testing/f-browser-amendments-breadcrumb-untranslated-ar.png`

### LOW — raw account UUID surfaced in a user-facing error message (CONFIRMED)
`/en/accounting/dead-letters` shows, verbatim: "Journal line 2 (account
ccc4c4b5-5614-4e19-ad4e-99e0af15691d): this account is not a party sub-ledger, so the line must
not carry a party." This is an internal account UUID, not an account code/name, shown to the
(admin/accountant) user reading the failed-postings screen. Lower severity than a document-number
UUID because this screen is explicitly an internal-ops/technical screen, but it still violates
plain-language guidance and would be one line to resolve to an account code+name at the point the
error is generated.

### FRICTION — trial-balance and general-ledger require the user to type a date/account with no default (SUSPECTED not a bug, but a genuine friction/defaults gap)
On `/en/accounting/trial-balance`, the "As of date" field is empty on load and the Generate
button stays disabled until a date is typed — "today" would be a safe, always-available default
per the "Defaults over questions" standard, since the system already knows the current date (it
is used elsewhere on the same page, e.g. "Selected Date: August 30, 2026" appears only after the
user fills it in). Same pattern on `general-ledger`'s Account combobox, which has no default.
Neither blocks the user, but both cost an extra unnecessary interaction on the two
highest-traffic accounting reports.

### Retracted (do not carry forward): "stale total debit" on journal-entries/new
While testing the manual-JE flow, I twice saw the page's "Total Debit / Total Credit / Difference"
footer stay at 0.000 after typing amounts. I initially treated this as a CRITICAL calculation bug,
but on isolating the cause with `Post Entry`, the app returned a correct client-side validation
error: "Line 1 has an amount but no account. Pick an account, or clear the amount." — meaning my
keyboard-driven combobox selection had not actually registered an account in form state (a real
combobox selection made via genuine click, done earlier in the same session, DID update the
totals footer correctly to 10.000). I could not get a reliable mouse-click account selection
through the headless browser tool for this specific Radix combobox (clicks on the option
timed out repeatedly, including via a JS `.click()`), which points to a testing-tool limitation
against this exact widget, not a confirmed product defect. Flagging this as a **gap**, not a
finding: someone with a real mouse should independently verify the account combobox on
`journal-entries/new` selects reliably. If it does, the totals footer works correctly (I have one
clean successful example of it computing 10.000 correctly after a real account selection).

## Manual journal entry — click/dialog/field count (founder's standard)

Structural walk of `/accounting/journal-entries/new` as loaded, before I hit the combobox
automation limitation above:
- Posting Date: **defaulted** to today.
- Currency: **defaulted** to KWD.
- Legal Entity: **defaulted**, shown read-only as "Gulf Auto Parts" (single-entity tenant).
- Exchange Rate: **defaulted** to 1, auto-set from posting date.
- Description: one free-text field, not required to see totals update.
- Two journal lines pre-seeded (the minimum valid entry), each needs: pick account (1 click +
  type-ahead or scroll + 1 click), optional line description, one amount (debit OR credit).
- One final click: "Post Entry" (single confirm, no second dialog observed).

Minimum interactions for a balanced 2-line manual JE: **2 account picks + 2 amount fields + 1 Post
click = 5 required interactions**, with date/currency/entity already defaulted. No stacked dialogs
were seen; posting appears to be a single-step action (Post Entry), consistent with "no
unnecessary draft stage" — Save Draft exists but is optional, not forced.

**Could an untrained Kuwaiti shop owner's bookkeeper do this on the first try?** Marginally, but
this is inherently an accountant-only task (manual journal entries are a professional
bookkeeping action, not a shop-owner action), so the bar here is "an accountant" not "a shop
owner," and by that bar: yes — the field set is minimal, defaults are correct, account search is
type-ahead, and the language is plain (e.g. the validation message quoted above says exactly
what to fix). The one friction point is that the account combobox did not visibly confirm
selection in a way that was easy to verify at a glance in my testing — worth a native-mouse spot
check.

## Period close — click count (founder's standard)

Reached `/accounting/close-management` → drilled into the in-progress "Monthly close" for August
2026 (1 click from the list). The close checklist showed 7 tasks, 4 already "Complete" (Reconcile
bank accounts, Review suspense accounts, Run FX revaluation, Review accruals & prepayments,
each with a "Reopen" action) and 3 "Awaiting review" (Reconcile AR/AP sub-ledger, Drain the
accounting queue, Lock period) that **accountant1 could not sign off** — the page states
plainly: "waiting for someone to review it... Ask a manager or the account owner to review them."
This is correct segregation-of-duties behavior (a bookkeeper cannot self-approve the final lock),
not a bug, but it means the close flow's last 3 steps could not be completed or click-counted
end-to-end under accountant1 in this pass. The close screen also honestly surfaced "This close
was reopened / the sign-offs were cleared" rather than hiding that state.

**Could an untrained bookkeeper close a period on the first try?** For the parts accountant1 could
reach: yes — one click into the close, a flat checklist with plain task descriptions ("Match all
bank statement lines to journal entries for the period," "Confirm no accounting events for this
period are still queued, failed or dead-lettered. Open Accounting > Dead letters..."), each task
tells you exactly where to go and what "done" looks like. The manager-gated final steps are, by
design, not something a bookkeeper alone should complete — that's correct, not a gap.

## Kuwait no-tax check

No VAT/tax UI was seen on any screen reached (trial-balance, chart-of-accounts, cheques,
journal-entries, opening-balances, fx-revaluation, close-management, account-mappings,
dead-letters). One note, not a UI finding: the chart-of-accounts and account-mappings screens do
reference tax-named GL accounts in their data ("Output Tax Payable" 2131, "Input Tax Recoverable"
1162, "Tax you charged the customer" mapping row) as dormant template rows — these are backend
account records, not visible tax UI/inputs presented to the user for entry, so they do not violate
the "hide tax in no-tax countries" rule as tested. Not independently verified whether any of these
accounts ever accrue a nonzero balance in this tenant.

## Em dashes

No em dashes (—) found in any captured screen text across the English sweep.

## Gaps (be honest)

- 11 of 24 listed screens/sub-routes were not reached at all: `bank-reconciliation/new`,
  `bank-reconciliation/:id`, `cheques/:id`, `journal-entries/:id`, `opening-balance` (singular),
  `opening-balances/new`, `opening-balances/import`, plus deeper interaction (search, sort,
  per-filter combinations, pagination-unmount checks, keepPreviousData flicker checks) on almost
  every screen that WAS reached.
- Deep RTL "logical properties only" auditing (inspecting individual computed
  `margin-left`/`padding-right` on specific elements) was only done via layout-mirroring spot
  checks (nav position, page dir), not an exhaustive per-element CSS audit.
- The account-combobox interaction failure on `journal-entries/new` (see Retracted section above)
  means the manual-JE flow was not verified end-to-end to actual posting; the click count is
  structural, not from a completed live submission.
- No deliberate bad-filter/error-trigger test was performed (e.g. malformed date range) beyond the
  cheques totals widget's own transient failure, which I did not induce — it happened on first
  load.
- Pagination-unmount and keepPreviousData-flicker checks (item 8 in the brief) were not
  performed — out of time budget for this pass.
- Responsive checks (375/768/1280/1920) were done for horizontal-overflow only, on the three
  named highest-traffic screens; visual regression at 768/1920 was not screenshotted, only
  measured.

## Screenshots saved

- `f-browser-trial-balance-en.png`, `f-browser-trial-balance-ar.png`
- `f-browser-journal-entries-en.png`, `f-browser-journal-entries-375.png`
- `f-browser-je-total-debit-stale.png`, `f-browser-je-total-stale-2.png` (kept as evidence for the
  retracted finding — both are genuine screenshots, not blank, showing the DOM/state mismatch I
  investigated and then explained)
- `f-browser-close-management-detail-en.png`
- `f-browser-cheques-error-en.png`
- `f-browser-amendments-breadcrumb-untranslated-ar.png`

None were blank; none were discarded.

## Completion pass (screens 14-24)

Logged in as `accountant1` throughout (session was lost once mid-pass when the browse daemon
restarted; re-authenticated as `accountant1` before continuing, confirmed via the user-menu email
`accountant1@gulf-auto-parts-mt5kya1i.zerupt.local` before resuming any checks). Ledger gate
(status-aware): `0.000000` before AND after this pass. No documents created, edited, voided, or
imported; the opening-balance import wizard was opened and inspected (tabs, date field, dating
combobox) but "Read the file"/"Post" was never clicked and no file was uploaded.

### Per-screen table

| Screen | EN | AR | RTL logical props | 3dp money | States | Notes |
|---|---|---|---|---|---|---|
| bank-reconciliation/new | Yes | N/A (redirects) | N/A | N/A | Feature-flagged "coming soon" | URL collapses to `/accounting/bank-reconciliation`; same honest copy as the list route, no dead end |
| bank-reconciliation/:id | Yes | N/A (redirects) | N/A | N/A | Same "coming soon" page | Loading a real statement id (`76efb261…`) also collapses to the same feature-flag page — confirms the whole reconciliation sub-tree is gated, not just the list |
| cheques/:id | Yes | Yes | `dir=rtl` confirmed; labels/values right-align, breadcrumb reads Accounting > Cheques > doc# in both locales | Yes (7.500 KWD) | Loaded directly, all fields populated | Breadcrumb shows the real document number `ZZTEST-CHQ-VERIFY-075753`, not a UUID, in both locales — good |
| journal-entries/:id | Yes | Yes | `dir=rtl` confirmed | Yes (2.500/2.500 KWD, balanced) | Loaded directly, full detail incl. audit metadata | Breadcrumb correctly translated ("قيود اليومية"), unlike the amendments/fx-revaluation breadcrumb bug found in the prior pass. One narrow untranslated fragment: "Fiscal Period **Aug 2026**" stays in English inside the AR page (see finding below) |
| opening-balance (singular) | Yes | N/A (redirects) | N/A | N/A | Confirmed | `permanentRedirect` confirmed live: `/accounting/opening-balance` → `/accounting/opening-balances/new` (URL changes, content matches the `/new` screen exactly) |
| opening-balances/new | Yes | Yes | `dir=rtl` confirmed | N/A (no entry form reached, see notes) | Correct guard state | Since 4 OB journals already exist, the form does not render an entry UI at all — it shows "Opening balances are already set up... post a correction instead" with links to view/correct. This is a deliberate, well-built guard against double-posting the protected OB journals. Fully translated in AR incl. breadcrumb "الأرصدة الافتتاحية" / "جديد" |
| opening-balances/import | Yes | Yes | `dir=rtl` confirmed; nav sidebar bounding-rect confirmed mirrored (left:1216/right:1280 of a 1280px viewport); tab list and combobox render correctly in AR | N/A (no data submitted) | 5-tab wizard (Trial Balance / Money Customers Owe / Money You Owe / Opening Stock / Tie out) all present and translated; "Read the file" correctly disabled with no file chosen | **"Opening date" field has no default** (empty on load) — same defaults gap class as trial-balance/general-ledger from the prior pass. Dating combobox opened correctly with both AR options ("بداية السنة المالية" / "تاريخ داخل السنة"). Spot-checked computed styles across h1/h2/button/td/th for any inline physical (`style.marginLeft/Right`, `style.left/right`) — none found on this screen |
| audit-trail (AR backfill) | (prior pass) | Yes | `dir=rtl` confirmed | N/A | Loaded, same event feed as EN | Nearly fully translated ("سجل النشاط", filters, event descriptions) but one entity-type label stays in English mid-sentence: "accountant1 تم حذف **Auth Session** #3790ee33…" (see finding below) |

### Findings

#### LOW — untranslated entity-type label "Auth Session" inside an otherwise-Arabic audit-trail sentence (CONFIRMED)
`/ar/settings/audit` renders event descriptions like `accountant1 تم حذف Auth Session #3790ee33…`
("accountant1 deleted Auth Session #...") — the verb and everything else is Arabic, but the
entity-type name "Auth Session" is hardcoded English. Same shape as the prior pass's breadcrumb
finding (a label layer, not the page-content layer, escaping the i18n guard) but on the
audit-event-type labels specifically. Screenshot: `study/testing/f2-browser-audit-trail-ar.png`

#### LOW — untranslated "Fiscal Period Aug 2026" value on journal-entries/:id in Arabic (CONFIRMED)
`/ar/accounting/journal-entries/7bf7b83c-f599-4fc1-98ed-78111fa6e2ac` renders the metadata line as
`... الفترة المالية Aug 2026 العملة KWD ...` — the label "الفترة المالية" (Fiscal Period) is
translated but the period value itself ("Aug 2026") is not localized to Arabic month formatting,
while every other date on the same page (posting date, created/posted timestamps) IS correctly
localized (e.g. `٣٠ أغسطس ٢٠٢٦`). Narrow, cosmetic, but a real parity gap on a fully-translated
page otherwise. Screenshot: `study/testing/f2-browser-journal-entry-id-ar.png`

#### Confirms prior finding — bank-reconciliation is honestly feature-flagged end-to-end (CONFIRMED, no new severity)
Both `/accounting/bank-reconciliation/new` and `/accounting/bank-reconciliation/:id` (a real
statement id) collapse server-side/client-side to the same "coming soon" page shown for the list
route in the prior pass. No broken form, no dead end, no partial UI leak. Not a finding, stated
here for completeness of coverage.

#### Confirms defaults gap pattern — opening-balances/import's date field has no default (SUSPECTED, same class as prior FRICTION finding)
Consistent with the prior pass's trial-balance/general-ledger finding: "Opening date" on the
Trial Balance tab of the import wizard is blank on load with no default, even though this is a
setup-time-only screen where the system could reasonably suggest "yesterday" or leave it required
by nature (dates here are inherently historical/user-known, so this is a much weaker instance of
the pattern than trial-balance's "as of date" — flagging as informational, not urging a fix).

### Coverage of the 7 target screens

All 7 reached in both locales (bank-reconciliation/new and /:id only have one locale-agnostic
"coming soon" state, so AR is marked N/A rather than untested — the feature-flag banner was not
re-verified in AR specifically since there is no localized content to differ; this is a minor
residual gap, noted honestly below).

### Gaps remaining (be honest)

- Bank-reconciliation/new and /:id were NOT separately re-verified in `/ar/` — since both collapse
  to the same feature-flagged page as the EN list route (already checked AR in the prior pass for
  the list route itself), the marginal risk is low, but a literal AR fetch of these two exact URLs
  was not repeated.
- The account-combobox mouse-click gap on `journal-entries/new` (retracted CRITICAL from the prior
  pass) is still an open gap — not touched in this pass, still needs a real-mouse spot check.
- Deep per-element computed-style RTL audits (beyond the sidebar bounding-rect + `dir` attribute +
  one inline-style spot check) were not performed on cheques/:id or journal-entries/:id
  specifically.
- No deliberate error state was triggered on any of the 7 screens this pass (e.g. malformed
  opening-balance import file, or a nonexistent id on cheques/:id or journal-entries/:id) — only
  the happy-path detail views and the wizard's initial state were exercised.
- AR backfill for the prior pass's 13 screens was only done for one screen (audit-trail); the
  other AR-untested screens from that pass (`amendments` partial, `fiscal-years`,
  `journal-entries/new`, `close-management/:id`) remain AR-unverified.

### Screenshots saved (this pass)

- `f2-browser-bank-reconciliation-id-en.png`
- `f2-browser-cheque-id-en.png`, `f2-browser-cheque-id-ar.png`
- `f2-browser-journal-entry-id-en.png`, `f2-browser-journal-entry-id-ar.png`
- `f2-browser-opening-balances-new-en.png`, `f2-browser-opening-balances-new-ar.png`
- `f2-browser-opening-balances-import-en.png`, `f2-browser-opening-balances-import-ar.png`
- `f2-browser-audit-trail-ar.png`

None were blank; none were discarded.
