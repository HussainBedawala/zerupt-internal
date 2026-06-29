# Accounting — Tax / VAT / TDS Testing Checklist

> Persona: **accountant**. Every tax rate, category, group, and computation must be provably correct. Wrong tax on a transaction is a compliance failure, not a UX issue.

- **Route(s):** `/settings/taxation`, `/reports/tax-summary`, `/settings/zatca`
- **Feature dir:** `features/taxation/`, `features/zatca/`
- **API:** `GET/POST/PATCH/DELETE /api/tax-codes`, `/api/tax-codes/:id/rates`, `/api/tax-groups`, `/api/tax/seed`, `/api/reports/tax-summary`, `/api/zatca/egs`
- **Depends on:** 01-chart-of-accounts (output/input accounts must exist), 02-journal-entries (tax postings flow from transactions)

## 0. Preconditions

- [ ] Logged in as a user with tax-settings permission; a user without it cannot see or reach `/settings/taxation`.
- [ ] At least one legal entity exists with a country set (e.g. UAE for VAT, India for GST, Malaysia for SST).
- [ ] COA has at least one liability account (for output VAT) and one asset account (for input VAT).
- [ ] At least one posted sale invoice and one posted purchase invoice exist for tax-summary verification.
- [ ] Fiscal period covering today is open.

---

## 1. Functional — tax codes

- [ ] **List tax codes** — table loads; shows code, name, rate, type (exclusive/inclusive), category, active status.
  - [ ] Loading skeleton shown while fetching; no frozen UI.
  - [ ] Empty state when no codes exist is descriptive (not a blank table).
  - [ ] Pagination works if more than one page of codes.

- [ ] **Create tax code** — form opens; fill code, name, rate, type, category, output account, input account, jurisdiction; submit.
  - [ ] Success toast appears; new row appears in table immediately (optimistic or refetch).
  - [ ] Loading state on submit button; button disabled until response returns (no double-submit).
  - [ ] Error state if code already exists — friendly message, form data not lost.
  - [ ] Required fields (code, name, rate) rejected empty with inline validation.
  - [ ] Rate field rejects non-numeric and negative values client-side and server-side.

- [ ] **Edit tax code** — update name, change type (exclusive ↔ inclusive), toggle active; verify changes persist on reload.
  - [ ] Cannot change the code string on an existing code (immutable identifier).
  - [ ] Deactivating a code does not delete it; it disappears from active lookups but remains in history.

- [ ] **Delete tax code** — confirmation dialog appears; only allowed if code has no associated transactions (server rejects otherwise with a clear message).

