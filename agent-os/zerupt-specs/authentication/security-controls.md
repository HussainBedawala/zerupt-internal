# Security Controls

> Detection rules and security test expectations for auth/admin operations. The deny-by-default
> permission model, role/branch evaluation, and approval matrix live in
> `agent-os/product/settings-admin/03-roles-permissions-policy.md`. This file covers only the
> monitoring and test contract that those rules must satisfy.

## Identity and Session Security

- session anomaly detection (new geo, impossible travel, unusual device)
- forced logout on suspension, compromise, or role downgrade
- refresh token rotation and revocation checks
- privileged action step-up authentication

## Minimum Detection Rules

- repeated failed login attempts
- mass role assignment changes
- sudden admin privilege grants
- token validation failures by source/IP
- branch scope mismatch attempts

## Security Test Expectations

- cross-tenant access denial tests
- privilege escalation tests
- invite replay and token reuse tests
- session revocation latency tests
- audit completeness and tamper-resistance tests
