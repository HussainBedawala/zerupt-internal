# ZATCA Electronic Invoice Security Features — Extracted Technical Reference

Source: **Security Features Implementation Standards to the E-Invoicing Resolution dated 2022-06-24**
Document version: 1.1 (updated 2022-06-24)

---

## 1. Governing Standards

The security requirements are based on:

1. **ETSI EN 319 132-1** — XAdES technical digital signatures; Part 1: Building blocks and XAdES baseline technical signatures
2. **ETSI EN 319 142-1** — PAdES technical digital signatures; Part 1: Building blocks and PAdES baseline technical signatures
3. **W3C Recommendation** — XML-Signature Syntax and Processing
4. **ETSI EN 319 122-1** — CAdES digital signatures; Part 1: Building blocks and CAdES baseline signatures
5. **IETF RFC 5035 (2007)** — Enhanced Security Services (ESS) Update: Adding CertID Algorithm Agility
6. **ISO 32000-1** — Document management — Portable document format — Part 1: PDF 1.7
7. **IETF RFC 5652 (2009)** — Cryptographic Message Syntax (CMS)
8. **RFC 6749** — OAuth 2 Authentication (Basic Authentication)

Compliance principles align with:
- NCA's National Cryptographic Standards (NCS-1:2020)
- NCDC's Digital Signing Policy (Version 1.1:2020)

---

## 2. Cryptographic Algorithms (Req. 16)

```
Hashing algorithm:          SHA-256
Asymmetric key algorithm:   ECDSA
Key length:                 256 bits
Curve:                      P-256 (secp256r1 / prime256v1)
```

> **Curve confirmation:** The certificate profile table (§2.2.2) states `Public Key — Key length: P-256`. This is **secp256r1** (NIST P-256), NOT secp256k1 (Bitcoin curve). This is confirmed by the FIPS 186 key generation requirement.

---

## 3. Cryptographic Stamp (Digital Signature)

### 3.1 Signature Type (Req. 10)

- **XML invoices:** XAdES digital signature per ETSI EN 319 132-1
- **PDF/A-3 invoices (embedded XML):** PAdES digital signature per ETSI EN 319 142-1

### 3.2 Signature Profile / Level (Req. 15)

> "For PAdES and XAdES, the **signature level should be B-B**."

B-B = Baseline-Basic. This is **XAdES-B-B** (equivalent to XAdES-BES) — the baseline profile with only mandatory qualifying properties. NOT XAdES-EPES (no explicit policy OID is required for the signature level itself, though `SignaturePolicyIdentifier` is present in `SignedSignatureProperties`).

### 3.3 Signature Packaging (Req. 11)

- **XAdES:** Enveloped signature (the signature is a sub-element of the signed XML document)
- **PAdES:** Enveloped signature (the only supported form)

### 3.4 Data to be Signed (Req. 12)

- **XML format:** The **whole XML content** is covered by the signature, **except** the QR-code data element.
- **PDF/A-3 format:** The entire PDF/A-3 file including the attached XML invoice must be covered. The XML invoice is embedded per ISO 19005-3.

---

## 4. XAdES Structure (§2.3.3)

The `ds:Signature` element structure (enveloped):

```
ds:Signature
  ds:SignedInfo                          [1]
    ds:CanonicalizationMethod            [1]   ← algorithm URI specified here
    ds:SignatureMethod                   [1]   ← ECDSA with SHA-256
    ds:Reference                         [≥2]
      [Reference 1] URI → data to be signed
        ds:Transforms                    [0 or 1]
          ... (see XPath exclusions below)
          ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"
        ds:DigestMethod                  ← SHA-256
        ds:DigestValue                   ← base64-encoded digest
      [Reference 2] URI → #xades-SignedProperties, Type="http://uri.etsi.org/01903#SignedProperties"
        ds:DigestMethod                  ← SHA-256
        ds:DigestValue                   ← base64-encoded digest of SignedProperties
  ds:SignatureValue                      [1]   ← base64-encoded ECDSA signature
  ds:KeyInfo                             [1]
    ds:X509Data                          [1]
      ds:X509Certificate                 [≥1]  ← base64-encoded signing cert + chain up to trust anchor
  ds:Object                              [1]
    QualifyingProperties                 [1]   ← xades:QualifyingProperties
      SignedProperties                   [1]   ← xades:SignedProperties (cryptographically bound)
        SignedSignatureProperties        [1]
          signingTime                    [1]   ← claimed signing time from EGS clock
          SigningCertificateV2           [1]   ← digest of signing cert + chain to trust anchor
          SignaturePolicyIdentifier      [1]   ← reference to this specification document
        SignedDataObjectProperties       [1]
          DataObjectFormat               [1]
            MimeType                     [1]   ← always "text/xml"
```

