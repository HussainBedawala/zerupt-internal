# Audit Trail Viewer — Design

> Status: **Not implemented.** Backend captures audit data via `@Audited` decorator, no UI to view it.
> Route: `/accounting/audit-trail` or panel accessible from any accounting page

## What Exists

- `@Audited("EntityName")` decorator on all mutation endpoints (fiscal, mappings, etc.)
- `AuditLogService.append()` called with `before`/`after` states
- Audit data stored (assumed in audit log table — verify schema)

## Backend

### Endpoint

```
GET /tenant/audit-trail?module=accounting&entityType=&entityId=&fromDate=&toDate=&userId=&page=&limit=
Permission: accounting.audit.read
```

### Response Shape

```ts
{
  data: Array<{
    id: string;
    entityType: string; // "FiscalYear", "FiscalPeriod", "JournalEntry", "AccountMapping", "Account"
    entityId: string;
    action: string; // "create", "update", "delete", "close", "reopen", "lock", "unlock", "post", "reverse"
    userId: string;
    userName?: string; // enriched from user service
    source: string; // "Api", "System"
    before: Record<string, unknown> | null; // previous state
    after: Record<string, unknown> | null; // new state
    reason?: string; // user-provided reason (unlock, reopen, etc.)
    createdAt: string;
  }>;
  meta: { total; page; limit; };
}
```

## Frontend

### Page Layout

1. **Filter bar:** Entity type dropdown | Date range | User selector | Free-text search
2. **Table:** Timestamp | User | Entity Type | Entity | Action | Source
   - Expandable rows showing `before` → `after` diff (JSON diff view)
   - Color-coded actions: green=create, blue=update, amber=lock, red=delete/reverse
3. **Pagination**

### Access Points

- Dedicated page: `/accounting/audit-trail`
- Context panel: "View Audit History" button on fiscal year, JE detail, account detail pages — pre-filtered to that entity

### Interactions

- Click entity link → navigate to entity detail page
- Export CSV (filtered results)
- Diff view highlights changed fields (before → after)
