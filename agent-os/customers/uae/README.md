# UAE E2E Test Customers

Three throwaway-tenant personas for full end-to-end shakedown of Zerupt, country **United Arab Emirates (AED)**.
Generated 2026-07-09. Mirrors the Kuwait set in structure and depth, but every persona here is **VAT-ON**
(5% standard VAT) and exercises UAE-specific tax reality: TRNs, tax-inclusive shelf pricing, reverse charge,
and the UAE BNPL payment stack (Tabby / Tamara).

| # | Business | Size | Locations | Users | Items | Customers | Suppliers | Folder |
|---|----------|------|-----------|-------|-------|-----------|-----------|--------|
| 1 | Nur Al Sharq Perfumes & Oud | Simple | 1 | 1-2 | 138 | 4 | 2 | [persona-1-noor-alsharq-perfumes](persona-1-noor-alsharq-perfumes) |
| 2 | Meydan Mobiles & Electronics | Medium | 3 | 6-8 | 781 | 12 | 3 | [persona-2-meydan-mobiles](persona-2-meydan-mobiles) |
| 3 | Emirates Building Materials Trading LLC | Large | 5 + WH (incl. Jebel Ali DZ) | 20-30 | 8,500 | 4,200 | 180 | [persona-3-emirates-building-materials](persona-3-emirates-building-materials) |

- **Per-customer requirements:** each persona folder has a `README.md` reading like a real customer
  requirements-gathering intake, at the depth of its tier — same 18-section structure as the Kuwait set.
- **Images** (shared, all valid PNG/SVG, <2 MB): [images/](images) — products, avatars, plus each persona's
  own logo files in its own folder.
- **Regenerate any time:** `python3 _generate_uae.py` (writes into `uae/`; each persona re-seeds for stable,
  independent output — P1 seed 51, P2 seed 252, P3 seed 353). Does NOT touch the Kuwait files or `_generate.py`.

## Why UAE is a different test than Kuwait: VAT is ON

Kuwait has no VAT; every UAE persona is 5% standard-rate VAT-registered with a 15-digit TRN (format `1\d{14}`).
Key differences baked into every persona:

- **Currency precision:** AED to 2 decimal places (fils), not Kuwait's 3. Cash settlement rounds to the
  nearest 25 fils.
- **Tax-inclusive shelf pricing:** UAE law requires consumer-facing prices to be VAT-inclusive; the tax
  breakdown is computed and shown on the receipt/invoice, not added on top of the listed price.
- **TRN everywhere:** seller TRN on every tenant; B2B customers and suppliers carry their own TRN (deliberately
  missing on some accounts in P2 and P3 as mess).
- **Full vs simplified tax invoice:** a full tax invoice (with buyer TRN) is required above AED 10,000; below
  that, a simplified tax invoice is sufficient.
- **Payments:** Cash, card, Apple Pay (P1), and Tabby/Tamara BNPL (P2, P3) — the UAE retail payment standard.
- **Locale:** Arabic primary + English, RTL, Asia/Dubai timezone, DD/MM/YYYY dates. Weekend is Saturday-Sunday
  except Sharjah, which is Friday-Sunday (exercised on P2's Sharjah branch).

## Image formats Zerupt accepts (cheat-sheet)

| Upload | Formats | Max | On receipt? |
|--------|---------|-----|-------------|
| Product image | PNG, JPEG, WebP | 2 MB | No (catalog only) |
| Customer image | PNG, JPEG, WebP | 2 MB | No |
| Business logo | PNG, JPEG, WebP, **SVG** | 2 MB | **Yes** (top of receipt) |

## Files carry deliberate mess (the AI-first pipeline is the product)

Mixed AR/EN text, locale number formats (`1.234,56` vs `1,234.56`), Arabic-Indic digits (`٥٠٠`), currency
suffixes (`AED 800.82`), blank/`-` cells, multi-warehouse columns, missing TRNs, and a deliberately
**unbalanced** trial balance on Persona 2 (tests the OBE plug). Clean paths prove nothing; the mess is the test.

**Per-tier mess (by design):**

- **P1 Nur Al Sharq** — none, the clean control path. The ONE thing that differs from a true no-VAT clean
  path (like the Kuwait P1) is that it must be fully VAT-compliant: TRN present, 5% VAT on every item,
  tax-inclusive shelf prices, VAT summary line on the receipt, `Tax Group` column shown in the inventory
  import template (see that persona's import-template notes).
- **P2 Meydan Mobiles** — inconsistent category spellings (`Accessories`/`accessories`/`Acc.`), blank costs,
  a duplicate SKU, Arabic-Indic digits, euro-style `1.234,56` numbers, a Sharjah branch with a different
  (Fri-Sun) weekend, and a trial balance deliberately unbalanced by **exactly AED 950.00** (OBE plug test).
  Plus UAE-specific VAT mess: some items mis-tagged zero-rated when they should be standard-rated, some
  items with a blank tax code defaulting to standard 5%, an ambiguous price column mixing VAT-inclusive and
  VAT-exclusive entries row-by-row, and roughly half the B2B customers missing their TRN.
- **P3 Emirates Building Materials** — messy AR formats at 4,200-row scale, `Wholesale Price` + retail tiers,
  `Salesman` + `Payment Terms` columns, B2B subledgers (`pdc_register.csv`, `open_quotations.csv`), xlsx for
  items + trial balance. Plus UAE-specific: a **Jebel Ali Free Zone (Designated Zone)** store whose stock
  transfers to mainland locations trigger self-accounted reverse-charge VAT (`dz_mainland_transfers.csv`), 3
  foreign suppliers (China/India/Turkey) with foreign-currency invoices and no TRN under a
  `Reverse Charge - Import` VAT treatment, and ~8% of the 4,200 customers missing TRN.