### 4.1 Canonicalization URI

The canonicalization algorithm applied during signing (both for `ds:CanonicalizationMethod` and as the final Transform):

```
http://www.w3.org/2006/12/xml-c14n11
```

This is **Canonical XML 1.1**.

### 4.2 XPath Transforms (Exclusions) — Verbatim from Document

The `ds:Transforms` block that filters the document before digesting (applied to the first `ds:Reference`, i.e., the reference to the XML invoice content):

```xml
<ds:Transforms>
  <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
    <ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>
  </ds:Transform>
  <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
    <ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>
  </ds:Transform>
  <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
    <ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath>
  </ds:Transform>
  <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
</ds:Transforms>
```

**What is excluded from signing:**
1. `ext:UBLExtensions` — the UBL extensions block (which contains the signature itself)
2. `cac:Signature` — the signature element
3. `cac:AdditionalDocumentReference[cbc:ID='QR']` — the QR code element

After applying these XPath exclusions, **Canonical XML 1.1** (`http://www.w3.org/2006/12/xml-c14n11`) is applied to the remaining content.

### 4.3 SignedProperties Reference

The second `ds:Reference` element points to `SignedProperties` using:
- `URI` attribute → `#xades-SignedProperties` (or equivalent fragment ID referencing the element)
- `Type` attribute → `"http://uri.etsi.org/01903#SignedProperties"`

The digest of `SignedProperties` is computed (SHA-256) and placed in `ds:DigestValue`, binding the qualifying properties cryptographically to the signature.

### 4.4 SignatureValue Encoding

`ds:SignatureValue` contains the actual ECDSA signature value, **always encoded using Base64** (per RFC 2045).

---

## 5. Invoice Hash Computation

### 5.1 Process

The invoice hash is computed by applying **the same transform as the cryptographic stamp** (§3 of the document cross-references §2.3.3):

> "The hash of the previous invoice is generated by applying the same transform as is used for the cryptographic stamp and as specified in section 2.3.3 and taking the sha256 algorithm."

This means:
1. Take the XML invoice document
2. Apply the three XPath exclusion transforms (exclude UBLExtensions, cac:Signature, QR AdditionalDocumentReference)
3. Apply Canonical XML 1.1 (`http://www.w3.org/2006/12/xml-c14n11`)
4. Compute SHA-256 of the resulting byte stream

### 5.2 Hash Encoding

From the QR code specification (Tag 6):

> "[for tag 6] Length: length of hash (SHA256) is 32 bytes. Value: the byte array constituting the value of the field"

And from the `ds:DigestValue` description:

> "ds:DigestValue contains the **base-64 encoded** digest value"

**The invoice hash is the raw 32-byte SHA-256 output. In the QR TLV it is stored as raw bytes (32 bytes). In `ds:DigestValue` it is Base64-encoded.**

There is no hex-then-Base64 double encoding. The flow is:
- SHA-256(canonicalized XML) → 32 raw bytes
- In QR Tag 6: stored directly as 32 raw bytes in the TLV value field
- In `ds:DigestValue`: Base64-encoded (standard Base64, RFC 2045)

---

## 6. Previous Invoice Hash (PIH)

### 6.1 Computation

> "The hash of the previous invoice is generated by applying the same transform as is used for the cryptographic stamp and as specified in section 2.3.3 and taking the sha256 algorithm."

For invoice N, PIH = SHA-256(canonical form of invoice N-1, after XPath exclusions).

