# Phase D — Purchase Orders static audit (routes 86-89)

Scope: `/:locale/purchase/orders`, `/orders/new`, `/orders/:id`, `/orders/:id/edit`. Backend
`purchase/orders/*` module + DB. Method: STATIC (code read end to end) + DB read-only queries.
Browser and write-testing were OUT of scope this wave (shared browser session owned by another
agent); no documents were created, so `_documents-created.md` has no new rows and the balance
invariant was only checked once (pre-audit, `0.000000` — no writes made, so no post-check needed).

Read in full first: `_agent-briefing.md`, `_purchase-addendum.md`, `study/purchase/_hardening-log.md`
(program COMPLETE, all 6 layers shipped, 0 CRITICAL open on any layer).

## Files read

- Backend: `purchase-orders.controller.ts`, `purchase-orders.service.ts` (full, 1602 lines),
  `purchase-order-amend.adapter.ts` (referenced), `grns.service.ts` (targeted: PO status handoff),
  `direct-purchase.service.ts` (targeted, for divergence).
- Frontend: `orders-list-panel.tsx`, `order-create-panel.tsx`, `order-create-line-editor.tsx`,
  `order-detail-panel.tsx`, `order-header-editor.tsx`, `order-amend-panel.tsx`,
  `orders-export-dialog.tsx`, all four route `page.tsx` files under `[locale]/(app)/purchase/orders`.
- Shared: `packages/shared/src/permissions.ts` (permission-key parity check).
- i18n: `apps/web/messages/{en,ar}/purchases.json` (programmatic key-diff for the `orders.*` subtree).
- DB: Gulf Auto Parts tenant (live), read-only.

---

## Findings

### MEDIUM — CONFIRMED: PO/GRN/direct-purchase paths have never been exercised on the live tenant
`SELECT count(*) FROM purchase_orders` = **0**. `grns` = **0**. `direct_purchases` = **0**.
Meanwhile `purchase_invoices` = **296** (all created via the standalone 2-way-match invoice path —
`purchase_invoices.source_grn_ids` and `purchase_order_id`/`grn_id` FK columns are unused for every
row). This means the order-confirm, order-cancel, order-close, GRN-receipt, and the entire
order→GRN→bill handoff have **zero live data behind them** on Gulf Auto Parts — the tenant this
whole testing programme uses as its ground truth.

