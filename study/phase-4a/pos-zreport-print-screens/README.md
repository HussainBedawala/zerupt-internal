# POS Z-Report Print Screens & Shift-Close UX

Concepts behind DEV-278: a standalone, printable Z-report screen and the
shift-close "what next" flow. Not implementation steps — the *why*.

## Why a Z-report needs its own screen (not just an in-modal preview)

The shift-close modal already shows a Z-report preview, but that preview dies
when the modal closes. A Z-report is a **legal/accounting artifact**: the cashier
hands it to a manager, files it, or attaches it to the bank deposit. So it needs
a stable URL (`/pos/shifts/:id/z-report`) that can be reopened, bookmarked, and
printed long after the shift is closed. The screen is keyed by **shift id**
because a shift *has* one Z-report — the report is a projection of the shift, not
its own entity.

## Immutable once closed; "live" while open

A Z-report over a **closed** shift is final and immutable. But the same endpoint
can be hit while a shift is still open — then the numbers are a live snapshot
(sales so far, expected cash so far). Showing live figures on a document that
*looks* official is dangerous: a cashier could print a "Z-report" mid-shift and
treat it as the end-of-day total. The mitigation is a **live-state banner** that
makes the not-final status loud. The data model already encodes this:
`status !== "closed"` ⇒ live.

## Printing on the web: `@media print` + `@page`

Browsers print whatever is on screen. To produce a clean thermal/A4 document you
*subtract* everything else rather than build a separate print page:

- `@media print { body * { visibility: hidden } #doc, #doc * { visibility: visible } }`
  — visibility (not `display`) keeps layout intact while hiding the app chrome.
- `@page { size: 80mm auto }` vs `@page { size: A4 }` — `@page` is the only way to
  tell the browser the physical paper. `80mm auto` = fixed width, unbounded length
  (a receipt roll); `A4` = a fixed sheet. Toggling paper size = swapping the
  injected `@page` rule.
- `print:hidden` (Tailwind) on the toolbar so buttons never appear on paper.

Thermal 80mm and A4 are the two real-world targets: 80mm is the receipt printer
sitting next to the register; A4 is the office printer / PDF for filing.

## React 19 `<style precedence>` vs `dangerouslySetInnerHTML`

The naive way to inject dynamic print CSS is `dangerouslySetInnerHTML` on a
`<style>` in the component body. It works but (a) a `<style>` inside a `<div>` is
invalid HTML and (b) it reads as an XSS vector even when the content is a static
constant. React 19 hoists any `<style precedence="...">` into `<head>`
automatically and dedupes by `href`/content — so `<style precedence="print">{css}</style>`
is both valid HTML and clean. The lesson: when a framework gives you a first-class
primitive, reach for it before the escape hatch.

## Defensive UX: never strand the user

Closing a shift used to just close the modal — leaving the cashier staring at an
empty register with no obvious next move. The fix is a **post-close prompt** with
the three things a human actually wants next: print the report, start a new shift,
or leave. This is the "what's the dumbest thing a user could do here?" lens: the
dumbest thing is *nothing*, because the UI gave them no signpost. Note that
"open new shift" just reveals the shift-open form — it doesn't create a shift —
so there's no destructive-action risk to guard.

Error states matter too: a network failure and a genuinely-missing report are
different problems (retry vs. go back), so they get different messages. Collapsing
them into one "not found" misleads the cashier into thinking data is lost.

## RTL print

Arabic is RTL. Money columns use logical CSS (`inset-inline-start`, not `left`)
so the document mirrors correctly, and directional icons (a back arrow) flip with
`rtl:rotate-180`. The printed figures stay `tabular-nums` + monospace so columns
align regardless of locale.

## The cardinal rule, again

The print document renders **only server-returned decimal strings** — it formats
for locale but never adds, subtracts, or recomputes. Money math lives server-side
where it posts to the GL; any client-side recomputation risks the receipt
disagreeing with the ledger.
