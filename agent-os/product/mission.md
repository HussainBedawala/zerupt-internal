# Product Mission

> **The first agentic ERP that eliminates implementation entirely — signup to live with real data in under 2 hours, for every retailer in MENA, Southeast Asia, and India.**

---

## The Problem

Retail businesses across MENA, Southeast Asia, and India are forced to choose between two bad options:

1. **Enterprise ERPs** (SAP Business One, Oracle NetSuite) — $150-500/user/month, 6-18 month implementations, armies of consultants, built for Western markets and retrofitted for the region
2. **Budget ERPs** (Odoo, Zoho, ERPNext) — cheaper but still require implementation partners ($50-150/hr), shallow accounting, poor Arabic/RTL support, no native-language-first approach for regional markets, weak compliance

The result: **80% of mid-market retailers** either run on spreadsheets, disconnected legacy systems, or overpay for software that doesn't fit.

## What "Agentic ERP" Means for HSN

Not the SAP/Oracle definition of "we bolted AI onto a 20-year-old monolith." HSN Agentic ERP means:

1. **The system configures itself.** Answer a questionnaire. AI translates answers into a fully configured tenant: chart of accounts, tax profiles, branches, warehouses, currency settings, document numbering, roles and permissions. No consultant, no partner, no "implementation project."
2. **The system imports real data.** AI maps columns from Excel spreadsheets to HSN entities, validates data, suggests fixes for errors, and executes the import. The customer doesn't need to understand the data model.
3. **The system watches your back.** Background agents monitor accounting integrity, inventory anomalies, tax compliance, and onboarding adoption — surfacing suggestions, not just alerts.
4. **The system speaks your language.** HSN Copilot answers questions in natural language: "Show me slow-moving stock over 500 KWD," "What does customer X owe me?" No report builder needed for common queries.

## The "Zero Implementation Partner" Thesis

Mid-market retail is a bounded domain. Unlike enterprise manufacturing or healthcare, the configuration space is finite:
- A manageable set of inventory concepts (serialized, batch-tracked, simple SKU, weighted/measured)
- Known tax regimes across target regions (GCC VAT, India GST, Malaysia SST, etc.)
- ~3 COA complexity levels (standard, detailed, custom)
- Fully dynamic roles and permissions defined by the customer during onboarding

This means AI can reliably map questionnaire answers to configuration — no hallucination risk because the output space is enumerated, not generated.

## Dynamic Roles & Permissions (First "Aha" Moment)

Roles are **not predefined**. During onboarding, the system:
1. Asks the customer what types of employees they have and what each should be able to do
2. Shows actual permission options (grouped by module) for easy selection
3. Lets the customer describe roles in natural language — "my warehouse guy should only see stock and receive goods"
4. **AI suggests missing permissions** — if an owner creates a "Cashier" role but forgets to grant receipt printing or shift closing, the AI flags it: "Cashiers typically need receipt printing and shift close access. Add these?" This proactive suggestion is often the customer's first moment of realizing this isn't a normal ERP.

## Competitive Landscape

| Competitor | Their AI Approach | HSN Difference |
|---|---|---|
| **SAP (Joule)** | 600+ AI agents, but still requires certified partners for implementation (3-6 months) | HSN eliminates the implementation phase entirely. AI is the implementation partner. |
| **Oracle (NetSuite Next)** | Autonomous close, 600+ embedded agents. Still requires partners. $200-500/user/month. | HSN targets the segment NetSuite ignores: mid-market retail at $40-60/user/month with same-day go-live. |
| **Odoo 19** | Deep AI across modules. Open-source trap remains: real cost is implementation partners. | HSN has no implementation partner model at all. The product IS the partner. |
| **Rillet** | AI-native GL, 4-week implementation. $100M raised. | 4 weeks is still 4 weeks. HSN targets 2 hours. Rillet is GL only; HSN is full ERP. |
| **Campfire** | AI-native ERP, $100M raised. "Days-not-months." | No MENA/SEA/India focus, no Arabic-first, no 10 years of retail domain knowledge. |
| **Local/Legacy systems** | The real competition. Excel spreadsheets, desktop apps, systems like current Merpec. | They work but can't scale, can't integrate, and trap data in silos. |

## Our Unfair Advantage

