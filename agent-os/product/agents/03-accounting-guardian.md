# Accounting Guardian Agent

## Purpose

Detect accounting anomalies and maintain data integrity. Surfaces suggestions for journal imbalances, missing event-to-journal mappings, suspense account buildups, and period close readiness.

**Rate limit:** 20 suggestions/day/tenant

---

## Monitors

### Event-Driven Checks

| Check | Trigger Event | Logic |
|-------|---------------|-------|
| Journal balance check | `accounting.journal.posted` | Verify `SUM(debit) = SUM(credit)` for the posted journal. Flag if difference > 0. |
| Missing event-to-journal mapping | Any business event from `accounting/07-event-mappings.md` | If a business event fires but no journal entry is created within 5 minutes, create a Warning suggestion. Uses a delayed BullMQ job. |
| Opening Balance Equity non-zero | `accounting.openingBalance.modified` | After any opening balance change, check if account 3900 has a non-zero balance. Flag as Warning if > 0. |

### Scheduled Checks

| Check | Schedule | Logic |
|-------|----------|-------|
| Unbalanced journal scan | Nightly (`0 2 * * *`) | Scan all journals in current open period. Flag any with `SUM(debit) != SUM(credit)`. |
| Period close readiness | Daily (`0 8 * * *`) | 3 days before configured close date: verify all journals balanced, no pending imports, no unposted drafts. |
| Suspense account buildup | Weekly (`0 3 * * 1`) | Check GRN Accrual (2121) and Opening Balance Equity (3900) balances. Flag if growing or stale (>30 days unmatched). |
| FX revaluation due | 3 days before period end | Check for open foreign currency balances. Flag if unrealised gains/losses exist and revaluation hasn't been run. |
| Rounding error detection | Nightly (`0 2 * * *`) | Identify journals where debit/credit difference is < 0.01 in functional currency — likely rounding errors from tax calculations. |

## Example Suggestions

**CRITICAL:**
> Journal entry JE-2026-0342 is unbalanced by 0.005 KWD. This is likely a rounding error in the tax calculation for Invoice INV-KWT-1234.
>
> `suggestedAction: { actionType: "journal.adjust", endpoint: "/api/journals/{id}/adjust", payload: { accountCode: "6700", amount: 0.005, description: "Rounding adjustment" } }`

**WARNING:**
> GRN Accrual (2121) has a balance of 12,450.000 KWD across 8 unmatched goods receipts. These have been unmatched for over 30 days.
>
> `suggestedAction: { actionType: "navigate", endpoint: null, payload: { route: "/inventory/grn?status=unmatched" } }`

**INFO:**
> Period 2026-02 is ready to close. All journals balanced, no pending imports, no unposted drafts.
>
> `suggestedAction: { actionType: "period.close", endpoint: "/api/fiscal-periods/{id}/close", payload: {} }`

## Event References

Events from `accounting/07-event-mappings.md`:
- `accounting.journal.posted`
- `accounting.openingBalance.modified`
- `pos.transaction.completed` (verify COGS journal created)
- `sales.invoice.confirmed` (verify revenue journal created)
- `purchase.grn.approved` (verify accrual journal created)
- `inventory.adjustment.approved` (verify adjustment journal created)

## Permissions

| Action | Required Key |
|--------|--------------|
| View accounting suggestions | `dashboard.suggestions.view` + `accounting.journal.view` |
| Accept journal adjustment | `accounting.journal.adjust` |
| Accept period close | `accounting.period.close` |
