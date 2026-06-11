# Customer Model

## Customer Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `code` | string | Auto-generated or manual: `CUS-0001` |
| `name` | string | Legal/trade name |
| `nameAlt` | string | Alternate language name |
| `taxNumber` | string | VAT/GST registration number |
| `defaultCurrency` | string | Default transaction currency for new documents |
| `defaultTaxGroupId` | string | Default tax group (can be overridden per line) |
| `defaultPaymentTermsId` | string | |
| `defaultPriceListId` | string | Assigned price list for price resolution (see `inventory/07-pricing-engine.md`) |
| `creditLimit` | decimal | Maximum outstanding AR balance (0 = no limit) |
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
| **Active** | New quotations, orders, invoices allowed. |
| **Inactive** | No new documents. Existing open documents and payments continue. |
| **Blocked** | No new documents. No new credit sales. Cash sales via POS still allowed. Existing payments continue. |

Blocking requires a reason (stored in audit trail).

---

## Customer Contact

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `customerId` | string | |
| `name` | string | |
| `role` | string | Purchasing, Accounts, General |
| `phone` | string | |
| `email` | string | |
| `isPrimary` | boolean | One primary per customer |

---

## Payment Terms

Shared model with Purchase module (see `purchase/01-supplier-model.md` Payment Terms).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `name` | string | "Net 30", "2/10 Net 30", "Cash on Delivery", "Immediate" |
| `dueDays` | integer | Days after invoice date |
| `discountPercent` | decimal | Early payment discount rate |
| `discountDays` | integer | Days within which discount applies |

---

## Credit Limit Enforcement

| Rule | Detail |
|------|--------|
| Check trigger | Before confirming a sales order or invoice |
| Formula | `currentOutstanding + newDocumentTotal > creditLimit` |
| If exceeded | Block confirmation. Manager PIN required to override. |
| `currentOutstanding` | Sum of unpaid confirmed invoices minus unapplied credits/payments |
| Credit limit = 0 | No limit enforced |

---

## Document Numbering

| Document | Default Prefix | Example |
|----------|---------------|---------|
| Customer | `CUS-` | `CUS-0001` |

Sequential, no gaps. Prefix configurable per tenant.