1. **10 years of live retail operations.** Merpec has run in production across 20-100 retail businesses in Kuwait. Every workflow, edge case, and compliance requirement comes from real production use.
2. **Data flywheel from onboarding.** Every tenant that completes onboarding teaches the system what real-world spreadsheets look like, what COA structures retailers use, what tax configurations are common per country. After 1,000 onboardings, no competitor starting later can match this.
3. **Agent feedback loop.** Every accepted/dismissed suggestion improves agent thresholds. After 6 months across 100+ tenants, the agents understand domain-specific patterns that no generic AI can replicate.
4. **Speed-to-value as brand.** If HSN reliably delivers "signup to live in 2 hours" and this becomes the market expectation, any competitor requiring even 2 weeks is at a structural disadvantage.

## Target Market

### Retail Verticals (Dynamic, Not Fixed)

HSN does not hardcode verticals. Instead, the system groups retail businesses by **inventory concept** — the broadest useful categorization:

| Inventory Concept | Examples | Key System Behavior |
|---|---|---|
| **Serialized** | Electronics, mobile phones, appliances, jewelry | IMEI/serial tracking per unit from purchase to sale to warranty |
| **Batch-tracked** | Grocery, pharmacy, cosmetics, food & beverage | Expiry dates, batch numbers, FIFO costing |
| **Simple SKU** | Fashion, apparel, footwear, accessories, homeware | Size/color/variant attributes, no per-unit tracking |
| **Weighted/Measured** | Hardware, electrical, building materials, fabrics | Sold by weight/length/volume, partial unit quantities |
| **Mixed** | General trading, department stores, supermarkets | Combination of above — system handles per-item |

Beyond this, everything is driven by the customer's questionnaire answers. The system adapts — it doesn't force customers into a predefined vertical template.

### Geographic Strategy (Simultaneous Launch)

HSN launches across all target regions simultaneously with digital ads. The product is region-ready from day one:

| Region | Tax Compliance | Native Language | Fallback | Currency |
|---|---|---|---|---|
| **GCC** (Kuwait, KSA, UAE, Bahrain, Oman, Qatar) | VAT (5-15%), ZATCA e-invoicing (KSA) | Arabic (`ar`) — RTL | English (`en`) | KWD, SAR, AED, BHD, OMR, QAR |
| **India** | GST (CGST + SGST + IGST), e-invoicing, TDS/TCS | English (`en`), Hindi (`hi`) — Phase 2 | English (`en`) | INR |
| **Southeast Asia** (Malaysia, Indonesia, Philippines, Vietnam, Singapore) | SST (MY), PPN (ID), VAT (PH/VN/SG), MyInvois (MY) | Malay (`ms`) — Phase 2, Indonesian (`id`), Filipino (`tl`), Vietnamese (`vi`) — Phase 3 | English (`en`) | MYR, IDR, PHP, VND, SGD |

**Native-language-first principle:** The product launches in the user's preferred language. Arabic users see Arabic by default with proper RTL layout. Hindi, Malay, and other languages are added in phases. See `settings-admin/14-internationalization.md` for full i18n architecture.

No region is treated as "later." Tax profiles, COA templates, and compliance rules for all target countries are built into the onboarding pipeline from the start.

### Market Sizing

| Region | Retail Market | Addressable SaaS TAM |
|---|---|---|
| **GCC** | $280B+ retail | $800M-1.2B |
| **India** | $900B+ retail | $2-4B |
| **Southeast Asia** | $600B+ retail | $1.2-2.8B |
| **Combined** | $1.8T+ retail | **$4-8B SaaS opportunity** |

## Business Model

- **SaaS subscription** — $40-60/user/month, billed monthly or annually (20% annual discount)
- **All core modules included** (POS, Sales, Purchase, Inventory, Accounting, Reports, Dashboard)
- **Free trial** — 14-day full-access trial with AI-assisted onboarding
- **Future: per-module pricing** — Premium modules (HR/Payroll, E-commerce, Advanced BI, CRM) priced separately, Odoo-style module marketplace
- **Premium support** — Dedicated account manager, priority response, custom training
- **Data migration service** — Assisted migration from legacy systems (including existing Merpec)

## Year 1 Targets

| Metric | Target |
|---|---|
| Legacy migrations | 20+ existing Merpec customers |
| New acquisitions | 500+ customers across all regions |
| Monthly churn | < 3% |
| NPS | > 50 |
| Time to value | < 2 hours from signup to live |
| Support tickets per customer | < 3/month |
