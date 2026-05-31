# Import Orchestration — A Safe, Idempotent State Machine for Data Migration

> Concepts behind DEV-293 (the NestJS orchestration layer over the DEV-342 resolver).
> Why the design is shaped this way, not how the code is written.

The import flow is the **migration wedge**: a real shop moving off Merpec hands us a
messy spreadsheet and expects their products/customers/suppliers to "just appear,"
correctly, without double-imports or half-finished states. That requirement — *correct
under retries, partial failures, and impatient users* — is what shapes every design
decision below.

## 1. Why a persisted state machine, not one big request

Upload → map-columns → validate → apply are not one call; they are four, with a human
reviewing between each. State therefore has to live **outside the request**. The naive
alternative — re-uploading the file at every step — falls apart at scale (re-parsing
megabytes, re-sending over flaky mobile networks) and makes "apply only the rows the
user approved" impossible.

So the file is parsed **once** at upload and its rows are **staged** in a table
(`import_job_rows`), with the job itself (`import_jobs`) carrying a lifecycle status:
`Uploaded → Mapping → Mapped → Validated → Applying → Applied` (plus `Failed`).
Each later stage is then a cheap re-read + annotate, and the status is the gate that
enforces order (you cannot validate before mapping, cannot apply before validating).

**Concept — the staging table is an ETL pattern.** Extract (parse) once, Transform
(validate/fix) in place, Load (apply) in chunks. Decoupling the three stages is what
makes each one independently retryable.

## 2. Idempotency: the same file must apply at most once

Retries are not an edge case — they are the *expected* behavior of a nervous user on a
2G connection who taps "Import" twice. Two layers defend against double-application:

- **Content fingerprint + partial unique index.** A hash of the parsed content keys a
  `UNIQUE … WHERE status = 'Applied'` index. The same file can be re-uploaded and
  re-mapped freely (those rows don't participate in the index), but it can be *Applied*
  only once per tenant+entity. The database, not the application, is the final arbiter.
- **The CHECK constraint is what makes that index trustworthy.** A partial index keyed
  on `status = 'Applied'` silently stops protecting anything if a typo ever writes
  `'applied'`. Constraining `status` to the known set means a bad value fails loudly at
  write time instead of quietly defeating idempotency. *A guarantee that depends on an
  unconstrained string is not a guarantee.*

## 3. The atomic claim: guarding a slow operation from concurrency

Idempotency at the DB layer protects committed data, but the apply itself takes seconds
(chunked inserts). A "read status → if Validated, do the work → mark Applied" sequence
has a race: two concurrent requests both read `Validated` and both run.

The fix is to make the **claim** itself the point of mutual exclusion: a single
conditional `UPDATE … SET status='Applying' WHERE status IN ('Validated','Previewed')`.
Postgres serializes the row write, so exactly one request flips it; the loser sees zero
rows updated and is rejected. **Concept — compare-and-swap on a status column.** The
expensive work only begins *after* you've won an atomic transition, never before.

## 4. Atomic per-chunk, not all-or-nothing

A 50k-row import in one transaction means one bad row at row 49,999 discards everything,
and holds a giant lock the whole time. Instead, rows apply in fixed **chunks**, each in
its own transaction. A failing chunk rolls back *itself* and is recorded; the rest still
land. The trade-off is deliberate: we accept "most rows imported, these chunks failed,
retry them" over "all-or-nothing," because for a migration, partial progress the user
can see and finish beats a total rollback they can't diagnose.

## 5. Master-before-dependent ordering

Products reference categories and suppliers. You cannot insert a product row pointing at
a category that doesn't exist yet. So masters are resolved (and optionally auto-created)
*before* the dependent rows, and the name→id maps built in that pre-step are reused
across all chunks. This is the same dependency ordering a foreign-key graph implies — the
import just has to honor it explicitly because the source spreadsheet doesn't.

A subtle decision: auto-created categories/suppliers are **not** rolled back if every
product chunk later fails. They are valid standalone records, and on a retry the name→id
map simply reuses them. Treating them as garbage to clean up would be wrong — they're
real master data the user asked for.

## 6. Graceful degradation: the AI is never on the critical path

Validation asks the AI service for fix *suggestions*, but if that service is down the
import does not block — it returns no suggestions and proceeds. This mirrors the resolver
principle (the LLM is the last rung, rungs 1–4 work with no AI at all). **Concept — an
assistive dependency must fail open.** Anything that would let a third-party outage block
a paying customer's migration is a design bug, not an availability problem.

## 7. Defensive contract for a non-technical user

Every stage returns explicit, countable outcomes — valid/warning/error rows with
human-readable messages, an "already applied" warning, per-chunk failure detail, an
AI-down flag. Error rows are *skipped*, never silently dropped. The API is built so the
UI (DEV-295) can always show the user exactly what happened and what to do next, which is
the whole point for MENA/SEA retail owners who are not spreadsheet experts.

## Transferable takeaways

- Multi-step user flows with human review between steps need **persisted state**, and the
  status column should be a real gate, not a label.
- Idempotency belongs in the **database** (unique constraint), and the constraint is only
  as trustworthy as the CHECK that bounds the column it keys on.
- For slow mutations, do a **compare-and-swap claim** before the work, not a read-check
  before the work.
- Chunk large writes for **partial progress + bounded locks**; record failures instead of
  discarding everything.
- Assistive/AI dependencies must **fail open** — never let them block the core operation.
