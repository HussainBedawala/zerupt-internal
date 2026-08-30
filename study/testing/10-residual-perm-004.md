# PERM-004 — shared primitive + residual instance closure

## The primitive

`apps/web/src/components/permission-gate.tsx` — new shared component/hook pair:

- `usePermissionGate(permission)` — returns `{ allowed, resolved }`, keyed off
  `usePermissionChecker()`'s `isSuccess` (never `isLoading`), per the documented
  "unknown state is not isLoading" defect class. `allowed` is `false` in BOTH the
  unknown and denied cases; callers must check `resolved` before treating `!allowed`
  as an actionable denial.
- `<PermissionGate permission title description action>` — wraps a screen/form body
  and renders exactly one of three states, never collapsed into two:
  - unresolved -> `<PageSkeleton variant="detail">` (no interactive controls, no verdict)
  - denied -> a translated `Alert` (title/description default to `common.permissionGate.*`,
    overridable per screen) — no interactive controls
  - allowed -> the real children

Vocabulary matches `apps/web/src/components/settings/section-gate.tsx` (read first,
per the brief) — same `!isSuccess` rule, generalized to any screen instead of only
settings sections (which also carry plan/country gates this primitive doesn't need).

Added `common.permissionGate.{title,description,backToList}` to
`messages/{en,ar}/common.json` as the default copy: plain language, says the user
lacks a *permission*, names the fix (ask an administrator), no raw permission key,
no em dashes, ar+en parity.

## Migrated

**XFER-001 (fixed)** — `apps/web/src/features/inventory/components/transfers/transfer-form-panel.tsx`.
Before: the full form (warehouse selects, notes, item search, line grid) rendered
fully interactive regardless of permission; only the Submit button was `disabled`,
and the denial banner sat buried below the line grid, easy to miss. After: the
entire form body (warehouse selectors through the Actions row) is wrapped in
`<PermissionGate permission={PERMISSION_KEYS.inventory.stockTransfer}>`; a denied
user sees ONLY the header + one denial alert, no interactive control anywhere.
Removed the now-redundant `useHasPermission` call, the bottom `Alert` block, and
the submit-button `disabled`/`title`/`aria-label` permission workaround (all moot
once the gate hides the whole form).

**XFER-002 (fixed)** — wrong-verb copy. `transfers.noPermission.{title,body}` said
"You cannot create a transfer" / "create a stock transfer" even on the edit screen.
Added a sibling `transfers.noPermissionEdit.{title,body}` ("You cannot edit this
transfer" / "edit a stock transfer") in `messages/{en,ar}/inventory.json`, and
`TransferFormPanel` now picks create-vs-edit copy by `isEdit` when calling
`PermissionGate`.

**POS-011** — investigated at length; the two now-open call sites of
`pos.transaction.void` on the client (`features/pos/components/queue-drawer.tsx`
and `features/pos/components/failed-sync-review.tsx`) were found ALREADY FIXED in
the shared working tree (uncommitted, by another concurrent session today — both
files carry an explicit in-code comment naming PERM-004 and gate the Void trigger
on `useHasPermission(PERMISSION_KEYS.pos.transactionVoid)`, disabling the control
and showing `void.permissionRequired` as the reason instead of a raw disabled
button). CONFIRMED by code read (not migrated onto the new primitive — these are
single disabled-button affordances inside a larger list row, not a full-page form;
`PermissionGate`'s all-or-nothing children swap is the wrong shape there, and a
disabled button that stays disabled on a transient permission-fetch hiccup is a
much lower-stakes failure mode than a full-page dead end, since it costs a moment,
not a lost form). No further open POS Void instance was found: `action-bar.tsx`'s
"Cancel Sale" voids the in-progress ACTIVE CART only (no server call, nothing
enqueued yet — correctly ungated, confirmed by reading `use-cart-actions.ts`'s
`voidActiveCart`), and there is no back-office "Void a completed transaction"
button in `pos-transactions-list-panel.tsx`'s detail sheet at all (only Edit and
Return, both correctly gated via server-derived `edit.canEdit`).

## Left as-is (PUR-025 / PUR-026), with reason

`order-create-panel.tsx` and `supplier-form-panel.tsx` already do the RIGHT thing
functionally (an early `!canCreate ? <PermissionDeniedAlert> : <full form>`
ternary — the form is never rendered for a denied user, unlike the XFER-001 bug).
Not migrated onto `PermissionGate`:
- `order-create-panel.tsx` juggles TWO permissions in the same view
  (`orderCreate` for the form, `supplierCreate` for a nested quick-add), entangled
  with supplier/branch/warehouse loading ternaries across ~450 lines.
- `supplier-form-panel.tsx` picks between TWO permissions by mode
  (`supplierCreate` vs `supplierUpdate`) and has a second, separate `canSave`
  conditional gating the sticky footer bar, plus in-flight photo-upload state.

Migrating either is a real simplification eventually, but touching either file's
ternary chain risks a regression I could not fully verify against every branch in
the effort budget here. The residual gap left behind is the same "unknown state
collapses into denied" issue this whole task is about (`useHasPermission` fails
closed on a transient fetch error) — but for these two screens that only shows a
wrong-reason banner for a moment, recoverable by retry/refresh; it does not let a
denied user do wasted work or show them a fully interactive dead-end form, which
is the actual defect class. Left open, reason stated per the task's own allowance.

