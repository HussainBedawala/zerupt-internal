# Secure Invitations

> Invite-token security model. Lifecycle states and admin UX live in
> `agent-os/product/settings-admin/02-team-user-lifecycle.md` (Invitation Entity). This file
> covers only the security/anti-abuse contract for the token itself.

## Invite Token Model

- One-time token per invite
- Token is hashed at rest
- Short expiry window (recommended: 24-72 hours)
- Token bound to tenant and invited email
- Optional IP/device risk checks on acceptance

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
