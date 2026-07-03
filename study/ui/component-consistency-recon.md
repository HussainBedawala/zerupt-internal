# Component Consistency Recon — Combobox family + Money/Quantity primitives

> Read-only recon, 2026-07-03. 7 parallel subagents (1 canonical inventory + 6 module sweeps).
> NO implementation yet. This is the drift map + a proposal to make the canonical
> components more dynamic before any migration pass.

---

## 0. Canonical "source of truth" (what everything SHOULD use)

### Combobox / entity-picker family
- `components/async-combobox.tsx` — `AsyncCombobox<T>` — server-search, single-select, debounced, `hasMore`, barcode `onScan`, `renderCreateRow`. The canonical async picker for large datasets.
- `components/searchable-combobox.tsx` — `SearchableCombobox<T>` — client-filter over a pre-fetched `options[]`, `creatable`, `clearable`. For bounded lists.
- `components/multi-select-list.tsx` — `MultiSelectList` — presentational multi-select checklist (no typeahead).
- Thin entity wrappers already built: `CustomerCombobox`, `SupplierCombobox`, `BankAccountCombobox`, `BranchCombobox`, `TaxGroupCombobox`, `AccountPicker` (wraps AsyncCombobox), `ItemSearchCombobox` (wraps AsyncCombobox, returns `PickedItemFull` incl. `quantityDecimals`).
- NOT on the shared primitives (bespoke): `BrandCombobox`, `UnitCombobox` (free-text soft-normalize) + `LineUnitPicker` (shadcn Select).

### Money / quantity precision family
- `lib/money-format.ts` — `formatMoneyAmount`, `formatMoneyWithSymbol`, `moneyDecimals`.
- `lib/currency-precision.ts` — `getCurrencyDecimals`, `formatToDecimals`.
- `lib/quantity-format.ts` — `formatQuantity`, `resolveQtyDecimals`, `qtyStep`, `normalizeQtyToDecimals`, `MAX_QUANTITY_DECIMALS=6`.
- `components/money-input.tsx` — `MoneyInput` (currency-aware, normalize-on-blur).
- `components/quantity-input.tsx` — `QuantityInput` (per-item `quantityDecimals`-aware).
- DB: `items.quantity_decimals smallint (0..6)`.
- **ESLint guardrail** (`eslint.config.js`): bans literal `toFixed(n)` / `min|maxFractionDigits` — but ONLY under `features/{pos,pos-transactions,sales,sales-orders,invoices,purchase,inventory,customers,journal-entries,bank-reconciliation,cheques}`. Everything else is unguarded → that's exactly where the worst drift lives.

Reference implementations that already do it right: `features/inventory/components/items-table.tsx` (both concerns), `features/sales/.../invoice-line-search.tsx` (ItemSearchCombobox), `bank-reconciliation/reconciliation-workspace.tsx` (formatMoneyAmount).

---

## 1. Cross-cutting themes (the real story)

The two "COMPLETE" programs (combobox consolidation, decimal hardening) built the primitives and migrated the *headline* forms, but adoption is uneven. The drift clusters into a few systemic gaps:

### T1 — Missing shared entity pickers (forces everyone to hand-roll `<Select>`)
| Missing picker | Demand (sites) | Where |
|---|---|---|
| **WarehouseCombobox / LocationPicker** | ~17 | inventory (10+), sales (3), purchase (4), import (2), sami (2) — **highest ROI** |
| **CurrencyPicker** | ~4 | customer/supplier `defaultCurrency` (free-text!), pair-selector, exchange-rate |
| **LegalEntityPicker** | ~4 | taxation dialogs ×3 (raw `<select>`), reports (already shadcn) |
| **PriceListPicker** | 2 | customer-form, price-list dialogs |
| **UserPicker** | 1 | audit toolbar (raw `<select>` over users) |
| **CategoryPicker (tree-aware)** | 2 | category-dialog, category-delete reassign |

