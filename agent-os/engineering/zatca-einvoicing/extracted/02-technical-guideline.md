# ZATCA E-Invoicing Detailed Technical Guideline — Extracted Reference

**Source:** E-invoicing Detailed Technical Guidelines, Version 2, November 2022  
**Purpose:** Implementation reference for the E-invoice Generation Solution (EGS) builder  
**Coverage:** Full 81-page extraction — onboarding, signing, QR, clearance, reporting, CSR, CSID lifecycle

---

## 1. Overview & Phases

### Phase 1 — Generation Phase
- Effective: 4 December 2021
- Taxpayers generate electronic invoices per ZATCA specifications (no ZATCA integration required)

### Phase 2 — Integration Phase
- Starting: 1 January 2023 (rolled out in waves by taxpayer group, 6-month advance notice)
- **Standard (B2B) tax invoices → Clearance model**
- **Simplified (B2C) tax invoices → Reporting model**

### FATOORA Platform
ZATCA's central platform. Receives XML documents via API, validates, stamps (for clearance), stores, and returns outcomes.

---

## 2. Document Types and Invoice Type Codes

### Functionality Map (used in CSR and CSID)

Encoded as a 4-character string `TSXY`:
- `T` = Standard Tax Invoice supported (1=yes, 0=no)
- `S` = Simplified Tax Invoice supported (1=yes, 0=no)
- `X` = future use, set to 0
- `Y` = future use, set to 0

| Functionality Map | Meaning |
|---|---|
| `1000` | Standard (B2B) invoices only |
| `0100` | Simplified (B2C) invoices only |
| `1100` | Both Standard and Simplified |

### Document Sub-types
- **Standard Documents (B2B):** Standard Tax Invoice + Standard Credit Note + Standard Debit Note
- **Simplified Documents (B2C):** Simplified Tax Invoice + Simplified Credit Note + Simplified Debit Note

**Note:** The guide refers to document type codes (1000/0100/1100) in the context of the CSR Functionality Map, not inline XML type codes. XML document type codes (UBL type code 388/381/383) are defined in the XML Implementation Standards (separate document referenced but not reproduced here).

---

## 3. XML Format

### Submission Format
- All documents submitted to ZATCA **must be in XML format**, not PDF/A-3 format
- XML must conform to UBL 2.1 KSA standard (see: XML Implementation Standards document)
- Documents include UBL extensions for signatures and QR

### Key XML Namespaces (inferred from XPaths in signing section)
- `ext:` → UBL Extensions namespace
- `sig:` → UBL Document Signatures namespace  
- `sac:` → Signature Additional Content namespace
- `ds:` → XML Digital Signature namespace (xmldsig)
- `xades:` → XAdES namespace
- `cac:` → Common Aggregate Components
- `cbc:` → Common Basic Components

### Key XPaths for QR Code Data Extraction

| QR Tag | XPath |
|---|---|
| Seller name (Tag 1) | `/Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName` |
| Seller VAT number (Tag 2) | `/Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID` |
| Invoice timestamp (Tag 3) | `/Invoice/cbc:IssueDate` + `/Invoice/cbc:IssueTime` → combined as `yyyy-MM-dd'T'HH:mm:ss'Z'` |
| Invoice total incl. VAT (Tag 4) | `/Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount` |
| VAT total (Tag 5) | `/Invoice/cac:TaxTotal/cbc:TaxAmount` |
| Invoice hash (Tag 6) | `/Invoice/ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent/sig:UBLDocumentSignatures/sac:SignatureInformation/ds:Signature/ds:SignedInfo/ds:Reference/ds:DigestValue` |
| ECDSA signature (Tag 7) | `/Invoice/ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent/sig:UBLDocumentSignatures/sac:SignatureInformation/ds:Signature/ds:SignatureValue` |
| ECDSA public key / certificate (Tag 8) | `/Invoice/ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent/sig:UBLDocumentSignatures/sac:SignatureInformation/ds:Signature/ds:KeyInfo/ds:X509Data/ds:X509Certificate` |
| ZATCA stamp of EGS cert (Tag 9 — Simplified only) | `/Invoice/UBLExtensions/UBLExtension/ExtensionContent/UBLDocumentSignatures/SignatureInformation/Signature/KeyInfo/X509Data/X509Certificate` (the ECDSA signature of the cryptographic stamp's public key by ZATCA's technical CA — extracted from the PCSID; specifically the `Signature Algorithm: ecdsa-with-SHA256` field decoded from the certificate) |

