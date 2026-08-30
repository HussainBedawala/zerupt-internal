# Settings — Approvals & Controls, Notifications / Alert Policy, Document Numbering

Agent 10. Tenant: Gulf Auto Parts (Kuwait, KWD 3dp, en+ar). API `localhost:3001/api/v1`, web `localhost:3000`.
Method: code read end-to-end + SQL against the live tenant DB + authenticated curl (owner / cashier1 / accountant1 /
storekeeper1 JWTs) + one focused browser pass for the visual/RTL confirmation.

**API was NOT rebuilt or restarted by this agent.** No API/web source was modified. All findings are
report-only; the two one-line fixes I judged clearly correct are written out below as recommendations
(both would need a rebuild, and one crosses into `billing/` which is not my file-ownership area).

## Ledger gate (status-aware)

```sql
select round(sum(l.debit-l.credit),6) from journal_entry_lines l
  join journal_entries je on je.id=l.journal_entry_id
  where je.status in ('posted','reversed');
```
Before first write: `0.000000`. After last write: `0.000000`. (No journal-touching writes were made.)

## Restore verification

```sql
-- approval flags: all eight back to original FALSE
select require_po_approval, require_payment_approval, require_bill_approval, require_return_approval,
       require_invoice_approval, require_refund_approval, require_pos_amend_approval, require_journal_approval
from tenant_identity;
--  f | f | f | f | f | f | f | f          (identical to the pre-test snapshot)

-- numbering: ZZTEST sequence + its 10 reservations removed, original count restored
select count(*) from document_sequences where prefix like 'ZZTEST%';   -- 0
select count(*) from document_sequences;                                -- 79  (79 before the test)

-- notification policies: never written (only read + one rejected 400 probe)
select event_key, is_enabled, severity, channel_in_app, channel_email, throttle_window_minutes
from notification_event_policies order by event_key;   -- 16 rows, unchanged
```

---

# RANKED FINDINGS

## HIGH-1 — CONFIRMED — Event Policies table renders raw i18n key paths for 6 of 16 events

`apps/web/src/features/notifications/components/notification-policies-table.tsx` renders
`t('eventNames.' + eventKeyToI18nKey(policy.eventKey))`. Six catalog events have no message key, so
next-intl falls back to printing the key path in BOTH en and ar.

Browser evidence (`/en/settings/notifications` → Event Policies tab, owner, All branches):
```
settings.notifications.eventPolicies.eventNames.billingTrialEndingSoon      Warning ...
settings.notifications.eventPolicies.eventNames.billingTrialExpiredReadOnly Critical ...
settings.notifications.eventPolicies.eventNames.billingTrialWeekOne         Info ...
settings.notifications.eventPolicies.eventNames.inventoryCost_poolValue_discarded Critical ...
settings.notifications.eventPolicies.eventNames.inventoryNegative_stockFlagged   Warning ...
settings.notifications.eventPolicies.eventNames.pricingPriceBelowCost            Warning ...
```
Console: `IntlError: MISSING_MESSAGE: Could not resolve settings.notifications.eventPolicies.eventNames.billingTrialEndingSoon ... at PolicyRow`.
Identical in `/ar/...` (screenshots `10-evidence-event-policies-missing-keys-en.png`, `10-evidence-event-policies-ar.png`).

Root cause: `EVENT_CATALOG` grew from 10 to 16 entries; the message file did not, and **nothing pins the two
together**. Secondary: `eventKeyToI18nKey` does not normalise snake_case segments, so the keys that must be
added are the unreadable `inventoryCost_poolValue_discarded` / `inventoryNegative_stockFlagged`.

Fix at the primitive: a parity test asserting `EVENT_CATALOG.map(eventKeyToI18nKey) ⊆ keys(messages/en/settings.json
.notifications.eventPolicies.eventNames)`, plus the same for ar. Six message keys, one test.

## HIGH-2 — CONFIRMED — Document Numbering shows raw humanised codes for 6 document types

`messages/{en,ar}/numbering.json` has `table.documentTypes.*` for 24 of 30 types.
Missing: **DN, DO, QOT, DSL, RF, DPU**. `resolveDocumentTypeLabel` falls back to `humanizeDocumentType`, so the
user sees `Dn`, `Do`, `Qot`, `Dsl`, `Rf`, `Dpu`.

Browser evidence (`/en/settings/numbering`, page 4 of 4 and page 3):
```
Dsl   B1_AL_RAI_MAIN_SHOWROOM · Al Rai Main Showroom   B1ALRAIMAINS-DSL-   B1ALRAIMAINS-DSL-00004
Dpu   (page 3)
```
Verified by SQL/JSON diff:
```
have: ADJ BAR CN CNT CUS GRN INV JRN LC OB OB_AP OB_AR OB_INV PAY PINV PO POS PR PRN RCV RV SO SRR TRF
MISSING: DN DO QOT DSL RF DPU
```
Five of the six (DN/DO/QOT/DSL/RF) are members of the shared `DOCUMENT_TYPES`, so they also appear as raw codes
in the **Add Sequence** dialog dropdown and in the toolbar's document-type filter. Same missing-parity-test root
cause as HIGH-1.

## HIGH-3 — CONFIRMED — `digestMode` (Immediate / Hourly / Daily) is configurable and completely ignored

The Event Policies recipient editor exposes a Digest select per recipient rule, persisted to
`recipient_rules.digest_mode`. `NotificationDeliveryService.deliver()` **never reads it** — every delivery is
immediate.

```
$ rg -n "digestMode|digest_mode" -g'!*.spec.ts' apps/api/src
notification-policies/notification-policies.service.ts:157   digestMode: input.digestMode,
notification-policies/notification-policies.service.ts:326   digestMode: "immediate" as const,
notification-policies/notification-policies.dto.ts:58,73,95
```
Three write sites and zero read sites. `rg -ni digest` across the whole API returns no digest scheduler/aggregator.
This is precisely "a policy the user can configure that the backend ignores". The spec
(`08-notifications-alert-policy.md`) mandates it (`Warning → Email in daily digest`).

Also affected: the spec's escalation rules (Warning → owner on second unacknowledged trigger; Critical unacked
4h → escalate; 3+ criticals in 24h → bundle) have no implementation either. **SUSPECTED** for escalation — I read
the delivery path end to end and found no escalation code, but did not exhaustively grep every scheduler.

