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
