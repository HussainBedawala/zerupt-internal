# 02 — AR Subledger Foundation

## What "AR Subledger" Means

The AR subledger is the per-customer breakdown of the GL Trade Receivables control account (1131).
Every confirmed sales invoice that has not been fully paid contributes to:
- GL: DR 1131 Trade Receivables / CR 4100 Product Sales + Output Tax
- Subledger: customer X is owed amount Y

The subledger must always reconcile to the GL: `SUM(sales_invoices.balance WHERE status='confirmed') = GL account 1131 balance`.

---

## THE KEY QUESTION: How Is AR Balance Computed?

**Answer: invoice-balance scan, NOT GL-derived.**

### How AR balance is stored

There is **no dedicated AR subledger table**. The AR balance is implicit in `sales_invoices`:

```
sales_invoices.balance = sales_invoices.total - sales_invoices.paidAmount
```

DB CHECK constraints enforce these invariants (`sales.ts` lines 260–270):
- `sales_invoices_subtotal_non_negative_check`
- `sales_invoices_paid_amount_non_negative_check`
- `sales_invoices_balance_non_negative_check`
- `sales_invoices_exchange_rate_positive_check`

However, there is **no DB CHECK that `balance = total - paidAmount`** (the purchase side has this as a named CHECK on `purchase_invoices`). The invariant is maintained by the service layer only.

### How outstanding balance is queried — customer list

`customers.service.ts` lines ~187–208 (outstandingSub subquery):

```sql
SELECT customer_id, COALESCE(SUM(balance), 0) AS outstanding
FROM sales_invoices
WHERE tenant_id = $1 AND status = 'confirmed'
GROUP BY customer_id
```

Left-joined onto the customers list. This is a live aggregate scan.

### How outstanding balance is queried — customer detail

`customers.service.ts` lines ~236–251 (`getCustomer`):

```sql
SELECT COALESCE(SUM(balance), '0')
FROM sales_invoices
WHERE tenant_id = $1 AND customer_id = $2 AND status = 'confirmed'
```

### How AR KPI is computed in the overview

`sales-overview.service.ts` line ~71 (outstandingReceivables):

```sql
SELECT coalesce(sum(balance), '0')
FROM sales_invoices
WHERE tenant_id = $1 AND status = 'confirmed'
```

---

## GL Party-Tagging — THE KEY DIFFERENCE FROM PURCHASE

**The sales module DOES party-tag AR journal entry lines**, unlike the purchase side at Layer 0.

`journal-entry.ts` lines 354–361:
```
partyType: partyType("party_type")
partyId:   uuid("party_id")
```
Composite CHECK (line 492–495): both must be set or both null.
Index (line 536–537): `jel_party_type_party_id_posting_date_idx` — supports AR/AP aging by customer/supplier.

`sales.listener.ts` — ALL four sales events party-tag the AR control line:

| Event | JE line tagged | partyType | partyId |
|-------|---------------|-----------|---------|
| `sales.invoice.confirmed` | DR receivable | `customer` | `payload.customerId` |
| `sales.creditNote.confirmed` | CR receivable | `customer` | `payload.customerId` |
| `sales.receipt.posted` | CR receivable (allocated portion) | `customer` | `payload.customerId` |
| `sales.receivable.writeOff` | CR receivable | `customer` | `payload.customerId` |

This means the **GL DOES have a per-customer AR subledger** via party-tagged JE lines on account 1131 (`trade_receivables` system role). This is correct architecture.

**BUT the customer-facing balance queries still scan `sales_invoices.balance`, not the GL.**

---

## AR Subledger Invariants

| Invariant | Enforced by |
|-----------|-------------|
| `balance >= 0` | DB CHECK on `sales_invoices` |
| `paidAmount >= 0` | DB CHECK on `sales_invoices` |
| `balance = total - paidAmount` | Service layer ONLY (no DB CHECK) |
| Only `confirmed` invoices contribute to AR | Query filter |
| AR balance sum = GL 1131 balance | NOT enforced structurally; no reconciliation |
| GL 1131 lines are party-tagged | Enforced by `sales.listener.ts` schema validation |

---

## GL Control Account 1131

The `trade_receivables` system role maps to account 1131 (`packages/db/src/schema/enums.ts` line 635).
Account mappings resolve the actual GL account at event time via `account_mappings` table.
The `sales.listener.ts` uses `lineType: "receivable"` which the posting engine resolves to the `trade_receivables` system role account.

---

## Reconciliation Gap

**CURRENT:** No automated check that `SUM(sales_invoices.balance WHERE confirmed) = GL 1131 balance`.

If:
- A manual JE is posted to 1131 without a corresponding sales invoice, or
- The invoice `balance` column drifts from `total - paidAmount` (service bug),

...the subledger-to-GL tie breaks silently.

The close management module has `reconcile_ar_ap_subledger` close task key (`enums.ts` line 584), but no implementation feeds it data.

**Note:** The purchase Layer 0 identified the same reconciliation gap. It is a shared cross-module debt.

---

## Comparison: AR vs AP Subledger Architecture

| Aspect | AR (Sales) | AP (Purchase) |
|--------|-----------|---------------|
| Balance column | `sales_invoices.balance` | `purchase_invoices.balance` |
| Balance = total - paid DB CHECK | NO | YES (named CHECK) |
| GL control account | 1131 `trade_receivables` | 2111 `trade_payables` |
| GL lines party-tagged | YES — all 4 events | YES — but purchase Layer 0 flagged some gaps |
| Customer/supplier outstanding queried from | Invoice scan | Invoice scan |
| Per-customer GL subledger exists | YES (via JE party tags) | YES (via JE party tags) |
| Reconciliation enforcement | None | None |
| Journal entry FK on invoice | NO (no `journal_entry_id` on `sales_invoices` for non-opening) | NO |
