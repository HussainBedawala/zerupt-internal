# Phase 1 — RBAC & Permissions: DEV-35, DEV-36 Study Topics

## 1. Permission Key Taxonomies (module.entity.action)

**What:** A hierarchical naming convention for authorization keys that encodes the module, entity, and action into a single dot-separated string.

**Why it matters:** A well-designed taxonomy is the foundation of an RBAC system. It determines how granular your access control can be, how maintainable the permission registry stays as the system grows, and whether guards can be written generically or must be hardcoded per endpoint.

**Key concepts:**
- Three-segment format (`inventory.item.create`) balances granularity with readability
- Standardized action vocabulary prevents semantic drift (e.g. `read` vs `view` vs `get`)
- `read` = retrieve a mutable record; `view` = read-only access to sensitive/computed data
- Registry must be frozen at runtime (not just TypeScript `readonly`) to prevent injection
- Keys must be registered — unknown keys rejected at role publish time

**Resources:**
- [NIST RBAC Model (SP 800-207)](https://csrc.nist.gov/publications/detail/sp/800-207/final)
- [Casbin Permission Model](https://casbin.org/docs/how-it-works)

## 2. Segregation of Duties (SoD) in Financial Systems

**What:** A control principle that prevents a single person from both initiating and approving a high-risk action (e.g. creating and approving a journal entry or purchase order).

**Why it matters:** SoD is a core internal control for fraud prevention in any ERP. Without it, a single compromised account can create and approve fraudulent transactions. Auditors (SOX, IFRS) explicitly check for SoD enforcement.

**Key concepts:**
- SoD is modeled as mutually exclusive permission pairs, not as a single "admin" toggle
- The pairs are data (e.g. `SOD_RESTRICTED_PAIRS`), not hardcoded logic — making them auditable
- Enforcement happens at role publish time: a role containing both keys in a restricted pair is rejected
- Explicit SoD exception workflow exists for small teams where one person must hold both (owner approval + audit trail)

**Resources:**
- [ISACA: Segregation of Duties Controls](https://www.isaca.org/resources/isaca-journal/issues/2018/volume-1/segregation-of-duties-in-erp)
- [COSO Internal Control Framework](https://www.coso.org/guidance-on-ic)

## 3. Runtime Immutability vs TypeScript Readonly

**What:** TypeScript's `readonly` and `as const` are compile-time only — they produce no runtime protection. `Object.freeze()` provides actual runtime immutability.

**Why it matters:** In a security-critical registry like permission keys, a `ReadonlySet<T>` can be cast to `Set<T>` and mutated at runtime. Any code that imports the registry could inject arbitrary permission keys, bypassing RBAC. For security-sensitive data structures, runtime freezing is mandatory.

**Key concepts:**
```typescript
// TypeScript-only (no runtime protection)
const keys: ReadonlySet<string> = new Set(["a", "b"]);
(keys as Set<string>).add("evil"); // works at runtime!

// Runtime-frozen (actually immutable)
const keys = Object.freeze(new Set(["a", "b"])) as ReadonlySet<string>;
(keys as Set<string>).add("evil"); // throws TypeError at runtime
```

- `Object.freeze()` is shallow — nested objects need individual freezing
- Frozen objects throw `TypeError` on mutation in strict mode, silently fail in sloppy mode
- Performance impact is negligible for small registries

**Resources:**
- [MDN: Object.freeze()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze)

## 4. Owner Bypass Pattern in Multi-Tenant RBAC

**What:** A sentinel permission key that the authorization engine checks before evaluating any role grants. If the actor is the tenant owner, all permission checks pass without consulting the role graph.

**Why it matters:** The owner bypass prevents lockout scenarios (owner accidentally removes their own permissions) and simplifies the mental model: the owner always has full access. But it must be implemented carefully — the sentinel key must be unassignable via the normal role grant flow.

**Key concepts:**
- Sentinel key (e.g. `settings.owner.read`) exists in the registry for validation but is in `OWNER_ONLY_KEYS` — rejected if included in any role's grant list
- Evaluation order: check owner → aggregate role grants → apply deny constraints → intersect branch scope → apply field mask
- The "last owner" invariant: at least one active user must always be the owner — prevents total lockout

**Resources:**
- [AWS IAM Root User Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-user.html)

## 5. UUIDv7 vs UUIDv4 for Database Primary Keys

**What:** UUIDv7 (RFC 9562) encodes a Unix timestamp in the high bits, producing time-ordered values. UUIDv4 is purely random.

**Why it matters:** B-tree indexes on UUIDv4 PKs fragment over time because new rows insert at random positions. UUIDv7 values are monotonically increasing (like auto-increment) so new rows always append to the end of the index, dramatically reducing page splits and write amplification. For write-heavy tables like `user_roles` and `role_permissions`, this translates to sustained insert throughput.

**Key concepts:**
- UUIDv7 format: `TTTTTTTT-TTTT-7RRR-RRRR-RRRRRRRRRRRR` (T=timestamp, R=random)
- Prisma supports it via `@default(uuid(7))` — generated client-side, not in PostgreSQL
- Trade-off: UUIDv7 leaks creation time (not a concern for internal RBAC tables)
- PostgreSQL 17+ has native `uuidv7()` function; earlier versions need an extension or client-side generation

**Resources:**
- [RFC 9562: UUIDs](https://www.rfc-editor.org/rfc/rfc9562)
- [Brandur: UUIDv7 in Postgres](https://brandur.org/nanoglyphs/026-ids)

## 6. PostgreSQL CHECK Constraints vs Application-Layer Validation

**What:** CHECK constraints are declarative rules enforced by PostgreSQL on every INSERT/UPDATE, regardless of how the data arrives (ORM, raw SQL, migration, seed script).

**Why it matters:** Application-layer validation (Zod, class-validator) only protects one write path. Any out-of-band write (admin script, migration, direct SQL) bypasses it. For security-critical data like RBAC tables, defense-in-depth requires DB-level constraints as the last line of defense.

**Key concepts:**
```sql
-- Format validation
CHECK (permission_key ~ '^[a-z]+\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$')
-- Range validation
CHECK (priority >= 0 AND priority <= 1000)
-- Cross-field validation
CHECK (expires_at IS NULL OR expires_at > assigned_at)
-- Size limits on JSONB
CHECK (constraint_json IS NULL OR octet_length(constraint_json::text) <= 10000)
```

- CHECK constraints are cheap (evaluated per-row, no I/O)
- They cannot reference other tables — use triggers for cross-table invariants
- Prisma doesn't generate them — add manually in migration SQL

**Resources:**
- [PostgreSQL: CHECK Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS)

## 7. PostgreSQL Triggers for Cross-Table Invariants

**What:** `BEFORE INSERT/UPDATE/DELETE` triggers execute PL/pgSQL functions that can query other tables and raise exceptions to abort the operation.

**Why it matters:** Some business rules span multiple tables (e.g., "at least one Owner must exist per tenant" involves both `roles` and `user_roles`). CHECK constraints can't enforce these — triggers are the only DB-level mechanism.

**Key concepts:**
```sql
-- Trigger function
CREATE FUNCTION protect_last_owner() RETURNS TRIGGER AS $$
BEGIN
  -- Query another table to check invariant
  IF (SELECT COUNT(*) FROM user_roles WHERE ...) = 0 THEN
    RAISE EXCEPTION 'cannot remove last owner';
  END IF;
  RETURN OLD; -- allow the DELETE to proceed
END;
$$ LANGUAGE plpgsql;

-- Attach to table
CREATE TRIGGER trg_protect_last_owner
  BEFORE DELETE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION protect_last_owner();
```

- `BEFORE` triggers can abort the operation; `AFTER` triggers cannot
- `RETURN NULL` from a BEFORE trigger silently cancels the row operation
- `RETURN NEW` (INSERT/UPDATE) or `RETURN OLD` (DELETE) allows it to proceed
- Triggers add latency — keep them fast (indexed lookups only)

**Resources:**
- [PostgreSQL: Trigger Functions](https://www.postgresql.org/docs/current/plpgsql-trigger.html)

## 8. Junction Tables vs Array Columns in PostgreSQL

**What:** A design choice for one-to-many or many-to-many relationships: store related IDs in a PostgreSQL array column (`UUID[]`) or in a separate junction table with proper foreign keys.

**Why it matters:** Array columns are tempting for simplicity but prevent foreign key enforcement (orphaned IDs accumulate silently), require GIN indexes for containment queries (`@>`, `ANY()`), and make JOINs awkward. Junction tables enable FK constraints, standard B-tree indexes, and clean relational queries.

**Key concepts:**
```sql
-- Array approach (problematic)
CREATE TABLE role_permissions (
  branch_ids UUID[]  -- no FK possible, GIN index needed
);
SELECT * FROM role_permissions WHERE 'branch-uuid' = ANY(branch_ids);

-- Junction table approach (correct)
CREATE TABLE role_permission_branches (
  role_permission_id UUID REFERENCES role_permissions(id) ON DELETE CASCADE,
  branch_id UUID,  -- FK to branches table when it exists
  UNIQUE(role_permission_id, branch_id)
);
SELECT * FROM role_permission_branches WHERE branch_id = 'branch-uuid';
```

- Use arrays for: small, static, non-relational data (tags, field masks)
- Use junction tables for: IDs referencing other entities, anything needing FK enforcement

**Resources:**
- [PostgreSQL: Array Types](https://www.postgresql.org/docs/current/arrays.html)
- [Use The Index, Luke: Many-to-Many](https://use-the-index-luke.com/sql/join/many-to-many)
