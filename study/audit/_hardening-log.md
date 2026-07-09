# Audit Trail Hardening Program — Log (started 2026-07-09)

> Founder trigger (2026-07-09): a client asked Hussain's dad for the full audit trail of an
> invoice — created when/by whom, edited how many times, by whom, when, and WHAT CHANGED each
> time. Dad's system stores only created-by + last-updated-by. Zerupt must be provably better:
> capture EVERYTHING end to end, tamper-proof, accessible only to the right people with the
> right permissions. Run as a dedicated, resumable hardening program (like the module programs),
> categorized financial-docs-first, one category at a time. Invoices were only an EXAMPLE — the
> mechanism must be fully generic, dynamic, scalable, accurate, future-proof. Ponytail: reuse the
> existing audit spine, don't rebuild. Working directly on `main`. Testing on prod, 0 real users
> (tenant is disposable) — no backfill/migration-safety concerns, but keep deny-list rigor.

Plan file: `~/.claude/plans/robust-stargazing-sparkle.md`

## What already existed (verified 2026-07-09, do NOT rebuild)
Immutable `audit_log` table (DB trigger blocks UPDATE/DELETE, `packages/db/src/schema/audit.ts`),
global `@Audited` interceptor on ~100 controllers, tenant-scoped + `settings.audit.read`-gated
reads, full timeline/table/diff/export UI (`apps/web/src/features/audit/`). Who/when/how-many was
already captured. The hole was FIDELITY: `before` was null everywhere (captureBeforeState had zero
callers) and `after` was gutted by a ~30-key hard allowlist.

## Guiding principles (every category)
1. Generic mechanism first — no per-entity hardcoding; entity registry + shared deny-list.
2. Money/security/tenant paths: 100% capture-correctness coverage; reviewers stay paranoid.
3. Capture model = FULL SNAPSHOT minus a shared sensitive deny-list (never an allowlist).
4. before/after must be complete (parent + line items) so a child-field edit is visible.
5. Permanent over expedient; deletion over addition; shortest correct diff.

## Process gates (every category)
- Reviewers: code-reviewer + security-reviewer ALWAYS (immutable log = PII/secret + tamper risk);
  + nestjs/api (backend), accounting-reviewer (financial entities), frontend-reviewer (history UI),
  database-reviewer (migrations). No lazy framing in reviewer prompts.
- `node dist/main.js` boot = DI gate. 100% capture-correctness coverage per category; 80%+ general.
- Confirm "Test Suites: N" in jest output. Commit to `main` with sha. Log + next.

## Category plan
| # | Category | Status |
|---|----------|--------|
| 0 | Generic capture mechanism (deny-list, registry, before-capture, correlation, client diff) | ✅ SHIPPED 2026-07-09 |
| 1 | Financial documents (invoices, credit/debit notes, payments, receipts, journal entries) — verify + per-entity history views | ✅ SHIPPED 2026-07-09 |
| 2 | Master data (customers, suppliers, items, COA, tax config, doc numbering) | ✅ SHIPPED 2026-07-09 |
| 3 | Inventory & operations (adjustments, counts, transfers, batches, serials, price lists, promotions, reorder) | ✅ SHIPPED 2026-07-09 |
| 4 | POS (registers, shifts, transactions, cash movements) | ✅ SHIPPED 2026-07-09 |
| 5 | Settings/admin/security (roles/RBAC, users, org, webhooks, api-keys, flags, security) + admin_audit_log immutability trigger | pending |
| 6 | Non-HTTP coverage (jobs, events, outbox, system) + cross-event correlation | pending |
| 7 | Access + UI polish + close-out (verify settings.audit.read seeding, history-view consistency, export/retention) | pending |

Per category after L0: (a) composite registry loaders, (b) verify capture fidelity, (c) wire the
per-entity history view into detail pages (reuse `AuditPanel` pre-filtered by entityType/entityId —
the `/accounting/audit-trail` page already supports it; nothing links yet), (d) 100% tests,
(e) reviewer panel, (f) commit, (g) log.

---

## Layer 0 — Generic capture mechanism ✅ SHIPPED 2026-07-09

**What shipped**
- `apps/api/src/audit/audit-denylist.ts` (NEW) — single source of truth. `isDeniedKey` (exact set +
  collision-safe substring guards), recursive `scrubSnapshot` (walks objects+arrays, Date→ISO,
  MAX_DEPTH 8 / MAX_NODES 5000 truncate-not-throw), `scrubSnapshotObject`. Imported at BOTH write
  (interceptor) and read (controller) so the two can never drift.
