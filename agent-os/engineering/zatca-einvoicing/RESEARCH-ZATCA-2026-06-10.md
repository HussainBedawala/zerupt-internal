# ZATCA E-Invoicing (Fatoorah) — Deep Research & Zerupt Integration Brief

> **Date:** 2026-06-10 · **For:** Zerupt (retail ERP) Saudi Arabia compliance
> **Method:** Multi-agent deep-research (99 agents, 17 sources fetched, 55 claims extracted, 25 adversarially verified 3-vote, 18 confirmed). Sources prioritised zatca.gov.sa + Big-Four tax advisories + active KSA compliance-SaaS vendors.
>
> ⚠️ **Confidence map.** Regulatory scope/timeline/onboarding facts below are **verified (3-0 / 2-1 votes, official sources)**. The **deep technical layer** (QR TLV tags, UBL field list, signature internals) is marked **[TECH — verify against official PDF]**: ZATCA's own technical PDFs (E-Invoicing Detailed Technical Guideline, QRCodeCreation.pdf, Developer Portal Manual, XML Implementation Standard) were **not machine-fetchable** during research and MUST be downloaded and read directly before writing the signing/XML code. Links in the Sources section.

---

## 0. TL;DR for Zerupt

- **ZATCA e-invoicing ("Fatoorah") is mandatory** for essentially all VAT-registered businesses resident in Saudi Arabia. Two phases: **Phase 1 (Generation)** live since **4 Dec 2021**; **Phase 2 (Integration)** rolling out in waves since **1 Jan 2023**.
- **Wave 24 (compliance window 1 Apr – 30 Jun 2026)** drops the threshold to **SAR 375,000** annual VAT-subject revenue (any of 2022/2023/2024) — this pulls in **nearly every SME retailer**, i.e. exactly Zerupt's target customer. ZATCA Phase 2 is now effectively universal.
- **No vendor certification exists.** ZATCA does NOT approve or certify ERP software. The "Solution Providers Directory" is explicitly **non-binding, not an approval**. **Compliance is the taxpayer's legal responsibility**; Zerupt's only job is to build a technically-conformant solution.
- **No nationality restriction on the software vendor.** An Indian-registered company (Malakstar) can lawfully provide a ZATCA-compliant SaaS to KSA taxpayers. There is **no requirement for a KSA entity or local presence to be a software vendor.**
- **The taxpayer onboards, per device (EGS).** Each tenant uses an **OTP from the Fatoora portal** to obtain a **Compliance CSID (CCSID)**, passes compliance checks, then gets a **Production CSID (PCSID)**. Zerupt automates this flow but the credential belongs to the taxpayer.
- **Two invoice flows:** **Standard (B2B/B2G)** → **real-time Clearance** (ZATCA stamps before you give it to the buyer). **Simplified (B2C)** → issue immediately, **Report within 24h**.
- **For a June 15 MVP:** ship **Phase 1 (offline generation + QR)** — it's small and unblocks any KSA pilot. **Phase 2 (API integration + CSID + XAdES signing)** is a larger, separate epic.

---

## 1. What ZATCA E-Invoicing Is

**ZATCA** = Zakat, Tax and Customs Authority (the Saudi tax authority, formed by merging GAZT + Customs). **Fatoorah / FATOORA** is the brand name of the e-invoicing programme and the integration platform.

- **Legal basis:** VAT Law + VAT Implementing Regulations + the **E-Invoicing Regulation** (Resolution issued Dec 2020) and subsequent ZATCA decisions defining controls, requirements, technical specs, and procedures. Each wave is set by a separate ministerial/ZATCA decision.
- **What it is:** A mandate to **generate, store, and (Phase 2) transmit** invoices electronically in a structured format, replacing paper/PDF-only invoices. An invoice is only legally valid if produced by a compliant **EGS (E-invoicing Generation Solution)**.
- **Scope — who must comply** *(verified, official + EY)*:
  - All **VAT-registered taxpayers resident in KSA**.
  - **Any third party issuing tax invoices on behalf of** a VAT-subject supplier.
  - **Excludes non-resident taxpayers** (a non-resident who is VAT-registered for KSA is not in scope for issuing under this regime).
  - Applies to B2B, B2G, and B2C.

