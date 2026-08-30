# Inventory — Adjustments, Transfers, Stock Counts

**LEDGER SAFETY: PASS.** `ledger_net` = 0.000000 before AND after all writes.

---

## INV-MOV-001 — CRITICAL — The ENTIRE Inventory module is unusable in Arabic
Reproduced by me, and it is BROADER than first reported (not just the write screens).

With `NEXT_LOCALE=en` set, logged in:
| URL | Lands on |
|---|---|
| `/ar/dashboard` | `/ar/dashboard` (correct) |
| `/ar/inventory/items` | **`/en/inventory/items`** |
| `/ar/inventory/adjustments` | **`/en/inventory/adjustments`** |

An Arabic-speaking clerk cannot use Inventory in Arabic **at all** — not the 5,000-part catalogue,
not adjustments, not transfers, not counts. For a MENA-first product this is severe.

### What I established (so the fixer does not re-tread)
| Hypothesis | Verdict |
|---|---|
| Global `NEXT_LOCALE` cookie precedence | **RULED OUT.** Same cookie, `/ar/dashboard` stays Arabic. Route-specific, not global. |
| Server-side locale handling broken | **RULED OUT.** Unauthenticated, ALL routes 307 correctly to `/ar/login?returnTo=...` preserving `ar`, inventory included. |
| Missing `setRequestLocale` (known next-intl gotcha) | **RULED OUT.** `inventory/page.tsx` and `inventory/items/page.tsx` both call it in `generateMetadata` AND the default export, same as dashboard. |
| Inventory using the non-locale-aware `next/navigation` router | **RULED OUT.** It imports `useRouter`/`Link` from `@/i18n/navigation` (the `createNavigation(routing)` wrapper). |

So: server-side is correct, the router import is correct, and it only happens **after auth,
client-side, on inventory routes**.

**Leading unverified hypothesis:** a panel that syncs filters/params to the URL mixing
`usePathname` from `next/navigation` (which INCLUDES the locale segment) with the locale-aware
`useRouter` (which PREPENDS it) — producing a path that normalises back to the default locale.
Several inventory panels do `router.push(\`${pathname}?${params}\`)`
(e.g. `serial-numbers-list-panel.tsx:152`). **Verify before fixing.**

**Status:** FIXED & VERIFIED. **AND MY DIAGNOSIS WAS WRONG — see below.**

### CORRECTION: this was never inventory-specific. It was GLOBAL.
I reported this as isolated to Inventory and published a table of four "ruled out" hypotheses,
including "route-specific, not global — with the SAME cookie, `/ar/dashboard` stays Arabic."

**That control test was a false negative.** The redirect is **timing-dependent**, not
route-dependent. `/ar/dashboard` only appeared to survive because its settings query resolved
faster during my quick check. Waiting the full ~10s reproduces the identical flip on the
dashboard too.

So my "ruled out" table was built on a race condition, and it sent the fixer toward a hypothesis
(mixed `usePathname` imports) that was also wrong. The fixer ignored my hypothesis, traced the
real mechanism, and corrected both of us. That is the right outcome.

### The actual root cause
`apps/web/src/components/locale-sync.tsx:30-52`, rendered on EVERY authenticated page via
`components/shell/app-shell.tsx:129`.

`LocaleSync` reads the tenant's `languageDefault` (via `GET /tenant/settings`) and, when it differs
from the active locale and `hasChosenLocale()` is false, force-navigates
`router.replace(pathname, { locale: preferred })`.

It applied that redirect but **never recorded that it had done so**. `hasChosenLocale()` is set
ONLY by the in-app locale switcher. Since `AppShell` (and therefore `LocaleSync`) remounts on every
full page load, it re-fired on **every navigation**, for any tenant whose `languageDefault`
differs from a manually-typed locale.

The visible symptom was inventory-shaped purely because inventory pages are slower, so the flip
had time to land before I looked.

### Fix
`markLocaleChosen()` is now called at the moment the tenant-default sync applies, so it fires at
most once per browser — matching the component's own documented intent ("applies the tenant
default once").

### My verification
All three stay Arabic with `dir="rtl"`:
`/ar/dashboard`, `/ar/inventory/items`, `/ar/inventory/adjustments`. Cookie `zerupt-locale-chosen=1`
now set. `/en/...` unaffected. Filter/pagination URL syncing still preserves the locale.

