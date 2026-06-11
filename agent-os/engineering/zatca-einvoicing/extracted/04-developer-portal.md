# ZATCA Developer Portal Manual — Integration Reference

> Extracted from: DEVELOPER-PORTAL-MANUAL.pdf (Version 3, Nov 2022, 96 pages)
> Purpose: API client implementation reference for Fatoora e-invoicing integration

---

## 1. Environments

### 1.1 Developer Portal / Integration Sandbox (Test)

| Property | Value |
|----------|-------|
| Base URL | `https://sandbox.zatca.gov.sa/` |
| Access | Public registration required for SDK + Sandbox pages |
| Registration-free access | Web Based Validator, Support/FAQ pages |
| Authentication | Developer Portal account (email + password), not taxpayer credentials |
| Session timeout | 8 hours |
| Purpose | Test only — NOT accepted by ZATCA as real submissions |

> NOTE: Test CSIDs from Sandbox **cannot** be used in the Core (Production) E-invoicing Solution. ZATCA does not store any invoices submitted to the Sandbox.

### 1.2 Production (Core E-invoicing Platform — FATOORA)

| Property | Value |
|----------|-------|
| Access | Taxpayers only — must authenticate via SSO/ERAD (Taxation portal) credentials |
| Base URL | Not published in this manual; accessible only via ERAD login |
| Requirement | Must complete full Onboarding + Compliance checks before submitting invoices |
| Global access | Yes — accessible from anywhere, not only from KSA |

### 1.3 Key Differences

| Aspect | Sandbox | Production |
|--------|---------|------------|
| CSID source | Test Compliance/Production CSIDs issued by Sandbox | Real CSIDs issued by ZATCA CA after full compliance |
| Compliance checks required between Compliance CSID and Production CSID | NOT required in Sandbox | REQUIRED — Production CSID is invalid until compliance checks pass |
| Clearance variants | Two API variants (Clearance enabled / Clearance disabled) for testing | One API per function (Clearance enabled or disabled at any point in time) |
| Data stored | No | Yes |

---

## 2. API Endpoints

All API calls use **HTTPS** and **REST (POST)**. Version header `accept-version: v2` is mandatory (V2 is currently the only valid version).

### 2.1 Compliance CSID API (Onboarding Step 1)

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/compliance` |
| Purpose | Submit a signed CSR to obtain a Compliance CSID and a Request ID |
| Pre-requisites | Public/private key pair; signed CSR (generated per Section 5.3) |
| Auth | OTP passed as header (see Section 4 below) |

**Request Headers:**
```
OTP: <6-digit OTP from FATOORA portal>
accept-version: v2
Content-Type: application/json
Accept-Language: en (or ar)
```

**Request Body:**
```json
{
  "csr": "<PEM-encoded CSR as string>"
}
```

**Response (200 — Valid):**
```json
{
  "requestID": "<compliance request ID>",
  "dispositionMessage": "ISSUED",
  "binarySecurityToken": "<Base64-encoded compliance certificate>",
  "secret": "<secret value>",
  "errors": null,
  "warnings": null
}
```

**Response (4xx — Invalid):** Error message(s) describing what failed.

---

### 2.2 Compliance Invoice API (Compliance Checks — Onboarding Step 2)

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/compliance/invoices` |
| Purpose | Submit test invoices/credit notes/debit notes to perform compliance checks required BEFORE obtaining Production CSID. Repeated for each required sample document. |
| Pre-requisites | Compliance CSID from step 2.1 above |
| Auth | Basic Auth: Compliance CSID (`binarySecurityToken`) as Username, `secret` as Password |

> In the Sandbox: use the sample dummy username and password shown on the Authorization screen.
> In Production: use the `binarySecurityToken` and `secret` from the Compliance CSID response.

**Request Headers:**
```
Authorization: Basic <Base64(binarySecurityToken:secret)>
accept-version: v2
Content-Type: application/json
Accept-Language: en (or ar)
```

**Request Body:**
```json
{
  "invoiceHash": "<SHA-256 hash of invoice XML, Base64-encoded>",
  "uuid": "<invoice UUID>",
  "invoice": "<Base64-encoded signed invoice XML>"
}
```

**Response (200):** Compliance check result with warnings/errors.

> NOTE: Multiple compliance checks are required (one per sample document type). The Core E-invoicing Solution will not issue a Production CSID until all required compliance checks are passed. In the Sandbox this restriction is not enforced.

