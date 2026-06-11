# Permissions Matrix — All Accounting Modules

> Source of truth: `packages/shared/src/permissions.ts`
> RBAC schema: `packages/db/src/schema/rbac.ts`
> Guard: `apps/api/src/auth/permission.guard.ts`
> Decorator: `apps/api/src/auth/requires-permission.decorator.ts`
> Product spec: `agent-os/product/settings-admin/03-roles-permissions-policy.md`

## Status

**Code: Partially implemented.** Permission keys are defined. Guards are applied on COA, JE, account mapping, fiscal period, FX revaluation, and reconciliation controllers. Several modules lack guard annotations. This spec is the complete matrix for all accounting operations.

---

## Permission Format

`module.entity.action` — all lowercase, dot-separated. Defined in `packages/shared/src/permissions.ts` as frozen objects.

## Scope Types

| Scope | Meaning | Use Case |
|-------|---------|----------|
| `Tenant` | Full access across all branches | Admin, accountant |
| `Branch` | Access limited to specific branches | Branch manager |
| `Own` | Access limited to records created by self | Data entry clerk |

---

## Full Permission Matrix

### Chart of Accounts

| Endpoint | Method | Permission Key | Implemented |
|----------|--------|---------------|-------------|
| `/tenant/accounts` | GET | `accounting.account.list` | Yes |
| `/tenant/accounts/tree` | GET | `accounting.account.list` | Yes |
| `/tenant/accounts/:id` | GET | `accounting.account.read` | Yes |
| `/tenant/accounts` | POST | `accounting.account.create` | Yes |
| `/tenant/accounts/:id` | PATCH | `accounting.account.update` | Yes |
| `/tenant/accounts/:id` | DELETE | `accounting.account.delete` | Yes |
| `/tenant/accounts/seed-template` | POST | `accounting.account.seed` | Yes |
| `/tenant/accounts/export` | GET | `accounting.account.export` | No (endpoint not built) |

### Journal Entries

| Endpoint | Method | Permission Key | Implemented |
|----------|--------|---------------|-------------|
| `/tenant/journal-entries` | GET | `accounting.journal.list` | Yes |
| `/tenant/journal-entries/:id` | GET | `accounting.journal.read` | Yes |
| `/tenant/journal-entries` | POST | `accounting.journal.create` | Yes |
| `/tenant/journal-entries/:id` | PATCH | `accounting.journal.update` | Yes |
| `/tenant/journal-entries/:id` | DELETE | `accounting.journal.delete` | Check |
| `/tenant/journal-entries/:id/post` | POST | `accounting.journal.post` | Check |
| `/tenant/journal-entries/:id/approve` | POST | `accounting.journal.approve` | Check |
| `/tenant/journal-entries/:id/reject` | POST | `accounting.journal.reject` | Check |
| `/tenant/journal-entries/:id/reverse` | POST | `accounting.journal.reverse` | Yes |
| `/tenant/journal-entries/:id/void` | POST | `accounting.journal.void` | Check |
| `/tenant/journal-entries/export` | GET | `accounting.journal.export` | No (endpoint not built) |

### Account Mappings

| Endpoint | Method | Permission Key | Implemented |
|----------|--------|---------------|-------------|
| `/tenant/account-mappings` | GET | `accounting.mapping.list` | Yes |
| `/tenant/account-mappings/:id` | GET | `accounting.mapping.read` | Yes |
| `/tenant/account-mappings` | POST | `accounting.mapping.create` | Yes |
| `/tenant/account-mappings/:id` | PATCH | `accounting.mapping.update` | Yes |
| `/tenant/account-mappings/seed-defaults` | POST | `accounting.mapping.seed` | Yes |

### Fiscal Periods

| Endpoint | Method | Permission Key | Implemented |
|----------|--------|---------------|-------------|
| `/tenant/fiscal-periods` | GET | `accounting.period.list` | Yes |
| `/tenant/fiscal-periods/:id` | GET | `accounting.period.read` | Yes |
| `/tenant/fiscal-periods/:id/lock` | POST | `accounting.period.lock` | Yes |
| `/tenant/fiscal-periods/:id/unlock` | POST | `accounting.period.unlock` | Yes |

### FX Revaluation

| Endpoint | Method | Permission Key | Implemented |
|----------|--------|---------------|-------------|
| `/tenant/fx-revaluations` | POST | `accounting.revaluation.post` | Yes |
| `/tenant/fx-revaluations` | GET | `accounting.revaluation.read` | Check |

### Bank Reconciliation

| Endpoint | Method | Permission Key | Implemented |
|----------|--------|---------------|-------------|
| `/tenant/reconciliations` | POST | `accounting.reconciliation.create` | Check |
| `/tenant/reconciliations` | GET | `accounting.reconciliation.list` | Check |
| `/tenant/reconciliations/:id` | GET | `accounting.reconciliation.read` | Check |
| `/tenant/reconciliations/:id` | PATCH | `accounting.reconciliation.update` | Check |
| `/tenant/reconciliations/:id/approve` | POST | `accounting.reconciliation.approve` | Check |
| `/tenant/reconciliations/:id/reject` | POST | `accounting.reconciliation.reject` | Check |
| `/tenant/reconciliations/:id/void` | POST | `accounting.reconciliation.void` | Check |

### Tax Configuration