---

## 2. Phase 1 — "Generation" (live since 4 Dec 2021) ✅ verified

**Mandatory since 4 December 2021 for all in-scope taxpayers.** Requirements:

- Invoices must be **generated and stored electronically** through a **Phase-1-compliant solution**. No more handwritten or free-text Word/Excel invoices.
- **Two invoice types** must be supported:
  - **Standard tax invoice** (B2B/B2G) — full invoice with buyer details.
  - **Simplified tax invoice** (B2C / retail point-of-sale).
- **QR code is mandatory on Simplified (B2C) invoices** in Phase 1 (and recommended/becomes mandatory on standard later). [TECH] The QR encodes a TLV/Base64 payload (see §5).
- Invoices must include all VAT-required fields (seller name + VAT number, timestamp, VAT total, invoice total with VAT, etc.).
- **NO integration / NO transmission to ZATCA in Phase 1.** Nothing is sent to any platform — generation + storage + QR only.
- **Prohibited functions:** the solution must NOT allow uncontrolled deletion/editing of invoices, no anonymous access, no time manipulation, etc. (anti-tampering controls).

**Zerupt impact:** Phase 1 is small and self-contained. If Zerupt generates structured invoices, prevents tampering of issued invoices (immutable audit log — already a Zerupt principle), and prints the correct QR on B2C receipts, it satisfies Phase 1. **This is the right MVP target.**

---

## 3. Phase 2 — "Integration" (since 1 Jan 2023, in waves) ✅ verified

Phase 2 adds **real-time/near-real-time integration with the Fatoora platform** on top of Phase 1. New requirements:

- **Integrate the EGS with ZATCA's Fatoora platform** via API and **transmit every e-invoice and e-note**.
- **Structured XML in UBL 2.1** (KSA-customised standard) — see §5. (Phase 1 allowed more freedom; Phase 2 fixes the format.)
- **Cryptographic stamp (CSID)** on each invoice, plus **UUID**, **previous-invoice-hash (PIH)** chaining, and **digital signature**.
- **Two transmission models:**
  - **Standard invoices (B2B/B2G) → Clearance (real-time, synchronous).** The invoice XML is sent to ZATCA's **Clearance API**; ZATCA validates, applies its **cryptographic stamp**, and returns the cleared invoice. **The cleared invoice is the legally valid one to share with the buyer** — you cannot deliver it to the customer until cleared.
  - **Simplified invoices (B2C) → Reporting (within 24 hours).** The invoice is issued to the customer **immediately** (QR on receipt), then submitted to ZATCA's **Reporting API within 24h**. ZATCA acknowledges (it does not gate the sale).
- **Advance notice:** ZATCA notifies each wave's taxpayers in advance (historically ~6 months; Wave 24 got ~9 months). *(Note: the literal "always ≥6 months" claim was refuted 1-2 — treat the notice period as "generous but not a fixed guarantee.")*

---

## 4. Wave Timeline & Thresholds (current as of 2026-06-10) ✅ verified

Phase 2 rolls out wave-by-wave, **threshold descending over time** (big enterprises first, SMEs last):

| Wave | VAT-subject revenue threshold | Compliance window |
|------|-------------------------------|-------------------|
| Wave 1 | SAR 3 billion+ (in 2021) | from 1 Jan 2023 |
| … (waves 2–22) | progressively lowered (billions → low millions) | through 2025 |
| **Wave 19** | **SAR 1.75M** (2022/2023/2024) | deadline ~Sep 2025 |
| **Wave 23** | **SAR 750,000** (any of 2022/2023/2024) | **1 Jan – 31 Mar 2026** |
| **Wave 24** | **SAR 375,000** (any of 2022/2023/2024) | **1 Apr – 30 Jun 2026** |

