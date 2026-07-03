# Sales — Cross-module Contracts Testing Checklist

> Persona: **the owner who trusts that a sale at the counter quietly keeps stock, the books, and the reports all correct — without them having to reconcile anything by hand.** This submodule verifies the handoffs OUT of sales: to inventory, to the GL, to reports. Run it LAST, after 01–08.

- **Scope:** GL (journal_entries), inventory (stock ledger + valuation), reports (TB, P&L, BS, aged receivables), event/outbox durability.
- **Depends on:** all sales submodules.

## 1. Sales → GL
- [ ] Every confirmed invoice / direct sale / receipt / credit note / write-off produces a **balanced** journal (debits = credits) with the correct accounts (1131 AR, revenue, output VAT, COGS, inventory, cash/bank, bad-debt).
- [ ] Party-tagging: every AR line carries the customer id, so the subledger is derivable.
- [ ] **Reconcile invariant end-to-end:** after a full cycle (sale → partial receipt → credit note → write-off), Σ open invoices per customer = customer 1131 = total 1131 in TB. No drift.
- [ ] Void/reversal journals are net-zero contras of the originals; no orphan lines.

## 2. Sales → Inventory
- [ ] Invoice confirm / direct sale creates a **SALE stock movement** and decrements on-hand by exactly the sold qty; COGS = realized WAC/FIFO cost.
- [ ] Credit note creates a **RETURN movement** and restores stock at the ORIGINAL cost.
- [ ] Oversell is impossible: no sale can drive on-hand negative; the confirm rolls back first.
- [ ] Inventory valuation (1141) after a sale = prior value − COGS relieved; ties to the GL inventory account.
- [ ] **No double relief:** exactly one stock movement per confirmed line, even under ret/re-confirm/double-submit.

## 3. Sales → Reports
- [ ] **Trial Balance:** 1131 = Σ customer AR; balances (Dr = Cr) after every sales action.
- [ ] **P&L:** revenue = Σ confirmed sales (net of credit notes); COGS = Σ realized cost; gross margin sane.
- [ ] **Balance Sheet:** balances; AR, Inventory, Cash all move consistently with the sales activity.
- [ ] **Aged Receivables** grand total = 1131 control (matches the sales hub in 08).

## 4. Event / outbox durability (the silent-gap guard)
- [ ] `sales.invoice.confirmed` and related events post their GL/stock effects via the **durable outbox** — a listener failure retries/DLQs, it does NOT mark the document "confirmed" with no journal (the suppressErrors gap fixed codebase-wide — verify it holds for sales).
- [ ] Replaying / retrying a failed post is idempotent (exactly-once effect).
- [ ] No sales effect depends on a fire-and-forget in-memory event that can be lost on restart.

## 5. Tenant isolation & period
- [ ] All sales data, ledgers, and reports scoped to the current tenant only; no cross-tenant leak in any drill-down.
- [ ] No sales document can post/void into a closed period; guard is server-side with a clear message.

## Sign-off
- [ ] All CRITICAL/HIGH pass across the full sales → GL → inventory → reports chain.
- [ ] Findings logged in `_findings.md`.
