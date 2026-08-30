# POS Frontend — Static Code Audit

Scope read: `erp/apps/web/src/features/pos/**`, `erp/apps/web/src/features/pos-transactions/**`,
`erp/apps/web/src/app/[locale]/(pos)/**`, `erp/apps/web/src/app/[locale]/(app)/pos/**`,
`erp/apps/web/messages/{en,ar}/pos.json`. Method: Read/Grep only, no browser, no edits.
POS was previously hardened end to end (`study/pos/_hardening-log.md`, L0-L7); this pass looks
for what survived that program.

---

## HIGH

### H1 (CONFIRMED) — Tax row on the live register cart renders unconditionally, no country/tax-system gate
`erp/apps/web/src/features/pos/components/cart-totals.tsx:189-192`:
```tsx
<div className="text-muted-foreground flex items-center justify-between">
  <span>{t("totals.tax")}</span>
  <span className="font-mono tabular-nums">{fmt(taxTotal)}</span>
</div>
```
This row has no conditional wrapper at all — no `taxSystem`, `hasTax`, or country check. It always
renders while the cashier builds a cart, so on this Kuwait (no-VAT) tenant it prints "Tax: KWD
0.000" on every single sale. Compare with the two OTHER POS surfaces that render a tax total, both
of which correctly gate it:
- `receipt-document.tsx:507` — `const hasTax = Number(receipt.taxTotal) > 0;` gates the printed
  receipt's tax line by amount.
- `z-report-document.tsx:99-104` — gates the Z-report's whole tax section via the shared
  `documentShowsTax(taxSystem, countryCode)` helper from `packages/shared/src/print/document-shows-tax.ts`,
  with an explicit comment: "Kuwait/Qatar (and any other no-consumption-tax jurisdiction) must
  never [show tax]... never a hardcoded country list."

`cart-totals.tsx` is the ONE place in POS that skipped this pattern, and it is the highest-traffic
screen (the live cart every cashier stares at on every sale). This is a real violation of "Hide tax
in no-tax countries" (feedback_hide_tax_in_no_tax_countries).

**Fix shape:** gate the row the same way the Z-report does — reuse `documentShowsTax` (or the
`hasTax`-by-amount pattern already proven in `receipt-document.tsx`) rather than inventing a third
variant. One shared helper, not a third copy.

### H2 (CONFIRMED) — F1-F4 register shortcuts are NOT suppressed while a dialog/drawer is open, unlike scan-anywhere
`erp/apps/web/src/features/pos/components/register-shell.tsx:414-444`. The shortcut handlers gate
only on cart **phase** (`phase === "build"`), never on `overlay !== "none"`:
```tsx
onHold: () => { if (phase !== "build") return; ... }
onRecall: () => { if (phase === "build") openOverlay("recall"); }
onPay: () => { if (phase === "build") handlePay(); }
```
`usePosShortcuts` is enabled by `!!shift && !isMutating && !onBreak` only (line 443) — no overlay
check. `handlePay` (`register-shell.tsx:362-374`) itself has no overlay guard either. Meanwhile the
SAME file's comment for barcode scan-anywhere (lines 455-465) explicitly documents that scan capture
IS auto-suppressed the moment any dialog built on the shared Dialog/Sheet/AlertDialog primitives
mounts (`packages/ui/src/scan-scope.tsx`), and calls out that the old per-dialog enumeration
approach used to miss dialogs and cause bugs.

Net effect: while e.g. the Hold-cart dialog, Return-lookup drawer, Fitment-finder drawer, or a
customer/salesperson picker is open on top of the register (`overlay !== "none"`), pressing F4
still calls `handlePay()` and flips `phase` to `"settle"` underneath the open dialog — the
inconsistency the scan-scope refactor was built specifically to eliminate for barcodes was never
applied to the keyboard shortcut layer.

**Uncovered seam:** no test asserts shortcut-vs-overlay interaction (only barcode-vs-overlay is
covered, per the register-shell comment). Extend `use-pos-shortcuts` (or register-shell) tests to
cover "F4 while overlay !== 'none' is a no-op," matching the scan-scope guarantee.

---

## MEDIUM

### M1 (CONFIRMED) — POS transactions list query has no `placeholderData: keepPreviousData`; pager unmounts on every page change
`erp/apps/web/src/features/pos-transactions/api/pos-transactions-queries.ts:12-22`:
```ts
export function usePosTransactionsQuery(params, options = {}) {
  return useQuery({
    queryKey: posTransactionKeys.list(params),
    queryFn: () => fetchPosTransactions(params),
    enabled: options.enabled ?? true,
    staleTime: options.staleTime ?? 60_000,
  });
}
```
No `placeholderData`. The consumer, `pos-transactions-list-panel.tsx:619-633`, renders:
```tsx
{query.isLoading ? (
  <ListSkeleton />
) : query.isError ? ( ... ) : transactions.length === 0 ? ( ... ) : (
  <Table>...<TablePagination .../></Table>
)}
```
`page` is part of the query key (`params` includes `page`, line 322), so every page/limit change is
a brand-new key with no cached data → `isLoading` goes true → the whole table AND its
`TablePagination` footer (rendered only in the success branch) unmount and are replaced by
`ListSkeleton`. This is POS's share of the known cross-cutting ~30-list-panel defect named in the
addendum — not a new class of bug, just POS's instance of it. Fix per the existing cross-cutting
remediation: add `placeholderData: keepPreviousData` here.

Note: the isLoading/isError/empty ordering itself is correct and NOT conflated (isLoading and
isError are checked as separate branches, not `!data`), so this file does not have the
"unknown-as-isLoading" defect — only the missing-keepPreviousData one.

