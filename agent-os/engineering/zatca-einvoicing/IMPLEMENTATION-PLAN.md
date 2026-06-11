# ZATCA E-Invoicing (Fatoora) — Master Implementation Plan

> **Date:** 2026-06-11 · **Source:** 6 official ZATCA PDFs read end-to-end (see `extracted/`)
> **Status:** PLAN — no code written yet. Awaiting founder inputs (§7) before Phase 2 crypto.
> **Confidence:** Field/flow/QR layer = HIGH (read from official standards). One crypto contradiction flagged (§2.1) — MUST resolve against ZATCA SDK before signing code.

Companion extractions (full detail):
- `extracted/01-implementation-resolution.md` — legal controls, prohibited functions, mandatory fields
- `extracted/02-technical-guideline.md` — onboarding, ICV/PIH chain, API flow
- `extracted/03-qr-code.md` — TLV tag table + **test vectors**
- `extracted/04-developer-portal.md` — endpoints, auth, CSR, environments
- `extracted/05-xml-implementation-standard.md` — **the UBL 2.1 field schema** (every element + BR rules)
- `extracted/06-security-features.md` — **XAdES signing, C14N, hash encoding, PIH**

---

## 1. What the official docs CHANGED vs the research brief

The research brief (`RESEARCH-ZATCA-2026-06-10.md`) was directionally right but several `[TECH]` items were wrong or imprecise. Corrections now locked from official sources:

| Topic | Research brief said | Official docs say | Impact |
|---|---|---|---|
| QR TLV Length byte | (ambiguous) | **Length = binary byte count** (e.g. 21 → `0x15`), NOT ASCII digits. Tag = binary byte. | QR encoder must use raw bytes. Test vectors in `03-qr-code.md`. |
| QR Tag 6 hash format | "hash" | **Raw 32 bytes inside TLV** (NOT base64 inside TLV); base64 only at the outer whole-QR step | Encoder detail. |
| Invoice subtype | doc type 1000/0100/1100 | That 4-digit map is the **CSR functionality map**. The *invoice* subtype is the **`@name="NNPNESB"` 7-char attr** on `cbc:InvoiceTypeCode` (01=standard, 02=simplified) | XML serializer core. |
| Hash chain | "two chains, per device" | **ONE unified ICV/PIH sequence per EGS** shared across standard+simplified | Counter design. |
| Rejected invoices | (unstated) | **Still consume ICV + are part of the PIH chain** (next PIH points to rejected doc) | No gaps allowed. |
| Signature profile | XAdES-EPES | **XAdES-B-B (Baseline-Basic)**, ETSI EN 319 132-1, enveloped in `ext:UBLExtensions` | Signing code. |
| Canonicalization | (unstated) | **C14N 1.1** — `http://www.w3.org/2006/12/xml-c14n11` | Exact, non-negotiable. |
| Hash pre-image | "canonical XML" | C14N 1.1 **after XPath-excluding** `ext:UBLExtensions`, `cac:Signature`, and `AdditionalDocumentReference[ID='QR']` | Get this exact or every hash is wrong. |
| TaxCurrencyCode | (unstated) | **Always present, always `SAR`**; if invoice currency ≠ SAR, emit **two `cac:TaxTotal`** blocks (one in doc currency, one SAR tax-only) | Multi-currency rule. |
| Seller VAT | 15 digits | 15 digits **first AND last = `3`** (BR-KSA-31) | Validation. |
| Cert validity | "~1 year, unconfirmed" | **Max 5-year** X.509; **CRL valid 7 days** → 7-day offline tolerance | Renewal design. |
| OTP | (unstated) | Valid **1 hour**, up to 100/request, **portal-only (no API)** | Onboarding UX. |

## 2. The crypto layer (locked, except §2.1)

From `06-security-features.md` + `02-technical-guideline.md`:

- **Signature:** ECDSA + SHA-256, XAdES-B-B, enveloped inside `ext:UBLExtensions/.../ds:Signature`.
- **Canonicalization:** C14N 1.1 (`xml-c14n11`).
- **Invoice hash:** XPath-exclude (UBLExtensions, Signature, QR ref) → C14N 1.1 → SHA-256 → 32 raw bytes. `ds:DigestValue` = base64(32 bytes); QR Tag 6 = the raw 32 bytes.
- **PIH:** same transform applied to invoice N-1. First invoice uses a **fixed seed** (= base64 of SHA-256("0") per ZATCA SDK — **must confirm literal from SDK**, §7).
- **Signing order (8 steps):** build XML w/ placeholders → hash → build `xades:SignedProperties` (signingTime, SigningCertificateV2, policy) → digest SignedProperties → build+C14N `ds:SignedInfo` → ECDSA-sign → assemble `ds:Signature` into UBLExtensions → build QR TLV → base64 → insert QR.
- **Keys:** FIPS 186, non-exportable, PKCS#10 CSR proof-of-possession.

