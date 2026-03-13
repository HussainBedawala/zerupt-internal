# Phase 1 — Tenant & User Management: Study Topics

DEV-31: Implement tenant entity + governance (plan, status, feature flags)
DEV-32: Build user lifecycle API (invite → activate → suspend → deactivate)
DEV-33: Create Settings UI shell (layout, navigation, sidebar)
DEV-34: Build User Management UI (list, invite, edit, suspend)
DEV-177: Add PATCH user profile endpoint (fullName, phone, locale, dateFormat, timeFormat, timezone)
DEV-178: Add server-side user search and enhanced list filters
DEV-179: Add role change endpoint (PATCH /tenant/users/:userId/role)
DEV-180: Add user branch assignment endpoint (PUT /tenant/users/:userId/branches)

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

---

## 7. User Lifecycle State Machines vs Tenant State Machines

**What:** User lifecycle and tenant lifecycle use the same FSM pattern but have different state sets, transition rules, and side effects.

**Why it matters:** In Zerupt, tenants have 5 states (PendingProvisioning → Active → Suspended → Archived → ProvisioningFailed) while users within a tenant have 4 states (Invited → Active → Suspended → Deactivated). Conflating them leads to bugs — e.g., a "suspended" tenant means all users lose access, but a "suspended" user only affects that individual.

**How it works:**

```typescript
// User state machine — pure function, no side effects
const USER_TRANSITIONS: Record<UserTenantStatus, readonly UserTenantStatus[]> = {
  Invited:     [Active, Deactivated],
  Active:      [Suspended, Deactivated],
  Suspended:   [Active, Deactivated],
  Deactivated: [],  // terminal — no exits
};
```

Key differences from tenant FSM:
- User `Deactivated` is terminal (tenant `Archived` is also terminal)
- User `Invited → Active` requires external trigger (invite acceptance)
- User `Active ↔ Suspended` is bidirectional (tenant `Active → Suspended` is also bidirectional)
- Side effects differ: suspending a user revokes sessions; suspending a tenant blocks all API access