> ⚠️ **Wave 24 is the big one for Zerupt.** SAR 375,000/yr is a small retailer. After Wave 24, essentially **all VAT-registered KSA retail businesses are in Phase 2 scope.** Any KSA customer Zerupt onboards in 2026 will almost certainly need **full Phase 2 integration, not just Phase 1.**
>
> ⚠️ **Time-sensitive:** Wave 24 deadline is **30 Jun 2026** — 20 days out as of this research. Newer waves (25+) very likely already announced/coming; **check zatca.gov.sa for the latest wave list before quoting thresholds to a customer.**

---

## 5. Technical Specifications

> **[TECH — verify against official PDF]** This whole section combines verified findings with established ZATCA technical knowledge from vendor implementations (Microsoft Dynamics 365, Zoho, SAP, dev.to UBL/XAdES guide). The fetchers could **not** open ZATCA's own technical PDFs. **Download and read these before coding §5.2–5.5:**
> - E-Invoicing Detailed Technical Guideline
> - ZATCA E-Invoice **XML Implementation Standard**
> - **QRCodeCreation.pdf**
> - E-Invoicing **Security Features** Implementation Standards
> - Developer Portal Manual + the **ZATCA SDK** (offline validation/signing toolkit)

### 5.1 Invoice format
- **Phase 2 format: XML, UBL 2.1**, KSA-customised. (Standard invoices may be presented as XML; simplified often as a PDF/A-3 with embedded XML on the printed receipt — *the blanket "XML or PDF/A-3 + stamp + UUID for all" claim was refuted 1-2, so the exact per-type format rules must come from the XML Implementation Standard*.)
- Each invoice carries a **UUID** (separate from the human invoice number) and an **Invoice Counter Value (ICV)** — a monotonic per-device counter.

### 5.2 Hash chain (PIH) [TECH]
- Each invoice stores the **hash of the previous invoice (PIH)** → forms a tamper-evident chain per device. First invoice uses a defined base value (SHA-256 of "0" Base64-encoded, per ZATCA convention).
- The invoice hash itself is **SHA-256** over the canonicalised XML.

### 5.3 Digital signature [TECH — medium confidence]
- **XAdES (XML Advanced Electronic Signature), EPES profile**, using **SHA-256** hashing and the device's **private key** (ECDSA, secp256k1 per ZATCA). The EGS signs; ZATCA verifies with the corresponding public key embedded in the CSID certificate.
- Simplified invoices are **signed by the EGS** (device cryptographic stamp). Standard invoices are additionally **stamped by ZATCA** on clearance.
- *Confidence medium: rests on Qeemah (vendor) + MS Dynamics docs, not the official Security Standards PDF. Confirm signature algorithm/curve/profile before implementing.*

### 5.4 QR code — TLV / Base64 [TECH — verify against QRCodeCreation.pdf]
The QR on the printed (simplified) invoice encodes a **Base64-encoded TLV** (Tag-Length-Value) byte string. Established tag set:

| Tag | Field |
|-----|-------|
| 1 | Seller name |
| 2 | Seller VAT registration number |
| 3 | Invoice timestamp (ISO 8601) |
| 4 | Invoice total (with VAT) |
| 5 | VAT total |
| 6 | Hash of XML invoice |
| 7 | ECDSA signature (cryptographic stamp) |
| 8 | ECDSA public key |
| 9 | ZATCA's stamp signature (for standard invoices that ZATCA stamped) |

- **Phase 1:** tags 1–5 only (the basic five).
- **Phase 2:** all of 1–9 (adds hash, signature, public key, and ZATCA stamp).
- Encoding: build TLV bytes → Base64 → render as QR. **Verify exact tag numbering, encoding, and Phase-1-vs-2 tag set against QRCodeCreation.pdf — do not ship from this table alone.**