### LESSON (added to the method rules)
A negative control that passes ONCE is not a control. When a symptom may be timing-dependent,
re-run the control with the same wait as the failing case before concluding "route-specific".

---

## INV-MOV-001b — NEW, found during the fix — branch gate flips locale back to English
Selecting a branch from the branch-selection gate right after a fresh login flips the locale back
to `/en` once. Separate bug, in `components/shell/branch-selection-gate.tsx`. Not touched by the
LocaleSync fix.
**Status:** OPEN

## INV-MOV-001c — PRODUCT QUESTION — should the tenant default override an explicit URL locale at all?
Even fixed, the first navigation to `/ar/...` on a fresh browser is overridden by the tenant's
`languageDefault` before the "chosen" flag is set. Arguably an explicit `/ar/` URL IS a choice and
should win immediately. This matters for shared Arabic deep links.
**FOUNDER DECISION.**

---

## INV-MOV-002 — HIGH — No on-screen confirmation after Send / Receive / Submit; UI shows stale state
Reproduced 3 times. Send Transfer, Receive Transfer and Submit-for-Review all wrote to the DB
successfully, but the page kept showing the PRE-action state ("Draft", "In Transit", or a stuck
"Loading…"/"Submitting…" spinner) until a manual reload.

The user gets **zero feedback that their action worked** and will plausibly click again. On a
stock movement, a double-submit is a real inventory error.

## INV-MOV-003 — HIGH — "Spot Count" loads the entire 2,210-item catalogue
The type's own description says "Count specific items or locations." Selecting Spot Count plus one
warehouse produced a session with all 2,210 items to page through, identical to a Full Count.
The entire point of a spot check is to count a handful of items quickly.

## INV-MOV-004 — HIGH — Negative-stock guard leaks raw API internals to the user
> "Insufficient stock for item **ce4915ed-f88b-4bdb-8885-77e9b9cef882**: requested 999999,
> on hand 1.000000. Resubmit with **allowNegative=true** to proceed."

A raw UUID and an internal API parameter name, shown to a non-technical shop worker.
The underlying guard is CORRECT (see Confirmed GOOD) — only the copy is wrong. It should name the
ITEM and offer a button, not instruct the user to resubmit with a query parameter.

## INV-MOV-005 — HIGH — "New Count" button does nothing
On `/inventory/stock-counts`, clicking "New Count" (header button AND empty-state button) does not
navigate, error or open anything. Direct URL to `/inventory/stock-counts/new` works fine.
A dead end for anyone who does not know the URL.

## INV-MOV-006 — MEDIUM (FRICTION) — Location never defaults, on every create form
Adjustments, Transfers (From) and Stock Counts all leave the warehouse/location blank, despite the
header showing "Viewing: Al Rai Main Showroom". Every create pays an extra click plus a search for
the single most common case: working in your own branch.
Directly against the founder rule "defaults over questions".

## INV-MOV-007 — MEDIUM (FRICTION) — Unit Cost copy contradicts behaviour
Caption says "Enter the unit cost, or it will use the current average cost", but for an item with
no cost history Submit stays DISABLED until a cost is typed. The copy implies optional; the form
requires it. This is the single thing most likely to stall an untrained user on the adjustment
flow.

## INV-MOV-008 — MEDIUM — Incomplete-count submit warns about nothing
Submitting a Spot Count with 1 of 2,210 lines counted shows only a generic "Are you sure you want
to submit this count for review?" with no mention that 2,209 items were never checked.
(The underlying behaviour is SAFE — see Confirmed GOOD — but the copy hides the scope.)

## MEDIUM / LOW
- Cross-branch warehouses appear in every location picker even while scoped to one branch.
  SQL-confirmed this is because the OWNER has `all_branches = true`, so it is arguably correct —
  but the "Viewing: X" banner implies a narrower scope. **Product decision**, not a bug.
- Document number consumed then abandoned on a rejected adjustment (ADJ-00004 skipped). Sequence
  gaps are normal; confirm it is intended, since owners reconcile numbers sequentially.
- Transfer lifecycle transitions (create/send/receive) ALL audit as `action: "create"` — no
  distinct verbs, reducing audit clarity.
