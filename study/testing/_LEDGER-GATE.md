# THE LEDGER GATE — use the STATUS-AWARE form

> Put this in every agent brief. The old status-blind query has produced TWO
> false alarms in a single session, each costing an agent real time and nearly
> producing a false "integrity breach" report.

## Use this

```sql
SELECT round(sum(l.debit - l.credit), 6)
FROM journal_entry_lines l
JOIN journal_entries je ON je.id = l.journal_entry_id
WHERE je.status IN ('posted', 'reversed');   -- MUST be 0.000000
```

## NOT this

```sql
SELECT round(sum(debit - credit), 6) FROM journal_entry_lines;   -- status-BLIND
```

## Why

The blind form sums **every line regardless of journal status**, including
DRAFTS. A draft is legitimately allowed to be unbalanced while a bookkeeper is
still typing it, and this testing programme deliberately creates unbalanced
drafts to probe the posting gate. So the blind query reports a non-zero number
that looks exactly like a catastrophic ledger breach and is not one.

Twice in the session of 2026-08-30 it read `7.000000`, and both times the entire
imbalance was one deliberate ZZTEST draft (`ZZTEST unbalanced probe 2`, then
`ZZTEST unbalanced post gate`) while the posted ledger was a clean `0.000000`.

Worse than the false alarm: the blind form can also produce a false ALL-CLEAR,
because a draft imbalance can offset a real posted imbalance and net to zero.

## If it ever does fire

Split by status FIRST, before concluding anything:

```sql
SELECT je.status, count(DISTINCT je.id) AS entries, round(sum(l.debit-l.credit),6) AS net
FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
GROUP BY je.status ORDER BY je.status;
```

Then name the offending entries:

```sql
SELECT je.entry_number, je.status, je.description, round(sum(l.debit-l.credit),6) AS net
FROM journal_entries je JOIN journal_entry_lines l ON l.journal_entry_id = je.id
GROUP BY je.id, je.entry_number, je.status, je.description
HAVING round(sum(l.debit-l.credit),6) <> 0;
```

Only a non-zero net on `posted` + `reversed` is an integrity breach. If that
happens: **STOP, report loudly, and do NOT write a correcting entry.** The
sanctioned recovery is void + re-raise THROUGH THE PRODUCT, never a hand-written
correcting journal — that is how Purchase recovered stranded money.

The status set `('posted','reversed')` is not arbitrary: it matches
`BALANCE_AFFECTING_JE_STATUSES`, the same set the trial balance and both
reconciliation services already use. A reversed line still affects the ledger,
which is why excluding it (as two services once did) produced false tie-out
mismatches.