### 5.5 API surface (Fatoora platform) [TECH]
Per-device onboarding + transmission endpoints (exact paths in the Developer Portal Manual; environments: **Sandbox/Developer Portal → Simulation → Production**):
- **Compliance CSID API** — submit CSR + OTP → receive **CCSID** (for compliance testing).
- **Compliance Checks API** — submit sample invoices signed with CCSID; pass to qualify.
- **Production CSID API** — using CCSID, request **PCSID** (live credential).
- **Clearance API** — standard (B2B/B2G) invoices, synchronous, returns ZATCA-stamped XML.
- **Reporting API** — simplified (B2C) invoices, within 24h, returns acknowledgement.
- **Renewal API** — renew PCSID before expiry. *(PCSID validity period — secondary sources say ~1 year — was refuted 0-3, i.e. unconfirmed. Confirm the actual validity/renewal rule before relying on it.)*

---

## 6. Device Onboarding Flow (per EGS) ✅ verified (MS Dynamics docs, 3-0)

Each **EGS unit (device/solution instance per taxpayer)** onboards:

1. **Generate a CSR** (Certificate Signing Request) with the taxpayer's business details (VAT number, org, EGS identifiers).
2. **Get an OTP** from the taxpayer's **Fatoora portal** account.
3. **Submit CSR + OTP** → receive **Compliance CSID (CCSID)**.
4. **Run compliance checks:** submit **sample invoices** signed with CCSID:
   - **3 samples** if the EGS supports **standard invoices only** (doc type code 1000).
   - **6 samples** if it supports **both standard + simplified** (doc type code 1100).
   - (Standard-only=1000, simplified-only=0100, both=1100.)
5. **On pass → request Production CSID (PCSID)** using the CCSID.
6. **Go live** — sign with PCSID, call Clearance/Reporting.

> **Multi-tenant note for Zerupt:** the OTP + CSR + CSID is **per taxpayer (and per EGS device)**. The credential legally belongs to the taxpayer. Zerupt can **automate and orchestrate** this flow in-product (taxpayer pastes the OTP from their Fatoora portal, Zerupt generates the CSR, calls the APIs, stores the CSID securely per tenant), but Zerupt **cannot become the single shared credential** for all tenants. **Open question:** whether/how a SaaS may centralise onboarding on behalf of tenants and the data-custody/liability implications — confirm with a KSA tax advisor.

---

## 7. Standard vs Simplified — the two flows

| | **Standard (Tax) Invoice** | **Simplified Invoice** |
|---|---|---|
| Use | B2B, B2G | B2C / retail POS |
| Buyer details | Required (buyer VAT/address) | Minimal |
| Phase 2 flow | **Clearance** — real-time, ZATCA stamps **before** you give it to buyer | **Reporting** — issue now, send to ZATCA **within 24h** |
| QR | Phase 2 | **Mandatory Phase 1 + 2** |
| Blocks the sale? | Yes — must clear first | No — sale proceeds, report after |
| Signature | EGS signs + **ZATCA stamps** | **EGS signs** (device stamp) |

**Retail reality for Zerupt:** most POS transactions are **simplified/B2C → Reporting (24h, async, non-blocking)**. This is friendlier for an offline-tolerant POS: issue receipt instantly, queue the report, transmit when online. B2B sales (wholesale, invoicing a registered company) hit the **blocking clearance** path — needs online connectivity at issue time.

---

## 8. Vendor Certification & Environments ✅ verified

- **There is NO mandatory ZATCA certification/approval for software vendors.** *(The "vendors must pass a qualification process" claim was refuted 0-3.)*
- ZATCA's **Solution Providers Directory** is **"a guiding list (non-legally binding) … not considered as an approval by ZATCA."** Listing is marketing, not compliance.
- **Taxpayers may use any solution** as long as the solution itself complies. Compliance liability sits with the **taxpayer**, not the vendor.
- **Environments** (for building/testing): **Developer Portal / Sandbox** → **Simulation** → **Production**. Compliance checks (the 3/6 sample invoices) are how a *device* qualifies — that's per-taxpayer onboarding, **not** a vendor certification.

> **Implication:** Zerupt does **not** need ZATCA sign-off to ship. It needs to (a) produce technically conformant invoices/XML/QR/signatures and (b) pass the per-tenant compliance-checks step during each customer's onboarding. Getting listed in the directory later is optional GTM polish.

---

