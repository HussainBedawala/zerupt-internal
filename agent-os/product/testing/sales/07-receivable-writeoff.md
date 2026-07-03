# Sales — Receivable Write-offs Testing Checklist

> Persona: **a shop owner accepting that a trade customer will never pay, and clearing that debt off the books cleanly.** A write-off removes an uncollectible AR balance without pretending it was collected. No dedicated route — API-level; low-frequency for Asala.

- **Route:** none dedicated — API `tenant/sales/receivable-write-offs` (create, list).
- **Feature dir:** API `sales/receivable-writeoff/`.
- **Depends on:** 04 invoices (open AR to write off), COA (bad-debt expense account).

## 0. Preconditions
- [ ] An aged, unpaid open invoice exists.
- [ ] Logged in with the write-off permission (should be owner/admin-gated, NOT cashier).
- [ ] Period open.

## 1. Functional — actions & states
- [ ] **Write off** an open AR balance (full or partial) with a reason.
- [ ] Loading/error/success states; requires confirmation (destructive).

## 2. Domain invariants
- [ ] **GL:** Dr Bad-debt expense (or allowance), Cr AR (1131, party-tagged). Customer 1131 balance falls to zero (or by the written-off amount).
- [ ] **Reconcile invariant holds:** the invoice's open balance closes; Σ open invoices per customer = 1131 balance after write-off.
- [ ] **Not a receipt:** cash/bank is NOT touched — this is an expense, not a collection. Revenue already recognized stays; only the receivable is cleared.
- [ ] **Reversible:** an erroneous write-off can be reversed (net-zero contra), restoring the AR.
- [ ] Cannot write off more than the open balance.

## 3. Edge cases & defensive UX
- [ ] Write-off requires confirmation + reason; warns it clears the debt.
- [ ] Writing off a paid/closed invoice blocked.
- [ ] Zero/negative amount rejected.
- [ ] Closed-period block server-side.
- [ ] Permission gate enforced server-side (cashier cannot write off).
- [ ] KWD 3dp.

## 4. Cross-module / integration
- [ ] Bad-debt expense appears in P&L; AR aging drops the written-off balance.
- [ ] Write-off links back to the invoice/customer; drill-down resolves.

## 5. Known gaps
- No UI route — if write-off is only reachable via API, note whether the owner needs a screen (MEDIUM). Not needed for Asala go-live but should exist.

## Sign-off
- [ ] All CRITICAL/HIGH pass. Findings logged.
