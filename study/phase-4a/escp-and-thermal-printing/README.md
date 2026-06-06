# ESC/P & Thermal Printing — Concepts

> Phase 4A study note. Context: DEV-389–395 dot-matrix graphics mode, calibration wizard,
> receipt agent packaging.

---

## 1. Two Protocol Families

| | ESC/POS | ESC/P |
|---|---------|-------|
| Full name | Epson Standard Code for POS | Epson Standard Code for Printers |
| Printer type | Thermal (heat-sensitive paper) | Dot-matrix (9-pin or 24-pin impact) |
| Paper feed | Roll (58 mm or 80 mm) | Continuous-form fanfold |
| Image model | Text + raster bitmap (`GS v 0`) | Text (character mode) + raster (`ESC *`) |
| Arabic/Unicode | No native support | No native support |
| Carbon copies | Impossible — heat-only | Native — one strike through all layers |
| Use case | Retail POS receipt | Wholesale invoice, B2B, pre-printed forms |

Both are escape-sequence byte streams pushed over raw TCP (port 9100 by convention). Neither speaks HTTP. The local print agent exists to bridge the browser's networking sandbox to the raw TCP port.

---

## 2. Text Mode vs. Raster Mode

**Text mode** sends ASCII/codepage characters. The printer's ROM maps code points to dot patterns. Fast, compact, but limited to the codepage burned into the printer (usually Latin + one regional codepage). No Arabic.

**Raster (graphics) mode** sends a bitmap: the host shapes, renders, and thresholds the image, then streams pixel rows. The printer is dumb — it just fires pins or heats dots in the pattern it receives. Slower and larger payloads, but full Unicode rendering is possible because the CPU, not the printer, does the font work.

### When to prefer raster
- Any content with Arabic, emoji, logos, or special symbols.
- Receipts where the brand requires bilingual layout with correct RTL shaping and ligatures.
- Label printing where Code128 bars must be pixel-accurate.

---

## 3. ESC/POS Raster Command: `GS v 0`

Sends a full-page raster image to a thermal printer.

```
1D 76 30 <mode> <xL> <xH> <yL> <yH> [bitmap data]
```

- `mode`: 0 = normal density, 1 = double-width, 2 = double-height, 3 = quadruple.
- `xL + xH*256`: width in **bytes** (8 pixels each). For 80 mm / 203 dpi: printable ≈ 576 dots → xL = 72, xH = 0. For 58 mm: ≈ 384 dots → xL = 48.
- `yL + yH*256`: height in pixel rows.
- Data: MSB-first, 1 bit per pixel, 1 = black, 0 = white, row by row.

Arabic pipeline: `<canvas>` render → `getImageData()` → luminance threshold → pack 8px/byte → prepend `GS v 0` header → send.

---

## 4. ESC/P Raster Command: `ESC *` — 24-Pin Bit-Image

`ESC *` prints one horizontal band using the pin head in graphics mode.

```
1B 2A <m> <nL> <nH> [data bytes]
```

- `m` selects density mode. **m = 39** = 24-pin double density (180 × 180 dpi). This is the mode used for Arabic dot-matrix raster.
- `nL + nH*256`: number of columns to print.
- **Data format for m = 39 (24-pin):** 3 bytes per column, 24 bits total, MSB top. Each bit fires one of the 24 pins vertically. So for N columns: N × 3 bytes follow the command.
- One `ESC *` call prints one horizontal band of 24 dots height.
- To print a full image, loop: emit `ESC *` band, then advance paper by exactly 24 dots using `ESC 3 24` (set line spacing to 24/216 inch) + `\n` (LF).
- Reset line spacing after the image with `ESC 2` (restore default 1/6 inch).

### Band loop pseudocode

```
ESC 3 24                        // set line spacing = 24 dots
for each 24-row band in bitmap:
  ESC * 39 <nL> <nH> <3*N bytes>
  LF                            // advance one band height
ESC 2                           // restore default line spacing
```

---

## 5. Form Length & Calibration (ESC/P)

`ESC C n` sets the page (form) length to n lines at the current line pitch. Valid range: **n = 1–127** (single byte). At 6 LPI (standard for 11-inch fanfold), 66 lines = 11 inches. Zerupt's calibration wizard caps the UI slider at 127 to respect this byte limit.

`FF` (0x0C) advances to the top of the next form. Must be sent at the end of every invoice so the next print starts at perforation.

`ESC @` reinitialises the printer. Sending it once before a multi-copy job ensures consistent state; subsequent copies print identically because the printer is in a known state.

**Calibration concepts captured in the wizard:**
- **Dots width:** how many printable columns the physical paper supports (depends on form width and left margin).
- **Left offset:** blank columns to prepend so content is centered on the form.
- **Form length:** total lines per form — must match the physical perforation pitch.
- **Graphics mode toggle:** enables the `ESC *` path; text mode falls back to ASCII-only layout.

---

## 6. Why Graphics Mode Solves Arabic on Dot-Matrix

Dot-matrix printers (9-pin, 24-pin) have no Unicode or Arabic font ROM. Character mode is limited to the codepage physically wired into the printer (e.g., PC850 Latin). Arabic shaping (right-to-left, ligatures, contextual forms) requires a Unicode-aware renderer.

Solution: the same canvas-render pipeline used for ESC/POS Arabic is applied to dot-matrix. The output bitmap is sliced into 24-dot-tall bands and emitted via `ESC * m=39`. The printer becomes a pixel output device — it knows nothing about language.

Trade-off: raster jobs are larger and slower than character-mode text. For a wholesale invoice (~40 lines) this is acceptable. For very high-volume throughput (label printers printing thousands of labels), a thermal printer with a proper label protocol (ZPL/EPL) would be preferred.