### 2.1 🔴 CRITICAL CONTRADICTION — ECDSA curve

The two official docs disagree, and this is a notorious ZATCA trap:
- **Detailed Technical Guideline** shows `openssl ecparam -name secp256k1` (the "Bitcoin" curve).
- **Security Features Standard** certificate-profile table says **P-256 (secp256r1)**.

Real-world ZATCA SDK / Microsoft Dynamics / Zoho implementations generate the **EGS keypair with `secp256k1`** and ZATCA's CA accepts it — the "P-256" line is a known doc inconsistency. **We will treat `secp256k1` as the working assumption but MUST verify against the ZATCA SDK reference `fatoora` tool before writing signing code** (see §7, ask #1). Getting this wrong = every signature rejected.

## 3. Two invoice flows (locked)

| | Standard (B2B/B2G) | Simplified (B2C / POS) |
|---|---|---|
| Subtype `@name` | `01xxxxx` | `02xxxxx` |
| Flow | **Clearance** — POST `/invoices/clearance/single`, synchronous, ZATCA stamps **before** buyer copy is valid | **Reporting** — issue instantly, POST `/invoices/reporting/single` **within 24h** |
| Blocks sale? | Yes | No |
| EGS signs? | Optional stamp | **Mandatory** device stamp |
| QR | Phase 2 (all 9 tags; Tag 9 only on simplified) | Mandatory Phase 1 (tags 1-5) + Phase 2 (6-9) |

## 4. Architecture — `zatca` NestJS module (quarantined, 100% coverage)

Insertion points confirmed against codebase (`a44420a762749521b` map):

- **DB (tenant):** `packages/db/src/schema/zatca.ts`
  - `zatca_credentials` — per legal entity: `csidEnc`, `privateKeyEnc`, `certificateEnc` (AES-256-GCM via existing `packages/shared/src/crypto.ts`), `environment`, `expiresAt`. Mirrors `tenantDatabases.dbPasswordEnc` pattern.
  - `zatca_invoice_documents` — `invoiceId`/`posTxnId` FK, `uuid`, `icv` (bigint, per-EGS monotonic), `pih`, `invoiceHash`, `signedXmlEnc`, `qrBase64`, `status` (pending/reported/cleared/rejected), `zatcaResponse` (jsonb), `submittedAt`, `clearedAt`.
  - `zatca_egs_units` — the device registry (one EGS per register/branch as decided) holding the ICV counter source-of-truth.
- **API module:** `apps/api/src/zatca/`
  - `zatca-csr.service.ts` (CSR gen), `zatca-onboarding.service.ts` (OTP→CCSID→checks→PCSID), `zatca-xml.service.ts` (UBL serializer), `zatca-signing.service.ts` (hash/C14N/XAdES/QR), `zatca-api-client.service.ts` (HTTP), `zatca-clearance.service.ts`, `zatca-reporting.service.ts`, `zatca-counter.service.ts` (serialized ICV/PIH per EGS).
  - Listens to existing `sales.invoice.confirmed` + POS completion events (like `SalesAccountingListener`).
  - Reporting via **pg-boss** queue (`apps/api/src/queue/`), durable retry/backoff, dead-letter + alert. Clearance is inline-blocking on the standard-invoice confirm path.
- **Counter integrity:** single serialized worker per EGS unit → no ICV gaps/dupes (advisory lock per `egsUnitId`).
- **Frontend QR:** extend `apps/web/src/features/pos/print/qr.ts` with `buildZatcaTlv()` + render band in `raster.ts` and A4 `tax-document.tsx`.
- **Country gate:** behavior active only when `tenant_identity.countryCode === 'SA'`.

