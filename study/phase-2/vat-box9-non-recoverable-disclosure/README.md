# VAT Box 9 — Non-Recoverable Input Tax Disclosure

**DEV-358 | Phase 2 Accounting**

---

## The Problem

UAE VAT return Box 9 requires disclosure of "total value of supplies not eligible for input tax recovery." KSA ZATCA has an equivalent blocked-purchases line.

DEV-337 correctly capitalised non-recoverable VAT into inventory cost (IAS 2.10 — costs necessary to bring inventory to its present condition). To prevent `TaxSummaryService` from treating that inventory debit as a claimable input tax credit, the capitalised line intentionally dropped `taxCodeId`. This worked for recoverable reporting but left no hook to reconstruct Box 9.

---

## The Fix — `taxClassification` Column

A nullable `tax_classification` enum column on `journal_entry_lines` stores *how each tax-bearing line participates in VAT filing*:

| Value | Meaning |
|---|---|
| `recoverable` | Standard deductible input tax — DR input_tax account |
| `capitalised_non_recoverable` | Blocked ITC capitalised into inventory (IAS 2) — Box 9 |
| `reverse_charge_input` | Self-assessed DR leg for reverse-charge |
| `reverse_charge_output` | Self-assessed CR leg for reverse-charge |

The non-recoverable inventory line now keeps `taxCodeId` (for joining to `taxCodes`) **and** `taxClassification: capitalised_non_recoverable`. This is safe because the existing recoverable input-tax query joins on `taxCodes.inputAccountId = journalEntryLines.accountId` — an inventory-account line can never match that join, regardless of `taxCodeId`.

---

## Why Not Drop `taxCodeId`?

Dropping `taxCodeId` was the original approach. It prevented the existing query from sweeping the line into recoverable totals — but by destroying the foreign key, it also made it impossible to aggregate by tax code for Box 9. The `taxClassification` column is a better discriminator: it encodes intent at posting time, making all downstream reporting queries pure SQL aggregations with no heuristics.

---

## Box 9 Aggregation

`TaxSummaryService` now runs three queries per report period:

1. **Output tax** — joins `taxCodes.outputAccountId = lines.accountId`
2. **Recoverable input tax** — joins `taxCodes.inputAccountId = lines.accountId`
3. **Box 9 / non-recoverable** — joins `taxCodes.id = lines.taxCodeId` WHERE `taxClassification = 'capitalised_non_recoverable'`

The third query result populates `nonRecoverableDisclosure` in the response. It is **excluded from `netPayable`** — blocked ITC is disclosed but not claimed.

---

## Deferred: Expense/Service AP Bills

Today's non-recoverable path is inventory-only. When service/expense AP bills land, the capitalised amount should route to `DR Expense` instead of `DR Inventory`. A new `expense_non_recoverable` classification value will be needed at that point. The enum was designed with this in mind.

---

## Key Invariants

- `taxClassification` is only set by automated accounting listeners — `manualLineSchema` intentionally omits it
- `netPayable = outputTax − inputTax` (recoverable only); `nonRecoverableDisclosure` is a separate disclosure section
- Nullable column — existing lines posted before DEV-358 have `NULL` and are invisible to Box 9 (correct: they were posted without the hook)
- Migration `0032_goofy_night_nurse.sql` is non-breaking (additive nullable column)