| Endpoint | Method | Permission Key | Needed |
|----------|--------|---------------|--------|
| `/tenant/tax-codes` | GET | `settings.tax.list` | Yes — not yet defined |
| `/tenant/tax-codes/:id` | GET | `settings.tax.read` | Yes |
| `/tenant/tax-codes` | POST | `settings.tax.create` | Yes |
| `/tenant/tax-codes/:id` | PATCH | `settings.tax.update` | Yes |
| `/tenant/tax-codes/:id` | DELETE | `settings.tax.delete` | Yes |

### Opening Balance

| Endpoint | Method | Permission Key | Needed |
|----------|--------|---------------|--------|
| `/tenant/opening-balances` | POST | `accounting.journal.create` | Reuses JE create |
| `/tenant/opening-balances/receivables` | POST | `accounting.journal.create` | Reuses JE create |
| `/tenant/opening-balances/payables` | POST | `accounting.journal.create` | Reuses JE create |
| `/tenant/opening-balances/inventory` | POST | `accounting.journal.create` + `inventory.stock.create` | Dual permission |
| `/tenant/opening-balances/fixed-assets` | POST | `accounting.journal.create` | Reuses JE create |

### Trial Balance & General Ledger (Reports)

| Endpoint | Method | Permission Key | Needed |
|----------|--------|---------------|--------|
| `/tenant/reports/trial-balance` | GET | `reports.trialBalance.read` | Yes — not yet defined |
| `/tenant/reports/general-ledger` | GET | `reports.generalLedger.read` | Yes |
| `/tenant/reports/profit-loss` | GET | `reports.profitLoss.read` | Yes |
| `/tenant/reports/balance-sheet` | GET | `reports.balanceSheet.read` | Yes |
| `/tenant/reports/cash-flow` | GET | `reports.cashFlow.read` | Yes |

### Year-End Closing

| Endpoint | Method | Permission Key | Needed |
|----------|--------|---------------|--------|
| `/tenant/year-end-closing/preview` | POST | `accounting.period.lock` | Reuses period lock |
| `/tenant/year-end-closing/execute` | POST | `accounting.period.lock` + `accounting.journal.create` | Dual permission |

### Currency & Exchange Rates

| Endpoint | Method | Permission Key | Implemented |
|----------|--------|---------------|-------------|
| `/tenant/currency-policy` | GET | `settings.currency.read` | Yes |
| `/tenant/currency-policy` | PATCH | `settings.currency.update` | Yes |
| `/tenant/currencies` | GET | `settings.currency.list` | Yes |
| `/tenant/currencies` | POST | `settings.currency.create` | Yes |
| `/tenant/currencies/:id` | PATCH | `settings.currency.update` | Yes |
| `/tenant/currencies/:id` | DELETE | `settings.currency.delete` | Yes |
| `/tenant/exchange-rates` | GET | `settings.currency.list` | Yes |
| `/tenant/exchange-rates` | POST | `settings.currency.create` | Yes |
| `/tenant/exchange-rates/bulk` | POST | `settings.currency.create` | Yes |
| `/tenant/exchange-rates/:id` | DELETE | `settings.currency.delete` | Yes |

---

## Segregation of Duties (SoD)

Mutually exclusive permission pairs — a single role cannot hold both without explicit owner override:

| Permission A | Permission B | Reason |
|-------------|-------------|--------|
| `accounting.journal.create` | `accounting.journal.approve` | Maker-checker for JEs |
| `accounting.reconciliation.create` | `accounting.reconciliation.approve` | Maker-checker for bank rec |
| `purchase.bill.create` | `purchase.bill.approve` | Maker-checker for AP |
| `purchase.order.create` | `purchase.order.approve` | Maker-checker for PO |

**Enforcement:** SoD rules are defined in `permissions.ts` (lines 405-410). Validated when assigning permissions to a role.

---

## Suggested Role Templates

### Accountant (Full)

All `accounting.*` permissions at Tenant scope. All `reports.*` at Tenant scope. `settings.currency.*` and `settings.tax.*` for configuration.

### Bookkeeper

`accounting.journal.create/read/list`, `accounting.account.read/list`, `accounting.mapping.read/list`, `reports.trialBalance.read`, `reports.generalLedger.read`. Branch-scoped.

### Auditor (Read-Only)

All `accounting.*.read` and `accounting.*.list` permissions. All `reports.*` permissions. No create/update/delete/post/approve. Tenant-scoped.

### Branch Manager

`accounting.journal.read/list`, `reports.*` at Branch scope for their branch only.

---

## Gaps to Address

### 1. Missing Permission Keys

The following modules need permission keys added to `permissions.ts`:

| Module | Needed Keys |
|--------|------------|
| Tax Configuration | `settings.tax.{create,read,update,delete,list}` |
| Reports | `reports.{trialBalance,generalLedger,profitLoss,balanceSheet,cashFlow}.read` |
| Document Numbering | `settings.docNumbering.{read,update}` |
| Event Listeners | No permission needed (system-internal) |
| Audit Trail | `accounting.audit.{read,list,export}` |

### 2. Guard Annotations Missing

Several existing controllers need `@RequiresPermission()` decorator verification:
- Manual Journal Entry controller
- Tax Configuration controller
- Opening Balance controller
- Financial Statements controller
- Audit Trail controller

### 3. Field-Level Masking (Schema Ready, Not Implemented)

`rolePermissions.field_mask` column exists but is not enforced by the guard. Use case: hide cost prices from branch sales staff, hide salary accounts from non-HR roles.

### 4. Report-Level Permissions

Reports should respect branch-scoped permissions:
- Branch-scoped user → trial balance filtered to their branch
- Tenant-scoped user → consolidated trial balance
- Currently no branch filtering on report endpoints
