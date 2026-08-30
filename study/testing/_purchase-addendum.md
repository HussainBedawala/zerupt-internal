# Phase D — Purchase: addendum (read AFTER _agent-briefing.md, it still applies in full)

## Purchase-specific facts you must not re-litigate
- Purchase was hardened previously. Read `study/purchase/_hardening-log.md` before filing any
  design finding, so you don't re-open settled design.
- **Dual path is the headline.** Order path (PO -> GRN -> bill -> payment) AND direct path
  (direct purchase / direct bill) must BOTH be hardened. A fix to one is half a fix. On every
  defect ask: does the OTHER path still enforce the old behaviour?
- **FX fails loud BY DESIGN** (`purchase-fx-guard.ts`, resolved erp 69be287c). Stated-currency
  paths support FX; derived paths refuse it loudly. Do NOT file the loud refusal as a bug and do
  NOT re-fix it. Founder ruling 2026-08-27: full multi-currency FX is DEFERRED post-launch.
  Kuwait tenant is single-currency KWD. Only file an FX item if it breaks a KWD-only flow.
- **AP balances and aging derive from the party-tagged GL control account (trade_payables 2111)**,
  never from denormalized bill balances. If a stored bill balance disagrees with the aging report,
  check WHICH source you read before calling it a bug.
- Inventory value posts to `merchandise_inventory` 1141. Cost pools are **company-wide per
  (item, legal entity)**, not per branch. A company-wide cost is NOT a branch leak.
- Money correctness is non-negotiable here: landed cost, average-cost recalculation on receipt,
  COGS. Any 2dp rounding in a 3dp KWD tenant is a bug.
- Personas: **storekeeper1 receives** (GRN), **accountant1 bills and pays**. Test as them, not as
  the owner. All test users password `Zerupt.Test@2026`.

## The three defect patterns POS surfaced — hunt for them here
1. **Path divergence** (the signature defect): order vs direct, client vs server, DTO vs guard.
2. **False success**: a success toast after a 500/403. Check every toast against the real HTTP
   status AND the DB row. Most dangerous class in this product.
3. **Permission-gated lookups a user legitimately cannot make, failing silently downstream**
   (crash, flicker, untranslated chip, 2dp money). Fix by sourcing the value from a payload the
   user CAN already read. Never widen a permission to fix a render bug.

## Cross-cutting items already open — do NOT fix blind, just note if you see them here
- PERF-002 (HIGH): identical warm request 1.9s via curl vs 5.1s in browser (~3s above the API).
- AUDIT-002 (CRIT): POST /tenant/accounts/bulk has no audit path.
- AUDIT-003 (HIGH): exports are unauditable; the interceptor never audits GET.
- AUDIT-004 (HIGH): audit_log has no branch_id / legal_entity_id.
- ~30 list panels lack `placeholderData: keepPreviousData` and unmount the pager on page change.
  Purchase's share is in scope for this phase.
- PERM-004 pattern: a denied user gets a fully interactive form, blocked only on submit.
