# 02 — AP Subledger Foundation

## What "AP Subledger" Means

The AP subledger is the per-supplier breakdown of the GL Trade Payables control account (2111). Every confirmed purchase invoice that has not been fully paid contributes to:
- GL: DR Inventory (or Expense) / CR 2111 Trade Payables
- Subledger: supplier X owes amount Y

The subledger must always reconcile to the GL: `SUM(purchase_invoices.balance WHERE status='confirmed') = GL account 2111 balance`.

---

## Current Implementation

### How AP balance is stored

There is **no dedicated AP subledger table**. The AP balance is implicit in `purchase_invoices`:

```
purchase_invoices.balance = purchase_invoices.total - purchase_invoices.paidAmount
```

A DB CHECK constraint enforces this invariant (`purchase_invoices_balance_integrity_check`, `purchase.ts` line 289–292).

### How outstanding balance is queried

`suppliers.service.ts` lines 177–186 (list) and 226–237 (detail):

```sql
SELECT supplier_id, COALESCE(SUM(balance), 0) AS outstanding
FROM purchase_invoices
WHERE tenant_id = $1 AND status = 'confirmed'
GROUP BY supplier_id
```

This is a live aggregate scan — no materialized AP balance column on the supplier row.

### GL tie to account 2111

The journal entry is posted via the accounting module on `purchase.grn.confirmed` event (or on direct purchase invoice confirm). It CRs account 2111 (Trade Payables). The link between the JE and the purchase invoice is:
- `purchase_invoices.openingJournalEntryId` for opening bills (plain uuid, no FK)
- For regular bills: accounting event listeners look up the invoice by event payload; there is no `journal_entry_id` FK on `purchase_invoices` for regular postings

**CURRENT STATE:** There is no `journal_entry_id` column on `purchase_invoices` for non-opening postings. The only way to trace a bill to its JE is via the audit log or the accounting module's event outbox.

---

## AP Subledger Invariants (What the System Must Maintain)

| Invariant | Enforced by |
|-----------|-------------|
| `balance = total - paidAmount` | DB CHECK on `purchase_invoices` |
| `balance >= 0` | DB CHECK |
| `paidAmount >= 0` | DB CHECK |
| Only `confirmed` invoices contribute to AP | Query filter (`status = 'confirmed'`) |
| AP balance sum = GL 2111 balance | NOT enforced structurally; reconciliation is procedural |

---

## GL Control Account 2111

Spec (`accounting/04-chart-of-accounts.md`) defines:
- Account 2111: Trade Payables (system role: `trade_payables`)
- Account mapping: `purchase.grn.confirmed` → CR 2111

The `account_mappings` table (`packages/db/src/schema/account-mapping.ts`) holds per-tenant mappings. The purchase module reads this at event time to resolve the correct GL account.

---

## Reconciliation Gap

**CURRENT:** No automated reconciliation check. If a JE is posted manually to 2111 without a corresponding purchase invoice (or vice versa), the subledger-to-GL tie breaks silently.

**REQUIRES (10-year):**
1. A `journal_entry_id uuid` column on `purchase_invoices` linking the confirmed-bill JE (non-opening path). Enables direct traceability.
2. A periodic reconciliation job or close-checklist task: `SUM(purchase_invoices.balance WHERE status='confirmed') = GL 2111 balance`. The close management module has `closeTaskKey` enum with `reconcile_ar_ap_subledger` already defined (`enums.ts` line 584).
3. The `reconcile_ar_ap_subledger` task key exists but no implementation feeds it data.

---

## Subledger Structure Comparison

| Path | How AP is created | Subledger entry |
|------|--------------------|-----------------|
| Direct purchase (no PO) | Confirm purchase invoice directly | `purchase_invoices` row with `source_grn_ids = null` |
| PO chain | GRN confirm → bill from GRN | `purchase_invoices` row with `source_grn_ids = [grn_id, ...]` |
| Opening balance | `isOpening = true` bill | `purchase_invoices` row linked to opening JE |

All three paths write a `purchase_invoices` row. The subledger model is path-agnostic — this is correct.
