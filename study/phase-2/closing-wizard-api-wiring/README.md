# Closing Wizard API Wiring

## Concept

Wiring a multi-step wizard UI to backend APIs for financial operations. The pattern combines **progressive disclosure** (show data step-by-step) with **defensive data freshness** (always fetch latest before destructive actions).

## Key Topics

### 1. Preview-Before-Commit Pattern

Financial operations should always show a preview of what will happen before executing. The "preview" method mirrors the "execute" method's logic but returns data without side effects. Both must share the same guards (authorization, state checks, balance assertions) to prevent inconsistency.

**Risk:** Logic drift between preview and execute methods. Mitigation: extract shared helpers, or generate preview from the same code path with a `dryRun` flag.

### 2. Stale Data in Financial UIs

TanStack Query's `staleTime: 0` forces a refetch every time the component mounts or the query is re-enabled. For financial previews before destructive actions, stale data is dangerous — a user could approve a closing entry based on outdated balances.

Additionally, triggering `refetch()` on step transitions ensures the preview reflects the current state, not a cached snapshot from when the dialog first opened.

### 3. Advisory vs Blocking Checks

Pre-closing checks can be **advisory** (warn but allow proceeding) or **blocking** (prevent the action). The checklist pattern returns each check with a `status` (passed/failed/skipped) and lets the frontend decide the policy. Currently all checks are advisory — no check blocks closing.

Design consideration: as the system matures, some checks (e.g., unbalanced trial balance) should become blocking. The API should return a `canProceed` boolean alongside individual check statuses.

### 4. Translation Fallback Strategy

When backend returns dynamic keys (like check names), the frontend tries to translate using a known key pattern (`closeYear.checks.${key}`). If the translation doesn't exist (new check added to backend but not yet translated), it falls back to the backend-provided `label` field.

This is a graceful degradation pattern for i18n in systems where the backend and frontend evolve independently.

### 5. Currency Formatting with Intl.NumberFormat

`Intl.NumberFormat` handles locale-specific currency formatting (symbol placement, decimal separators, grouping). The currency code comes from the API (not hardcoded), supporting multi-currency tenants.

Key detail: Arabic locale uses `ar-SA` for consistent numeral rendering. The `0` amount is displayed as a dash (`—`) for cleaner financial tables.

### 6. Sign Convention in Accounting

In double-entry bookkeeping, the sign of `netIncomeExpense` follows a convention:
- **Positive** = expenses exceed income = **net loss**
- **Negative** = income exceeds expenses = **net profit**

This is counterintuitive and must be documented clearly. The frontend must invert the display logic: positive values show as "Loss", negative as "Profit".

## Related

- [Year-End Closing Entries](../year-end-closing-entries/README.md)
- [Pre-Closing Checklist](../pre-closing-checklist/README.md)
- [Period Control Lock Workflow](../period-control-lock-workflow/README.md)