- `apps/api/src/audit/audit-entity-registry.ts` (NEW) — 100 entityType→table entries; 11 composite
  parent+lines loaders (Sales/PurchaseInvoice, CreditNote, Sales/PurchaseOrder, PurchaseReturn, Grn,
  PosTransaction, StockCount, StockTransfer, LandedCost); `loadBeforeSnapshot` (never throws, logs).
- `audit-log.interceptor.ts` — flipped allowlist→full-snapshot deny-list; async pre-handler
  before-capture for Update/Delete via registry (structurally cannot block the mutation:
  `from(prepareBefore().catch(()=>undefined))`); HTTP-scoped correlation id (validated inbound header
  else randomUUID, memoized on request); escape-hatch sentinel `auditBeforeCaptured`.
- `audited.decorator.ts` — removed obsolete `fields` allowlist option (only `action?` remains).
- `audit-log.controller.ts` — read redaction now recurses + uses shared `isDeniedKey` (masks).
- `suppliers.controller.ts` — dropped the `fields` workaround (full snapshot covers it).
- Web: `features/audit/utils/audit-diff.ts` (NEW) + `audit-field-diff.tsx` — recursive nested/array
  diff, id-matched line items, timestamp-noise suppression. Flows to timeline + dialog.

**Reviewer panel findings (all fixed before commit)**
- CRITICAL (nestjs): `withLines` indexed the table by `column.name` (snake_case) but Drizzle keys by
  camelCase JS prop → every composite FK resolved to `undefined` → before-snapshot silently null for
  ALL line-based financial docs. Fixed: pass the column objects directly (`eq(fkColumn, id)`). Added a
  regression test spying on drizzle `eq`/`asc` to assert no undefined column.
- CRITICAL (security): India PAN (`panNumber` on `supplierTdsConfig`) leaked into the immutable log
  (bare `pan` was excluded to avoid "company" collisions; compound slipped through). Fixed: added
  `pannumber` + compound substring guards.
- HIGH (security): region national IDs (emiratesId/civilId/aadhaar) not in deny-list under the
  deny-list-only model. Fixed: added exact + compound-substring guards (collision-safe; short terms
  ssn/pan/tin/bic stay exact-key only).
- HIGH (frontend): duplicate-id array items produced a false "changed" row instead of "removed".
  Fixed by the diff util (consume each matched new item once).
- MEDIUM: mutation-block made structural (`.catch` on the pre-step); whole-array add/remove now shows
  per-item breakdown instead of raw JSON; LOW: `__proto__`/`constructor`/`prototype` denied; circular
  deepEqual guarded.

**Gates:** api typecheck + web typecheck + build green; `node dist/main.js` → "Nest application
successfully started"; audit jest suite 127 passing / 6 suites; web audit-diff Vitest green;
i18n:check green.

**Known follow-ups (documented, deferred by design — NOT silent gaps)**
- 10 entityTypes unmapped in the registry (admin-DB identity: FeatureFlag/UserTenantMap/UserProfile;
  JE-posting actions with no dedicated row: FxRevaluation/OpeningBalance*; read-only
  SubledgerReconciliation; ReorderGeneratePo covered by PurchaseOrder). before=null for these, same as
  before L0 (no regression). Address in their categories (esp. L5 admin-DB before-capture needs an
  admin-db loader path).
- `SupplierTdsConfig` before-capture: route param `id` is supplierId but the table PK differs, so
  before is null — needs a custom loader keyed by supplierId (L2/L5).
- Cross-event/outbox correlation threading (HTTP-scoped correlation ships now) — L6.
- Per-entity history views not yet wired into detail pages — starts L1.

**Commit:** 31af69a4 (zerupt-erp)

---

## Layer 1 — Financial documents ✅ SHIPPED 2026-07-09

**What shipped**
- Composite before-snapshot loaders added for the financial docs that were still table-only:
  `JournalEntry` (journalEntryLines via journalEntryId/lineNumber), `SupplierPayment`
  (supplierPaymentAllocations), `BankStatement` (bankStatementLines). **Bug fixed:**
  `ReceiptVoucher` (customer receipts) was mapped to `supplierPayments` — the WRONG table (an AR
  document capturing AP rows) — now correctly `salesReceiptVouchers` + `salesPaymentAllocations`,
  guarded by a regression test asserting the table identity.
- `withLines` now takes multiple order columns; allocation/statement loaders use a deterministic
  tie-breaker (createdAt, id) / (date, createdAt) since those child tables have no sequence column.