---

## 4. Signing Process — Complete Step-by-Step

### 4.1 Hashing Algorithm
**SHA-256** is the mandatory hash algorithm.
- Output: 256 bits / 32 bytes, displayed as 64 alphanumeric hex characters
- Encoding: hex output then Base64-encoded (hex-to-Base64 encoder)

### 4.2 XML Canonicalization
**C14N 1.1** (`C14N11`) is the canonicalization standard used before hashing the invoice XML.

### 4.3 Tags to Remove Before Hashing the Invoice (Step 1)

| Tag | XPath |
|---|---|
| UBLExtensions | `*[local-name()='Invoice']//*[local-name()='UBLExtensions']` |
| QR | `//*[local-name()='AdditionalDocumentReference'][cbc:ID[normalize-space(text()) = 'QR']]` |
| Signature | `*[local-name()='Invoice']//*[local-name()='Signature']` |

### 4.4 Full Signing Steps

#### Step 1: Generate Invoice Hash
1. Open invoice XML
2. Remove `UBLExtensions`, `QR`, and `Signature` tags (XPaths above)
3. Remove XML version declaration
4. Canonicalize using **C14N 1.1**
5. Hash the canonicalized body using **SHA-256** → 64 hex chars  
   Example: `a11b6fe587a50f7daffe3a7fb42dcccf32b43ee9b37d9f252d04243e54c11a3f`
6. Base64-encode the hex-encoded hash (hex-to-Base64)  
   Example: `oRtv5YelD32v/jp/tC3MzzK0PumzfZ8lLQQkPlTBGj8=`

**Note:** The raw (not Base64-encoded) hash is used as input to signing in Step 2.

#### Step 2: Generate Digital Signature
1. Sign the **raw SHA-256 hash from Step 1** (not Base64-encoded) with **ECDSA** using the EGS private key
2. Output is a Base64-encoded DER signature  
   Example: `MEQCIGvLa1f3uMCe0AidKUWJ5ghMiDMRcC0qO78ntcTKVOYgAiAKBkX+uuFhbIcye3JznNa45qH1twlLFu/qPzEQ9HMNLw==`

**Key generation command:**  
```bash
openssl ecparam -name secp256k1 -genkey -noout -out PrivateKey.pem
openssl ec -in PrivateKey.pem -pubout -conv_form compressed -out PublicKey.pem
```

> **CRITICAL:** The OpenSSL command shown uses **`secp256k1`** (Bitcoin curve), NOT secp256r1/P-256.

#### Step 3: Generate Certificate Hash
1. Hash the EGS certificate (DER bytes) using SHA-256  
   Example hex: `69a95fc237b42714dc4457a33b94cc452fd9f110504c683c401144d9544894fb`
2. Base64-encode the hex output  
   Example: `NjlhOTVmYzIzN2I0MjcxNGRjNDQ1N2EzM2I5NGNjNDUyZmQ5ZjExMDUwNGM2ODNjNDAxMTQ0ZDk1NDQ4OTRmYg==`

#### Step 4: Populate Signed Properties
1. Use the **original invoice XML** (not the one stripped in Step 1)
2. Remove `UBLExtensions`, `QR`, `Signature` tags
3. Re-insert these tags empty (to be populated)
4. Fill in the following fields using XPaths:

| Field | Value | XPath |
|---|---|---|
| `DigestValue` (cert hash) | Base64-encoded cert hash from Step 3 | `.../xades:SignedProperties/xades:SignedSignatureProperties/xades:SigningCertificate/xades:Cert/xades:CertDigest/ds:DigestValue` |
| `SigningTime` | Current datetime (signing timestamp) | `.../xades:SignedProperties/xades:SignedSignatureProperties/xades:SigningTime` |
| `X509IssuerName` | Certificate issuer name (from decoded cert) | `.../xades:IssuerSerial/ds:X509IssuerName` |
| `X509SerialNumber` | Certificate serial number (from decoded cert) | `.../xades:IssuerSerial/ds:X509SerialNumber` |

