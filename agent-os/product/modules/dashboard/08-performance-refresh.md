# Performance and Refresh

## Refresh Policy

| Data Class | Refresh Mode | Interval |
|------------|--------------|----------|
| KPI summary | Auto | 60s |
| Charts/trends | Auto | 120s |
| Work queue | Auto | 30s |
| Heavy tables | Manual default | On demand or 300s |

## Latency Budgets

| Metric | Target |
|--------|--------|
| First meaningful render | <= 3.0s |
| KPI widget response p95 | <= 800ms |
| Chart widget response p95 | <= 1500ms |
| Deep-link handoff | <= 500ms for navigation start |

## Caching Rules

| Rule | Detail |
|------|--------|
| Query cache key | Tenant + user + branch scope + filter hash |
| Stale-while-revalidate | Enabled for dashboard reads |
| Cache invalidation | Triggered by relevant source-module events |
| Snapshot fallback | Last successful payload used on transient failures |

## Failure Handling

| Failure | Behavior |
|---------|----------|
| Widget timeout | Show fallback state with retry |
| Partial outage | Keep healthy widgets rendering |
| Auth scope change | Re-evaluate visible widgets and filters |