## 9. Foreign (Indian) Vendor — Malakstar Regulatory Position ✅ verified (core), ⚠️ (data residency open)

**Context:** Zerupt has no legal entity; it operates under **Malakstar Software Solutions Pvt Ltd (India)**. Findings:

- ✅ **No nationality / origin restriction on the software vendor.** ZATCA places requirements on the *solution* and the *taxpayer*, not on the vendor's country of incorporation. An Indian Pvt Ltd can lawfully sell a ZATCA-compliant SaaS to KSA taxpayers.
- ✅ **No KSA local entity or local presence required to be a software vendor.** (Different from being the *taxpayer* — the taxpayer must be the KSA-resident business.)
- ✅ **The taxpayer onboards and holds the CSID**, not Malakstar. Malakstar/Zerupt provides the tooling.
- ⚠️ **Data residency — OPEN / unresolved.** Research surfaced a signal that **solutions hosted outside KSA must provide local access capability** (i.e. ZATCA/auditor can access invoice data within KSA on request), and there are general indications of data-handling expectations. But whether invoice XML must be **stored/processed on servers physically in KSA** could **not** be confirmed. **This directly affects Zerupt's stack (Vercel/Railway/Neon — none KSA-region by default).**

> 🔴 **Action required (legal):** Before selling into KSA, get a **KSA tax/legal advisor** (Big Four or local) to confirm:
> 1. Any **data localization/residency** obligation for invoice data hosted abroad.
> 2. Whether a foreign SaaS needs any **registration** with ZATCA or local representation for *data access*.
> 3. Contracting/liability: since Malakstar (India) is the vendor and the taxpayer carries compliance liability, ensure **terms of service disclaim tax-compliance liability** and define the data-processing relationship.
> 4. VAT on the SaaS subscription itself (KSA reverse-charge on B2B imported services) — a billing question for Razorpay/invoicing, separate from e-invoicing.

---

## 10. Penalties for Non-Compliance ⚠️ unverified (treat as indicative)

Vendor/advisory sources cite fines in the **SAR 5,000–50,000 per violation** range (failure to issue/store e-invoices, missing QR, not integrating, tampering, deletion of invoices), escalating for repeat offences, with warnings for first violations. **These figures did not survive into the verified set** — confirm exact penalty schedule against ZATCA's official enforcement/penalty notices before putting numbers in customer-facing material.

---

## 11. Concrete Zerupt Integration Checklist

### Phase 1 (Generation) — **MVP-sized, do first**
- [ ] Structured invoice generation (standard + simplified) with all VAT-mandatory fields.
- [ ] Seller VAT registration number captured in tenant/onboarding settings (KSA tenants).
- [ ] **QR code on simplified/B2C receipts** — TLV tags 1–5, Base64, rendered on receipt (verify against QRCodeCreation.pdf).
- [ ] Immutable issued-invoice store (no edit/delete of issued invoices — Zerupt already does immutable audit logs ✅). Corrections via credit/debit notes only.
- [ ] Anti-tampering controls: no time manipulation, controlled access, sequential numbering.
- [ ] Arabic + English invoice rendering (Zerupt already bilingual ✅).

