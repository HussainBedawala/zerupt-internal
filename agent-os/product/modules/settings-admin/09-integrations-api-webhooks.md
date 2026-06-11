# Integrations API Webhooks

## API Key Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `name` | string | |
| `keyPrefix` | string | Public prefix only |
| `secretHash` | string | Stored hashed |
| `scopes` | array(string) | Permission-like scope keys |
| `status` | enum | `Active`, `Revoked`, `Expired` |
| `expiresAt` | datetime | nullable |
| `lastUsedAt` | datetime | nullable |
| `createdByUserId` | UUID | |

## Webhook Endpoint Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `name` | string | |
| `url` | string | HTTPS only |
| `secretHash` | string | Signing secret hash |
| `events` | array(string) | Subscribed event keys |
| `status` | enum | `Active`, `Paused`, `Disabled` |
| `retryPolicy` | enum | `Linear`, `Exponential` |
| `maxRetries` | integer | |
| `timeoutSeconds` | integer | |

## Delivery Log Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `endpointId` | UUID | |
| `eventId` | UUID | |
| `attempt` | integer | |
| `statusCode` | integer | nullable |
| `result` | enum | `Success`, `Failed`, `Dropped` |
| `createdAt` | datetime | |

---

## API Key Rules

| Rule | Detail |
|------|--------|
| Secret visibility | Full secret shown once at creation |
| Scope validation | Scopes must be from approved scope catalog |
| Revocation | Immediate; tokens invalidated |
| Rotation | New secret + overlap window optional |

## Webhook Rules

| Rule | Detail |
|------|--------|
| Signature | HMAC over payload with endpoint secret |
| Replay protection | Timestamp + nonce validation |
| Fail threshold | Auto-pause after consecutive failures policy |
| Event ordering | Best effort per endpoint, no global guarantee |

## Permissions

| Action | Required Key |
|--------|--------------|
| Create/rotate API key | `settings.integrations.manageKeys` |
| Manage endpoint | `settings.integrations.manageWebhooks` |
| View secrets | `settings.integrations.manageSecrets` |
| Resume paused endpoint | `settings.integrations.resume` |
