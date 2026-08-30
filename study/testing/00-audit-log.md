# Audit log — coverage census + a CONFIRMED critical failure

## AUDIT-001 — CRITICAL — Permission-granting mutations are NOT being recorded
**Confirmed by me directly, not inferred.**

Today in this tenant I created, through the real UI:
- 3 roles (Cashier, Accountant, Viewer) — I watched `POST /api/v1/tenant/roles` return **201**
- 3 users (cashier1, accountant1, storekeeper1) — `POST /api/v1/tenant/users/invite` returned **201**
- 3 branch-access grants (visible in `user_branch_access`)

```sql
SELECT entity_type, action, count(*), max(created_at)
FROM audit_log WHERE created_at > '2026-08-26T04:00:00Z' GROUP BY 1,2;
```
Result: **exactly one row** — `AuthSession / logout`. Nothing else. All day.

So creating roles, creating users, and granting branch access — the three most
security-sensitive mutations in the product — left **no audit trail whatsoever**.

Tenant-wide, `Role`, `UserRole`, `UserBranch`, `UserTenantMap` and `UserProfile` have
**ZERO rows for the entire history**, despite all being `@Audited` in source.

### What I ruled OUT (so the investigator does not re-tread)
| Hypothesis | Verdict |
|---|---|
| Controllers not decorated | **RULED OUT.** `roles.controller.ts:63` has `@Audited("Role")`, and `grep -c Audited dist/roles/roles.controller.js` = 5, so it is compiled in. |
| Interceptor not registered | **RULED OUT.** Globally registered at `src/audit/audit.module.ts:27` (`useClass: AuditLogInterceptor`). |
| `login` missing from the enum | **RULED OUT.** `audit_action` = create, update, delete, login, logout, login_failed, access_denied, export. |
| NOT NULL column the writer omits | **UNLIKELY.** Only tenant_id, user_id, user_email, action, source, entity_type, entity_id are NOT NULL; the login writer supplies all of them. |
| Created via a seeding bypass, not HTTP | **RULED OUT — I created them myself through the UI and saw the 201s.** (The census agent hedged on this because it could not know; I can.) |

### The smoking gun
`/tmp/zerupt-logs/api.log` contains, repeatedly, on EVERY login:
```
WARN [SessionLedgerService] Login audit write failed (non-fatal)
```
`src/security-settings/session-ledger.service.ts:208-213` catches the failure and logs a warning
whose error detail is passed as Nest's *context* argument, so **the actual error message is never
printed**. The failure is real, routine, and invisible.

### Leading hypothesis (UNVERIFIED — for the investigator)
The interceptor writes audit **after** the response is sent (fire-and-forget in `tap()`,
`audit-log.interceptor.ts:95-106, 304-347`). If the request-scoped tenant DB connection is
released or the context torn down when the response completes, the deferred write has no usable
connection. That would fail EVERY time for interceptor-driven audits while an explicitly
in-transaction write (like the logout path) still succeeds — which is exactly the pattern
observed: logout writes, everything else does not.

Also plausible and NOT mutually exclusive: this machine has ~700-900 ms RTT to Neon and the log
also shows `Tenant pool ping failed: ping query timeout`, so a post-response write could simply
be timing out here. **If the cause is a timeout, severity drops sharply in production** — so the
investigator MUST distinguish "structurally broken" from "slow dev network", and must NOT assume.

**Status:** ROOT-CAUSED & FIXED. Verified by me in the DB.

### The literal error
`TenantContext not available. This code is running outside a tenant-scoped request.`

### Root cause — H1 (structural), NOT the dev-network timeout
Two bugs of the same family: code reading tenant context from AsyncLocalStorage at a point in the
Nest lifecycle where the ALS store was not yet populated.

**Bug 1 (killed Role/UserRole/UserBranch/UserTenantMap/UserProfile/Item audit):**
`AuditLogInterceptor.intercept()` (`audit-log.interceptor.ts:173`, plus the impersonation
tripwire at :143) called `getTenantContextOrNull()`. Instrumentation proved `hasTenantCtx=false`
on EVERY mutation, unconditionally, so `if (!tenantContext) return next.handle();` fired and
**the audit write was never attempted at all**. That is why the log held no retry warnings and no
failures: nothing was ever tried. `apps/api/CLAUDE.md` documents the order as
"TenantContext (ALS) -> AuditLog", but the actual registration does not guarantee it.

**Bug 2 (the login write):** `SessionLedgerService.enforce()` is called from `SessionPolicyGuard`
— a Guard, and Guards run before every interceptor in Nest, so ALS is never populated there. Its
`auditLog.append(entry)` passed no `exec`, fell back to `getTenantContext().db`, and threw every
time.

**Why it is definitely NOT a network timeout:** deterministic given the code path, independent of
latency. It also explains the clean split we saw: writes INSIDE the mutation (imports, onboarding,
logout via `append(entry, exec)`) always succeeded; every interceptor/guard-driven write always
failed. **This behaves identically in production.**

### Fix
Both interceptor call sites now read `request.tenantContext` (set by `TenantResolverGuard`, which
always runs before any interceptor), with ALS as fallback, so correctness no longer depends on
interceptor registration order. The login path passes the request `db` handle as `exec`, matching
`recordLogout`. A spec that had CODIFIED the bug (asserting `append` was called WITHOUT a db arg)
was corrected.

