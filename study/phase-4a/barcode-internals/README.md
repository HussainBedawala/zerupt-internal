# Barcode Internals — Concepts

> Phase 4A study note. Context: DEV-393 internal barcode generation + label printing (EAN-13 prefix-2, Code128, thermal raster labels).

---

## 1. EAN-13 Structure

EAN-13 is a 13-digit linear barcode used globally for retail products. Structure:

```
[GS1 prefix 3 digits][manufacturer 4–6 digits][item 3–5 digits][check digit]
```

Total: 12 data digits + 1 check digit = 13 digits visually, but the first digit is encoded in the parity pattern of the left half (no physical bar represents it alone).

### Physical zones

| Zone | Name | Content |
|------|------|---------|
| Left quiet zone | 11+ modules of white | Scanner needs clear margin |
| Start guard | 3 bars (101) | Tells scanner: beginning |
| Left data group | 6 digits (parity encodes digit 1) | — |
| Centre guard | 5 bars (01010) | Separates halves |
| Right data group | 6 digits (always right-hand encoding) | — |
| End guard | 3 bars (101) | Tells scanner: end |
| Right quiet zone | 7+ modules of white | — |

### Check digit calculation (Luhn-style mod 10)

```
sum = 0
for i in 0..11:
  digit = number[i]
  weight = 1 if i is even else 3
  sum += digit * weight
check_digit = (10 - (sum % 10)) % 10
```

Zerupt computes this server-side when generating barcodes.

---

## 2. Internal-Use Prefix Range (Prefix 2)

GS1 reserves country prefixes **200–299** for internal (non-retail) use. Barcodes in this range:
- Are **never assigned by GS1** to a real product.
- Are guaranteed not to conflict with supplier barcodes.
- Can be freely assigned by retailers for their own unlabelled or house-brand items.
- Are not scannable at other retailers' checkouts (by convention, not technical enforcement).

Zerupt generates internal barcodes in this range: `2XXXXXXXXXXX?` where 11 sequential digits follow the prefix `2` and the 13th digit is the check digit. Sequence numbers are reserved in bulk via an atomic database transaction to avoid gaps and collisions.

---

## 3. Code128 Encoding

Code128 is a high-density, variable-length linear barcode that can encode the full ASCII character set (0–127). It is the standard for shipping labels, item labels, and document reference barcodes.

### Three sub-sets

| Code Set | Encodes |
|----------|---------|
| A | ASCII 0–95 (uppercase, control chars) |
| B | ASCII 32–127 (uppercase + lowercase + printable) |
| C | Digit pairs (00–99) — double density for pure-numeric data |

A barcode can switch subsets mid-sequence. Purely numeric data uses Code C to halve the barcode width.

### Structure

```
[Quiet zone 10+ modules][Start char][Data chars][Check char][Stop char][Quiet zone 10+ modules]
```

- Each character is 11 modules wide (mix of 2–4 bars and spaces of varying widths).
- Check character = (start value + Σ(position × char value)) mod 103.
- Stop character is a unique 13-module pattern that also indicates direction to the scanner.

### Quiet zones

Quiet zones (white space) at each end must be at least 10 modules wide. In Zerupt's SVG Code128 renderer, 10 modules of padding are added explicitly. Without adequate quiet zones, cheap scanners may fail to decode reliably.

---

## 4. Label Printing: Raster vs. Browser

### Thermal label via raster (print agent path)

Zerupt renders the label (item name, barcode SVG, price, SKU) to an off-screen `<canvas>` at the label's physical pixel dimensions, then encodes as a `GS v 0` raster bitmap sent through the print agent to a thermal label printer on port 9100.

Label presets (width × height in mm):
- 38 × 25 (small shelf label)
- 50 × 30 (standard item label)
- 58 × 40 (large/product box label)

The SVG Code128 renderer is shared between the on-screen preview and the canvas raster path, so what you see is what the printer receives.

When the print agent is offline the UI warns the user; the fallback is browser print.

### A4 sticker grid via browser print

For tenants without a dedicated label printer, Zerupt renders N labels into an A4 grid (CSS `display: grid`, print-CSS `@page A4 landscape`) and triggers `window.print()`. The browser print dialog handles page breaks. No agent required, but alignment depends on the sticker sheet matching the grid dimensions — the tenant sets the columns/rows in label settings.

### Why not ZPL/EPL?

Zebra ZPL and Eltron EPL are label-specific protocols with their own layout language. They are more efficient for high-volume label printing but require a Zebra or compatible printer. Zerupt targets MENA/SEA retail where mixed-brand thermal printers are common. The raster path works on any ESC/POS-compatible printer, so no printer lock-in.
