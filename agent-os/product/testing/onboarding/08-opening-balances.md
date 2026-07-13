# Onboarding — Opening Balances & Reconciliation Testing Checklist

> Persona: **a UAE retailer bringing over their closing books as opening balances.** They hand over a trial balance, outstanding customer balances (AR), outstanding supplier balances (AP), and opening stock. They are not accountants; they just want their starting numbers to match what their old system said. The invariant they care about without knowing its name: the books must balance, and if their file does not, the product must plug the difference transparently rather than silently swallowing it.

- **Route(s):** `/[locale]/(app)/opening-balance`, `/[locale]/(app)/onboarding` step 7
- **Feature dir:** `apps/web/src/features/opening-balance/`
- **API:** `tenant/import/opening-balances`, `.../opening-receivables`, `.../opening-payables`, `.../opening-stock`; reconciliation: `reconciliation.controller.ts`; TB import: `tenant/import/trial-balance` (`TbImportService`); books: `tenant/import/books`
- **Depends on:** 03 (COA + control accounts), 04 (tax accounts), 07 (customers/suppliers/items imported first)

## 0. Preconditions

- [ ] COA, control accounts (AR/AP/inventory/VAT), customers, suppliers, and items already imported.
- [ ] Persona: **P1** clean balanced `trial_balance.csv`; **P2** `trial_balance.csv` deliberately unbalanced by **exactly AED 950** (OBE plug test); **P3** `trial_balance.xlsx` + `pdc_register.csv` (opening PDCs) + `opening_stock_by_warehouse.csv` at scale.

## 1. Functional — actions & states

- [ ] **Import opening trial balance**; accounts map to the COA and amounts preview before commit.
  - [ ] Loading/error/empty states; error preserves the upload.
- [ ] **Import opening AR** (outstanding customer balances) and **opening AP** (outstanding supplier balances); each line ties to a customer/supplier from step 7.
- [ ] **Import opening stock** per branch/warehouse; quantities and valuation preview before commit.
- [ ] **Reconciliation** screen shows whether the imported books balance and, if not, the exact difference and where it will be plugged.

## 2. Accounting invariants (non-negotiable)

- [ ] After opening balances post, the **trial balance balances**: total debits = total credits to AED 2-decimal precision.
- [ ] If the source file does not balance (P2 AED 950), the difference is posted to an **Opening Balance Equity** account transparently and shown to the user; it is never silently absorbed into another account or dropped. The plugged amount equals the file's imbalance exactly.
- [ ] **Opening AR total = AR control account balance**; **opening AP total = AP control account balance**; **opening stock valuation = inventory control account balance**. Subledgers tie to their control accounts from the first day.
- [ ] Opening entries are dated to the go-live/opening date and land in the correct (open) fiscal period.
- [ ] Opening balances post as a proper balanced journal entry (double-entry), not as free-floating numbers; the entry is immutable/reversible like any posted entry.
- [ ] Foreign-currency opening balances (P3 foreign suppliers) store both transaction and base (AED) amounts; base amounts roll into the TB.
- [ ] Opening VAT balances (if any) land in the VAT input/output accounts, not a generic account, so the first VAT201 opens from a correct position.

## 3. Edge cases & defensive UX — "the dumbest thing a user could do"

- [ ] An unbalanced TB is never committed as-is without either plugging to OBE or forcing the user to resolve it; the user always sees the imbalance.
- [ ] Opening AR/AP lines referencing a customer/supplier not yet imported are flagged, not silently dropped.
- [ ] Duplicate opening-balance import (re-uploading) does not double-post; re-import replaces or is blocked, never additive by accident.
- [ ] Negative/zero/wrong-sign balances are handled and flagged.
- [ ] Committing opening balances is guarded/confirmed since it seeds the ledger; warn that it affects the starting books.
- [ ] RTL/LTR render; account and party names display in AR/EN; AED amounts at 2-decimal.

## 4. Cross-module / integration

- [ ] Opening AR feeds AR aging (checklist ties to accounting module); opening AP feeds AP aging; opening stock feeds inventory valuation.
- [ ] Opening PDCs (P3 `pdc_register.csv`) land in the cheque/PDC register with correct due dates and post to the right control accounts.
- [ ] The post-import trial balance is the same TB the accounting module will verify; it must already tie out before go-live.

## 5. Known gaps (from recon — verify or track)

- Confirm the OBE plug account is a dedicated Opening Balance Equity account (not retained earnings) and is visible in reports so the plugged difference is auditable.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
</content>
