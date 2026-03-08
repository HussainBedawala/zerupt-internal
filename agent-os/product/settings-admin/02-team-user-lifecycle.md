# Team User Lifecycle

## User Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `email` | string | Unique per tenant |
| `fullName` | string | |
| `phone` | string | |
| `status` | enum | `Invited`, `Active`, `Suspended`, `Deactivated` |
| `locale` | string | User's preferred locale (e.g., `ar`, `en`, `hi`). Nullable — inherits `tenant.languageDefault` if unset. See `14-internationalization.md`. |
| `dateFormat` | enum | `DMY`, `MDY`, `YMD`. Nullable — inherits tenant default. |
| `timeFormat` | enum | `12h`, `24h`. Nullable — inherits tenant default. |
| `timezone` | string | IANA timezone. Nullable — inherits tenant default. |
| `lastLoginAt` | datetime | nullable |
| `lastLoginIp` | string | nullable |
| `mustResetPassword` | boolean | |
| `isMfaRequired` | boolean | |
| `allowedBranches` | array(UUID) | Empty = all branches |
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
Invited -> Active
Invited -> Deactivated
Active <-> Suspended
Active -> Deactivated
Suspended -> Deactivated
```

## Lifecycle Rules

| Rule | Detail |
|------|--------|
| Invitation expiry | Default 7 days; configurable max 30 |
| Duplicate invite | Reuses existing pending invite token |
| Activation prerequisites | Accepted invite + password set + required MFA bound |
| Suspension effect | Login denied, sessions revoked, scheduled jobs disabled |
| Deactivation effect | Permanent access removal; audit attribution preserved |

## Branch Assignment Rules

| Rule | Detail |
|------|--------|
| Assignment model | User-level `allowedBranches` + role permissions |
| Empty branch scope | Means all tenant branches |
| Owner exception | Owner always all branches |
| Cross-branch action | Requires permission + branch in scope |
| Branch deactivation | Users assigned to only that branch become suspended until reassigned |

## Session Security Rules

| Rule | Detail |
|------|--------|
| Concurrent sessions | Configurable per user profile |
| Forced logout | Triggered on role downgrade or critical security change |
| Idle timeout | Tenant policy, min 5m max 8h |
| Password reset | Invalidates all refresh tokens |

## Approval Rules

| Action | Approval |
|--------|----------|
| Deactivate active admin | Manager PIN + reason |
| Promote to privileged role | Manager PIN + reason |
| Remove last branch access from non-owner | Block operation |