### 6.2 First Invoice Seed Value

**CRITICAL: This document does NOT specify a literal seed value or a specific Base64 string for the first invoice.**

The document only states that the same transform is applied and SHA-256 is taken. It does not contain a verbatim literal like `NWZlY2ViNjZmZmM4...` or the "SHA-256 of '0'" formula.

The first-invoice PIH seed must be sourced from a different ZATCA document (the Data Dictionary / Technical Guideline / developer portal SDK). Based on cross-referencing with the ZATCA SDK and community implementations, the known value is:

```
NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODRmODViY2QzODIxNzY5ZmM4NTliOTg1ZTc4ZTc5MGFhYTliZTZlYTFlNg==
```

This is the Base64 encoding of the hex string:
`5feceb66ffc86f38d952786f5bcd3821769fc859b9856e7e790aaab9be6ea1e6`
which is SHA-256 of the string `"0"` (single ASCII zero character, UTF-8).

**This document (Security Features v1.1) does NOT contain this literal. It only states the method. The literal seed must be confirmed from the ZATCA technical guideline or SDK documentation.**

---

## 7. PAdES Structure (§2.3.4)

For PDF/A-3 invoices:

| Element | Cardinality | Notes |
|---|---|---|
| `SignedData.certificates` | 1 | Signing cert + full chain to trust anchor |
| `content-type` | 1 | Value: `id-data` |
| `message-digest` | 1 | Digest of signed content |
| `signature-policy-identifier` | 0 or 1 | Identifier of this specification |
| `ESS signing-certificate-v2` | 1 | Per RFC 5035 §4; certHash computed over entire DER-encoded signing cert |
| `M` entry (Signature Dictionary) | 1 | Time of signing (EGS clock); per ISO 32000-1 §12.8.1 |
| `Contents` entry (Signature Dictionary) | 1 | DER-encoded SignedData (CMS/RFC 5652) forming a CAdES signature per EN 319 122-1 |
| `Filter` entry (Signature Dictionary) | 1 | Preferred signature handler; per ISO 32000-1 §12.8.1 |
| `ByteRange` entry (Signature Dictionary) | 1 | Array of (offset, length) pairs covering entire file EXCEPT the Contents entry |
| `SubFilter` entry (Signature Dictionary) | 1 | Value: **`ETSI.CAdES.detached`** |

The PAdES signature is a CAdES detached signature embedded in the PDF Signature Dictionary.

---

## 8. CSID Certificate Profile (§2.2.2)

### 8.1 X.509 Certificate Fields

| Field | Value |
|---|---|
| Version | X.509 v3 |
| SerialNumber | At least 64 bits of entropy, validated for uniqueness |
| Signature algorithm | **SHA256 with ECDSA Encryption** |
| Issuer | Subject DN of ZATCA's issuing CA |
| NotBefore | Certificate generation date/time |
| NotAfter | NotBefore + up to 60 months (5 years) |
| Subject | See CSR RDN table below |
| SubjectPublicKeyInfo | ECDSA public key, **P-256** (256-bit) |
| CRL Distribution Points | HTTP URL to CA CRL endpoint; Extension/NO (non-critical) |
| Authority Key Identifier | 160-bit SHA-1 hash of issuing CA's subjectPublicKey BIT STRING (RFC 5280) |
| Subject Key Identifier | 160-bit SHA-1 hash of subject's subjectPublicKey BIT STRING (RFC 5280) |
| Certificate Policies | OID defined by CA; CPS URL (HTTPS) |
| Authority Information Access | OCSP: OID `1.3.6.1.5.5.7.48.1`; CA Issuer: `1.3.6.1.5.5.7.48.2` |
| Key Usage | `digitalSignature`, `keyEncipherment` — Extension/YES (critical) |
| Extended Key Usage | `clientAuth` — Extension/NO (non-critical) |

### 8.2 CSR Subject Field / RDN Table

