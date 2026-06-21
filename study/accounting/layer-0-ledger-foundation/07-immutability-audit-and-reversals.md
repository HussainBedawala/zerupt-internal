# 07 — Immutability, Audit, and Reversals

## The rule: posted history is never changed

Once a journal entry is **posted**, it is **permanent**. You cannot edit it. You cannot delete it.
This is not a software limitation — it is a core principle of accounting integrity, centuries old.

Why so strict?

1. **Trust.** If posted records could change, no balance could ever be trusted — last month's
   profit could silently become a different number today.
2. **Audit.** Tax authorities (ZATCA in Saudi, FTA in UAE, GST in India) and auditors require an
   unalterable trail. "We changed it" is not acceptable; "we corrected it with a visible
   counter-entry" is.
3. **Debuggability.** An immutable ledger means the data tells the true story of what happened.
   You can always reconstruct any past state.

## So how do you fix a mistake? You reverse it.

If a posted entry is wrong, you do **not** edit it. You post a **second, opposite entry** that
cancels it out, then post a correct one. The wrong entry stays visible forever; its effect is
neutralized by the reversal.

Example: you posted a 500 sale to the wrong customer.

```
Original (wrong, stays forever):
   AR — Customer A   Dr 500
   Sales                Cr 500

Reversal (cancels it):
   Sales             Dr 500
   AR — Customer A      Cr 500     ← debits/credits swapped

Then post the correct entry to Customer B.
```

Net effect on Customer A: zero. But the *history* shows exactly what happened and how it was
corrected. This is the only legitimate correction mechanism. "Edit and re-post" does not exist.

In our system, reversal:
- creates a new entry with every line's **debit and credit swapped**
- posts it to **today's** open period (never reopening a closed one)
- preserves the original exchange rate and rate-date (IAS 21 correctness)
- links the two entries **bidirectionally** (`reversal_of` ↔ `reversed_by`)
- marks the original's status as `reversed`
- is **race-safe**: it locks the original row (`SELECT FOR UPDATE`) and guards against
  double-reversal

## Drafts are the exception — and that's fine

*Draft* entries are not yet part of the official ledger, so they ARE freely editable and
deletable. Immutability begins the instant an entry is **posted**. The only legal status moves:

```
draft ──post──▶ posted ──reverse──▶ reversed
  │
  └──delete──▶ (gone)        (posted/reversed can never be deleted)
```

## Enforcing immutability — defense in depth

It's not enough to "not write edit code." A bug, a migration, or an admin script could still
mutate a posted row. So immutability must be enforced as deep as possible:

- **Application layer**: services simply have no code path to edit a posted entry.
- **Database layer (the real guarantee)**: database **triggers** physically block `UPDATE` and
  `DELETE` on posted/reversed entries and their lines. The *only* mutation the trigger permits is
  the precise `posted → reversed` status transition — and it uses a **column allowlist** so even
  that transition cannot secretly change an amount. This is the gold standard: even a rogue SQL
  statement is rejected by the database itself.

Our schema implements exactly this (migrations for line immutability and header immutability with
the column allowlist). The lines table deliberately has **no `updated_at`** column — a signal that
lines are write-once.

## The audit log — the second record

Beyond ledger immutability, every mutation in the system is recorded in an **append-only audit
log**: who did what, when, from what IP, with a before/after snapshot. The audit log itself is
trigger-protected against update/delete. So there are two layers of forensic truth: the immutable
ledger (the *what*) and the audit log (the *who/when/how*).

## The mental model

> Posted = carved in stone. Wrong? Carve a correcting counter-entry next to it. The stone is never
> re-carved. The database itself refuses to re-carve it.

Next: `08-atomic-and-idempotent-posting.md`.
