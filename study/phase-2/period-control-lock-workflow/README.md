# Period Control: Soft/Hard Lock Workflow

## Core Concept

Fiscal period control prevents unauthorized changes to closed accounting periods. Three states form a directed graph:

```
Open ←→ SoftLocked → HardLocked → Open (with reason)
```

- **Open**: Normal posting allowed
- **SoftLocked**: Warning state — manual entries with override reason allowed, auto-generated entries blocked
- **HardLocked**: All posting blocked — requires explicit unlock with audit reason

## Why Period Locking Matters

Without period locks, users can accidentally (or intentionally) post transactions to past periods, corrupting financial statements that may have already been reported to regulators. In MENA/India/SEA, tax filings are period-based — a backdated entry into a filed period creates a compliance violation.

## No-Backdating-Past-Locks Rule

The `isBackdatedPastLock` flag answers: "Does this transaction date fall before the earliest non-locked period?" If yes, the transaction is rejected regardless of the target period's own status. This prevents circumventing locks by targeting dates just before a locked range.

Implementation: query the earliest period where `status != 'hard_locked'`, compare its start date against the transaction date.

## Fiscal Year Close/Reopen

Closing a fiscal year auto-locks all periods to HardLocked. Reopening does NOT auto-unlock — intentional friction forces explicit period-by-period unlock decisions with audit reasons.

Race protection via `SELECT FOR UPDATE` prevents two users from simultaneously closing/reopening the same year.

## DB Enum vs API Enum Mapping

PostgreSQL enums use snake_case (`open`, `soft_locked`, `hard_locked`). API layer uses PascalCase (`Open`, `SoftLocked`, `HardLocked`). A bidirectional mapper (`toDbPeriodStatus` / `fromDbPeriodStatus`) bridges the gap. Without this, comparison logic silently fails — `"open" !== "Open"` evaluates to `true`, breaking all transition validation.

Lesson: always test with realistic DB values, not convenience values that happen to match API conventions.

## Batch Operations and TOCTOU

Batch lock/unlock reads all periods, filters those needing change, then updates. Without a transaction wrapper, a concurrent request between read and write creates a Time-of-Check-Time-of-Use (TOCTOU) race — the filter becomes stale. Wrapping in a transaction with serializable isolation prevents this.

## Audit Trail Design

Period control operations log:
- **Per-period before/after state** in batch operations (not just affected IDs)
- **Preserved history** when reopening (closedAt/closedBy captured in `before` snapshot before nulling)
- **Reason fields** mandatory for destructive operations (unlock hard-locked, reopen year, batch unlock)

This creates a complete forensic trail for auditors asking "who unlocked period X and why?"

## Key Concepts

- Directed state graph with transition validation
- `SELECT FOR UPDATE` for pessimistic locking in PostgreSQL
- TOCTOU race conditions in read-then-write patterns
- Enum mapping between storage and application layers
- Audit trail design for financial compliance
