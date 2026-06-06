# Public Tokenized Resources — Concepts

> Phase 4A study note. Context: DEV-395 digital receipt — bearer-token public URL, admin token registry, multi-tenant resolution without auth.

---

## 1. The Pattern

Some resources must be accessible to unauthenticated users (a customer clicking a receipt link from their email or a QR code on paper) while still being private to the right person. The solution is a **bearer-token URL**:

```
https://app.zerupt.com/r/{token}
```

- The URL itself is the credential. Anyone who holds it can view the receipt.
- The token is not a session cookie, not a JWT — it is a random opaque string with no embedded claims.
- The server looks up the token in a registry to resolve what resource it represents.

This is the same pattern used by Google Docs "share link", Dropbox download links, and Stripe's hosted invoice pages.

---

## 2. Token Entropy & Collision Resistance

The token must be long enough that it cannot be guessed by brute force or enumeration:

- UUID v4 = 122 random bits ≈ 5.3 × 10³⁶ possible values.
- At 1 million guesses/second: expected time to find a valid token ≈ 10²³ years.
- Zerupt uses UUID v4 for receipt tokens. No sequential IDs, no short slugs.

The token is the only thing needed to access the receipt. If it leaks (forwarded email, screenshot), the recipient gains access. Design consequence: the receipt payload strips internal IDs and customer contact details so leakage exposes content but not PII beyond what the customer already knows.

---

## 3. Multi-Tenant Resolution Without Auth

Zerupt is multi-tenant: each tenant has its own Postgres database. Normal API requests carry a JWT with `tenant_id`, and `TenantContextMiddleware` resolves the right DB connection.

Public endpoints carry no JWT. The token registry solves the resolution problem:

**Admin DB** (`zerupt_admin`) holds a `receipt_tokens` table:

| column | description |
|--------|-------------|
| `token` | UUID v4, primary key |
| `tenant_id` | which tenant owns this receipt |
| `transaction_id` | the POS transaction |
| `created_at` | when minted |
| `expires_at` | optional TTL |

**Public endpoint** (`GET /public/receipts/:token`):
1. Look up token in admin DB → get `tenant_id` + `transaction_id`.
2. Open the tenant DB connection for that `tenant_id`.
3. Query the transaction and project the receipt payload.
4. Return. No auth header required.

The token is the routing key. Without it, there is no path into any tenant's data.

---

## 4. Uniform 404 / No-Enumeration Design

The public endpoint returns `404 Not Found` for:
- Tokens that do not exist in the registry.
- Tokens that exist but have expired.
- Tokens that exist but whose transaction has been voided (policy decision).

It never returns `403 Forbidden`, `410 Gone`, or any other response that distinguishes between "never existed" and "exists but you can't have it". A uniform 404 prevents enumeration: an attacker cannot tell whether a guessed token is close to a real one. This is standard for bearer-token resources.

UUID v4 validation (`ParseUUIDPipe`) is applied before the DB lookup so malformed tokens (e.g., SQL injection attempts, short strings) are rejected with 400 immediately without touching the database.

---

## 5. Token Lifecycle: Minting & Fire-and-Forget Write Repair

**Minting:** The receipt token is generated atomically with the POS transaction status update at sale completion. If the transaction fails to commit, the token is discarded (never registered). This prevents orphan tokens pointing at non-existent transactions.

**Admin-DB registration:** After the tenant-DB commit, the token is registered in the admin DB's `receipt_tokens` table. This is a cross-database write and cannot be part of the tenant transaction.

**Bounded retry + lazy re-register:** If the admin-DB registration fails (network blip, admin DB suspend on free tier):
- The token is stored locally (in the tenant DB or a Redis outbox).
- A background job retries registration with exponential backoff up to N attempts.
- If the public endpoint is hit before registration completes, the endpoint finds no token and returns 404. On that same request (or a separate reconciliation job), a **lazy re-register** attempt is made: fetch the token from the tenant DB and write it to the admin DB.
- This is "fire-and-forget with repair" — eventual consistency, bounded retry, no blocking of the sale flow.

**Offline sales:** Offline POS sales are synced later. The QR code is only included on the post-sync reprint, not the paper receipt printed at sale time, because the token cannot be minted until the transaction reaches the server.

---

## 6. Cache-Control for Private Public Pages

`Cache-Control: no-store` is set on the public receipt response because:
- The receipt contains personal transaction data (items bought, amounts paid).
- A shared browser (shop's own kiosk or a customer's public terminal) should not cache the page.
- CDN caching would serve one customer's receipt to the next person who loads the same URL (e.g., at a CDN edge with aggressive caching).
- `no-store` prevents both browser and intermediate proxy caching.

The receipt is idempotent (the underlying transaction doesn't change), so caching could theoretically work — but the privacy risk outweighs the performance benefit. Rate limiting (20 requests/minute per client IP, with `trust proxy` for Railway) prevents scraping.
