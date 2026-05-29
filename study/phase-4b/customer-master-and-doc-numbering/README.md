# Customer Master & Document Numbering (DEV-280)

The concepts behind the customer master CRUD API and how customer codes are issued.

## Why a "customer master" is its own thing

In retail ERP, a customer is a **party master** — a long-lived record that every
sales document (invoice, credit note, receipt) points at. It is *not* created per
sale. This separation is what lets you answer "what does Acme owe us?" across
hundreds of documents: the AR balance is an aggregate over the customer's invoices,
not a field you store and mutate on the customer.

Key consequences of treating it as a master:

- **You never delete a customer that has history.** Deleting would orphan invoices
  and break the audit trail. Instead the customer has a lifecycle — `active` →
  `inactive`/`blocked` — and "deletion" is really deactivation. This is why the API
  has no `DELETE`; you `PATCH status`.
- **Outstanding balance is derived, not stored.** It's the sum of the remaining
  `balance` over the customer's *confirmed* invoices. Draft invoices don't count —
  they aren't real liabilities yet. Computing it on read avoids the classic bug
  where a stored running total drifts out of sync with the documents.

## Document numbering: why a central sequence service

Human-facing document numbers (`CUST-0001`, `INV-0001`) have requirements that a
database auto-increment can't satisfy:

- **Per-tenant, gapless, customizable prefix.** Each tenant wants their own series
  starting at 1, and often a custom prefix or padding. A global serial column can't
  do per-tenant resets.
- **No gaps for financial documents.** Tax authorities in MENA/India require invoice
  sequences with no missing numbers. That means the number must be allocated under a
  row lock and, if the document creation fails, the number must be *reclaimed*.

This is why numbers flow through a dedicated `DocNumberingService` with a
**reserve → commit → release** lifecycle:

1. **Reserve** — inside a transaction, `SELECT ... FOR UPDATE` the sequence row,
   read `next_number`, increment it, and write a reservation record. The row lock
   serializes concurrent callers so two requests can't get the same number.
2. **Commit** — after the document row is successfully inserted, mark the
   reservation committed and link it to the new document id.
3. **Release** — if the insert fails, release the reservation. Under a *strict* gap
   policy this also decrements the sequence so the number is reused (gapless);
   under *tolerant*, the gap is allowed.

Customer codes use the **tolerant** policy — a missing customer code is harmless,
unlike a missing invoice number.

## Lazy sequence creation

The `document_type` enum had no customer value, so two things were needed:

1. A migration adding `cus` to the `document_type` Postgres enum
   (`ALTER TYPE ... ADD VALUE`). Enum values can only be *appended*, never removed
   or reordered cheaply — which is why this is a one-line, append-only migration.
2. A way for the `cus` sequence to exist per tenant. Rather than seed it at tenant
   provisioning, the customer service **creates the sequence on first use**: try to
   reserve; if no sequence exists, create a default `CUST-` sequence and retry. Two
   concurrent first-creates race — the loser catches the unique-constraint
   `ConflictException` and simply retries the reserve, which now succeeds. This keeps
   customer creation working out-of-the-box while still letting a tenant later
   customize the prefix through doc-numbering settings.

## Defensive points worth remembering

- **Validate foreign references before doing irreversible work.** `defaultTaxGroupId`
  is checked to belong to the tenant *before* a sequence number is reserved, so a
  bad reference doesn't burn a code.
- **Demote-then-insert for "exactly one primary".** Adding a primary contact/address
  first clears the existing primary inside the same transaction, so you never end up
  with two primaries or a window where there are none.
- **Tenant scoping on every query** is defense-in-depth: even though the API is
  already tenant-scoped by middleware, each query filters by `tenantId` so a bug in
  one layer can't leak another tenant's data.
