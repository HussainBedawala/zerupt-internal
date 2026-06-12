# Persona A — The Clean Client (Easy Path)

> **Test purpose:** the golden path. If onboarding is *not* effortless for this customer, nothing else
> matters. Fawzia proves the happy path works end-to-end with zero ambiguity, no decision cards, and a
> trial balance that ties to zero on the first pass.

---

## The Person

**Name:** Fawzia Al-Rashed
**Age:** 38
**Role:** Owner-operator
**Business:** **Layla Boutique** — women's fashion & accessories
**Location:** Salmiya, Kuwait (single shop on Salem Al-Mubarak Street)
**Tech comfort:** High. Lives in Excel, manages her own Instagram shop, comfortable on her phone and laptop.
**Language:** Bilingual (Arabic native, fluent English). Keeps her business records **in English** with
consistent headers because that's how her previous POS exported them.
**Temperament:** Organized, detail-oriented, a little impatient. She did a full physical stock count last
week specifically so the migration would be clean. She expects the system to "just work."

## The Business

- Single boutique, ~85 m². Founded 2019 (6 years operating).
- ~600 active SKUs across clothing, abayas, bags, accessories, perfumes.
- Revenue ≈ **KWD 45,000/month**. Average basket ≈ KWD 22.
- 3 staff: Fawzia + 2 sales assistants. One counter, one card terminal (KNET + Visa).
- Was on a small cloud POS (Foodics-style) she's outgrown; exports are clean CSVs.
- **Not VAT registered** — Kuwait has no VAT regime, so tax setup is a no-op. This is the *correct*
  zero-tax baseline to verify.
- Books kept on a **calendar fiscal year (Jan–Dec)**, cash-and-card only, no post-dated cheques,
  single currency (KWD).

---

## Onboarding Answers (every question, in order)

### Step 1 — Business Info
| Question | Answer |
|---|---|
| Legal company name | **Layla Boutique General Trading Co. W.L.L.** |
| Trading / brand name | **Layla Boutique** |
| Country | **Kuwait** |
| Company registration number | **123456/2019** |
| Industry | **General merchandise & homeware** (closest fit; she sells fashion + accessories) |
| How do you track inventory? | **Simple SKU** |
| Preferred language | **English** |
| Years operating | **6** |

### Step 2 — Locations
| Question | Answer |
|---|---|
| Number of branches | **1** |
| Branch 1 — name / city / timezone | **Salmiya Shop** / Salmiya / Asia–Kuwait |
| Does each branch keep its own stock? | **No, stock is shared** (only one branch anyway) |
| Storage-only warehouses? | **No** |
| Move stock between branches? | **No, we don't** |

### Step 3 — Accounting
| Question | Answer |
|---|---|
| Main currency | **KWD (Kuwaiti Dinar)** |
| More than one currency? | **No, just our main one** |
| Financial year start | **January** |
| Handle post-dated cheques? | **No, we don't** |
| Chart of accounts | **Use our standard chart** (country-tuned Kuwait COA) |

### Step 4 — Tax
| Question | Answer |
|---|---|
| Tax regime (Kuwait) | **No tax to set up** — static notice, nothing to answer ✅ |

### Step 5 — Team & Roles
| Question | Answer |
|---|---|
| How many people will use the system? | **3** |

### Step 6 — Point of Sale
| Question | Answer |
|---|---|
| Sell at a counter? | **Yes** |
| How many registers/terminals? | **1** |
| How do you print receipts? | **Thermal printer (80mm roll)** |
| Print receipts in both Arabic & English? | **Yes** |
| Which payments do you accept? | **Cash, KNET, Visa / Mastercard, Store credit** |

### Step 7 — Data Sources
| Question | Answer |
|---|---|
| What are you using today? | **Another ERP or software** → "Foodics" |

### Import Screen — which data she brings in
She imports **all 8 categories** because her data is clean:

| Category | Bring in? | Notes |
|---|---|---|
| Categories | **Yes** | 8 tidy categories, no duplicates |
| Products | **Yes** | ~600 SKUs (sample of 30 in test data), clean headers |
| Customers | **Yes** | ~120 loyalty customers, valid +965 phones |
| Customer outstanding (AR aging) | **Yes** | Small — a few store-credit customers; ties out |
| Suppliers | **Yes** | 6 suppliers |
| Supplier outstanding (AP aging) | **Yes** | Ties to AP in TB |
| Opening stock | **Yes** | Matches last week's physical count |
| Opening balances (trial balance) | **Yes** | Accountant-prepared, balances to zero |

### Opening-balance / stock setup sub-questions
| Question | Answer |
|---|---|
| Company | **Layla Boutique General Trading Co. W.L.L.** (only entity, auto-selected) |
| When are these balances from? | **Start of fiscal year** — locked to **2025-12-31** (day before FY2026 starts) |
| Opening stock as-of date | **2025-12-31** |
| Opening stock reason | "Initial stock load from Foodics — physical count Dec 2025" |

---

## What This Persona Tests (happy path checklist)

- [ ] Wizard completes start-to-finish with no validation errors and no back-tracking.
- [ ] Kuwait → **zero-tax** path renders the "No tax to set up" notice (no VAT fields shown).
- [ ] Mira **auto-maps every column** on the first pass, high confidence, **zero decision cards**.
- [ ] Categories → Products dependency satisfied (categories imported first, products link cleanly).
- [ ] Customers → AR aging and Suppliers → AP aging dependencies satisfied.
- [ ] Opening stock quantities import with no negatives, no blanks, single location.
- [ ] **Trial balance balances to zero** → Go-Live reconciliation panel shows debits = credits.
- [ ] Go-Live readiness checklist shows **no blockers**.
- [ ] First sale → 80mm bilingual thermal receipt prints correctly (KWD 3-decimal / fils).

---

## Expected Result

**Live in well under 2 hours**, probably under 30 minutes. No human intervention, no Mira escalations.
This is the control case — any friction here is a P0 bug on the core promise.