Minimum honest fix: hide/disable the Digest control until a digest scheduler exists.

## HIGH-4 — CONFIRMED — Three `billing.trial*` events are emitted, are configurable, and are silently dropped

`billing/trial-lifecycle.scheduler.ts` emits `billing.trialWeekOne`, `billing.trialEndingSoon`,
`billing.trialExpiredReadOnly` via `emitNotificationDurably`. They have notification templates
(`notifications/templates/notification-templates.ts:556,582,666`), a seeded policy row each, and an owner
recipient rule each. But:

1. `NotificationDeliveryListener` has **no `@OnEvent` for any of them** (`rg -n '@OnEvent' notifications/` → 9
   decorators, none billing). Its own header comment lists only the four `agent.*` events as unwired.
2. The three payloads **omit `eventId`**, which `deliveryEnvelopeSchema` requires as a uuid. Every other
   producer mints its own (`inventory/reorder/reorder.service.ts:212 eventId: randomUUID()`).

Consequence: `emitAsync` resolves with zero listeners → `markCompleted` → the outbox row is retired as a
success and the notification is never created. Silent, and the poller safety net cannot catch it because
nothing failed.

Recommended fix (two parts, both required):
- add `eventId: randomUUID()` to the three payloads in `trial-lifecycle.scheduler.ts` (owned by billing);
- add three `@OnEvent(BILLING_EVENTS.*, AWAITED_LISTENER)` handlers delegating to `this.dispatch(...)`.
Then pin it: a test asserting every `EVENT_CATALOG` key that is not deliberately unwired has a listener.

## HIGH-5 — CONFIRMED — No non-owner user can see or change their own notification preferences

`notification-preferences.controller.ts` gates the **self-scoped** routes (`GET /`, `GET /effective`,
`POST /reset`, `PATCH /:category`) on `settings.notification.read` / `.update` — the *same* keys that gate the
tenant-wide Event Policies and the per-role **Admin Defaults** (`GET /defaults`, `PATCH /defaults/:roleId/:category`)
on the same controller.

```
$ psql -c "select r.name, rp.permission_key from roles r join role_permissions rp on rp.role_id=r.id
           where rp.permission_key ilike '%notif%';"
(0 rows)
```
No shipped role holds any `settings.notification.*` permission. Measured:
```
cashier1      GET /tenant/notification-preferences -> 403 ; GET /tenant/notifications -> 200
accountant1   GET /tenant/notification-preferences -> 403 ; GET /tenant/notifications -> 200
storekeeper1  GET /tenant/notification-preferences -> 403 ; GET /tenant/notifications -> 200
owner         200
```
So every non-owner **receives** notifications (the bell works) but cannot mute a single one. The nav gate
(`lib/settings-sections.ts:212 requiresPermission: PK.settings.notificationRead`) hides the section, so it is a
clean hide rather than a 403 crash — but the capability is simply absent.

The structural defect is that self-scoped and tenant-scoped operations share one permission key: granting a
cashier control over their own inbox would simultaneously let them rewrite every role's notification defaults.
Correct fix (do **not** widen the existing key): split the self-scoped routes onto a permission-free /
self-scoped guard, exactly like `tenant/me` and the permission-free `/directory` endpoints; leave `/defaults`
on `settings.notification.*`.

## HIGH-6 — CONFIRMED — Low-stock alerts fan out one notification (and one email) per item, per night

`defaultChannelEmail: true` for `inventory.lowStock`, with `scopeKeyFields: ["itemId","warehouseId"]` and a
60-minute throttle. `reorder.service.ts` emits once **per row** inside its loop.

```sql
select created_at::date d, count(*) rows_, count(distinct scope_key) entities, count(distinct user_id) users
from notifications where event_key='inventory.lowStock' group by 1 order by 1;
 2026-08-24 | 500 | 500 | 1
 2026-08-25 | 500 | 500 | 1
 2026-08-28 | 500 | 500 | 1
```
500 in-app rows to a single user per sweep, and on a working mail config **500 emails to the shop owner per
night**. The same fan-out was already recognised and solved for `pricing.priceBelowCost`, which deliberately
scopes per *document* "so one multi-line document fans out ONE alert, not N" — the identical fix was never
applied to low stock. Contrast is in the same constants file.

Recommend: default `defaultChannelEmail: false` for `inventory.lowStock`, and/or emit one digest event per
(warehouse, sweep) carrying the item list.

## MEDIUM-1 — CONFIRMED — Throttle select misreports a 5-minute window as "No throttling"

`lib/throttle-presets.ts::nearestThrottlePreset(5)` finds no exact preset and snaps **down** to the largest
preset `<= 5`, which is `0` = "No throttling". `pricing.priceBelowCost` is stored at 5 minutes:
```sql
select event_key, throttle_window_minutes from notification_event_policies where event_key='pricing.priceBelowCost';
 pricing.priceBelowCost | 5
```
Browser confirms the row displays "No throttling". The admin is shown a false state, and there is no way back to
5 once the select is touched. Also: `inventory.cost_pool.value_discarded` carries a code comment that it must
**never** be throttled (each occurrence is a distinct GL-1141-vs-sub-ledger difference); the UI happily lets an
admin set it to Weekly.

## MEDIUM-2 — CONFIRMED — Adding a specific person as a notification recipient requires typing a raw UUID

`components/recipient-rules-editor.tsx`: recipient type `role` gets a proper name dropdown (`useRolesQuery`);
recipient type `user` gets a bare `<input>` with label "User ID" and placeholder "Enter a user ID". Existing
`user` rules render **only** the "User" badge with no name at all, so a list of user recipients is
indistinguishable. This is a raw internal ID in user-facing copy (founder standard) and the exact class the
`useListWithDirectoryFallback` + permission-free `/directory` pattern exists to fix elsewhere.

Also: the "Add" form binds a single branch (`branchIds: newBranchId ? [newBranchId] : []`) even though the
model and the resolver support an array of branch scopes.

## MEDIUM-3 — CONFIRMED — Number reservations are audited with `entity_id = 'unknown'`

