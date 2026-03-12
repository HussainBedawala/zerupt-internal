# Phase 1 — RBAC & Permissions: DEV-35 Study Topics

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
