# Purchase Module — Copy & i18n Audit

Read-only audit. Tenant: Gulf Auto Parts (Kuwait, KWD 3dp, no VAT). Locales en/ar.
Live DB check confirmed the tenant has exactly one `tax_groups` row: `"No Tax"`, `is_default = true`
(seeded by `apps/api/src/onboarding/pipeline/materialize-tax.ts`, which — by design, per its own
doc comment — creates this row for every no-tax country including Kuwait). This single fact drives
several of the findings below: **"does a tax group exist" is NOT a valid proxy for "does this
tenant charge tax"** for Gulf Auto Parts or any KW/QA/BN tenant, because they always have exactly
this one row.

No files were edited. No server was touched.

---

## CRITICAL

None found.

## HIGH

### H1 — Order-create screen shows "Before tax" / tax note for a genuine no-VAT Kuwait tenant (CONFIRMED)

- `src/features/purchase/components/orders/order-create-panel.tsx:287-293` gates tax-UI visibility
  on `hasTaxGroups = (taxGroupsQuery.data?.data.length ?? 0) > 0`. The code comment literally says:
  > "A no-VAT market (e.g. Kuwait) simply has zero tax groups, so the 'before tax' total and its
  > note never render."

  That premise is **false** for this tenant: Gulf Auto Parts has one tax group (`"No Tax"`,
  `is_default: true`), seeded intentionally for every no-tax country. So `hasTaxGroups` is `true`,
  and `order-create-panel.tsx:656-664` will label the running total `"Before tax"` and print the
  `form.totals.taxNote` hint ("Tax is calculated and added once items are on the order.") even
  though this tenant will never actually add tax. This directly contradicts the standing "hide tax
  in no-tax countries" product rule.
- **Root cause is structural, not a one-off typo**: the correct signal already exists and is used
  correctly elsewhere — `apps/api/src/tax-config/tax-presentation.ts`'s `classify()`/`taxMode`
  looks at the tax **code category** (`out_of_scope`/`exempt` → `"none"`), not at row-count. Every
  DETAIL screen (`bill-summary.tsx:60`, `grn-detail-panel.tsx:315`, `order-detail-panel.tsx:429`,
  `return-detail-panel.tsx:334`) correctly consumes server-computed `taxMode !== "none"`. Only the
  **order CREATE** screen bypasses that and invents its own `hasTaxGroups` proxy.
- Net effect: the same purchase order says "Before tax" while being created, then correctly says
  "Total" (no tax row) once you open its detail page after saving — an inconsistency a Kuwaiti shop
  clerk will notice and be confused by.
- **Fix once, not per-screen**: `order-create-panel.tsx` should ask the server for a presentation
  mode the same way the bill-create screen does (`preview.taxMode`), or at minimum should filter
  the tax-groups list by whether any group has a taxable (non `out_of_scope`/`exempt`) component,
  not by raw existence.

### H2 — direct-purchase-create's `hasTaxedLines` uses the same wrong proxy (SUSPECTED, lower likelihood of triggering)

- `src/features/purchase/components/direct/use-direct-purchase-totals.ts:125`:
  `hasTaxedLines: lines.some((l) => l.taxGroupId !== null)`. This treats "a tax group id is set on
  the line" as "this line is taxed" — but for Gulf Auto Parts the only group a clerk can pick is
  `"No Tax"` (`out_of_scope` category, 0%). If a clerk opens the per-line tax-group picker and
  explicitly selects it (or if the field is ever made required / pre-filled with the tenant
  default in the future), `showTaxRow` flips true (`direct-purchase-form-fields.tsx:789-791`) and
  a zero-value "Tax" row appears. Did not confirm whether the picker currently auto-selects the
  default group on line-add (no `isDefault` auto-select code found in the direct-purchase line
  components), so today this likely stays dormant — but it is the same bug shape as H1 and should
  be fixed by the same shared mechanism.

### H3 — Direct-purchase DETAIL panel shows an unconditional "Tax" total row (CONFIRMED)

