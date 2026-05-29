# Statutory Tax Invoice Templates (Bilingual, Multi-Rate)

Concepts behind DEV-297: an A4 printable, legally-compliant tax invoice + credit note
that works across UAE, India, Singapore, and Malaysia in Arabic and English.

## Why a "tax invoice" is a regulated document, not just a receipt

In VAT/GST jurisdictions, a **tax invoice** is the legal instrument that lets the *buyer*
reclaim input tax. Tax authorities mandate specific fields, and an invoice missing them is
not a valid tax invoice — the buyer loses the credit. Common statutory requirements:

- Seller's **tax registration number** displayed prominently (the buyer's auditor checks it).
- The literal words **"Tax Invoice"** as the document title (a legal label, not decoration).
- A **per-rate tax breakdown** so each tax line can be reconciled.
- Sequential, gap-free numbering (already enforced at the data layer).

This is why the template is country-aware rather than one generic layout.

## The four tax systems and how they differ

| Country | System | Reg-number label | Title | Special |
|---------|--------|------------------|-------|---------|
| UAE | VAT (single rate, 5%) | **TRN** | Tax Invoice | One tax line |
| India | **GST dual** | **GSTIN** | Tax Invoice | Splits into **CGST + SGST** for intra-state, **IGST** inter-state; **HSN** code per line |
| Singapore | GST (single) | GST Reg No | Tax Invoice | — |
| Malaysia | **SST** (sales & service tax) | SST No | **Sales Tax Invoice** | Different statutory title |

The key insight: **the same economic transaction renders differently per jurisdiction**.
India's dual-tax model is the structural outlier — one 18% rate is shown to the buyer as
*two* 9% lines (CGST + SGST), because the revenue is split between the central and state
governments. The template models this with a generic `taxSummary` array of `{label, taxable,
rate, taxAmount}` rows — UAE produces one row, India produces two — instead of hardcoding a
single rate field.

## Why the print component never computes money

Tax amounts are computed once, server-side, at invoice confirmation and stored as exact
decimal strings. The print template renders those strings **verbatim**. Reasons:

1. **Rounding authority** — VAT rounding rules (per-line vs per-invoice, round-half-up vs
   banker's) are a tax-policy decision that must live in one place. If the print layer
   re-derived totals in JavaScript `Number`, a half-cent rounding difference would make the
   printed invoice legally disagree with the posted ledger.
2. **IEEE-754 precision** — `Number("123456789012345.99")` silently loses digits. The guard:
   if a value has > 15 significant digits, render the raw string and skip `Intl` formatting.

This "display, don't compute" rule is the single most important correctness property of any
financial print artifact.

## Bidirectional text: the subtle failure mode

An Arabic invoice mixes RTL script with LTR content (numbers, Latin product codes, currency
symbols). Without isolation, the **Unicode Bidirectional Algorithm** lets a stray character
"leak" direction into neighbouring text — e.g. an Arabic address line pushing a trailing
comma or digit to the wrong visual side, or a customer name reordering punctuation.

Mitigations used:
- Wrap every piece of **user-supplied** content (names, addresses, item descriptions, tax
  labels) in Unicode isolates (FSI…PDI) via the shared `bidi` helper.
- Use `dir="auto"` so each field picks its own base direction from its first strong character.
- **Force Western digits (0-9)** for all monetary figures regardless of UI locale — printed
  tax documents conventionally use Latin numerals even in Arabic markets, and it avoids
  Eastern-Arabic digit ambiguity for auditors.
- **CSS logical properties only** (`padding-inline`, `text-start`) so the whole layout mirrors
  automatically in RTL without a second stylesheet.

## Print CSS: turning a web component into paper

- `@page { size: A4; margin: 14mm }` defines the physical sheet.
- A **visibility-scoping** trick (`body * { visibility: hidden }` then re-show `#invoice-print`)
  prints only the document, hiding app chrome — more robust than restructuring the DOM.
- `break-inside: avoid` on table rows + `display: table-header-group` on `<thead>` give
  **page-break handling**: long invoices repeat the column headers on each page and never
  slice a row in half.
- React 19 hoists `<style precedence="print">` into `<head>`, so the print rules ship with the
  component instead of living in a global stylesheet.

## Decoupling pattern: view-model over DTO

The print component is **pure and presentational** — it takes a `TaxDocumentData` view-model
and imports no API hooks or DTOs. The detail page maps server data into that shape. Benefits:

- Built and tested independently of the (concurrently-developed) data layer.
- Immune to DTO churn; the contract is one small, explicit interface.
- Trivially unit-testable: feed it fixtures for each country and assert the rendered output.

The credit note is the **same component** with a `variant` flag — it reuses the entire layout,
swaps the title to "Credit Note", and surfaces the original invoice reference. One component,
two legal documents, zero duplication.
