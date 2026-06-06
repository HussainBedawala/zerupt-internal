# Idempotent Permission Checks — Lessons from DEV-389 Review

> Phase 4A study note. Context: permission bypass patterns found during POS hardening code review.

---

## The Core Problem: Capability vs Endpoint

Authorization logic is often written per-endpoint. When the same **capability** is exposed through multiple write paths, a gap appears: you secure endpoint A but forget endpoint B provides the same access.

Example at POS:
- `POST /transactions` — checks `pos:transact` permission. Secure.
- `POST /transactions/:id/items` — adds a line item after the fact. If it skips the same `pos:transact` check, a user without POS access can mutate a transaction through the sibling route.

**Rule:** Group endpoints by capability, not by URL structure. Every write path that modifies the same resource must share one permission gate, ideally enforced at the service layer (not just in the controller), so new routes cannot accidentally bypass it.

---

## Client-Supplied Actor IDs = Audit Spoofing

If the API accepts `cashierId` or `userId` in the request body and writes it directly to the audit log, any client can claim to be any user.

Consequences:
- Audit trail becomes unreliable (compliance failure in jurisdictions requiring tamper-evident logs).
- Malicious cashier can attribute actions to a manager or colleague.

Fix: **always derive actor identity from the authenticated JWT**, never from the request body. The body may carry a `customerId` or other entity reference, but the acting user is always `req.user.sub` (or equivalent from the verified token).

---

## Idempotency Key Placement: Replay Before Check

An idempotent endpoint accepts a client-supplied key and returns the original response if the key was already processed. The subtle ordering question:

```
Option A (wrong):  check permissions → process → store idempotency record
Option B (correct): check idempotency → if replay, return early; else check permissions → process → store
```

Why option A is wrong: If a replay arrives after the original caller's permissions were revoked, the endpoint re-validates and blocks the replay — breaking idempotency for the legitimate original requestor.

Why option B is correct: A replay is returning a previously authorised result. The permission check was satisfied at original-request time and is part of the stored outcome. Replaying it does not re-authorise; it re-delivers.

Caveat: the idempotency record must store the full response (status + body), not just a flag. And the original must have succeeded — failed requests (4xx/5xx) should not be replayed as successes.

---

## Same-Capability Gate Pattern

```
// Service layer (pseudo-code)
async function recordTransaction(actorId, payload, idempotencyKey) {
  // 1. Replay check first
  const existing = await idempotencyStore.get(idempotencyKey)
  if (existing) return existing.result

  // 2. Permission gate (single place, called by ALL write paths)
  await assertPermission(actorId, 'pos:transact')

  // 3. Business logic
  const result = await processTransaction(actorId, payload)

  // 4. Store idempotency record
  await idempotencyStore.set(idempotencyKey, { result })
  return result
}
```

Controllers for `POST /transactions` and `POST /transactions/:id/items` both call the same service method — the gate is in one place and cannot be bypassed.

---

## Audit Log Integrity Rules

1. Actor = JWT subject, written by the server — never accepted from client.
2. Timestamps = server clock (UTC) — never client-supplied.
3. Audit records are append-only; no UPDATE or DELETE permitted on audit tables.
4. For financial mutations, log both before and after state (not just the delta).
5. Idempotent replays do not create a second audit record — they return the original response without re-executing.

---

## Checklist for Any New Write Endpoint

- [ ] Does another endpoint provide the same capability? If yes, share the same service-layer permission gate.
- [ ] Is actor identity taken from the JWT (not the request body)?
- [ ] If idempotency key is accepted, is the replay check before the permission check?
- [ ] Are audit records written with server-side actor and timestamp?
- [ ] Is the audit table append-only in the DB schema?
