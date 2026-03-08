# End-to-End Flows and Control Points

## Flow 1: Tenant Admin Invites Branch User

- **Actor**: tenant admin
- **Preconditions**:
  - actor has `users.invite`
  - target role exists and is assignable by actor
  - branch scope is valid for tenant
- **Events**:
  1. admin submits invite payload (email, role, branch scope, expiry)
  2. system creates invite record and token hash
  3. system dispatches invite email
- **Data writes**:
  - `invites` (new record)
  - `audit_log` (`invite.created`, `invite.sent`)
- **Failure handling**:
  - invalid role scope -> reject with policy error
  - mail failure -> keep invite in issued state and allow safe resend

## Flow 2: User Accepts Invite and Activates Profile

- **Actor**: invited user
- **Preconditions**:
  - token is valid, unexpired, and not revoked
  - email matches invite target
- **Events**:
  1. user opens invite link
  2. token is verified and consumed
  3. user sets credentials/profile and completes first sign-in
  4. user state changes to `active`
- **Data writes**:
  - `users` (new or activated profile)
  - `user_role_bindings`, `user_branch_bindings`
  - `invites` (accepted timestamp)
  - `audit_log` (`invite.accepted`, `user.activated`)
- **Failure handling**:
  - expired token -> reject with resend instructions
  - replay attempt -> reject idempotently and alert audit stream

## Flow 3: Role Change with Immediate Permission Propagation

- **Actor**: tenant admin
- **Preconditions**:
  - actor has `roles.assign`
  - target role is allowed by segregation rules
- **Events**:
  1. admin updates role bindings
  2. backend validates SoD and branch constraints
  3. sessions are refreshed or revoked based on policy
- **Data writes**:
  - `user_role_bindings` (updated)
  - `audit_log` (`role.updated`)
- **Failure handling**:
  - SoD violation -> reject and log denied attempt
  - partial update risk -> transaction rollback

## Flow 4: Password Reset and Account Recovery

- **Actor**: user (self-service) or admin (assisted)
- **Preconditions**:
  - account exists and not fully offboarded
- **Events**:
  1. reset/recovery initiated
  2. one-time reset token issued
  3. user verifies and sets new credential
  4. old sessions invalidated per policy
- **Data writes**:
  - provider reset records
  - `audit_log` (`auth.recovery.started`, `auth.password.reset`)
- **Failure handling**:
  - excessive attempts -> temporary lock and alert
  - suspicious pattern -> force assisted recovery path

## Flow 5: Suspension and Forced Session Revocation

- **Actor**: admin or security operator
- **Preconditions**:
  - actor has `users.suspend`
  - reason code is provided
- **Events**:
  1. account state set to `suspended`
  2. active sessions revoked
  3. downstream privileged queues/tasks reassigned if required
- **Data writes**:
  - `users` state update
  - `audit_log` (`user.suspended`, `session.revoked`)
- **Failure handling**:
  - revoke call partial failure -> retry with backoff and alert high severity

## Flow 6: Offboarding and Access Recertification

- **Actor**: admin + reviewer
- **Preconditions**:
  - user is deactivated or leaving
  - ownership transfer path exists
- **Events**:
  1. deactivate user and revoke sessions
  2. remove role and branch bindings
  3. execute retention/deletion policy by region
  4. include account in recertification report
- **Data writes**:
  - `users` state and metadata updates
  - binding tables cleanup
  - `audit_log` (`user.deactivated`, `user.offboarded`)
- **Failure handling**:
  - ownership transfer missing -> block completion until resolved
  - retention policy conflict -> hold with compliance flag

## Control Point Checklist

- [x] actor and permission checks
- [x] precondition validation
- [x] immutable audit events
- [x] transaction-safe writes for policy-critical changes
- [x] deterministic failure codes and operator guidance
