# POS — Receipt Model Testing Checklist

> Persona: **Counter cashier** (post-sale receipt actions), **customer** (public receipt URL), **shift supervisor** (reprint and audit). Ask at every screen: **"what's the dumbest thing a cashier could do here, at speed, with a customer waiting?"**

- **Route(s):** Post-sale receipt panel within `/pos`; public receipt at `/r/[token]` (no auth shell — publicly accessible)
- **Feature dir:** `apps/web/src/app/[locale]/(pos)/pos/` (post-sale receipt actions); `apps/web/src/app/r/[token]/` (public receipt page — confirm path)
- **API:** `GET tenant/pos/transactions/:id/receipt`, `POST tenant/pos/transactions/:id/receipt/reprint`, `GET public/receipts/:token`
- **Tables:** `pos_receipts` (tenant DB), `receipt_tokens` (admin DB — separate Neon connection)
- **Depends on:** 01-register-session, 02-transaction-lifecycle (at least one completed transaction), 07 presupposes the admin DB connection is healthy.

## 0. Preconditions

- [ ] At least one completed transaction with a receipt exists; know its `transactionNumber` and the token URL from the post-sale screen.
- [ ] The public receipt URL (`/r/<token>`) is accessible without logging in; test from an incognito window.
- [ ] Admin DB and tenant DB are both reachable (two separate Neon connections).
- [ ] Know the tenant name, logo, and address that should appear on the receipt.

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

### Post-sale receipt (tenant-authenticated)

- [ ] **Receipt loads** (`GET tenant/pos/transactions/:id/receipt`) — all fields present immediately after completion: store name, address, cashier, shift, transaction number, date/time, all line items (name, qty, unit price, line total), subtotal, tax breakdown, discount (if any), grand total, payment method(s) and amounts, change given.
  - [ ] Loading state shown while fetching; not a blank screen.
  - [ ] Error state: if receipt fetch fails, a human-readable message with a "retry" or "reprint" option — cashier should not be stuck.
  - [ ] Currency and amounts displayed at tenant precision (KWD = 3 dp); no hardcoded 2 dp.
- [ ] **QR code / token** — a QR code linking to the public receipt URL is shown on the post-sale screen; scanning it opens the public receipt in a browser.
  - [ ] QR resolves to the correct `/r/<token>` URL.
  - [ ] The QR token does not contain or expose internal transaction IDs, tenant IDs, or user IDs — token only.
- [ ] **Share / send** — if a "Send via WhatsApp" option is shown in the UI, it is either functional or clearly marked as "coming soon"; cashier is not given a broken "send" button.

### Public receipt (unauthenticated)