## Sweep

Checked every `/new` and `/[id]/edit` route's underlying panel for permission
awareness (script: resolve each page's imported `*Panel`/`*Dialog`, grep the panel
file for `useHasPermission`/`usePermissionChecker`/`PermissionGate`):

| Panel | Gate found |
|---|---|
| AdjustmentFormPanel, ItemFormPanel, StockCountFormPanel, GrnCreatePanel, PaymentCreatePanel, SupplierFormPanel, DirectPurchasePanel, BillCreatePanel, LandedCostCreatePanel, ReturnCreatePanel, OrderCreatePanel, CustomerFormPanel, DirectSalePanel, InvoiceCreatePanel, DeliveryOrderCreatePanel, QuotationCreatePanel, QuotationRevisePanel, OrderEditPanel | direct `useHasPermission`/`usePermissionChecker` in-file |
| CreditNoteCreatePanel | delegates to `CreditNoteDialog` (features/invoices), which DOES gate on `PERMISSION_KEYS.sales.creditNoteCreate` — false alarm, not a gap |
| OrderAmendPanel, GrnEditPanel, DirectPurchaseEditPanel, BillEditPanel, DirectSaleEditPanel, InvoiceEditPanel | no raw `useHasPermission`, but all gate on a SERVER-derived `edit.canEdit`/`canAmend` + `blockReasonCode` verdict (the sanctioned amend-saga pattern, same shape as `PosBillEditAction`) — not a gap |
| TransferDraftEditPanel -> TransferFormPanel | **was the XFER-001 gap — fixed above** |

No further ungated create/edit screen found in this pass. Ranked (none remaining
open after the fixes above; nothing else rose to "clear enough to fix blind"):
1. XFER-001 — FIXED
2. XFER-002 — FIXED
3. POS-011 — already fixed elsewhere in the shared tree, confirmed by code read
4. PUR-025/026 unknown-state polish — left open, reason above (LOW, not a dead end)

