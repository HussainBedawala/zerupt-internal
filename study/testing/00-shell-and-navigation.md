# Shell & Navigation — findings

Cross-cutting chrome: login, branch chooser, top bar, sidebar. Tested before module work
because every module screen inherits these.

---

## SHELL-001 — Branch chooser truncates the branch identity, and Arabic truncates the wrong end
**Severity:** MEDIUM (HIGH for a multi-branch user in Arabic)
**Screen:** Branch chooser, shown immediately after login (`/:locale/dashboard` pre-selection gate)
**Locales:** both, worse in ar

### What the user sees
Card label is `<CODE> · <English name>` with the Arabic name underneath.

- **en:** `B1_AL_RAI_MAIN_SHOWROOM · Al Rai Main Show...`  ← human name cut
- **ar:** `...L_RAI_MAIN_SHOWROOM · Al Rai Main Showroom`  ← branch NUMBER cut
- **ar:** `...LMIYA_SERVICE_CENTER · Salmiya Service Center` ← branch NUMBER cut

B2 and B3 survive only because their codes are shorter.

### Why it matters
The internal code is the least useful token for a shop owner and it is consuming the width.
In Arabic the ellipsis falls on the logical end of an LTR latin run inside an RTL container,
so the disambiguating prefix (`B1_A`, `B4_SA`) is exactly what disappears. Two of the four
branches become visually indistinguishable at a glance.

### Repro
1. Log in as anonymator8@gmail.com on the Gulf Auto Parts tenant
2. Observe the branch chooser at /en/dashboard, then /ar/dashboard

### Suggested fix
Lead with the human-readable name, demote the code:
- Primary line: localized branch name (Arabic name in ar, English in en)
- Secondary line: the code, smaller/muted, and allowed to truncate harmlessly
Never let the code push the name out of view. If the code must stay inline, it should be the
part that truncates, not the name or the number.

### Status: FIXED — verified in browser, both locales
`apps/web/src/components/shell/branch-selection-gate.tsx`

Root cause of the second half: the first fix reached for `@/lib/bilingual-name`, which is
the LOCALE-BLIND audit-grade helper ("show both, hide nothing" - trial balance, GL, reports).
Its own header points operational pickers at `@/lib/localized-name` instead. Swapped to
`useLocalizedName()`, which resolves against the TENANT-CONFIGURED secondaryLanguage rather
than a hardcoded "ar".

Final rendering:
- en: `Al Rai Main Showroom` / muted: `صالة عرض الري الرئيسية · B1_AL_RAI_MAIN_SHOWROOM`
- ar: `صالة عرض الري الرئيسية` / muted: `Al Rai Main Showroom · B1_AL_RAI_MAIN_SHOWROOM`

Both names stay visible (nothing hidden), only the order changes. aria-label follows the
locale-aware name. Hook called above all early returns. typecheck clean. No hardcoded locale.

**LESSON (applies to the rest of this programme):** this codebase has TWO name helpers with
opposite semantics. Audit/accounting surfaces must use `bilingual-name` (show both, locale-blind).
Operational surfaces (pickers, tables, POS search, combobox) must use `localized-name`.
Watch for this exact mix-up on every screen that displays an entity name.

---

## Confirmed GOOD on this screen
- Real `<button>` elements, correct aria-labels ("Select branch Al Rai Main Showroom"),
  `tabindex=0` — fully keyboard reachable.
- Arabic is genuinely translated (اختر فرعك / جميع الفروع / تسجيل الخروج), `dir=rtl`,
  `lang=ar` set correctly on `<html>`.
- "All branches — consolidated, company-wide view" is offered explicitly rather than being
  an implicit default. Good: it makes the scope an intentional choice.

## To verify later
- No keyboard shortcut to pick a branch (1-4). Minor friction for a daily login.
- Does this gate appear on EVERY login, or only when no branch is remembered? If every login,
  it is friction for a single-branch user.

---

## SHELL-002 — MEDIUM — Sidebar branch switcher repeats the SHELL-001 mistake
**Screen:** app shell sidebar footer (every screen)
The branch pill at the bottom of the sidebar renders `B2_FAHAHEEL_BRANC` — code-first and
truncated mid-word. Same root cause as SHELL-001 (internal code leads, human name loses),
but in a DIFFERENT component, so the SHELL-001 fix did not reach it.

Full text in the DOM is `B2_FAHAHEEL_BRANCH · Fahaheel Branch`.

**Fix:** same treatment as the chooser. Lead with the locale-aware name via `useLocalizedName()`
from `@/lib/localized-name` (NOT `bilingual-name`, see the SHELL-001 lesson). The code, if shown
at all in a pill this narrow, belongs in a tooltip/title rather than inline.

**Evidence:** `/tmp/zerupt-shots/22-inv-overview-top.png`
**Status:** OPEN