- `src/features/purchase/components/direct/direct-purchase-detail-panel.tsx:262-265` renders:
  ```tsx
  <TotalRow label={t("tax")} value={formatMoneyWithSymbol(purchase.totals.tax, purchase.currency, locale)} />
  ```
  with **no** `taxMode`/`showTaxRow` gate at all — unlike every sibling detail screen (order, GRN,
  bill, return all gate on `taxMode !== "none"`), and unlike the direct-purchase **create** screen
  itself, which correctly gates via `showTaxRow` (see H2). Gulf Auto Parts will see a permanent
  "Tax: KWD 0.000" line on every direct-purchase detail view. Since `purchase.totals.tax` is
  presumably always `"0"` for this tenant, this is a display/trust issue (a KW shop owner will
  wonder "why does this say tax if we don't have VAT?"), not a money-correctness bug.
- **Fix**: add the same `taxMode !== "none"` (or equivalent) gate used by
  `order-detail-panel.tsx:429`, `grn-detail-panel.tsx:315`, `bill-summary.tsx:60`,
  `return-detail-panel.tsx:334`. This is the third UI showing the identical concept
  inconsistently — evidence a single shared `<TaxTotalRow taxMode={...} .../>` primitive is
  overdue (see structural note under EM DASH below for the parallel pattern).

### H4 — Dead "Manager approval (UUID)" raw-identifier strings still live in messages, in 6 places, en+ar (CONFIRMED present, SUSPECTED dead)

