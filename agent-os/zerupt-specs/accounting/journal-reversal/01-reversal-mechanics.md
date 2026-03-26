# Journal Reversal — Mechanics

> Service: `apps/api/src/journal-entries/journal-reversal.service.ts`

## Principle

Posted JEs are never edited. Reversal creates a new entry with swapped debit/credit lines.

## Pipeline

| Step | Action | Failure |
|------|--------|---------|
| 1 | Fetch original entry + lines | NotFound |
| 2 | Validate: must be `posted`, not already `reversed`, not itself a reversal | Conflict |
| 3 | Validate fiscal period for TODAY (reversal posts to current period) | BadRequest/Conflict |
| 4 | Build reversal lines: swap debit↔credit, debitTC↔creditTC | — |
| 5 | Balance validation on swapped lines | BadRequest (corrupt source guard) |
| 6 | Reserve doc number BEFORE transaction | — |
| 7 | Transaction: `SELECT FOR UPDATE` → re-validate → insert reversal → update original | Conflict on race |
| 8 | Emit `"accounting.journal-entry.reversed"` | — |

## Line Swapping Rules

| Original | Reversal |
|----------|----------|
| debit → credit | credit → debit |
| debitTC → creditTC | creditTC → debitTC |
| exchangeRateDate | **Copied from original** (IAS 21 — use original rate, not today's) |
| taxAmount | Carried as-is (direction follows swapped amounts) |
| description | Prefixed with `"Reversal: "` |

## Race Protection

1. `SELECT ... FOR UPDATE` on original entry inside transaction
2. Re-validate status under lock (must still be `posted`)
3. Optimistic guard: `UPDATE WHERE status='posted'` — 0 rows = already reversed by another user

## Date Rules

- Reversal always posts to **today's date** (current period)
- Original entry stays in its original period (even if locked)
- If current period is soft-locked: allowed only with `softLockOverrideReason`
- If current period is hard-locked: blocked

## Reversal Chain

- New entry: `reversalOfEntryId = original.id`
- Original: `status='reversed'`, `reversedByEntryId = reversal.id`
- CHECK constraint prevents: self-reversal, both links set, reversing a reversal

## Error Cleanup

Doc number reservation released in `catch` block if transaction fails. Warning logged if release also fails.