Not exhaustively swept: 148 files across the web app reference
`useHasPermission`/`usePermissionChecker` outside `/new`/`/edit` routes (list
toolbars, detail-page action buttons, nav items). Scoping this pass to the
create/edit routes named in the task (matching XFER-001/POS-011's own shape) was
a deliberate cut, stated here rather than claiming a full-app sweep I didn't do.

## What pins the class

`apps/web/src/components/__tests__/permission-gate.test.tsx` — 4 tests on the
primitive itself:
1. unknown state -> skeleton only, no form, no denial alert
2. denied state -> denial alert only, no interactive `button` role present
3. allowed state -> the form renders, no denial alert
4. an errored/paused query (`isSuccess: false`, no loading flag involved at all)
   is still treated as unknown, never as denied — the exact "unknown is not
   isLoading" bug, asserted directly against the mock shape a paused/errored
   TanStack query actually returns.

### Deliberate-break result (CONFIRMED)

Changed `if (!allowed)` to `if (false && !allowed)` in `permission-gate.tsx`
(forces the denial branch to fall through to the `allowed` children for every
verdict). Re-ran `npx vitest run permission-gate.test`:

```
FAIL  denied state: renders the denial alert, NEVER the interactive form
TestingLibraryElementError: Unable to find an accessible element with the role "status"
  <button type="button">Save transfer</button>   <- rendered instead
Tests  1 failed | 10 passed (11)
```

The break was caught immediately and specifically (the exact scenario the class
is about: an interactive control rendered for a denied user). Reverted the
one-line change; re-ran: `Test Files 2 passed (2) / Tests 11 passed (11)`.

No dedicated `TransferFormPanel` component test exists yet for the migrated
screen (no pre-existing test file for it); the primitive test above is the pin,
plus the live browser confirmation below stands in as the end-to-end check for
that specific screen (method rule 1: a green test is not proof of a fixed
user-facing bug — verified in-browser as well, not just via the unit test).

## Typecheck

`pnpm --filter @zerupt/web typecheck` (run once, full, at the end): **1
pre-existing error, unrelated to this work** — `src/features/audit/components/audit-panel.tsx(222,11)`,
a missing `actorDirectory` prop on `AuditTimelineProps`, from another concurrent
session's in-flight uncommitted diff in the shared tree (confirmed: neither
`permission-gate.tsx` nor `transfer-form-panel.tsx` appear anywhere in the
typecheck output). CONFIRMED my changes typecheck clean.

## Live verification

Logged in as **storekeeper1** (Zerupt.Test@2026) at
`http://gulf-auto-parts.localhost:3000/en/login`. CONFIRMED identity via
`/en/settings/profile`, which showed the account button labeled `storekeeper1: ST`
before drawing any conclusion (method rule 2).

Found an existing DRAFT transfer via SQL (`select id from stock_transfers where
status='draft' limit 1` -> `5aa0ee56-5678-43ec-81d3-5b7a919fd82d`; read-only,
created nothing) and navigated to
`/en/inventory/transfers/5aa0ee56-5678-43ec-81d3-5b7a919fd82d/edit`.

**CONFIRMED (en)**: page text was exactly
`Back to transfer / Edit draft transfer / You cannot edit this transfer / You do
not have permission to edit a stock transfer. Ask an admin to grant you inventory
transfer access.` — the interactive-elements snapshot showed only the app-shell
nav, no warehouse selects, no line grid, no item search box, no submit button.

**CONFIRMED (ar/RTL)**: same URL under `/ar/`, `document.documentElement.dir ===
"rtl"`; text was `العودة إلى التحويل / تعديل مسودة التحويل / لا يمكنك تعديل هذا
التحويل / ليس لديك صلاحية لتعديل تحويل مخزون. اطلب من المسؤول منحك صلاحية تحويل
المخزون.` — correct edit-verb Arabic copy, no interactive controls.

Did NOT live-verify POS-011 (cashier1 + till flow) — the browse daemon dropped
session repeatedly under load during this run (multiple `about:blank` /
`ERR_CONNECTION` resets, matching the brief's known-instability warning); after
several successful retries I prioritized confirming the actual code change
(XFER-001/002) rather than burning further retries on a screen whose fix was
already CONFIRMED by direct code read (both files explicitly cite PERM-004 and
gate the control on the correct permission key). POS-011 live check: **SUSPECTED
correct** (code-confirmed, not browser-confirmed this session).

## Ledger identity (data safety)

Read-only session throughout (SQL SELECT only, no writes; nothing logged to
`_documents-created.md` because nothing was created).

```
before: 0.000000
after:  0.000000
```

## Files touched

- `apps/web/src/components/permission-gate.tsx` (new)
- `apps/web/src/components/__tests__/permission-gate.test.tsx` (new)
- `apps/web/src/features/inventory/components/transfers/transfer-form-panel.tsx`
- `apps/web/messages/en/common.json`, `apps/web/messages/ar/common.json`
- `apps/web/messages/en/inventory.json`, `apps/web/messages/ar/inventory.json`