### 4.1 Signing engine decision (see §7 ask #2)
C14N 1.1 + XAdES-B-B conformance is the single highest-risk piece. Options:
- **(A) Pure TypeScript** — `xml-crypto`/`xmldsigjs` + node `crypto` (secp256k1 supported). Full control, no new runtime; risk = matching ZATCA's exact C14N/XAdES byte output.
- **(B) ZATCA Java SDK sidecar** — wrap ZATCA's official `fatoora` SDK (signing + offline validation) as a small service on Railway. Battle-tested conformance; cost = a JVM in the stack.
- **(C) Hybrid (recommended):** implement signing in TypeScript, but use the **ZATCA SDK only in CI/tests as the conformance oracle** (validate our generated XML against the SDK's validator). Ships pure-TS at runtime, gets SDK-grade confidence in tests.

## 5. Delivery phases

**Epic Z1 — Phase 1 (Generation), MVP-sized, unblocks KSA pilots**
1. KSA tenant settings: seller VAT (15-digit, 3..3 validated), National Address fields, branch/EGS identity.
2. UBL field completeness audit — ensure invoices capture every Phase-1 mandatory field (`05-...md`).
3. QR TLV tags 1-5 on B2C receipts (`buildZatcaTlv`) — **validate against the two test vectors in `03-qr-code.md`**.
4. Anti-tampering/prohibited-functions audit (no edit/delete of issued docs ✅ already; sequential numbering; no time manipulation).
5. Bilingual invoice render (✅ exists). Credit/debit-note-only corrections.

**Epic Z2 — Phase 2 (Integration), the large epic**
6. `zatca.ts` schema + migration; `zatca_egs_units` + counter service (ICV/PIH chain, seed value).
7. UBL 2.1 KSA XML serializer (standard + simplified + credit/debit notes) — full BR-KSA rule set.
8. Signing engine (§4.1) — hash, C14N 1.1, XAdES-B-B, QR tags 6-9. Curve resolved (§2.1).
9. Onboarding flow in-product: CSR → OTP paste → CCSID → compliance checks (3 or 6 samples) → PCSID; encrypted storage.
10. Clearance client (blocking, standard) + Reporting client (queued, 24h, simplified).
11. PCSID renewal automation; CRL/offline handling (7-day).
12. ZATCA validation-error → bilingual UX mapping. Sandbox→Simulation→Production config per tenant.
13. 100% test coverage incl. the SDK conformance oracle.

## 6. Open compliance questions (legal, parallel — not dev-blocking)
- Data residency for invoice XML hosted abroad (Vercel/Railway/Neon non-KSA). Needs KSA tax/legal sign-off.
- Whether a SaaS may centralize per-tenant CSID onboarding; data-custody/liability.
- ToS disclaiming tax-compliance liability (taxpayer carries it).
- Confirm latest wave list (Wave 25+) + exact penalty schedule before customer-facing copy.

## 7. 🔴 WHAT I NEED FROM THE FOUNDER (blocks Phase 2 crypto)
1. **ZATCA SDK (`fatoora` toolkit)** — official offline signer+validator (settles the curve question; becomes CI test oracle). Highest value.
2. **Fatoora sandbox login** (open-registration, test-only) — real CCSID/OTP/compliance flow.
3. **Test KSA VAT/TRN** (15 digits, 3..3) + Saudi National Address for a test seller.
4. **Legal sign-off (parallel):** data residency for XML on non-KSA infra; SaaS-centralized onboarding legality.
5. **EGS granularity decision** — recommend per-register for POS + one server-EGS for back-office.
6. Data Dictionary PDF (low priority — duplicated in XML standard).

## 8. DECISIONS (founder, 2026-06-11)
- **Scope:** build **full Phase 1 + Phase 2 as one epic** (not split around June 15 MVP).
- **Signing engine:** **Pure TypeScript at runtime, ZATCA SDK as CI conformance oracle** (option C/A hybrid).
- **Curve:** working assumption `secp256k1`, gated behind a single constant, to be confirmed against the SDK before signing code is finalized.

## 9. BUILD ORDER (unblocked-first)
Started **without** founder inputs (deterministic, test-driven):
1. ✅ QR TLV encoder in `packages/shared` — verified against the 2 official test vectors. ← in progress
2. KSA tenant settings + validation (seller VAT 3..3, National Address).
3. `zatca` DB schema + migration (credentials, documents, EGS units).
4. UBL 2.1 serializer (standard/simplified/notes) — BR-KSA rule set.
5. Counter service (ICV/PIH chain).
Blocked on inputs: signing curve finalize (#1), onboarding/CSR live test (#2,#3), clearance/reporting against sandbox.
