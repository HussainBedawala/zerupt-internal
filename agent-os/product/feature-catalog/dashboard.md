<!-- Feature catalog partition | Module: dashboard | Generated: 2026-06-11 | Source: as-built audit -->
# Dashboard — Feature Catalog

> Status legend: `shipped` = in production code as of 2026-06-11 · `planned` = specced, not yet built.

---

## Dashboard Shell & Information Architecture

- **Status:** shipped
- **Description:** A responsive dashboard shell with five layout zones (TopSummary, TrendRow, OperationsRow, ExceptionsRow, ActivityRow). Renders as the default post-login landing page for every user, with widget-level error isolation so a single failing widget never crashes the whole page.
- **Who it's for:** All roles — owner, manager, staff.
- **Constraints / notes:** Zone structure is enforced in code; mobile collapses to a single-column priority stack. Drill-down deep links (L1→L2→L3) exist in spec but the L2/L3 transition flow is not yet wired in the frontend beyond navigation links.

---

## KPI Tile Set (Today Sales, Gross Margin MTD, Low Stock Count, Outstanding AR)

- **Status:** shipped
- **Description:** Four KPI cards aggregated live from the tenant DB — today's net sales (with percent change vs prior day), gross margin month-to-date, low-stock item count, and outstanding accounts-receivable balance. Each refreshes automatically every 60 seconds.
- **Who it's for:** Owner, store manager, finance manager.
- **Constraints / notes:** Shipped KPI set is a subset of the full spec catalog. Pending PO value, AP overdue, register variance, VAT payable, and stock-cover days are specced but not yet exposed by the API or rendered as KPI tiles. Gross margin requires accounting records; new tenants see `null` until journal entries exist.

---

## Sales Trend Chart (7-day Bar Chart)

- **Status:** shipped
- **Description:** A 7-day daily-sales bar chart showing net sales per day, scoped to the selected branch. Uses the same net-sales-by-date formula as the daily-sales report, so chart figures always agree with reports.
- **Who it's for:** Owner, store manager.
- **Constraints / notes:** Days parameter is fixed at 7 in the frontend (configurable in API). Comparison overlay (vs prior period / prior year) is specced but not rendered.

---

## Recent Transactions Feed

- **Status:** shipped
- **Description:** A merged list of the 10 most recent POS transactions and sales invoices, showing document number, customer name, amount, and timestamp. Refreshes every 60 seconds.
- **Who it's for:** Store manager, cashier, owner.
- **Constraints / notes:** Combines POS and invoices only; purchase orders and accounting vouchers are not included.

---

## Branch Filter

- **Status:** shipped
- **Description:** A branch selector in the dashboard header that scopes all KPIs, the sales chart, and the recent-transactions feed to a specific branch. Persists the selection in the URL query string (`?branchId=`) so the view survives page reloads and can be shared.
- **Who it's for:** Multi-branch owners and regional managers.
- **Constraints / notes:** Unknown or unauthorized branch IDs fall back to "all branches" automatically. Branch scope is enforced server-side on every API call.

---

## Widget Visibility & Ordering (Client-side Personalization)

- **Status:** shipped
- **Description:** Every widget can be toggled visible/hidden and reordered up/down via a "Customize" mode. Preferences are persisted in localStorage using Zustand, so the layout survives page refreshes without a server round-trip.
- **Who it's for:** Any logged-in user.
- **Constraints / notes:** Persistence is per-browser (localStorage), not per-user account — layout does not sync across devices. The spec's full server-side saved-view entity (shared views, role-based sharing, multi-device sync) is planned but not built.

---

## Role-Based Default Layouts (Onboarding Seeder)

- **Status:** shipped
- **Description:** Five permission-matched layout profiles (executive, operations, finance, procurement, warehouse) are seeded into the tenant DB at onboarding step 10. On first login, the system applies the best-matching profile to a user's widget store, giving every role a sensible starting dashboard without manual setup.
- **Who it's for:** All roles, automatically applied.
- **Constraints / notes:** Profile matching and seeding are fully built (DashboardDefaultsService + dashboard_layout_defaults table). The frontend "first-login apply" flow reads from onboarding state; profile upgrade badges ("new" for 7 days) and auto-replacement of deprecated widgets are specced but not wired.

---

## First-Login Onboarding Block

- **Status:** shipped
- **Description:** A dismissable welcome block shown at the top of the dashboard for fresh tenants, containing a welcome banner, optional walkthrough video slot, a Zee AI greeting strip, and a quick-start checklist. Auto-dismisses when all checklist items are complete or the welcome window expires.
- **Who it's for:** New tenants on their first login.
- **Constraints / notes:** Entirely fail-silent — any API error causes the block to render nothing rather than break the dashboard. Zee greeting strip shows Mira's highest-priority migration next-move when a migration is in progress.