### T2 — `MoneyInput` / `QuantityInput` under-adopted
- **Purchase: ZERO usage** across 12 files (~28 raw `<Input inputMode="decimal">`, several re-implementing MoneyInput's blur-normalize).
- Inventory: ~13 raw money/qty inputs. Sales: 5. Accounting: 2 groups. Settings: 3.
- Root cause enabler: several fields hand-compute `step = Math.pow(10,-decimals)` / build regexes from `getCurrencyDecimals` — i.e. they *want* MoneyInput but the primitive doesn't cover their case (currency prefix, controlled RHF, null currency).

### T3 — Duplicate `formatMoneyAmount` reimplementations (multiple sources of truth)
- `pos-transactions/lib/display.ts` (`displayMoney`, comment admits divergence)
- `general-ledger/utils/format.ts` (`formatAmount`/`formatBalance`)
- `trial-balance/trial-balance-table.tsx` (`formatAmount`)
- `journal-entries/balance-indicator.tsx` (`formatAmount`)
- 4× import previews (`inventory-*-preview.tsx`, `books-parties-preview.tsx` — identical `fmtAmount`)
- purchase KPI strips (bypass `formatMoneyWithSymbol` by concatenating code + `formatMoneyAmount`)
→ ~10 duplicate formatters, all deletable in favor of the canonical lib.

### T4 — Native raw `<select>` stragglers (worse than shadcn Select)
accounting `account-dialog`, taxation dialogs ×3, `country-quick-setup`, `branch-dialog`, `tb-decision-cards`, `tb-coa-preview`, `audit-toolbar`, import previews.

### T5 — Bespoke comboboxes off the primitive family
`BrandCombobox` + `UnitCombobox` (free-text) — candidates for a `SearchableCombobox` freeform mode.

### T6 — Correctness smells (not just style)
- `stock-count-sheet-panel.tsx:44` — `toFixed(6)` stepper ignores the item's `quantityDecimals` (0-decimal item can get fractional counts).
- `reorder-suggestions-panel.tsx:60` — same hardcoded-6 trim.
- `bill-create-line-editor.tsx:74` — `Number(qty) * Number(price)` float multiply on money before formatting (precision risk on large invoices).
- `returns/return-create-panel.tsx:123` — `toFixed(6)` qty instead of qty-precision helper.

### T7 — Hardcoded `"KWD"`/`"USD"` currency fallbacks
`landed-cost-create`, `purchase-overview`, `step3-accounting`, `tb-import-dialog` — should resolve tenant default currency, not literal.

### T8 — No `formatPercent` / `RateInput` primitive
Tax rates (`.toFixed(2)%` ×4 in taxation), tax-rate-derived percents in sales detail panels, FX rate 10dp inputs — each hand-rolls precision. Legit domain (rates ≠ currency money) but no shared helper exists.

---

## 2. Per-module finding counts

| Module | Concern A (pickers) | Concern B (decimals) | Notes |
|---|---|---|---|
| POS | 1 real (item-search trio) + ~15 OK enums | 4 (1 dup formatter + 3 raw money inputs) | money math already precision-correct |
| Sales | 7 real + 3 warehouse (blocked on T1) | 9 (4 percent toFixed + 5 raw inputs) | lags Purchase on branch/bank migration |
| Purchase | 2 real (landed-cost branch, warehouse gap) | ~28 (MoneyInput/QuantityInput ZERO usage) | user's bill-form report = Concern B here |
| Inventory | 1 raw select + ~14 entity-Selects + 2 bespoke | 13 (incl. T6 correctness) | WarehouseCombobox demand epicenter |
| Accounting | 6 (native `<select>` + LegalEntity ×3) | 5 (3 dup formatters + 2 raw input groups) | journal-entry money input hand-rolled |
| Settings/misc | 8 real + 9 OK enums | 7 (4 dup fmtAmount + 3 raw inputs) | defaultCurrency free-text is worst |

Approx **~100 actionable findings**, but they collapse into the ~8 themes above — most are the same handful of missing primitives repeated across sites.

---

## 3. Proposal — make the canonical components more dynamic FIRST

Migrating 100 sites onto primitives that don't fit their cases just moves the hand-rolling inside wrappers. Recommended order: **extend the primitives, then sweep.**

### New shared components to build
1. **`WarehouseCombobox`** (wrap SearchableCombobox or AsyncCombobox) — branch-scoped filter prop. Unblocks ~17 sites. Highest ROI.
2. **`CurrencyPicker`** — over `useCurrenciesQuery`; replaces free-text `defaultCurrency` + pair-selector duplication.
3. **`LegalEntityPicker`** — over `activeEntities`; taxation dialogs + reports.
4. **`PriceListPicker`**, **`UserPicker`**, **tree-aware `CategoryPicker`** — smaller, same shape.

### Extend existing primitives
5. **`MoneyInput`**: add optional `currencyPrefix`/symbol affordance (record-payment hand-rolls it); handle `currency == null` internally (serial-numbers fallback); confirm it plays with react-hook-form controlled usage (journal-entry, bill lines) so adoption is a straight swap.
6. **Expose `moneyStep(currency)` from `money-format.ts`** so components stop inlining `Math.pow(10,-decimals)` / building regexes.
7. **`QuantityInput`**: make per-item `quantityDecimals` threading the default path; add a shared stepper util so `stock-count-sheet` / `reorder` stop using `toFixed(6)` (fixes T6 correctness).
8. **`SearchableCombobox` freeform mode** — absorb `BrandCombobox` + `UnitCombobox` into the family (or formally document them as intentional exceptions).
9. **`AccountPicker` `headerOnly` filter mode** — unblocks account-dialog parent picker.
10. **New `formatPercent` + optional `RateInput`** primitives — for T8 (tax rates, FX rate, derived percents).

### Guardrail
11. **Widen the ESLint decimals rule** to cover `general-ledger`, `trial-balance`, `taxation`, `locations`, `accounts`, `settings`, `*-import`, `reports` — the currently-unguarded dirs are exactly where drift persists. Add a lint rule (or knip pass) to flag new hand-rolled money formatters.

### Sweep order after primitives land
Purchase (T2, biggest + user-reported) → duplicate-formatter deletions (T3, mechanical, safe) → warehouse/currency/legal-entity picker swaps (T1) → correctness fixes (T6) → native-select cleanup (T4) → bespoke combobox merge (T5).

---

## 4. VERIFICATION PASS (2026-07-03) — go/no-go per change

> Second recon: 5 subagents stress-tested each proposed change for behavior-preservation
> against the already-tested modules. Several "safe mechanical wins" turned out NOT to be.
> This section OVERRIDES the optimistic sequencing above.

### 🔴 STOP-SHIPS — do these prerequisites first or you WILL regress tested screens

**P1 — Currency-decimals has a 3-way disagreement. Do NOT dedup formatters (T3) until unified.**
Deleting the duplicate `formatMoneyAmount` copies and routing to canonical would silently change decimals on tested GL / Trial Balance / Journal Entry screens:
- Canonical `getCurrencyDecimals` (Intl/CLDR): IQD→**0**, JPY→0 (Intl-correct but wrong for IQD per app domain).
- `pos-transactions/display.ts` (static): IQD→**3** ✅ matches app's own `apps/api/src/common/country-currency.ts` (`IQ: decimals 3`). This "duplicate" is the *correct* one — DO NOT DELETE.
- `@zerupt/shared` `CURRENCY_DECIMALS` (used by GL/TB/JE/balance-indicator): only 7 currencies mapped, everything else silently falls to 2dp (IQD, JOD, TND, LYD, JPY all wrong today).
→ **Fix first:** create ONE source of truth for currency minor-units (reconcile canonical + `@zerupt/shared` + `country-currency.ts`), with an explicit ISO-4217 override table for currencies where Intl/CLDR disagrees (at least IQD). THEN convert the GL/TB/JE/import formatters to canonical. Deleting before this = financial-display regression.
- Purchase KPI strips (`supplier-kpi-strip`, `purchase-overview-kpi-strip`) are NOT duplicates — already canonical; `${code} ${amount}` vs symbol is a deliberate presentation choice (foreign-currency disambiguation). Leave them.

**P2 — Uncommitted work collides with the Purchase refactor.**
`erp/` has 5 uncommitted files in `purchase/payments` (supplier-payments dto/service, payment-detail-panel, reverse-payment-dialog, purchase/types.ts) on `main`, with active recent commits in the same area. **Commit or stash before starting** — the T2 Purchase sweep edits the same files.

**P3 — `landed-cost-create-panel.tsx:91` `?? "KWD"` is a REAL financial bug, not a style nit.**
That fallback flows into the create-mutation *payload* (line 146), so a non-Kuwait tenant can silently submit a landed-cost record tagged `KWD` during the entity-load window. Fix as a correctness bug (resolve tenant functional currency, fail-safe), separate from the cosmetic cleanup. (`purchase-overview-panel` same pattern but display-only = lower severity. `step3-accounting` fallback is safe. `tb-import-dialog ?? "USD"` should derive from tenant functional currency for GCC.)

### 🟡 SAFE ONLY WITH ADAPTERS — no money/qty input is a zero-risk drop-in

`MoneyInput`/`QuantityInput` require `value:string` + `onChange:(string)=>void`, force `type="text"`, and normalize-on-blur only when valid. Consequences:
- **POS `pay-surface` tender input: EXCLUDE from the batch.** It's `type="number"` (→ native keypad/validation change), live cash-drawer split-tender, blur-normalize could alter in-progress amount. Needs its own scheduled regression pass, not a mechanical swap.
- **Only 2 sites are already-equivalent (lowest risk):** `bill-create-line-editor` unitPrice, `adjustment-form` unitCost (the latter was itself a hardening fix — verify live before/after).
- **All qty fields (direct-sale, adjustment, bill lines)** branch on pack-unit dual-mode (`unitPackId`) — write that value/onChange binding pattern ONCE, reuse; don't re-invent per site.
- **`manual-journal-entry-form` + `item-form-panel`:** RHF `{...field}` must NOT be blind-spread onto MoneyInput; `onValueCommit` fires only on valid blur, so autosave/`priceOverridden` logic must stay on the passthrough `onBlur`. Document as a house rule. Verify `normalizePriceOnBlur` ≡ `formatToDecimals`+`getCurrencyDecimals` before swapping item-form.
- **Extend primitives first:** MoneyInput optional currency-prefix affordance + `null`-currency handling; export `moneyStep(currency)`; QuantityInput shared stepper util (fixes T6 `toFixed(6)`-ignores-`quantityDecimals` in stock-count/reorder).

### 🟢 CONFIRMED SAFE WINS
- **`LegalEntityPicker`** — all 4 sites use identical `useLegalEntitiesQuery(true)`, `id` value, `code — name` label. Clean; keep per-dialog labels/placeholders as props.
- **`AccountPicker` `headerOnly?` prop** — additive, default `isHeader:false` unchanged → zero impact on existing 6 call sites; can also absorb `account-dialog` raw select (verify parity there).
- **`CurrencyPicker` for `pair-selector` only** — pure extraction of an existing shadcn Select, zero behavior change.
- **`WarehouseCombobox` for ~4 form-field cases only** (adjustment-form, reorder-config-dialog, order-detail, bill-line-editor) mirroring `BranchCombobox`.
- **Widen ESLint decimals rule to `locations`, `accounts`, `settings` NOW** — 0 existing violations, free guardrail.

### ⛔ RULED OUT — leave alone (would add complexity / regress UX / narrow valid inputs)
- **Brand/Unit combobox merge** — free-text type-in-field + onBlur casing-snap is a *different* pattern from click-open-popover `SearchableCombobox`; merging is a UX regression. Document as intentional exception.
- **`WarehouseCombobox` for the 4 filter toolbars** (adjustments-list, stock-levels, stock-counts-list, reorder-toolbar) — combobox is worse than instant 1-click `<Select>` on a 2-6 option filter; one pairs with a supplier filter (breaks visual symmetry).
- **`WarehouseCombobox` for the 5 cascading/variant forms** (transfer cross-exclusion, serial-number cascade, order-create cascade+inline-error, invoice-detail hide-when-single, stock-count-form) — each needs bespoke props; forcing them in inflates the shared API.
- **`CurrencyPicker` on customer/supplier `defaultCurrency`** — free-text→whitelist narrows valid submit values → product decision, not a refactor.
- **`PriceListPicker`, `UserPicker`** — single call site each, no duplication eliminated. Defer until a 2nd site appears.

### Test-coverage reality (where regressions would be INVISIBLE)
Real safety nets: POS (81 test files), invoices (8), inventory (8). **Zero automated coverage — manual QA mandatory before/after:** sales, general-ledger, taxation, tb-import, books-import, inventory-import. Thin: journal-entries (2), accounts (2), trial-balance (1, table untested). Widening ESLint would fail the build on ~31 existing violations across reports(10)/inventory-import(6)/GL(4)/books-import(4)/taxation(4)/trial-balance(3) → clean those before widening those dirs.

### Recommended safe execution order (supersedes §3)
0. Commit/stash the in-flight `purchase/payments` work (P2).
1. **Unify currency-decimals into one source of truth + ISO-4217 override table (P1).** Foundational; unblocks all of T3 safely.
2. Fix `landed-cost` currency-payload bug (P3) — standalone correctness commit.
3. Widen ESLint to `locations`/`accounts`/`settings` (free); defer the other dirs until their violations are cleaned.
4. Extend primitives: MoneyInput (currency-prefix, null-currency, `moneyStep`), QuantityInput (shared stepper). Write the pack-unit dual-mode binding pattern once.
5. Build the confirmed-safe pickers: `LegalEntityPicker`, `AccountPicker.headerOnly`, `CurrencyPicker`(pair-selector), narrow `WarehouseCombobox`(4 form sites).
6. THEN the input swaps, lowest-risk first (bill-create unitPrice, adjustment unitCost), each with manual QA where no tests exist. Exclude POS `pay-surface`.
7. Dedup formatters (now safe, post-P1), GL/TB/JE→canonical, delete the equivalent import `fmtAmount` copies. Keep `pos-transactions/display.ts` and the purchase KPI strips.
8. Native-`<select>` cleanup (T4) last, per-screen with QA.

**Net:** the genuinely safe, high-value work is P1 (currency-decimals unification), P3 (landed-cost bug), the 4 confirmed pickers, primitive extensions, and ~2 low-risk input swaps. The rest is either deferred, ruled out, or gated behind manual QA on untested modules. No change proceeds that isn't behavior-preserving or an explicit, isolated bug-fix.

---

## 5. P1 EXECUTION LOG (2026-07-03)

Deep-dive on currency-decimals found it's a **5-source** disagreement, and — critically — the shared map is on the money-MATH path, so P1 was split:

### Sources of currency-minor-units (the real map of the mess)
| Source | Path | Used for | Coverage |
|---|---|---|---|
| `currencyDecimals` / `CURRENCY_DECIMALS` | `packages/shared/src/pos-money/currency.ts` | **MATH** (POS tax-engine, journal posting, opening-balance, promo-engine) | 7 currencies, else →2 (IQD/JOD/TND/LYD/JPY/KRW all wrong) |
| copy-paste maps | `apps/api/src/sales/invoices/currency.ts`, `apps/api/src/purchase/invoices/currency.ts` | **MATH** (invoice totals) | 8 each (add INR), same blind spots |
| inline map | `apps/api/src/sales/orders/sales-orders.service.ts` ~70-86 | **MATH** | 15, gets JPY/IDR right, misses IQD/JOD/TND/LYD/KRW |
| `getCurrencyDecimals`/`moneyDecimals` | `apps/web/src/lib/currency-precision.ts`, `money-format.ts` | **DISPLAY only** | Intl-based (correct except IQD→0) |
| `THREE_DP`/`ZERO_DP` lists | `apps/web/src/features/pos-transactions/lib/display.ts` | DISPLAY | correct incl. IQD=3 |
| `tenant_currencies.decimalPlaces` | `packages/db/src/schema/currency.ts` (seed `ISO_4217_SEED`, 24 cur) | **DB per-tenant, user-editable 0-4** | NOT wired into any of the above — a live 5th number |

Verified empirically (node ICU 78): Intl is correct for KWD/BHD/OMR/JOD/TND/LYD=3, JPY/KRW/IDR/VND=0, SAR/AED/QAR/USD/INR=2 — **only IQD diverges** (Intl 0 vs app-domain 3).

### ✅ P1-now — DONE (uncommitted)
Display-only fix, zero math paths touched. `apps/web/src/lib/currency-precision.ts`: added `CURRENCY_DECIMALS_OVERRIDES = { IQD: 3 }` consulted before Intl (with doc comment noting math decimals live separately in `@zerupt/shared` and are intentionally untouched). `moneyDecimals` inherits it via delegation (money-format.ts unchanged). Tests: new `currency-precision.test.ts` + extended `money-format.test.ts` (IQD→3, GCC 3dp, 2dp set, JPY/KRW 0, junk→2, `formatMoneyAmount("1.5","IQD")="1.500"`). `pnpm --filter @zerupt/web typecheck` clean; vitest 2 files / 29 tests pass. → later routing GL/TB/JE/import display formatters to canonical is now non-regressive for all real-world currencies (KWD/SAR byte-identical; only IQD display corrects 0→3, no tested GCC tenant uses IQD).

## 6. FULL CLOSEOUT — DONE 2026-07-03 (all phases shipped to main, verified GREEN)

Executed A→H + purchase wave + dead-code sweep, each committed+pushed to `zerupt-erp` main. 17 commits (P1 `713f6d4f` + 16 below):
- A `b40d7917` currency fallbacks (landed-cost payload bug + overview/tb-import) via shared resolveSelectedEntity
- B `4690e359` widen ESLint decimals rule to locations+accounts
- C `9e148b3d` extend MoneyInput (currency-prefix) + moneyStep + stepQtyByDecimals + house-rule docs
- D1 `af6fea92` LegalEntityPicker + AccountPicker.headerOnly, drop native selects (taxation/account-dialog)
- D2 `8009b94b` CurrencyPicker (pair-selector) + WarehouseCombobox (inventory form sites)
- F `b289453f` dedup money formatters (GL/TB/JE/import previews → canonical, semantics preserved)
- E-sales `a3ba718d` money/qty input swaps (record-payment/credit-note/invoice/direct-sale) + stale-closure fix
- E-accounting `fc868dba` journal-entry + bank-rec money inputs (autosave-on-blur preserved)
- E-inv-B `59a4239d` reorder/serial/promo/stock-counts-list decimals cleanup
- E-inv-A `65dcde30` inventory form money/qty swaps (item-form/adjustment/transfer/price-list/serial/pack-units)
- G `e251cbeb` remaining native selects → shared pickers (import/sami/tb) + Brand/Unit documented exceptions
- stock-count `84cb2872` **correctness**: stepper respects item's real quantityDecimals (DB→DTO→web threading)
- H `bc60ecc0` formatPercent primitive + route tax-rate/percent displays
- PW-B `9e591ccd` purchase payments/landed-cost/supplier money inputs + landed-cost branch→BranchCombobox
- PW-A `c0550e1c` purchase document-line money/qty + BillLineSearch quantityDecimals threading + return-qty fix
- cleanup `4a99aef3` remove orphaned migration-matching money formatter

**Final verification GREEN (this refactor):** web typecheck clean, production build passes, 2559 web tests pass, financial API suites all pass (tax-calc/journal-posting/currency-decimals-consistency/pos-transactions/sales/opening-balance/stock-counts), shared 451 pass. ~200+ new tests added across the phases (sales/inventory/purchase previously had ~zero on these paths).

**NOT ours (concurrent session's in-flight work, flagged for that session):** `accounting-sections.ts` resolveActiveSection regression (commit `460a3485`, opening-balance-header work) and 28 purchase-returns.service.spec failures (`requireReturnApproval` WIP). Neither is in this refactor's commit range or scope.

**Follow-ups also closed same day (2 more commits, tree GREEN):**
- `15d7a227` — threaded real per-item `quantityDecimals` through the item-search shapes so transfer / adjustment / direct-sale qty inputs now ENFORCE the item's precision (pack-mode guarded). Only genuinely item-less/snapshot sites remain permissive by design (expense lines, GRN/return snapshots, POS 6dp-storage module, credit-note historical lines, reorder-config/suggestions where the dialog/API lack the item's decimals — all documented in-code).
- `1e45d567` — removed orphaned `taxation/tax-group-combobox.tsx` (leftover from the earlier combobox project).

**Kept deliberately (documented exceptions, not debt):** Brand/Unit free-text comboboxes, `pos-transactions/display.ts`, purchase KPI strips.

---

### ✅ P1-later — DONE 2026-07-03 (uncommitted), proven GREEN
Single authoritative ISO-4217 map now lives in `packages/shared/src/pos-money/currency.ts` (added IQD/JOD/LYD/TND=3, full ISO 0dp set, + app-convention IDR/LBP/YER=0 with comment). Collapsed onto it: `sales/invoices/currency.ts` + `purchase/invoices/currency.ts` (now re-export), `sales-orders.service.ts` inline map (deleted, imports shared), and web `getCurrencyDecimals` (delegates to shared; removed Intl + the redundant IQD override). Fixed the `pos-transactions.service.ts:1845` hardcoded `currencyDecimals:2` → `currencyDecimals(ctx.currency)` (no-receipt-return KWD/BHD/OMR tax now 3dp). Added drift-guard spec locking `country-currency.ts` + seed to the shared map.
- **Decisions:** IDR/LBP/YER = 0dp (app convention, matches `country-currency.ts`, deviates from ISO's 2). `tenant_currencies.decimalPlaces` proven inert (CRUD-only) → left out of scope (wiring it would be a new behavior change).
- **Safety proof:** only JOD/BHD-in-sales-orders/IDR/VND/JPY change value, none in any tenant seed/fixture/test; all in-use currencies (KWD/OMR/AED/SAR/QAR/USD/INR/EGP/SGD/MYR) byte-identical. The `:1845` KWD fix is the ONE intended in-use change, covered by a new real-engine test (fails pre-fix @2dp, passes post-fix @3dp).
- **Regression:** GREEN. 1,626 API tests / 65 suites (incl. tax-calc, journal-posting, pos-transactions ×6, sales 442, purchase 470, opening-balance 192) + 451 shared + 29 web currency/money — all pass, zero regressions. typecheck clean on shared/api/web.
- Uncommitted; does NOT collide with the in-flight purchase/payments working-tree files (different files).