This is not a code defect (the hardening log itself lists "verify a full purchase cycle end-to-end
on a real dev tenant" as a founder go-live TODO from 2026-06-30, still open two months later) — it
is a real, confirmed coverage gap: nothing in this report about PO lifecycle correctness has been
validated against actual rows, only against the code path. Recommend the next wave (browser-enabled)
walks a live create→confirm→GRN→bill cycle as `storekeeper1`/`accountant1` before this module is
considered production-verified.

### FRICTION/MEDIUM — CONFIRMED: Orders list has no `placeholderData: keepPreviousData`
`apps/web/src/features/purchase/api/orders-queries.ts` `useOrdersQuery()` (line 29) takes no
`placeholderData` option, and `orders-list-panel.tsx` does not pass one at the call site either.
Changing page, page size, or any filter unmounts the table into `<TableSkeleton>` for the round
trip instead of keeping the old rows visible. This matches the cross-cutting item already open
("~30 list panels lack `placeholderData: keepPreviousData`") — purchase orders' list is one of them.
Not re-filing as a new issue, confirming purchase's share of the known item per the addendum's
instruction to note, not blind-fix.

### LOW — CONFIRMED (doc staleness, not a code bug): hardening log lists "manual PO-close endpoint" as still-deferred
`study/purchase/_hardening-log.md`'s "STILL OPEN — deferred capabilities" section lists "manual
PO-close endpoint" as not yet built. It is built: `PurchaseOrdersController.close()` →
`PATCH .../:id/close` → `PurchaseOrdersService.close()` (service, lines 1256-1281), gated on
`purchase.order.close`, allowed from `confirmed` or `received` (documented as "short-close" vs
"normal close"), audited via `@Audited("PurchaseOrder", { action: AuditAction.Update })`. The
frontend wires it too (`canClose` in `order-detail-panel.tsx`, gated on status AND permission).
Filing this as a documentation-currency note only — the capability itself is correctly built and
gated, just the log is stale.

---

## Non-findings (explicitly checked, no defect found)

- **Permission parity, route + button + backend, CONFIRMED.** `PERMISSION_KEYS.purchase.{orderCreate,
  orderRead, orderUpdate, orderList, orderConfirm, orderCancel, orderClose}` in
  `packages/shared/src/permissions.ts` map 1:1 to the exact `@RequiresPermission("purchase.order.*")`
  strings on every controller method (create/list/get/update/addLine/updateLine/removeLine/confirm/
  cancel/amend/close). Frontend gates each action button individually
  (`canConfirm = order.status === "draft" && canConfirmPerm`, same pattern for cancel/close in
  `order-detail-panel.tsx` lines 117-119, 266-268) — no button is rendered interactive-then-403.
- **Audit coverage, CONFIRMED by code (not by live row — see MEDIUM finding above).** Every mutating
  endpoint (`create`, `update`, `addLine`, `updateLine`, `removeLine`, `confirm`, `cancel`, `close`)
  carries `@Audited("PurchaseOrder", ...)`. `amend` deliberately omits the controller-level decorator
  with an inline comment explaining the amend saga runner writes its own document-keyed audit entries
  at finalize, to avoid a double-write — read the saga runner code path and confirmed this is a
  documented, intentional pattern also used by sibling supplier-payment/receipt-voucher amend flows,
  not an audit gap.
- **Branch scoping, CONFIRMED.** Every read/write path (`create`, `update`, `addLine`, `updateLine`,
  `removeLine`, `confirm`, `cancel`, `close`, `get`) calls `assertBranchAccess(order.branchId)` before
  acting; `list()` applies `branchScopeCondition("purchaseOrders")` in addition to
  `eq(purchaseOrders.tenantId, tenantId)`. No cross-branch leak path found in this controller.
- **No-tax-UI-in-Kuwait, CONFIRMED correct design (not hardcoded).** Tax column/note visibility is
  driven by `hasTaxGroups = (taxGroupsQuery.data?.data.length ?? 0) > 0` (server-derived, per legal
  entity) in `order-create-panel.tsx`, and by `order.taxMode !== "none"` (server-computed
  presentation mode, `resolveTaxPresentationModesBatch`) in `order-detail-panel.tsx` /
  `order-header-editor.tsx`. Kuwait naturally has zero tax groups, so the UI collapses correctly
  without any country-literal branch. POs are also deliberately pre-tax by design (tax settles at
  the bill) — confirmed this is documented intent, not an oversight, via the inline comment at
  `order-create-panel.tsx:278-280`.
- **KWD 3dp money, CONFIRMED structurally correct.** All display goes through the shared
  `formatMoneyAmount(value, currency, locale)` / `MoneyInput` / `getCurrencyDecimals(currency)`
  primitives — no local `toFixed(2)` or hand-rolled formatting found anywhere in the orders
  component tree. The server stores unit price at 6dp internal scale; the client explicitly
  normalizes to the order's currency precision on first render
  (`toCurrencyPrice(line.unitPrice, currency)`, with an inline comment explaining why — otherwise
  an untouched line would show 6dp forever). Could not additionally confirm the *rendered pixel
  value* in a live browser this wave (out of scope) — this is a structural, not a pixel-level, check.
- **i18n parity, CONFIRMED 100%.** Programmatic key-diff of `messages/en/purchases.json` vs
  `messages/ar/purchases.json` flattened to leaf keys: zero keys under `orders.*` present in one
  locale and missing in the other, in either direction.
- **No em dashes, CONFIRMED.** Grepped every `orders.*` string value in the English message bundle
  for `—`; zero matches.
- **Export construction, CONFIRMED sound.** `orders-export-dialog.tsx` builds its request from the
  list panel's live filter state (supplier/status/search) plus its own date range, debounces the
  count-preview query, aborts the download on dialog close, and — critically — reads the *client*
  half correctly: the server CSV has stable machine-key headers with no server-side i18n; the client
  downloads the raw file and rewrites ONLY the header row via `rewriteCsvHeader`, leaving every data
  row byte-for-byte untouched. This is the correct sequencing (read before trusting a translated
  export) and matches the direct-purchase export design named in the codemap.
- **Defensive UX, CONFIRMED present.** `order-create-panel.tsx` uses
  `useUnsavedChangesWarning` (warn-before-data-loss) and `useSeededDefaultBranchId` /
  `useBranchFieldLockState` (branch pre-filled from context rather than asked), consistent with the
  "defaults over questions" standard.
- **Path divergence (order vs direct), no NEW divergence found in the orders module itself** beyond
  the one already logged in the codemap gotchas (`DPU` doc-numbering constant absent from shared
  `DOCUMENT_TYPES`, pre-existing/known, not re-filed). PO status recompute on GRN confirm
  (`GrnsService.reevaluateOrderStatus`) is centralized and shared, not duplicated per path.

## Not evaluated this wave (explicitly out of scope, not silently skipped)

- Any live browser interaction (clicks, rendered pixels, actual toast/HTTP status pairing, RTL
  visual check, responsive breakpoints) — reserved for the browser-owning agent this wave.
- Real audit_log rows for PurchaseOrder (none exist — see MEDIUM finding).
- Server-side validation error copy content (would need a live 422/403 to inspect the actual
  message shown, not just the schema).
- `order-amend-panel.tsx` (the `/orders/:id/edit` amend flow) got a lighter pass than create/detail
  given the effort budget — its permission gate (`purchase.order.cancel`, matching the controller),
  tax-group carry-through comment, and PIN/approval wiring were read and look consistent with the
  documented amend-saga pattern, but line-by-line logic inside the 30KB file was not fully traced.
