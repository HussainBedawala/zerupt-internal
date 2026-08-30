# Phase A — SERVER-SIDE permission & branch enforcement (API-level)

Method: authenticated directly against Supabase and called the API with a real Bearer token per
user. This tests the BACKEND, not the UI. A hidden button over an open endpoint would be caught
here; nothing was hidden from these calls.

Auth mechanism: the username route maps to a deterministic synthetic email
`{username}@{tenant.code}.zerupt.local` (`packages/shared/src/synthetic-email.ts`), then a normal
Supabase password grant. API calls carry `Authorization: Bearer <token>` + `x-tenant-slug`,
with `x-branch-id` as the branch scope header (`apps/api/src/tenant/tenant.constants.ts`).

## HEADLINE: no CRITICAL, no HIGH. No write leak. No cross-branch leak.

### Writes
**Every write that should have been denied returned 403.** `storekeeper1` (read-only Viewer)
was refused on EVERY write attempted: items create/update, stock adjustments, sales invoices,
purchase orders, journal entries, roles create, settings update.

400-vs-403 was tracked separately and the 400 bodies were inspected to confirm they were genuine
Zod validation errors, i.e. the request passed the permission gate. That distinction was not
collapsed, which is what makes this result trustworthy.

### Branch enforcement — the attack was actually attempted and refused
This is the part that matters most, and it holds:

| Attack | Result |
|---|---|
| `storekeeper1` (Al Rai only) sends `x-branch-id: <Fahaheel>` | **403 "You do not have access to this branch."** |
| `cashier1` (Fahaheel only) sends `x-branch-id: <Al Rai>` | **403**, same refusal |
| `cashier1` passes `?branchId=<Al Rai>` as a query param | returns `{"data":[],"total":0}` — the param INTERSECTS with server-side scope, never overrides it |
| `accountant1` (all branches) sends `x-branch-id: <Jahra>` | 200 — proving the check is permission-driven, not a blanket header rejection |

Data checks: `storekeeper1` saw exactly the 316 Al Rai invoices and no other branch;
`cashier1`'s POS registers were exactly the 2 Fahaheel ones. Enforcement is centralised in
`TenantResolverGuard.resolveCurrentBranchId` (validates the header against the caller's
allowed branches before any query runs) plus `branchScopeCondition` in
`apps/api/src/tenant/branch-scope.ts`.

## RESOLVED — the one SUSPECTED item was a false alarm
The API agent flagged that `cashier1` passed the gate for `POST /tenant/sales/customers`
(400 not 403) and could not confirm whether that was intended, because it could not reach the
tenant DB to enumerate the role's slugs.

**I checked directly. It is INTENTIONAL, not a bug.** The Cashier role's 19 materialised
permissions include `sales.customer.create` (alongside `sales.customer.list` / `.read`),
deliberately granted so a cashier can quick-create a walk-in customer at the counter. Closed.

## Open product questions (not defects)
1. **"Viewer" is a very broad read role** (72 permissions) spanning POS, sales, purchase,
   accounting and the settings user/role lists. All writes are correctly refused and data is
   correctly branch-scoped, so this is not a security defect. But confirm the persona is meant
   to see supplier lists, journal entries and the user list.
2. `cashier1` is denied `GET /tenant/pos/transactions` (403) while being allowed to CREATE POS
   transactions. Worth checking a cashier does not need to list their own transactions
   (e.g. to reprint a receipt). They do hold `pos.transaction.reprint`, so this pairing may be
   inconsistent in practice. Flagged for the POS phase.

## Coverage gaps (stated honestly)
- Not every controller was exercised (quotations, GRNs, landed costs, ZATCA, cheques untested).
- Writes were sent with minimal/empty bodies, enough to separate 400 from 403 but not to confirm
  a permitted write completes end to end. Those get covered in the module phases.
