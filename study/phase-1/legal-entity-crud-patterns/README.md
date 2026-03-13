## 1. Soft Delete vs Hard Delete — REST Semantics

**What:** The choice between removing a record from the database (hard delete) vs marking it inactive (soft delete), and how that maps to HTTP methods.

**Why it matters:** Zerupt's legal entities cannot be truly deleted — they may have historical financial data referencing them. Using `DELETE` for a soft-deactivate misleads API consumers who expect the resource to be gone (404 on subsequent GET). Using `PATCH { isActive: false }` correctly communicates that the resource still exists but is deactivated.

**Key concepts:**
- `DELETE` should mean the resource is removed — subsequent `GET` returns 404
- Soft-deactivation is a state transition, not a removal — use `PATCH`
- If you need both: `DELETE` for hard delete, `PATCH { isActive: false }` for soft deactivate
- Consider: can the entity be reactivated? If yes, `DELETE` is definitely wrong

**Resources:**
- [REST API Design — When to use DELETE vs PATCH](https://www.rfc-editor.org/rfc/rfc7231#section-4.3.5)
- [Microsoft REST API Guidelines — Soft Delete](https://github.com/microsoft/api-guidelines/blob/vNext/Guidelines.md)

---

## 2. Atomic Default Flag Transfer

**What:** Ensuring exactly one record in a set has a boolean flag (like `isDefault`) set to `true`, using database transactions to prevent race conditions.

**Why it matters:** Legal entities have a "one default per tenant" invariant enforced by a partial unique index. When transferring the default flag, you must atomically unset the old default and set the new one — otherwise concurrent requests could leave zero or two defaults.

**Key concepts:**
```sql
-- Partial unique index: only one true per tenant
CREATE UNIQUE INDEX legal_entities_one_default_per_tenant
  ON legal_entities (tenant_id) WHERE is_default = true;
```

```typescript
// Atomic transfer in a transaction
await prisma.$transaction(async (tx) => {
  await tx.legalEntity.updateMany({
    where: { tenantId, isDefault: true },
    data: { isDefault: false },
  });
  return tx.legalEntity.update({
    where: { id: entityId },
    data: { ...data, isDefault: true },
  });
});
```

- The partial unique index is the safety net — even if the transaction logic has a bug, the DB won't allow two defaults
- `updateMany` + `update` in a transaction is the standard "transfer flag" pattern
- Must also guard against stripping the flag without assigning it elsewhere (leaves zero defaults)

**Resources:**
- [PostgreSQL Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
- [Prisma Transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)

---

## 3. Immutability Guards in CRUD APIs

**What:** Preventing modification of fields that become immutable after a certain business event (e.g., `functionalCurrency` locked after the first journal entry is posted).

**Why it matters:** In financial systems, some fields determine how data is interpreted retroactively. Changing a legal entity's currency after transactions are posted would invalidate all existing journal entries. The guard must be in the service layer, not just the schema.

**Key concepts:**
- **Schema-level:** Don't include immutable fields in the update DTO (e.g., `code` is never in `updateLegalEntitySchema`)
- **Conditional immutability:** Fields that are mutable initially but lock after a business event require a runtime check:
  ```typescript
  if (existing.functionalCurrencyLockedAt && input.functionalCurrency !== undefined) {
    throw new ConflictException("Functional currency is locked");
  }
  ```
- **Who sets the lock?** The consuming module (accounting), not the owning module (settings). Settings only reads the lock field to enforce the guard.
- Use 409 Conflict (not 400 Bad Request) — the request is well-formed but conflicts with the current state

**Resources:**
- [HTTP 409 Conflict](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/409)

---

## 4. Event Payload Design for Domain Events

**What:** Deciding what data to include in domain events emitted by a service, balancing between minimal (just IDs) and rich (full entity state) payloads.

**Why it matters:** Downstream consumers (like the accounting module subscribing to `settings.legal-entity.created`) need enough context to act without fetching the entity again. Too little data forces N+1 queries; too much couples the event schema to the entity schema.

**Key concepts:**
- **Minimal payload:** `{ legalEntityId, tenantId }` — consumers must fetch the entity to get details. Simple but causes extra queries.
- **Rich payload:** Include fields consumers are likely to need: `{ legalEntityId, tenantId, code, countryCode, functionalCurrency, isDefault, isActive }`. Reduces queries but creates coupling.
- **Best practice:** Include the fields that triggered the event and any fields consumers need for routing/filtering. Don't include the full entity — that's what the read API is for.
- **Deactivation events** are especially important — consumers need to know which entity was deactivated to block new transactions.

**Resources:**
- [Domain Events — Martin Fowler](https://martinfowler.com/eaaDev/DomainEvent.html)

---

## 5. Response Date Serialization

**What:** Whether API response timestamps should be `Date` objects (JavaScript-specific) or ISO 8601 strings (universal wire format).

**Why it matters:** `JSON.stringify(new Date())` produces an ISO 8601 string, so the wire format is always a string regardless. But declaring the TypeScript interface as `Date` is misleading — typed API clients will expect a `Date` instance but receive a string. This causes type errors in consumers.

**Key concepts:**
- Always declare response timestamp types as `string` in TypeScript interfaces
- Convert explicitly in the mapper: `createdAt: (entity.createdAt as Date).toISOString()`
- This makes the contract explicit: "this field is an ISO 8601 string"
- Nullable timestamps: `lockedAt ? lockedAt.toISOString() : null`

**Resources:**
- [ISO 8601 Date Format](https://en.wikipedia.org/wiki/ISO_8601)
- [JSON Date Handling Best Practices](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#description)
