# Organisation Governance

## Tenant Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `code` | string | Immutable tenant code |
| `name` | string | Legal company name |
| `tradingName` | string | Optional |
| `nameAlt` | string | Alternate language |
| `registrationNumber` | string | Company registration |
| `taxRegistrationNumber` | string | VAT/GST/TRN |
| `industry` | string | Retail vertical. Dynamic string (not hardcoded enum) — populated from onboarding questionnaire or manual entry. Examples: Fashion/Apparel, Electronics/Mobile, Grocery/Supermarket, General Trading, Furniture/Home. |
| `inventoryConcept` | enum | `Serialized`, `BatchTracked`, `SimpleSKU`, `WeightedMeasured`, `Mixed`. Drives inventory tracking configuration, import field mappings, and agent behaviour. |
| `countryCode` | string | ISO country |
| `timezone` | string | IANA timezone |
| `languageDefault` | string | IETF BCP 47 locale code. Launch: `ar`, `en`. Phase 2: `hi`, `ms`. Phase 3: `id`, `tl`, `vi`. See `14-internationalization.md`. |
| `isRtlDefault` | boolean | Auto-derived from `languageDefault` script. RTL for `ar`; LTR for all others. |
| `status` | enum | `PendingProvisioning`, `Active`, `Suspended`, `Archived`, `ProvisioningFailed` |
| `subscriptionStatus` | enum | `Trial`, `Active`, `PastDue`, `Cancelled`, `Expired`. Managed in Central Admin DB; mirrored here for convenience. |
| `trialExpiresAt` | datetime | Nullable. 14 days after signup for trial tenants. |
| `dbProvisionedAt` | datetime | Nullable. When the dedicated database became ready. |
| `ownerUserId` | UUID | Current owner |
| `onboardingState` | json | Tracks questionnaire progress. Structure: `{ currentStep: number, completedSteps: number[], answers: object, startedAt: datetime, lastUpdatedAt: datetime }`. Null for tenants created outside onboarding. |
| `onboardingCompletedAt` | datetime | Nullable. Set when the go-live step is completed. |
| `onboardingVersion` | string | Nullable. Tracks which questionnaire version was used (e.g., `v1`, `v2`). Enables migration when questionnaire evolves. |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

## Address Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `type` | enum | `Primary`, `Billing`, `Shipping`, `RegisteredOffice` |
| `line1` | string | |
| `line2` | string | |
| `city` | string | |
| `state` | string | |
| `postalCode` | string | |
| `countryCode` | string | |
| `isDefault` | boolean | One default per type |

---

## Status Rules

| Status | Effect |
|--------|--------|
| `PendingProvisioning` | Dedicated database being created. User sees provisioning progress screen. |
| `ProvisioningFailed` | Database creation failed after retries. User sees retry/support option. |
| `Active` | Full system operation |
| `Suspended` | Login blocked except owner + platform support |
| `Archived` | Read-only mode, integrations disabled |
| `Archived` reversibility | Irreversible in tenant UI |

## Owner Rules

| Rule | Detail |
|------|--------|
| Single owner | Exactly one active owner at all times |
| Owner transfer | Requires current owner confirmation + manager PIN |
| Owner transfer constraints | No pending critical approvals, no unresolved security alerts |
| Owner permissions | Bypass role/branch restrictions |
| Owner deactivation | Blocked while owner role is assigned |

## Configuration Change Classes

| Class | Examples | Requirement |
|-------|----------|-------------|
| `Identity` | name, registration, tax number | Audit log with before/after |
| `Localization` | timezone, language, date format | Effective immediately |
| `Critical` | owner transfer, suspension, archive | Manager PIN + reason |
| `Onboarding` | onboardingState, onboardingCompletedAt | Append-only during onboarding flow; read-only after completion |

## Validation Rules

| Rule | Detail |
|------|--------|
| Country immutability | `countryCode` cannot change after first posted transaction |
| Timezone change | Not allowed in hard-locked accounting period close window |
| Tax registration format | Must satisfy selected country regex policy |
| Duplicate registration | Unique per tenant + jurisdiction |
| Onboarding state | `onboardingState` can only be updated while `onboardingCompletedAt` is null |
| Inventory concept immutability | `inventoryConcept` cannot change after first item is created |
