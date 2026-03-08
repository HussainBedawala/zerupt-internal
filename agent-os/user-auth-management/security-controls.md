# Security Controls

## Baseline Security Requirements

- Strict tenant isolation via dedicated database per tenant
- Least-privilege access defaults
- Immutable audit trail for user/auth/admin events
- Encrypted transport and managed secret rotation
- Controlled admin break-glass path

## Control Categories

### 1) Identity and Session Security

- session anomaly detection (new geo, impossible travel, unusual device)
- forced logout on suspension, compromise, or role downgrade
- refresh token rotation and revocation checks

### 2) Access Governance

- deny-by-default permission model
- privileged action step-up authentication
- role assignment restrictions and approvals for critical roles

### 3) Invite and Recovery Security

- one-time invite tokens with short expiry
- rate-limited resend and acceptance
- recovery workflow with anti-fraud checkpoints

### 4) Audit and Forensics

- append-only audit storage
- actor, target, diff, channel, and correlation IDs recorded
- searchable incident timeline views for security operators

### 5) Platform Hardening

- API rate limiting by tenant and identity
- input validation and strict schema checks
- secure headers, CORS policy, and abuse throttling

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