| CSR Input | x509 Field | Description | Accepted Input |
|---|---|---|---|
| Common Name | `x509.subject.common_name` | Unique name or asset tracking number of the EGS unit | Free text |
| EGS Serial Number | `x509.alternative_names` (GUID) | Manufacturer/Provider Name, Model/Version, Serial Number | Format: `1-<Manufacturer>\|2-<Model>\|3-<SerialNumber>` |
| Organization Identifier | OID `2.5.4.97` | VAT Registration Number of the taxpayer | 15 digits; begins with 3 and ends with 3 |
| Organization Unit Name | `x509.subject.organizational_unit` | Branch name; for VAT Groups = 10-digit TIN of individual group member | Free text (for VAT Groups: 10-digit TIN) |
| Organization Name | `x509.subject.organization` | Taxpayer name | Free text |
| Country Name | `x509.subject.country` | Country | 2-letter ISO 3166 Alpha-2 |
| Invoice Type | `businessCategory` OID `2.5.4.15` | Types of invoices the EGS generates | 4-digit binary mapped to TSCZ (e.g., `1100` = Standard + Simplified) |
| Location | `x509.alternative_names registeredAddress` OID `2.5.4.26` | Branch/device address | Free text (Saudi National Address preferred) |
| Industry | `x509.alternative_names businessCategory` OID `2.5.4.15` | Industry/sector | Free text |

### 8.3 CSR Requirements (Req. 7)

The EGS must generate a **PKCS#10 CSR** containing at minimum:
- Certificate CN
- Public key
- Signed using the private key as Proof-of-Possession

### 8.4 QR Tag 9 — ZATCA CA Signature

From the QR code table:
> Tag 9: "For Simplified Tax Invoices and their associated notes, the **ECDSA signature of the cryptographic stamp issued by ZATCA's technical CA**"

This is a signature value (ECDSA, P-256, SHA-256) produced by ZATCA's CA over the cryptographic stamp. It is stored in QR Tag 9 in the TLV format. This tag is only mandatory for Simplified Tax Invoices.

---

## 9. Key Generation and Protection (Req. 6, 8, 9)

### 9.1 Key Generation (Req. 6)

- Key pair generated per **FIPS 186**
- Suitability validated per either:
  - ECC Full Public Key Validation Routine (NIST SP 800-56A Rev 2, §5.6.2.3.2)
  - ECC Partial Public Key Validation Routine (NIST SP 800-56A Rev 2, §5.6.2.3.3)
- **Keys MUST be marked as non-exportable** — key export out of the security module where generated is prohibited
- Hardware or software security module may be used as long as non-exportability is enforced

### 9.2 Key Storage / Protection (Req. 8)

- Taxpayers must use reasonable techniques to protect the signing key pair (especially the private key)
- Techniques include (but not limited to): disk encryption (especially for software-based modules)
- Applies equally to keys stored locally or centralized

### 9.3 Private Key Activation (Req. 9)

- Taxpayers are responsible for activating and protecting signing keys
- Activation data (PIN/passphrase) for the private key must be secured using reasonable techniques
- Same requirements apply to ZATCA's e-invoicing platform

---

## 10. Signature Verification (Req. 17)

- Full certificate chain from signing certificate up to ZATCA's trust anchor must be included in the signature
- Certificate path validation and revocation check performed as of the time included in the signature (claimed signing time)
- Signature verification per **ETSI EN 319 102-1** or equivalent

### 10.1 Certificate Revocation (Req. 14)

- Revocation published via CRL or OCSP
- **CRLs valid for 7 days** — allows EGS to work fully offline for 7 days before downloading fresh CRL
- EGS/ZATCA platform must check certificate validity before using it for stamping

---

## 11. QR Code Security Tags (§4.1, Table 3)

The QR code is encoded in **Base64 format**, up to 700 characters, containing TLV-encoded fields.

### 11.1 TLV Encoding Rules

For **Tags 1–5** (text fields):
- Tag: 1 byte (tag number)
- Length: 1 byte (number of bytes in UTF-8 encoding of the field value)
- Value: UTF-8 encoded byte array of the field value

For **Tag 6** (invoice hash):
- Tag: 1 byte (`0x06`)
- Length: 32 bytes (SHA-256 always produces 32 bytes)
- Value: raw 32-byte SHA-256 hash byte array (NOT Base64 encoded inside TLV)

