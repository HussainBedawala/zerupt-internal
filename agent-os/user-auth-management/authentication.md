# Authentication

## Supported Authentication Methods

- Email and password (baseline)
- Magic link or OTP (controlled rollout)
- Social login providers (Google first, others by market)
- Enterprise SSO/SAML (phase-based rollout for larger tenants)

## Session Model

- Short-lived access tokens
- Refresh tokens managed by provider with rotation
- Session revocation support for suspend/offboard/security events
- Device/session inventory visible to admins for sensitive tenants

## MFA and Step-Up

MFA policy levels:

1. optional (small tenants)
2. required for admins
3. required for all users in regulated tenants

Step-up authentication is required for:

- role elevation
- branch-wide policy changes
- break-glass or emergency actions
- credential and recovery-factor changes

## Password and Recovery Policy

- minimum complexity and blocked-password lists
- password reset with one-time, time-limited links
- recovery attempts rate-limited and auditable
- forced reset on suspicious account activity

## Lockout and Abuse Defense

- progressive lockouts on repeated failed attempts
- tenant-aware brute-force detection
- IP and device anomaly indicators for risk scoring
- secure fallback path for legitimate users via admin-verifiable recovery

## ERP-Grade Requirements Checklist

- [x] cross-platform session handling (web, API, future mobile)
- [x] immediate revoke capability for compromised users
- [x] MFA readiness for admin and regulated flows
- [x] social and enterprise login expansion path
- [x] complete auditability for auth events
