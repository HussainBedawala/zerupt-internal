# ZATCA QR Code Creation — Technical Reference

Source: "Guide to Developed FATOORA Compliant QR Code", Nov 18, 2021  
Canonical ZATCA spec: https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20210528_ZATCA_Electronic_Invoice_Security_Features_Implementation_Standards_vShared.pdf

---

## 1. Overview

The QR code is a **Base64-encoded TLV (Tag-Length-Value) byte string**. It must contain up to 500 characters. It is printed on both Simplified Tax Invoices (B2C) and Standard Tax Invoices (B2B), though the tag set differs by phase and invoice type (see §3).

---

## 2. TLV Encoding Rules

Each field is encoded as three consecutive byte segments — no padding or separators between TLV sets:

| Segment | Size     | Description |
|---------|----------|-------------|
| Tag     | 1 byte   | Integer tag value (e.g. tag 1 → `0x01`) |
| Length  | 1 byte   | Byte length of the UTF-8 encoded value |
| Value   | Variable | UTF-8 byte array of the field value |

Key rules:
- Tag and Length are **binary values stored as exactly 1 byte each**. They are NOT ASCII decimal digits. E.g., a length of 21 (decimal) is stored as `0x15`, NOT `0x32 0x31`.
- Value bytes are the **UTF-8 encoding** of the field string (including Arabic text — use UTF-8, not any other encoding).
- All TLV triplets are **concatenated directly** into a single byte array with no delimiters.
- The final byte array is **Base64-encoded** to produce the QR payload string.

Encoding scheme: **Basic Encoding Rules (BER)** per ASN.1, simplified version.

---

## 3. Tag Table

| Tag | Field | Format / Notes | Phase Required | Invoice Type |
|-----|-------|----------------|----------------|--------------|
| 1 | Seller's name | UTF-8 string | Phase 1 (4 Dec 2021) | All |
| 2 | VAT registration number of the seller | UTF-8 string (15-digit SAR VAT number) | Phase 1 (4 Dec 2021) | All |
| 3 | Timestamp of the invoice (date and time) | ISO 8601: `YYYY-MM-DDTHH:MM:SSZ` (UTC, 20 chars) | Phase 1 (4 Dec 2021) | All |
| 4 | Invoice total (with VAT) | Decimal string, e.g. `1000.00` | Phase 1 (4 Dec 2021) | All |
| 5 | VAT total | Decimal string, e.g. `150.00` | Phase 1 (4 Dec 2021) | All |
| 6 | Hash of XML invoice | Hash value (byte array / base64 string) | Phase 2 (1 Jan 2023) | All |
| 7 | ECDSA signature | Signature bytes | Phase 2 (1 Jan 2023) | All |
| 8 | ECDSA public key | Public key bytes | Phase 2 (1 Jan 2023) | All |
| 9 | ECDSA signature of the cryptographic stamp's public key by ZATCA's technical CA | Signature bytes | Phase 2 (1 Jan 2023) | **Simplified Tax Invoices and their associated notes ONLY** |

Phase 1 requires Tags 1–5. Phase 2 requires Tags 1–9 (tag 9 for Simplified only).

---

## 4. Field Format Details

### Tag 1 — Seller Name
- UTF-8 string. Arabic names must be UTF-8 encoded (e.g. `يبرعلا يرهاوجلا` → hex `62764462c64862764763164a2062764463963162864a`).

### Tag 2 — VAT Registration Number
- 15-character numeric string (Saudi VAT TIN). Example: `310122393500003`, `100025906700003`.

### Tag 3 — Timestamp
- Format: `YYYY-MM-DDTHH:MM:SSZ` (ISO 8601 UTC)
- Always 20 characters long → length byte = `0x14`
- Example: `2022-04-25T15:30:00Z`

### Tag 4 — Invoice Total (with VAT)
- Decimal string with exactly 2 decimal places. Example: `1000.00`, `2100100.99`.

### Tag 5 — VAT Total
- Decimal string with exactly 2 decimal places. Example: `150.00`, `315015.15`.

### Tags 6–9 — Phase 2 Cryptographic Fields
- Tag 6: SHA-256 hash of the canonical XML invoice.
- Tag 7: ECDSA (secp256k1) signature over the invoice hash.
- Tag 8: ECDSA public key of the taxpayer's cryptographic stamp certificate.
- Tag 9: ZATCA CA signature over the cryptographic stamp's public key (Simplified invoices only).
- All are raw binary byte arrays (NOT hex strings, NOT Base64 strings) when embedded as TLV values. Length byte reflects the byte count of the raw binary, not a string representation.

---

## 5. Step-by-Step Encoding Process

1. For each tag (in ascending order 1→5 for Phase 1; 1→9 for Phase 2):
   a. Convert tag number to 1-byte binary: `Buffer.from([tagNum])` or equivalent.
   b. UTF-8 encode the value string → byte array `valueBytes`.
   c. Get `len = valueBytes.length` → convert to 1-byte binary: `Buffer.from([len])`.
   d. Concatenate: `[tagByte, lenByte, ...valueBytes]`.
2. Concatenate all TLV byte arrays sequentially (no separators).
3. Base64-encode the full concatenated byte array.
4. The resulting Base64 string is the QR code data.

---

## 6. Test Vector 1 — "Bobs Records" (Phase 1)