Registers list (`registers-panel.tsx`) has no pager (flat `limit: 100` fetch, 8 registers exist) so
it is out of scope for this specific defect — checked and clean.

### M2 (CONFIRMED) — PERM-004 pattern: "Void" on a completed sale in the sales queue has no frontend permission check
`erp/apps/web/src/features/pos/components/queue-drawer.tsx` — the Void trigger for a
Synced/completed transaction (`onVoid={() => openVoid(s)}` / `onVoid={requestVoidById}`, lines
349/378) and `queue-row-view.ts`'s `canVoid` (lines 36-73) gate visibility purely on transaction
**status** (voidable vs not), never on the user's `pos.transaction.void` permission. Grep for
`hasPermission`/`Permission` in both files returns nothing. Per the POS role-template hardening
(`study/pos/_hardening-log.md`, "follow-up scoping pass"), Cashier explicitly does **not** carry
`pos.transaction.void` any more — but this UI still renders the Void action, fully clickable, to
every cashier regardless of role; the block only lands as a 403 from the server on submit. Server
enforcement is correct (confirmed via the hardening log), so this is UX, not a security hole — the
same PERM-004 pattern already open elsewhere, POS's instance of it.

Distinct from this: `void-dialog.tsx`'s "Cancel sale" (renamed per the L6 prod hotfix) is the
**in-progress local cart** clear, works offline with no server call and no RBAC implication —
correctly NOT gated, not a finding.

---

## LOW / FRICTION

### F1 (CONFIRMED) — Several frequent register actions have no dedicated keyboard shortcut
`use-pos-shortcuts.ts` binds only F1 (search), F2 (hold), F3 (recall), F4 (pay), F6 (fitment
finder, auto-parts only), Escape (cancel/close). Grepped `pay-surface.tsx`, `cart-line-row.tsx`,
`pay-surface-tender-grid.tsx` for any additional `keydown`/hotkey wiring — none found except
`pay-surface-numpad.tsx` (digit/`.`/Backspace typing into the amount field, not a shortcut per se).
No shortcut exists for: **remove a cart line, change a line's quantity, apply a line/order
discount, pick exact-cash/"amount due", or complete/confirm the tender once amount is entered** —
all of these are mouse/tap-only (tap the qty stepper, tap a discount button, tap a tender card).
For a barcode-scanner-and-keyboard-driven till this is friction, not a blocker (F1/F2/F3/F4 cover
the highest-frequency loop: search→hold→recall→pay), but it is a real gap against the module's own
stated bar. Flag for a future layer, not urgent enough to block anything today.

---

## Confirmed NOT a finding (verified against the addendum + hardening log before filing)

- **POS-001 (previously HIGH, "Opening float" 0.00 in a 3dp tenant) — now FIXED in code, no
  siblings found.** `shift-open-panel.tsx:292-312` uses `MoneyInput` with `currency={currency}`
  and a placeholder computed via `formatToDecimals(selectedRegister.defaultCashFloat,
  getCurrencyDecimals(currency))`, falling back to `undefined` (no placeholder at all) when no
  register is selected — never a hardcoded `"0.00"`. `create-register-dialog.tsx`'s
  `defaultCashFloat` seed also resolves precision via `getFloatDecimals(branchCurrency)` /
  `getCurrencyDecimals`, with a `DEFAULT_FLOAT_DECIMALS = 2` fallback used ONLY before a branch is
  chosen (explicitly commented as such) and re-formatted the instant a branch resolves. Grepped all
  of `features/pos/**` non-test files for `toFixed(`, `Intl.NumberFormat`, hardcoded `"0.00"`, and
  `step="0.01"` — every hit in production code either already threads `currency`/`decimals` through
  (`pay-surface.tsx`, `pay-surface-calc.ts`, `numeric-keypad.tsx`, `return-modal.tsx`,
  `local-receipt-mapping.ts`, `sale-builder.ts`) or is a quantity field correctly using
  `MAX_QUANTITY_DECIMALS`/`priceDecimals`. No 2dp-hardcoded money surface remains. Cash
  denomination buttons, change-due, and Z-report totals were all checked and are decimal-aware.

- **i18n parity for `pos.json` is exact: 0 keys missing in either direction** (en ↔ ar, verified by
  flattening both files and diffing). No hardcoded English UI strings found in POS components (the
  em dashes found are all in code comments, never in translated copy or JSX text — not a violation
  of the em-dash ban, which applies to product copy).

- **No physical CSS direction classes** (`ml-`/`mr-`/`pl-`/`pr-`/`text-left`/`text-right`/
  `left-`/`right-`) found anywhere under `features/pos/components/` — RTL discipline via logical
  properties holds.

- **Z-report i18n locale binding** is the founder-sanctioned exemption per the addendum — not
  filed.

- **Per-tender GL account resolution, three-way tie-out mechanics, offline idempotency, and the
  BUILD↔SETTLE inline pay surface** were read but not re-audited — they are settled/locked per the
  hardening log and out of scope for a re-litigation.

---

## Summary

2 HIGH, 2 MEDIUM, 1 FRICTION. The previously-filed POS-001 is fixed and has no live siblings — a
genuinely clean money-formatting layer. The tax-visibility gap (H1) is the most consequential
finding: it is a straightforward miss of a pattern that two sibling POS surfaces (receipt, Z-report)
already implement correctly, so the fix is to reuse the existing `documentShowsTax` helper, not
invent new logic. H2 is a real inconsistency against POS's own scan-scope precedent. M1 and M2 are
POS's instances of already-known cross-cutting defect classes, not new bug classes.