---

### 2.3 Production CSID API — Onboarding

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/production/csids` |
| Purpose | Submit Compliance Request ID to obtain a Production CSID (Onboarding) |
| Pre-requisites | Compliance CSID from step 2.1; all compliance invoice checks passed |
| Auth | Basic Auth: Compliance CSID (`binarySecurityToken`) as Username, `secret` as Password |

**Request Headers:**
```
Authorization: Basic <Base64(binarySecurityToken:secret)>
accept-version: v2
Content-Type: application/json
Accept-Language: en (or ar)
```

**Request Body:**
```json
{
  "compliance_request_id": "<requestID from compliance CSID response>"
}
```

**Response (200 — Valid):**
```json
{
  "requestID": "<production request ID>",
  "dispositionMessage": "ISSUED",
  "binarySecurityToken": "<Base64-encoded production certificate>",
  "secret": "<secret value>",
  "errors": null,
  "warnings": null
}
```

**Response — Invalid (Compliance checks not completed):** Error message indicating compliance must be completed first.

---

### 2.4 Production CSID API — Renewal

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/production/csids` (renewal variant, same path but uses OTP + new CSR) |
| Purpose | Renew a Production CSID by submitting a new CSR with OTP |
| Pre-requisites | Existing Compliance CSID; new OTP from FATOORA portal; new signed CSR |
| Auth | Basic Auth: Compliance CSID (`binarySecurityToken`) as Username, `secret` as Password; plus OTP in header |

**Request Headers:**
```
Authorization: Basic <Base64(binarySecurityToken:secret)>
OTP: <6-digit OTP from FATOORA portal>
accept-version: v2
Content-Type: application/json
Accept-Language: en (or ar)
```

**Request Body:**
```json
{
  "csr": "<PEM-encoded renewed CSR as string>"
}
```

**Response (200 — Valid):**
```json
{
  "requestID": "<new request ID>",
  "dispositionMessage": "ISSUED",
  "binarySecurityToken": "<Base64-encoded new production certificate>",
  "secret": "<new secret value>",
  "errors": null,
  "warnings": null
}
```

---

### 2.5 Reporting API — Single Invoice

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/invoices/reporting/single` |
| Purpose | Submit a Simplified invoice/credit note/debit note to ZATCA for reporting. Also used for Standard invoices when Clearance is disabled. |
| Pre-requisites | Production CSID from step 2.3/2.4; signed XML invoice (Simplified); Base64-encoded |
| Auth | Basic Auth: Production CSID (`binarySecurityToken`) as Username, `secret` as Password |

**Request Headers:**
```
Authorization: Basic <Base64(binarySecurityToken:secret)>
accept-version: v2
Content-Type: application/json
Accept-Language: en (or ar)
Clearance-Status: 0   (when Clearance disabled) | not required for Simplified
```

> The parameter described in the FAQ as `"authentication-certificate"` is passed as the Authorization header using Basic Auth encoding.

**Request Body:**
```json
{
  "invoiceHash": "<SHA-256 hash of signed invoice XML, Base64-encoded>",
  "uuid": "<invoice UUID>",
  "invoice": "<Base64-encoded signed invoice XML>"
}
```

**Response Codes:**

| HTTP Code | Meaning |
|-----------|---------|
| 200 OK | Accepted — no errors or warnings |
| 202 Accepted | Accepted with warning (e.g. Seller Address field error) |
| 303 See Other | Invoice is Standard but Clearance is active — use Clearance API |
| 400 Bad Request | Request invalid (missing fields, malformed) |
| 500 Internal Server Error | ZATCA backend error |

**Response Body (200):**
```json
{
  "invoiceHash": "TODO Add Invoice Hash",
  "status": "REPORTED",
  "warnings": null,
  "errors": null
}
```

**Response Body (202 — Warning):**
```json
{
  "invoiceHash": "<hash>",
  "status": "REPORTED",
  "warnings": [
    {
      "type": "WARNING",
      "code": "<warning code>",
      "message": "<warning message, e.g. Seller Address>"
    }
  ],
  "errors": null
}
```

**Response Body (400 — Error / Rejected):**
```json
{
  "invoiceHash": "<hash>",
  "status": "ERROR",
  "warnings": null,
  "errors": [
    {
      "type": "ERROR",
      "code": "<error code>",
      "message": "<error message>"
    }
  ]
}
```

---

### 2.6 Clearance API — Single Invoice

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/invoices/clearance/single` |
| Purpose | Submit a Standard invoice/credit note/debit note for Clearance. ZATCA validates, applies a cryptographic stamp and QR code, and returns the cleared XML. |
| Pre-requisites | Production CSID from step 2.3/2.4; Standard XML invoice; Base64-encoded |
| Auth | Basic Auth: Production CSID (`binarySecurityToken`) as Username, `secret` as Password |