### Input Values
| Tag | Value |
|-----|-------|
| 1 | `Bobs Records` |
| 2 | `310122393500003` |
| 3 | `2022-04-25T15:30:00Z` |
| 4 | `1000.00` |
| 5 | `150.00` |

### Per-Tag TLV Hex
| Tag | Hex |
|-----|-----|
| 1 | `010c426f6273205265636f726473` |
| 2 | `020F333130313232333933353030303033` |
| 3 | `0314323032322d30342d323554313533a33303a30305a` |
| 4 | `0407313030302e3030` |
| 5 | `05063135302e3030` |

> Note: Tag 3 hex in the source doc appears as `0314323032322d30342d323554313553a33303a30305a` — the `53a3` may be a rendering artifact; the string `2022-04-25T15:30:00Z` UTF-8 encodes cleanly to `323032322d30342d323554313533303a33303a30305a`.

### Full Concatenated Hex
```
010c426f6273205265636f726473020F3331303132323339333530303030330314323032322d
30342d32355431353a33303a30305a0407313030302e303005063135302e3030
```

### Expected Base64 Output
```
AQxCb2JzIFJlY29yZHMCDzMxMDEyMjM5MzUwMDAwMwMUMjAyMi0wNC0yNVQxNTozMDowMFoEBzEwMDAuMDAFBjE1MC4wMA==
```

---

## 7. Test Vector 2 — "Bobs Basement Records" (Phase 1, for decoding demo)

### Input Values
| Tag | Value |
|-----|-------|
| 1 | `Bobs Basement Records` |
| 2 | `100025906700003` |
| 3 | `2022-04-25T15:30:00Z` |
| 4 | `2100100.99` |
| 5 | `315015.15` |

### Base64 QR Code (as extracted by QR reader)
```
ARVCb2JzIEJhc2VtZW50IFJlY29yZHMCDzEwMDAyNTkwNjcwMDAwMwMUMjAyMi0wNC0yNVQxNTozMDowMFoECjIxMDAxMDAuOTkFCTMxNTAxNS4xNQ==
```

### Decoded Hex (Base64 → bytes → hex)
```
01 15 42 6f 62 73 20 42 61 73 65 6d 65 6e 74 20 52 65 63 6f 72 64 73
02 0f 31 30 30 30 32 35 39 30 36 37 30 30 30 30 33
03 14 32 30 32 32 2d 30 34 2d 32 35 54 31 35 3a 33 30 3a 30 30 5a
04 0a 32 31 30 30 31 30 30 2e 39 39
05 09 33 31 35 30 31 35 2e 31 35
```

### Decoded Tag Analysis
| Tag Byte | Len Byte | Hex Value | Decoded String |
|----------|----------|-----------|----------------|
| `01` | `15` (= 21 dec) | `426F627320426173656D656E74205265636F726473` | `Bobs Basement Records` |
| `02` | `0F` (= 15 dec) | `313030303235393036373030303033` | `100025906700003` |
| `03` | `14` (= 20 dec) | `323032322D30342D32355431353A33303A30305A` | `2022-04-25T15:30:00Z` |
| `04` | `0A` (= 10 dec) | `323130303130302E3939` | `2100100.99` |
| `05` | `09` (= 9 dec) | `3331353031352E3135` | `315015.15` |

---

## 8. Common Mistakes

1. **Tag/Length as text digits** — WRONG. They must be 1-byte binary integers. Length 21 = `0x15`, NOT ASCII `"21"`.
2. **No padding/separators** — TLV byte arrays are concatenated directly; no commas, spaces, or null bytes between them.
3. **Arabic text** — must be UTF-8 encoded into binary, not Latin-1 or any other encoding.
4. **Value as hex string** — the Value segment is raw UTF-8 bytes of the actual field content, not a hex string representation.
5. **Wrong QR formats** — the QR must contain the Base64 TLV string only. The following are all WRONG:
   - A hyperlink URL (e.g. `https://zatca.gov.sa/...`)
   - A hyperlink to the invoice PDF
   - Plain text key-value pairs
   - Empty or random values

---

## 9. QR Code Rendering Requirements

- Maximum QR payload: **500 characters** (Base64 string length).
- Error correction level: **not specified** in this document.
- QR code version: **not specified** in this document.
- The QR must be **printed on the invoice**.

---

## 10. SDK Validation Commands

ZATCA provides a CLI SDK (fatoorah) for validation:

```bash
fatoorah -v                          # display version
fatoorah -h                          # help
fatoorah validateqr -qr <string>     # validate QR code structure
fatoorah generate -f <Invoice.xml> -q  # generate compliant QR from XML
```

SDK download: https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx

---

## 11. Implementation Language Notes

### JavaScript / Node.js pattern
```js
function createTlvBuf(tagNum, tagValue) {
  const tag = Buffer.from([tagNum]);
  const value = Buffer.from(tagValue, 'utf8');
  const length = Buffer.from([value.length]);
  return Buffer.concat([tag, length, value]);
}
// Concat all TLV buffers, then:
const qr = Buffer.concat([buf1, buf2, buf3, buf4, buf5]).toString('base64');
```

### Dart pattern
Uses `BytesBuilder` to `.add()` each [tag, length, value] segment; then `base64Encode(builder.toBytes())`.
