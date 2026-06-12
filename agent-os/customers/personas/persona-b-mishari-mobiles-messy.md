# Persona B — The Messy Client (The Wedge / Torture Test)

> **Test purpose:** the *real* business case. Clean clients don't need an agentic ERP — a spreadsheet
> does. The entire "signup to live in under 2 hours" promise lives or dies on whether the system can
> absorb **Abu Mishari's mess** without him giving up. Every messy row must become a *reviewable
> decision*, never a hard failure. He is the [[feedback_assume_dumb_customers]] customer: one bad
> import and he walks.

---

## The Person

**Name:** Saleh Al-Otaibi — known to everyone as **Abu Mishari**
**Age:** 54
**Role:** Owner. Runs everything personally; trusts no one with the money.
**Business:** **Mishari Mobiles & Accessories** — phones, accessories, repairs, prepaid top-ups
**Locations:** **2 branches** — Hawally (main) + Salmiya (smaller)
**Tech comfort:** **Very low.** Runs the business from a paper ledger, his memory, and WhatsApp. His
nephew built him a half-finished Excel sheet two years ago that he never really maintained.
**Language:** Arabic only. Types Arabic on an old Windows machine in **Windows-1256 encoding** → his
exports are full of mojibake when opened as UTF-8. Mixes Arabic and English in the same cell freely.
**Temperament:** Impatient, distrustful of "computer systems," proud. He will **close the laptop
halfway through**. He would much rather *talk* than type. If the system throws a red error at him, he's
gone. If it explains a problem calmly in Arabic and offers to fix it, he stays.

## The Business

- Two shops. Hawally is the main store + repair bench; Salmiya is a smaller satellite.
- Mix of **high-value IMEI-tracked phones** and **cheap no-barcode accessories** (cables, cases, glass
  protectors, chargers). ~2,000+ SKUs, many duplicated under different spellings.
- **Cash-heavy.** Lots of informal credit ("on the book") to regulars. KNET terminal in Hawally only.
- Revenue ≈ **KWD 60–70k/month** combined, but he genuinely doesn't know the exact figure.
- Was on a cheap **offline POS** in Hawally that broke; Salmiya was never on any system (paper only).
- **Not VAT registered** (Kuwait, no VAT) — but his data has random "KD" and tax-looking junk in it.
- Fiscal year he *thinks* is January but his old accountant actually closed books in **April**. This
  ambiguity is intentional — it tests the conversion-date / mid-year cutover flow.

---

## The Data He Hands You (the nightmare — exactly what the engine must absorb)

| Problem | What it looks like in his files |
|---|---|
| **Mixed languages in one cell** | `iPhone 13 ابو حافظة 128 جيجا` (English + Arabic + spec mashed) |
| **Inconsistent headers** | `الصنف` in one file, `Item` in another, `desc` in a third |
| **Encoding garbage (Win-1256 as Latin-1)** | Arabic renders as `ÇáåÇÊý` / `ÌáßÓí` |
| **Mixed price units** | Some KWD (`45.500`), some fils (`45500`), some with text (`45 KD`, `45.5 د.ك`) |
| **Duplicate items, different spellings** | `Samsung A54`, `samsung a 54`, `جالكسي A54`, `Galaxy A 54` |
| **IMEI chaos** | IMEIs buried in a free-text notes column; some 15-digit, some with spaces, some missing |
| **Two branches in one file** | Hawally + Salmiya stock dumped together; location half-filled / guessed |
| **Opening balances don't tie** | Customer outstanding total ≠ AR in the "trial balance" — off by ~KWD 1,200 |
| **"Trial balance"** | A half-built Excel that does **not** balance (debits ≠ credits) + a photo of a handwritten page |
| **Negative / impossible stock** | Quantities like `-3`, blanks, Arabic text `خلصت` ("finished") in a number column |
| **Ghost categories** | Everything dumped under `اكسسوارات` (accessories) or left blank |
| **Phone format chaos** | `99887766`, `+965 9988 7766`, `00965-99887766`, `965 9 988 7766`, missing entirely |
| **Duplicate customers** | Same person as `ابو فهد`, `Abu Fahad`, `بو فهد` with different balances |

---

## Onboarding Answers (every question — as *he* would answer, messily)

> Note: where Abu Mishari is unsure or wrong, the "Answer" reflects what he'd actually pick — the test
> is whether the system tolerates the ambiguity and lets him correct it later.

