# Currency and Fiscal Periods

## Currency Policy Entity

| Field | Type | Description |
|-------|------|-------------|
| `tenantId` | UUID | |
| `functionalCurrency` | string | Reporting currency |
| `transactionCurrencies` | array(string) | Allowed currencies |
| `isMultiCurrencyEnabled` | boolean | |
| `roundingMode` | enum | `HALF_UP`, `BANKERS` |
| `changedAt` | datetime | |

## Exchange Rate Policy

| Field | Type | Description |
|-------|------|-------------|
| `source` | enum | `Manual`, `AutoFetched` |
| `provider` | string | Optional provider key |
| `updateFrequency` | enum | `Manual`, `Daily`, `Hourly` |
| `allowBackdatedRate` | boolean | |
| `approvalRequiredForManualRate` | boolean | |

## Fiscal Settings Entity

| Field | Type | Description |
|-------|------|-------------|
| `tenantId` | UUID | |
| `fiscalYearStartMonth` | integer | 1-12 |
| `periodClosePolicy` | enum | `Open`, `SoftLocked`, `HardLocked` |
| `allowSoftLockOverride` | boolean | |
| `softLockOverrideRoles` | array(UUID) | |

---

## Currency Rules

| Rule | Detail |
|------|--------|
| Functional currency lock | Cannot change after first posted transaction |
| Transaction currency | Must be in allowed list |
| Precision | Must match accounting precision table |
| Same-currency rate | Enforced as `1` |

## Exchange Rate Rules

| Rule | Detail |
|------|--------|
| Date lookup | Uses transaction date then latest prior rate |
| Manual rate update | Requires reason; optional manager PIN per policy |
| Missing rate | Block posting in financial modules |
| Rate correction | New effective-dated rate only; no in-place edit |

## Fiscal Period Rules

| Rule | Detail |
|------|--------|
| Policy ownership | Settings/Admin sets policy; accounting enforces at posting |
| Hard lock transition | Owner or privileged role only |
| Reopen hard-locked period | Manager PIN + reason + audit |
| Soft lock override | Allowed only for permitted roles |
| Future period operations | Controlled by accounting period validation |

## Cross-Reference

| Reference | Alignment |
|-----------|-----------|
| `accounting/03-multi-currency.md` | Exchange-rate structure and precision governance |
| `accounting/08-period-control.md` | Period lock enforcement and validation flow |
