# Onboarding — Data Import (AI-first) & Mira Testing Checklist

> Persona: **a UAE retailer migrating off spreadsheets, handing Zerupt their real, messy files.** They export whatever their old system or Excel gives them: mixed Arabic/English, locale number formats, Arabic-Indic digits, blank cells, duplicate SKUs, multi-warehouse columns, missing TRNs. The AI-first import is the product wedge. The persona's job is to upload and confirm; the product's job is to absorb the mess without throwing data away or dead-ending. Never lose the customer's data.

- **Route(s):** `/[locale]/(app)/onboarding` step 7, `/[locale]/(app)/import`
- **Feature dir:** `apps/web/src/features/import/`; migration matching: `apps/web/src/features/migration-matching/`
- **API:** `tenant/imports` (`import.controller.ts`), `tenant/import/inventory`, `tenant/import/books`, `tenant/import/trial-balance`; resolver: `apps/api/src/resolver-engine/` (T0-T5 cascade); Mira: `apps/api/src/migration/`
- **Depends on:** 02 (branches for stock-by-branch), 03 (COA for account mapping), 04 (tax codes for VAT tagging), 05 (customers/suppliers carry TRN)

## 0. Preconditions

- [ ] COA, tax profile, branches all committed (imports map into them).
- [ ] Persona files ready:
  - **P1** clean CSVs: `products.csv` (VAT-inclusive selling price), `inventory-import-items.csv`, `-categories.csv`, `-opening-stock.csv`, `customers.csv`, `suppliers.csv`, `trial_balance.csv`. Every item tagged `Tax Group = Standard 5%`.
  - **P2** messy: `products.csv` (inconsistent category spellings, blank costs, a duplicate SKU, Arabic-Indic digits, `1.234,56` euro-style numbers, mixed VAT-inclusive/exclusive rows, some mis-tagged zero-rated, some blank tax codes), `stock_by_branch.csv`, `customers_aging.csv` (~half missing TRN), `suppliers.csv`, `trial_balance.csv` (unbalanced by exactly AED 950).
  - **P3** scale + xlsx: `item_master.xlsx` (~8,500), `customers.csv` (~4,200, ~8% missing TRN), `suppliers.csv` (180, incl. 3 foreign no-TRN), `opening_stock_by_warehouse.csv`, `pdc_register.csv`, `open_quotations.csv`, `dz_mainland_transfers.csv`, `trial_balance.xlsx`.

## 1. Functional — actions & states

- [ ] **Upload a file** (CSV and XLSX); the AI parses columns, previews a mapping, and shows a row-count summary before any commit.
  - [ ] Loading/progress state during AI parse (progress streamed, not a dead spinner) for large files (P3 8,500 / 4,200 rows).
  - [ ] Error state on a bad/corrupt/oversized file is clear and does not lose the upload.
  - [ ] Empty state (nothing uploaded yet) is clear.
- [ ] **Column mapping** is AI-suggested and user-correctable; corrections persist (learned decisions) so re-imports and later files reuse them.
- [ ] **Preview then confirm**: nothing is written until the user confirms; retry/cancel available.
- [ ] **Mira migration matching**: AI matches the migrating business's accounts/entities to Zerupt's canonical ones; the user reviews and accepts/overrides matches.
- [ ] Row-level errors are surfaced per row (not a single "import failed"); good rows are importable while bad rows are quarantined for correction.

## 2. Domain invariants (assume dumb customers — never throw away data)

- [ ] **No data loss**: every uploaded row is either imported, or surfaced as a correctable error. Nothing is silently dropped. A row the AI cannot confidently resolve is queued for human confirmation, not discarded.
- [ ] **SKU codes preserved exactly** as in the file (P1 `OUD-0001` pattern is on shelf labels); import never rewrites/normalizes the customer's identifiers.
- [ ] **Number normalization is correct**: Arabic-Indic digits (`٥٠٠`), euro-style `1.234,56`, currency suffixes (`AED 800.82`), blank/`-` cells all resolve to the right AED 2-decimal value or a flagged error, never a wrong silent value.
- [ ] **Tax tagging on import**: an item with a blank tax code defaults to standard 5%; an item mis-tagged zero-rated is either corrected or surfaced for review (P2). The AI resolves ambiguous per-row VAT-inclusive vs VAT-exclusive pricing consistently and shows its interpretation.
- [ ] **VAT-inclusive selling price** from the file is stored as the inclusive shelf price; the net + 5% is derived, never re-added on top.
- [ ] **Duplicate SKU** (P2) is detected and flagged for resolution, not blindly creating two items or silently overwriting.
- [ ] **Missing TRN** on customers/suppliers (P2 ~half, P3 ~8% and 3 foreign suppliers) is allowed to import but flagged; it must not block the whole file and must be surfaced so B2B tax invoices later warn when a buyer TRN is missing.
- [ ] **Multi-warehouse stock** columns (P3 `stock_by_branch` / `opening_stock_by_warehouse`) map to the correct branches from step 2; totals per item reconcile to the file.
- [ ] **Resolver cascade** (exact → memory → vector → LLM) is deterministic-first: an exact/known match is not sent to the LLM; learned corrections are reused.
- [ ] Imports are tenant-scoped; no row can reference or leak another tenant's data.

## 3. Edge cases & defensive UX — "the dumbest thing a user could do"

- [ ] Uploading the wrong file type, an empty file, or a file with only headers is handled gracefully with a clear message.
- [ ] Re-uploading the same file does not double-import (idempotency / duplicate detection).
- [ ] Cancelling mid-import leaves no partial data committed; retry resumes cleanly.
- [ ] A huge file (P3) does not time out, freeze the UI, or truncate silently; if a cap applies, the dropped rows are reported, never silently cut.
- [ ] Mismatched columns, extra columns, reordered columns are absorbed by the AI mapping rather than rejected.
- [ ] Mixed AR/EN text and RTL content render correctly in the preview (bidi isolation); the mapping UI works in RTL.

## 4. Cross-module / integration

- [ ] Imported items appear in inventory with correct categories, costs, prices (VAT-inclusive), and per-branch stock.
- [ ] Imported customers/suppliers appear with their TRN (or a missing-TRN flag) and feed AR/AP.
- [ ] Trial balance / books import feeds opening balances (checklist 08) and must tie out or trigger the OBE plug (P2 AED 950).
- [ ] DZ-to-mainland transfers (P3 `dz_mainland_transfers.csv`) are recognized as reverse-charge events, distinct from ordinary inter-branch transfers.
- [ ] PDC register and open quotations (P3) import into the cheque register and quotation/sales pipeline respectively.

## 5. Known gaps (from recon — verify or track)

- Import learned decisions persist corrections; verify a second persona's import in the same tenant does not wrongly reuse another entity's mapping.
- Confirm which import lane each file uses (general `tenant/imports` vs specialized inventory/books/trial-balance/opening lanes) so a tester uploads each file to the right entry point.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
</content>