Full XPath base:  
`/Invoice/ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent/sig:UBLDocumentSignatures/sac:SignatureInformation/ds:Signature/ds:Object/xades:QualifyingProperties/xades:SignedProperties/xades:SignedSignatureProperties/xades:SigningCertificate/xades:Cert/...`

#### Step 5: Generate Signed Properties Hash
1. Extract the `xades:SignedProperties` tag using XPath:  
   `/Invoice/ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent/sig:UBLDocumentSignatures/sac:SignatureInformation/ds:Signature/ds:Object/xades:QualifyingProperties/xades:SignedProperties`
2. Linearize the XML block (remove spaces)
3. Hash using **SHA-256** → hex  
   Example: `99282555b5d79209be5883cc23eb234cd01bd33ea7d54d88f491248d33e321f1`
4. Base64-encode the hex output  
   Example: `mSglVbXXkgm+WIPmI+sjTNAb0z6n1U2I9JEkjTPjIfE=`

#### Step 6: Populate UBL Extensions Output
Using the invoice from Step 4, fill in:

| Field | Value | XPath |
|---|---|---|
| `SignatureValue` | ECDSA digital signature from Step 2 | `.../ds:Signature/ds:SignatureValue` |
| `X509Certificate` | The EGS certificate (PEM without headers) | `.../ds:Signature/ds:KeyInfo/ds:X509Data/ds:X509Certificate` |
| `DigestValue` (signed properties) | Base64-encoded signed-properties hash from Step 5 | `.../ds:SignedInfo/ds:Reference[@URI='#xadesSignedProperties']/ds:DigestValue` |
| `DigestValue` (invoice) | Base64-encoded invoice hash from Step 1 | `.../ds:SignedInfo/ds:Reference[@Id='invoiceSignedData']/ds:DigestValue` |

After Step 6, proceed to QR code generation (Section 6).

### 4.5 Signature Standard (XAdES)
The signing uses the **XAdES** standard with `xades:QualifyingProperties` / `xades:SignedProperties` structure — this is **XAdES-BES** (Basic Electronic Signature) profile based on the XML structure observed. No explicit mention of EPES in this document.

### 4.6 OpenSSL Reference Commands
```bash
# Hash
openssl dgst -sha256 <xml_file_name>

# Generate private key (secp256k1)
openssl ecparam -name secp256k1 -genkey -noout -out PrivateKey.pem

# Generate public key (compressed)
openssl ec -in PrivateKey.pem -pubout -conv_form compressed -out PublicKey.pem

# Generate CSR
openssl req -new -sha256 -key privateKey.pem -extensions v3_req -config config.cnf -out taxpayer.csr
```

---

## 5. Invoice Hash / PIH (Previous Invoice Hash) Chain

### Hash Chain Rules
- Every document must include the **Previous Document Hash (PDH)** — also called Previous Invoice Hash (PIH)
- PDH = hash of the **last document generated** prior to the current document's generation
- **The hash chain covers ALL documents** (Standard and Simplified) from a single EGS in one unified sequence
- Rejected documents still have their hash recorded by ZATCA — the next document's PDH must reference the rejected document's hash (not skip it)
- Documents need not be **submitted** in sequence; they must only be **generated** in sequence with correct PDH linkage
- The PDH of the very first document: **not specified in this document** — refer to XML Implementation Standards / Security Features documents

### Hash Chain Interaction with Errors
- Scenario: Doc 1 accepted → Doc 2 accepted → Doc 3 accepted → Doc 2 rejected; re-submit corrected version  
  **Resubmitted Doc 2's PDH = hash of Doc 3** (last generated), NOT hash of Doc 1
- Doc 3's PDH must be hash of original Doc 2 even though Doc 2 was rejected
- UUID and ICV must NOT be reused after rejection; new document gets a new UUID and ICV

