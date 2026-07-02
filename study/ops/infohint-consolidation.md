# InfoHint consolidation & reuse punch-list

**Goal:** one hover-tip primitive across the whole web app (`@/components/info-hint` → `InfoHint`), and a plain-language explanation on every jargon column/field for our non-tech touch-tablet users.

**Canonical component:** `apps/web/src/components/info-hint.tsx` — Radix-backed (tap + hover + keyboard, portal so it is never clipped in `overflow-hidden` tables, `dir="auto"` RTL). API: `<InfoHint text={t("...")} label?={aria} />`. Pass a resolved i18n key so ar/en stay in parity.

## Done
- `InfoHint` upgraded to the Radix primitive; onboarding `InfoTip` collapsed into a thin shim over it (commit `9348a382`).
- GRN receive-lines screen: ⓘ beside Ordered / Already received / Remaining / Qty to receive (commits `8de2d9ee`, `4dfc9d51`).
- Inventory ad-hoc `cursor-help`+Tooltip blocks → InfoHint (item-form, price-lists, stock-counts ×3) — IN PROGRESS.

## A. Existing duplicates to consolidate (~40)

### A1. `InfoTip` callers → migrate to `InfoHint` directly, then delete the shim (7 files)
- `onboarding/steps/step1-business-info.tsx:464`, `step2-locations.tsx:402,435`, `step3-accounting.tsx:338`, `step4-tax.tsx:144,169,194,314`, `step6-pos.tsx:210`
- `reports/.../stock-movement-ledger-report.tsx:228,254,270,321` (uses a `tip=` prop wrapper — verify signature) + hand-rolled `cursor-help`+Info at `:73-76`

### A2. Ad-hoc `<Info cursor-help>` + shadcn Tooltip blocks (inventory — being done now)
- `inventory/item-form-panel.tsx:226-234, 360-362`
- `inventory/price-lists/price-list-detail-panel.tsx:335-336`
- `inventory/stock-counts/stock-count-form-panel.tsx:109,138`
- `inventory/stock-counts/stock-count-sheet-panel.tsx:180,214`
- `inventory/stock-counts/stock-count-variance-panel.tsx:269,434` (variance/approve — HIGH, financial)

### A3. Always-visible muted helper rows → convert to hover InfoHint (founder preference)
- `trial-balance/trial-balance-table.tsx:85`, `invoices/invoice-create-panel.tsx:243`, `invoices/credit-note-dialog.tsx:499`
- `accounts/account-dialog.tsx:113,488,510` (COA explainers ×3), `locations/warehouses-section.tsx:191`
- `pos/search-results-dropdown.tsx:262`, `exchange-rates/exchange-rate-dialog.tsx:180`
- `onboarding/go-live/reconciliation-summary-panel.tsx:331`, `security-settings/security-settings-panel.tsx:195`, `localization/localization-panel.tsx:253`
- Muted `<p>`/FormDescription hints: `reorder-config-dialog.tsx` (5 fields), `bill-create-panel.tsx:164`, `payment-create-panel.tsx:426`, `item-form-panel.tsx:255,676`

### Not to touch
- `title=` attrs are almost all EmptyState titles / action-button hover labels — leave as-is.
- ~40 `AlertCircle` uses are error/validation banners — leave as-is.

## B. New tips to ADD (jargon columns/fields with no explanation, ~33) — HIGH first
- **Purchase:** landed-cost "Allocation method"; bill/payment "Exchange rate"; bills-list "Balance"; AP-aging buckets (Current/1-30/31-60/61-90/90+).
- **Inventory:** stock-levels "Avg cost" (=WAC); item-form "Tracking type" / "Valuation method"; variance "Variance value" / "Change to apply"; reorder-config "Reorder point"/"Reorder qty"/"Safety stock"/"Max level"/"Lead time".
- **Sales:** invoice-detail Qty / base-qty / "Pack" columns; credit-note serial-return gating.
- **Accounting:** journal "Exchange rate" / "Source"; **Chart of Accounts + Trial Balance tables need a manual pass** (custom table primitive, not caught by grep).
- **Reports:** ar-aging / ap-aging buckets.
- **Onboarding/import:** opening-balance wizard exchangeRate; reconciliation summary — dedicated pass.

## Manual-follow-up gaps (grep missed)
Chart of Accounts table, Trial Balance panel, POS cart, onboarding/opening-balance wizards.

## Execution order
1. Consolidate primitive ✅  2. Replace ad-hoc Tooltip blocks (A2) → A1 migrate + delete shim → A3 convert always-visible.  3. Add new HIGH tips (B): AR/AP aging buckets, WAC, bill Balance, Allocation method, Variance value.
