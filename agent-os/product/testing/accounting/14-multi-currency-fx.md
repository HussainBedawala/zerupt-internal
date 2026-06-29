# Accounting — Multi-Currency & FX Testing Checklist

> Persona: **Accountant**. Foreign-currency transactions must store both the transaction-currency amount and the functional-currency equivalent. FX gain/loss must post to the correct accounts. Month-end revaluation is currently API-only — flagged as a HIGH gap.

- **Route(s):** `/settings/currencies`, `/settings/exchange-rates`
- **Feature dir:** `features/currencies/`, `features/exchange-rates/`
- **API:** `GET/POST/PATCH/DELETE /tenant/currencies`, `GET/POST /tenant/exchange-rates`, `POST /tenant/fx-revaluations`
- **Depends on:** Chart of Accounts (01), Account Mappings (06), Fiscal Years & Periods (10)

---

## 0. Preconditions

- [ ] At least one open fiscal period exists.
- [ ] Functional (base) currency is set and cannot itself be deleted/deactivated.
- [ ] At least one foreign currency is available to enable (e.g. USD if base is AED).
- [ ] Exchange rate accounts (realized FX gain/loss, unrealized FX gain/loss) are mapped in Account Mappings.
- [ ] Logged in as a user with settings write permissions; confirm a non-admin cannot modify currency settings.

---

## 1. Functional — Currency Settings (`/settings/currencies`)

### 1.1 Currency policy

- [ ] **Policy panel loads** — displays current settings: multi-currency toggle, rounding mode (half_up / bankers), exchange rate source (manual / auto_fetched), provider (if auto), frequency (manual / daily / hourly), allow-backdated-rate toggle, approval-required-for-manual-rate toggle.
  - [ ] Loading state shown while fetching.
  - [ ] Error state (API down) shows a user-friendly message, not a crash.
- [ ] **Enable multi-currency** — toggling on enables foreign currencies; toggling off is blocked if any active foreign-currency exists with posted transactions (server rejects with explanation).
- [ ] **Rounding mode** — switching between half_up and bankers is saved; verify that a subsequent FX conversion uses the updated mode (check a known midpoint value like 2.5).
- [ ] **Exchange rate source** — switching to auto_fetched makes provider + frequency fields appear and required; switching back to manual hides them.
- [ ] **Allow backdated rate** — when off, entering an exchange rate with a past date is blocked.
- [ ] **Approval required for manual rate** — when on, a manually entered rate enters a pending state rather than becoming effective immediately (verify this flow if implemented).

### 1.2 Tenant currency list

- [ ] **List loads** — displays all enabled currencies with code, name, symbol, decimal places, symbol position, active status.
  - [ ] Empty state (no foreign currencies yet, only base) is clear.
- [ ] **Add currency** — opening "Add Currency" shows a searchable seed list; selecting a standard currency (e.g. USD) pre-fills name/symbol/decimal places; custom values can be overridden.
  - [ ] Loading state on save; error state preserves form.
  - [ ] On success, currency appears in list immediately.
- [ ] **Edit currency** — can update name, symbol, decimal places, symbol position; currency code cannot be changed after creation.
- [ ] **Deactivate / reactivate** — toggling isActive to false hides the currency from transaction dropdowns but preserves historical data.
- [ ] **Delete currency** — deleting a currency that has posted transactions is blocked server-side with a clear error. Deleting an unused currency succeeds.
- [ ] **Functional currency** — the entity's base currency is marked clearly; there is no delete or deactivate option for it.

---

## 2. Functional — Exchange Rates (`/settings/exchange-rates`)

### 2.1 Rate list and history

- [ ] **List loads** — paginated grid of rates with: base currency, quote currency, rate date, rate type, rate value, inverse rate, source, created-by.
  - [ ] Loading and empty states correct.
- [ ] **Filter by currency pair** — filtering base=AED / quote=USD shows only AED/USD rates; other pairs hidden.
- [ ] **Filter by date range** — fromDate / toDate filter returns correct subset; rates outside range excluded.
- [ ] **Filter by rate type** — spot / closing / average / contract each filter correctly.
- [ ] **Pagination** — stable across pages; total count matches meta.

### 2.2 Add rate manually

- [ ] **Create rate dialog** — fields: base currency (locked to entity base or selectable), quote currency, rate date, rate (numeric), rate type.
  - [ ] Loading on submit; error state preserves form.
  - [ ] On success, new rate appears in list; inverse rate is computed and stored by the server.
- [ ] **Duplicate prevention** — adding a rate for the same pair + date + type that already exists either overwrites (with confirmation) or is rejected; no silent duplicate.
- [ ] **Backdated rate** — if allow-backdated-rate is off, entering a past date is rejected with a clear message. If on, accepted.
- [ ] **Future rate** — a rate dated in the future is stored but must NOT be used for transaction date lookups for earlier dates.
- [ ] **Zero or negative rate** — rejected server-side.

### 2.3 Rate lookup by date/pair

- [ ] **Lookup mechanism** — when a transaction is dated on a day with no rate, the system falls back to the most recent prior rate for that pair (or blocks if no rate exists — confirm which behaviour applies).
- [ ] **Correct date used** — entering a sale invoice dated 15 June uses the 15 June rate (or nearest prior), NOT today's rate. Verify by checking the functional-currency amount on the resulting JE.

