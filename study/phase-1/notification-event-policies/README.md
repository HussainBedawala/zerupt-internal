## 1. Event-Driven Notification Architecture

**What:** A pattern where business events (low stock, approval needed, shift discrepancy) are mapped to configurable notification policies that control who gets notified, how, and when.

**Why it matters:** Zerupt targets multi-branch retail where different roles need different alerts. A cashier doesn't need inventory alerts; an owner needs critical escalations. Hardcoding notification logic is unmaintainable — a policy table makes it admin-configurable.

**How it works:**
- Each event key (e.g. `inventory.lowStock`) maps to a `NotificationEventPolicy` row per tenant
- Policies define severity, channels (in-app/email), throttle windows
- `RecipientRule` rows define who receives each event (by role, user, or owner) with optional branch scoping
- When an event fires, the dispatcher reads the policy → resolves recipients → applies throttling → delivers

**Resources:**
- [Event-driven architecture patterns](https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/event-driven)
- [Notification system design](https://blog.bytebytego.com/p/designing-a-notification-system)

## 2. Partial Indexes in PostgreSQL

**What:** An index that only covers rows matching a WHERE condition, reducing index size and write amplification.

**Why it matters:** The notification dispatcher only queries enabled policies and active recipient rules. Partial indexes like `WHERE is_enabled = true` mean disabled policies are never scanned, and the index stays small even as the policy table grows.

**How it works:**
```sql
-- Only index enabled policies — disabled ones are never queried in the hot path
CREATE INDEX notification_event_policies_enabled
  ON notification_event_policies (tenant_id, event_key)
  WHERE is_enabled = true;

-- Only index active recipient rules
CREATE INDEX recipient_rules_active_by_policy
  ON recipient_rules (policy_id, recipient_type)
  WHERE is_active = true;
```

Prisma supports this via the `partialIndexes` preview feature:
```prisma
@@index([tenantId, eventKey], where: raw("\"is_enabled\" = true"))
```

**Resources:**
- [PostgreSQL partial indexes docs](https://www.postgresql.org/docs/current/indexes-partial.html)
- [Prisma partial indexes](https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes#partial-indexes)

## 3. Partial Unique Constraints for Polymorphic Data

**What:** Using multiple partial unique indexes to enforce different uniqueness rules based on a discriminator column (like `recipientType`).

**Why it matters:** `RecipientRule` has three types — Role, User, Owner — each with different uniqueness semantics. A standard unique constraint can't handle "at most one Owner per policy" because `NULL != NULL` in Postgres.

**How it works:**
```sql
-- One role per (policy, roleId)
CREATE UNIQUE INDEX recipient_rules_unique_role
  ON recipient_rules (policy_id, recipient_id)
  WHERE recipient_type = 'role' AND recipient_id IS NOT NULL;

-- One user per (policy, userId)
CREATE UNIQUE INDEX recipient_rules_unique_user
  ON recipient_rules (policy_id, recipient_id)
  WHERE recipient_type = 'user' AND recipient_id IS NOT NULL;

-- At most one owner per policy (no recipient_id to compare)
CREATE UNIQUE INDEX recipient_rules_unique_owner
  ON recipient_rules (policy_id)
  WHERE recipient_type = 'owner';
```

**Resources:**
- [PostgreSQL unique indexes](https://www.postgresql.org/docs/current/indexes-unique.html)
- [Handling NULLs in unique constraints](https://dba.stackexchange.com/questions/9759)

## 4. Junction Tables vs Array Columns

**What:** Storing many-to-many relationships in a dedicated join table instead of a PostgreSQL array column.

**Why it matters:** The spec originally called for `branchScope UUID[]` on `RecipientRule`. A junction table (`RecipientRuleBranch`) was chosen instead because arrays can't enforce foreign keys, can't be indexed per-element efficiently, and silently accumulate phantom UUIDs when referenced rows are deleted.

**Key differences:**
| | Array column | Junction table |
|--|-------------|----------------|
| FK enforcement | None | Yes (`ON DELETE RESTRICT`) |
| Per-element indexing | Needs GIN | Standard B-tree |
| Point lookup | `@> ARRAY[$1]` | `WHERE branch_id = $1` |
| Cascading deletes | Manual cleanup | Automatic via FK |
| Row size | Grows with array | Fixed small rows |

**Resources:**
- [PostgreSQL array vs join table](https://dba.stackexchange.com/questions/164804)
- [When to use PostgreSQL arrays](https://wiki.postgresql.org/wiki/Don%27t_Do_This#Don.27t_use_arrays)

## 5. CHECK Constraints for Domain Integrity

**What:** Database-level rules that validate data beyond what the ORM can express — format patterns, value ranges, cross-column consistency.

**Why it matters:** Prisma doesn't generate CHECK constraints. Without them, a malformed `event_key` (wrong casing, typo) would silently persist and cause the notification dispatcher to miss events. The constraint acts as a last-resort guard even when the app layer has a bug.

**Examples from this issue:**
```sql
-- Event key must be dot-notation: module.eventName
CHECK (event_key ~ '^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$')

-- Throttle window: 0–7 days
CHECK (throttle_window_minutes >= 0 AND throttle_window_minutes <= 10080)

-- Owner type must have null recipient_id
CHECK (recipient_type != 'owner' OR recipient_id IS NULL)
```

**Resources:**
- [PostgreSQL CHECK constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS)
- [Prisma hand-editing migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations)
