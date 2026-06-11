# ZATCA E-Invoicing Implementation Resolution — Comprehensive Extraction

**Source:** Controls, Requirements, Technical Specifications and Procedural Rules for Implementing the Provisions of the E-Invoicing Regulation  
**Decision No.:** 62738, dated 23/11/1443 H  
**Note:** Arabic version is the official legal version; this extraction is based on the English translation.

---

## 1. Scope of Application (Clause First)

### Who Must Comply
- All persons subject to **Article (3) of the E-Invoicing Regulation**.
- Applies to all **taxable persons** registered for VAT in Saudi Arabia who are required to issue tax invoices under Article (53) of the VAT Implementing Regulation.

### In-Scope Transactions
1. Supplies of taxable goods and services (standard rate or zero-rate)
2. Export of goods and services from the Kingdom
3. Intra-GCC supplies (per Unified VAT Agreement, VAT Law, VAT Implementing Regulation)
4. Nominal supplies by the taxable person
5. Payments received before actual supply (advance/deposit invoices)
6. Transactions requiring **notes** (credit/debit) per VAT Implementing Regulation

### Explicitly Excluded Transactions
1. Supplies **fully exempted** from VAT
2. Payments related to fully VAT-exempt supplies
3. Supplies subject to VAT under the **Reverse Charge Mechanism**
4. **Import of goods** to the Kingdom

### Input Tax Deduction Note
- To claim input tax deduction (Article 48(1) of Unified VAT Agreement), electronic invoices must be **Cleared** (Tax Invoices) or **Reported** (Simplified Tax Invoices) to ZATCA, starting from a date announced by the Authority in a subsequent resolution.

---

## 2. Phase 1 — Generation Phase

**Effective Date:** 4th December 2021

### Format Requirements (Phase 1)
- No mandated format at Phase 1, **as long as all required data fields are present**.
- Invoices must be time-stamped.
- Must cover all mandatory fields per Annex (2).

### Technical Functionalities Mandated from 4th December 2021 (Annex 1)

| Requirement | Description |
|---|---|
| Invoice Types | Must generate: Tax Invoice + Credit/Debit Note; Simplified Tax Invoice + Credit/Debit Note |
| Invoice Format | No required format, required data must be present |
| Invoice Structure | All mandated Annex 2 fields present; business rules for conditional fields; allowable values complied with |
| Data Processing & Security | Export e-invoices offline for local archival; tamper-evidence mechanisms (Simplified Tax Invoices only) |
| Data Storage & Archival | Export to external archival system; export filenames must contain: VAT registration number + issuance date + issuance time + Invoice Reference Number (IRN) |
| QR Code | **Mandatory for Simplified Tax Invoices only** at Phase 1 — see QR fields below |

### Phase 1 QR Code Fields (Simplified Tax Invoice only)

| ID | Field |
|----|-------|
| 1 | Seller's name |
| 2 | VAT registration number of the seller |
| 3 | Timestamp of the Electronic Invoice or Credit/Debit Note (date and time) |
| 4 | Electronic Invoice or Credit/Debit Note total (with VAT) |
| 5 | VAT total |

### Anti-Tampering Controls (Phase 1)
- Solution must be **tamper-resistant** — prevents and reveals any tampering by user or third party.
- Must **protect generated invoices from alteration or deletion**.
- Must support **offline archival** without internet connection.
- Must generate a **tamper-resistant Electronic Invoice counter** that:
  - Cannot be reset or reformatted
  - Increments for each generated invoice or associated note
  - Records counter value on each invoice/note
- Must generate a **Hash** for each invoice in the sequence; hash is embedded in the next invoice to prevent deletion or replacement.
- Must generate a **QR code** for basic validation.

### Prohibited Functions — Enforced from 4th December 2021

| Prohibited Functionality | Description |
|---|---|
| Uncontrolled access | Anonymous access; ability to operate with default password; absence of user session management |
| Tampering of e-invoices / notes / logs | Allow alteration or deletion of generated invoices or notes; log modification/deletion; inaccurate timestamps; non-sequential log generation; Electronic Invoice counter reset |
| Multiple Invoice sequences | Allow generation of more than one Electronic Invoice sequence at any given time |

