# 03 — Opening AP Balances

## Mechanism

Opening AP balances (amounts owed to suppliers at system go-live) are represented as stub `purchase_invoices` rows with `is_opening = true`.

### Key fields on the stub bill

| Column | Value for opening | Purpose |
|--------|------------------|---------|
| `is_opening` | `true` | Identifies the bill as carry-forward |
| `opening_journal_entry_id` | uuid of the GL JE | Links stub to the JE already posted to 2111 |
| `status` | `confirmed` | Contributes to AP subledger immediately |
| `balance` | opening AP amount | Amount owed to this supplier |
| `source_grn_ids` | null | No GRN for opening bills |

Source: `purchase.ts` lines 254–265.

### Why stub bills?

The opening balance JE (DR Opening Balance Equity / CR 2111) is posted by the accounting `OpeningBalanceService`. The AP subledger must reflect the same amount per supplier. A stub `purchase_invoices` row satisfies this without creating a fake expense entry. The `is_opening = true` flag tells listeners NOT to re-post accounting entries on confirm.

---

## Import Flow (`opening-balance-import.ts`)

The orchestration table `opening_balance_import_runs` manages the multi-step import:

| Step | Action |
|------|--------|
| Upload | File parsed, `content_fingerprint` computed |
| Validate | Control totals captured in `control_totals` jsonb field |
| Apply | Accounting JEs posted + stub `purchase_invoices` created |
| Reconcile | `SUM(opening bills.balance) == control_totals.ap` |

The `openingImportKind` enum includes both `balances` (GL/AR/AP) and `stock` kinds.

**Idempotency:** Partial unique index ensures the same `content_fingerprint` can only be committed once per `(tenant_id, kind)` (`opening-balance-import.ts` lines 61+).

---

## `opening_journal_entry_id` — plain uuid, no FK

`purchase_invoices.opening_journal_entry_id` is a plain uuid (no `.references()`). Comment at `purchase.ts` line 258: "cross-aggregate FK is not used here, matching the confirmedBy convention."

**REQUIRES:** While the no-cross-aggregate-FK convention is consistent with the rest of the system, a CHECK or trigger should verify the JE exists when `is_opening = true`. Currently nothing prevents `is_opening = true` with a null or bogus `opening_journal_entry_id`.

Suggested constraint: `CHECK (is_opening = false OR opening_journal_entry_id IS NOT NULL)` — this ensures every opening bill has a JE reference. Add it via migration.

---

## Opening Bills and Payments

Opening stub bills participate in normal payment allocation — a supplier payment can allocate to an opening bill exactly as it would to a regular bill. This is correct: the customer owes the money regardless of when it was entered.

---

## Multi-currency Opening Bills

Opening bills carry `currency` and `exchange_rate`. The opening JE (in `openingJournalEntryId`) must have been posted at the same rate to balance.

**REQUIRES:** No check that `purchase_invoices.exchange_rate` matches the rate used in the linked opening JE. Mismatches would cause the subledger-to-GL reconciliation to fail silently. Document this as a gap for Layer 3 hardening (when the JE linkage is tightened).

---

## Period Control Relevance

Opening balance bills are typically backdated to the last day of the prior fiscal year. `validatePeriod(invoiceDate)` must not reject this date (the period should be OPEN at import time). After import, that period is closed, so the opening bills become immutable via the period lock — this is the correct behavior.
