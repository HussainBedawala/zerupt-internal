# Receipt Model

> Thermal print layout, bilingual support, and digital receipt delivery options.

## Receipt Types

| Type | When Generated |
|------|---------------|
| `Sale` | Transaction completed |
| `Return` | Return completed |
| `Exchange` | Exchange completed |
| `Void` | Transaction voided |
| `Reprint` | Cashier or manager requests reprint |
| `GiftReceipt` | Customer requests (no prices shown) |
| `ShiftReport` | Shift closed (Z-report, see `08-z-report-shift-close.md`) |

## Thermal Print Layout (80mm)

```
┌──────────────────────────────┐  ← 48 chars per line (80mm)
│        [Company Logo]        │
│       Company Name           │
│       اسم الشركة             │
│   Branch Name / اسم الفرع    │
│   CR: 123456 / س.ت: ١٢٣٤٥٦  │
│   VAT: 300000000000003       │
│──────────────────────────────│
│  TAX INVOICE / فاتورة ضريبية  │
│──────────────────────────────│
│  #REG01-0042-0007            │
│  Date: 2026-02-28 14:32      │
│  Cashier: Ahmed              │
│  Customer: Walk-in           │
│──────────────────────────────│
│  Item Name                   │
│  اسم المنتج                  │
│  2 × 15.000         30.000   │
│                              │
│  Item Name 2                 │
│  اسم المنتج ٢                │
│  1 × 45.000         45.000   │
│──────────────────────────────│
│  Subtotal / المجموع  75.000  │
│  Discount / خصم      -5.000  │
│  Tax / ضريبة          3.500  │
│  ─────────────────────────── │
│  TOTAL / الإجمالي    73.500  │
│──────────────────────────────│
│  Cash / نقد          80.000  │
│  Change / الباقي      6.500  │
│──────────────────────────────│
│  [QR Code - e-invoice link]  │
│                              │
│  Thank you! / !شكراً لكم     │
│  Exchange within 30 days     │
│  with receipt                │
│  الاستبدال خلال ٣٠ يوم       │
│  مع الفاتورة                 │
│──────────────────────────────│
│  [Barcode - transaction #]   │
└──────────────────────────────┘
```

## Receipt Record

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Unique receipt identifier |
| `transactionId` | UUID | Yes | Linked transaction |
| `type` | Enum | Yes | See Receipt Types above |
| `printedAt` | DateTime | Yes | When first printed |
| `reprintCount` | Integer | Yes | Number of reprints (starts at 0) |
| `digitalDelivery` | Enum | No | `Email`, `SMS`, `WhatsApp`, `None` |
| `deliveredTo` | String | No | Email address or phone number |
| `deliveredAt` | DateTime | No | When digital receipt was sent |

## Bilingual Layout Rules

1. Company name: English on first line, Arabic below
2. Each item: English name on first line, Arabic name (`nameAlt`) below
3. Labels (Subtotal, Tax, Total): English left-aligned, Arabic right-aligned on same line
4. Numbers: always Western Arabic numerals (0-9) on receipt
5. QR code: contains e-invoice URL (for tax compliance where required)
6. Barcode: encodes transaction number for return lookups
7. If `nameAlt` is empty, item prints single line (English only)

## Digital Receipt

| Channel | How |
|---------|-----|
| Email | Sent via Resend (see `tech-stack.md`), PDF attachment + HTML body |
| SMS | Short link to receipt view page |
| WhatsApp | Short link via WhatsApp Business API |

### Rules

1. Digital receipt offered at checkout if customer is linked
2. Cashier can also enter email/phone ad hoc
3. Digital receipt sent asynchronously — does not block transaction completion
4. Digital receipt contains same data as printed receipt
5. Digital receipt link expires after 1 year

## Receipt Configuration

| Setting | Scope | Default |
|---------|-------|---------|
| `companyLogo` | Tenant | None (text-only header) |
| `headerText` | Register | Company name + branch |
| `footerText` | Register | Return policy |
| `showTaxBreakdown` | Tenant | `true` |
| `showCashierName` | Tenant | `true` |
| `showCustomerName` | Tenant | `true` |
| `autoPromptDigital` | Tenant | `false` |
| `defaultDigitalChannel` | Tenant | `Email` |
| `printCopy` | Tenant | `1` (number of copies) |

## Reprint Rules

1. Any completed or voided transaction can be reprinted
2. Reprint marked with "REPRINT" / "نسخة مكررة" header and reprint timestamp
3. `reprintCount` incremented
4. Reprint available to cashier (own shift) or manager (any shift)
5. Reprint logged in audit trail

## Gift Receipt

1. Same layout but all prices replaced with "***"
2. No payment section
3. Transaction number and barcode still present (for returns)
4. Marked "GIFT RECEIPT" / "فاتورة هدية"

## Void Receipt

1. Full original receipt content shown
2. "VOID" / "ملغية" watermark across receipt
3. Void reason, voided by, void timestamp printed
4. Original transaction number referenced