---

## 3. Phase 2 — Integration Phase

**Start Date:** 1st January 2023 (rolled out in waves/target groups)  
**Implementation:** ZATCA determines targeted groups and notifies each at least **6 months** before the due date.

### Additional Technical Functionalities Mandated from 1st January 2023

| Requirement | Description |
|---|---|
| Invoice Format | **XML mandatory** for generation and transmission; PDF/A-3 with embedded XML is optional human-readable format for sharing with customer |
| Data Processing & Security | Generation of **UUID** (Universally Unique Identifier, 128-bit) for each invoice/note; tamper-resistant counter (same as Phase 1 but now formally required) |
| Cryptographic Stamp (Simplified Tax Invoices) | Each e-invoice system generating Simplified Tax Invoices must have a unique **Cryptographic Stamp Identifier** (issued via ZATCA portal); each Simplified Tax Invoice must carry a cryptographic stamp; stamping key marked non-exportable; disk encryption required if software-stored |
| Additional Cryptographic Capabilities | Standard Secure Hashing Algorithms |
| UUID | 128-bit number, algorithm-generated to ensure global uniqueness |
| QR Code | **Now mandatory for ALL invoice types** — see extended QR fields below |
| Connectivity | TLS encrypted/authenticated connection; batch upload for Simplified Tax Invoices; real-time submission + response for Tax Invoices; offline queuing with catch-up on reconnect |

### Phase 2 QR Code Fields (All Invoice Types)

| ID | Field |
|----|-------|
| 1 | Seller's name |
| 2 | VAT registration number of the seller |
| 3 | Timestamp (date and time, ISO 8601 format, e.g. 2022-02-21T12:13:57Z) |
| 4 | Electronic Invoice or Credit/Debit Note amount (with VAT) |
| 5 | VAT amount |
| 6 | Hash of XML Electronic Invoice or Credit/Debit Note |
| 7 | ECDSA signature of the XML Hash |
| 8 | ECDSA public key extracted from the signing private key (for Simplified: E-Invoice Solution's public key; for Tax Invoices: optional, ZATCA platform's public key) |
| 9 | For Simplified Tax Invoices only: ECDSA signature of the cryptographic stamp issued by ZATCA's technical CA |

**Who generates the stamp:**
- Simplified Tax Invoices: stamp generated by the E-Invoice Generating Solution.
- Tax Invoices integrated with ZATCA: stamp generated by ZATCA's platform.

### Additional Prohibited Functions — Enforced from 1st January 2023

| Prohibited Functionality | Description |
|---|---|
| Export of stamping keys | Option to export cryptographic stamp stamping key |
| Time change | Allow software time changes; allow modification of timestamp value during invoice/note issuance |

### Integration Mechanism (Clause Sixth)
- Must integrate using **API** specified by ZATCA (published on ZATCA website).
- Tax Invoices: **real-time clearance** — ZATCA verifies, applies Cryptographic Stamp, notifies issuer before sharing with customer.
- Simplified Tax Invoices: **reported to ZATCA within 24 hours** of generation.
- XML is the only approved format for integration transmission.
- Additional integration details governed by subsequent resolutions from the Governor.

### Cryptographic Stamp Identifier (Unit Registration)
- Persons generating Simplified Tax Invoices must **register their "Units"** (key components of the E-Invoice Solution) with ZATCA.
- Cryptographic Stamp Identifiers issued and managed via ZATCA's portal using existing accounts.
- A new stamping key is generated upon identifier renewal.
- Stamping key must be **non-exportable** from the security module.
- If stored in software: **disk encryption** required.

---

## 4. Invoice Types and Definitions

### Tax Invoice
- Issued for B2B transactions (generally where both parties are VAT registered, or for certain export/intra-GCC transactions).
- Must be **Cleared** by ZATCA (real-time) before sharing with customer (Phase 2 onwards).
- Must contain full buyer identification including buyer name, address, and VAT number (if applicable).
- Self-billing allowed only where both parties are VAT registered; **not allowed for Simplified Tax Invoices**.