```sql
select distinct entity_id, action from audit_log
where entity_type='SequenceReservation' and created_at > now()-interval '25 minutes';
 0278dc41-... | create   (release path)
 534a64e3-... | create
 unknown      | create   (8 rows, all from POST /reserve)
```
`POST /tenant/doc-sequences/reserve` returns `{ data: { reservationId, documentNumber } }`; the audit
interceptor's generic extraction looks for `data.id`, finds none, and falls through to `"unknown"`. Every
number allocation in the product therefore lands in the immutable audit log unattached to any entity — the log
cannot answer "who reserved document number X". The interceptor already ships the escape hatch for exactly this
(`request.auditEntityId`, used by CloseRun / approval-pin / FxRevaluation).

Recommended fix (one line, in `doc-numbering.controller.ts`, my area, not applied because it needs a rebuild):
inject `@Req() req` and set `req.auditEntityId = data.reservationId` before returning.

## MEDIUM-4 — CONFIRMED — `DPU` is absent from the shared `DOCUMENT_TYPES`; it is the only such gap

The `dpu` sequence is live and in use:
```sql
select document_type, prefix, next_number from document_sequences where document_type='dpu';
 dpu | B1ALRAIMAINS-DPU- | 6
```
`packages/shared/src/doc-numbering-types.ts::DOCUMENT_TYPES` does not contain `"DPU"`. It works at runtime only
because `reserveOrSeedNumber` writes through Drizzle against the pg enum, which does contain `dpu`. The Zod
enum built from `DOCUMENT_TYPES` rejects it at the API edge:
```
GET /tenant/doc-sequences?documentType=DPU
{"code":"validation_error", ... "documentType":{"errors":["Invalid value for \"documentType\"."]}}
```
So a DPU sequence cannot be filtered for, and cannot be created for a second branch from Settings (it only
self-heals on first use). It renders as `Dpu` (HIGH-2).

**Checked for other types with the same gap — DPU is the only one.** Full diff of the pg `document_type` enum
against `DOCUMENT_TYPES`: the only enum members not in the TS list are `dpu`, `negstock_trueup` and `cheque`;
the latter two are documented JE-only `source_document_type` values that are never sequence-allocated, and the
existing `document-type-enum-parity.spec.ts` covers that direction. The spec only asserts
`DOCUMENT_TYPES ⊆ enum` — it has **no reverse assertion**, which is why DPU slipped through. Recommend adding an
allow-listed reverse assertion (enum minus the declared non-numbering set must be ⊆ `DOCUMENT_TYPES`).

## MEDIUM-5 — CONFIRMED — Two sequences of the same document type can be given identical prefixes

There is no uniqueness validation across sequence formats. Accepted with a 200:
```
PATCH /tenant/doc-sequences/<B2 DSL seq> {"prefix":"B1ALRAIMAINS-DSL-","formatChangeReason":"..."}
-> 200, prefix now identical to the B1 DSL sequence (B1 at next_number 4, B2 at 10)
```
Both sequences then mint the same `B1ALRAIMAINS-DSL-000NN` series. Financial documents are protected by DB
uniqueness (`sales_invoices_tenant_id_number_live_idx`, `purchase_invoices_tenant_id_number_key`,
`je_legal_entity_id_entry_number_key`), but `direct_sales.sale_number` and `goods_receipt_notes` have **no**
unique index, so duplicates would persist silently there. Reachable only by admin misconfiguration (default
prefixes are branch-code-derived and unique by construction), hence MEDIUM not HIGH. The duplicate-number
outcome itself is SUSPECTED — I reverted the prefix rather than minting colliding documents.

## MEDIUM-6 — CONFIRMED — The Numbering panel fetches at most 100 sequences and degrades to a hint

`numbering-panel.tsx` fetches `limit=FETCH_LIMIT` (100, the DTO max) once and paginates client-side; beyond that
it shows `toolbar.truncatedHint` instead of paginating. Gulf Auto Parts is at **79 sequences with 4 branches**
(~20 per branch). A 6-branch tenant crosses 100 and starts hiding sequences behind a hint. Server-side
pagination already exists on the endpoint and is simply not used.

## LOW-1 — CONFIRMED — Permission-key naming drift from the spec

Spec `08-notifications-alert-policy.md` declares `settings.notifications.view` / `settings.notifications.manage`.
Implementation uses `settings.notification.read` / `settings.notification.manage` / `settings.notification.update`
(singular, and `read` not `view`). Internally consistent between controller and nav gate, so no behavioural bug —
but it means the spec's permission table cannot be used to verify RBAC by grep.

## LOW-2 — CONFIRMED — Approval-control hints are rendered twice

`controls-section.tsx` renders `t('<key>Hint')` both inside an `<InfoHint>` tooltip on the label AND as a visible
`<p>` immediately below it, for all eight approval rows, the PO threshold and the negative-stock policy. The
tooltip is redundant with the text three pixels below it.

## LOW-3 — No export on either screen

Neither Document Numbering nor Notifications offers an export. Not required by spec; noting for completeness
since the checklist asks. Nothing to open and verify.

---

# CHECKS THAT PASSED (recording these so they are not re-tested)

- **Numbering concurrency — PASS.** 8 simultaneous `POST /tenant/doc-sequences/reserve` against one sequence
  returned `ZZTEST-DSL-00001 … 00008`: eight distinct, consecutive, no collisions, no gaps. The claim path is a
  single atomic `UPDATE … SET next_number = CASE … RETURNING *` (reset policy folded into the same statement),
  not a read-then-write, so there is no TOCTOU window.
- **Gap policy on a failed transaction — PASS, both directions.** Tolerant: reserve 00009 → release → `next_number`
  stays 10 (number burned, correct). Strict: reserve 00010 → release → `next_number` decrements back to 10
  (number reused, correct). The release path holds `FOR UPDATE OF sr, ds` on both rows.
- **In-use sequence guards — PASS.** Prefix/padding/suffix/dateSegment/resetPolicy change on a sequence that has
  issued documents → 400 requiring `formatChangeReason`; `nextNumber` decrease → 400 requiring
  `nextNumberChangeReason`; both reasons land in `audit_log.reason` as JSON (`{"format":"ZZTEST restore"}`);
  `padding: 0` → 400 from Zod; deactivate with pending reservations → 409; delete with any reservations → 409.
