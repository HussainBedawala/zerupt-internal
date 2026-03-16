# Request Lifecycle — How Every API Call Reaches the Right Database

## The Chain

Every authenticated API request passes through this chain before reaching business logic:

```
HTTP Request
  → TenantContextMiddleware (AsyncLocalStorage boundary)
  → JwtAuthGuard (verify Supabase JWT)
  → TenantResolverGuard (resolve tenant DB connection)
  → Controller → Service → prismaClient.xxx.findMany()
```

The business logic never knows which database it's talking to. It just calls `getTenantContext()` and gets a PrismaClient already pointing at the right database.

## Layer 1: TenantContextMiddleware

**File:** `apps/api/src/tenant/tenant-context.middleware.ts`
**Runs on:** ALL routes (including @Public())

Creates a clean AsyncLocalStorage scope for the request. Think of this as a "request-level container" — all code downstream runs inside this scope and can read/write the tenant context.

```typescript
tenantStore.run(undefined, next);
// Everything after this runs inside the ALS scope
```

**Why it runs on all routes:** So `getTenantContextOrNull()` is always safe to call, even on public routes (returns `undefined` instead of throwing).

## Layer 2: JwtAuthGuard

**File:** `apps/api/src/auth/jwt-auth.guard.ts`
**Skips:** Routes decorated with `@Public()`

1. Extracts `Bearer` token from the `Authorization` header
2. Fetches Supabase's public keys from `/.well-known/jwks.json` (cached by the `jose` library)
3. Verifies the JWT:
   - **Signature:** ES256 asymmetric (Supabase signs with private key, we verify with public key — we never need Supabase's secret)
   - **Issuer:** Must match `https://<project>.supabase.co/auth/v1`
   - **Audience:** Must be `authenticated`
   - **Expiry:** Must not be expired
4. Checks that `app_metadata.tenant_id` exists — **fail-closed** (no tenant_id = `401 Unauthorized`)
5. Attaches the decoded payload to `request.user`

```typescript
// JWT payload structure (from Supabase)
{
  sub: "8886fe55-...",           // Supabase user UUID
  email: "ahmed@example.com",
  app_metadata: {
    tenant_id: "1c3bdc3a-...",   // Set by MarkReady step during provisioning
    role_ids: ["role-uuid-1"],   // Optional: for RBAC
    active_branch_id: "br-uuid"  // Optional: for branch scoping
  },
  iat: 1742083200,
  exp: 1742086800,
  iss: "https://xxx.supabase.co/auth/v1",
  aud: "authenticated"
}
```

## Layer 3: TenantResolverGuard

**File:** `apps/api/src/tenant/tenant-resolver.guard.ts`
**Skips:** Routes decorated with `@Public()`

This is the core of the multi-tenancy system. It resolves which database this request should use.

### 3A: Read tenant_id from JWT

```typescript
const tenantId = jwtPayload.app_metadata.tenant_id;
// Validated with Zod schema (must be valid UUID)
```

### 3B: Check Redis cache first

```typescript
const cached = await this.cache.get(tenantId);
// Cache key: "tenant:conn:{tenantId}"
// TTL: 5 minutes (configurable via TENANT_CACHE_TTL_SECONDS)
// HMAC-signed to detect tampering (CACHE_HMAC_SECRET)
```

**Cache hit:** Uses the cached connection details (host, port, dbName, user, encrypted password, tenant status, DB status). Skips the admin DB query.

**Cache miss:** Falls through to the admin DB.

### 3C: Query Central Admin DB

```typescript
const record = await adminPrisma.tenantDatabase.findUnique({
  where: { tenantId },
  include: { tenant: { select: { id: true, status: true } } }
});
```

Then caches the result in Redis (fire-and-forget).

### 3D: Validate statuses

```typescript
// Tenant must be Active
if (tenantStatus !== 'Active') throw ForbiddenException;

// Database must be Ready
if (dbStatus !== 'Ready') throw ForbiddenException;
```

This is how tenant suspension works: set `tenants.status` to `Suspended` in the admin DB, and within 5 minutes (cache TTL), all API requests for that tenant start returning 403.

For immediate suspension: call `cache.invalidate(tenantId)` to clear the Redis cache — next request hits the DB and sees the new status.

### 3E: Decrypt password

```typescript
const password = decryptAes256Gcm(ciphertext, (version) =>
  configService.getOrThrow(`DB_ENCRYPTION_KEY_V${version}`)
);
```

The ciphertext carries its own key version (`enc:v1:...`), so key rotation is transparent: add `DB_ENCRYPTION_KEY_V2`, set `DB_ENCRYPTION_KEY_CURRENT_VERSION=2`, restart. Old ciphertexts still decrypt with v1.

### 3F: Build connection URL

```typescript
const databaseUrl = buildPostgresUrl({
  dbHost: "ep-xyz-pooler.neon.tech",
  dbPort: 5432,
  dbName: "zerupt_tenant_ahmed_electronics",
  dbUser: "zerupt_tenant_ahmed_electronics_app",
  password: "decrypted-password",
  sslMode: "require"
});
// → postgresql://user:pass@host:5432/dbname?sslmode=require
```

### 3G: Get or create PrismaClient from connection pool

```typescript
const prismaClient = await connectionService.getOrCreate(databaseUrl);
```

The `TenantConnectionService` is an LRU cache of PrismaClient instances:
- **Max pool size:** 50 clients (configurable)
- **Stale detection:** Health check (`SELECT 1`) after 60 seconds of inactivity
- **Concurrent dedup:** If two requests for the same tenant arrive simultaneously, only one PrismaClient is created
- **LRU eviction:** When pool is full, the least-recently-used client is disconnected and removed
- **Graceful shutdown:** `disposeAll()` disconnects every cached client on app teardown

### 3H: Store in AsyncLocalStorage

```typescript
tenantStore.enterWith({
  tenantId,
  userId: jwtPayload.sub,
  email: jwtPayload.email,
  databaseUrl,
  prismaClient
});
```

Now every service in this request can call:

```typescript
const { prismaClient, tenantId, userId } = getTenantContext();
// prismaClient is already pointing at the correct tenant database
```

## The Business Logic Layer

A developer writing a new feature never thinks about databases:

```typescript
@Injectable()
export class ProductService {
  async listProducts() {
    const { prismaClient } = getTenantContext();
    return prismaClient.product.findMany({ where: { isActive: true } });
  }
}
```

This query runs against `zerupt_tenant_ahmed_electronics` for Ahmed, and against `zerupt_tenant_fatima_fashion` for Fatima. Same code, different databases, automatic isolation.

## Code Location

```
packages/tenant-context/src/
├── tenant-store.ts              # AsyncLocalStorage singleton + getTenantContext()
├── tenant-cache.ts              # Redis cache with HMAC integrity
├── tenant-connection.service.ts # LRU connection pool
├── types.ts                     # JwtPayload, TenantContext, CachedTenantConnection
└── index.ts                     # Public exports

apps/api/src/tenant/
├── tenant-context.middleware.ts  # ALS boundary per request
├── tenant-resolver.guard.ts     # Resolve tenant DB connection
├── tenant.module.ts             # Module wiring
└── tenant.constants.ts          # DI tokens

apps/api/src/auth/
├── jwt-auth.guard.ts            # Supabase JWT verification (ES256/JWKS)
├── permission.guard.ts          # RBAC permission checks
├── permission.service.ts        # Permission resolution logic
├── public.decorator.ts          # @Public() decorator
└── auth.module.ts               # Module wiring

apps/api/src/common/
└── tenant-prisma.module.ts      # TenantPrismaService (connection cache)
```