---

## Near-Expiry Batch Banner

- **Status:** shipped
- **Description:** A compact alert strip that appears on the dashboard when there are inventory batches expiring within 30 days or already expired. Shows counts and links directly to the batches list. Renders nothing when there are no actionable batches.
- **Who it's for:** Warehouse manager, store manager, owner.
- **Constraints / notes:** Fail-silent on error. Only surfaces batch-tracked items; non-batch inventory is not covered.

---

## Quick Actions Panel

- **Status:** shipped
- **Description:** Four large shortcut buttons linking directly to the most common daily workflows: Open POS, New Sales Invoice, New Inventory Adjustment, and View Reports.
- **Who it's for:** All operational roles (cashier, store manager, inventory manager).
- **Constraints / notes:** Actions are static (hardcoded in frontend). The spec's dynamic quick-action catalog (role-relevance ranking, usage-frequency ordering, permission-gated visibility) is planned but not built.

---

## Advisor Card (AI Recommendation Panel)

- **Status:** shipped (placeholder UI only)
- **Description:** A citron-accent card slot reserved for Zee/Mira AI recommendations on the dashboard. Currently renders a "warming up" placeholder with a disabled CTA when no live recommendation is passed in.
- **Who it's for:** Owner, manager.
- **Constraints / notes:** The UI component is built and accepts a real recommendation object; however the AI endpoint that generates and feeds recommendations to this card is not yet connected. It will become fully live when the AI suggestion pipeline is wired.

---

## Dashboard Permissions (RBAC)

- **Status:** shipped
- **Description:** The dashboard is gated by the `reports.dashboard.view` permission key. Finance-sensitive widgets (margin, AR, cost KPIs) have additional field-level gating so users without accounting access see those fields hidden or obfuscated.
- **Who it's for:** All users — enforced server-side on every endpoint.
- **Constraints / notes:** The full permission key set from spec (`dashboard.widget.manage`, `dashboard.view.share`, `dashboard.export`, `dashboard.alert.ack`, `dashboard.actions.execute`) is specced but the API only enforces `reports.dashboard.view` today. Finer-grained widget-level permission enforcement is planned.

---

## Auto-Refresh (60-second Polling)

- **Status:** shipped
- **Description:** KPI tiles and the recent-transactions feed poll the API every 60 seconds via TanStack Query. Stale-while-revalidate ensures the UI stays responsive while new data loads in the background.
- **Who it's for:** All dashboard users.
- **Constraints / notes:** The sales chart uses a stale timer but does not auto-refetch on interval in the current implementation. Server-Sent Events (real-time push) are planned for the operations and alerts queue but not yet implemented for the dashboard.

---

## Work Queue / Alerts Feed

- **Status:** planned
- **Description:** A prioritized work queue surfacing pending approvals, overdue collections, POS discrepancies, and procurement risks from across all modules, with severity badges, SLA timers, and batch-acknowledge actions.
- **Who it's for:** Manager, owner, finance team.
- **Constraints / notes:** Alert entity schema is specced and partially defined; the queue widget type exists in the widget registry spec but the backend aggregation service and frontend AlertFeed widget are not yet built.

---

## AI Suggestion Feed (Accounting Guardian, Inventory Sentinel, etc.)

- **Status:** planned
- **Description:** An AI-generated suggestion card queue on the dashboard, fed by the four AI agents (Accounting Guardian, Inventory Sentinel, Compliance Watcher, Onboarding Coach). Users can accept, dismiss with a reason, and rate suggestions as helpful or not.
- **Who it's for:** Owner, manager, finance team.
- **Constraints / notes:** The suggestion card entity, feedback schema, and rate-limit quotas are fully specced. The backend suggestion pipeline and frontend SuggestionFeed widget are not yet built.

---

## Saved Views & View Sharing

- **Status:** planned
- **Description:** Named, shareable dashboard views that capture the global filter state (date range, branch, comparison mode) and widget layout. Views can be private, shared with a role, a team, or the whole tenant.
- **Who it's for:** Managers who want consistent views for daily stand-ups or shift handovers.
- **Constraints / notes:** Saved-view entity schema is fully specced; no server-side persistence or sharing UI is built. Current personalization is browser-local only.

---

## Dashboard Export

- **Status:** planned
- **Description:** Export a snapshot of the current dashboard view (widget data + applied filters) as a PDF or CSV for reporting and record-keeping.
- **Who it's for:** Owner, finance manager.
- **Constraints / notes:** Permission key `dashboard.export` is specced; no export endpoint or UI is built.