### Step 1 — Business Info
| Question | Answer |
|---|---|
| Legal company name | **Mishari Mobiles & Accessories Co.** (he types `محل مشاري للموبايل` and is unsure of the W.L.L. legal name) |
| Trading / brand name | **Mishari Mobiles** |
| Country | **Kuwait** |
| Company registration number | *Leaves blank* — "I have it somewhere" (optional, so allowed) |
| Industry | **Electronics, mobile & appliances** |
| How do you track inventory? | System auto-recommends **Serialized** (IMEI); he accepts it, though half his stock is non-serial accessories → really **Mixed** |
| Preferred language | **Arabic** |
| Years operating | **17** (he's been around since 2009, the old shop) |

### Step 2 — Locations
| Question | Answer |
|---|---|
| Number of branches | **2** |
| Branch 1 — name / city / timezone | **Hawally** / Hawally / Asia–Kuwait |
| Branch 2 — name / city / timezone | **Salmiya** / Salmiya / Asia–Kuwait |
| Does each branch keep its own stock? | **Yes, each branch has its own stock** |
| Storage-only warehouses? | **No** |
| Move stock between branches? | **Yes, we transfer between branches** (he shuttles phones between shops constantly) |

### Step 3 — Accounting
| Question | Answer |
|---|---|
| Main currency | **KWD** |
| More than one currency? | **No** (though he sometimes quotes USD for wholesale — he forgets to mention it) |
| Financial year start | **January** (⚠️ *wrong* — his old accountant used April; this surfaces at the conversion-date step) |
| Handle post-dated cheques? | **Yes, we do** (he gives suppliers PDCs) |
| Chart of accounts | **Use our standard chart** (he has no idea what a chart of accounts is) |

### Step 4 — Tax
| Question | Answer |
|---|---|
| Tax regime (Kuwait) | **No tax to set up** — static notice ✅ (but his data has stray "KD"/tax junk to clean) |

### Step 5 — Team & Roles
| Question | Answer |
|---|---|
| How many people will use the system? | **6** (himself + 5 staff across both shops) |

### Step 6 — Point of Sale
| Question | Answer |
|---|---|
| Sell at a counter? | **Yes** |
| How many registers/terminals? | **2** (one per shop) |
| How do you print receipts? | **Thermal printer (80mm roll)** |
| Print receipts in both Arabic & English? | **Yes** |
| Which payments do you accept? | **Cash, KNET** (Visa accepted in Hawally only — he forgets to tick it) |

### Step 7 — Data Sources
| Question | Answer |
|---|---|
| What are you using today? | **Offline or legacy POS system** (Hawally) + really **Paper and notebooks** (Salmiya) — he picks one, the truth is both |

### Import Screen — which data he brings in
He wants to bring in everything but his data fights him at every step:

| Category | Bring in? | What goes wrong |
|---|---|---|
| Categories | **Yes** | Mostly blank / one ghost category `اكسسوارات`; needs Mira to infer categories from product names |
| Products | **Yes** | Mixed-language names, mixed price units, encoding garbage, dup spellings, IMEIs in notes |
| Customers | **Yes** | Phone-format chaos, duplicate spellings of same person, missing names |
| Customer outstanding (AR aging) | **Yes** | Totals don't tie to TB (off ~KWD 1,200); some negative balances |
| Suppliers | **Yes** | A few suppliers, names in mixed script, PDC balances |
| Supplier outstanding (AP aging) | **Yes** | Includes post-dated cheque amounts mixed with current dues |
| Opening stock | **Yes** | Two branches in one file, negative/blank/`خلصت` quantities, no clear cost |
| Opening balances (trial balance) | **Yes** | Does **not** balance — debits ≠ credits; this is the big reconciliation test |

### Opening-balance / stock setup sub-questions
| Question | Answer |
|---|---|
| Company | **Mishari Mobiles & Accessories Co.** (auto-selected) |
| When are these balances from? | **Convert as of a date** — he's migrating mid-year. As-of date ≈ **2026-05-31** (cutover end of May 2026) |
| Conversion-date ambiguity | His FY says January but books were really April-closed → tests mid-year conversion logic & whatever Mira asks to disambiguate |
| Opening stock as-of date | **2026-05-31** |
| Opening stock reason | "نقل المخزون من النظام القديم" ("Moving stock from the old system") |

---

## What This Persona Tests (the real wedge checklist)

- [ ] **Cleaning brain** detects Windows-1256 encoding and *restores* Arabic instead of corrupting it.
- [ ] **Dedup** catches the 4 spellings of Samsung A54 → proposes a **merge decision card**, never silently drops.
- [ ] **Anomaly detection** flags: negative stock, KWD/fils mismatch, AR off by ~1,200, unbalanced TB —
      and **explains each in plain Arabic**, not a stack trace.
- [ ] **No row ever discarded** — `خلصت`, blanks, `-3` all become reviewable items, not import failures.
- [ ] **Multi-file + multi-location** resolution: splits the one stock file across Hawally / Salmiya.
- [ ] **IMEI extraction** from a free-text notes column; handles 15-digit, spaced, and missing IMEIs.
- [ ] **Mid-year conversion**: handles the Jan-vs-April FY ambiguity and the 2026-05-31 cutover date.
- [ ] **Resumable import**: he closes the laptop mid-import → resumes exactly where he left off.
- [ ] **Voice**: he talks to Mira in Arabic instead of typing; she guides him through the fixes.
- [ ] **Reconciliation**: unbalanced TB is caught at Go-Live, the ~KWD 1,200 gap is surfaced with a
      proposed balancing entry (suspense account) — he is *not* allowed to dead-end.
- [ ] **Decision cards** accumulate, are answerable in plain language, and don't block the whole import.

---

## Expected Result

He should still get **live** — but via Mira doing the heavy lifting: detecting the mess, proposing
fixes as decision cards, reconciling the gap into a suspense account, and never once showing him a raw
error. The success metric isn't "clean data in" — it's **"he didn't walk away."** If at any point the
system hard-errors, loses a row, silently drops a duplicate, or dead-ends on the unbalanced TB, that's a
**wedge-breaking failure** and the single most important class of bug to fix before launch.