For **Tags 7, 8, 9**: (same TLV structure, byte arrays)

### 11.2 QR Tag Definitions

| Tag | Field | Enforcement | Encoding |
|---|---|---|---|
| 1 | Seller's name | From 4 Dec 2021 | UTF-8 bytes |
| 2 | VAT registration number of seller | From 4 Dec 2021 | UTF-8 bytes |
| 3 | Invoice timestamp (ISO 8601, e.g., `2022-02-21T12:13:57Z`) | From 4 Dec 2021 | UTF-8 bytes |
| 4 | Invoice total (with VAT) | From 4 Dec 2021 | UTF-8 bytes |
| 5 | VAT total | From 4 Dec 2021 | UTF-8 bytes |
| 6 | Hash of XML invoice (SHA-256, raw 32 bytes) | From 4 Dec 2021 | Raw bytes (32 bytes) |
| 7 | ECDSA signature of the XML hash | From 1 Jan 2023 | Raw bytes |
| 8 | ECDSA public key extracted from the signing private key | From 1 Jan 2023 | Raw bytes |
| 9 | ECDSA signature of the cryptographic stamp issued by ZATCA's CA (Simplified invoices only) | From 1 Jan 2023 | Raw bytes |

### 11.3 QR Code Encoding Order of Operations (Verbatim from Document)

> 1. Start with values required by the specification below and an empty byte array.
> 2. For each value construct the Tag, Length, and Value (TLV) tuple by setting the first byte to the Tag from the table below, followed immediately by the second byte representing the length as an unsigned 8-bit integer, and finally a byte array representing the Value encoded in UTF-8.
> 3. After constructing the byte array, encode using Base64 to obtain an encoded ASCII string.
> 4. Finally, create the QR image from the Base64 string.

---

## 12. Counter (ICV) — Invoice Counter Value

This document does not contain specific ICV rules. ICV requirements (sequential counter, tamper-resistance) are defined in the main e-invoicing resolution and technical guideline. The security features document focuses on cryptographic mechanisms only. The ICV is embedded in the XML as `cbc:ID` or a dedicated field and is included in what is signed (it is not excluded by the XPath transforms).

---

## 13. Signing Process — Step-by-Step Algorithm

Derived from §2.3.3 (XAdES structure), §3 (PIH), §4 (QR), and the transforms section:

### Step 1: Prepare the XML invoice
- Build the complete UBL XML invoice with all mandatory fields, including:
  - ICV (invoice counter)
  - PIH (previous invoice hash) in the appropriate element
  - Empty `ext:UBLExtensions` placeholder for the signature
  - Empty `cac:AdditionalDocumentReference[cbc:ID='QR']` placeholder

### Step 2: Compute the invoice hash
1. Apply the three XPath exclusion transforms to the XML:
   - Exclude `ext:UBLExtensions`
   - Exclude `cac:Signature`
   - Exclude `cac:AdditionalDocumentReference[cbc:ID='QR']`
2. Apply Canonical XML 1.1 (`http://www.w3.org/2006/12/xml-c14n11`) to the filtered XML
3. Compute SHA-256 → 32 raw bytes (this is the invoice hash)
4. Base64-encode for embedding in `ds:DigestValue`

### Step 3: Build the XAdES `SignedProperties`
- Populate `xades:SignedSignatureProperties`:
  - `signingTime`: current EGS clock time
  - `SigningCertificateV2`: SHA-256 digest of the signing certificate (and chain to trust anchor)
  - `SignaturePolicyIdentifier`: reference to the ZATCA security features document
- Populate `DataObjectFormat/MimeType`: `"text/xml"`

### Step 4: Compute the SignedProperties digest
1. Canonicalize the `xades:SignedProperties` element using C14N 1.1
2. Compute SHA-256 → Base64-encode for the second `ds:Reference/ds:DigestValue`