---

## 3. Accounting / domain invariants

- [ ] **Transaction-currency and functional-currency both stored** — open any foreign-currency JE and confirm each line has both the original currency amount and the base-currency equivalent.
- [ ] **Base amounts roll up into reports** — AR aging total for a USD invoice, when converted, matches the AED figure shown in the balance sheet AR account.
- [ ] **Rate lookup uses transaction date** — create a test invoice on a date where USD/AED rate is known; verify the stored base amount equals amount × that day's rate, not today's rate.
- [ ] **No float precision loss** — rates and converted amounts display with the correct precision; no scientific notation, no floating-point rounding artefact (e.g. 1234.5600000001).
- [ ] **Realized FX gain/loss on settlement** — when a USD invoice (booked at rate A) is paid at rate B, the difference posts to the realized FX gain/loss account. Verify the JE is balanced and the correct account is used per Account Mappings.
- [ ] **Unrealized FX gain/loss on revaluation** — when `/tenant/fx-revaluations` is called, outstanding monetary FX balances (AR, AP, bank) are revalued at the period-end rate; the gain/loss posts to the unrealized account (distinct from realized). Non-monetary balances (inventory, fixed assets) are NOT revalued.
- [ ] **Rounding: per-line not on totals** — on a multi-line foreign-currency invoice, verify each line's base amount is rounded individually; the sum of rounded lines equals the JE total (no penny leak between TB and sub-ledger).
- [ ] **Currency precision respected** — JPY (0 decimal places) rounds to integers; KWD (3 decimal places) retains 3 digits. Verify both if enabled.
- [ ] **Deleting currency in use is blocked** — server rejects delete with a clear error listing why.
- [ ] **Tenant isolation** — exchange rates added by one tenant are not visible to another tenant.

---

## 4. FX Revaluation — API-only gap (HIGH)

> **GAP: There is no frontend screen for FX revaluation.** An accountant cannot perform month-end revaluation from the UI. They must call `POST /tenant/fx-revaluations` directly via the API or a developer tool.

- [ ] **GAP confirmed** — navigate all accounting and settings routes; confirm there is no "Revaluation" menu item or button anywhere in the UI.
- [ ] **API works** — call `POST /tenant/fx-revaluations` with a valid period-end date; confirm it returns a success response and posts the correct unrealized FX JEs.
- [ ] **Revaluation JE content** — the resulting JE debits/credits the unrealized FX gain/loss account; each line references the source account being revalued (AR, AP, bank); entry is balanced.
- [ ] **Revaluation is reversible at period open** — if the period is subsequently re-opened (with audit trail), the unrealized entry can be reversed.
- [ ] **LOG AS FINDING** — the absence of a revaluation UI is a HIGH issue for any accountant doing month-end close without developer access.

---

## 5. Edge cases & defensive UX

- [ ] **Multi-currency disabled but foreign transaction attempted** — server rejects with "multi-currency not enabled"; UI shows a clear error, not a 500.
- [ ] **Rate missing for transaction date** — submitting a foreign-currency transaction when no rate exists for that pair/date returns a descriptive error ("No exchange rate found for USD/AED on 2024-01-15"), not a cryptic failure.
- [ ] **Changing rounding mode mid-year** — historical entries are not retroactively recalculated; only future transactions use the new mode.
- [ ] **Symbol position** — in RTL (Arabic) locale, a currency with symbol-after position renders the amount before the symbol (e.g. "100 USD"); in LTR it renders correctly.
- [ ] **Decimal places mismatch** — entering a rate with more decimals than the currency allows is either truncated with a warning or stored at full precision for the rate (rates can have higher precision than transaction amounts).
- [ ] **Rapid-add same rate pair** — clicking save twice quickly does not insert two identical rows; button is disabled after first click.
- [ ] **Large rate values** — a rate of 3,672.50 (e.g. KWD/IDR) is stored and retrieved without scientific notation.
- [ ] **Inverse rate displayed** — adding a rate of 3.67 for AED/USD automatically shows the inverse (0.2725...) in the list.

---

## 6. Cross-module / integration

- [ ] **Sales invoice in foreign currency** — create a sales invoice in USD; verify the GL posts in AED (functional currency) at the transaction-date rate; AR aging shows the USD amount and the AED equivalent.
- [ ] **Purchase invoice in foreign currency** — same check on the AP side.
- [ ] **POS foreign-currency sale** — if POS supports foreign-currency payment, verify the cash account posts in base currency.
- [ ] **Trial Balance** — all TB figures are in functional currency regardless of original transaction currency.
- [ ] **Audit trail** — adding/editing/deleting a currency or exchange rate writes an audit record at `/accounting/audit-trail`.

---

## 7. Known gaps

- [HIGH] FX revaluation has no frontend screen — accountant cannot run month-end revaluation from the UI; API-only.
- [MEDIUM] No rate-history chart visible in the UI (the `ExchangeRateListResponse` type exists but a chart component was not found in `features/exchange-rates/`).
- [LOW] No bulk-import of historical exchange rates from a CSV or provider feed via the UI.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