- `messages/en/purchases.json` (and mirrored 1:1 in `ar/purchases.json`) contains, at minimum,
  lines 1054-1057 (payment post), ~1367-1369 (order?), ~1789-1791 (GRN), ~2078-2080 (landed cost),
  ~2336-2338 (return):
  ```json
  "approvedByLabel": "Manager approval (UUID)",
  "approvedByPlaceholder": "e.g. a1b2c3d4-…",
  "approvedByHint": "Every payment post requires manager approval. Enter the approving manager's user ID.",
  "approvedByInvalid": "Enter a valid UUID."
  ```
  This is exactly the class of thing the audit brief calls out: raw internal identifiers surfaced
  to non-technical retail staff. Good news: I could not find any current call site — the actual
  post-payment dialog (`src/features/purchase/components/post-payment-dialog.tsx`) imports from
  `@/features/approval-pin` and drives approval through a PIN-based picker, not a free-text UUID
  field. These keys appear to be **dead strings left over from an earlier raw-UUID implementation**
  that was superseded by the PIN flow, in 5-6 duplicated call-site slots across purchase namespaces.
  **Action**: grep the whole repo (not just `purchase`) for any remaining reference before deleting
  — if truly dead, delete from both `en` and `ar` in one pass; if some other path still renders
  them (e.g. a fallback / feature-flagged path I didn't find), that path is the real HIGH finding
  and needs the same PIN-based fix as `post-payment-dialog.tsx`.

## MEDIUM

### M1 — Em dash used as the shared "empty value" placeholder is duplicated ~15+ times across purchase, with NO shared component (CONFIRMED, structural)

The already-known "Expected delivery" bug traces to
`src/features/purchase/lib/display.ts:23`:
```ts
export function displayDateOnly(raw: string | null, locale: AppLocale): string {
  if (!raw) return "—";
  ...
```
used by `orders-list-panel.tsx:316` for the Expected delivery column — **confirmed**, this is the
exact defect described in the brief.

But that is only one of many independent hardcoded `"—"` literals in the purchase feature, each a
separate landmine:

| File:line | Context |
|---|---|
| `lib/display.ts:23` | `displayDateOnly` fallback (feeds orders list "Expected delivery", GRN dates, etc.) |
| `components/supplier-statement-tab.tsx:158,159,167,193,194` | table cell fallbacks |
| `components/payment-detail-panel.tsx:373` | `payment.reference ?? "—"` |
| `components/suppliers-list-panel.tsx:481,489` | `s.taxNumber ?? "—"`, currency fallback |
| `components/grns/grn-detail-panel.tsx:291` | `grn.supplierDeliveryNote ?? "—"` |
| `components/grns/grn-lines-readonly-table.tsx:177` | `line.batchNumber ?? "—"` |
| `components/grns/grn-draft-lines-editor.tsx:387,400,418,435,452` | 5 separate empty-cell spans |
| `components/grns/grn-receive-lines-table.tsx:210,221,241,258,275` | 5 more separate empty-cell spans |
| `components/returns/return-detail-panel.tsx:435` | ternary fallback |
| `components/supplier-kpi-strip.tsx:44,120` | KPI empty state |
| `components/overview/recent-documents-table.tsx:165` | currency fallback |
| `components/grns/serial-entry-cell.tsx:41` | `` `${serials.length} / —` `` |
| `components/grns/grn-create-panel.tsx:504` | `` `${o.number} — ${supplierName}` `` — this one is a **separator**, not an empty-value placeholder; still worth normalizing away from a bare em dash to something locale-neutral like a middle dot, since em dashes are banned in product copy outright. |
| `components/grns/grn-draft-lines-editor.tsx:582` | `` `${l.description} —{" "}` `` — same separator concern |
| `messages/en(ar)/purchases.json:2566` | `"taxLoading": "—"` |

**Same root cause as the earlier dashboard fix, and the fix never became shared**: dashboard
already has `src/features/dashboard/lib/constants.ts`:
```ts
/** Em dash used as the placeholder for absent/unavailable KPI values. */
export const EM_DASH = "—";
```
— but that constant is **dashboard-local** and purchase does not import it; purchase instead
re-hardcodes the literal `"—"` independently in 15+ places. `src/components/kpi-strip.tsx:173`
(a genuinely shared component, not dashboard-only) also independently hardcodes `"—"` rather than
importing `EM_DASH`, so even the "shared" KPI strip has its own private copy.

**The structural fix that matters more than any individual line**: promote `EM_DASH` (or better,
rename it to something ban-compliant — see below) out of `features/dashboard/lib/constants.ts`
into a genuinely shared location (`packages/shared` or `packages/ui`), and either (a) export a
`formatEmptyValue()` / `<EmptyValue />` helper that every list column and detail row imports, or
at minimum (b) have every one of the ~15 sites above import the one constant instead of typing the
character. As written, the em-dash ban is enforced ad hoc per screen and has already regressed
twice (dashboard, now purchase) — a shared primitive plus a lint rule/grep-in-CI banning the
literal `"—"` character outside that one file is the only way this doesn't happen a third time in
sales/inventory/POS.

Note the actual banned-character question: the brief says em dashes are banned in "all product
copy and UI strings" — that includes this placeholder usage, not just prose. Whatever the shared
constant becomes, it is still an em dash character rendered to the user; if the ban is meant
literally (not just "don't use it as punctuation in sentences"), the placeholder character itself
should change (e.g. to a locale-safe `–` en dash is also a dash-family character and probably not
what's wanted either — consider a bare `-` hyphen-minus, or the "N/A"-style text token already used
elsewhere in the app, whichever this codebase has standardized on outside purchase/dashboard).

### M2 — Two em dashes in actual prose sentences, en+ar (CONFIRMED)

- `messages/en/purchases.json:2294` and `:2351` (same string, two call sites):
  > "...The rest, {refundableAmount}, cannot be applied to the bill **—** it will instead become
  > money the supplier owes you back..."
  
  Mirrored in `ar/purchases.json:2294,2351` with the Arabic em dash equivalent in the same
  position. This is real product copy, not a placeholder — a straightforward rewrite (e.g. "...
  cannot be applied to the bill. Instead, it will become money the supplier owes you back...")
  removes it in both locales in one edit each.

### M3 — "Jargon" audit: mostly clean, 2 genuine leaks

- **"Reverse-charge"** appears in actual user-facing copy, not just comments:
  `messages/en/purchases.json:625` `"payableTotalHint": "Total minus self-assessed reverse-charge
  tax."` and the bill summary conditionally shows a `payableTotal` row specifically for
  "reverse-charge bills" (`bill-summary.tsx:16,73`). "Reverse-charge" is genuine accounting jargon
  a Kuwaiti shop owner will not know. It IS necessary here (the payableTotal ≠ total distinction
  needs *some* explanation), and it already has a plain-language hint attached
  (`payableTotalHint`) — so this is a **partial pass**: the hint exists, but the hint itself still
  says "reverse-charge tax" rather than plain language like "tax you report and pay yourself
  because your supplier didn't charge it." Low-cost improvement, not a structural gap. This
  concept is functionally irrelevant for Gulf Auto Parts specifically (no VAT ⇒ no reverse charge
  ever fires), so it's dormant in practice but the same UI ships to every tenant.
- **"Contra"** appears in real user copy, twice: `messages/en/purchases.json:1097`
  ("...it will contra all journal entries...") and `:1107` ("...journal entries have been
  contra-d..."). "Contra" is accounting jargon with no plain-language gloss anywhere nearby. A shop
  clerk reading "contra-d" (also an awkward past-tense coinage of a noun) will not know what
  happened to their payment. Recommend replacing with something like "reversed" / "cancelled out"
  in both spots (this string doesn't appear to need the technical precision "contra" implies here —
  "reverse" is used one word earlier in the same sentence already, so "contra" is actually
  redundant with the sentence's own verb).
- **Not flagged (checked, found fine)**: "GR/IR clearing", "purchase price variance", "landed cost
  accrual", "3-way match", and "subledger" do NOT appear anywhere in `messages/en/purchases.json`
  or `messages/ar/purchases.json` — they only appear in code **comments** (`types.ts`,
  `bill-create-panel.tsx:409`, `edit-bill-fields.tsx:9`), which are developer-facing, not
  user-facing. "Accrual" appears in user copy but always with a plain-language gloss right next to
  it (`accrualHint`: "Tax is recorded when the supplier bill arrives, not on this receipt.";
  `creditAccountType` hint spells out payable/bank/accrual in plain terms) — this is a **positive**
  finding, the landed-cost credit-type picker does exactly what the brief asks (jargon term present
  but always paired with a tooltip).

## LOW

### L1 — Error copy is broadly good; no leaking internal errors found (POSITIVE)

Every `*_DENIED` / `*_LOCKED` / `*_EXISTS` style error key I sampled in `purchases.json` (GRN,
purchase-order, direct-purchase error catalogs, ~40+ keys) is written as a plain-language sentence
telling the user what happened and often what to do next (e.g. `GRN_COST_CORRECTED`: "...Set the
cost back first, or raise a purchase return."). I found **no** instance of a raw status code, field
key, stack trace, or "too many digits" style validation leak inside purchase's own message catalog
— unlike the confirmed bad example from another module cited in the brief. This looks like a
genuinely hardened area.

### L2 — Fallback error path still surfaces raw `err.message` from `ApiError` (SUSPECTED, needs backend cross-check)

Nearly every mutation handler in purchase follows the pattern
`toast.error(err instanceof ApiError ? err.message : t("...genericError"))` (40+ call sites across
`supplier-form-panel.tsx`, `payment-create-panel.tsx`, `bill-detail-panel.tsx`,
`grn-detail-panel.tsx`, `landed-cost-detail-panel.tsx`, `return-detail-panel.tsx`,
`order-detail-panel.tsx`, etc.). This is fine IF `ApiError.message` is always the already-translated,
already-user-safe string the backend error catalog produces (which the `*_DENIED` etc. keys above
suggest is the house convention) — but it means **any** backend error path that throws a generic
`ApiError` with a raw/English/technical message (rather than a cataloged, translated one) will
surface verbatim to the user, bypassing the whole locale layer and potentially leaking internals.
I did not audit the backend error-catalog completeness for every purchase mutation (out of scope:
that's an API-side check, and the brief scoped this to `apps/web`), but this pattern means the web
layer has **no last-line defense** against a technical `ApiError.message` reaching the toast. Worth
a companion API-side audit of whether every purchase mutation's thrown errors are guaranteed to
route through the translated catalog rather than ever bubbling a raw message.

### L3 — RTL / physical CSS: clean (POSITIVE)

No occurrences of `margin-left/right`, `padding-left/right`, `text-align: left/right`, bare
`left:`/`right:`, or Tailwind physical utilities (`ml-*`, `mr-*`, `pl-*`, `pr-*`, `text-left`,
`text-right`, `left-*`, `right-*`) found anywhere under `src/features/purchase/**` (`.tsx`, tests
excluded from the scope but also clean). All table alignment uses `text-end` (confirmed in
`suppliers-list-panel.tsx`, `bill-summary.tsx`, etc.), which is the correct logical property. This
module appears to already comply fully with the CSS-logical-properties mandate.

### L4 — Money formatting: clean, no hand-rolled formatting or hardcoded 2dp found (POSITIVE)

No `.toFixed(2)` / `.toFixed(0)` anywhere in `src/features/purchase`. 245 call sites use
`formatMoneyAmount` / `formatMoneyWithSymbol` from the shared formatter. The purchase-local
`lib/display.ts` explicitly documents that it no longer wraps the money formatter ("Money display
lives in `@zerupt/shared`... This module no longer wraps it: a per-feature alias only hides which
formatter is really in use") — a sign this was already fixed once here, which is a good pattern to
point to when fixing the em-dash duplication (M1) the same way.

### L5 — ar/en key parity: full parity, standing check would have caught nothing new (POSITIVE, but see note)

Programmatic flatten-and-diff of `messages/en/purchases.json` vs `messages/ar/purchases.json`
found **0** keys present in one locale and missing in the other. I did not find any class-B gap
either (a key missing from *both* locales, which `i18n:check` cannot catch) within the purchase
namespace itself — every English string I sampled while reading through the file had a
structurally-matching Arabic counterpart at the same path. I did not exhaustively verify semantic
correctness of every Arabic translation (that would need a native/fluent read of ~3000 lines of
`ar/purchases.json`), only structural presence — flag this as unverified rather than confirmed-good
if translation *quality* (not just key coverage) is in scope for a follow-up pass.

## FRICTION (non-blocking UX notes)

- **F1**: The reverse-charge `payableTotalHint` and the `contra`/`contra-d` payment-reversal
  copy (M3) both target concepts that never fire for Gulf Auto Parts (no VAT ⇒ no reverse charge;
  payment reversal is a maker-checker action a busy shop clerk will see rarely). Low frequency
  lowers urgency but the fix is cheap (a wording change, not new logic) so bundling it with M1/M3 is
  efficient.
- **F2**: `messages/en/purchases.json:2989-2990,3014` (`TAX_GROUP_NOT_FOUND`,
  `TAX_GROUP_AMBIGUOUS`, `TAX_GROUP_FELL_BACK_TO_DEFAULT`) are import-flow error strings that
  reference "tax group" matching by name during a bulk import — for a KW tenant with only one
  possible tax group ("No Tax"), `TAX_GROUP_AMBIGUOUS` should be structurally unreachable and
  `TAX_GROUP_NOT_FOUND` should only fire on a garbage import file. Not a bug, just worth noting
  these strings are effectively dead weight for no-tax tenants (same shape as H1/H2/H3 — the tax
  concept keeps leaking UI surface into tenants that don't need it).

## Button-label-vs-action check (item 8)

Sampled the "Post" / "Confirm" / "Receive" action labels across purchase (`payment.post.action`:
"Post payment" / `submit`: "Post", `direct.post.action`: "Post" / `submit`: "Post",
`orders.receive`: "Receive goods", multiple `confirm.submit`: "Confirm"). Every one of these I
checked pairs with copy describing an irreversible, ledger-posting action ("Posting settles the
allocated bills and posts to the ledger. This cannot be undone.", "This reverses payment {number}:
it will contra all journal entries..."), consistent with the button actually posting rather than
merely drafting. I did not find a "Post"/"Confirm"/"Receive" button in purchase whose handler only
creates a draft — no HIGH finding here, but I did not trace every single button's onClick down to
its API call (that would require reading each panel's full submit handler); this is a sampled
pass over the message catalog's own descriptive copy, not an exhaustive handler trace.

---

## Summary of what should be fixed ONCE, not per-screen

1. **Tax-visibility gating** (H1, H2, H3, F2): there are at least 3 different, non-interoperating
   ways purchase code currently decides "should I show tax UI" — (a) correct: server `taxMode`
   derived from tax-code category (bill/GRN/order/return detail), (b) wrong: `hasTaxGroups` = row
   count > 0 (order create), (c) wrong: `hasTaxedLines` = `taxGroupId !== null` (direct-purchase
   create), (d) missing entirely: no gate at all (direct-purchase detail). Fix: make (a) the only
   pattern, expose it from a shared hook/helper, and delete (b)/(c)/add-to-(d).
2. **Em-dash empty-value placeholder** (M1): 15+ independent hardcoded `"—"` literals, plus two
   *different* private `EM_DASH`-style constants (`features/dashboard/lib/constants.ts`,
   `src/components/kpi-strip.tsx`) that don't share one canonical source. Fix: one shared constant
   or `<EmptyValue/>` component in `packages/shared` or `packages/ui`, imported everywhere,
   enforced by a grep-in-CI ban on the bare `"—"` literal outside that one file.
3. **Dead raw-UUID approval strings** (H4): confirm dead, delete from both locales in one pass
   across all ~6 duplicated slots, or if a live path is found, fix it to use the same
   `@/features/approval-pin` component `post-payment-dialog.tsx` already uses.