**Request Headers:**
```
Authorization: Basic <Base64(binarySecurityToken:secret)>
accept-version: v2
Content-Type: application/json
Accept-Language: en (or ar)
Clearance-Status: 1
```

**Request Body:**
```json
{
  "invoiceHash": "<SHA-256 hash of invoice XML, Base64-encoded>",
  "uuid": "<invoice UUID>",
  "invoice": "<Base64-encoded invoice XML>"
}
```

**Response Codes:**

| HTTP Code | Meaning |
|-----------|---------|
| 200 OK | Cleared — document returned with ZATCA stamp and QR code |
| 202 Accepted | Accepted with warning (e.g. Seller Address) — document still returned with stamp/QR |
| 303 See Other | Clearance is disabled — use Reporting API instead |
| 400 Bad Request | Validation errors — invoice rejected |
| 500 Internal Server Error | ZATCA backend error |

**Response Body (200 — Cleared):**
```json
{
  "invoiceHash": "<hash>",
  "status": "CLEARED",
  "warnings": null,
  "errors": null,
  "clearedInvoice": "<Base64-encoded cleared XML with ZATCA stamp and QR code>"
}
```

**Response Body (303):**
```json
{
  "reportingStatus": "Clearance is currently disabled. Please use the Reporting API to submit Standard documents."
}
```

---

### 2.7 Compliance Invoice — Clearance Disabled Variant (Sandbox Only)

In the Sandbox, a second variant of the Compliance Invoice API exists for the case where Clearance is disabled. This accepts Standard documents for reporting purposes during compliance checks.

- Path: `/compliance/invoices` with `Clearance-Status: 0` in header (or separate endpoint per Swagger)
- Response and body: same structure as Compliance Invoice API (section 2.2)

---

## 3. Authentication

### 3.1 Basic Authentication — Format

ZATCA uses HTTP Basic Authentication for all e-invoicing API calls (Compliance Invoice, Production CSID, Reporting, Clearance).

```
Authorization: Basic <Base64EncodedString>
```

Where `<Base64EncodedString>` is the Base64 encoding of: `<username>:<password>`

### 3.2 Credentials at Each Step

| API Call | Username | Password |
|----------|----------|----------|
| Compliance CSID (obtaining CSID) | N/A — uses OTP header only | N/A |
| Compliance Invoice checks | `binarySecurityToken` (Compliance CSID) | `secret` (from Compliance CSID response) |
| Production CSID — Onboarding | `binarySecurityToken` (Compliance CSID) | `secret` (from Compliance CSID response) |
| Production CSID — Renewal | `binarySecurityToken` (Compliance CSID) | `secret` (from Compliance CSID response) |
| Reporting API | `binarySecurityToken` (Production CSID) | `secret` (from Production CSID response) |
| Clearance API | `binarySecurityToken` (Production CSID) | `secret` (from Production CSID response) |

> For Sandbox testing only: dummy username/password are shown on the Authorization screen in Swagger.

### 3.3 Version Header (Mandatory)

All V2 API calls must include:
```
accept-version: v2
```

V2 is currently the only valid version.

---

## 4. OTP (One-Time Password)

