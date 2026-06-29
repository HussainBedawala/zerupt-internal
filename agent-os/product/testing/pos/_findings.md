# POS — Testing Findings Log

> Running log of issues found during live testing. One row per finding. Update status as fixed.
> Severity rubric: see [`../README.md`](../README.md). Fix CRITICAL/HIGH immediately; batch MEDIUM/LOW for review.

## Baseline (2026-06-29, Asala dev tenant `zerupt_tenant_dev` @ `br-old-recipe-a1d3dw26`)

**Data state:** Asala has **1 register, zero shifts / transactions / payments / receipts / cash movements.** No POS activity has been rung up yet. The data tie-out invariants (cash reconciliation, balanced JE per sale, COGS relief per line, stock deduction per line, return/void reversal) **cannot be baselined until sales exist** — defer these to the live dogfooding pass, then re-run queries Q1–Q10 from recon.

**Structural baseline (dataset-independent — DB constraints + indexes):**

| Invariant | Guard found | Verdict |
|---|---|---|
| ≤1 open shift per register | partial unique idx `pos_shifts_one_open_per_register WHERE status<>'closed'` | ✅ DB-ENFORCED (recon worried this was service-only — it is a hard DB guard) |
| Cashier ≤1 open shift | partial unique idx `pos_shifts_one_open_per_cashier` | ✅ DB-ENFORCED |
| shiftNumber monotonic/unique per register | unique `(register_id, shift_number)` | ✅ |
| Idempotent offline replay (tx + shift) | partial unique `pos_transactions_tenant_client_id_key` + `pos_shifts_tenant_client_id_key WHERE client_id IS NOT NULL` | ✅ DB-ENFORCED |
| transactionNumber unique per tenant | unique `(tenant_id, transaction_number)` | ✅ |
| Exactly one receipt per transaction | unique `(tenant_id, transaction_id)` on `pos_receipts` | ✅ |
| Receipt token unique | partial unique `pos_transactions_receipt_token_key` | ✅ |
| costAtSale ≥ 0 | check `cost_at_sale >= 0` | ✅ (but ≥0 only — zero-cost still passes; verify >0 on live tracked items, recon Q7) |
| Foreign-currency payment requires rate | check `amount_fc IS NULL OR (exchange_rate IS NOT NULL AND >0)` | ✅ |
| changeGiven ≥ 0; payment amount > 0 | checks present | ✅ |
| openingFloat ≥ 0; cash movement amount > 0 | checks present | ✅ |

## Findings

| # | Date | Submodule | Severity | Summary | Repro | Expected vs Actual | Status |
|---|------|-----------|----------|---------|-------|--------------------|--------|
| 1 | 2026-06-29 | 02 Transaction Lifecycle | LOW | No DB CHECK backstop for `grandTotal = subtotal + taxTotal - discountTotal` (only individual non-negative checks exist). Header-total arithmetic is service-only — a service rounding/logic bug would persist with no DB guard. | `pg_constraint` scan on `pos_transactions` | A CHECK enforcing the total identity (as accounting/inventory ledgers have), or accept as service-validated + covered by tests | OPEN (confirm recon flag; decide CHECK vs test-only) |
| 2 | 2026-06-29 | (baseline) | NOTE | Asala has zero POS activity (1 register only). Data tie-out invariants undeferred until live sales rung up. | Row counts | Not a bug — testing-readiness gap. Ring up sales in the live pass, then run recon Q1–Q10 | LOGGED |