### Base Value for PIH (First Invoice)
The document states that the PIH must point to the immediately preceding generated document. The first document's PIH (base/seed value) is not defined in this guide — it is defined in the XML Implementation Standards / Security Features documents.

---

## 6. UUID and ICV (Invoice Counter Value)

### UUID
- Every document must have a unique UUID
- After rejection, UUID must NOT be reused
- ZATCA identifies documents using UUID + hash

### ICV (Invoice Counter Value)
- Monotonically incrementing counter per EGS unit
- An ICV once assigned to a document **cannot be reused** even if the document is rejected
- New document (including resubmissions of rejected docs) gets a new ICV
- No gap filling: each document consumes one ICV permanently
- Backend (not real-time) validation of sequence — gaps trigger investigation and potential penalties

---

## 7. Onboarding Flow

### 7.1 Prerequisites
- Taxpayer must be VAT-registered on FATOORA Portal (ERAD) with TRN status "Active" or "Reactive"
- New VAT registrations: must wait **2 business days** before onboarding

### 7.2 Step-by-Step Onboarding

```
1. Taxpayer → FATOORA Portal (via ERAD SSO)
2. Generate OTP(s) — up to 100 OTPs per request, valid for 1 hour
3. Enter OTP into EGS (manually or automatically via HTTPS header)
4. EGS generates CSR + public/private key pair
5. EGS sends CSR to FATOORA Platform → receives Compliance CSID
6. EGS submits compliance check invoices (see §7.3)
7. On pass: ZATCA CA generates Production CSID → returned to EGS
```

### 7.3 CSR Fields (ALL MANDATORY)

| Field | Business Term | Specification |
|---|---|---|
| `Common Name` (CN) | Name or Asset Tracking Number | Free text |
| `EGS Serial Number` | Manufacturer\|Model/Version\|SerialNumber (pipe-delimited) | Free text. Example format: `1-hay\|2-23\|3-35435` meaning `1-ProviderName\|2-ModelVersion\|3-SerialNumber` |
| `Organization Identifier` (OID) | VAT or Group VAT Registration Number | 15 digits, starts and ends with `3` |
| `Organization Unit Name` (OU) | Branch name (individual) OR 10-digit TIN of group member (VAT group) | Free text (individual) / 10-digit number (group, when 11th digit of Org ID = 1) |
| `Organization Name` (O) | Taxpayer name | Free text |
| `Country Name` (C) | Country | ISO 3166 Alpha-2 (e.g., `SA`) |
| `Invoice Type` | Functionality Map | `TSXY` string: `1000`, `0100`, or `1100` (X and Y = 0 for now) |
| `Location` | Branch/EGS address (Saudi National Address format preferred) | Free text |
| `Industry` | Industry/sector | Free text |

**CSR generation command:**
```bash
openssl req -new -sha256 -key privateKey.pem -extensions v3_req -config config.cnf -out taxpayer.csr
```

### 7.4 Compliance CSID vs Production CSID

| | Compliance CSID | Production CSID |
|---|---|---|
| Issued by | FATOORA Platform (self-signed) | ZATCA CA |
| Purpose | Authenticate compliance check API calls | Authenticate all production APIs (reporting, clearance, renewal) |
| Lifetime | Temporary (compliance phase only) | Multiple years |
| Used as | Request header for compliance check APIs | Request header for all core e-invoicing APIs |

### 7.5 Compliance Checks (Sample Invoices Required)

**Based on Invoice Type (Functionality Map) in the CSR:**

| Functionality Map | Required Compliance Invoices |
|---|---|
| `1000` (Standard only) | 3 invoices: Standard Tax Invoice + Standard Debit Note + Standard Credit Note |
| `0100` (Simplified only) | 3 invoices: Simplified Tax Invoice + Simplified Debit Note + Simplified Credit Note |
| `1100` (Both) | 6 invoices: all 3 standard + all 3 simplified |

**Total: 3 or 6 sample invoices** depending on functionality map.

If any compliance check fails, the EGS must restart onboarding from Step 1 (new OTP + new CSR).

