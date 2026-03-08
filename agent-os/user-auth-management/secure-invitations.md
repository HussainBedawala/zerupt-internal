# Secure Invitations

## Objectives

- Enable controlled onboarding without sharing credentials
- Prevent token replay, brute-force acceptance, and stale invites
- Keep invite actions fully auditable

## Invite Token Model

- One-time token per invite
- Token is hashed at rest
- Short expiry window (recommended: 24-72 hours)
- Token bound to tenant and invited email
- Optional IP/device risk checks on acceptance

## Invite States

1. `issued`
2. `delivered`
3. `accepted`
4. `expired`
5. `revoked`

## Admin Controls

- Create invite with predefined role and branch scope
- Resend invite with rate limits
- Revoke invite before acceptance
- Extend expiration only with explicit admin action

## Anti-Abuse Controls

- Acceptance attempts per token are rate limited
- Resend operations are throttled per admin and per invite
- Detect repeated invalid token attempts and alert security logs
- Block role escalation during invite acceptance

## Required Audit Events

- `invite.created`
- `invite.sent`
- `invite.accepted`
- `invite.revoked`
- `invite.expired`

Each event stores actor, tenant, target email, role scope, branch scope, and timestamp.

## Failure Cases

- Expired token: reject and suggest resend path
- Revoked token: reject and route to admin
- Email mismatch: reject and log high-signal alert
- Race condition (double accept): first success wins, later attempts fail idempotently