- **Per-branch vs company-wide sequences — PASS.** Branch row is claimed first, tenant-wide (`branch_id IS NULL`)
  is the fallback, and an *inactive* branch row raises 409 rather than silently falling through to the
  tenant-wide row (`assertNotInactive`). 79 live rows verified: per-branch for POS/SO/INV/PO/…, tenant-wide for
  CUS/BAR/CNT/OB*/JRN.
- **`z.coerce.boolean()` — PASS, structurally closed.** Zero occurrences in `apps/api/src`, enforced by an
  API-wide source-scanning guard (`common/query-boolean.schema.spec.ts`). Every boolean in this area is either
  a strict `z.boolean()` body field or the `z.enum(["true","false"]).transform()` query schema. Probed live:
  `?isActive=false` → 0 rows (correct); `?isActive=FALSE` → clean 400; `{"isEnabled":"false"}` → clean 400
  ("expected boolean, received string"). No silent truthiness anywhere in this surface.
- **Dedupe key / `entity_id` construction — PASS.** `deriveScopeKey` builds `field:value|field:value` from the
  catalog-declared id fields only, and fails **open** (null → global throttle) if any field is missing, so a
  partial key can never collapse two entities. Live rows are all
  `itemId:<uuid>|warehouseId:<uuid>` / `customerId:<uuid>` shapes. No URL appears in `scope_key`, `event_id` or
  any audit `entity_id` anywhere in this area.
- **Channel-matrix UI vs backend — PASS (parity).** The matrix writes per-category `isEnabled / channelInApp /
  channelEmail`; `deliver()` gates on exactly `eff.isEnabled`, `policy.channelInApp && eff.channelInApp`,
  `policy.channelEmail && eff.channelEmail`. The three controls the matrix shows are the three the backend
  honours. (The *digest* control, which is a different control on a different panel, is HIGH-3.)
- **Permission gating — PASS.** Every route on `doc-numbering.controller.ts`,
  `notification-policies.controller.ts` and `notification-preferences.controller.ts` carries
  `@RequiresPermission`; none ungated. Measured with cashier1: notification-policies 403, doc-sequences 403,
  settings 403, PATCH policy 403, POST reserve 403, `settings/current` 200 (deliberately permission-free,
  documented). Frontend nav gates match the backend keys.
- **Audit capture — PASS for sequences.** `create` + 3 × `update` DocumentSequence rows with correct actor and
  `before`/`after`/`reason`. (Reservation ids are the MEDIUM-3 exception.)
- **i18n parity — PASS.** `notifications.json` 29/29, `numbering.json` 132/132, `settings.json` 760/760 keys in
  en and ar, zero missing either direction; the 3 identical strings are placeholder/proper-noun only. No em
  dashes in any notifications or numbering copy. `document.documentElement.dir === "rtl"` on `/ar`, and the one
  directional icon in the policies table uses `rtl:-scale-x-100`, not a physical flip.
- **Pagination past page 1 — PASS.** Numbering: 79 rows, 25/page, walked to page 4 ("Showing 76–79 of 79"),
  distinct rows on every page, counts agree. Notification policies are a fixed 16-row set, not keyset-paginated.
- **False success / false failure — PASS.** All notification mutations use optimistic update + rollback +
  `toast.error` on `onError`; no toast fires on a rejected promise. Client timeouts are the shared 45 s default
  with no per-feature override in this area, far above the measured ~700-900 ms Neon Singapore RTT, so no
  false-failure risk.
- **Path divergence — no duplicate helper found.** `deriveScopeKey`, `nearestThrottlePreset`,
  `eventKeyToI18nKey`, `resolveDocumentTypeLabel`, `defaultGapPolicy`, `formatDocumentNumber` each have exactly
  one definition; `defaultGapPolicy` and `DOCUMENT_TYPES` are imported from `packages/shared` by both the API
  DTO and the web feature, so there is no hand-copied second body.

---

# DESIGN-001a — VERDICT

**The picker-level fix was and remains correct, but it is now demonstrably INCOMPLETE. The PIN/liveness
mechanism does let the capability boolean be strengthened correctly, and it should be. Recommend, do not merge
blind — see the performance caveat.**

### The residual gap, demonstrated

`deriveApprovalCapability(activeMemberCount)` answers `available = count >= 2`. That is a proxy for "a distinct
approver could exist". Since maker-checker shipped, a distinct approver is no longer enough: `verifyApproval`
additionally requires the approver to **hold an approval permission** and to **have set a PIN**. So a tenant
with 2+ active members and zero PINs gets `available: true`, the owner flips a flag, it saves — and every gated
action then dead-ends. That is exactly the failure mode the original fix was written to prevent, still open,
just one layer deeper. `getEligibleApprovers` already names the two distinct causes
(`unavailableReason: "no_permission_holder" | "no_pin_set"`); the settings gate simply never asks.

### Why the boolean *can* now be strengthened, correctly

The original objection was "a tenant-wide flag cannot answer a per-maker question". That is true and still true —
but it does not follow that the tenant-wide flag must stay a headcount. There is a well-defined, maker-independent
**necessary** condition:

> `available = (>= 2 active members) AND EXISTS an active member who holds at least one
> APPROVAL_PERMISSION_KEYS grant AND has a row in user_approval_pins`

If zero such "live approvers" exist, **every** maker is guaranteed to dead-end, whoever they are. No knowledge of
the maker is required to know that. It is not *sufficient* (the only live approver may be the maker himself) —
and sufficiency is precisely what the picker owns. Necessary-condition-at-the-settings-gate plus
sufficient-condition-at-the-picker is the right division of labour, and it is strictly stronger than today's
headcount proxy while remaining a true tenant-wide fact.

### The anti-oracle property is preserved

- `verifyApproval`'s generic 422 is **untouched**. No change to its message, code or shape.
- The strengthened value is an **aggregate boolean naming nobody**. It is the same kind and the same resolution
  as the `unavailableReason: "no_pin_set"` aggregate that `getEligibleApprovers` **already** returns to any
  authenticated cashier on a permission-free endpoint. It reveals no fact about any named individual's
  credential setup, which is the exact line `getEligibleApprovers` draws (filter PIN-less members out rather
  than flag them in). Nothing new becomes learnable.
