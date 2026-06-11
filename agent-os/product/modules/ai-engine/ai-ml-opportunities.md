# AI/ML Opportunities (Top 10)

> A brief document on where opportunity lies in the product for the integration of AI/ML features to improve the product.

## 1. Autonomous Replenishment Intelligence
- Goal: Reduce stockouts and overstock while improving cash efficiency.
- Inputs: sales velocity (30/60/90d), seasonality, lead-time reliability, stockout history, current on-order/on-hand.
- Method: baseline forecast + lead-time risk model + safety-stock optimizer; fallback to fixed reorder rules.
- Outputs: recommended `reorderLevel`, `reorderQty`, ETA confidence, supplier risk score.
- Integration: `inventory/09-reorder-engine.md` + PO suggestion flow in Purchase.
- Guardrails: user approval required; hard caps by budget, max stock, and shelf-life constraints.
- KPI: stockout rate, inventory turns, excess stock value, forecast MAPE.

## 2. Financial Close Copilot (Bank Reconciliation + Exceptions)
- Goal: Cut month-end reconciliation time and reduce unmatched lines.
- Inputs: statement lines (date/ref/amount/desc), vouchers, cheque states, journal lines, prior match patterns.
- Method: deterministic matching first, ML ranking for fuzzy matches, confidence-based human review.
- Outputs: auto-match proposals, exception buckets, suggested adjusting entries (bank charges/direct debits).
- Integration: `accounting/10-bank-reconciliation.md` workflow (review -> confirm -> reconcile).
- Guardrails: never auto-post adjustments without approval; enforce period lock checks.
- KPI: auto-match %, manual effort hours, reconciliation cycle time, post-close adjustments.

## 3. Fraud and Shrinkage Sentinel
- Goal: Detect suspicious POS and inventory behavior early.
- Inputs: voids, overrides, discounts, return reasons, shift variance, count variances, cashier patterns.
- Method: hybrid rules + anomaly model (user/shift/item baseline deviations).
- Outputs: risk score per event/user/branch and prioritized investigation queue.
- Integration: dashboard alert cards/work queue + POS discount/void controls.
- Guardrails: reason capture for critical actions; explainable flags to avoid blind trust.
- KPI: shrinkage %, fraud loss prevented, false-positive rate, investigation SLA.

## 4. Natural Language BI (NLQ)
- Goal: Let users query business data without report-builder expertise.
- Inputs: report entities, field registry, allowed operators, permission scopes, fiscal constraints.
- Method: NL -> constrained `ReportDefinition` JSON -> validated SQL via query engine.
- Outputs: result set + generated query summary + follow-up question suggestions.
- Integration: `reports/02-report-builder.md` and `reports/04-query-engine.md`.
- Guardrails: strict allowlist (entities/fields), no raw SQL, RBAC enforced, tenant DB isolation.
- KPI: NLQ success rate, time-to-answer, support tickets avoided, user adoption.

## 5. AI Report Builder Copilot
- Goal: Convert plain-language reporting intent into reusable reports.
- Inputs: user prompt, existing templates, KPI catalog, common filters/groupings.
- Method: intent classification + template retrieval + field/filter auto-composition.
- Outputs: draft report definition, visualization suggestion, schedule suggestion.
- Integration: report save/share/schedule pipeline + dashboard widgets.
- Guardrails: require user confirmation before save/share; validate metric semantics.
- KPI: report creation time, edit rate after generation, saved-report reuse rate.

## 6. Dynamic Credit Risk and Collections Prioritization
- Goal: Lower bad debt and optimize collection effort.
- Inputs: AR aging, payment delay history, dispute frequency, invoice size/frequency, credit overrides.
- Method: default-risk score + payment-propensity score + queue prioritization.
- Outputs: risk tier, suggested credit limit change, next-best collection action.
- Integration: customer model credit checks + collections queue in dashboard.
- Guardrails: soft recommendations by default; manual override with reason + audit trail.
- KPI: DSO, overdue AR %, write-off %, collection success rate.

## 7. Supplier Reliability and PO Risk Predictor
- Goal: Improve PO planning and reduce late-delivery disruption.
- Inputs: promised vs actual lead times, fill-rate, return/quality incidents, price volatility.
- Method: supplier scorecard model + ETA confidence estimator per PO line.
- Outputs: late-risk alert, alternate supplier suggestion, buffer-day recommendation.
- Integration: Purchase approval flow + inventory reorder suggestion pipeline.
- Guardrails: do not auto-switch suppliers; enforce approved supplier policies.
- KPI: on-time-in-full %, emergency purchases, stockout incidents due to delays.

## 8. Margin Intelligence and Price/Promo Optimization
- Goal: Improve gross margin without harming sales velocity.
- Inputs: cost layers (WAC/FIFO), realized margin by SKU/branch, promo history, discount depth/performance.
- Method: elasticity estimation + scenario simulator for price/promo combinations.
- Outputs: recommended price bands, promo candidates, floor-price warnings.
- Integration: inventory pricing engine + POS discount thresholds.
- Guardrails: honor minimum margin and legal pricing constraints; manager approval for risky changes.
- KPI: gross margin %, promo ROI, markdown loss %, revenue lift vs control.

## 9. Expiry and Waste Optimizer (Batch/FEFO-Aware)
- Goal: Reduce expiry write-offs and improve sell-through of aging batches.
- Inputs: batch expiry dates, FEFO consumption, item velocity, branch demand imbalance.
- Method: expiry-risk model + transfer/markdown recommendation engine.
- Outputs: at-risk batch list, suggested markdown ladder, inter-branch transfer plan.
- Integration: batch tracking + reorder/alerts + inventory adjustment workflow.
- Guardrails: block recommendations that create stockouts in source branches.
- KPI: expiry write-off value, aged stock days, batch sell-through rate.

## 10. Tax and Compliance Anomaly Guard
- Goal: Catch tax misconfiguration and filing-risk patterns before penalties.
- Inputs: tax codes/groups/rates, effective-date changes, transaction-level tax outcomes, return summaries.
- Method: rules for policy violations + anomaly detection on tax ratios/trends.
- Outputs: compliance alerts, likely root cause, impacted document set, remediation checklist.
- Integration: tax config controls + event-to-journal mappings + reporting layer.
- Guardrails: enforce maker-checker for tax-rate changes; immutable audit linkage.
- KPI: filing adjustments, compliance incident count, correction lead time.
