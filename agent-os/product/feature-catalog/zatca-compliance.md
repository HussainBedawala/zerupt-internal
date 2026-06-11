<!-- Feature catalog partition | Module: zatca-compliance | Generated: 2026-06-11 | Source: as-built audit -->
# ZATCA E-Invoicing (Fatoora) — Feature Catalog

> Status legend: `shipped` = in production code as of 2026-06-11 · `planned` = specced, not yet built.
>
> **Audit note (2026-06-11):** All ZATCA features below exist on branch `phase-2/zatca-einvoicing` (10 commits, fully reviewed, frontend fixes applied). The branch is NOT merged to `main` as of this audit date. Features are labeled `planned` if they exist only in the implementation spec, and `shipped` if they are implemented in code on the feature branch — with a clear callout that they await merge to production. No ZATCA code exists on `main`.

---

## KSA Tenant Identity & Seller VAT Validation

- **Status:** planned (coded on feature branch, not merged to main)
- **Description:** Adds KSA-specific seller fields to tenant settings: 15-digit VAT registration number (TRN) with ZATCA rule BR-KSA-31 validation (first and last digit must be `3`), Saudi National Address fields (building number, street, district, city, postcode, country code), and branch/EGS device identity. These fields gate all other ZATCA functionality.
- **Who it's for:** KSA retailers required to issue compliant e-invoices under the Fatoora mandate.
- **Constraints / notes:** Active only when `tenant_identity.countryCode === 'SA'`. Validation logic in `packages/shared/src/zatca/ksa-validation.ts` with full spec test coverage.

## Phase 1 QR Code (Tags 1-5, B2C Receipts)

- **Status:** planned (coded on feature branch, not merged to main)
- **Description:** Generates a ZATCA-compliant TLV-encoded QR code for B2C (simplified) POS receipts and A4 invoices. Encodes the five Phase 1 mandatory tags: seller name, VAT number, invoice timestamp, total amount with VAT, and VAT amount. The QR is rendered as a visual band on printed receipts and A4 tax documents.
- **Who it's for:** KSA retailers at POS who must print a scannable QR on every customer receipt immediately upon Phase 1 compliance deadlines.
- **Constraints / notes:** TLV encoder (`packages/shared/src/zatca/qr-tlv.ts`) is verified against two official ZATCA test vectors. Phase 1 QR does not require internet connectivity or ZATCA API calls — fully offline. Phase 2 extends this to tags 6-9.

## Phase 2 Signed QR Code (Tags 6-9)

- **Status:** planned (coded on feature branch, not merged to main)
- **Description:** Extends the QR to all nine Phase 2 tags, adding the invoice hash (raw 32 bytes), ECDSA signature, public key, and (for simplified invoices only) the ZATCA CA signature. The full signed QR is what ZATCA's mobile validator app reads.
- **Who it's for:** KSA retailers subject to Phase 2 integration waves (Wave 24 threshold: SAR 375k annual revenue, covers nearly all formal retail).
- **Constraints / notes:** Depends on the signing engine (XAdES-B-B) being active. The working curve assumption is `secp256k1`; confirmed from real-world SDK implementations but gated behind a constant pending founder-provided ZATCA SDK oracle test.

## UBL 2.1 KSA XML Serializer

- **Status:** planned (coded on feature branch, not merged to main)
- **Description:** Produces fully compliant ZATCA UBL 2.1 XML for standard (B2B/B2G clearance), simplified (B2C reporting), and credit/debit note document types. Implements the full BR-KSA business-rules set from the official XML Implementation Standard, including dual `cac:TaxTotal` blocks for multi-currency invoices and the 7-character `@name` invoice subtype attribute.
- **Who it's for:** KSA businesses issuing standard B2B invoices (clearance required before delivery) and POS B2C receipts (reporting within 24h).
- **Constraints / notes:** Serializer in `apps/api/src/zatca/xml/ubl-serializer.ts` with spec tests. Document type is determined automatically from the invoice source (POS = simplified, sales invoice = standard).

## XAdES-B-B Signing Engine

- **Status:** planned (coded on feature branch, not merged to main)
- **Description:** Signs every invoice XML with the ECDSA private key using the XAdES-B-B (Baseline-Basic) profile. Implements the precise 8-step signing order: build XML with placeholders, compute invoice hash via XPath exclusion + C14N 1.1 + SHA-256, build SignedProperties digest, assemble ds:Signature into UBLExtensions, then embed the signed QR. Uses pure TypeScript at runtime; the ZATCA Java SDK (`fatoora` tool) is used only as a CI conformance oracle.
- **Who it's for:** Any KSA tenant in Phase 2 — every outbound invoice must carry a valid digital signature.
- **Constraints / notes:** Canonicalization is C14N 1.1 (non-negotiable per ZATCA spec). Curve is `secp256k1` (working assumption — must be confirmed against ZATCA SDK before production go-live). Getting the XPath exclusion set wrong invalidates every hash; the SDK oracle in CI catches this.