---

## Invoice Document Formats & Print Architecture

### Document Types

| Format | Trigger / When Offered | Width | Notes |
|--------|----------------------|-------|-------|
| `thermal_80mm` | Default at all registers; sale, return, exchange, void, reprint | 48 chars / 80mm roll | Main receipt format; bilingual, QR, barcode |
| `thermal_58mm` | Registers configured with 58mm hardware | 32 chars / 58mm roll | Narrower layout; same data, condensed labels |
| `a4` | Customer-linked transaction **or** cashier requests full invoice | A4 portrait | Bilingual tax invoice (see below) |
| `dot_matrix` | Register set to `dot_matrix`; continuous-form wholesale/B2B outlets | 80-col ESC/P | Carbon-copy single-pass (see below) |
| `none` | Digital-only or no printer attached | — | Digital receipt only; no print path triggered |

Per-register hardware config (stored in `register.printerConfig`):

| Field | Type | Description |
|-------|------|-------------|
| `printerType` | Enum | `thermal_80mm` \| `thermal_58mm` \| `a4` \| `dot_matrix` \| `none` |
| `connection` | Enum | `browser` (window.print / BLE) \| `agent` (local print agent) |
| `host` | String | IP/hostname for agent TCP forwarding; RFC1918 only |
| `port` | Integer | Raw TCP port (default 9100 for ESC/POS printers) |
| `cashDrawerConnected` | Boolean | Whether cash drawer is wired through printer kick pin |

#### A4 Bilingual Tax Invoice

- Rendered **on-demand** from `pos_transactions` data — not a separate document stored independently.
- Uses the **same transaction number** as the receipt (no separate invoice series).
- Reuses the existing `Sales → TaxDocument` layout (bilingual header, line items, VAT summary, QR).
- Customer block (name, VAT number, address) populated from `customerId` when linked; falls back to "Walk-in / عميل عابر".
- Cashier can trigger from the post-sale screen or from transaction history (manager/cashier with reprint permission).
- Output path: PDF via browser print dialog (A4 page) or emailed via Resend as PDF attachment.

#### ESC/P Continuous-Form Dot-Matrix Invoice

- Protocol: ESC/P (Epson Standard Code for Printers) — character-mode, not raster.
- Form geometry: 80 columns, default 33-line form length (11-inch fanfold); configurable per register.
- Single-pass carbon-copy — the printer strikes through all carbon layers simultaneously; no second print pass.
- Arabic on dot-matrix: transliteration or English-only fallback (ESC/P has no Unicode support; full Arabic requires a raster approach not practical on 9/24-pin heads at POS speed).
- Offered at: wholesale outlets, distributors, B2B counters where pre-printed continuous forms are in use.

---

### Print Architecture

#### Local Print Agent

Browsers cannot open raw TCP sockets to printers. A lightweight local agent bridges this gap.

| Property | Value |
|----------|-------|
| Transport | WebSocket, `ws://127.0.0.1:9723` |
| Origin enforcement | CSWSH check — agent rejects connections from origins other than the Zerupt web app |
| Target restriction | RFC1918 addresses only (192.168.x.x, 10.x.x.x, 172.16–31.x.x); agent refuses public IPs (SSRF guard) |
| Forwarding | Raw TCP to `host:port` (typically 9100) — passes ESC/POS or ESC/P byte streams unchanged |
| Installation | Per-workstation binary; auto-starts with OS; no cloud component |

#### ESC/POS Raster Approach for Arabic

ESC/POS printers do not carry Arabic fonts. Arabic text is shaped in the browser and rendered as a bitmap:

1. Browser renders Arabic text to an off-screen `<canvas>` using system Arabic font.
2. Canvas pixel data converted to 1bpp (1-bit-per-pixel) monochrome bitmap.
3. Bitmap transmitted to printer via `GS v 0` raster graphics command.
4. Math: for 80mm printer at 203 dpi → printable width ≈ 576 dots; image width must be a multiple of 8 bytes (72 bytes/row).

This approach handles full Unicode Arabic shaping (right-to-left, ligatures, diacritics) without requiring printer-side font support.

#### Cash Drawer Kick Rule

The cash drawer pulse (`ESC p` command) is sent **only when**:

1. Payment method is `Cash` (full or partial cash component), **AND**
2. `register.printerConfig.cashDrawerConnected = true`.

Card-only, wallet, or digital payments do not trigger the drawer. Managers can trigger a manual kick from the register settings screen (logged in audit trail).

#### Fallback Chain

```
1. Local print agent available?
   YES → send raw ESC/POS or ESC/P bytes via WebSocket → TCP 9100
   NO  ↓
2. window.print() (browser dialog)
   → for thermal: receipt rendered as narrow print-CSS page
   → for A4: full invoice HTML rendered to A4 print layout
   NO PRINTER (type = none) ↓
3. Digital receipt only (email / SMS / WhatsApp)
```

The cashier is notified if the agent is unreachable; the transaction is never blocked by print failure.