### Simplified Tax Invoice
- Issued for B2C transactions (Article 53(8) of VAT Implementing Regulation).
- Must be **Reported** to ZATCA within 24 hours of generation (Phase 2 onwards).
- Buyer identification requirements are lighter (buyer name and National ID only mandatory for private education/healthcare supplies to citizens).
- Printed copy must be presented to customers; electronic sharing permitted with agreement.

### Electronic Notes (Credit/Debit Notes)
- Must satisfy Article (54) of VAT Implementing Regulation.
- Fields mirror the invoice type to which they relate.
- Must include reference to original invoice(s) and reason for issuance.

---

## 5. Mandatory Fields — Tax Invoice (Annex 2, enforced by date)

Legend: **M** = Mandatory | **C** = Conditional | **O** = Optional  
Phase 1 = 4 Dec 2021 | Phase 2 = 1 Jan 2023 (per wave)

### Section 1 — Type of Invoice
| # | Field | Obligation | Phase |
|---|---|---|---|
| 1.1 | Invoice Type Description: "Tax Invoice" (enumerated value; document title must read "Tax Invoice") | M | Phase 1 |
| 1.2 | Self-billed Invoice flag (only if both parties VAT registered, not for Simplified) | C | Phase 1 |
| 1.3 | Third party billed invoice on behalf of supplier | C | Phase 2 |
| 1.4 | Special transaction type flags: Nominal Supply / Export / Summary (not mutually exclusive) | C | Phase 2 |

### Section 2 — Invoice Identifiers
| # | Field | Obligation | Phase |
|---|---|---|---|
| 2.1 | Invoice Reference Number (IRN): unique sequential number per Article 53(5)(b) | M | Phase 1 |
| 2.2 | UUID (128-bit Universally Unique Invoice Identifier) | M | Phase 2 |
| 2.3 | Previous document (invoice/note) hash | M | Phase 2 |
| 2.4 | QR Code (fields per Annex 1) | M | Phase 2 |
| 2.5 | Invoice tamper-resistant counter value | M | Phase 2 |

### Section 3 — Date
| # | Field | Validation | Obligation | Phase |
|---|---|---|---|---|
| 3.1 | Invoice issue date (Article 53(5)(a)) | YYYY-MM-DD | M | Phase 1 |
| 3.2 | Invoice issue time | HH:mm:ss | M | Phase 1 |
| 3.3 | Supply date (if different from issue date, per Article 53(5)(g)) | YYYY-MM-DD | C | Phase 1 |

### Section 4 — Seller Identification
| # | Field | Obligation | Phase |
|---|---|---|---|
| 4.1 | Seller name (Article 53(5)(e)) | M | Phase 1 |
| 4.2 | Seller address (Article 53(5)(e)) | M | Phase 1 |
| 4.3 | Seller VAT registration number (or VAT group number) per Article 53(5)(c) | M | Phase 1 |
| 4.4 | Additional seller ID — one of: CR / MOMRA License / MLSD License / SAGIA License / Other ID (consists of: Type of ID + ID Number; CR of branch if multiple registrations) | M | Phase 2 |

### Section 5 — Buyer Identification
| # | Field | Obligation | Phase |
|---|---|---|---|
| 5.1 | Buyer name (Article 53(5)(e)) | M | Phase 1 |
| 5.2 | Buyer address (Article 53(5)(e)) | M | Phase 1 |
| 5.3 | Buyer VAT registration number (or VAT group number) — not mandatory for exports or internal supplies | C | Phase 1 |
| 5.4 | Additional buyer ID (if buyer not VAT registered) — one of: TIN / CR / MOMRA License / MLSD License / 700 Number / SAGIA License / National ID / GCC ID / Iqama Number / Passport ID (consists of: Type of ID + ID Number) — not mandatory for exports | C | Phase 2 |

### Section 6 — Order Reference
| # | Field | Obligation | Phase |
|---|---|---|---|
| 6.1 | Purchase order | O | Phase 2 |
| 6.2 | Contract number | O | Phase 2 |