## ICV / PIH Chain Counter

- **Status:** planned (coded on feature branch, not merged to main)
- **Description:** Maintains a monotonically increasing Invoice Counter Value (ICV) and a Previous Invoice Hash (PIH) chain per EGS unit. Each invoice increments the counter and chains its hash into the next document's PIH, forming a tamper-evident audit trail. Rejected invoices still consume an ICV slot (no gaps allowed by ZATCA).
- **Who it's for:** All KSA Phase 2 tenants. The chain is a mandatory ZATCA compliance requirement — any gap or duplicate ICV causes the EGS to be rejected.
- **Constraints / notes:** Uses a serialized advisory-lock worker per `egsUnitId` to prevent duplicate ICVs under concurrent invoice creation. PIH seed for the first invoice is SHA-256("0") per the ZATCA SDK reference.

## EGS Device Onboarding Wizard

- **Status:** planned (coded on feature branch, not merged to main)
- **Description:** Guides a KSA tenant through the full Electronic Generation Solution (EGS) registration flow in-product: generate a secp256k1 keypair and PKCS#10 CSR, receive a one-time password (OTP) from the FATOORA portal, exchange it for a Compliance CSID, run 3 or 6 compliance sample-document checks, then promote to a Production CSID. Credentials are stored AES-256-GCM encrypted per the existing secrets pattern.
- **Who it's for:** KSA finance managers or IT admins setting up each physical POS register or back-office billing device before going live.
- **Constraints / notes:** OTPs are valid for 1 hour and can only be generated via the FATOORA portal (no API). Per the implementation plan, the EGS granularity decision (per-register vs per-branch) is left to the operator; the wizard supports either. Requires live sandbox credentials to fully test.

## Clearance Flow (B2B Standard Invoices)

- **Status:** planned (coded on feature branch, not merged to main)
- **Description:** For standard (B2B/B2G) invoices, submits the signed UBL XML to the ZATCA Fatoora clearance API synchronously before the invoice is delivered to the buyer. ZATCA stamps the document; the cleared XML and ZATCA response are stored. The sale is blocked until clearance succeeds or a defined retry/timeout is reached.
- **Who it's for:** KSA businesses that issue tax invoices to other registered businesses or government entities.
- **Constraints / notes:** Clearance is an inline-blocking call on the `sales.invoice.confirmed` event path — any ZATCA downtime affects B2B invoice issuance. Retry/circuit-breaker logic is planned. Bilingual (AR/EN) error messages map ZATCA validation codes to user-friendly text.

## Reporting Flow (B2C Simplified Invoices)

- **Status:** planned (coded on feature branch, not merged to main)
- **Description:** For simplified (B2C/POS) invoices, submits the signed UBL XML to the ZATCA reporting API asynchronously within the mandatory 24-hour window. The POS sale completes immediately; reporting happens in the background via a durable pg-boss queue with retry and dead-letter alerting.
- **Who it's for:** KSA POS retailers — the most common use case (every retail sale to an individual consumer).
- **Constraints / notes:** Queue-based to avoid blocking the cashier. Dead-letter + alert on exhausted retries so the operator knows before the 24h window closes. The `zatca_invoice_documents` table tracks `status` (pending / reported / cleared / rejected) per document.

## PCSID Renewal & CRL Handling

- **Status:** planned (spec only, not coded)
- **Description:** Automates renewal of the Production CSID before it expires (maximum 5-year X.509 certificate lifetime) and handles Certificate Revocation List (CRL) checks with a 7-day offline tolerance — meaning the system can issue invoices even when it cannot reach the CRL endpoint for up to 7 days.
- **Who it's for:** KSA tenants in long-term production use who cannot afford certificate expiry to silently break invoice issuance.
- **Constraints / notes:** Not yet coded; planned as part of the Phase 2 epic. The 7-day CRL tolerance is per official ZATCA security specification.

## ZATCA Invoice Document Ledger

- **Status:** planned (coded on feature branch, not merged to main)
- **Description:** Every invoice processed through the ZATCA module is recorded in `zatca_invoice_documents` with its UUID, ICV, PIH, invoice hash, encrypted signed XML, QR base64, submission status, and the raw ZATCA API response. Provides a full audit trail for compliance reviews and dispute resolution.
- **Who it's for:** KSA finance teams and auditors who need to produce evidence of compliant invoice submission on demand.
- **Constraints / notes:** Table is per-tenant (tenant DB), keyed to both `invoiceId` (sales) and `posTxnId` (POS). Signed XML is stored encrypted (AES-256-GCM). DB migration `0073_zatca.sql` and `0074_zatca_ksa_seller_address.sql` exist on the feature branch.