### 7.6 Renewal
- Same process as first-time onboarding
- During renewal, ZATCA CA **revokes the existing CSID** and issues a new one
- Request type differs (renewal flag in the request)

### 7.7 Revocation Triggers
Manual (by taxpayer): compromised key, EGS sold/discontinued, incorrect info, EGS lost/stolen, unauthorized onboarding, major upgrade  
Automatic (by ZATCA): VAT deregistration/suspension, VAT group creation/membership change/disbandment/representative change

---

## 8. Reporting vs Clearance

### Reporting (Simplified / B2C)
- Applies to: Simplified Tax Invoice, Simplified Credit Note, Simplified Debit Note
- **EGS stamps the document itself** (ZATCA does NOT stamp simplified documents)
- EGS must include its own cryptographic stamp + QR code before submission
- Submission deadline: **within 24 hours** of transaction
- API: Reporting API
- No real-time blocking — transaction proceeds even if reporting fails
- Outcomes: Valid (confirmation) / Accepted with warnings (confirmation + warnings) / Invalid (rejection + errors)

### Clearance (Standard / B2B)
- Applies to: Standard Tax Invoice, Standard Credit Note, Standard Debit Note
- **Standard document is only valid if it has been cleared by ZATCA**
- Seller must submit BEFORE providing document to buyer (clearance is a blocking prerequisite)
- Exception: Self-billing — submitted by Buyer (requires ZATCA-approved self-billing agreement)
- EGS may optionally include its own cryptographic stamp + QR; ZATCA will ADD its own stamp on top
- API: Clearance API
- ZATCA stamps the document and updates the QR code; returns cleared document to EGS
- Outcomes: Valid + ZATCA stamp returned / Accepted with warnings + stamp returned / Rejected + errors

### What ZATCA Returns

| Outcome | Standard (B2B) — Clearance | Simplified (B2C) — Reporting |
|---|---|---|
| Valid | Document + ZATCA stamp + QR code string | Confirmation only (no stamp added by ZATCA) |
| Accepted (warnings) | Document + ZATCA stamp + QR code + warning messages | Confirmation + warning messages |
| Invalid | Rejection + error message(s) | Rejection + error message(s) |

### Clearance Disabled Scenario
- When clearance is disabled by ZATCA: Standard documents submitted to Clearance API receive **HTTP 303** response
- Taxpayer must then submit Standard documents via the Reporting API
- No ZATCA stamp or QR returned; document is "Reported" not "Cleared"

### Generation Independence
- **Do not wait for clearance before generating the next invoice** — ZATCA's stamp is NOT part of the invoice hash
- Documents can be generated continuously; submission order does not need to match generation order

---

## 9. QR Code

### Structure
- Format: **TLV (Tag-Length-Value)** encoded, then **Base64-encoded**
- Maximum: ~700 characters in the Base64-encoded QR content
- Encoding rules: BER (Basic Encoding Rules, simple version of ASN.1)
  - Tag: 1 byte (binary, not ASCII)
  - Length: 1 byte (byte count of the UTF-8 encoded value)
  - Value: UTF-8 encoded bytes of the field value

### QR Code Fields

| Tag # | Description | Enforcement |
|---|---|---|
| 1 | Seller's name | Phase 1 (Dec 4, 2021) |
| 2 | VAT registration number of seller | Phase 1 |
| 3 | Invoice timestamp (date + time, format: `yyyy-MM-ddTHH:mm:ssZ`) | Phase 1 |
| 4 | Invoice total (with VAT) | Phase 1 |
| 5 | VAT total | Phase 1 |
| 6 | Hash of XML invoice (Base64-encoded) | Phase 2 (Jan 1, 2023+) |
| 7 | ECDSA signature (Base64-encoded) | Phase 2 |
| 8 | ECDSA public key / X.509 certificate (Base64-encoded DER) | Phase 2 |
| 9 | ZATCA CA's ECDSA signature of EGS cert public key (Simplified invoices only) | Phase 2 |