- [ ] **Public receipt loads** (`GET public/receipts/:token`) — from an incognito window, the receipt page loads with the same information as the tenant-authenticated version.
  - [ ] No internal IDs visible in the page source or URL (token only in the URL).
  - [ ] `Cache-Control: no-store` header is present on the response; browser does not cache the receipt page.
  - [ ] Page renders correctly in both LTR and RTL (the customer's browser locale, not the tenant's locale, should not override the receipt's intended locale).
- [ ] **Invalid or expired token** — navigating to `/r/<random-string>` returns a 404 or a clear "receipt not found" page; no internal error message or stack trace exposed.
- [ ] **Rate limit** — making 21 requests to the same token within one minute is blocked after the 20th (rate limit: 20 req/min per token); the 21st returns a 429 with a retry-after header.

### Reprint

- [ ] **Reprint** (`POST tenant/pos/transactions/:id/receipt/reprint`) — supervisor triggers a reprint; `reprintCount` increments; the reprinted receipt includes a visible "REPRINT" header (or equivalent indicator) so the printed copy is distinguishable from the original.
  - [ ] `reprintCount` is monotonically increasing; no decrement on further reprints.
  - [ ] Cashier WITHOUT reprint permission: button hidden; server rejects the POST with 403.
  - [ ] Rapid double-tap reprint: `reprintCount` increments by 1 only; button debounced or server idempotent within a short window.
- [ ] **Reprint of an offline transaction** — until the transaction is synced, the QR/token is not available; the reprint must use the print-agent path (see 10-printing-receipts) and show only the `offlineNumber`; the receipt should state "Sync pending."

### Receipt completeness (data invariant audit)

- [ ] Every completed transaction has exactly one `pos_receipts` row (verify by querying the tenant DB directly: `SELECT COUNT(*) FROM pos_receipts WHERE transactionId = ?`).
- [ ] `receipt_tokens` row exists in the admin DB for the same transaction; the token references the correct tenant and transaction (verify via admin DB query with appropriate access).
- [ ] `pos_receipts.type = 'sale'` for regular sales; `type = 'return'` for return receipts; `type = 'void'` if a void receipt is generated.

## 2. Domain invariants (cash / GL / stock)

- [ ] **Every completed transaction has exactly one `pos_receipts` row of type `sale`:** no completed transaction has zero receipts (cashier has nothing to show the customer) or two receipts (duplicate printing, auditability failure).
- [ ] **`receipt_tokens` minted atomically with transaction completion:** the token insert into the admin DB and the `pos_receipts` insert into the tenant DB happen in the same logical completion flow; if either fails, the completion is either rolled back or a bounded retry mints the missing record (lazy re-register); a completed transaction with no token in the admin DB means the public QR is permanently broken.
- [ ] **Public URL exposes no internal IDs:** the `/r/<token>` URL and the response body must not contain `transactionId`, `tenantId`, or `userId`; the token is the only identifier on the public surface.
- [ ] **`reprintCount` is monotonically non-decreasing:** no `pos_receipts.reprintCount` decreases between consecutive reads; no concurrent reprint race condition causes a count to be lost.
- [ ] **`Cache-Control: no-store` on the public endpoint:** a receipt is a financial document; caching it in a shared browser or CDN could expose one customer's receipt to another. The header must be present on every response from `GET public/receipts/:token`.
- [ ] **Rate limit enforced at 20 req/min per token:** prevents enumeration or scraping of receipt data; confirm the rate limiter is keyed on the token value (not just by IP) so that a distributed scraper is also limited.

## 3. Edge cases & defensive UX — "the dumbest thing a cashier could do here"

- [ ] **Cashier prints QR but customer can't scan it:** fallback — cashier can show the URL as text or send a link; confirm there is a "copy link" option alongside the QR.
- [ ] **Admin DB down at completion time:** the tenant transaction completes, but the token insert into the admin DB fails; the lazy re-register mechanism must catch this on the next receipt request; verify a retry loop or event-driven re-registration exists.
- [ ] **Admin DB token insert succeeds but tenant `pos_receipts` insert fails:** the completion is rolled back; the token is orphaned in the admin DB; the orphaned token resolves to a 404 on the public endpoint (no tenant record to display). Confirm the system handles this gracefully — the orphaned token should not expose any data.
- [ ] **Multiple cashiers reprinting the same receipt concurrently:** `reprintCount` is incremented atomically (DB-level increment, not read-then-write); no lost updates.
- [ ] **Very long item names on the receipt:** text wraps correctly; does not overflow the receipt layout or break the QR code rendering.
- [ ] **Receipt for a transaction with many lines (20+):** all lines appear; no pagination or truncation that hides purchased items.
- [ ] **Receipt in Arabic locale:** all text RTL; amounts and dates localized; store name in the tenant's primary/secondary language pair (not hardcoded English).
- [ ] **Token guessing:** confirm tokens are cryptographically random (not sequential integers or predictable patterns); an attacker guessing a token has negligible probability of success.

## 4. Cross-module / integration

- [ ] The public receipt page for a return transaction clearly states it is a return, shows the original transaction number, and lists refunded items with negative quantities.
- [ ] The receipt for a voided transaction (if a void receipt is issued) clearly states "VOIDED" and does not look like a valid proof of purchase.
- [ ] Reprint is recorded in an audit log (or at minimum `reprintCount` is auditable) so that a supervisor can tell if a cashier has been issuing multiple copies of a receipt for a fraudulent refund claim.
- [ ] If WhatsApp / email delivery is ever enabled: the delivery attempt is logged; failed delivery does not block receipt creation or transaction completion.

## 5. Known gaps (from recon — verify or track)

- **Offline receipts get QR only after post-sync reprint** — an offline sale completes with an `offlineNumber` only; the cashier can show only a printed paper receipt (via print agent) or a QR-less screen receipt. The customer receives no scannable QR until after sync. Ensure the offline receipt clearly communicates "QR available once connected" and provides a fallback receipt number the customer can reference. **HIGH** UX gap for offline-heavy environments.
- **WhatsApp delivery deferred** — the UI must not offer a "Send via WhatsApp" action that triggers a real send; if the feature is not live, the button must either be absent or visibly disabled with a "coming soon" label. **MEDIUM** — a broken send button damages customer trust.
- **Cross-DB consistency (tenant write ok, admin token insert fail)** — the lazy re-register mitigation exists in the design, but whether it is tested under partial-failure conditions is unconfirmed. A transaction that permanently lacks a token in the admin DB results in a QR that never resolves. **HIGH** reliability gap; add a background job or health-check that reconciles `pos_receipts` rows against `receipt_tokens` and re-registers any missing tokens.
- **Receipt token entropy** — confirm tokens are generated with sufficient entropy (≥128 bits, cryptographically random); sequential or short tokens are a privacy risk. **MEDIUM**.
- **Public receipt rate limit keying** — if the rate limiter is keyed on IP rather than token, a single attacker can enumerate many tokens from a distributed botnet without hitting the per-IP limit. **MEDIUM** security consideration.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
