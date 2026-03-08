# Information Architecture

## Layout Zones

| Zone | Purpose | Capacity Rule |
|------|---------|---------------|
| `TopSummary` | High-priority KPIs | 4-8 KPI cards |
| `TrendRow` | Time-series trends | 1-3 charts |
| `OperationsRow` | Pending work and bottlenecks | 2-4 widgets |
| `ExceptionsRow` | Alerts, anomalies, risk items | 1-3 widgets |
| `ActivityRow` | Recent actions and audit highlights | 1-2 widgets |

## Navigation Rules

| Rule | Detail |
|------|--------|
| Primary entry | Dashboard is default post-login landing page |
| Module handoff | Every widget has at least one deep-link target |
| Context carryover | Branch/date/filter context persists into deep-linked module |
| Back navigation | Returning restores dashboard scroll/filter state |

## Drill-down Levels

| Level | Output |
|------|--------|
| `L1` | KPI summary |
| `L2` | Trend/segment breakdown |
| `L3` | Transaction list or document set in source module |

## Empty and Error States

| State | Required UI |
|-------|-------------|
| `EmptyTenant` | Onboarding checklist + starter widgets |
| `NoDataInRange` | Date-range hint + quick range presets |
| `PartialFailure` | Widget-level fallback with retry |
| `GlobalFailure` | Safe fallback shell + incident banner |