### Tag 9 Value — How to Get It
1. Obtain the device's PCSID (Production CSID from onboarding)
2. Decode the PCSID certificate (e.g., using certlogik.com/decoder/)
3. Copy the value of `Signature Algorithm: ecdsa-with-SHA256` field
4. Use that value as Tag 9 in the QR

### Common QR Code Mistakes
- Tag and Length are **binary values**, not ASCII. Example: value 21 decimal = `0x15` hex (one byte `15`), NOT the string "21" which would be two bytes `32 31`
- Value must also be converted to hex bytes before encoding to Base64
- No padding or separators between TLV sets
- Must use UTF-8 encoding for Arabic text

### Example TLV QR (Hex Representation)
```
01 17 [seller name bytes]
02 0f [VAT reg bytes - 15 digits]
03 14 [timestamp bytes - 20 chars]
04 07 [total incl VAT bytes]
05 05 [VAT total bytes]
06 2c [invoice hash Base64 bytes]
07 60 [ECDSA signature bytes]
08 58 [public key / cert bytes]
09 90 [ZATCA CA signature bytes - simplified only]
```

---

## 10. CSID Certificate — Details

- A CSID is technically an **X.509 public key certificate** (identity/public-key certificate)
- Uniquely identifies one EGS unit for one taxpayer
- Used for:
  1. Cryptographically signing Simplified (B2C) invoices
  2. Authenticating to Reporting and Clearance APIs
- **One CSID per EGS unit**, and **one CSID per unique sequence of documents** (centralized server)
- Validity: multiple years once issued

### CSID in API Authentication
- The Production CSID is passed as a **request header** in all core e-invoicing API calls
- The Compliance CSID is passed as a **request header** in compliance check API calls

---

## 11. API Endpoints

The document references the following APIs by name. **Exact base URLs, request/response schemas, and headers are defined in the separate API Documentation** (linked but not reproduced in this guide). Key API types:

| API | Purpose | CSID Type Required |
|---|---|---|
| Compliance CSID API | Send CSR, receive Compliance CSID | None (OTP in header) |
| Compliance Checks API | Submit 3 or 6 sample invoices for compliance validation | Compliance CSID |
| Production CSID API | After compliance pass — receive Production CSID | Compliance CSID |
| Clearance API | Submit Standard (B2B) invoices for real-time clearance | Production CSID |
| Reporting API | Submit Simplified (B2C) invoices (also Standard when clearance disabled) | Production CSID |
| Renewal API | Renew existing CSID (same flow as onboarding) | Production CSID |

### HTTP Response Codes Referenced
- **202** — Accepted with warnings ("202 - Accepted with warnings")
- **303** — Clearance disabled (must use Reporting API instead)
- **400** — Rejection / invalid document error

### Sandbox
- Accessible globally (not KSA-only)
- Anyone can access Sandbox (no production credentials required)
- Used to simulate onboarding + clearance/reporting API calls

---

## 12. Sequencing and Concurrency Rules

- Documents must be **generated** in a single sequence per EGS
- The sequence covers BOTH Standard and Simplified documents together (not separate sequences)
- **Submission** order to ZATCA can differ from generation order (ZATCA validates sequence in the backend, not in real-time)
- Example: Invoices 1, 2, 3 generated in order → can be submitted as 3, 1, 2 (as long as Standard clearance timing requirements met)
- Gaps in sequence detected during backend validation → investigation → potential penalties
- **No bulk reporting** — currently no option to submit multiple Simplified invoices in one API call; one at a time

---

## 13. VAT Group Specifics

- Group representative conducts all onboarding via FATOORA Portal
- Only group representative has portal access (not individual members)
- CSR fields for group:
  - `Organization Identifier` = Group VAT Registration Number (15 digits)
  - `Organization Unit Name` = 10-digit TIN of the specific group member whose EGS is being onboarded
- Each group member's device = separate CSID
- When joining/leaving a group, existing individual CSIDs are automatically revoked by ZATCA

---

## 14. Common Scenarios and Architecture

### Centralized Server (Cloud or On-Premise)
- One CSID per taxpayer AND one CSID per unique document sequence on the server
- Server handles both signing and API authentication

### Smart POS Devices (Branch-Based, each issuing + sending)
- One CSID per POS device