- The OTP is obtained by the **Taxpayer** from the **FATOORA portal** (production) or is simulated in the Sandbox.
- It is required for:
  - Compliance CSID API (initial onboarding — OTP proves the device is associated with the taxpayer's TIN)
  - Production CSID Renewal API
- Passed as the `OTP` header on those API calls.
- The manual does not state a specific validity duration but the OTP is single-use and time-limited (standard practice; the Security Features and Implementation Standards document has full details).
- In the Sandbox, the OTP can be any value (the system accepts dummy inputs).
- The VAT Registration Number in the CSR **must match** the TIN associated with the OTP.

---

## 5. CSR Generation

### 5.1 Overview

A Certificate Signing Request (CSR) is required to obtain a Compliance CSID. The EGS unit generates a public/private key pair, then produces a CSR embedding the public key plus metadata.

### 5.2 CSR Configuration File Fields (OpenSSL Config)

| CSR Input | Business Term | Description | Specification |
|-----------|---------------|-------------|---------------|
| `commonName` (CN) | Common Name / Asset Tracking Number | Unique name or asset tracking number of the solution unit | Free text |
| EGS Serial Number | Manufacturer/Solution Provider Name, Model/Version, Serial Number | Uniquely identifies the EGS. Format: `1-<name>\|2-<model>\|3-<serial>` | Regex: `(1-...\|2-...\|3-...)` |
| `organizationIdentifier` (OID) | VAT Registration Number | Taxpayer VAT number — must match OTP TIN | 15 digits, starts with 3, ends with 3 |
| `organizationalUnit` (OU) | Organization Unit Name | Branch name. If 11th digit of Organization Identifier ≠ 1: free text. If 11th digit = 1: must be 10-digit number (group member TIN) | Conditional |
| `organizationName` (O) | Organization/Taxpayer Name | Taxpayer legal name | Free text |
| `countryName` (C) | Country Name | ISO 2-letter country code | 2-letter (e.g. `SA`) |
| Invoice Type (Functionality Map) | Invoice Type | Document types the EGS will issue | 4-digit binary string (0/1 only, cannot all be 0) |
| `locality` | Location of Branch / EGS Unit | Address or location of branch (website URL for e-commerce) | Free text |
| Industry | Industry | Sector/industry for which invoices are generated | Free text |

### 5.3 Invoice Type (Functionality Map) — Values

Maps to `TSCZ` where:
- `T` = Standard Tax Invoice
- `S` = Simplified Tax Invoice
- `C` = Buyer QR Code
- `Z` = Seller QR code (self-billing)

| Value | Meaning |
|-------|---------|
| `1000` | Standard invoices only |
| `0100` | Simplified invoices only |
| `1100` | Both Standard and Simplified invoices |

### 5.4 EGS Serial Number Format

```
1-<ManufacturerOrSolutionProviderName>|2-<ModelOrVersion>|3-<SerialNumber>
```

Example for testing: `1-ACME|2-INVOICER-V1|3-ABC123`

### 5.5 OpenSSL Key Generation Commands

**1. Generate EC Private Key (secp256k1 / P-256):**
```bash
openssl ecparam -name secp256k1 -genkey -noout -out YourPrivateKey.pem
```

**2. Extract Public Key:**
```bash
openssl ec -in YourPrivateKey.pem -pubout -out YourPublicKey.pem
```

> Only X values (compressed public key) are used in elliptic curve operations. ECDSA keys use the secp256k1 (P-256) curve per FIPS 186. Keys must be marked non-exportable.

**3. Generate CSR:**
```bash
openssl req -new -sha256 -key YourPrivateKey.pem -out YourCSR.csr -config openssl.cnf
```

### 5.6 Key Requirements (Security)

- Key pair generated per FIPS 186
- Curve: secp256k1 (P-256)
- Validated per ECC Full or Partial Public Key Validation Routine (NIST SP 56A Rev 2, Sections 5.6.2.3.2 and 5.6.2.3.3)
- Keys must be **non-exportable** (hardware or software security module)
- Private key never shared; lost private key = certificate no longer valid

---

## 6. Compliance Checks (Onboarding / Renewal)

### 6.1 Number of Sample Documents

The manual states compliance checks involve submitting **Standard and/or Simplified invoices, credit notes, or debit notes** but does not specify an exact count in this manual. The compliance checks test:

- Standard documents when Clearance is enabled (Compliance Invoice API)
- Standard documents when Clearance is disabled (Compliance Invoice Clearance Disabled API)

> The specific number of required sample documents is defined in the XML Implementation Standards and Security Features and Implementation Standards. Developers must pass **all** compliance checks before the Production CSID is issued in Production (not enforced in Sandbox).

### 6.2 Compliance Check Pass Criteria

- All submitted compliance invoices must be valid per:
  1. UBL2 XSD compliance
  2. EN 16931 Rules subset
  3. KSA-specific Rules set (overrides EN 16931 where overlap)
  4. QR Code validation
  5. Cryptographic Stamp validation

---

## 7. Validation — Errors vs Warnings

### 7.1 Definitions

| Category | Meaning | Effect |
|----------|---------|--------|
| **ERROR** | Invoice is invalid and non-compliant | Invoice is **rejected** |
| **WARNING** | Invoice is accepted but not fully compliant | Invoice is **accepted** with warning message returned |

### 7.2 Current Warning Cases

The **only** defined warning in the current release:
- **Seller Address field error** — accepted with warning for taxpayer devices/solution units to be able to read warning messages and differentiate between warning and error responses.

### 7.3 Validations Performed

For both Reporting and Clearance APIs:
1. Compliance to UBL2 XSD schema
2. EN 16931 Rules subset
3. KSA-specific Rules set (overrides EN 16931 on overlap)
4. QR Code validation
5. Cryptographic Stamp validation

Additional checks in Production (not fully tested in Sandbox):
- Security feature validations
- Prohibited functionality checks
- Additional business rule validations
- Referential checks (Seller/Buyer information validation)
- Validation against previously submitted documents

---

## 8. Response Code Reference

### Reporting API (`/invoices/reporting/single`)

| Code | Description |
|------|-------------|
| 200 | HTTP OK — invoice accepted, no errors or warnings |
| 202 | Accepted with Errors — simplified invoice accepted with warning |
| 303 | HTTP See Other — Standard invoice submitted while Clearance is active; use Clearance API |
| 400 | HTTP Bad Request — submitted request is invalid |
| 500 | HTTP Internal Server Error — ZATCA backend error |

### Clearance API (`/invoices/clearance/single`)

| Code | Description |
|------|-------------|
| 200 | HTTP OK — invoice cleared; returned with ZATCA stamp and QR code |
| 202 | Accepted with Errors — clearance invoice accepted with warning; returned with stamp/QR |
| 303 | HTTP See Other — Clearance is disabled; use Reporting API |
| 400 | HTTP Bad Request — submitted request is invalid |
| 500 | HTTP Internal Server Error — ZATCA backend error |

---

## 9. Certificate Validity and Renewal

### 9.1 Certificate Types

| Certificate | Issuer | Purpose |
|-------------|--------|---------|
| Compliance CSID | ZATCA E-invoicing Platform (self-signed) | Intermediate; used only for compliance checks and obtaining Production CSID |
| Production CSID | ZATCA CA | Used for all Reporting and Clearance API authentication; cryptographically signs Simplified Invoices |

### 9.2 Renewal

- Production CSID renewal is done via the **Production CSID Renewal API** (section 2.4).
- Requires: a new OTP from the FATOORA portal + a new signed CSR.
- Compliance checks **are also required** again as part of renewal (same flow as initial onboarding).
- The manual does not state a specific certificate validity period. Refer to the Security Features and Implementation Standards document for expiry details.

### 9.3 CSID Scope

- One CSID per EGS unit per VAT Registration Number.
- A single CSID cannot be shared across multiple VAT Registration Numbers.
- For every unique VAT Registration Number used, a separate CSID must be requested.
- VAT Registration Numbers used in the Sandbox can be dummy values as long as they meet the format: **15 digits, starting with 3, ending with 3**.

---

## 10. Worked Request/Response Examples

### 10.1 Reporting API — Success (200)

**Request:**
```
POST /invoices/reporting/single
Authorization: Basic <Base64(ProductionCSID:Secret)>
accept-version: v2
Content-Type: application/json
Accept-Language: en

{
  "invoiceHash": "<SHA-256 hash Base64-encoded>",
  "uuid": "<invoice UUID>",
  "invoice": "<Base64-encoded signed simplified invoice XML>"
}
```

**Response:**
```json
{
  "invoiceHash": "TODO Add Invoice Hash",
  "status": "REPORTED",
  "warnings": null,
  "errors": null
}
```

### 10.2 Clearance API — Success (200)

**Request:**
```
POST /invoices/clearance/single
Authorization: Basic <Base64(ProductionCSID:Secret)>
accept-version: v2
Content-Type: application/json
Accept-Language: en
Clearance-Status: 1

{
  "invoiceHash": "<SHA-256 hash Base64-encoded>",
  "uuid": "<invoice UUID>",
  "invoice": "<Base64-encoded standard invoice XML>"
}
```

**Response:**
```json
{
  "invoiceHash": "TODO Add Invoice Hash",
  "status": "CLEARED",
  "warnings": null,
  "errors": null,
  "clearedInvoice": "<Base64-encoded XML with ZATCA stamp and QR code>"
}
```

### 10.3 Reporting API — Accepted with Warning (202)

```json
{
  "invoiceHash": "<hash>",
  "status": "REPORTED",
  "warnings": [{ "type": "WARNING", "code": "...", "message": "Seller Address ..." }],
  "errors": null
}
```

### 10.4 Clearance API — Clearance Disabled (303)

```json
{
  "reportingStatus": "Clearance is currently disabled. Please use the Reporting API to submit Standard documents."
}
```

---

## 11. SDK CLI Commands Reference

The Compliance and Enablement Toolbox SDK (Java JAR, JDK 11–14) provides a CLI tool called `fatoora`:

```bash
# Sign invoice and generate QR, returns hash
fatoora -sign -qr -invoice invoiceName.xml -signedinvoice signedinvoiceName.xml

# Generate hash only (optional)
fatoora -generateHash -invoice invoiceName.xml

# Validate XML
fatoora validatexml -f invoiceName.xml
```

Steps before API submission:
1. Generate compliant XML invoice
2. Sign with `fatoora -sign` (returns invoice hash)
3. Base64-encode the signed XML
4. Submit `invoiceHash` + `uuid` + Base64-encoded `invoice` to the API

SDK download: `https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx`

---

## 12. API Flow Summary (End-to-End)

```
1. GENERATE KEY PAIR
   openssl ecparam (secp256k1) → PrivateKey.pem + PublicKey.pem

2. GENERATE CSR
   openssl req -new -sha256 → CSR.pem
   (Must include: CN, EGS serial, VAT number, org unit, org name, country, invoice type, location, industry)

3. GET OTP
   Taxpayer logs into FATOORA portal → receives OTP

4. COMPLIANCE CSID  [POST /compliance]
   Headers: OTP: <otp>, accept-version: v2
   Body: { "csr": "<pem>" }
   Response: binarySecurityToken + secret + requestID

5. COMPLIANCE CHECKS  [POST /compliance/invoices]  × N times
   Headers: Authorization: Basic <b64(token:secret)>, accept-version: v2
   Body: { "invoiceHash": "...", "uuid": "...", "invoice": "..." }
   (Must pass all checks before step 6 in Production)

6. PRODUCTION CSID  [POST /production/csids]
   Headers: Authorization: Basic <b64(token:secret)>, accept-version: v2
   Body: { "compliance_request_id": "<requestID from step 4>" }
   Response: new binarySecurityToken + secret (Production CSID)

7a. REPORT SIMPLIFIED INVOICE  [POST /invoices/reporting/single]
    Headers: Authorization: Basic <b64(prodToken:prodSecret)>, accept-version: v2
    Body: { "invoiceHash": "...", "uuid": "...", "invoice": "<base64 signed XML>" }
    Success: 200 { status: "REPORTED" }

7b. CLEAR STANDARD INVOICE  [POST /invoices/clearance/single]
    Headers: Authorization: Basic <b64(prodToken:prodSecret)>, accept-version: v2, Clearance-Status: 1
    Body: { "invoiceHash": "...", "uuid": "...", "invoice": "<base64 XML>" }
    Success: 200 { status: "CLEARED", clearedInvoice: "<base64 stamped XML>" }

8. RENEWAL (when Production CSID expires)
   Repeat steps 3, 4, 5 → then POST /production/csids with OTP + new CSR
```

---

## 13. Additional Notes

- **VAT Registration Number format:** 15 digits, starting with 3, ending with 3 (e.g. `300000000000003`). Dummy values can be used in Sandbox.
- **Invoice type per CSID:** The VAT Registration Number in the CSID must match the VRN in all subsequent invoice submissions made using that CSID.
- **Web Based Validator** (no auth required): can validate up to 5 XMLs; validates structure, fields, KSA rules; checks Previous Document Hash in sequence for multiple XMLs.
- **Swagger files:** Full API specs are accessible from the Integration Sandbox page within the Developer Portal (login required).
- **Support:** Developer Portal Support page (no login required); phone, international phone, email available.
- **Document types relevant to Compliance Checks:** Standard Tax Invoice (T), Simplified Tax Invoice (S), Credit Notes, Debit Notes.
- The manual does **not** specify rate limits or explicit timeout values. Refer to Swagger files and Security Features Implementation Standards for operational limits.
- This document is Version 3, Nov 2022 — check zatca.gov.sa for later versions.
