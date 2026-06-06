# Barcode & Label Printing

> As-built spec — DEV-393 (2026-06). Internal EAN-13 generation, Code128 label printing, thermal raster + A4 grid paths.

---

## Internal Barcode Generation

Zerupt generates EAN-13-shaped barcodes for items that arrive without a supplier barcode (unlabelled goods, house-brand, loose items).

| Property | Value |
|----------|-------|
| Format | EAN-13 |
| Prefix | `2` (GS1 internal-use range 200–299 — never conflicts with supplier barcodes) |
| Structure | `2` + 11-digit sequential number + check digit (mod-10 weighted Luhn) |
| Sequence reservation | Atomic bulk reservation in a single DB transaction (`reserveNumbers`) — one `INSERT` for N numbers; prevents gaps and race conditions |

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /inventory/items/:id/barcode` | Generate barcode for one item |
| `POST /inventory/items/barcode/generate-missing` | Batch: generate for all items that have no barcode; throttled 3/min; returns `{ generated, failed, remaining }` |

The batch endpoint is declared before the `:id` route to avoid route shadowing.

---

## Label Printing

Labels encode a Code128 barcode (full ASCII, variable length, 10-module quiet zones at each end). The SVG Code128 renderer is shared between the on-screen preview and the canvas raster path — WYSIWYG.

### Label presets

| Preset | Dimensions | Typical use |
|--------|-----------|-------------|
| Small | 38 × 25 mm | Shelf label, jewellery |
| Standard | 50 × 30 mm | Item label, grocery |
| Large | 58 × 40 mm | Box/product label |

### Print paths

**Thermal label via print agent (preferred)**
- Label rendered to `<canvas>` at physical pixel dimensions.
- Encoded as `GS v 0` raster bitmap, sent through print agent → TCP 9100.
- When agent is offline: explicit warning shown; no silent fallback to browser (thermal printers cannot use `window.print()`).

**A4 sticker grid via browser**
- Labels rendered into a CSS grid on an A4 page with print-CSS `@page` rules.
- `window.print()` — no agent required.
- Alignment depends on the sticker sheet matching the grid; tenant configures columns/rows in label settings.

---

## Bilingual Labels

Label template supports `name` (EN) and `nameAlt` (AR) fields. If `nameAlt` is present, the Arabic name renders below the English name using the canvas raster path (same RTL shaping pipeline as thermal receipts). If absent, single-line English only.