### Dumb Terminal POS + Branch Server + Central Sending Server
- No CSID on POS devices
- CSID on branch server (for signing)
- CSID on central sending server (for API authentication)

### Dumb Terminal POS — Central Server Signs + Sends
- No CSID on POS device
- Server must stamp + apply QR before presenting invoice to customer
- Standard (B2B): must be submitted and cleared before completion

---

## 15. Invoice Language
- **Arabic is mandatory** for all human-readable fields on invoices
- Bilingual (Arabic + English) is permitted

---

## 16. Referenced External Documents (Not Reproduced Here)

This guide references but does not contain the following — these must be read separately:

1. E-invoicing Regulation
2. E-invoicing Implementation Resolution
3. Data Dictionary
4. **XML Implementation Standards** ← XML schema, element-level validation rules, type codes (388/381/383)
5. **Security Features and Implementation Standards** ← PIH seed value, detailed crypto specs, OIDs
6. **API Documentation** ← Exact API base URLs, request/response shapes, headers, auth tokens

---

## 17. Tools and Resources

| Tool | URL / Command |
|---|---|
| XML Canonical online | http://www.soapclient.com/xmlcanon.html |
| XPath tester | http://xpather.com/ |
| SHA-256 hash | https://emn178.github.io/online-tools/sha256.html |
| Hex to Base64 | https://base64.guru/converter/encode/hex |
| Base64 encoder | https://www.base64encode.org/ |
| ECDSA sign/verify | https://8gwifi.org/ecsignverify.jsp |
| CSR/cert decoder | https://certlogik.com/decoder/ |
| TLV QR decoder | https://emvlab.org/tlvutils/ |
| SDK download | https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx |
| SDK CLI — validate QR | `fatoorah validateqr -qr` |
| SDK CLI — generate QR | `fatoorah generate -f (Invoicename.xml) -q` |
| SDK CLI — version | `fatoorah -v` |
| Failure notification | https://zatca.gov.sa/en/E-Invoicing/FailureNotifications/Pages/VerifyTaxpayer.aspx |

---

## 18. Error Handling and Edge Cases

### CSR Errors
- Invalid/non-numeric/not-6-digit OTP
- OTP not matching the taxpayer's TRN (OTP generated for different taxpayer)
- OTP expired (>1 hour)
- Invalid VAT Registration Number
- Invalid request type
- Missing CSR fields
- Wrong algorithm in CSR

### Compliance Check Errors
- Invalid documents/inputs
- Missing/invalid/expired Compliance CSID

### Invoice Rejection Behaviour
- ZATCA **stores the hash of rejected documents** — the rejection is in the record
- Next document's PDH must be hash of last generated (which may be a rejected document)
- UUID and ICV of rejected document must NOT be reused
- For Standard (B2B): rejected → fix → new document with new UUID, ICV, timestamp, PDH pointing to last generated
- For Simplified (B2C): rejected → fix + correct future submissions; already-issued customer copy does not need reissuing; include in VAT return regardless

### Duplicate Submission
- ZATCA does not reject duplicates at submission time
- However, ZATCA considers each invoice only once based on unique UUID + hash
- Taxpayer must investigate and resolve duplication proactively

---

## 19. Glossary

| Abbreviation | Meaning |
|---|---|
| ZATCA | Zakat, Tax and Customs Authority |
| FATOORA | ZATCA's e-invoicing platform |
| EGS | E-invoice Generation Solution (Unit) |
| CSID | Cryptographic Stamp Identifier (X.509 certificate) |
| PCSID | Production Cryptographic Stamp Identifier |
| CSR | Certificate Signing Request |
| OTP | One-Time Password |
| ICV | Invoice Counter Value |
| PDH / PIH | Previous Document Hash / Previous Invoice Hash |
| TLV | Tag-Length-Value |
| TRN | Tax Registration Number |
| PKI | Public Key Infrastructure |
| CA | Certificate Authority |
| SSO | Single Sign On |
| ERAD | ZATCA's taxpayer taxation portal |
| CN | Credit Note |
| DN | Debit Note |
