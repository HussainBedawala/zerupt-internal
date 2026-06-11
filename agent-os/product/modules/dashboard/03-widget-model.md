# Widget Model

## Widget Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `ownerUserId` | UUID | |
| `widgetType` | enum | `KPI`, `LineChart`, `BarChart`, `PieChart`, `Table`, `List`, `ApprovalQueue`, `AlertFeed` |
| `sourceType` | enum | `KPIRegistry`, `SavedReport`, `SystemFeed` |
| `sourceId` | string | |
| `layout` | json | `{x,y,w,h}` grid placement |
| `configJson` | json | Viz and filter config |
| `refreshMode` | enum | `Auto`, `Manual` |
| `refreshIntervalSec` | integer | |
| `isPinned` | boolean | |

## Layout Constraints

| Rule | Detail |
|------|--------|
| Grid | 12-column responsive grid |
| Min size | KPI `2x1`; chart/table `4x2` |
| Max size | `12x6` |
| Collision | Auto-resolve on drag/drop |
| Mobile | Single-column stack with priority order |

## Widget States

| State | Behavior |
|-------|----------|
| `Loading` | Skeleton shown |
| `Ready` | Last update timestamp visible |
| `Stale` | Data age indicator + manual refresh |
| `Error` | Error card + retry action |
| `PermissionDenied` | Locked widget with permission hint |

## Widget Actions

| Action | Rule |
|--------|------|
| Resize | Allowed if resulting layout valid |
| Move | Allowed in edit mode only |
| Duplicate | Clones config and source |
| Remove | Removes from current layout only |
| Pin from report | Requires source report visibility permission |
