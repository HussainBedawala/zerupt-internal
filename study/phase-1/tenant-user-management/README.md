# Phase 1 — Tenant & User Management: Study Topics

DEV-31: Implement tenant entity + governance (plan, status, feature flags)

---

## 1. Finite State Machines for Status Transitions

**What:** A finite state machine (FSM) defines a fixed set of states and the valid transitions between them, preventing illegal state changes.

**Why it matters:** Tenant lifecycle (Active → Suspended → Archived) must be enforced server-side. Without an FSM, any status can be set to any other, creating inconsistent data (e.g., reactivating an archived tenant whose data has been purged).

**How it works:**

```typescript
const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  Active: ["Suspended", "Archived"],
  Suspended: ["Active", "Archived"],
  Archived: [],           // terminal state — no exits
  PendingProvisioning: [], // system-managed only
};

function canTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
```

The guard runs before the DB write. If the transition is invalid, throw `ConflictException` (409) — not `BadRequest` (400) — because the request is well-formed but conflicts with the current resource state.

**Resources:**
- [State Machines in Domain Modeling (Martin Fowler)](https://martinfowler.com/bliki/FiniteStateMachine.html)
- [XState — JS state machine library](https://xstate.js.org/docs/)

---

## 2. Fail-Closed Entitlement Parsing

**What:** Fail-closed means that when input is malformed or missing, the system defaults to the most restrictive state (deny all) rather than the most permissive (allow all).

**Why it matters:** Module entitlements control which ERP features a tenant can access. If the `modules` JSON column is corrupted or null, a fail-open system would grant access to everything — a critical security hole in a multi-tenant SaaS.

**How it works:**

```typescript
// Zod's .catch() returns the fallback value when parsing fails
const planModulesSchema = z.record(z.string(), z.boolean()).catch({});

// Corrupted input → empty object → no modules enabled
planModulesSchema.parse("not-valid-json"); // → {}
planModulesSchema.parse(null);              // → {}
planModulesSchema.parse({ pos: true });     // → { pos: true }
```

The `catch({})` is the key — it makes the schema total (always succeeds), and the empty object means "no modules enabled" which is the safe default.

**Resources:**
- [Zod .catch() docs](https://zod.dev/?id=catch)
- [OWASP: Fail Securely](https://owasp.org/www-community/Fail_securely)

---

## 3. Prisma P2025 Error Handling Pattern

**What:** Prisma throws `PrismaClientKnownRequestError` with code `P2025` when an `update` or `delete` targets a record that doesn't exist.

**Why it matters:** The naive approach does `findUnique` then `update` — two DB round trips with a TOCTOU race condition (record could be deleted between the two calls). Catching P2025 from `update` directly is both faster and race-free.

**How it works:**

```typescript
try {
  return await prisma.tenantIdentity.update({
    where: { id: tenantId },
    data: updateData,
  });
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    throw new NotFoundException(`Tenant ${tenantId} not found`);
  }
  throw error; // re-throw unexpected errors
}
```

Always re-throw non-P2025 errors. Swallowing unknown errors violates fail-closed principles.

**Resources:**
- [Prisma Error Reference — P2025](https://www.prisma.io/docs/orm/reference/error-reference#p2025)
- [TOCTOU Race Conditions (CWE-367)](https://cwe.mitre.org/data/definitions/367.html)

---

## 4. Connection Pool Management in Multi-Tenant Systems

**What:** Each tenant has its own database. A naive implementation creates a new Prisma client per request, leaking connections. A connection cache with lifecycle management is essential.

**Why it matters:** PostgreSQL has a hard connection limit (typically 100-200). With N tenants and M concurrent requests, unmanaged connections will exhaust the pool, causing 500 errors across all tenants.

**How it works:**

```typescript
@Injectable()
class TenantPrismaService implements OnApplicationShutdown {
  private readonly clients = new Map<string, PrismaClient>();

  getClient(databaseUrl: string): PrismaClient {
    let client = this.clients.get(databaseUrl);
    if (!client) {
      client = new PrismaClient({ datasourceUrl: databaseUrl });
      this.clients.set(databaseUrl, client);
    }
    return client;
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      [...this.clients.values()].map((c) => c.$disconnect()),
    );
  }
}
```

Key points:
- Cache by URL (one client per tenant DB)
- `OnApplicationShutdown` ensures graceful disconnect on SIGTERM
- Future improvement: LRU eviction for large tenant counts, external pooler (PgBouncer)

**Resources:**
- [Prisma Connection Management](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections)
- [NestJS Lifecycle Events](https://docs.nestjs.com/fundamentals/lifecycle-events)

---

## 5. 401 vs 403: Authentication vs Authorization

**What:** HTTP 401 (Unauthorized) means "I don't know who you are." HTTP 403 (Forbidden) means "I know who you are, but you can't do this."

**Why it matters:** Returning 403 for an unauthenticated request leaks information — it confirms the endpoint exists. Returning 401 for an unauthorized request is misleading — the client will retry with credentials that won't help.

**How it works:**

```typescript
// Step 1: Check authentication (is the user identified?)
if (!request.user?.sub) {
  throw new UnauthorizedException("Authentication required"); // 401
}

// Step 2: Check authorization (does the user have permission?)
if (!this.adminUserIds.has(request.user.sub)) {
  throw new ForbiddenException("Access denied"); // 403
}
```

The order matters: always check authentication before authorization.

**Resources:**
- [RFC 9110 — 401 vs 403](https://httpwg.org/specs/rfc9110.html#status.401)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

## 6. Zod Validation Pipes in NestJS

**What:** A NestJS pipe that validates request data against a Zod schema, replacing class-validator decorators with a more type-safe, composable approach.

**Why it matters:** class-validator uses decorators on classes, which are verbose and don't compose well. Zod schemas are plain objects that can be composed, intersected, and transformed — and they infer TypeScript types automatically.

**How it works:**

```typescript
@Injectable()
class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Validation failed",
        errors: result.error.flatten().fieldErrors,
      });
    }
    return result.data; // returns parsed + transformed data
  }
}

// Usage in controller
@Patch("settings")
async update(
  @Body(new ZodValidationPipe(updateSettingsSchema)) body: UpdateSettingsInput,
) { ... }
```

`safeParse` returns `{ success, data, error }` without throwing — you control the error response format.

**Resources:**
- [Zod — TypeScript-first schema validation](https://zod.dev/)
- [NestJS Custom Pipes](https://docs.nestjs.com/pipes#custom-pipes)
