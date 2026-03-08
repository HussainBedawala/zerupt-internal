# Supplier Model

## Supplier Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `code` | string | Auto-generated or manual: `SUP-0001` |
| `name` | string | Legal/trade name |
| `nameAlt` | string | Alternate language name |
| `taxNumber` | string | VAT/GST registration number |
| `defaultCurrency` | string | Default transaction currency for new POs |
| `defaultTaxGroupId` | string | Default tax group for new PO lines |
| `defaultPaymentTermsId` | string | |
| `creditLimit` | decimal | Maximum outstanding AP balance |
| `defaultWarehouseId` | string | Default receiving warehouse |
| `status` | enum | `Active`, `Inactive`, `Blocked` |
| `notes` | string | |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

## Status Lifecycle

```
Active  ⇄  Inactive
Active  →  Blocked
Blocked →  Active
```

| Status | Effect |
|--------|--------|
| **Active** | New POs allowed. Payments allowed. |
| **Inactive** | No new POs. Existing POs and payments continue. |
| **Blocked** | No new POs. No new payments. Existing open POs frozen. |

Blocking requires a reason (stored in audit trail).

---

## Supplier Contact

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `supplierId` | string | |
| `name` | string | |
| `role` | string | Sales, Accounts, Logistics |
| `phone` | string | |
| `email` | string | |
| `isPrimary` | boolean | One primary per supplier |

---

## Payment Terms

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `name` | string | "Net 30", "2/10 Net 30", "Cash on Delivery" |
| `dueDays` | integer | Days after invoice date |
| `discountPercent` | decimal | Early payment discount rate |
| `discountDays` | integer | Days within which discount applies |

---

## Document Numbering

| Document | Default Prefix | Example |
|----------|---------------|---------|
| Supplier | `SUP-` | `SUP-0001` |

Sequential, no gaps. Prefix configurable per tenant.
