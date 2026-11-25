# Review findings: cost/margin/profit split + dashboard cards (2026-11-22)

Founder decision: migration is STRICT (never widen). A role gets a card only if it held EVERY domain key behind that card's fields.

## Migration (packages/db, packages/shared tests) — agent A
- [ ] CRIT C1: 0610 grants cards on ANY sub-key. Change to ALL sub-keys per card (AND). Profit card = P&L AND inventory.cost.view.
- [ ] HIGH H1: delete reports.grossMargin.view / reports.invoiceProfit.view (raw + bundles) from roles that did not effectively hold inventory.cost.view (they got 403 before).
- [ ] MED: header comment: document fail-closed deploy window + strict narrowing.
- [ ] LOW: migration test exact-set assertions per card; registry test regex anchored to VALUES.

## API (apps/api) — agent B
- [ ] CRIT: receiptCreate back on SALES_ACTIONS.receiptCreate; topLateCustomer stays on customer.read (secondary gates in collections).
- [ ] HIGH: DTO types string|null for masked fields (gross-margin, invoice-profit, shared types); remove `as T` / `as never` casts.
- [ ] HIGH: stored invoice line: send costKnown when margin OR cost visible.
- [ ] HIGH: quotation draft-save/revise/create ignore input.projectCosts unless cost-price visible; revise copies v1 rows.
- [ ] HIGH: profit-reports-mask keep costAnomaly / COST_ZERO / costUnknown* flags when any of cost/margin/profit visible.
- [ ] MED: cashAfterBills needs money card AND billsDue.
- [ ] MED: POS summary cogsTrueUpStatus + COGS_TRUE_UP_* warnings gated on cost-price.
- [ ] MED: SSE revalidator re-evaluates allowed topics.
- [ ] LOW: salesperson cogsTrueUpTotal null not "0.000000"; line-costing-preview `as never` -> guard; drill-documents.item.spec duplicate key typo; attention spec "no attention key -> no rows" test; stale cost.view comments (9 sites).

## Web (apps/web) — agent C
- [ ] HIGH: kpi-strip margin-only: label "Gross margin", no changePct, no href.
- [ ] HIGH: quotation-create-line-editor-delivery-fee / add-many tests: mock useCan.
- [ ] HIGH: stored-line-cost-cells render marginPercent when present (don't require costKnown).
- [ ] HIGH: use-quotation-revise-save costVisible from costPriceView, not Boolean(costing).
- [ ] MED: dashboard queries enabled per card; noAccess = permissions loaded && !can(dashboardAnyView).
- [ ] MED: ecommerce price card + item-history: use server marginPercent when cost null.
- [ ] MED: role editor copy for margin/profit: note that with sales totals they can reveal cost.
- [ ] MED: prettier --write on touched files.
- [ ] LOW: delete dead line-costing-cells exports; Arabic fixes (receivablesPayables description, one term for dashboard); stale comments; sales-by-item.test import order; em dashes in comments; CODEMAPS wording (cost.view deleted, per-field allOf on dashboard).

## Accepted, not fixed
- Margin/profit + revenue lets cost be derived (founder accepted; documented in role copy).
- Cost-price holders now see cost next to revenue (that IS the See cost grant).
- Cost override write on cost-price key.
- Unrelated session changes in touched files (PermissionSetCache, staleTime, useHideAmounts, sales-chart rollup, activation) must NOT be committed with this.
