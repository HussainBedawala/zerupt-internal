# Operations Runbook

## Purpose

Provide repeatable procedures for operating user and auth management safely in production.

## Daily Operations

- review failed login and lockout trends
- review pending invites and expirations
- review privileged role changes
- validate audit pipeline health

## Weekly Operations

- dormant account review
- branch-role drift report review
- admin policy changes review and sign-off

## Incident Playbooks

### Account Compromise

1. suspend affected user
2. revoke all active sessions
3. enforce credential reset
4. review recent privileged actions
5. restore with constrained permissions after verification

### Privilege Escalation Suspicion

1. freeze role assignment operations
2. identify all changed bindings in incident window
3. roll back unauthorized grants
4. perform targeted access recertification
5. publish incident summary and preventive controls

### Invite Abuse Event

1. disable invite acceptance endpoint for affected tenant if needed
2. revoke exposed pending invites
3. issue replacement invites with stricter controls
4. confirm no unauthorized activations occurred

## Break-Glass Access

- limited to designated emergency admins
- short-lived and heavily audited
- mandatory incident ticket reference
- post-use review within 24 hours

## Key Rotation and Secret Hygiene

- maintain rotation calendar for auth-related secrets
- validate token verification behavior after rotation
- log rotation events and verification outcomes

## Recovery and Continuity

- documented fallback for provider outage scenarios
- admin communication templates for auth disruption
- periodic recovery drills for session revoke and account restore workflows
