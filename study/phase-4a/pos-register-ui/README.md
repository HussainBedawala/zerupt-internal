# POS Register UI — Concepts

The frontend register surface for the POS (DEV-277). Backend (registers, shifts,
transactions, payments, z-report, receipts) was already built — this is the cashier-facing UI.

## Why a fullscreen route group, not a page

A register is a dedicated appliance, not a back-office screen. Putting it in its own
`(pos)` route group (a Next.js route group — parentheses mean "layout boundary, no URL
segment") lets it opt out of the back-office `AppShell` (sidebar nav, breadcrumbs) and
own the whole viewport. Auth still applies because the app's proxy is default-deny:
every route is protected unless explicitly whitelisted as public.

## The cardinal rule: the client never computes money

The single most important design decision. A POS is tempting to build with client-side
cart math (sum line totals, apply tax, show grand total instantly). We deliberately don't.
Every line add/edit hits the API, which recomputes tax, discounts, and totals
authoritatively, and the UI re-renders the server's decimal-string values.

Why: the General Ledger contract requires that net payments tie exactly to revenue + tax.
If the browser computed totals with JavaScript floating point (`0.1 + 0.2 !== 0.3`), the
displayed total could diverge from what the backend posts to the GL — a reconciliation
nightmare. Decimal strings (`numeric(19,6)`) flow from DB → API → UI untouched. The only
client-side arithmetic allowed is *advisory display* (cash change preview, shift over/short
preview), never a value sent back or relied on for settlement.

## Server state vs client state

A clean split:
- **Server state** (TanStack Query): the transaction detail (lines, totals), the current
  shift, held transactions, the z-report. The active cart "lives" server-side; the UI is a
  view over it. After every mutation we invalidate the relevant query so the UI reflects
  the recomputed truth.
- **Client state** (Zustand): only UI concerns — which register lane is selected (persisted
  across reloads), the active transaction id, and which overlay is open. Persisting *only*
  the lane selection avoids resurrecting a stale cart after a refresh.

This is why the issue's "cart state in Zustand" was reinterpreted: storing line/money data
client-side would re-introduce the divergence risk above.

## Barcode scanners are keyboards — and they race

A hardware scanner emits keystrokes fast and ends with Enter. So the search input treats
Enter as "this was a barcode" and types as "this is a text search." The subtle problem:
a cashier scanning items rapidly can fire several add-line requests before earlier ones
resolve. Two hazards:
1. **Line ordering / totals** — concurrent adds could interleave.
2. **Double cart creation** — the first two scans both see "no active transaction" and each
   create a Draft cart.

The fix is two promise queues in the cart write-path hook: one serializes add-line calls
(each scan chains onto the previous), and a separate queue serializes transaction *creation*
so concurrent first-adds collapse into a single POST. This is the frontend mirror of the
backend's per-shift advisory lock for sequential transaction numbers.

## Defensive UX for non-technical retail staff

The hardest user is a tired cashier on a busy day. Concrete guards:
- **Double-charge prevention** — "Complete Sale" uses a synchronous `useRef` in-flight flag,
  not just the mutation's `isPending` (which only flips on the next render, leaving a window
  for a fast double-tap to fire two charges).
- **Single source of truth for hold** — the Hold button and the F2 shortcut call the same
  guarded handler, so they can't fire two independent mutations.
- **Never lose the cart** — a failed payment keeps the modal open and the cart intact; only a
  confirmed server success resets it.
- **Confirmation on destructive/irreversible actions** — void, remove line, shift close.
- **Closing a shift is blocked while held transactions exist** — they must be recalled or
  voided first (cash accountability can't reconcile around an open cart).

## Authorization belongs on the server

The spec asked for a "manager PIN" to void completed sales. The void API has no PIN field,
so a PIN entered in the browser would authorize nothing — and storing it in the void reason
string would leak it into the audit log. The right move was to *not* fake authorization
client-side and instead file a backend follow-up (DEV-335) to add server-side manager
authorization. A client-side gate on a money-reversing action is security theater.

## Bilingual + RTL from the start

All labels come from the `pos` i18n namespace (en + ar, parity-checked). Layout uses CSS
*logical* properties (`ms-`/`me-`/`start`/`end`) so the same markup flips correctly for
Arabic RTL — no separate RTL stylesheet. User-generated content (item names, shop names)
gets bidi isolation so an Arabic product name in an English UI doesn't scramble the line.