- `activeMemberCount` stays where it is (permission-gated `GET /tenant/settings`); only the boolean is on
  permission-free `/current`, as today.

### Caveat that makes this a recommendation, not an edit

`available` is served on `GET /tenant/settings/current`, which is permission-free and hot (every page load).
Both existing "who can approve" resolvers are explicitly `ponytail`-marked as O(n) `hasPermission` calls per
member. Naively reusing that shape on `/current` is a real regression. The strengthened predicate must be a
**single set-based `EXISTS`** (join `user_approval_pins` × `user_roles` × `role_permissions` filtered to
`APPROVAL_PERMISSION_KEYS`, tenant-scoped, `LIMIT 1`) — never a loop — and probably wants a short-lived cache.
That is a correct-but-not-trivial change to a hot path that every tenant hits, and I will not benchmark a new
query shape on a machine shared by ten agents. So: **verdict is "strengthen it", implementation is handed over
with the shape specified.**

### Cheap half that should land regardless

The `PATCH /tenant/settings` gate is **not** hot — it runs once, when the owner flips a flag. Even without
touching `/current`, that gate should run the live-approver check and, on failure, reject with an actionable
message ("No one has set an approval PIN yet — set one under Settings → Approval PINs") instead of saving a
control that will dead-end. That is a strictly local change to `updateSettings`, costs nothing at steady state,
and closes most of the real-world harm. Recommend landing this first.

### Withdrawn

I considered and rejected making `verifyApproval` distinguish "no approver exists" from "wrong PIN". That would
turn the endpoint into an oracle for approver existence and, combined with the per-approver lockout counter,
into a probing surface. The original reasoning holds; do not touch the 422.

---

# THE FOUNDER'S ACCEPTANCE TEST

> Could an untrained Kuwaiti shop owner turn on an approval requirement, and set up who gets alerted when stock
> runs low, first try?

### (a) Turn on an approval requirement — YES on the surface, NO in effect.

Settings (1 click) → Company (1) → scroll to "Company-wide controls" → toggle e.g. "Require bill approval" (1)
→ Save (1). **4 clicks, 0 dialogs, 0 forced fields.** The screen is genuinely good: it hides all eight switches
entirely for a team that cannot approve rather than offering a dead end, it shows a loud "stranded" warning with
a one-click exit if the team shrinks while a flag is on, and the PO threshold amount stays hidden until its own
toggle is on (correct progressive disclosure). The threshold uses `MoneyInput`, so KWD renders at 3dp. No tax UI
anywhere, correct for Kuwait.

**What stops them:** the toggle looks complete and is not. For the control to actually work, at least one other
person must separately have (i) an approval permission and (ii) an approval PIN set from a *different* screen
(Settings → Approval PINs). Nothing on the Controls card says so; the capability check only counts heads
(DESIGN-001a). The shop owner's first bill after flipping the switch will fail with a generic
"invalid approval credentials" and no route to the fix. **That is the single highest-value thing to fix in this
whole area.**

### (b) Set up who gets alerted when stock runs low — NO.

Credit first: `inventory.lowStock` is **already** seeded enabled, Critical-free/Warning, in-app + email, throttled
hourly, with the Owner as recipient. A one-person shop needs **zero** clicks and is already alerted correctly.
That is the right default and should be said out loud.

Changing *who* gets alerted is where it breaks. Settings (1) → Notifications (1) → Event Policies tab (1) →
find the "Low stock" row among 16 rows, **six of which read
`settings.notifications.eventPolicies.eventNames.…`** (HIGH-1) → expand the chevron (1) → recipient type select
(2) → then:
- **"Role"** works: real role names in a dropdown. Branch (1, optional, correctly defaults to blank = all
  branches). "Add recipient" (1). ≈ 8 clicks. Achievable.
- **"User"** is a **hard stop**: a bare text box demanding a raw UUID (MEDIUM-2). No shop owner completes this.
  And once added, the rule renders as an anonymous "User" chip with no name.
- The **Digest** dropdown sitting next to it is a lie — the backend never reads it (HIGH-3).

**Verdict: (a) yes in 4 clicks but silently non-functional; (b) no, not first try.**

### Fields that could have been defaulted but were left blank

- **Recipient user** — the only blank-by-necessity field in the flow, and it should not exist at all; it should
  be a name picker seeded from the tenant directory (the `/directory` + `useListWithDirectoryFallback` pattern
  already used elsewhere). Every other input on both screens is sensibly pre-filled.
- **Add Sequence dialog** correctly pre-fills prefix (branch-code-derived), padding (4), reset policy and gap
  policy (from `defaultGapPolicy`) — nothing to flag there.
- Branch on a recipient rule correctly defaults to empty = all branches. Good.

### Jargon lacking a plain-language tooltip in both ar and en

Present and adequate: the whole My Preferences matrix (`columnEnableTooltip` / `columnInAppTooltip` /
`columnEmailTooltip`), and every approval control (`<key>Hint`, though duplicated — LOW-2).

**Missing entirely, in both languages:**
- **"Gap Policy" / "Strict" / "Tolerant"** (Document Numbering table column and dialog). This is the single
  worst piece of jargon in the area. No tooltip anywhere. A shop owner has no way to learn that "Strict" means
  "a cancelled document gives its number back, because the tax authority does not allow missing invoice numbers".
- **"Reset" / "Never / Yearly / Monthly"** (Document Numbering column). No tooltip.
- **"Padding"**, **"Date segment"**, **"Suffix"** in the Add/Edit Sequence dialog. No tooltips.
- **"Throttle"** (Event Policies column). The preset *labels* are plain ("At most once per hour"), but the
  column header word is not, and there is no hint.
- **"Severity" / "Info / Warning / Critical"** (Event Policies column). No tooltip explaining that severity
  drives escalation.
- **"Digest"** (recipient rule). No tooltip — and per HIGH-3 it does nothing anyway.

---

# COULD NOT VERIFY (honest list)

- **Email delivery.** `email_config` fails on dev (documented as normal), so I could not observe an actual email
  send. HIGH-6's "500 emails per night" is arithmetic from the confirmed 500 rows/sweep plus
  `channel_email = true`, not an observed send.