- [ ] **Tax rate history (effective-dated rates) on a code**
  - [ ] Rate list shows effective_from, effective_to (null = current), rate value.
  - [ ] **Create rate** — set rate, effectiveFrom; new rate appears; prior rate's effectiveTo auto-closes.
  - [ ] **Edit rate** — update rate or dates; changes persist.
  - [ ] **Delete rate** — confirmation required; only allowed if no transactions used that rate version.
  - [ ] Overlapping date ranges rejected by server with a clear error.
  - [ ] Effective rate view reflects the correct rate for a given date (spot-check: look up the rate as of a past transaction date — it should match the rate in effect then, not today's rate).

---

## 2. Functional — tax groups

- [ ] **List tax groups** — shows name, components, active flag, default flag.

- [ ] **Create tax group** — name + one or more component tax codes; mark compound flag per component; set default.
  - [ ] Compound flag visible per component row in the dialog.
  - [ ] At most one group can be default per legal entity (server enforces).
  - [ ] Success: group appears in list with correct component count.

- [ ] **Edit tax group** — add/remove components, reorder, toggle compound; verify recalculated effective rate displayed.

- [ ] **Delete tax group** — blocked if group is assigned to active items/products (server error shown).

---

## 3. Functional — country quick-setup & seed profiles

- [ ] **Country quick-setup dialog** — opens from the Taxation panel; allows selecting a country; shows the tax codes and groups that will be seeded.
  - [ ] Preview shows expected codes (UAE: 5% Standard VAT, Zero-Rated, Exempt; India: CGST 9% + SGST 9% + IGST 18%; Malaysia: SST 6% etc.).
  - [ ] Confirm seeds the codes and groups; success message; codes appear in the table.
  - [ ] Re-running quick-setup for the same country is idempotent (no duplicates) or warns before overwriting.
  - [ ] Loading state while seeding; error if server fails.

- [ ] **Seed profiles by country** — API returns available country profiles; UI lists them correctly.

---

## 4. Functional — ZATCA panel (`/settings/zatca`)

- [ ] **ZATCA panel loads** — shows EGS (Electronic Generation System) units list; empty state if none registered.
- [ ] **EGS wizard — onboard new EGS unit** — fill serial number, branch name, CRN; step through wizard; submit.
  - [ ] Loading state during certificate request; error shown if ZATCA service unavailable.
  - [ ] On success, EGS appears in units list with status.
- [ ] **QR code preview** — ZATCA QR image renders correctly for a test invoice; `features/zatca/qr.ts` logic produces a valid TLV-encoded QR.
- [ ] Error display (`zatca-error-display`) shows ZATCA API error codes in human-readable form (not raw JSON).

---

## 5. Functional — Tax Summary report (`/reports/tax-summary`)

- [ ] **Report loads** with a valid period range (periodStart, periodEnd); shows output tax (collected from sales) and input tax (recoverable from purchases) by tax code.
- [ ] **Date filters** — changing period re-fetches; data changes appropriately.
- [ ] Empty state for a period with no taxable transactions.
- [ ] Export (if present) matches on-screen figures.

---

## 6. Accounting / domain invariants

- [ ] **Rate lookup uses transaction date, not today's rate.** Post a sale dated 6 months ago when the rate was different; tax on that invoice must reflect the old rate.
- [ ] **Exclusive tax** (`type = exclusive`): tax = net × rate. Verify: net 1000, rate 5% → tax 50, gross 1050.
- [ ] **Inclusive tax** (`type = inclusive`): tax extracted from gross: tax = gross − gross / (1 + rate). Verify: gross 1050, rate 5% → tax 50, net 1000.
- [ ] **Output VAT (sales)** posts to the outputAccountId (liability). Verify in GL: after a sale with tax, the output tax account has a credit movement equal to the tax amount.
- [ ] **Input VAT (purchases)** posts to the inputAccountId (asset). Verify in GL: after a purchase with tax, the input tax account has a debit movement equal to the tax amount.
- [ ] **Tax categories handled distinctly:**
  - `standard` — tax computed and posted.
  - `zero_rated` — 0% tax; still tracked separately from exempt (line appears in tax return at 0%).
  - `exempt` — no tax line at all; does not appear in the VAT return.
  - `reverse_charge` — buyer accounts for both output and input tax (verify both GL postings appear).
  - `non_recoverable` — tax posted to expense, not input-tax asset.
- [ ] **Tax group compound calculation.** Group = Component A (9%) + Component B (10%, compound). Base 1000: A = 90; B = (1000 + 90) × 10% = 109. Group tax = 199. Verify the system produces 199, not 190.
- [ ] **Tax group non-compound.** Group = CGST 9% + SGST 9% (both non-compound, exclusive). Base 1000: CGST = 90, SGST = 90, total tax = 180.
- [ ] **Tax summary ties to GL.** Tax collected (output VAT account balance, credit side, for the period) = tax summary "collected" figure. Tax recoverable (input VAT account balance, debit side) = tax summary "recoverable" figure. Difference must match net VAT payable/receivable.
- [ ] **Rate change is date-effective.** After updating a tax code rate, existing posted transactions retain their original rate. New transactions use the new rate.

---

## 7. Edge cases & defensive UX

- [ ] Rate of 0% is valid (zero-rated); system does not treat it as "no tax code set."
- [ ] Rate > 100% is rejected (reasonable upper-bound validation).
- [ ] Overlapping effective-date ranges on a single tax code are rejected server-side.
- [ ] Tax code with outputAccountId pointing to an asset account (wrong type) — server should ideally warn; at minimum do not silently accept misclassification.
- [ ] Quick-setup run on a tenant that already has custom codes does not overwrite or silently delete existing codes.
- [ ] Double-submit on "Create Tax Code" does not create duplicates (button disabled on first click).
- [ ] RTL (Arabic) layout: tax code names, account names, and amount columns render correctly in Arabic locale.
- [ ] Very long tax code name (200+ chars) does not break table layout; truncation with tooltip.
- [ ] Attempting to set two default tax groups simultaneously — second request rejects or demotes the first.

---

## 8. Cross-module / integration

- [ ] A sale invoice created via `/sales` or POS picks up the correct tax code for each line and posts the matching output-tax JE line.
- [ ] A purchase invoice via `/purchase` picks up input-tax and posts the correct JE line.
- [ ] Drill into a Tax Summary line → source JEs are reachable and link resolves.
- [ ] ZATCA-generated QR on a receipt (`zatca-receipt-wrapper`) reflects the correct tax amount and seller details.

---

## 9. Known gaps

- **India TDS (withholding tax) — MEDIUM.** `/tenant/tds-sections` and supplier `tds-config` exist at the API level but there is no frontend UI. An accountant cannot set up TDS sections, configure supplier-level TDS rates, or view TDS deduction reports from the UI. Workaround: API-only via Postman/curl. Track until a TDS management screen is built.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Tax summary reconciles to the GL output/input VAT account balances.
- [ ] Findings logged in `_findings.md`.
