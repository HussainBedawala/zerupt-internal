# Supplier Master — Design Concepts (DEV-301)

The supplier master is the AP (accounts-payable) counterpart to the customer
master. It is the party record that purchase orders, goods-received notes, bills,
and supplier payments all hang off of. This note captures the *why* behind the
design, not the code.

## 1. Party master vs. transactional document

A supplier is **master data**: long-lived, low write-rate, referenced by many
transactions. That shapes every decision:

- It is created once and edited rarely, so we optimise for read/lookup, not write
  throughput.
- It must never be hard-deleted while documents reference it — instead it carries a
  **status lifecycle** (`active → inactive → blocked`) so history stays intact.
- Snapshots matter downstream: when a bill is posted, fields like tax number are
  frozen onto the document, so later edits to the supplier never rewrite history.
  (The supplier table itself stays mutable; the *documents* snapshot.)

## 2. Status lifecycle as a soft-delete substitute

Retail ERPs almost never delete a supplier — auditors and tax authorities expect
the trail to survive. The three-state model encodes business intent:

| Status   | New POs | New payments | Existing open docs |
|----------|---------|--------------|--------------------|
| active   | ✅      | ✅           | proceed            |
| inactive | ❌      | ✅           | proceed            |
| blocked  | ❌      | ❌           | frozen             |

`inactive` = "we stopped buying from them but still owe them". `blocked` = "stop
everything" (fraud, dispute, sanctions). Blocking is the one transition that should
require a reason captured in the audit trail.

## 3. Identity: human code vs. surrogate key

Two identifiers, two jobs:

- **`id` (UUID)** — the immutable surrogate key foreign keys point at. Never shown
  to users, never reused.
- **`code` (SUP-0001)** — the *human* identifier printed on documents and typed into
  search. Unique **per tenant**, mutable in theory but treated as stable.

The code is **service-assigned, not user-assigned by default**: omit it on create and
the service allocates the next `SUP-NNNN`. This is the classic trade-off between two
allocation strategies:

- **Max + 1 (chosen here):** `SELECT max(numeric-suffix) + 1`. Simple, no extra
  table, but two concurrent creates can compute the same number. The **unique
  constraint `(tenant_id, code)` is the real source of truth**; on collision we
  retry with a freshly-read max. Good enough for a low-write master with bounded
  contention.
- **Reserved sequence + advisory lock** (used by `doc_sequences` for invoices/POs):
  stronger gap-free guarantees, supports reservations and prefixes, but heavier.
  Overkill for a master that a human creates a few times a day.

The lesson: match the concurrency mechanism to the actual write pattern. A supplier
master does not need the same machinery as a high-volume sales-invoice number.

### Why parameterise the code-matching regex

The "next code" query uses a Postgres `substring(code from '^SUP-([0-9]+)$')` to read
only auto-generated codes (manual codes in other formats are ignored). The pattern
is passed as a **bound parameter**, never string-concatenated into raw SQL. Even
though the prefix is a constant today, raw interpolation is a latent injection vector
the moment a prefix becomes configurable per tenant — so the safe habit is to bind it
from the start.

## 4. Defence in depth: validate at every layer

The same rule is enforced three times on purpose:

1. **DTO (Zod)** — rejects bad input at the API boundary with a clear 400.
2. **DB CHECK constraint** — `payment_term_days` bounded `0..3650` so a raw SQL write,
   a migration, or a future non-Drizzle service can't insert garbage.
3. **Unique constraint** — the authority on code uniqueness, independent of any
   application-level check that might race.

Application validation is for *user experience*; database constraints are for
*truth*. You need both.

## 5. MVP column discipline

The full spec lists default currency, default tax group, a payment-terms master with
early-payment discounts, credit limit, default warehouse, contacts, and addresses.
The MVP table deliberately ships a **subset** — only what the issue needs (phone,
email, tax number, a simple `payment_term_days` integer for "Net N"). Reasons:

- A speculative FK to a `PaymentTerms` master that doesn't exist yet is dead weight
  and a migration you'll have to undo.
- Columns are cheap to add later, expensive to remove once data lands in them.
- This mirrors the precedent set by `sales_customers` (DEV-279): build the spine,
  defer the richness to the issues that actually consume it.

The skill is resisting the urge to model the whole spec on day one.

## 6. Multi-tenant isolation is non-negotiable

Every query filters by `tenant_id` — list, get, update, and the code-allocation max.
The tenant id comes from the request context (resolved from the JWT), never from the
request body. `tenant_id` lives on the table itself (not just inferred from a parent)
as defence-in-depth: a leak in one layer shouldn't expose another tenant's suppliers.

## Related

- `sales_customers` (DEV-279) — the AR-side twin this mirrors.
- `doc_sequences` — the heavier sequence engine for transactional document numbers.
- Spec: `agent-os/product/purchase/01-supplier-model.md`.