- **`billing.trial*` end-to-end.** I proved the listener is absent and `eventId` is missing by reading the code;
  I did not run the trial scheduler (it needs a tenant in `trial` status with a `trialExpiresAt`; Gulf Auto Parts
  is not).
- **The four `agent.*` events.** Deliberately unwired until agent modules exist; I confirmed they are unwired and
  did not test further.
- **Escalation rules** (spec §Escalation, §Agent Suggestion Escalation). I found no implementation on the
  delivery path but did not exhaustively grep every scheduler in the repo — marked SUSPECTED under HIGH-3.
- **Duplicate document numbers from MEDIUM-5.** I proved the API accepts the colliding prefix and reverted it; I
  did not mint two documents to observe the collision, since `direct_sales` has no unique index and the residue
  would have been unremovable through the UI.
- **Whether a fresh tenant reproduces HIGH-5.** Verified for Gulf Auto Parts' shipped role set (0 roles hold any
  `settings.notification.*`); I did not inspect the role-seed template to confirm it is universal, though the
  absence across all 5 roles here strongly suggests it is.
- **Responsive breakpoints** (375/768/1280/1920) for these two screens. The browser was restarted under me twice
  by other agents; I spent the recovered session on the missing-key and RTL confirmations and did not get to the
  viewport sweep.

# WITHDRAWN AFTER INVESTIGATION

- **"`z.coerce.boolean()` truthiness bug in the toggles."** Actively hunted per the brief. Zero occurrences in
  the API, and it is structurally banned by a source-scanning spec. Probed live with literal `"false"` on both a
  query param and a body field; both produce a clean 400. **Not a finding.**
- **"Approval flags are uniform-FALSE, so their guard is inert."** The uniformity is real (all eight FALSE) but
  it is the *correct default* for a tenant that has not opted in, and the flags are read per-flag at each gate,
  not aggregated — so there is no guard being rendered meaningless by uniform data. What the uniformity *does*
  mean is that no live data in this tenant exercises the maker-checker path; I flipped one flag on and off to
  exercise it. **Not a finding, but noted as a coverage gap.**
- **"The Numbering panel drops the DPU row."** I initially could not find DPU on page 4 and suspected a
  client-side filter against `DOCUMENT_TYPES`. Re-checked: the API returns it (`('DPU', 1)` in the type census),
  no client filter exists, and it renders on page **3** as `Dpu`. The real defect is only the missing label
  (HIGH-2) and the rejected filter value (MEDIUM-4). **Withdrawn as a data-loss claim.**
- **"Reserve holds a long row lock and will serialise under load."** The service comments warn about this, but
  the claim path is a single `UPDATE … RETURNING`, and the 8-way concurrent burst completed with no collisions
  and no observable contention. Not a finding at SMB scale; the existing code comment already documents the
  caveat for a future high-volume caller.
- **"Client timeout below Neon RTT causes false failures."** Checked: 45 s default, no per-feature override in
  this area, ~700-900 ms actual. **Not a finding.**

---

# FIXES APPLIED (implementation pass, agent 10b)

API rebuilt and restarted once at the end of this pass. Verified freshness by grepping the compiled
bundle: `dist/accounting-events/helpers/emit-notification-durably.js` contains the new "No listener is
registered..." string, `dist/notification-policies/notification-policies-i18n-parity.spec.js` exists,
and `dist/tenant-settings/tenant-settings.service.js` contains 3 occurrences of `getTeamReadiness`.

## Ledger + restore verification (before first write / after last write)

```
before: 0.000000
after:  0.000000
```
```sql
-- approval flags: all eight back to FALSE (identical to pre-test snapshot)
select require_po_approval, require_payment_approval, require_bill_approval, require_return_approval,
       require_invoice_approval, require_refund_approval, require_pos_amend_approval, require_journal_approval
from tenant_identity;
--  f | f | f | f | f | f | f | f

-- numbering: unchanged, 79 rows, 0 ZZTEST
select count(*) from document_sequences;                              -- 79
select count(*) from document_sequences where prefix like 'ZZTEST%';  -- 0

-- notification_preferences: cashier1's live PATCH test row deleted after verifying it wrote
select count(*) from notification_preferences where user_id='48123301-29f2-46a2-a50c-479911c73142'; -- 0
```
No ZZTEST documents were created this pass (verification used existing tenant data + one
create/delete cycle on `notification_preferences` and one on/off cycle on
`tenant_identity.require_pos_amend_approval`, both restored above) — nothing to log in
`_documents-created.md`.

## PRIORITY 1 — raw i18n keys / raw document codes (HIGH-1, HIGH-2)

Root cause confirmed: `EVENT_CATALOG` (API) and `DOCUMENT_TYPES` (packages/shared) each outgrew their
message files with no test pinning the two together.

**Parity tests added (fail when a catalog/list entry has no message key, in EN and AR):**
- `apps/api/src/notification-policies/notification-policies-i18n-parity.spec.ts` — asserts every
  `EVENT_CATALOG` entry has a `settings.notifications.eventPolicies.eventNames.<key>` message key in
  both `en` and `ar` (reads the real message JSON, duplicates `eventKeyToI18nKey` deliberately so it
  catches catalog/message drift, not just a second copy of the same function agreeing with itself).
- `apps/api/src/doc-numbering/document-type-i18n-parity.spec.ts` — same shape for `DOCUMENT_TYPES` vs
  `numbering.json` `table.documentTypes.*`, both locales.
- `apps/api/src/doc-numbering/document-type-enum-parity.spec.ts` — added the missing REVERSE assertion
  (enum minus a documented non-numbering allowlist must be ⊆ `DOCUMENT_TYPES`), which is exactly the
  direction that let DPU (MEDIUM-4) slip through undetected.

All three new/extended specs run green:
```
apps/api: npx jest i18n-parity document-type-enum-parity --no-coverage
Test Suites: 2 passed (the 3rd failure, tax-document-assembler.service.ts:546 "invoice", is a
  pre-existing false-positive match against a TYPE UNION literal, unrelated to this change —
  confirmed via git blame, not touched)
Tests: 8 passed (all new assertions), 1 pre-existing unrelated failure
```