### Phase 2 (Integration) — **separate epic, larger**
- [ ] UBL 2.1 KSA XML serialiser (standard + simplified, e-notes/credit-debit).
- [ ] **UUID + ICV (per-device counter) + PIH hash chain** (SHA-256).
- [ ] **XAdES-EPES signing** with device private key (ECDSA secp256k1) — likely use/validate against the **ZATCA SDK**.
- [ ] **QR tags 6–9** added (hash, signature, public key, ZATCA stamp).
- [ ] **Onboarding flow in-product:** CSR generation → OTP capture (from tenant's Fatoora portal) → CCSID → compliance-checks (3 or 6 samples) → PCSID. Per tenant, per EGS device.
- [ ] **Secure per-tenant CSID/private-key storage** (HSM/KMS-grade; these are signing keys → security-reviewer + secrets handling).
- [ ] **Clearance client** (standard/B2B): synchronous, block delivery until cleared, handle ZATCA-stamped XML response.
- [ ] **Reporting client** (simplified/B2C): **durable queue** (BullMQ — Zerupt already has it ✅), 24h SLA, retry/backoff, offline tolerance, dead-letter + alerting.
- [ ] **PCSID renewal** automation before expiry.
- [ ] Map ZATCA validation errors → user-friendly bilingual messages (defensive UX).
- [ ] Sandbox → Simulation → Production environment config per tenant.
- [ ] Multi-tenant isolation: CSIDs/keys/counters strictly per-tenant DB (fits Zerupt's per-tenant Postgres ✅).

### Architecture fit notes
- Reporting's async 24h window maps cleanly onto **BullMQ + Upstash**. Clearance's synchronous gating needs a blocking call in the sales-confirm path with a clear UX for "awaiting ZATCA clearance."
- The hash-chain (PIH) + ICV are **per-device sequential** → needs careful concurrency control per tenant (no gaps/dupes) — a natural fit for a single serialised queue per tenant device.
- Consider an **isolated ZATCA module** (NestJS) with a clean port interface, so the crypto/XML/API complexity is quarantined and testable. **100% test coverage** (financial/compliance code per Zerupt rules).

---

## 12. Open Questions (resolve before/while building Phase 2)
1. **PCSID validity & renewal rule** — exact period and what happens on expiry (does submission halt?). *(unconfirmed — refuted 0-3.)*
2. **Exact mandatory vs conditional XML fields** per type (standard vs simplified) and per phase — from the **XML Implementation Standard**.
3. **Multi-tenant onboarding** — can a SaaS centralise CSID onboarding on behalf of tenants, or must each tenant do their own OTP/CSR per device? Data-custody/liability implications.
4. **Data residency** — must invoice XML be stored/processed on KSA-physical servers? Affects Vercel/Railway/Neon hosting (see §9). **Legal sign-off needed.**
5. **Penalty schedule** — confirm exact fines from official ZATCA notices (§10).
6. **Latest wave list** — is there a Wave 25+ beyond the SAR 375k threshold; what's the post-Wave-24 catch-all for new registrants?

---

## Sources

**Primary (official ZATCA):**
- Roll-out phases — https://zatca.gov.sa/en/E-Invoicing/Introduction/Pages/Roll-out-phases.aspx
- Solution Providers Directory (non-binding) — https://zatca.gov.sa/en/E-Invoicing/SolutionProviders/Pages/SolutionProvidersDirectory.aspx
- Wave 24 announcement — https://zatca.gov.sa/en/Pages/news_1426.aspx
- Wave 19 announcement — https://zatca.gov.sa/en/MediaCenter/News/Pages/news_1327.aspx

**Official PDFs — ⚠️ NOT machine-fetched; download & read directly before coding:**
- E-Invoicing Implementation Resolution (EN) — https://zatca.gov.sa/en/E-Invoicing/Introduction/LawsAndRegulations/Documents/E-Invoicing%20Implementation%20Resolution_EN.pdf
- Detailed Technical Guideline — https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-invoicing-Detailed-Technical-Guideline.pdf
- QR Code Creation — https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Documents/QRCodeCreation.pdf
- Developer Portal Manual — https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/DEVELOPER-PORTAL-MANUAL.pdf

**Secondary (Big-Four / vendor / authoritative):**
- EY — Wave 24 alert; EY — Wave 23 alert
- Microsoft Dynamics 365 — KSA e-invoicing onboarding (onboarding flow, 3/6 samples, doc-type codes)
- Out2sol — Phase 2 integration explained (clearance vs reporting)
- Qeemah Cloud — CSID / digital signature guide (XAdES-EPES, SHA-256) *[vendor, medium confidence]*
- Jibrid — Phase 2 API integration guide; Orchida — KSA e-invoicing FAQ
- dev.to (webkoding) — UBL XML + XAdES signing + hash chains implementation walkthrough

---
*Generated by deep-research (Haiku/Sonnet agents, no Opus). Regulatory facts verified; technical layer flagged [TECH] pending official-PDF confirmation.*
