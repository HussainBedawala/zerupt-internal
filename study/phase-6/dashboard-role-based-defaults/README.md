# Dashboard Role-Based Layout Defaults (DEV-348)

How a multi-tenant ERP decides *what a user sees on their dashboard before they
have configured anything* — and why that decision is permission-driven, not
role-name-driven.

## The problem

A fresh tenant finishes onboarding. Five different employees log in for the
first time — an owner, an accountant, a cashier, a buyer, a stock clerk. Each
should land on a dashboard that is immediately useful to *their* job, with zero
setup. But the system can't hardcode "if role == Cashier" because **roles are
defined by each customer during onboarding** — there is no fixed set of role
names to switch on.

## The core idea: match on permissions, not role names

The seeded defaults are organized into **layout profiles** (`executive`,
`operations`, `finance`, `procurement`, `warehouse`). Each profile carries a set
of `matchPermissions` — the permission keys a user must hold for that profile to
be a candidate. At first login the system intersects the user's *granted*
permissions with each profile's required set and applies the best match.

This indirection is the whole trick: a customer can name their roles anything
("Shop Manager", "Head Cashier"), and the dashboard still resolves correctly,
because the match is against the *capabilities* those roles grant, not their
labels. Permissions are the stable contract; role names are tenant vocabulary.

## Why a separate "defaults" table instead of per-user widgets

There are two distinct concepts that are easy to conflate:

1. **Default layouts** — tenant-scoped, one row per profile, seeded once. This
   is the *template*.
2. **Per-user layouts** — what an individual user has dragged, resized, pinned.
   This is *personalization*, created lazily when a user first applies (or edits)
   a profile.

DEV-348 builds only (1). Keeping the template in its own table means
personalization can be layered on later without migrating seed data, and a
"reset to role default" feature has a clean source to copy from. Seeding the
template is a configuration concern (onboarding); instantiating per-user layouts
is a runtime concern (first login). Different lifecycles → different tables.

## Idempotent seeding: insert-only, never overwrite

The seeder runs inside the onboarding pipeline, which can be **re-run**
(reconfigure). The safe primitive is a unique constraint on
`(tenant_id, profile_key)` plus `INSERT ... ON CONFLICT DO NOTHING`. Properties
this buys:

- Re-running the pipeline is a no-op for already-seeded profiles — no
  duplicates, no churn.
- If an admin later edits a profile's default widget set, a reconfigure will
  **not** clobber their edits (the conflict is skipped, not overwritten).

The trade-off: a genuinely corrected *system* default can't be force-pushed to
existing tenants by re-seeding — that would need a deliberate, separate
migration. We chose data-safety over auto-correction, because silently
overwriting a customer's dashboard is the worse failure.

A subtle UX detail falls out of this: on a re-run that inserts nothing, the
pipeline step reports `count: 0`. Reported naively, an operator reading the
pipeline view can't tell "already configured" from "failed to configure
anything". The fix is to make the *message* carry the meaning ("all defaults
already present — skipped") rather than letting a bare zero stand in for two
very different states.

## Schema shape: jsonb for a bounded, whole-read document

Each profile stores its widget set as a `jsonb` array (widget type, source,
12-column grid placement, optional config). Normalizing widgets into their own
table would add a join for no benefit: the set is small (≤ ~8 widgets per
profile), always read as a unit, and always written as a unit. `jsonb` is the
right call when the data is a bounded document with no independent query needs.

Two guard rails make the seed data trustworthy at the database level:

- A **CHECK** that the widget array is non-empty (`jsonb_array_length > 0`) — a
  profile with zero widgets would silently render a blank dashboard, so the
  invariant is enforced where it can't be bypassed.
- The composite unique index `(tenant_id, profile_key)` doubles as the
  tenant-scoped lookup index, since its leading column is `tenant_id` — a
  separate single-column index would be dead weight that only slows writes.

## Forward-compatibility seam

Widgets reference their data by `sourceType` + `sourceId` (e.g. a `KPIRegistry`
entry `sales.net.today`, or a `SystemFeed` `alerts.riskQueue`). Keeping a single
naming convention across both namespaces matters because once tenant rows are
seeded, renaming a `sourceId` requires a data migration. Chart widgets that
point at a scalar KPI carry the convention that the renderer expands them into a
time series via `configJson.window` — the seam is documented now so a future
GET-layout endpoint and frontend renderer agree on the contract before either is
built.

## Takeaways

- **Indirect on capabilities, not labels**, when the labels are user-defined.
- **Separate the template from the instance** when they have different
  lifecycles — it keeps both migrations and features clean.
- **Idempotency is a data-safety choice**: insert-only protects customer edits;
  the cost is that corrections need an explicit path, which is the right
  default for anything a user can see.
- **Make the message carry the meaning** — a zero count is ambiguous; the
  detail string is where "skipped because already done" lives.