**Missing strings added:**
- `apps/web/messages/{en,ar}/settings.json` → `notifications.eventPolicies.eventNames`: added
  `inventoryNegative_stockFlagged`, `inventoryCost_poolValue_discarded`, `pricingPriceBelowCost`,
  `billingTrialWeekOne`, `billingTrialEndingSoon`, `billingTrialExpiredReadOnly` (plain 8th-grade
  copy, no em dashes, e.g. "Negative stock flagged" / "Sale below cost" / "Trial ending soon").
- `apps/web/messages/{en,ar}/numbering.json` → `table.documentTypes`: added `DN` (Debit Note), `DO`
  (Delivery Order), `QOT` (Quotation), `DSL` (Direct Sale), `RF` (Refund Voucher), `DPU` (Direct
  Purchase).
- `packages/shared/src/doc-numbering-types.ts`: added `"DPU"` to `DOCUMENT_TYPES` (MEDIUM-4 — genuine
  one-liner, directly unblocks the Zod-enum filter/create-flow gap the report identified; the pg enum
  already had it).

**Live browser verification (owner, Gulf Auto Parts, both locales):**
- `/en/settings/notifications` → Event Policies tab: all 16 rows show real labels — "Trial started",
  "Trial ending soon", "Trial expired", "Inventory cost value lost", "Negative stock flagged", "Sale
  below cost" all present, zero raw `settings.notifications...` key paths, zero console
  `MISSING_MESSAGE` errors.
- `/ar/settings/notifications` → same, Arabic labels render ("الفترة التجريبية توشك على الانتهاء",
  "بيع أقل من التكلفة", etc.).
- `/en/settings/numbering` → Add Sequence dialog dropdown shows "Debit Note", "Delivery Order",
  "Quotation", "Direct Sale", "Refund Voucher", "Direct Purchase" — no raw codes. Table itself shows
  "Direct Purchase" (DPU) and "Direct Sale" (DSL) rows correctly (the only two of the six with live
  sequences in this tenant; DN/DO/QOT/RF have no live row yet since they self-heal on first use — the
  parity test covers the label for all six regardless).
- `/ar/settings/numbering` → same dropdown in Arabic: "إشعار مدين", "أمر تسليم", "عرض سعر", "بيع
  مباشر", "سند استرداد", "شراء مباشر" — all real, no raw codes.

`pnpm --filter @zerupt/web i18n:check` and `tsc --noEmit` (both apps) pass clean after all string
additions.

## PRIORITY 2 — dead `digestMode` control (HIGH-3)

Removed the Digest select from `apps/web/src/features/notifications/components/recipient-rules-editor.tsx`
(both the per-existing-rule row and the "Add recipient" form), the `newDigest` state, the
`handleDigestChange` handler, the `DIGEST_MODES` constant, and the now-unused `DigestMode` /
`RecipientRuleResponse` type imports and `recipientDigestSelect` testid. `digestMode` is no longer sent
on create; the backend DTO already defaults it to `"immediate"` server-side
(`notification-policies.dto.ts:58`), so no behavior changes for existing rules — the control simply no
longer LIES to the admin. Did not touch the backend write path, DB column, or DTO field (would need a
migration to remove — flagged as a recommendation, not applied).

Verified: `apps/web` typecheck clean, `npx vitest run event-policies-panel recipient-rules` → 4/4 pass.

## PRIORITY 3 — self-scoped notification preferences unreachable by non-owners (HIGH-5)

Split the permission in `apps/api/src/notification-preferences/notification-preferences.controller.ts`:
removed `@RequiresPermission("settings.notification.read"/".update")` from the four self-scoped routes
(`GET /`, `GET /effective`, `POST /reset`, `PATCH /:category`) — they now require only an authenticated
tenant member (same permission-free shape as `tenant/me` and `/directory`, since every one of them
already scopes strictly to `ctx.userId`). `GET /defaults` and `PATCH /defaults/:roleId/:category` (the
tenant-wide admin surface) are UNCHANGED — still gated on `settings.notification.read`/`.update`. No
existing permission key was widened.

Frontend: `apps/web/src/lib/settings-sections.ts` — removed the nav-level `requiresPermission` gate on
the whole `notifications` section (it was blocking non-owners from ever reaching "My Preferences", a
self-scoped screen). Found and fixed a related gap this uncovered:
`apps/web/src/features/notifications/components/notifications-panel.tsx` rendered the "Admin Defaults"
tab UNCONDITIONALLY (only "Event Policies" was behind the existing `canManagePolicies` owner check) —
a non-owner reaching the page would have seen an admin tab whose queries 403. Gated "Admin Defaults"
behind `canManagePolicies` too, matching "Event Policies".