### Section 7 — Line Items
| # | Field | Obligation | Phase |
|---|---|---|---|
| 7.1 | Goods or Service Description (Article 53(5)(f)) | M | Phase 1 |
| 7.2 | Goods or Service Code | O | Phase 2 |
| 7.3 | Unit Price (Article 53(5)(h)) | M | Phase 1 |
| 7.4 | Quantity (Article 53(5)(f)) | M | Phase 1 |
| 7.5 | Discount/rebate percentage at line item level | C | Phase 2 |
| 7.6 | Discount/rebate amount at line item level (Article 53(5)(h)) | C | Phase 1 |
| 7.7 | Subtotal exclusive of VAT | M | Phase 2 |
| 7.8 | VAT rate (Article 53(5)(i)) — mandatory if not Out of Scope or Exempt | C | Phase 1 |
| 7.9 | VAT category code | M | Phase 2 |
| 7.10 | VAT amount (Article 53(5)(j)) | M | Phase 1 |
| 7.11 | Subtotal inclusive of VAT | M | Phase 2 |

### Section 8 — Total Amounts
| # | Field | Obligation | Phase |
|---|---|---|---|
| 8.1 | Discount/rebate percentage at invoice level | C | Phase 2 |
| 8.2 | Discount/rebate amount at invoice level (Article 53(5)(h)) | C | Phase 2 |
| 8.3 | Invoice Taxable Amount per rate or exemption (Article 53(5)(h)) | M | Phase 2 |
| 8.4 | VAT Total (Article 53(5)(j)) — **must be in SAR** | M | Phase 1 |
| 8.5 | Invoice Gross Total inclusive of VAT — statement "Amount includes VAT" | M | Phase 1 |

### Section 9 — Payment Terms
| # | Field | Obligation | Phase |
|---|---|---|---|
| 9.1 | Payment means (cash / credit card / debit card / bank transfer / credit / other) | M | Phase 2 |
| 9.2 | Payment Terms (if credit payment) | O | Phase 2 |
| 9.3 | Supplier's Bank Account details (if credit payment) | O | Phase 2 |

### Section 10 — Notes
| # | Field | Obligation | Phase |
|---|---|---|---|
| 10.1 | Notes (free text for any information not captured in other fields) | O | Phase 2 |

### Section 11 — Special Tax Treatment
| # | Field | Obligation | Phase |
|---|---|---|---|
| 11.1 | Narration "Tax treatment applied to the supply" — required when tax not at standard rate (Article 53(5)(k)) | C | Phase 1 |

### Section 12 — Cryptographic Stamp
| # | Field | Obligation | Phase |
|---|---|---|---|
| 12 | Cryptographic Stamp (provided by ZATCA; must match invoice content) | M | Phase 2 |

---

## 6. Mandatory Fields — Simplified Tax Invoice (Annex 2)

### Section 1 — Type of Invoice
| # | Field | Obligation | Phase |
|---|---|---|---|
| 1.1 | Invoice Type Description: "Simplified Tax Invoice" (Article 53(8); document title must read "Simplified Tax Invoice") | M | Phase 1 |
| 1.2 | Third party billed invoice flag | C | Phase 2 |
| 1.3 | Special transaction type flags: Nominal Supply / Summary | C | Phase 2 |

### Section 2 — Invoice Identifiers
| # | Field | Obligation | Phase |
|---|---|---|---|
| 2.1 | Invoice Reference Number (IRN) | M | Phase 1 |
| 2.2 | UUID | M | Phase 2 |
| 2.3 | Previous invoice/note hash | M | Phase 2 |
| 2.4 | QR Code | M | Phase 1 |
| 2.5 | Invoice tamper-resistant counter | M | Phase 2 |

### Section 3 — Date
| # | Field | Validation | Obligation | Phase |
|---|---|---|---|---|
| 3.1 | Invoice issue date (Article 53(8)(a)) | YYYY-MM-DD | M | Phase 1 |
| 3.2 | Invoice issue time | HH:mm:ss | M | Phase 1 |
| 3.3 | Supply date (if different from issue date, per Article 53(7)(c and d)) | YYYY-MM-DD | C | Phase 2 |