### Step 5: Build `ds:SignedInfo`
- `ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"`
- `ds:SignatureMethod Algorithm="..."` (ECDSA-SHA256 algorithm URI)
- `ds:Reference[1]`: invoice content digest (from Step 2) + the XPath+C14N transforms
- `ds:Reference[2]`: SignedProperties digest (from Step 4), Type=`http://uri.etsi.org/01903#SignedProperties`

### Step 6: Sign `ds:SignedInfo`
1. Canonicalize `ds:SignedInfo` using C14N 1.1
2. Sign with ECDSA (P-256, SHA-256) using the private key
3. Base64-encode the ECDSA signature bytes → `ds:SignatureValue`

### Step 7: Assemble the complete `ds:Signature` element
- Insert `ds:SignatureValue`, `ds:KeyInfo` (with the X.509 certificate chain), and `ds:Object` (containing `QualifyingProperties`)
- Embed this `ds:Signature` block inside `ext:UBLExtensions`

### Step 8: Build and insert the QR code
1. Compute QR TLV fields:
   - Tags 1–5: seller name, VAT number, timestamp, total, VAT amount (UTF-8)
   - Tag 6: the 32-byte raw invoice hash (from Step 2)
   - Tag 7: the raw ECDSA signature bytes of the XML hash (from Step 6 or a separate ECDSA signing of the hash)
   - Tag 8: the raw ECDSA public key bytes
   - Tag 9 (Simplified invoices): ECDSA signature from ZATCA's CA over the cryptographic stamp
2. Concatenate all TLV byte arrays
3. Base64-encode the concatenated byte array (up to 700 characters)
4. Generate QR image from the Base64 string
5. Insert into `cac:AdditionalDocumentReference[cbc:ID='QR']`

---

## 14. EGS Authentication (§5)

ZATCA APIs use **OAuth 2.0 Basic Authentication** (RFC 6749):
- **Client ID:** the digital certificate issued during onboarding
- **Secret Value:** issued separately during onboarding; must be stored securely

---

## 15. Invoice Generation Workflows

### Standard Tax Invoices (Req. 1.1)
ZATCA's centralized e-invoicing platform applies the cryptographic stamp (ZATCA stamps the invoice after clearance).

### Simplified Tax Invoices (Req. 1.2)
The taxpayer's EGS applies the cryptographic stamp directly (stamp before/during generation, then report to ZATCA).

---

## Summary: Key Technical Values at a Glance

| Parameter | Value |
|---|---|
| Signature profile | XAdES-B-B (Baseline-Basic) per ETSI EN 319 132-1 |
| PDF profile | PAdES-B-B per ETSI EN 319 142-1; SubFilter = `ETSI.CAdES.detached` |
| Signing algorithm | ECDSA |
| Curve | **P-256 (secp256r1)** — NOT secp256k1 |
| Hash algorithm | SHA-256 |
| Canonicalization URI | `http://www.w3.org/2006/12/xml-c14n11` (Canonical XML 1.1) |
| Excluded elements (XPath) | `ext:UBLExtensions`, `cac:Signature`, `cac:AdditionalDocumentReference[cbc:ID='QR']` |
| Hash encoding in ds:DigestValue | Raw 32 bytes → Base64 |
| Hash encoding in QR Tag 6 | Raw 32 bytes (in TLV value field) |
| QR outer encoding | Base64 of the concatenated TLV byte array |
| Signature packaging | Enveloped (signature sub-element of signed XML) |
| Signature level | B-B (Basic-Baseline) |
| SignedProperties Type URI | `http://uri.etsi.org/01903#SignedProperties` |
| Certificate curve | P-256 (256-bit ECDSA key) |
| Key non-exportability | Required (FIPS 186, NIST SP 800-56A Rev 2) |
| PIH computation | Same XPath exclusion + C14N 1.1 + SHA-256 as invoice hash |
| First-invoice PIH seed | **NOT specified in this document** — sourced from SDK: Base64 of SHA-256("0") = `NWZlY2ViNjZmZmM4NjZmZmM4...` (see note in §6.2) |
| CRL validity | 7 days (EGS may operate offline for 7 days) |
| OAuth | Basic Authentication; Client ID = CSID certificate; Secret = issued at onboarding |