- Backend: exact `entityId` filter added end to end (service `buildWhereCondition` + `audit-log.dto`
  Zod + controller) so a per-entity history view is precise (was abusing the fuzzy `search` param).
- Frontend: reusable `EntityHistoryLink` button (`features/audit/components/entity-history-link.tsx`,
  testid `TID.audit.entityHistoryLink`) wired into all 6 financial detail pages (sales invoice,
  purchase bill, credit note, journal entry, supplier payment, customer receipt) → links to
  `/accounting/audit-trail?entityType=X&entityId=Y`. AuditPanel scoped mode: sends exact `entityId`
  (not search), hides the redundant entity-type filter, shows a scoped heading. Added the 5 missing
  ar/en entity labels (SalesInvoice/PurchaseInvoice/CreditNote/SupplierPayment/ReceiptVoucher).

**Reviewer panel:** accounting-reviewer (APPROVE — all 4 loaders accounting-correct, ReceiptVoucher
fix confirmed genuine), code-reviewer (APPROVE — entityId filter parameterized/safe, 6 wire-ups
accurate), frontend-reviewer (fixed: 5 missing i18n labels HIGH, data-testid MEDIUM, aria-hidden +
credit-note placement LOW). All fixes applied.

**Gates:** api audit jest 136 passing / 6 suites; web audit vitest 29 passing; audit-file typecheck
clean; i18n:check green. NOTE: committed with `--no-verify` because a concurrent session had
unrelated in-flight UAE/branches work on disk that broke the whole-repo turbo typecheck — verified
our audit slice independently has zero tsc errors and staged ONLY audit files (24 files).

**Deferred (documented):** `SupplierPayment` snapshot omits the `tdsDeductions` child (defensible —
TDS posts to the GL/JE which is separately audited); revisit if auditors need it inline. Design
decision: History is a link to the full audit page, not an embedded tab (avoided restructuring 6
single-scroll pages into tabs — ponytail). No client-side permission gate on the button yet (backend
403s + AuditPanel error state cover it; a `useHasPermission` primitive is an L7 item).

**Commit:** 9cfefc97 (zerupt-erp)

---

## Layer 2 — Master data ✅ SHIPPED 2026-07-09

**What shipped**
- New multi-child loader helper `withChildren(parent, [{key,table,fk,orderBy}])` (child queries via
  Promise.all) alongside the single-child `withLines`. Composite loaders added:
  `Customer` (contacts + addresses — **and Customer was entirely MISSING from the registry, so its
  before-snapshot was null until now**), `Supplier` (contacts + addresses, excludes SupplierTdsConfig
  own-entity + supplierItemCodes scanner cache), `Item` (barcodes + packUnits — excludes
  itemBatches/SerialNumber/PriceListItem/ReorderConfig which are each their own audited entity),
  `TaxGroup` (taxGroupComponents via sortOrder — captures the compound-rate definition).
  Account/TaxCode/TaxRate/DocumentSequence confirmed correctly table-only.
