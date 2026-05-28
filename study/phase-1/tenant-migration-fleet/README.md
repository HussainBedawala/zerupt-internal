# Migrating a fleet of per-tenant databases

How do you keep schema in sync when every customer has their own database? This
is the core operational tax of the database-per-tenant model, and DEV-334 is the
tool that pays it.

## The drift problem

Zerupt is database-per-tenant: one Postgres DB per customer. A deploy ships a
single codebase, but there are N databases behind it. CI/CD git integrations
(Vercel, Railway) redeploy the **code** on every push to `main` — but code is
stateless. Databases are not. Pushing a migration file to the repo changes
*nothing* in any customer's database; it just makes the application *expect* a
schema that may not be there yet.

New tenants are fine: they run all migrations at provisioning time, so they're
born current. The danger is **existing** tenants. They were provisioned against
an older schema and stay frozen there until something explicitly migrates them.
The longer this goes unmanaged, the wider the drift — and the gap is silent,
because nothing errors until the new code hits a column that doesn't exist.

The concrete instance: after a migration `0010` shipped, the dev tenant was
current but a real production tenant was still at `0004` — six migrations behind,
invisibly.

## Why not just auto-migrate on deploy?

A monolith with one DB usually runs migrations as a release step. With many DBs
that's tempting to automate, but it's risky:

- **Blast radius.** A bad migration auto-applied to every customer at once is a
  fleet-wide outage. A manual, observable step lets you migrate, watch, and stop.
- **Timing.** Some migrations lock tables. You want to choose *when* each tenant
  takes that hit (low-traffic window), not have a git push decide for you.
- **Partial failure.** If tenant 7 of 50 fails, you need the other 49 to still
  succeed and a clear report of who's broken — not an aborted batch.

So the right shape is a **deliberate operator tool**, not a deploy hook:
safe-by-default (dry-run unless you opt into `--apply`), isolated per tenant, and
idempotent so re-running after a fix is harmless.

## Detecting "how far behind is this tenant?"

The interesting sub-problem: given a tenant DB, which migrations does it still
need? You can't trust an external bookkeeping field — that field drifting out of
sync with reality is the *whole bug*. The source of truth has to be the database
itself.

Drizzle (like most migration tools) records applied migrations in a journal table
inside each database (`drizzle.__drizzle_migrations`). Each row stores the
migration's `created_at`, which is exactly the `when` timestamp from the local
`_journal.json` manifest committed to the repo. So:

> pending = local journal entries whose `when` is greater than the newest
> `created_at` already recorded in the tenant's journal table.

That's the same comparison the migrator itself uses internally to decide what to
skip, which is why running the migrator is idempotent: if nothing is pending, it
does nothing. A tenant that has never been migrated has no journal table at all
(Postgres error `42P01`, undefined_table) — that's treated as "everything is
pending" rather than a failure.

This is worth internalizing: **the migration journal is the version number.** A
separate "migrationVersion" column is at best a convenience cache and at worst a
lie; always reconcile against the journal when correctness matters.

## Per-tenant isolation as a design principle

When one operation fans out across many independent systems, a single failure
must not poison the others. The pattern: wrap each unit (tenant) in its own
try/catch, collect a structured result per unit, and never let one throw escape
the loop. The output is a pass/fail map, not a single boolean. The operator sees
"48 ok, 1 failed, 1 up-to-date" and can act on the one. Combined with
idempotency, recovery is trivial: fix the broken tenant, re-run the whole thing,
the 48 that succeeded are no-ops.

## Connection targeting and its quiet danger

The runner connects to each tenant DB by taking a superuser connection string and
swapping the database name into the URL path. That string-building step is a
trapdoor: a database name containing `?` or `#` would be parsed as a query string
or fragment, silently truncating the path and connecting to the *wrong* database —
potentially running migrations somewhere unintended. The lesson generalizes:
**any time an identifier from storage is interpolated into a URL or connection
target, validate it against a strict grammar first.** Postgres identifiers are
`[a-zA-Z_][a-zA-Z0-9_]{0,62}`; anything else should fail fast, before a socket
opens.

## What this deliberately does NOT solve

- **Customer-facing communication.** Lock-heavy migrations (e.g. validating a new
  foreign key on a populated, high-write table) can briefly block writes — visible
  to a shop transacting in real time. Deciding *when* and *whether to warn the
  customer* is a separate concern from the mechanics of applying migrations, and
  mixing them would couple a schema tool to a notification system. It stays a
  manual operator judgment for now.
- **Concurrency.** Two simultaneous apply-runs against the same fleet aren't
  coordinated. Each migration is individually transactional and idempotent, so
  double-application is safe-ish, but there's no distributed lock — so the rule is
  simply "run it from one place at a time" until a fleet large enough to need
  parallelism justifies the locking machinery.

## See also

- [[drizzle-orm-migration]] — the migrator internals and the neon-serverless vs
  neon-http transactionality decision (why a failed migration must roll back
  cleanly so a retry re-applies it).