### Section 4 — Seller Identification
| # | Field | Obligation | Phase |
|---|---|---|---|
| 4.1 | Seller name (Article 53(8)(b)) | M | Phase 1 |
| 4.2 | Seller address (Article 53(8)(b)) | M | Phase 1 |
| 4.3 | Seller VAT registration number (or VAT group number, Article 53(8)(b)) | M | Phase 1 |
| 4.4 | Additional seller ID — one of: CR / MOMRA License / MLSD License / SAGIA License / Other ID | M | Phase 2 |

### Section 5 — Buyer Identification (lighter than Tax Invoice)
| # | Field | Obligation | Phase |
|---|---|---|---|
| 5.1 | Buyer name — mandatory per Article 53(7) transactions and for private education/healthcare to citizens | C | Phase 2 |
| 5.2 | Buyer address | O | Phase 2 |
| 5.3 | Additional buyer ID — **National ID only**, mandatory for private education/healthcare supplies to citizens | C | Phase 2 |

### Section 6 — Order Reference
| # | Field | Obligation | Phase |
|---|---|---|---|
| 6.1 | Purchase order | O | Phase 2 |
| 6.2 | Contract number | O | Phase 2 |

### Section 7 — Line Items
| # | Field | Obligation | Phase |
|---|---|---|---|
| 7.1 | Goods or Service Description (Article 53(8)(c)) | M | Phase 1 |
| 7.2 | Goods or Service Code | O | Phase 2 |
| 7.3 | Unit Price | M | Phase 1 |
| 7.4 | Quantity | M | Phase 1 |
| 7.5 | Discount/rebate percentage | O | Phase 2 |
| 7.6 | Discount/rebate amount | O | Phase 2 |
| 7.7 | Subtotal exclusive of VAT | M | Phase 2 |
| 7.8 | VAT rate | O | Phase 2 |
| 7.9 | VAT category code | M | Phase 2 |
| 7.10 | VAT amount (Article 53(8)(e)) | O | Phase 2 |
| 7.11 | Subtotal inclusive of VAT (Article 53(8)(d)) — with statement "inclusive of VAT" | M | Phase 2 |

### Section 8 — Total Amounts
| # | Field | Obligation | Phase |
|---|---|---|---|
| 8.1 | Discount/rebate percentage at invoice level | O | Phase 2 |
| 8.2 | Discount/rebate amount at invoice level | C | Phase 2 |
| 8.3 | Invoice Taxable Amount per rate or exemption | C | Phase 2 |
| 8.4 | VAT Total (Article 53(8)(e)) — required if VAT total not entered, Gross Total must be entered | C | Phase 1 |
| 8.5 | Invoice Gross Total inclusive of VAT (Article 53(8)(d)) — statement "Amount includes VAT"; mandatory if VAT total and taxable amount not entered | C | Phase 1 |

### Section 9 — Payment Terms
| # | Field | Obligation | Phase |
|---|---|---|---|
| 9.1 | Payment means (cash / credit card / debit card / bank transfer / other) | O | Phase 2 |
| 9.2 | Payment Terms (if credit) | O | Phase 2 |
| 9.3 | Supplier's Bank Account details (if credit) | O | Phase 2 |

### Section 10 — Notes
| # | Field | Obligation | Phase |
|---|---|---|---|
| 10.1 | Notes | O | Phase 2 |

### Section 11 — Special Tax Treatment
| # | Field | Obligation | Phase |
|---|---|---|---|
| 11.1 | "Tax treatment applied to the supply" narration (when tax not at standard rate) | C | Phase 2 |

### Section 12 — Cryptographic Stamp
| # | Field | Obligation | Phase |
|---|---|---|---|
| 12 | Cryptographic Stamp (must match invoice content and device Cryptographic Stamp Identifier) | M | Phase 2 |

---

## 7. Credit/Debit Notes — Additional Fields

### Tax Invoice Credit/Debit Note (Annex 2, Page 30–31)
All fields same as Tax Invoice, plus:

| # | Field | Obligation | Phase |
|---|---|---|---|
| 1.1 | Invoice Type Description: "Credit Note" or "Debit Note" (enumerated value; document title is Credit Note or Debit Note per Article 54) | M | Phase 1 |
| 3.1 | Note issue date (Article 54(3)), YYYY-MM-DD | M | Phase 1 |
| 3.2 | Note issue time, HH:mm:ss | M | Phase 2 |
| 3.3 | Supply date, YYYY-MM-DD | C | Phase 1 |
| 13.1 | Reference to original invoice(s) the credit/debit note relates to | C | Phase 2 |
| 13.2 | Reason for issuance of credit/debit note (per VAT Implementing Regulation) | M | Phase 2 |

### Simplified Tax Invoice Credit/Debit Note (Annex 2, Page 32–33)
Same as Simplified Tax Invoice, plus:

| # | Field | Obligation | Phase |
|---|---|---|---|
| 1.1 | Invoice Type Description: "Credit Note" or "Debit Note" | M | Phase 1 |
| 3.1 | Note issue date (Article 54(3)), YYYY-MM-DD | M | Phase 1 |
| 3.2 | Note issue time, HH:mm:ss | M | Phase 2 |
| 3.3 | Supply date, YYYY-MM-DD | O | Phase 2 |
| 13.1 | Reference to original invoice(s) | C | Phase 2 |
| 13.2 | Reason for issuance | M | Phase 2 |

---

## 8. Timelines Summary

| Date | Event |
|---|---|
| 4th December 2021 | Phase 1 (Generation) effective for all persons subject to E-Invoicing Regulation |
| 1st January 2023 | Phase 2 (Integration) begins — applied in waves per target group |
| At least 6 months notice | ZATCA must notify each target group before their Phase 2 integration deadline |
| Within 24 hours | Reporting deadline for Simplified Tax Invoices to ZATCA (Phase 2) |
| TBD by subsequent resolution | Date after which e-invoices must be Cleared/Reported to claim input tax deduction |

---

## 9. Technical Mandates Summary

### Formats
- **Phase 1:** Any format acceptable provided all fields present.
- **Phase 2 (Integration):** XML is **mandatory** for generation and transmission. PDF/A-3 with embedded XML is optional for human-readable sharing with customers.

### Security Architecture
- **Hashing:** One-way algorithm; each invoice's hash embedded in the next invoice in sequence (chain integrity).
- **UUID:** 128-bit number ensuring global uniqueness per invoice/note.
- **ECDSA cryptography:** Used for signing and stamping.
- **Tamper-resistant counter:** Non-resettable, non-reformattable, increments per invoice/note.
- **TLS:** Required for all API connectivity.
- **Stamping key:** Non-exportable from security module; disk encryption required if software-stored.
- **Standard Secure Hashing Algorithms:** Required (specific algorithm referenced in "Electronic Invoice Security Implementation Standards" companion document).

### Archival / Record Keeping
- Export files must be named: `{VAT_registration_number}_{issuance_date}_{issuance_time}_{IRN}`.
- Must comply with Article (66) of VAT Implementing Regulation record-keeping requirements.
- Must provide all records, invoices, notes, and data to ZATCA upon request.
- Must be capable of offline archival without internet connection.

### API / Connectivity
- Must use ZATCA-specified API (published on ZATCA website).
- Tax Invoices: real-time submission + response (clearance before sharing with customer).
- Simplified Tax Invoices: periodic batch upload acceptable; queued when offline, catch-up on reconnect.
- Connection must be encrypted and authenticated (e.g., TLS).

---

## 10. E-Invoice Solution Compliance

### Compliance Verification (Clause Third, Fourth)
- A solution is "Compliant" after being verified by: ZATCA directly, OR an authorized third party, OR self-certification by the taxable person — per mechanisms set by ZATCA.
- ZATCA may authorize one or more entities to perform verification.

