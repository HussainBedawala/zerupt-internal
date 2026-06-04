# Postgres Job Queues & the Outbox Pattern (DEV-388)

Why Zerupt's tenant provisioning moved from BullMQ + Upstash Redis to pg-boss
on the Neon admin DB — and the concepts that made the decision.

## 1. Why per-request-billed Redis and BullMQ are a bad pairing

BullMQ workers poll Redis continuously — `evalsha` every few seconds per
queue, even with zero jobs (~500K commands/day idle). Upstash bills per
request (free tier: 500K/month). The math: an idle deployment exhausts a
month's quota in roughly a day. When the cap hit, every queue operation
failed — including the enqueue inside signup. Lesson: **match the billing
model to the workload's traffic shape.** Polling workloads need
capacity-billed infra (memory/CPU), not request-billed.

## 2. The dual-write problem (and how it bricked signups)

The old signup did two writes to two systems:

1. Admin DB: tenant + user_tenant_map + subscription rows (committed)
2. Redis: the provisioning job (failed — quota exhausted)

No transaction spans two systems, so step 2's failure left a half-done
signup. The retry then hit the "user already has a tenant" check → 409
forever. This is the classic **dual-write problem**: any "write DB, then
publish to queue/broker" sequence can fail between the two writes.

## 3. The transactional outbox pattern

Solution: make the *intent to enqueue* a row in the SAME database
transaction as the business rows. The `provisioning_jobs` row IS the outbox:

- Signup batch (atomic): tenant rows + outbox row (`status = queued`)
- Best-effort: send the queue job (id = outbox row id)
- Repair: a sweeper re-sends any `queued` outbox row with no matching
  queue job — the lost-send failure mode becomes self-healing

Idempotency makes the repair safe: the queue job's primary key is the outbox
row's UUID, so a duplicate send is a no-op. The queue's `singleton` policy
(one active job per tenantId) is a second, engine-level guard.

## 4. Postgres as a queue: SKIP LOCKED

pg-boss (like Oban/Solid Queue/River) claims jobs with
`SELECT ... FOR UPDATE SKIP LOCKED`: each worker locks the rows it claims;
concurrent workers *skip* locked rows instead of blocking. That single
clause turns a plain table into a safe multi-consumer queue. Throughput
ceiling is thousands of jobs/sec — far beyond a control-plane queue's needs
(one job per signup). Redis-class queues earn their complexity only at
sustained 10K+ jobs/sec or sub-second fan-out.

## 5. Serverless economics: polling defeats scale-to-zero

Neon autosuspends compute after 5 idle minutes and bills per compute-second.
**Any** periodic query resets the idle timer — so a queue polling every
30–60s keeps compute awake 24/7: 0.25 CU × 730 h × $0.106 ≈ **$19.35/mo**,
an entire month's budget for a feature that's idle 99.9% of the time.

The fix is architectural, not parametric: longer polling intervals don't
help (anything ≤5 min still never suspends). Instead:

- **Trigger-driven processing**: drain the queue immediately after each
  enqueue (in-process), so the latency-sensitive path never waits on a poll
- **One consolidated recovery tick** (15 min) doing everything periodic:
  maintenance, outbox repair, stuck-job recovery, drain. Compute is awake
  ~5 of every 15 minutes ≈ $6.5/mo worst case — $0 marginal when real
  traffic keeps the DB awake anyway
- **Disable the engine's own loops** (`supervise: false`, `schedule: false`,
  no `work()` pollers) and re-provide the one thing lost — maintenance —
  via an explicit `maintain()` call inside the tick

## 6. Failure-path design notes

- **Ambiguous reads are not failures.** A null job lookup after a failed
  attempt could be a transient read error — treating it as terminal would
  wrongly mark a recovering tenant failed. Only an explicit terminal state
  counts; ambiguity defers to the sweeper.
- **Success then bookkeeping failure ≠ failure.** If the pipeline succeeds
  but the queue's `complete()` call fails, the tenant is live — entering the
  failure path would re-run the pipeline or mark a live tenant failed.
  Guards: status-conditional updates (`WHERE status != completed`) and a
  success flag separating the two error domains.
- **Client timeouts must exceed honest work.** The web client gave up at
  3 minutes while provisioning legitimately takes ~5 — the backend succeeded
  *after* the user saw "something went wrong." Genuine failures arrive as an
  explicit `failed` status long before any wall-clock timeout; the timeout
  exists only for the pathological hang.
