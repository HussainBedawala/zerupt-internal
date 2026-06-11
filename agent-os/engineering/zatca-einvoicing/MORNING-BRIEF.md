# ZATCA DEV-416 — Morning Brief (built overnight 2026-06-11)

Good morning. Full ZATCA Phase 1 + Phase 2 is built, reviewed, and pushed on branch
`phase-2/zatca-einvoicing` (PR link below). It is **gated dormant** (`ZATCA_ENABLED` off +
KSA-only), so merging deploys nothing active until you switch it on for a KSA tenant.

## What's done (all committed, green)
- Full crypto pipeline **byte-exact verified against ZATCA's own SDK** (hash parity + signature accepted by `fatoora -validate`): QR TLV (official test vectors), UBL 2.1 serializer (XSD-validated), C14N 1.1 + SHA-256 hash, XAdES-B-B signing (secp256k1), PIH chain + atomic ICV counter.
- Onboarding (CSR→CCSID→3/6 compliance samples→PCSID), clearance (standard, durable queue) + reporting (simplified, pg-boss, 24h SLA + sweeper), encrypted per-tenant credentials.
- Frontend: KSA-gated QR on receipts + A4, onboarding wizard, bilingual errors.
- Reviewed by 6 specialist reviewers; all CRITICAL/HIGH findings fixed (false VAT-exemption codes, rate inference, non-atomic chain, CSR injection, onboarding state guards, UI re-onboard bugs).

## What ONLY YOU can do (exact steps)

### 1. Before merge — migration renumber (I'll do it, but FYI)
Our migrations are `0073_zatca` + `0074_zatca_ksa_seller_address`. Another agent's `0073_fair_lilith`
is on main. Before merge the branch must be rebased on latest main and the two ZATCA migrations
**renumbered** to follow main's latest (drizzle journal can't have two idx 73). This is a
mechanical rebase step — flag me when main has settled and I'll do it.

### 2. Sandbox end-to-end test (≈30 min, after deploy to a test tenant)
- Set a test tenant's country = SA and fill seller VAT (`300000000000003`) + National Address in Settings.
- Set env `ZATCA_ENABLED=true`, `ZATCA_API_BASE_SANDBOX` (default already points at the gateway).
- In **Settings → Compliance → ZATCA**, create an EGS unit (environment = sandbox), and onboard:
  the sandbox OTP is the static **`123456`** (no portal OTP needed for sandbox).
- Confirm a sale produces a cleared/reported document with a QR.

### 3. Production go-live (per KSA tenant — needs YOUR ERAD business login)
- Each real KSA tenant logs into the **Fatoora portal** (https://fatoora.zatca.gov.sa) with their
  ERAD/business credentials, generates an **OTP**, and pastes it into the onboarding wizard
  (environment = production). The CSID belongs to the taxpayer. Zerupt automates the rest.

### 4. Env / infra (Railway)
- `ZATCA_ENABLED=true` (per environment, when ready), `ZATCA_API_BASE_PRODUCTION` (default set),
  `DB_ENCRYPTION_KEY_V*` (already exist — credentials reuse them). openssl is in the Node image (CSR).
- Runtime signing is **pure TS — no JVM needed in prod**. The Java SDK (Java 11) is only the CI
  test oracle: to run the SDK-parity tests in CI, set `ZATCA_SDK_ROOT` + a JDK 11; otherwise those
  tests cleanly skip.

### 5. Legal (parallel, gates selling not code)
- KSA tax advisor sign-off: (a) data residency for invoice XML on non-KSA infra,
  (b) SaaS-centralized CSID onboarding legality, (c) ToS disclaiming tax-compliance liability.

## Deliberately deferred (flagged, not silently skipped)
- **Non-SAR invoices**: explicitly REJECTED at the boundary (no false SAR amounts). FX + BT-111
  conversion is a documented TODO for multi-currency KSA sellers.
- **Buyer Saudi National Address** on standard B2B invoices: buyer carries name + VAT/other-ID;
  full SNA needs a customer-address schema field (small follow-up).
- **EGS-per-register** depth: schema + onboarding support per-register; wiring each POS register's
  CSID selection in the POS UI is a follow-up once you confirm the device model.

## Open verification (honest status)
The crypto is SDK-verified offline. What remains untested until your sandbox creds exist: the live
HTTP round-trip (CCSID issuance, real clearance/reporting acceptance with a ZATCA-issued cert chain).
The code is built to spec for these; step 2 above closes the loop.
