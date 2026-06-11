# Team User Lifecycle

## User Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `email` | string | Unique per tenant |
| `fullName` | string | |
| `phone` | string | |
| `status` | enum | `Invited`, `PendingActivation`, `Active`, `Suspended`, `Deactivated`, `Offboarded` |
| `locale` | string | User's preferred locale (e.g., `ar`, `en`, `hi`). Nullable — inherits `tenant.languageDefault` if unset. See `14-internationalization.md`. |
| `dateFormat` | enum | `DMY`, `MDY`, `YMD`. Nullable — inherits tenant default. |
| `timeFormat` | enum | `12h`, `24h`. Nullable — inherits tenant default. |
| `timezone` | string | IANA timezone. Nullable — inherits tenant default. |
| `lastLoginAt` | datetime | nullable |
| `lastLoginIp` | string | nullable |
| `mustResetPassword` | boolean | |
| `isMfaRequired` | boolean | |
| `allowedBranches` | array(UUID) | Stored in `UserBranch` junction table (tenant DB). Fail-closed: empty = no access for non-owners, owners exempt. See Branch Assignment Rules. |
| `primaryRoleId` | UUID | |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

## Invitation Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `email` | string | |
| `tokenHash` | string | |
| `expiresAt` | datetime | |
| `status` | enum | `Pending`, `Accepted`, `Expired`, `Revoked` |
| `roleId` | UUID | Initial role |
| `branchScope` | array(UUID) | Initial branch assignment |
| `invitedByUserId` | UUID | |

---

## User State Machine

```
Invited -> PendingActivation       (user accepts invite link; one-time secure token)
PendingActivation -> Active        (profile setup + first auth success; default role/branch applied)
Invited -> Deactivated             (admin revokes before acceptance)
Active <-> Suspended               (risk event or admin action / admin restore)
Active -> Deactivated              (planned removal)
Suspended -> Deactivated           (planned removal while suspended)
Deactivated -> Offboarded          (retention policy completes; irreversible identity cleanup)
```

## Lifecycle Rules

| Rule | Detail |
|------|--------|
| Invitation expiry | Default 7 days; configurable max 30 |
| Duplicate invite | Reuses existing pending invite token |
| Activation prerequisites | Accepted invite + password set + required MFA bound |
| PendingActivation | Intermediate state after invite acceptance but before profile setup + first auth. User cannot access tenant resources yet. |
| Suspension effect | Login denied, sessions revoked, scheduled jobs disabled |
| Deactivation effect | Permanent access removal; audit attribution preserved |
| Offboarding | Irreversible identity cleanup after retention policy completes. Revoke all sessions, remove privileged roles, transfer pending approvals/tasks, preserve immutable audit history, apply regional retention/deletion policy. |

## Branch Assignment Rules

| Rule | Detail |
|------|--------|
| Assignment model | `UserBranch` junction table in tenant DB (DEV-180). User-level branch assignments + role permissions. |
| Fail-closed default | Non-owner users with no `UserBranch` rows have **zero branch access** (not all). This prevents accidental privilege escalation when owner forgets to assign branches. |
| Owner exception | Owner always has all branches — enforced by role check in code, not by data. Owners have zero `UserBranch` rows (ignored). |
| Non-owner assignment | Must have at least one explicit branch. Cannot set empty `branchIds` via PATCH endpoint. |
| Cross-branch action | Requires permission + branch in scope |
| Branch deactivation | Users assigned to only that branch become suspended until reassigned (DEV-192) |
| Owner demotion | When owner is demoted to member, must auto-assign all active branches to preserve access (DEV-191) |
| Invite-time assignment | `branchScope` should be mandatory for non-owner invites (DEV-190) |

## Session Security Rules

| Rule | Detail |
|------|--------|
| Concurrent sessions | Configurable per user profile |
| Forced logout | Triggered on role downgrade or critical security change |
| Idle timeout | Tenant policy, min 5m max 8h |
| Password reset | Invalidates all refresh tokens |

## Role Change Rules

| Rule | Detail |
|------|--------|
| Permission key | `settings.users.role.update` |
| Who can change roles | Owner always; Member only if granted `settings.users.role.update` permission (requires RBAC — DEV-36/37) |
| Owner promotion | Only an Owner can promote another user to Owner — permission alone is never sufficient |
| Cannot change own role | Prevents accidental self-demotion |
| Cannot demote last Owner | Same guard as deactivation — at least one active Owner must remain |
| Deactivated users | Role change blocked |
| Side effect: downgrade | Owner→Member triggers forced logout (session revocation) |
| Side effect: event | Emit `user.role.changed` with `{ userId, tenantId, previousRole, newRole }` |
| Audit | All role changes are audited with actor, target, previous role, new role |

## Approval Rules

| Action | Approval |
|--------|----------|
| Deactivate active admin | Manager PIN + reason |
| Promote to privileged role | Manager PIN + reason (deferred to RBAC milestone) |
| Remove last branch access from non-owner | Block operation |