### My own verification
`SELECT entity_type, action, entity_id FROM audit_log WHERE created_at > '2026-08-26T06:00:00Z'`
-> `Role/create`, `AuthSession/login`, `AuthSession/delete` now present. Previously zero.

### A correction to my earlier write-up
I said the error was "never printed" because it was passed as Nest's context arg. **That was
wrong** — Nest's ConsoleLogger renders object args fine. The real reason nothing appeared was more
damning: the write was never attempted.

### Durable queue
`pgboss.job` in the admin DB had ZERO audit jobs ever, consistent with "never attempted".
No stuck backlog.

---

## AUDIT-007 — HIGH — Audit writes now, but ~88% of CREATE rows cannot say WHAT was created
Visible in the very first row written after the fix:
`entity_type=Role  action=create  entity_id="unknown"`

`extractResponseId()` (`audit-log.interceptor.ts:~403`) reads `responseBody.id` only; it does not
unwrap the `{ data: { id } }` envelope.

**Measured blast radius: 181 of 205 controllers return `{ data: ... }`.**

CREATE has no URL param to fall back on, so `entity_id` degrades to the literal string
`"unknown"`. UPDATE/DELETE are fine (they prefer the id from URL params).

So creations — where an audit trail matters most, because the record did not exist before — are
recorded without identifying the record. For compliance that is close to worthless.

**Status:** FIX DISPATCHED

---

## AUDIT-008 — MEDIUM (structural fragility) — global interceptor ordering
The fix removes the ALS dependency at the site that mattered, but global interceptor execution
order still is not guaranteed to match the documented "TenantContext -> AuditLog" architecture.
Any other ALS-dependent guard/interceptor can hit the same trap silently. Worth an ordering
assertion test, or migrating remaining ALS-dependent code to the `request.tenantContext` pattern.

---

## AUDIT-002 — CRITICAL — `POST /tenant/accounts/bulk` has no audit path at all
`accounts/accounts.controller.ts:167` bulk-creates chart-of-accounts rows. No `@Audited`, and
grepping `accounts.service.ts` for "audit" returns nothing. Creating GL accounts is a ledger
structural change with no record of who did it.

## AUDIT-003 — HIGH — Exporting the item catalogue (with cost) is unauditable BY DESIGN
`items-export.controller.ts` exposes the export as `@Get()`. The interceptor maps only
POST/PUT/PATCH/DELETE to an action (`audit-log.interceptor.ts:160-163`) and a dedicated spec
(`audited-never-on-get.spec.ts`) pins that GET is never audited.

So a user can export **5,000 items including cost data** and leave zero trace. We separately
verified the export correctly strips cost for users lacking `inventory.cost.view` — but for a
user who HAS that permission, the bulk extraction is invisible. That is the data-exfiltration
case.

## AUDIT-004 — HIGH — `audit_log` has no branch or legal-entity columns
Verified against `information_schema.columns`. The columns are: id, tenant_id, user_id,
user_email, action, source, entity_type, entity_id, before, after, ip_address, user_agent,
correlation_id, created_at, reason, impersonated_by_user_id, impersonation_session_id,
idempotency_key.

`branch_id` and `legal_entity_id` are **structurally absent**, not merely null. Branch attribution
of an action can only be reconstructed from the `after` JSONB when the entity happens to carry it.
Against the founder requirement that audit capture the correct branch and legal entity, this is a
gap.

## AUDIT-005 — MEDIUM — VAT201 filings are immutable but invisible in the Activity Log
`vat201.controller.ts:53,84` are unaudited. The filing IS recorded immutably in `vat201_filings`
(DB-trigger enforced), so the fact is not lost, but it never appears in the unified
`/settings/audit` view — contradicting the "one audit system, canonical route" decision.

## AUDIT-006 — MEDIUM — `audit_log` immutability is convention, not enforced
`AuditLogService` exposes no update/delete, but no DB trigger or revoked privilege was found on
`audit_log` itself. By contrast `vat201_filings` IS trigger-protected. For an "immutable audit
log" claim, the DB should enforce it.

---

## Confirmed GOOD
- Coverage is broad: of ~498 mutating endpoints, **421 carry `@Audited`** and ~40 more carry
  `@AdminAudited` for platform-admin routes.
- Most apparent gaps are deliberate and documented in-line: amend/void endpoints route through
  `AmendSagaRunnerService`, which writes audit rows explicitly INSIDE the finalize transaction, so
  a controller decorator would double-write. Several carry explicit "NOT @Audited" comments
  explaining why. That is good engineering discipline.
- **Denied permission attempts ARE audited** via `auth/access-denied-audit.util.ts` wired into
  `permission.guard.ts:67-74` (throttled by design).
- `entity_id` never stores a raw URL (the known trap). Bulk-import rows use a prefixed synthetic
  id, which deviates from the UUID convention but is not the URL bug.
- The durable path is thoughtfully layered: idempotency key -> bounded retry -> pg-boss durable
  queue -> Sentry. The design intent is sound; the observed failure is that it is not producing
  rows here.
