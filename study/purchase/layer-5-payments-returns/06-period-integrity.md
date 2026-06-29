# Module-Wide Period Integrity

## Where `validatePeriod` Is Called in Layer 5

| Operation | Business date used | File:line |
|-----------|-------------------|-----------|
| Payment post | `paymentDate` | `service.ts:390` |
| Payment post (composable) | `paymentDate` | `service.ts:681` |
| Advance allocation | `new Date()` (today, not advance date) | `service.ts:878-879` |
| Return confirm | `returnDate` | `returns.service.ts:372` |

The advance-allocation date being "today" is intentional and documented: the prepayment-to-AP reclassification is a new event dated when it occurs, not backposted to the original advance date.

## Period Status Handling

| Status | Payment | Return |
|--------|---------|--------|
| `Open` | Allowed | Allowed |
| `SoftLocked` | Allowed if `softLockOverrideReason` provided AND `assertSoftLockOverrideAllowed` passes | Same |
| `HardLocked` | 422 blocked | 422 blocked |

### Soft-lock flow (same pattern both places)

```
validatePeriod → SoftLocked
  if (!input.softLockOverrideReason) throw 422
  assertSoftLockOverrideAllowed(tenantId, userId, period)  ← permission check
  softLockOverride = buildSoftLockOverride(true, userId, reason)
  // ... proceed with post/confirm
  outboxPayload includes softLockOverride → spread onto JE payload
```

Critical: the override is authorized BEFORE the doc number reservation and the outbox insert. This ensures the JE never silently dead-letters while the document shows posted (per comments at `payments.service.ts:401-406` and `returns.service.ts:383-387`).

## Number Reservation and Rollback Safety

Both payment post and return confirm follow the same pattern:

```
reserveNumber(...)
try {
  db.transaction(...) // outbox insert inside tx
  committed = result
} catch {
  safeReleaseReservation(...)  // reclaim the reserved number
  throw
}
safeCommitReservation(committed.id)
```

`safeRelease` / `safeCommit` log errors but never rethrow — a failed commit/release does not break the user-facing response. A leaked reservation is handled by the numbering service's cleanup path.

## Composable Post and Period

`postComposed` validates the period inside the parent transaction (`service.ts:681`). The reservation is also taken inside the tx (`service.ts:701`). The fast-path emit and reservation commit are pushed to `compose.postCommit`. If the parent tx rolls back, the reservation is automatically reclaimed (it was inserted inside the same tx).

## Concurrency Correctness

| Race | Protection |
|------|-----------|
| Two concurrent payments against the same bill | FOR UPDATE lock on bill at post time (`service.ts:509`) |
| Two concurrent PR confirmations against the same GRN line | FOR UPDATE lock on GRN rows (`returns.service.ts:677`) |
| Advance over-allocation (concurrent apply) | FOR UPDATE lock on advance row (`service.ts:904`) |
| Concurrent PR confirm + line add | FOR UPDATE lock on PR row at confirm entry (`returns.service.ts:408`) |

## EXISTS vs REQUIRES

| Feature | Status |
|---------|--------|
| HardLock blocking on payment post | EXISTS |
| SoftLock override on payment post (+ composable) | EXISTS |
| SoftLock override on return confirm | EXISTS |
| Period validation on advance allocation | EXISTS |
| Number reservation + rollback guard | EXISTS |
| Soft-lock pre-authorized before number reservation | EXISTS |
| Period enforcement on payment reversal | REQUIRES (no reversal endpoint) |
| Period enforcement on return void | REQUIRES (no void endpoint) |
