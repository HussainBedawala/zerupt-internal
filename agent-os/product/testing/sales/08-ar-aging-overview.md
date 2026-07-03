# Sales — AR Aging / Overview Testing Checklist

> Persona: **a shop owner glancing at "who owes me and how much" at a glance.** The sales hub summarizes AR, recent sales, and top customers. Numbers here MUST tie to the ledger — a self-contradicting dashboard is a trust-killer.

- **Route:** `/sales` (overview hub)
- **Feature dir:** `apps/web/src/features/sales-overview/`
- **API:** `tenant/sales/overview` (`GET /summary` — AR aging, KPIs)
- **Depends on:** 01–07 (all AR-affecting documents).

## 0. Preconditions
- [ ] Asala dataset loaded with opening AR (370.500) plus a few test sales/receipts/credit-notes.
- [ ] Logged in as Owner; confirm Cashier does NOT see AR totals/margin here.

## 1. Functional — actions & states
- [ ] Hub loads under ~5s; KPIs render (outstanding AR, sales today/period, txn count).
- [ ] AR aging section shows buckets (current / 30 / 60 / 90+) or a customer list with balances.
- [ ] Loading skeletons, empty state (fresh tenant), and error state all present.
- [ ] Date-range / period filter recomputes correctly; CSV export (if present) matches screen.

## 2. Domain invariants — the numbers must tie
- [ ] **Outstanding AR KPI = total 1131 in the GL = Σ all customer balances.** No self-contradiction between the KPI and the aging/customer breakdown (the exact class of bug found in purchase #1: KPI showed a figure while aging said "none").
- [ ] **Opening AR (370.500) is visible** in the aging/breakdown — opening balances imported as an opening journal must NOT be excluded from the aging read (purchase #1 root cause: `isOpening` filter). It should reconcile to 1131.
- [ ] Aging buckets sum to the total outstanding; no row double-counted.
- [ ] After a new credit sale / receipt / credit note, the hub updates and STILL ties to 1131.
- [ ] Cash sales (settled immediately) do NOT inflate AR.

## 3. Edge cases & defensive UX
- [ ] Fresh tenant / no sales → honest empty state, not a broken/blank panel or "NaN".
- [ ] KWD 3dp on every figure; currency from `useTenantCurrency()` (not USD/SAR hardcode).
- [ ] No redundant module header on the hub sub-page.
- [ ] RTL (Arabic) layout renders; numbers/dates localized.
- [ ] Large customer counts paginate/scroll without layout break.

## 4. Cross-module / integration
- [ ] AR aging here matches Reports > Aged Receivables and the Trial Balance 1131 line (single source of truth).
- [ ] Drill from a customer/KPI into the underlying invoices/receipts resolves.

## 5. Known gaps
- Watch for TWO AR-aging implementations (doc-based vs GL-native) drifting — the purchase pass flagged consolidating duplicates. Verify sales has ONE source or they agree exactly.

## Sign-off
- [ ] All CRITICAL/HIGH pass. Findings logged.
