# User Lifecycle

## Lifecycle States

1. `invited`
2. `pending_activation`
3. `active`
4. `suspended`
5. `deactivated`
6. `offboarded`

## Transition Rules

| From | To | Trigger | Required Permission | Notes |
|---|---|---|---|---|
| invited | pending_activation | user accepts invite link | none (token-based) | one-time secure token |
| pending_activation | active | profile setup + first auth success | none | default role/branch policy applied |
| active | suspended | risk event or admin action | `users.suspend` | immediate session revocation |
| suspended | active | admin restore | `users.restore` | optional forced password reset |
| active | deactivated | planned removal | `users.deactivate` | keep history and audit trail |
| deactivated | offboarded | retention policy completes | `users.offboard` | irreversible identity cleanup steps |

## Creation Paths

- **Invite-first (default)**: tenant admin invites user with role and branch scope
- **Direct-create (restricted)**: controlled internal path for support/migration needs

## Offboarding Requirements

- Revoke all active sessions
- Remove privileged role assignments
- Transfer ownership of pending approvals/tasks
- Preserve immutable audit history
- Apply retention and deletion policy by region

## Access Recertification

Quarterly recertification controls:

- list all active users by role and branch
- identify dormant or over-privileged users
- require explicit admin confirmation per role bundle
- auto-suspend unresolved exceptions after policy window

## Failure Handling

- Invalid transitions fail with deterministic error codes
- Partial failures roll back role/branch updates transactionally
- Emergency suspend is always available, even during partial outage modes