### Unit Registration
- The "Unit" is the core component that: generates tamper-proofing (hash chain), generates Cryptographic Stamps for Simplified Tax Invoices, and holds the Cryptographic Stamp Identifier.
- Each unit must generate only **one sequence** of Electronic Invoices (no parallel sequences permitted).
- Units used for Simplified Tax Invoices must be **registered with ZATCA** via the ZATCA portal.
- Persons must safeguard Cryptographic Stamp Identifiers from copying or unauthorized use.

---

## 11. Obligations on Persons Subject to E-Invoicing (Clause Seventh)

1. Generate all invoices and notes electronically from the day after grace period expiry.
2. Comply with all E-Invoicing Regulation provisions, this Resolution, and subsequent resolutions.
3. Adhere to all specified compliance timelines.
4. Maintain record keeping per Clause Fifth requirements.
5. **Notify ZATCA** of any incidents, technical errors, or emergencies hindering generation or integration. Resume and catch up promptly once resolved.
6. Must not use any non-compliant E-Invoice Solution.
7. Register units for Simplified Tax Invoices with ZATCA.
8. Preserve Cryptographic Stamp Identifiers securely; do not copy or use for unauthorized purposes.
9. Integrate E-Invoice solution with ZATCA systems from specified dates.
10. Share invoices and notes with ZATCA in **XML format** from integration dates.

---

## 12. Penalties (Clause Eighth)

> "Penalties and fines set forth under the VAT Law shall be applied on persons violating the E-Invoicing Regulation and this Resolution, according to the violation's classifications specified in the relevant Board of Directors' resolutions."

- Specific penalty amounts are **not stated in this document** — they reference the VAT Law and Board of Directors' resolutions.
- Violations are classified per those resolutions.

---

## 13. Third-Party / Foreign Solution Providers

- E-Invoice Solution compliance may be verified by **ZATCA, an authorized third party, or self-certification**.
- ZATCA "may authorize one or more entities to perform the verification procedures" (Clause Eighth, para 1).
- The resolution does **not explicitly address foreign/offshore solution providers or data residency requirements** in this document.
- Data residency is not specified here — the companion documents ("Electronic Invoice Security Implementation Standards", "Electronic XML Implementation Standards", "Electronic Invoice Data Dictionary") are referenced as integral parts of the annexes and may contain additional requirements.

---

## 14. Companion Documents Referenced (Integral Parts of Annexes)

The following documents are referenced as essential parts of the annexes and must be read alongside this resolution:

1. **Electronic Invoice Security Implementation Standards** — detailed security technical requirements (referenced in Annex 1).
2. **Electronic XML Implementation Standards** — detailed XML technical and functional requirements, business rules (referenced in Annex 2).
3. **Electronic Invoice Data Dictionary** — field definitions and specifications (referenced in Annex 2).

---

## 15. Key Definitions

| Term | Definition |
|---|---|
| Electronic Invoice | Tax Invoices and Simplified Tax Invoices generated electronically |
| Tax Invoice | Standard B2B invoice (Article 53(5) of VAT Implementing Regulation) |
| Simplified Tax Invoice | B2C invoice (Article 53(8) of VAT Implementing Regulation) |
| Electronic Notes | Credit and debit notes associated with electronic invoices |
| Clearance | ZATCA verifies Tax Invoice and applies Cryptographic Stamp before issuer shares with customer |
| Reporting | Issuer shares Simplified Tax Invoice (already stamped) with ZATCA within 24 hours of generation |
| Cryptographic Stamp | Electronic stamp via cryptographic algorithms ensuring authenticity, integrity, and issuer identity verification |
| Cryptographic Stamp Identifier | Unique identifier per Unit, issued by ZATCA portal; used to apply cryptographic stamp on Simplified Tax Invoices |
| Unit | Key component of E-Invoice Solution that generates hash chain, cryptographic stamp, and holds stamp identifier |
| UUID | 128-bit universally unique identifier per invoice/note |
| Hash | One-way encrypted fingerprint of invoice data; embedded in next invoice to prevent chain tampering |
| IRN | Invoice Reference Number — unique sequential number issued by taxpayer |
| QR Code | Matrix barcode for basic invoice validation |

---

*Extracted from Decision No. 62738, 23/11/1443 H. Extraction date: 2026-06-10.*
