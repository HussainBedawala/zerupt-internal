# Settings and Admin Integration

## Placement Rule

User and auth management is delivered inside existing Settings/Admin surfaces, not as a separate sidebar module.

## Settings/Admin Areas

1. **Users**: list, search, status, role assignment, branch assignment
2. **Invitations**: pending invites, resend/revoke, expiration monitoring
3. **Roles and Permissions**: role templates, custom roles, permission matrix
4. **Security Policies**: MFA policy, password policy, lockout policy, session policy
5. **Audit and Access Reviews**: recent admin actions, exportable review reports

## API Ownership Split

- Settings/Admin APIs own identity lifecycle and policy configuration
- Domain APIs consume resolved authorization outcomes
- Domain modules do not mutate auth policy directly

## UX Requirements

- clear status badges for lifecycle states
- safe defaults in all creation flows
- destructive actions require explicit confirmation and rationale
- bilingual labels and validation messages (Arabic/English)

## High-Risk Action Controls

- require step-up auth
- require reason code
- write immutable audit event before and after mutation
- show immediate impact summary (sessions revoked, branches affected, pending tasks reassigned)

## Reporting Hooks

Settings/Admin must expose exportable data for:

- active users by branch and role
- dormant users
- pending and expired invites
- privileged role assignment history
- failed login and lockout trends
