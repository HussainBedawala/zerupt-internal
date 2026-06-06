# ESC/POS vs ESC/P — Thermal & Dot-Matrix Printing

> Phase 4A study note. Context: DEV-389–395 POS hardening — receipt agent, dot-matrix invoice format.

---

## Two Protocols, Two Printer Families

| | ESC/POS | ESC/P |
|---|---------|-------|
| Full name | Epson Standard Code for POS | Epson Standard Code for Printers |
| Printer type | Thermal (heat-sensitive paper) | Dot-matrix (impact, 9/24-pin) |
| Paper | Roll (58mm or 80mm) | Continuous-form fanfold |
| Image | Raster (bitmap) or text | Character-mode; raster possible but slow |
| Arabic/Unicode | No native support | No native support |
| Speed | Fast (thermal head, no ink) | Slower; mechanical impact |
| Carbon copies | Impossible (heat-only) | Native — single strike through all layers |
| Use case | Retail receipt | Wholesale invoice, B2B, pre-printed forms |

Both are escape-sequence byte streams sent over raw TCP (typically port 9100). Neither speaks HTTP.

---

## Why Local Agents Exist

Browsers sandbox networking: JavaScript cannot open a raw TCP socket to `192.168.1.100:9100`.
Options:
1. **Native app / Electron** — full OS access, but heavyweight.
2. **Local agent** — small background binary that opens a WebSocket server on localhost, accepts print jobs from the browser page, and forwards raw bytes over TCP to the printer. This is the standard industry approach (StarMicronics, Epson ePOS-Print, custom agents).

The agent is trust boundary #1: it must not become an open proxy.

---

## CSWSH & SSRF Concerns for Localhost Agents

**CSWSH (Cross-Site WebSocket Hijacking)**
Any page in the browser can attempt `new WebSocket("ws://127.0.0.1:9723")`. Without origin checking, a malicious site visited by the cashier could send print jobs or probe the internal network.
Mitigation: agent checks the `Origin` header on the WebSocket upgrade and rejects anything not on the Zerupt allowlist.

**SSRF (Server-Side Request Forgery)**
If the agent accepts a host+port from the browser message and dials it, an attacker could redirect it to internal services (e.g., `192.168.1.1:80`, cloud metadata endpoints).
Mitigation:
- Restrict target to RFC1918 ranges only (10/8, 172.16/12, 192.168/16).
- Optionally lock to a single configured host:port per register; refuse dynamic targets.

---

## Raster Bitmap Printing for Arabic (ESC/POS)

Arabic shaping requires:
- Unicode-aware bidirectional algorithm (UAX #9)
- Ligature joining (e.g., ل + ا → لا)
- Contextual letter forms (initial, medial, final, isolated)

Thermal printers carry no Arabic fonts. Solution: **shape in the browser, send pixels**.

### Pipeline

1. Render Arabic text to `<canvas>` (off-screen, correct font, RTL direction).
2. Read pixel data via `getImageData()`.
3. Threshold to 1bpp: pixel luminance < threshold → black dot (1), else white (0).
4. Pack 8 pixels per byte (MSB first, per ESC/POS spec).
5. Prepend `GS v 0` raster command with width/height fields.
6. Send byte stream to agent → TCP → printer.

### GS v 0 Math (80mm / 203 dpi)

- Printable width: 80mm × 203 dpi / 25.4 ≈ **576 dots**
- Bytes per row: 576 / 8 = **72 bytes** (xL = 72, xH = 0 in the command)
- Height: however many pixel rows the rendered text requires
- Full command prefix: `1D 76 30 00 48 00 <yL> <yH>` then raw bitmap data

For 58mm (203 dpi): printable width ≈ 384 dots → 48 bytes/row.

---

## Cash Drawer Kick Pulse

The drawer is wired to the printer's RJ11/RJ12 kick port. Command: `ESC p m t1 t2`
- `m`: pin select (0 = pin 2, 1 = pin 5)
- `t1`/`t2`: pulse on/off duration in 2ms units

The printer momentarily energises the solenoid. This is why the drawer is only triggered when a printer is attached — there is no standalone USB drawer protocol in ESC/POS.

---

## Continuous-Form & Form Length (ESC/P)

Fanfold paper has pre-perforated page breaks. The printer tracks position within the current form.
- `ESC C n` sets form length in lines (e.g., n=33 for 11-inch at 6 LPI).
- `FF` (form feed, 0x0C) advances to top of next form.
- Important for carbon-copy invoices: content must fit within the form or bleed into the next sheet.
- A 33-line 80-column form at 10 CPI fits a standard A4-equivalent invoice without reconfiguring the printer.