**Resources:**
- [State Pattern (Refactoring Guru)](https://refactoring.guru/design-patterns/state)
- [Domain-Driven Design — Aggregates and Lifecycle](https://martinfowler.com/bliki/DDD_Aggregate.html)

---

## 8. TOCTOU Race Conditions in Database Operations

**What:** Time-of-Check-to-Time-of-Use (TOCTOU) is a race condition where the state checked in step 1 changes before step 2 acts on it.

**Why it matters:** In `transitionStatus`, the naive flow is: (1) read user status, (2) check if transition is valid, (3) update status. Between steps 1 and 3, another request could change the status, bypassing the validation. Critical example: two concurrent requests to deactivate the last two owners both read "2 owners" and both proceed — leaving zero owners.

**How it works:**

```typescript
// BAD: read and write are separate — race window between them
const user = await prisma.userTenantMap.findUnique({ where: { ... } });
if (user.status !== 'Active') throw new ConflictException();
await prisma.userTenantMap.update({ where: { ... }, data: { status: 'Suspended' } });

// GOOD: wrap in a transaction — atomicity guaranteed
await prisma.$transaction(async (tx) => {
  const user = await tx.userTenantMap.findUnique({ where: { ... } });
  if (user.status !== 'Active') throw new ConflictException();
  // For stronger isolation, use SELECT FOR UPDATE via raw query
  return tx.userTenantMap.update({ where: { ... }, data: { status: 'Suspended' } });
});
```

Prisma's `$transaction` uses PostgreSQL's `SERIALIZABLE` isolation by default, which detects conflicting reads. For maximum safety, use `SELECT FOR UPDATE` via raw SQL within the transaction.

**Resources:**
- [CWE-367: TOCTOU Race Condition](https://cwe.mitre.org/data/definitions/367.html)
- [PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [Prisma Interactive Transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)

---

## 9. Role-Based Access Control (RBAC) Guards in NestJS

**What:** A guard that checks the authenticated user's role before allowing access to an endpoint. Runs after authentication (JWT validation) but before the route handler.

**Why it matters:** Without RBAC, any authenticated tenant member can perform admin actions (invite users, suspend others, deactivate accounts). This is a privilege escalation vulnerability in a multi-tenant ERP.

**How it works:**

```typescript
@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(@Inject('ADMIN_PRISMA') private readonly prisma: PrismaClient) {}

  async canActivate(_context: ExecutionContext): Promise<boolean> {
    const ctx = getTenantContext(); // from AsyncLocalStorage
    const actor = await this.prisma.userTenantMap.findUnique({
      where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    });
    if (!actor || actor.role !== UserTenantRole.Owner || actor.status !== UserTenantStatus.Active) {
      throw new ForbiddenException('Owner access required');
    }
    return true;
  }
}

// Usage
@Post('invite')
@UseGuards(OwnerGuard)
async invite(@Body() body: InviteUserBody) { ... }
```

Key design: the guard reads the actor's own row in `user_tenant_map` and checks both `role` and `status`. Fail-closed: if the row is missing, access is denied.

**Resources:**
- [NestJS Guards](https://docs.nestjs.com/guards)
- [OWASP Access Control Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Access_Control_Cheat_Sheet.html)

---

## 10. Supabase Admin API — User Invitation Flow

**What:** Supabase provides `auth.admin.inviteUserByEmail()` which creates a user record and sends a magic link email. If the user already exists, it returns an error.

**Why it matters:** Zerupt's invite flow must handle both new users (create in Supabase + send email) and existing users (reuse their Supabase ID, just add to tenant). The fallback lookup must be paginated — `listUsers()` defaults to page 1 (max 1000) and silently truncates.

**How it works:**

```typescript
// Step 1: Try to invite
const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);
if (data?.user) return { id: data.user.id };

// Step 2: If user exists, paginate to find them
if (error) {
  for (let page = 1; page <= 10; page++) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    const match = data?.users?.find(u => u.email === email);
    if (match) return { id: match.id };
    if (!data?.users?.length || data.users.length < 1000) break;
  }
}
```

The key gotcha: `listUsers()` without pagination params returns only page 1. At scale (>1000 users across all tenants sharing one Supabase project), the fallback silently fails.

**Resources:**
- [Supabase Admin API — inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail)
- [Supabase Admin API — listUsers](https://supabase.com/docs/reference/javascript/auth-admin-listusers)

---

## 11. CSS Logical Properties for RTL/LTR Support

**What:** CSS logical properties replace physical directions (`left`, `right`, `margin-left`, `padding-right`) with flow-relative equivalents (`start`, `end`, `margin-inline-start`, `padding-inline-end`) that adapt to the document's writing direction.

**Why it matters:** Zerupt supports Arabic (RTL) and English (LTR). With physical properties, every layout detail needs manual mirroring for RTL. Logical properties flip automatically based on the `dir` attribute — one codebase, both directions.

**How it works:**

```css
/* Physical (breaks in RTL) */
.sidebar { border-right: 1px solid; padding-left: 16px; margin-left: auto; }

/* Logical (works in both directions) */
.sidebar { border-inline-end: 1px solid; padding-inline-start: 16px; margin-inline-start: auto; }
```

Tailwind equivalents: `ms-*` (margin-start), `me-*` (margin-end), `ps-*` (padding-start), `pe-*` (padding-end), `start-0` (inset-inline-start), `end-0` (inset-inline-end), `border-s` (border-start), `border-e` (border-end).

**Resources:**
- [MDN — CSS Logical Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values)
- [Tailwind — Logical Properties](https://tailwindcss.com/docs/margin#logical-properties)

---

## 12. Icon Rail Navigation Pattern

**What:** A compact sidebar that shows only icons (64px) by default and expands to show labels (220px) on hover. Combines information density with discoverability.

**Why it matters:** ERP apps have many modules. A full sidebar wastes screen real estate; a hidden hamburger menu buries navigation. The icon rail is a middle ground — always visible, minimal footprint, progressive disclosure on hover.

**How it works:**

```tsx
// CSS variable-driven width for easy theming
const [expanded, setExpanded] = useState(false);

<nav onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)}>
  <div className={expanded ? "w-[220px]" : "w-[64px]"}>
    {items.map(item => (
      <button>
        <Icon />
        {expanded && <span>{label}</span>}
      </button>
    ))}
  </div>
</nav>
```

Key UX decisions:
- **200ms collapse delay** — prevents flickering when cursor briefly leaves the sidebar
- **Tooltips on collapsed icons** — accessibility + discoverability without expansion
- **CSS `transition-all duration-200`** — smooth animation that doesn't feel laggy

**Resources:**
- [Material Design — Navigation Rail](https://m3.material.io/components/navigation-rail/overview)
- [Radix UI Tooltip](https://www.radix-ui.com/primitives/docs/components/tooltip)

---

## 13. Next.js Route Groups for Layout Segmentation

**What:** Route groups (parenthesized folder names like `(app)`) in Next.js App Router let you share layouts between routes without affecting the URL path.

**Why it matters:** In Zerupt, authenticated pages need the app shell (sidebar + nav) while public pages (login, onboarding) don't. Route groups let you wrap `(app)/` routes in the app shell layout without the `(app)` segment appearing in the URL.

**How it works:**

```
app/[locale]/
  (app)/           ← route group (not in URL)
    layout.tsx     ← wraps all authenticated pages with AppShell
    settings/
      layout.tsx   ← settings-specific sidebar layout
      page.tsx     ← redirects to /settings/organisation
      [section]/
        page.tsx   ← dynamic section pages
  (auth)/          ← another group for login/signup
    login/page.tsx
```

URL `/en/settings/organisation` matches `app/[locale]/(app)/settings/[section]/page.tsx`. The `(app)` folder is invisible in the URL but its `layout.tsx` wraps the content.

**Resources:**
- [Next.js Route Groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups)
- [Next.js Layouts and Templates](https://nextjs.org/docs/app/building-your-application/routing/layouts-and-templates)

---

## 14. Radix Primitives and RTL Behavior

**What:** Radix UI primitives (Tooltip, Dialog, DropdownMenu, etc.) read the `dir` attribute from the nearest ancestor and automatically adjust positioning. For example, `side="right"` on a Tooltip flips to the left side in RTL.

**Why it matters:** Custom RTL handling for every popup, tooltip, and dropdown is error-prone. Radix handles it natively — you use semantic positioning (`side="right"`) and it resolves to the physical direction based on `dir`.

**How it works:**

```tsx
// This tooltip appears on the right in LTR, left in RTL
<Tooltip>
  <TooltipTrigger>{icon}</TooltipTrigger>
  <TooltipContent side="right" sideOffset={8}>
    {label}
  </TooltipContent>
</Tooltip>
```

Exception: Radix Tooltip only accepts physical values (`top`, `bottom`, `left`, `right`), not logical (`start`, `end`). But it auto-flips `right` to `left` when `dir="rtl"` is set on `<html>`.

For Sheet/Dialog slide animations, Tailwind CSS doesn't support logical slide directions, so you must add explicit `rtl:` variant overrides.

**Resources:**
- [Radix UI — RTL Support](https://www.radix-ui.com/primitives/docs/overview/accessibility#right-to-left-support)
- [Radix Tooltip API](https://www.radix-ui.com/primitives/docs/components/tooltip)

---

## 15. TanStack Table — Headless Data Tables

**What:** TanStack Table (v8) is a headless table library — it provides the logic (sorting, filtering, pagination, column visibility) but zero UI. You bring your own markup and styling.

**Why it matters:** Zerupt's user management table needs sorting, global search, pagination, and per-row actions. A headless approach means the table logic scales to thousands of rows while the UI matches the design system exactly — no fighting framework CSS.

**How it works:**

```typescript
const table = useReactTable({
  data,
  columns,
  state: { globalFilter, pagination },
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
});

// Render — you own the markup
<tbody>
  {table.getRowModel().rows.map(row => (
    <tr key={row.id}>
      {row.getVisibleCells().map(cell => (
        <td key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  ))}
</tbody>
```

Key concepts: `columnDef` defines how each column renders, `accessorKey` maps to data fields, `cell` render function receives the row context.

**Resources:**
- [TanStack Table v8 Docs](https://tanstack.com/table/latest)
- [TanStack Table Column Defs](https://tanstack.com/table/latest/docs/guide/column-defs)

---

## 16. TanStack Query — Server State Management

**What:** TanStack Query (React Query v5) manages server state separately from client state. It handles caching, background refetching, stale-while-revalidate, and optimistic updates.

**Why it matters:** Without it, every component that needs user data fetches independently, duplicating requests. TanStack Query deduplicates in-flight requests, caches by key, and automatically refetches stale data — critical for an ERP where multiple panels show the same data.

**How it works:**

```typescript
// Query — declarative data fetching
const { data, isLoading, isError } = useQuery({
  queryKey: ["tenant", "users", { status }],
  queryFn: () => fetchUsers({ status }),
});

// Mutation — write operations with cache invalidation
const mutation = useMutation({
  mutationFn: ({ userId, action }) => activateUser(userId),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["tenant", "users"] });
  },
});
```

Key patterns: query keys are hierarchical arrays (invalidating `["tenant", "users"]` clears all user queries regardless of filters). `staleTime` controls how long data is considered fresh.

**Resources:**
- [TanStack Query v5 Overview](https://tanstack.com/query/latest/docs/framework/react/overview)
- [Query Invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)

---

## 17. Feature Folder Architecture in Next.js

**What:** Organizing code by feature/domain (`features/team/`) rather than by type (`components/`, `hooks/`, `utils/`). Each feature folder is self-contained with its own types, API layer, components, and tests.

**Why it matters:** As an ERP grows to 10+ modules, type-based folders become unmanageable — 50 files in `components/` with no cohesion. Feature folders keep related code together, making it easy to reason about, test, and eventually extract into separate packages.

**How it works:**

```
features/team/
  types.ts           # domain types + state machine
  index.ts           # public API barrel export
  api/
    team-api.ts      # raw fetch functions
    team-queries.ts  # TanStack Query hooks
  components/
    team-panel.tsx   # orchestrator
    users-table.tsx  # data table
    invite-user-dialog.tsx
  __tests__/
    types.test.ts
    team-api.test.ts
```

Rules: (1) features never import from other features directly — use shared packages, (2) the barrel `index.ts` controls the public surface, (3) tests live alongside the feature.

**Resources:**
- [Feature-Sliced Design](https://feature-sliced.design/)
- [Bulletproof React — Project Structure](https://github.com/alan2207/bulletproof-react)

---

## 18. API Client Pattern — Centralized Fetch Wrapper

**What:** A thin wrapper around `fetch()` that centralizes base URL, headers, auth token injection, JSON serialization, and error handling for all API calls.

**Why it matters:** Without it, every API call duplicates header setup, error parsing, and auth logic. When Supabase Auth is wired in, you change one file instead of every fetch call. The wrapper also normalizes errors into a typed `ApiError` class.

**How it works:**

```typescript
export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export async function apiClient<T>(path: string, options = {}): Promise<T> {
  const { body, params, ...rest } = options;
  const url = buildUrl(path, params); // base URL + query params
  const response = await fetch(url, {
    ...rest,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(errorBody?.message ?? `${response.status}`, response.status);
  }
  return response.json() as Promise<T>;
}
```

The generic `<T>` return type means consumers get typed responses without casts. Auth header injection is a single line change when ready.

**Resources:**
- [MDN — Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [Kent C. Dodds — Stop using isLoading](https://kentcdodds.com/blog/stop-using-isloading)

---

## 19. E.164 Phone Number Format

**What:** E.164 is the ITU international phone number standard: `+` followed by country code + subscriber number, max 15 digits total. No spaces, dashes, or parentheses.

**Why it matters:** Zerupt targets MENA, India, and SEA — three regions with different dialing conventions. Storing phones in E.164 (`+971501234567`, `+919876543210`) ensures consistent format for SMS notifications, WhatsApp integrations, and cross-border user matching. Freeform strings like `(050) 123-4567` are unparseable at scale.

**How it works:**

```typescript
// Zod validation
const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, "E.164 format required");

// Examples
phoneSchema.parse("+971501234567");  // UAE — passes
phoneSchema.parse("+919876543210");  // India — passes
phoneSchema.parse("050-123-4567");   // fails — no country code
phoneSchema.parse("+0123456");       // fails — starts with 0
```

Key rules: always starts with `+`, first digit after `+` is never `0`, min 8 digits (country code + number), max 15 digits total.

**Resources:**
- [ITU-T E.164 Recommendation](https://www.itu.int/rec/T-REC-E.164)
- [Google libphonenumber](https://github.com/google/libphonenumber)

---

## 20. IANA Timezone Validation with Intl API

**What:** The `Intl.DateTimeFormat` API can validate IANA timezone strings (like `Asia/Dubai`, `America/New_York`) without any external library — if the timezone is invalid, it throws `RangeError`.

**Why it matters:** Users set their preferred timezone for date/time display. Storing arbitrary strings leads to runtime crashes when formatting dates. Validating at input time with the platform's own timezone database ensures only real timezones are accepted.

**How it works:**

```typescript
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// In Zod schema
const timezoneSchema = z.string().refine(isValidTimezone, "Invalid IANA timezone");
```

The `Intl` API uses the ICU timezone database bundled with the runtime (Node.js, browsers). No npm package needed. The database updates with Node.js releases.

**Resources:**
- [MDN — Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
- [IANA Time Zone Database](https://www.iana.org/time-zones)

---

## 21. Prisma exactOptionalPropertyTypes and Nullable Fields

**What:** TypeScript's `exactOptionalPropertyTypes` flag (enabled in strict configs) distinguishes between `undefined` (property absent) and `null` (property explicitly set to null). Prisma's generated types for nullable fields accept `string | null` but NOT `undefined`.

**Why it matters:** When passing a Zod-parsed body directly to Prisma's `update()`, optional fields that weren't provided are `undefined` in the parsed object. With `exactOptionalPropertyTypes`, TypeScript rejects this because `undefined` is not assignable to `string | null`. You must strip undefined keys before passing to Prisma.

**How it works:**

```typescript
// Zod output: { fullName: "John" } — phone, locale etc. are undefined
const body = updateProfileSchema.parse(req.body);

// BAD: Prisma rejects undefined values
await prisma.user.update({ data: body }); // TS error!

// GOOD: Strip undefined keys
const data: Record<string, unknown> = {};
for (const [key, value] of Object.entries(body)) {
  if (value !== undefined) data[key] = value;
}
await prisma.user.update({ data }); // works
```

Alternative: use Prisma's `Prisma.skip` symbol (v5.8+) or `set` wrapper for nullable fields.

**Resources:**
- [TypeScript — exactOptionalPropertyTypes](https://www.typescriptlang.org/tsconfig#exactOptionalPropertyTypes)
- [Prisma — Null and Undefined](https://www.prisma.io/docs/orm/prisma-client/queries/null-and-undefined)

---

## 22. Transaction-Scoped Authorization (Preventing TOCTOU in RBAC)

**What:** When an API endpoint needs to check the actor's role before performing a write, both the role check and the write must happen inside the same database transaction. Otherwise, a concurrent request could change the actor's role between the check and the write.

**Why it matters:** In `PATCH /tenant/users/:userId/profile`, the system checks "is the actor an Owner?" before allowing them to edit another user's profile. If this check happens outside the transaction, a race condition exists: the actor could be demoted to Member between the role check and the profile update.

**How it works:**

```typescript
// BAD: role check outside transaction
const actorRole = await getActorRole(actorId); // separate query
if (actorRole !== 'Owner') throw new ForbiddenException();
await prisma.user.update({ data: profileData }); // race window!

// GOOD: role check inside transaction
await prisma.$transaction(async (tx) => {
  const [actor, target] = await Promise.all([
    tx.userTenantMap.findUnique({ where: { ... } }),
    tx.userTenantMap.findUnique({ where: { ... } }),
  ]);
  if (actor.role !== 'Owner' && actorId !== targetId) {
    throw new ForbiddenException();
  }
  return tx.userTenantMap.update({ data: profileData });
});
```

Bonus: fetching actor and target in `Promise.all` inside the transaction saves a round-trip. For self-edits, only one query is needed.

**Resources:**
- [OWASP — Insecure Direct Object References](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References)
- [PostgreSQL — SERIALIZABLE Isolation](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-SERIALIZABLE)

---

## 23. NestJS EventEmitter2 — Domain Events Pattern

**What:** NestJS's `@nestjs/event-emitter` wraps EventEmitter2, enabling in-process pub/sub with dot-notation namespaced events (e.g., `user.role.changed`). Services emit events; listeners decorated with `@OnEvent()` handle side effects.

**Why it matters:** Role changes trigger side effects (session revocation, audit logging, notifications). Hard-wiring these into the service creates tight coupling. The event pattern decouples the mutation from its consequences — the service says "this happened" and listeners decide what to do.

**How it works:**

```typescript
// Emit in service (after DB write)
this.eventEmitter.emit('user.role.changed', {
  userId, tenantId, previousRole, newRole, downgraded: true,
});

// Listen in separate handler
@OnEvent('user.role.changed')
handleRoleChange(payload: UserRoleChangedEvent) {
  if (payload.downgraded) {
    // revoke sessions, send notification, etc.
  }
}
```

Key gotchas:
- Events are synchronous by default — a throwing listener blocks the emitter
- Events emitted outside a DB transaction create a dual-write risk (DB committed but event handler fails)
- Listeners must be idempotent when possible
- Event subscribers cannot be request-scoped (no access to request context)

**Resources:**
- [NestJS Events Documentation](https://docs.nestjs.com/techniques/events)
- [EventEmitter2 — Namespaced Events](https://github.com/EventEmitter2/EventEmitter2)

---

## 24. Defense in Depth — Guard + Service Authorization

**What:** Defense in depth applies multiple security layers so that a failure in one layer doesn't compromise the system. In NestJS, this means using both a controller guard (outer gate) and a service-level authorization check (inner gate).

**Why it matters:** If authorization only lives in the guard, a misconfigured route or missing decorator exposes the endpoint. If it only lives in the service, unauthorized requests still spin up transactions and make DB reads before being rejected — a DoS surface. Both layers together ensure fail-closed behavior at every level.

**How it works:**

```typescript
// Layer 1: Guard — rejects before any business logic runs
@UseGuards(OwnerGuard)
@Patch(':userId/role')
async changeRole(...) { ... }

// Layer 2: Service — re-checks inside transaction for TOCTOU safety
async changeRole(tenantId, targetId, actorId, newRole) {
  await this.prisma.$transaction(async (tx) => {
    const actor = await tx.userTenantMap.findUnique({ ... });
    if (actor.role !== 'Owner' || actor.status !== 'Active') {
      throw new ForbiddenException();
    }
    // ... proceed with write
  });
}
```

The guard prevents wasted resources. The service-level check prevents TOCTOU races (role could change between guard check and transaction). Together they are comprehensive.

**Resources:**
- [OWASP — Defense in Depth](https://owasp.org/www-community/Defense_in_depth)
- [NestJS Guards](https://docs.nestjs.com/guards)

---

## 25. Last-Owner Protection — Invariant Guards in Multi-Tenant Systems

**What:** An invariant guard is a business rule that must ALWAYS hold true, regardless of the operation. "At least one active Owner must exist in every tenant" is an invariant — every operation that could violate it (deactivation, role demotion, suspension) must check it.

**Why it matters:** If a tenant loses all Owners, no one can invite users, change roles, or manage the tenant. This is an unrecoverable state in a self-service SaaS — the tenant is effectively locked out and requires manual intervention.

**How it works:**

```typescript
// Inside transaction — prevents TOCTOU
if (target.role === UserTenantRole.Owner && newRole !== UserTenantRole.Owner) {
  const ownerCount = await tx.userTenantMap.count({
    where: {
      tenantId,
      role: UserTenantRole.Owner,
      status: { not: UserTenantStatus.Deactivated },
    },
  });
  if (ownerCount <= 1) {
    throw new ConflictException("Cannot demote the last owner");
  }
}
```

The same check appears in `transitionStatus` (deactivation) and `changeRole` (demotion). It counts only non-deactivated owners to avoid counting owners who have already lost access.

**Resources:**
- [Domain-Driven Design — Invariants](https://martinfowler.com/bliki/InvariantChecking.html)
- [PostgreSQL Advisory Locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS) (for stronger guarantees)

---

## 26. Fail-Closed vs Fail-Open Access Models

**What:** A fail-closed system denies access when the access control data is absent or ambiguous. A fail-open system grants access in the same situation.

**Why it matters:** In Zerupt's branch assignment model, the question was: "What happens when a user has no branch assignments?" Fail-open (`[] = all branches`) is dangerous — a forgotten configuration grants maximum access. Fail-closed (`[] = no branches`) means the owner must explicitly grant access, and forgetting to do so results in zero access rather than full access.

**How it works:**

```typescript
// Fail-open (DANGEROUS — original spec)
if (userBranches.length === 0) return true; // all branches

// Fail-closed (SAFE — implemented)
if (user.role === Owner) return true;        // owners exempt
if (userBranches.length === 0) return false;  // no rows = no access
return userBranches.includes(branchId);       // explicit check
```

The fail-closed model pushes configuration burden onto the admin (must assign branches) but prevents silent privilege escalation.

**Resources:**
- [OWASP: Fail Securely](https://owasp.org/www-community/Fail_securely)
- [Principle of Least Privilege (NIST)](https://csrc.nist.gov/glossary/term/least_privilege)

---

## 27. Junction Tables for Cross-Database Relationships

**What:** A junction table (also called a bridge or associative table) maps many-to-many relationships. When the two entities live in different databases, the junction table uses UUIDs as foreign keys without database-level FK constraints on the remote side.

**Why it matters:** Zerupt's users live in the admin DB (Supabase Auth), and branches live in per-tenant DBs. A `UserBranch` junction table in the tenant DB maps `userId` (no FK — external reference) to `branchId` (FK to branches). This is a common pattern in multi-database architectures where referential integrity is split across boundaries.

**How it works:**

```prisma
model UserBranch {
  id         String   @id @default(uuid(7)) @db.Uuid
  tenantId   String   @map("tenant_id") @db.Uuid
  userId     String   @map("user_id") @db.Uuid      // No FK — lives in admin DB
  branchId   String   @map("branch_id") @db.Uuid

  branch Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  @@unique([tenantId, userId, branchId])  // Prevents duplicates
}
```

Key design decisions:
- `onDelete: Restrict` on `branchId` — can't delete a branch while users are assigned
- No FK on `userId` — validated at the application layer against admin DB
- Unique composite index also serves as the lookup index (left-prefix)

**Resources:**
- [Wikipedia — Associative Entity](https://en.wikipedia.org/wiki/Associative_entity)
- [Prisma Relations — Many-to-Many](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/many-to-many-relations)

---

## 28. PUT vs PATCH — HTTP Method Semantics for Resource Replacement

**What:** HTTP PUT replaces the entire resource (or sub-resource) at the target URI. PATCH applies a partial modification. PUT is idempotent (same request always produces the same result); PATCH may not be.

**Why it matters:** The branch assignment endpoint sends `{ branchIds: ["b1", "b2"] }` and replaces ALL branch assignments for the user. This is PUT semantics — the client sends the complete desired state, not a delta. Using PATCH would mislead clients into thinking they can send partial updates (e.g., "add branch b3" without listing existing ones).

**How it works:**

```
PUT  /users/:id/branches  { branchIds: ["b1", "b2"] }  → replaces all
PATCH /users/:id/branches { add: ["b3"] }               → partial update

// PUT is idempotent — calling it twice with the same body produces the same state
// PATCH is not necessarily idempotent — calling "add b3" twice might duplicate
```

Rule of thumb: if the client sends the full desired state → PUT. If the client sends a diff → PATCH.

**Resources:**
- [RFC 9110 — PUT](https://httpwg.org/specs/rfc9110.html#PUT)
- [RFC 5789 — PATCH](https://www.rfc-editor.org/rfc/rfc5789)

---

## 29. Atomic Replace Pattern — Delete + Create in Transaction

**What:** When replacing a set of related records (e.g., all branch assignments for a user), the safest pattern is `deleteMany` + `createMany` inside a transaction, rather than computing a diff (add/remove individual rows).

**Why it matters:** The diff approach (`find existing → compute adds/removes → apply`) has more code, more edge cases, and a wider TOCTOU window. The atomic replace is O(1) logic complexity: delete all, insert all. The transaction guarantees either all changes apply or none do.

**How it works:**

```typescript
await prisma.$transaction(async (tx) => {
  // Step 1: Remove all existing assignments
  await tx.userBranch.deleteMany({
    where: { tenantId, userId },
  });

  // Step 2: Insert the new set
  await tx.userBranch.createMany({
    data: branchIds.map(branchId => ({
      tenantId, userId, branchId, assignedBy: actorId,
    })),
  });
});
```

Trade-off: this generates new UUIDs for every row on every update (no row identity preservation). This is fine for junction tables but would be problematic for tables where row IDs are referenced elsewhere.

**Resources:**
- [Prisma Interactive Transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)
- [PostgreSQL — ACID Properties](https://www.postgresql.org/docs/current/transaction-iso.html)
