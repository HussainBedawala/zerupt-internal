## 1. Pessimistic Locking with SELECT FOR UPDATE

**What:** A PostgreSQL row-level lock that prevents other transactions from reading or modifying a row until the lock-holding transaction commits or rolls back.

**Why it matters:** Document numbering requires atomic read-increment-return. Without locking, two simultaneous POS transactions could read the same `nextNumber`, both increment to the same value, and issue duplicate document numbers. `SELECT FOR UPDATE` serializes access to the sequence row.

**How it works:**
```sql
BEGIN;
-- Lock the row — other transactions block here until we COMMIT
SELECT * FROM document_sequences WHERE id = $1 FOR UPDATE;
-- Safe to read and increment
UPDATE document_sequences SET next_number = next_number + 1 WHERE id = $1;
-- Create reservation with the number we just consumed
INSERT INTO sequence_reservations (sequence_id, reserved_number, status) VALUES (...);
COMMIT; -- Lock released
```

Key behaviors:
- Lock is scoped to the transaction — auto-released on commit or rollback
- Other transactions trying to lock the same row **block** (they don't fail — they wait)
- Different rows can be locked concurrently (per-branch sequences don't block each other)
- Deadlocks are possible if two transactions lock rows in different orders — PostgreSQL detects and kills one

**Resources:**
- [PostgreSQL Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)
- [Prisma Interactive Transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions#interactive-transactions)

---

## 2. Gap Policies in Document Numbering

**What:** Rules governing whether gaps (missing numbers) in a document sequence are acceptable.

**Why it matters:** Tax authorities in MENA, India, and Southeast Asia require sequential invoice numbering with no gaps. A gap suggests a deleted invoice (potential tax fraud). POS receipts have no such requirement — gaps from voided transactions are normal.

**How it works:**

| Policy | Behavior | Use case |
|--------|----------|----------|
| Strict | Released numbers are reclaimed (nextNumber decremented). Failed reservations retry the same number. | Invoices, journals, payments |
| Tolerant | Gaps are logged in the reservation audit trail but numbers are consumed permanently. | POS receipts, sales orders |

The reserve → commit → release lifecycle enables this:
1. **Reserve** — claim a number atomically
2. **Commit** — link it to a saved document (permanent)
3. **Release** — void the reservation (Strict: reclaim, Tolerant: log and move on)

**Resources:**
- [EU VAT Directive on sequential numbering](https://taxation-customs.ec.europa.eu/vat-invoicing-rules_en)
- [India GST invoice numbering rules (Rule 46)](https://www.cbic.gov.in/resources/htdocs-cbec/gst/cgst-rules-01july2017.pdf)

---

## 3. Partial Unique Indexes in PostgreSQL

**What:** A unique constraint that only applies to rows matching a `WHERE` clause.

**Why it matters:** In document numbering, each tenant can have one tenant-wide sequence (branchId = NULL) per document type, plus multiple branch-specific sequences. PostgreSQL's standard unique index treats NULL as distinct — so `UNIQUE(tenant_id, document_type, branch_id)` allows unlimited NULL branchId rows. A partial unique index solves this:

```sql
CREATE UNIQUE INDEX document_sequences_tenant_type_no_branch
  ON document_sequences (tenant_id, document_type)
  WHERE branch_id IS NULL;
```

This ensures exactly one tenant-wide sequence per document type while allowing multiple branch-specific sequences.

**How it works in Prisma:**
```prisma
@@unique([tenantId, documentType], where: raw("\"branch_id\" IS NULL"))
```

Requires `previewFeatures = ["partialIndexes"]` in the generator config.

**Resources:**
- [PostgreSQL Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
- [Prisma Partial Unique Indexes](https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes#partial-indexes)

---

## 4. TOCTOU (Time-of-Check to Time-of-Use) Races

**What:** A class of concurrency bug where the state checked in one operation changes before a dependent operation executes.

**Why it matters:** In the document numbering module, several operations had TOCTOU risks:
- Checking pending reservation count, then deactivating — a new reservation could arrive between the check and the update
- Reading tenant ownership of a reservation, then updating it — the reservation could be reassigned
- Checking `new Date()` for reset detection, then calling `new Date()` again for formatting — midnight could pass between calls

**How to fix:** Wrap related read-then-write operations in a single database transaction. The key principle: **if you read a value and make a decision based on it, the write that enacts that decision must happen in the same atomic unit.**

```typescript
// BAD: TOCTOU
const count = await prisma.reservation.count({ where: { status: "Reserved" } });
if (count > 0) throw new ConflictException();
await prisma.sequence.update({ data: { isActive: false } }); // race window!

// GOOD: atomic
await prisma.$transaction(async (tx) => {
  const count = await tx.reservation.count({ where: { status: "Reserved" } });
  if (count > 0) throw new ConflictException();
  await tx.sequence.update({ data: { isActive: false } });
});
```

**Resources:**
- [OWASP Race Conditions](https://owasp.org/www-community/vulnerabilities/Race_condition)
- [CWE-367: TOCTOU Race Condition](https://cwe.mitre.org/data/definitions/367.html)