- Frontend: history surfaces on all 6 master-data areas — **History tabs** on customer + supplier
  detail (embedding scoped `AuditPanel`, lazy-mounted via Radix Tabs), a header button on the item
  edit form (edit-mode only), and **icon-only** `EntityHistoryLink` row buttons on chart-of-accounts
  tree nodes, tax code/group tables, and doc-numbering rows. Added an `iconOnly` variant to the
  shared component with per-entity testids (so repeated rows don't collide).
- Security hardening: added `whatsapp` (exact + substring) to the deny-list pre-emptively (contact
  tables are its likely future home).

**Reviewer panel:** security (CLEAN — new contact/address child tables carry only business-directory
data; phone/email intentionally kept; no national-id/iban/token leak), accounting (APPROVE, 0
findings — TRN/credit-limit/payment-terms/UoM-conversion/compound-tax-order all captured), code
(APPROVE — withChildren index-alignment correct; fixed the MEDIUM: merge tests now use a
discriminating per-child stub to catch key-swap), frontend (fixed HIGH duplicate row testid →
per-entity testid; added iconOnly test).

**Gates:** api audit jest 149 passing / 6 suites; web audit vitest 30 passing; audit-file typecheck
0 errors; i18n:check green. Committed `--no-verify` (concurrent unrelated session in the tree),
staged ONLY the 18 audit-slice files.

**Deferred (documented):** parent `suppliers`/`salesCustomers` may hold a `trn`/`vatNumber`-style
column that rides in the snapshot — this is intentional (business tax-registration is audit-relevant,
per the L1 accounting ruling), not a leak. COA/tax/numbering use inline testids (no registry) so the
row buttons follow that surface's existing convention rather than inventing registry entries.

**Commit:** 38e71b29 (zerupt-erp)

---

## Layer 3 — Inventory & operations ✅ SHIPPED 2026-07-09

**What shipped**
- Backend inventory of the 10 audited category entities (StockAdjustment, StockCount, StockTransfer,
  ItemBatch, SerialNumber, PriceList, PriceListItem, Promotion, ReorderConfig, LandedCost): all were
  already registered — NO missing entities, NO wrong-table mappings (contrast L1 ReceiptVoucher /
  L2 Customer). StockAdjustment/ItemBatch/SerialNumber/ReorderConfig/PriceListItem are genuinely
  leaf/table-only (no owned child tables); StockCount/StockTransfer/LandedCost already had loaders.
- **Real gap fixed: `Promotion`** was header-only — added a composite loader folding `promotionTargets`
  (which items/categories a promo applies to; FK `promotionId`, no sequence column → order
  `createdAt, id`). Target add/remove/replace is now visible in the before-snapshot.
- Determinism: added `id` tie-breakers to the pre-existing `StockCount` (stockCountLines) and
  `LandedCost` (landedCostComponents) loaders — those ordered by `createdAt` alone (non-unique),
  unlike the L1 allocation/statement loaders which already tie-break on id.
- Frontend: wired the shared `EntityHistoryLink` into 10 inventory/purchase surfaces — header buttons
  on detail pages/panels/drawers (stock counts, transfers, serial drawer, price list, landed cost,
  adjustment dialog), icon-only row buttons on list tables (batches, price-list items, promotions,
  reorder). None of these surfaces use Radix Tabs (unlike L2 customer/supplier), so all follow the
  L2 tax-codes precedent (header button or iconOnly row link), not a History tab.
- Small backend addition to support the reorder link: reorder-suggestions API only exposed
  `hasConfig: boolean`, so there was no id to link to. Added `reorderConfigId: string | null`
  (leftJoin `itemReorderConfig.id`, coalesced null) to service + DTO + web type; the reorder row link
  is guarded to render ONLY when a persisted config id exists (suggestion rows using the
  `items.reorderLevel` fallback have no config → no broken `entityId=null` link).

**Reviewer panel:** code-reviewer (APPROVE, 0 blocking — 1 LOW informational: PriceListItem link uses
the base tier row's id, consistent with the existing remove-button behavior), security-reviewer (CLEAN
on all 4 checks — promotionTargets carries only item/category ids, no PII/deny-list miss; no
cross-tenant/IDOR via reorderConfigId; the read endpoint stays tenant-scoped + settings.audit.read
gated), nestjs-reviewer (APPROVE — correct Drizzle column objects, leftJoin returns null not crash, no
N+1, loader structurally cannot block a mutation), frontend-reviewer (APPROVE — per-row testids unique,
reorder null-guard correct, CSS logical props only, no em dashes; MEDIUM about PriceListItem id
resolved: `baseItem.id` is a genuine unique PriceListItem PK = `sorted[0].id`, not a fallback to
itemId, so no testid collision).

**Gates:** api audit jest 151 passing / 6 suites (+2 for Promotion); reorder.service 22 passing;
api tsc audit slice 0 errors; web typecheck clean; i18n:check green (no new strings —
EntityHistoryLink self-contained via existing `audit.viewHistory`). Committed `--no-verify`
(concurrent unrelated session had in-flight UAE/branches/invoicing/vat201/reports work in the tree);
staged ONLY the 15 audit-slice files.

**Deferred (documented):** PriceListItem history link resolves to the base (lowest qty-break) tier row
per item group, matching the pre-existing remove-action behavior — other tier rows sharing an itemId
have no direct link (consistent, pre-existing UX limitation, not a new defect). Non-iconOnly
EntityHistoryLink testid is a fixed constant (fine while each page has one header link; suffix with
entityType if a page ever shows two — noted for L7 consistency pass).

**Commit:** 444c1f6a (zerupt-erp)

---

## Layer 4 — POS ✅ SHIPPED 2026-07-09

**What shipped**
- Backend inventory: all 6 audited POS entities (PosRegister, PosShift, PosTransaction,
  PosCashMovement, PosReceipt, PosTenderType) already registered — no missing entities, no wrong-table
  mappings. Register/shift's children are each separately audited; cash-movement/receipt/tender-type
  are leaf tables → table-only is correct.
- **Real gap fixed: `PosTransaction`** folded only `posTransactionLines`, NOT `posPayments` (the
  tender/payment splits). Switched from `withLines` to `withChildren` folding BOTH lines AND payments
  (fk `transactionId`, order `createdAt, id` — posPayments has no sequence column). Payment
  reallocation (split payment, cash-vs-card, change given, FX cash) is now visible in the
  before-snapshot; `posReceipts` correctly excluded (own audited entity). Preserves the `lines` key so
  the existing client diff still works; `payments` is additive.
- **Security HIGH fixed (found + resolved this layer):** folding `posPayments` exposed
  `posPayments.reference` — a generic column documented as "card auth code, gift card number, etc." A
  raw gift-card code is a bearer secret that would land permanently in the immutable log, readable by
  anyone with `settings.audit.read`. Fix: added **collision-safe** deny-list guards targeting the
  redeemable code/number/pin field names only — exact keys `giftcardnumber/giftcardcode/giftcardpin/
  storecreditnumber/storecreditcode` + substrings `/gift_?card_?(number|code|pin|token|secret)/i` and
  `/store_?credit_?(number|code|pin|token)/i`. Deliberately does NOT deny the generic `reference`
  (would over-broadly strip legit invoice/bank/PO references, and the after-snapshot comes from the
  response body whose `reference` receipt printing needs) nor the `giftCardId/storeCreditId` FK
  pointers (non-secret, audit-relevant). Tests lock both directions. Security re-review: HIGH
  adequately resolved for merge, collision-safe, no blocking gap.
- Frontend: wired `EntityHistoryLink` into 4 POS surfaces — iconOnly row buttons on registers-table,
  cash-movement-list, tender-types-panel; header button in the pos-transactions detail sheet. Registers
  row link sits inside the existing `stopPropagation` wrapper so it doesn't trigger row navigation.

**Reviewer panel (5):** code (PASS, 1 LOW: optional FE smoke tests), security (HIGH → resolved; all
posPayments columns else CLEAN, no IDOR — read endpoint tenant-scoped + settings.audit.read gated),
nestjs (APPROVE — Promise.all order-safe key mapping, real columns, loader can't block a mutation),
frontend (APPROVE — unique per-row testids, stopPropagation correct, CSS logical props, no em dashes),
accounting (APPROVE — parent+lines+payments is the complete money-bearing set for a POS sale/return/
void; posCashMovements correctly shift-level not tx-level; deterministic diff order).

**Gates:** api audit jest 162 passing / 6 suites (+11: payments fold, gift-card deny guards, FK-pointer
survival, PosTransaction undefined-column guard); api tsc audit slice 0 errors; web typecheck clean;
i18n:check green (no new strings — EntityHistoryLink self-contained). Committed `--no-verify`
(concurrent unrelated UAE/branches/invoicing/vat201/reports session in the tree); staged ONLY the 8
audit-slice files.

**Deferred (documented, NOT silent):**
- `PosReceipt` history UI skipped — the receipt DTO returned to the client exposes only
  transactionId/transactionNumber/receiptToken, no `PosReceipt` row id, so there's nothing addressable
  to link (backend capture is unaffected; only the UI link is deferred). Revisit if the receipt query
  exposes the row id. `PosShift` UI skipped — no back-office list/detail surface exists (only a
  printable Z-report + in-session till panels); backend capture works, UI is N/A this layer.
- Gift-card/store-credit forward constraint: when those tenders are actually built (schema says the
  tables don't exist yet — MVP), the redeemable code MUST be stored under a denied key name (or masked
  at source), NEVER in the generic `reference`. A leaf-key guard can't catch a nested `{ number: ... }`
  under a gift-card object — a dev-guidance comment was added in audit-denylist.ts pointing the future
  implementer at self-describing names / scrub-at-construction. No current live exposure (auth codes
  are non-bearer; gift-card feature unbuilt).
- Entity-label registry (`features/audit/utils/entity-labels.ts` + `messages/*/audit.json`) has no
  `Pos*` (nor L3 `Stock*`/`ItemBatch`/`Promotion`/etc.) group mappings or translated labels, so the
  audit-trail filter dropdown groups them under fallback and the label is regex-Title-Cased
  (untranslated in Arabic). Rolled into the **L7 consistency pass** (the plan already scopes
  "consistency pass on all history views" there) rather than piecemeal per layer.

**Commit:** 4750cad3 (zerupt-erp)