- No Export on the Transfers list although Adjustments has one (inconsistent parity).
- a11y: quantity input's accessible name is literally `"0"`; a stale "Location Required" ARIA label
  persists after a valid selection; `DialogContent` missing `aria-describedby` warnings throughout.

---

## FRICTION TABLE (founder standard)
| Flow | Clicks/steps | Forced fields | Draft stage | 60-second verdict |
|---|---|---|---|---|
| New Adjustment | ~10 | Location, Reason, Item, Unit Cost | No draft, single Post — GOOD | **NO.** Location never defaults; unit-cost hint says optional but is required. |
| New Transfer | ~9 across 3 stages | From, To, Item | Yes — **genuinely justified** (dispatch -> transit -> receive) | Not in one sitting by design, but each stage is <15s. The stale-UI bug actively makes users think it failed. |
| New Stock Count | ~6 to create, then unbounded | Location | "In Progress" acts as one | **NO** for Spot Count — loads 2,210 items, the opposite of a spot check. |

---

## Confirmed GOOD (evidence-backed — this module's CORRECTNESS is strong)
- **Adjustment increase**: +1 @ 5.000 -> `stock_ledger_entries` `adjustment_increase`, on_hand 0->1,
  JE Dr Inventory / Cr Inventory Gain **balanced 5.000/5.000**, audit row with real user id + email.
- **Adjustment decrease**: -1 -> `adjustment_decrease`, on_hand 1->0, JE balanced.
- **Negative-stock guard works server-side**: a 999,999 decrease against 1 on hand was REJECTED,
  no document created, stock unchanged, until explicitly re-confirmed.
- **Client-side validation**: qty `0` or `-5` disables Submit before any request is sent.
- **Transfer end-to-end**: send -> `transfer_out` (-1) at source and destination `in_transit` +1
  with `on_hand` untouched (matching the dialog's promise "Stock will be in transit until
  received"); receive -> `transfer_in` (+1), in_transit back to 0, both warehouses reconcile.
  **No GL impact** — correct, same legal entity, physical move only.
- **THE MOST IMPORTANT CHECK ON THIS MODULE PASSED:** an incomplete Spot Count (1 of 2,210 lines)
  left the 2,209 uncounted lines as `counted_qty = NULL` and EXCLUDED them from Approve & Post.
  Only the genuinely counted line produced an adjustment. **An incomplete count did NOT zero out
  or corrupt 2,209 real inventory items.**
- **"Save Draft" on Transfers is an HONEST label** — it genuinely saves a draft, and the
  Draft -> In Transit -> Received lifecycle is a legitimately justified staged workflow for a
  dispatch document. This is the good counter-example to a spurious draft stage.
- **Confirm-once discipline respected**: Send, Receive, Approve & Post and normal posting each ask
  exactly once, with honest plain-language copy about irreversibility.
- Same-warehouse transfer correctly blocked (To disables the selected From).
- Money 3dp correct on all direct page loads (`2,063,082.347`, `1,848,064.427`, `10.000`).
- Branch scoping on the Adjustments list SQL-confirmed correct (both warehouses map to Al Rai).

## RECORDS CREATED
| Doc | Type | Detail |
|---|---|---|
| `B1ALRAIMAINS-ADJ-00003` | Adjustment | ZZTEST-SKU-0001 +1 @ 5.000, Al Rai |
| `B1ALRAIMAINS-ADJ-00005` | Adjustment | ZZTEST-SKU-0001 -1 @ 5.000, Al Rai |
| `B1ALRAIMAINS-ADJ-00006` | Adjustment | ZZTEST-SKU-0001 +2 @ 5.000, Al Rai |
| `B1ALRAIMAINS-TRF-00001` | Transfer | ZZTEST qty 1, Al Rai -> Shuwaikh Central, sent + received |
| `CNT-00001` | Stock Count | Spot, Al Rai, 1/2210 counted, variance +2, posted -> ADJ-00007 |
| (`ADJ-00004`) | — | number reserved then rejected, never created |

## Not tested
Export with filters on Adjustments; Cycle Count type; Recall/Cancel Transfer, Reverse Receipt,
Cancel Count; pagination beyond 25 rows; serial/batch-tracked item behaviour; full Arabic form
fill (blocked by INV-MOV-001).
