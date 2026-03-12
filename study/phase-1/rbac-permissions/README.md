# Phase 1 — RBAC & Permissions: DEV-35, DEV-36, DEV-37, DEV-38, DEV-189 Study Topics

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

## 9. NestJS Guard Execution Order and APP_GUARD

**What:** NestJS global guards registered via `APP_GUARD` execute in the order they are registered in the module's `providers` array. This is how you chain authentication → authorization.

**Why it matters:** In a layered security model, `JwtAuthGuard` must populate `request.user` before `PermissionGuard` reads it. If the order is reversed, the permission guard has no user to evaluate. NestJS does not document execution order guarantees explicitly — it follows provider registration order by convention.

**Key concepts:**
```typescript
// auth.module.ts — order matters
@Module({
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },      // runs first
    { provide: APP_GUARD, useClass: PermissionGuard },    // runs second
  ],
})
```

- `APP_GUARD` is a multi-provider token — multiple guards registered under it all run on every request
- Guards return `true` (allow), `false` (deny with 403), or throw an exception
- `Reflector.getAllAndOverride()` checks both handler and class metadata — handler-level overrides class-level
- `useClass` creates a new DI-managed instance; `useExisting` reuses an already-provided instance

**Resources:**
- [NestJS Guards Documentation](https://docs.nestjs.com/guards)
- [NestJS Execution Context](https://docs.nestjs.com/fundamentals/execution-context)

## 10. Discriminated Unions for Authorization Results

**What:** A TypeScript pattern where a union type uses a literal field (the "discriminant") to let the compiler narrow the type in conditionals. Forces exhaustive handling of all cases.

**Why it matters:** Authorization results have different shapes depending on the outcome (denied, owner bypass, scoped grant). Using a flat interface with optional fields (`scopeType?: string`) means downstream code can access `result.scopeType` without checking `result.granted` first — a silent bug. Discriminated unions make this a compile error.

**Key concepts:**
```typescript
// BAD — flat interface with optionals
interface PermissionResult {
  granted: boolean;
  scopeType?: string;    // accessible even when granted=false
  branchIds?: string[];
}

// GOOD — discriminated union
type PermissionResult =
  | { granted: false; isOwnerBypass: false }
  | { granted: true; isOwnerBypass: true }
  | { granted: true; isOwnerBypass: false; scopeType: string; branchIds: string[] };

// TypeScript forces narrowing:
if (result.granted && !result.isOwnerBypass) {
  result.scopeType; // ✅ accessible — compiler knows the shape
}
```

- The discriminant field must be a literal type (`true`, `false`, `"Tenant"`)
- `switch` statements on discriminants get exhaustiveness checking
- Especially valuable in security-critical paths where missing a case = vulnerability

**Resources:**
- [TypeScript Handbook: Discriminated Unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)

## 11. Cross-Tenant IDOR Prevention in Multi-Tenant Systems

**What:** Insecure Direct Object Reference (IDOR) occurs when an attacker manipulates request parameters to access another tenant's data. In multi-tenant systems, this means crossing tenant boundaries.

**Why it matters:** If tenant resolution comes from a request header (e.g. `X-Tenant-ID`) rather than the authenticated JWT, an attacker can authenticate as Tenant A and send requests to Tenant B's database. Even with per-tenant databases, the middleware connecting to the wrong DB makes the query succeed.

**Key concepts:**
- **Defense:** Assert that the JWT's `app_metadata.tenant_id` matches the resolved `TenantContext.tenantId` at every authorization checkpoint
- **Fail-closed:** If there's a mismatch, deny immediately — never log and continue
- **Defense-in-depth layers:**
  1. JWT carries tenant_id (tamper-proof, signed)
  2. Middleware resolves tenant from JWT (not from headers)
  3. Guard asserts JWT tenant == context tenant (redundant but catches bugs)
  4. DB queries include `tenantId` in WHERE clauses (even with per-tenant DBs)
- This is OWASP A01 (Broken Access Control) — the #1 vulnerability category

**Resources:**
- [OWASP: Insecure Direct Object References](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References)
- [OWASP Top 10: A01 Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)

## 12. Module Entitlement vs Permission-Based Access Control

**What:** Two distinct layers of authorization in a SaaS ERP: entitlement (does the tenant's plan include this module?) and permission (does this user have the right role to perform this action?).

**Why it matters:** These solve different business problems. Entitlement is a billing/product concern — it gates which modules a tenant has paid for. Permission is an organizational concern — it controls who within a tenant can do what. Conflating them (e.g., checking plan access inside a permission guard) creates coupling between billing and security logic.

**Key concepts:**
- **Entitlement guard** runs before permission guard — no point checking fine-grained permissions if the tenant doesn't have the module
- Guard execution chain: `JWT Auth → Entitlement → Permission`
- Entitlement is per-tenant (all users in the tenant share the same plan)
- Permission is per-user (different roles within the same tenant)
- "Always-entitled" modules (e.g., settings) bypass the plan check entirely — they're core infrastructure
- The 403 response should distinguish "not in your plan" (`upgradeRequired: true`) from "you don't have permission" — frontend needs to show different CTAs

**Resources:**
- [AWS: Service Control Policies vs IAM Policies](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html)

## 13. Fail-Closed Design in Authorization Guards

**What:** A design principle where any unexpected condition (missing data, parse error, DB failure) results in access denial rather than access grant.

**Why it matters:** Authorization code has an asymmetric risk profile: a false-positive (wrongly granting access) is far worse than a false-negative (wrongly denying access). Fail-closed ensures that bugs, data corruption, and infrastructure failures all push toward the safe side.

**Key concepts:**
```typescript
// Fail-closed examples:
// 1. Malformed plan modules → empty object → no modules enabled
const planModulesSchema = z.record(z.string(), z.boolean()).catch({});

// 2. DB error during entitlement check → catch block → 500 (not 200)
try {
  const result = await checkEntitlement();
} catch (err) {
  if (err instanceof HttpException) throw err;
  throw new InternalServerErrorException(); // deny, don't allow
}

// 3. Missing tenant context → deny immediately
const ctx = getTenantContextOrNull();
if (!ctx) throw new ForbiddenException("Access denied");
```

- Every `return true` in a guard should be a conscious, justified decision
- Every error path should end in a thrown exception (deny)
- Default should be deny — only explicit conditions lead to allow
- Zod's `.catch()` makes fail-closed the default for schema parsing

**Resources:**
- [OWASP: Fail Securely](https://owasp.org/www-community/Fail_securely)

## 14. Subscription Status Enforcement in Multi-Tenant SaaS

**What:** Checking the tenant's subscription lifecycle state (Active, Trial, Expired, Cancelled, PastDue) before granting access to paid features.

**Why it matters:** Without subscription enforcement, an expired tenant can continue using the product indefinitely. The entitlement guard checks which modules the plan includes, but it must also verify the subscription is in a valid state — otherwise a cancelled tenant with a Growth plan still has access to all Growth modules.

**Key concepts:**
- Active states (allow access): `Active`, `Trial`
- Inactive states (deny access): `Expired`, `Cancelled`, `PastDue`
- `PastDue` is a grace period — some SaaS products allow access for N days before hard-blocking
- Subscription status lives in the Central Admin DB (not the tenant DB) — it's a platform concern
- The guard fetches both `plan.modules` and `subscriptionStatus` in the same query to avoid extra DB round-trips

**Resources:**
- [Stripe: Subscription Statuses](https://docs.stripe.com/billing/subscriptions/overview#subscription-statuses)
- [Chargebee: Subscription Lifecycle](https://www.chargebee.com/docs/2.0/subscription-lifecycle.html)

## 15. TOCTOU Race Conditions in CRUD APIs (DEV-189)

**What:** Time-of-check-to-time-of-use (TOCTOU) is a race condition where a check (e.g., "are there 0 assigned users?") and an action (e.g., "delete the role") are not atomic. A concurrent request can change the state between check and action.

**Why it matters:** In the Roles CRUD API, two critical operations are vulnerable: deleting a role (check user count → delete) and revoking the last Owner (check owner count → delete assignment). Without atomicity, concurrent requests can delete a role that still has users, or remove all owners from a tenant.

**Key concepts:**
```typescript
// BAD — two separate DB round-trips, race window between them
const count = await prisma.userRole.count({ where: { roleId } });
if (count > 0) throw new ConflictException();
await prisma.role.delete({ where: { id: roleId } });

// GOOD — atomic transaction, no race window
await prisma.$transaction(async (tx) => {
  const count = await tx.userRole.count({ where: { roleId } });
  if (count > 0) throw new ConflictException();
  await tx.role.delete({ where: { id: roleId } });
});
```

- Prisma's interactive transactions (`$transaction(async (tx) => { ... })`) run inside a single DB transaction
- For the last-owner guard, use `Serializable` isolation to prevent phantom reads
- Defense-in-depth: DB triggers as a final safety net (application transactions can still have bugs)

**Resources:**
- [CWE-367: TOCTOU Race Condition](https://cwe.mitre.org/data/definitions/367.html)
- [Prisma: Interactive Transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions#interactive-transactions)

## 16. Prisma P2002 Unique Constraint Error Handling (DEV-189)

**What:** When a Prisma `create` or `update` violates a unique constraint, it throws `PrismaClientKnownRequestError` with code `P2002`. If uncaught, this surfaces as a raw 500 error to the client.

**Why it matters:** Users expect a clear "already exists" message (409 Conflict), not an opaque server error. Catching P2002 and converting it to a domain-appropriate HTTP exception is a pattern you'll use in every CRUD service.

**Key concepts:**
```typescript
import { Prisma } from "@zerupt/db";

try {
  await prisma.role.create({ data: { tenantId, name } });
} catch (error) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new ConflictException("A role with this name already exists");
  }
  throw error; // re-throw unknown errors
}
```

- `error.meta.target` contains the fields that caused the violation (e.g., `["tenant_id", "name"]`)
- Always re-throw non-P2002 errors — don't silently swallow them
- For `assignRole`, the same pattern catches duplicate user+role assignments

**Resources:**
- [Prisma: Error Reference](https://www.prisma.io/docs/orm/reference/error-reference#p2002)

## 17. Response Mappers vs Type Casting in TypeScript APIs (DEV-189)

**What:** The pattern of converting raw Prisma query results into explicit API response shapes using mapper functions, instead of double-casting (`as unknown as RoleResponse`).

**Why it matters:** `as unknown as T` casts suppress all type safety — if the Prisma schema drifts from the response interface (e.g., a field is renamed), the compiler won't catch it. A mapper function makes the shape transformation explicit and fails at compile time if fields are missing.

**Key concepts:**
```typescript
// BAD — compiler blind to shape mismatches
return role as unknown as RoleResponse;

// GOOD — explicit mapping, compile-time safety
function toRoleResponse(role: Record<string, unknown>): RoleResponse {
  return {
    id: role.id as string,
    name: role.name as string,
    permissions: (role.permissions ?? []).map(toPermissionResponse),
    // ... missing field = compile error
  };
}
```

- Trade-off: more code, but catches bugs at compile time instead of production
- Especially valuable in API boundaries where the internal model and external contract diverge
- The mapper also serves as documentation of the response contract

**Resources:**
- [TypeScript: Type Assertions](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions)
