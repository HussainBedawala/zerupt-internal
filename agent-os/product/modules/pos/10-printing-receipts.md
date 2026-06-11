# Printing & Receipts

> As-built spec — DEV-389–395 (POS hardening epic, 2026-06).

---

## Print Agent

A lightweight per-workstation binary bridges the browser's network sandbox to raw TCP printers.

| Property | Value |
|----------|-------|
| Transport | WebSocket `ws://127.0.0.1:9723` |
| Origin enforcement | CSWSH check — rejects non-Zerupt origins |
| Target restriction | RFC1918 addresses only (SSRF guard) |
| Forwarding | Raw TCP to `host:port` (default 9100) — passes ESC/POS or ESC/P bytes unchanged |
| Packaging | Single-file binary for macOS/Windows/Linux; OS service installer; auto-start |
| Updates | Notify-only channel — no silent code signing; user approves update |

Fallback chain when agent is unreachable: `agent WebSocket → window.print() → digital-only`. The transaction is never blocked by print failure.

---

## System Printers (Register Config)

Each register stores `printerConfig`:

| Field | Type | Description |
|-------|------|-------------|
| `printerType` | enum | `thermal_80mm` \| `thermal_58mm` \| `dot_matrix` \| `a4` \| `none` |
| `connection` | enum | `agent` \| `browser` |
| `host` | string | RFC1918 IP/hostname for agent TCP forwarding |
| `port` | integer | Raw TCP port (default 9100) |
| `cashDrawerConnected` | boolean | Cash drawer wired through printer kick pin |
| `dotMatrixMode` | enum | `text` \| `graphics` — graphics enables ESC * raster path for Arabic |

---

## Printer Discovery & Setup Wizard

The wizard runs in under 2 minutes:

1. **Detect** — ping agent; enumerate configured printers; test TCP reachability.
2. **Calibrate** — print a border test pattern; operator adjusts dots width, left offset, and form length.
3. **Save** — calibration written to `register.printerConfig`; receipt template selected.

Calibration values:
- `dotsWidth`: printable columns (dot-matrix) or pixel width (thermal).
- `leftOffset`: blank columns prepended for centering.
- `formLength`: lines per fanfold form (1–127; `ESC C` byte limit enforced in UI).

---

## Dot-Matrix Graphics Mode

When `dotMatrixMode = graphics`, the dispatcher routes through the ESC * 24-pin raster path instead of character mode. This enables correct Arabic rendering on dot-matrix printers (see study note `escp-and-thermal-printing`).

- Protocol: `ESC * m=39` (24-pin double density, 3 bytes/column, MSB top).
- Band height: 24 dots. Line spacing set to 24 via `ESC 3 24` during image, restored via `ESC 2` after.
- Multi-copy: printer initialised once with `ESC @`; the same band sequence is sent N times.
- Border test respects calibrated width and offset; a text-mode ASCII variant is also available.

---

## Receipt Template Presets

| Preset | Description |
|--------|-------------|
| Classic | Full header, all line items, payment detail, footer |
| Compact | Condensed labels, single-line items, minimal footer |
| Bilingual | Classic + Arabic translation beneath each English field |

Preset stored per register. Overridable per transaction.

---

## Special Receipt Types

| Type | Behaviour |
|------|-----------|
| Gift receipt | All prices replaced with `***`; no payment section; barcode still present for returns |
| Duplicate band | Second copy printed with `REPRINT / نسخة مكررة` header and reprint timestamp; `reprintCount` incremented |
| Z-report print | Triggered via agent — same shift-close aggregation as the on-screen Z-report; formatted for thermal or dot-matrix width |

---

## Digital Receipt & QR

- A UUID v4 receipt token is minted atomically with transaction completion and registered in the admin-DB `receipt_tokens` table (bounded retry + lazy re-register on failure).
- QR code (via `qrcode` lib, jsQR round-trip tested) encodes `https://app.zerupt.com/r/{token}` and prints in the receipt footer slot.
- Public page `/r/[token]`: no auth shell, no internal IDs, `Cache-Control: no-store`, 20 req/min throttle, uniform 404 for missing/expired tokens.
- Offline sales: QR only appears on post-sync reprint (token cannot be minted until the transaction reaches the server).
- **No WhatsApp delivery.** Digital receipt is web-link only; WhatsApp Business API integration is deferred.

---

## Update Policy

Agent updates are delivered via a notify channel. The user approves installation; no silent background code signing. This prevents supply-chain risk from an auto-updating process with raw TCP printer access on the LAN.