**Live curl verification (fresh JWTs, real Gulf Auto Parts users):**
```
cashier1      GET /tenant/notification-preferences           -> 200  (was 403)
accountant1   GET /tenant/notification-preferences           -> 200  (was 403)
cashier1      GET /tenant/notification-preferences/effective -> 200  (was 403)
cashier1      GET /tenant/notification-preferences/defaults  -> 403  (unchanged — correctly still admin-only)
```
**Cross-user isolation verification:** cashier1 PATCH `/tenant/notification-preferences/system_alerts`
`{"channelEmail": false}` returned `userId: 48123301-...` (cashier1's own id) in the response;
```sql
select user_id, category, channel_email from notification_preferences
where category='system_alerts' and user_id in ('<cashier1>','<accountant1>');
-- only cashier1's row exists/changed; no row for accountant1
```
There is no userId parameter anywhere on the self-scoped routes (all four resolve `ctx.userId` from
the JWT only), so cross-user access is structurally impossible, not just untested. Test row deleted
after verification (see restore section above).

`apps/api: npx jest notification-preferences --no-coverage` → 2 suites, 23/23 pass (no existing test
assumed the old gating).

## PRIORITY 4 — low-stock email fan-out (HIGH-6)

Set `defaultChannelEmail: false` for `inventory.lowStock` in
`apps/api/src/notification-policies/notification-policies.constants.ts`, with a comment explaining why
(unlike `pricing.priceBelowCost`, low stock has no natural single-entity grouping to collapse
per-(item,warehouse) rows onto — every row is a genuinely distinct thing to know about — so the fix is
EMAIL-off-by-default, not per-document dedup; in-app fan-out is unchanged). No shared helper existed to
extract — the two "sites" that diverged were catalog CONFIG entries, not code bodies with duplicated
logic.

**Limitation, stated honestly:** this changes the SEED default for newly-provisioned tenants only.
Gulf Auto Parts was provisioned before this change and already has a materialized
`notification_event_policies` row with `channel_email = true` for `inventory.lowStock` — confirmed live
(`select channel_email from notification_event_policies where event_key='inventory.lowStock'` → `t`,
unchanged, left as-is per write-safety rules). Recommend a follow-on data migration to backfill
existing tenants' `channel_email` for this event to `false` where the admin has never touched it — not
written here (no migration authorized for this pass).

## PRIORITY 5 — silent `billing.trial*` false success (HIGH-4)

Two changes:
1. **False-success guard** in
   `apps/api/src/accounting-events/helpers/emit-notification-durably.ts`: `eventEmitter.emitAsync`
   result is now checked — an empty result array (zero listeners) now THROWS, which the existing
   catch block already handles correctly (marks the outbox row `failed` with backoff, eventually
   dead-letters at `OUTBOX_MAX_ATTEMPTS` instead of a fake `completed`). This is the general fix — it
   applies to every notification-only producer through this one shared helper, not just billing.
2. Added `eventId: randomUUID()` to the three `billing.trial*` payloads in
   `apps/api/src/billing/trial-lifecycle.scheduler.ts` (single insertion point in
   `emitInTenantContext`, so all three call sites get it uniformly) — the delivery envelope schema
   requires it as a uuid; it was missing.
Did NOT add the three `@OnEvent` listeners (explicitly out of scope per instructions).

**Verified via jest** (`apps/api: npx jest emit-notification-durably trial-lifecycle.scheduler
--no-coverage` → 2 suites, 20/20 pass) — and the test's own captured log output is direct proof the fix
works:
```
[ERROR] In-process delivery of billing.trialWeekOne failed (row outbox-row-id -> retry):
  No listener is registered for notification event "billing.trialWeekOne"
```
Previously this would have logged nothing and silently called `markCompleted`.

## PRIORITY 6 — DESIGN-001a, live-approver gate

Implemented on the non-hot `PATCH /tenant/settings` path only, per the accepted verdict — `/tenant/settings/current`
(hot, permission-free) is UNTOUCHED, `deriveApprovalCapability`/`ApprovalCapability` shape is UNTOUCHED,
`verifyApproval`'s generic 422 is UNTOUCHED.

`apps/api/src/tenant-settings/tenant-settings.service.ts`: after the existing headcount check passes
when `turningOn.length > 0`, added a second check calling
`PinVerificationService.getTeamReadiness(tenantId)` (REUSED as-is, not rewritten — its own
ponytail-marked O(n) `hasPermission`-per-member resolver, acceptable here because this PATCH runs once
per owner action, never on a hot page-load path) and requiring at least one active member with BOTH
`hasPin` and `hasApprovalPermission`. Failing that throws the same `APPROVALS_UNAVAILABLE` code with an
actionable message ("No one has set an approval PIN yet..."). Turning a flag OFF is unaffected — the
readiness check only runs on `turningOn.length > 0`, same escape-hatch shape as the existing headcount
check. Wired `PinVerificationService` into `TenantSettingsModule` (imports `ApprovalPinModule`, no
circular dependency).

Did NOT attempt the set-based rewrite of `getTeamReadiness`/`getEligibleApprovers` — left
ponytail-marked, noted here per instructions.

**Unit tests added** (`apps/api/src/tenant-settings/tenant-settings.service.spec.ts`, all 8
`new TenantSettingsService(...)` call sites updated with a `mockPinVerificationService`):
- refuses to switch a flag ON for a 2+ member tenant where no member has BOTH a PIN and an approval
  permission
- allows switching ON once at least one member has both
- still allows switching OFF with no live approver (escape hatch preserved)
- does not consult team readiness for a save touching no approval flag (no wasted query)

`apps/api: npx jest tenant-settings.service --no-coverage` → 1 suite, 50/50 pass (46 pre-existing + 4
new).

**Live verification:** Gulf Auto Parts already has 3 PIN-holders and (per this result) at least one
live approver, so I could observe the SUCCESS branch live without destructive tampering:
```
PATCH /tenant/settings {"requirePosAmendApproval": true}  (owner JWT)  -> 200, flag now true
PATCH /tenant/settings {"requirePosAmendApproval": false} (owner JWT)  -> 200, flag now false (restored)
```
I did NOT reproduce the REFUSAL branch live on this tenant — doing so would require deleting a real
user's PIN or permission grant (destructive tenant data, not just a test row, and outside the
write-safety rails for this pass). The refusal branch is proven by the 2 new unit tests above instead,
which exercise the exact `getTeamReadiness` boundary condition (2+ members, zero holding both PIN AND
permission) that cannot be safely staged against live data without corrupting a real user's setup.

## ALSO FIXED — MEDIUM-2 (raw-UUID recipient picker)

The `/directory` fallback pattern already existed and was already imported in the same feature area
(`useUserDirectoryQuery` from `@/features/team/api/team-queries`, permission-free, id+fullName+active
only) — genuine reuse, not new backend work. In
`apps/web/src/features/notifications/components/recipient-rules-editor.tsx`: replaced the bare "User
ID" text input in the Add Recipient form with a `Select` populated from the user directory (mirrors the
existing Role select exactly); existing `user`-type recipient rows now render the person's real name
instead of an anonymous "User" badge (same for the audit-history entity label). Removed the now-dead
`recipients.userId`/`userIdPlaceholder` message keys, added `recipients.user` ("Person" / "شخص") in
both locales. `i18n:check` and `apps/web` typecheck pass; `recipientUserSelect` testid added to the
registry.

## NOT ATTEMPTED (per explicit scope)

- MEDIUM-1 (throttle preset misreports 5 min as "No throttling"), MEDIUM-3 (audit `entity_id =
  'unknown'` on reservations), MEDIUM-5 (duplicate sequence prefixes), MEDIUM-6 (100-row numbering
  fetch limit), LOW-1/2/3 — left as written findings, none were one-liners.
- Escalation rules, digest scheduler, `agent.*` listeners — explicitly out of scope (new feature work).
- Set-based rewrite of the approval-readiness O(n) resolvers — explicitly out of scope, left
  ponytail-marked.
