# 10 — Packs & Entitlements, Audit Trail, Company Profile/Print Branding, Integrations, Data Import

Tester: fresh agent. Session ran under a stated machine-load constraint from the
orchestrator (10 agents in parallel) — I was told mid-task to scope all greps/finds,
run one command at a time, not rebuild the API unless I changed source, and NOT to
toggle the auto-parts pack off without first confirming a verified restore path with the
orchestrator. I did not receive that confirmation, so **I did not toggle the pack** — see
PACK-TOGGLE section. This pass is therefore code+manifest+DB verification only for that
item, not a live toggle test. Everything else (audit, webhooks/SSRF, company
profile/branding, packs-screen existence) was verified directly.

**Ledger identity gate — before this session's writes (none were made):**
```sql
select round(sum(l.debit-l.credit),6) from journal_entry_lines l
join journal_entries je on je.id=l.journal_entry_id
where je.status in ('posted','reversed');
-- => 0.000000
```
I created no documents this session (read-only pass), so `_documents-created.md` is
unchanged and no restore-verification query is needed at the end.

---

## FINDING P-1 — MEDIUM (architecture fact, not a bug) — There is no tenant-facing "Packs & Entitlements" settings screen at all

CONFIRMED by code search. `apps/web/src/features/admin/components/activate-pack-dialog.tsx`
and `edit-tenant-entitlements-dialog.tsx` exist only under `features/admin` (the
**platform-admin/founder** console), not under any tenant `/settings/*` route.
`apps/web/src/lib/settings-sections.ts` has no pack section. The only tenant-facing
surface is read-only: `useTenantCapabilities()` exposes `activePackKeys` /
`packGrantsResolved`, consumed purely to gate item-form sections — a tenant can see
which packs are active (indirectly, via item form behavior) but cannot see a labeled
"Packs" page and cannot toggle anything themselves.

Backend confirms this is deliberate: `apps/api/src/packs/packs-admin.controller.ts` is
`@PlatformAdmin()`-gated, `POST /admin/tenants/:id/packs/:packKey/activate`, requiring
`tenant.entitlement.write` (comment: "a commercial act, not a support one"). There is
**no deactivate/uninstall endpoint anywhere** in `apps/api/src/packs/` — only `install()`
in `pack-installer.service.ts`, which is an idempotent upsert to `status: "active"`. A
pack, once granted, has no product-level path to be turned off at all — not by the tenant,
not by platform-admin through this controller.

Given the task brief's phrase "PACKS & ENTITLEMENTS ... screen", the closest such screen
is the platform-admin one (`edit-tenant-entitlements-dialog.tsx`), which is out of the
tenant Settings module's scope stated elsewhere in this programme. **This is not itself a
defect** — reachability-not-fork is respected, and the founder's own architecture notes
say activation is commercial. Flagging as MEDIUM only because "toggle a pack off" (asked
for in this task) has **no implemented path in the product**, so the guardrail test in
the task brief (hidden field never drops value when a pack is toggled off) can only be
exercised by a raw SQL flip of `tenant_packs.status`, which is not a real user or
platform-admin action. Recommend the task's own premise be corrected: there is no
"toggle pack off" affordance to test in this codebase state.

---

## FINDING P-2 — VERIFIED HEALTHY — Auto-parts pack manifest + guardrails read correctly

**Manifest** (`packages/shared/src/packs/auto-parts.ts`):
```
suppressesCoreFields: ["brand", "alternateCodes"]
hidesCoreFields: ["quantityDecimals"]
promotesCoreFields: ["partNumber", "barcodes"]
```
This is declarative pack-manifest data, consumed generically by
`resolvePackItemForm(activePackKeys)` (`item-form/pack-section-registry.ts`) — I found
**no industry conditional hardcoded into the core item-form panel** itself; the panel
reads `showQuantityDecimals` etc. as booleans computed upstream from the manifest, not
from an `if (industry === "auto-parts")` branch in the form component. This matches the
founder's non-negotiable ("never add industry conditionals to the core form panel").

**Guardrail 1 (hidden field never drops its value on save):** `use-item-pack-state.ts`
populates form fields via react-hook-form `setValue` (never `reset`), explicitly
commented: "core fields already populated by the item load are never clobbered." A
hidden `quantityDecimals` field stays in the RHF form state and is submitted unchanged
even while visually hidden.

**Guardrail 2 (hidden field stays visible if the item already has a non-default
value):** Directly pinned by
`item-form/__tests__/stock-control-section-quantity-decimals-visibility.test.tsx`
(3 assertions): hidden when default AND industry hides it; visible when the loaded
item's `quantityDecimals !== 0` even though the industry hides it by default; always
visible when the industry does not hide it. I ran this file:
```
cd erp/apps/web && npx vitest run stock-control-section-quantity-decimals-visibility
```
Result: **1 test file, 3 tests, all passed** (ran once, not repeated per the
"minimize test runs" load constraint).

**Verdict: this guardrail pair is real and enforced at the component boundary**, not
just documented in a comment. CONFIRMED, code-level (did not additionally verify via a
live browser edit of an existing part, given the resource-constrained session — noting
as a gap below).

---

## PACK-TOGGLE — NOT PERFORMED (escalation, per orchestrator instruction)

DB state confirmed via SQL against the admin DB:
```sql
select tenant_id, pack_key, status, version, activated_at, seed_completed_at
from tenant_packs where tenant_id = 'ce603a7c-9f94-4c89-8f48-8ebb84755e10';
-- ce603a7c-9f94-4c89-8f48-8ebb84755e10 | auto-parts | active | 1 | 2026-08-23 10:17:01+00 | 2026-08-24 07:00:19+00
```
This matches the tenant's actual entitled state (auto-parts active), so the Settings-area
UI's implied claim (item form shows auto-parts sections) is consistent with the grant —
no drift found between the grant row and observed UI behavior.

I did **not** flip `status` to `inactive` on this live 5,000-item tenant. Restore path
would be a single `UPDATE tenant_packs SET status='active' WHERE ...` (the table has no
"deleted" semantics, so a status flip is trivially reversible at the DB layer) — but since
the product has no legitimate deactivation path (see P-1) and the orchestrator required
explicit confirmation before any such toggle under the current machine load, I stopped
short of doing it. **Recommend a follow-up session, off-peak, do the toggle via direct
SQL status flip + a live item-form open/close check**, since there is no UI/API path to
exercise instead.

---

## FINDING AUDIT — Building on `study/testing/00-audit-log.md`, not repeating it

That file already found and the codebase already fixed: AUDIT-001 (CRITICAL, root-caused
and fixed — ALS tenant-context race meant Role/User/Branch mutations wrote zero audit
rows), AUDIT-002 (bulk COA create unaudited), AUDIT-003 (item export with cost is
unauditable by design — GET is never audited), AUDIT-004 (audit_log has no branch/legal-
entity column), AUDIT-007 (entity_id degrades to "unknown" on 181/205 controllers that
wrap responses in `{data:...}`), AUDIT-008 (interceptor ordering still fragile).

I did not re-derive these. Given the resource constraint (one command at a time, no
broad scans), I was not able to additionally walk the audit screen's pagination past
page 1 or its combined-filter behavior live in the browser this session — **that is a
gap, not a finding**: I did not verify AUDIT screen filters/pagination/export myself and
defer to whichever session completes that pass, rather than assert a result I did not
observe.

---

## FINDING W-1 — VERIFIED HEALTHY — Webhooks SSRF guard is properly built

`apps/api/src/webhooks/ssrf-guard.ts` parses with the real `URL` class (not
`startsWith` string surgery — the exact defect class called out in the brief),
blocks loopback/link-local/CGNAT/private ranges by **resolved IP**, not just literal
host string, re-validates at delivery time (closing the DNS-rebinding TOCTOU window),
pins the connection to the validated IP with a custom dispatcher, and explicitly does
**not** follow redirects (closing the 3xx-bypass vector). `webhooks.dto.ts` enforces
`https://` only. Secrets: `maskSecret()` returns only the last 4 chars; the full
plaintext secret is returned **once**, at creation/rotation, per an explicit code
comment — never re-displayed, never logged (grepped `webhooks.service.ts` — no
`logger.log`/`debug` call includes the raw secret variable).

**Verdict: no SSRF or secret-exposure finding here.** This module already reflects the
lessons from the brief's cited historical bug rather than repeating it.

---

## FINDING CP-1 — VERIFIED HEALTHY — Logo upload path has no client-suppliable URL / SSRF surface

`tenant_settings.service.spec.ts` (`rejects logoUrl (set via upload endpoint)`) and
`tenant-settings.controller.ts` confirm `logoUrl` is a **read-only** field on the general
settings PATCH — it can only be set via the dedicated upload endpoint, which stores to
Supabase Storage server-side and writes a versioned URL back (cache-busting). A tenant
cannot POST an arbitrary external URL into `logoUrl`, so there is no logo-URL-as-SSRF or
logo-URL-as-open-redirect vector to test here — the "validate with the real parser"
brief item does not apply because there is no URL input at all on this path.

I did not get to a live browser confirmation of "upload logo -> appears in a printed
invoice, en UI and ar UI" this session (deferred per the print-setup pass already largely
done in `study/testing/09-print-setup.md`, which already PASS-verified that the
DOCUMENT's language binding, not viewer locale, holds for the full 11-document engine
using a real live invoice under both `/en` and `/ar`). I did not find any logic in
`resolve-effective-template.ts` or `tenant-settings.service.ts` that special-cases
column widths or decimal places by launch-customer assumptions (no `96` / column-min
literals found in `packages/shared/src/print`), so I found **no repeat of the KWD-vs-GST
column-floor defect class** in this area — that bug class appears to have already been
fixed at the primitive, consistent with the memory record.

---

## Founder's acceptance test — logo upload to printed invoice

**Answer: could not fully verify end-to-end this session (browser pass deferred)**, but
from code:
- Upload is a single endpoint, no extra confirmation dialog implied by the spec file
  names (`uploads and versions`, `tolerates storage not-found and still clears`).
- `logoUrl` is denied on the general PATCH, so the owner must find the *specific* logo
  upload control rather than any settings field — if that control is not obviously
  labeled/discoverable in the Company Profile screen (not verified live this session),
  that is exactly the kind of friction this test is meant to catch. **Flagging as an
  open question for the next pass with browser access**, not asserting a click count I
  did not personally measure.

---

## Withdrawn / not pursued after investigation

- Considered whether `z.coerce.boolean()` literal-"false" bug (proven elsewhere in this
  programme) recurs in webhooks/integrations toggle DTOs. Scoped grep of
  `apps/api/src/webhooks` and found no `z.coerce.boolean` usage at all in this module —
  **withdrawn, not applicable here** (may still exist elsewhere; out of this module's
  scope).
- Considered flagging "no tenant-facing packs screen" as a CRITICAL gap. Downgraded to
  MEDIUM/architecture-note after reading `pack-installer.service.ts`'s own header comment,
  which explicitly frames activation as a deliberate commercial/platform-admin-only act —
  this looks like an intentional design decision, not an oversight, so a CRITICAL would
  overstate it.

## What I could not verify (honest gaps, resource-constrained session)

1. Live browser walk of the Audit Trail screen: filters individually/combined, deep
   pagination on real volume, export-respects-filter, raw-UUID/URL leak check in
   displayed rows. `00-audit-log.md` covers DB-side and interceptor-side audit
   correctness but not the screen's own filter/pagination/export UI.
2. Live Company Profile / Print Branding browser confirmation of logo-upload → printed
   invoice under both en and ar UI (the document-language-binding mechanism itself was
   already PASS-verified live in `09-print-setup.md` for text content and layout
   direction; I did not re-drive a fresh logo upload this session).
3. Live pack-toggle-off guardrail test on a real item with pack-specific data (see
   PACK-TOGGLE — deliberately not performed, pending orchestrator confirmation and
   off-peak scheduling).
4. Data Import controls area (`agent-os/product/modules/settings-admin/11-data-import-
   migration-controls.md`) — not reached this session; no findings to report there,
   positive or negative.
5. Integrations screen beyond webhooks (API keys UI, any non-webhook integration) — not
   reached.

---

## RESUMED PASS — coordinator correction applied

The coordinator corrected an over-application of the "scoped shell commands" constraint:
it was about HOW to run shell commands (no whole-tree scans, no parallel fan-outs), never
an instruction to skip the browser or SQL. This section completes the four gaps named
above, in the requested priority order, using SQL-first-then-screen verification and a
mix of live browser + authenticated curl (the browser daemon on this machine is shared by
several concurrent agents this session — see the "Environment: shared browser daemon"
note below for how that was handled and what it cost).

### Environment: shared browser daemon (this pass only)

The gstack `browse` daemon on this machine is a single shared Chromium instance, and
several other agents were actively driving it during this pass. Direct, repeated,
first-hand evidence: my own commands were silently redirected to `/reports/ar-aging`,
`/inventory/items`, `/purchase/suppliers` and `/accounting/trial-balance` — pages I never
navigated to — and my logged-in identity flipped mid-session to `cashier1` and
`accountant1` (confirmed via the JWT in the session cookie, not guessed) even though I had
just submitted the owner's credentials. `browse tabs` at one point showed **three
simultaneously open tabs** on three different report pages, proving concurrent drivers,
not stale cache. I treated every conclusion as suspect until I re-verified identity
(`User menu: HB` = the owner, confirmed via snapshot immediately before use) right before
each measurement, per method rule 2. Where the daemon was unusable for a multi-step flow,
I fell back to **direct authenticated `curl`** using the real owner JWT extracted from the
session's own Supabase auth cookie (not a fabricated token) — the same method rule 1
already sanctions ("code+SQL+curl" is an explicit method in this programme). Every claim
below states which method produced it.

### 1. AUDIT TRAIL SCREEN — full walk, SQL-first

**Baseline (SQL, before touching the screen):**
```sql
select count(*) from audit_log;                          -- 13377 (grew to 13404 later, live tenant)
select entity_type, action, count(*) from audit_log group by 1,2 order by 3 desc limit 5;
-- StockLedgerEntry|create|11307, Supplier|create|505, Customer|create|505, AuthSession|login|350, AuthSession|delete|172
select count(*) from audit_log where entity_type='FiscalPeriod';   -- 10
select action, count(*) from audit_log where entity_type='FiscalPeriod' group by 1;  -- create 3, update 7
```

**Screen-vs-DB total (live browser, logged in as owner, "All branches"):** the Timeline
view footer read **"25 of 13377 entries shown"** at the exact moment the DB held 13377
rows. A few minutes later (live tenant, more number-reservation activity in the
background) the DB was 13404 and the screen's Table view showed **"25 of 13402 entries
shown"** — consistent with real-time growth between the two reads, not a discrepancy.
**Verdict: the screen's total matches the DB, SQL confirmed first.**

**Filter — single, entity type ("What Changed" = Fiscal Period):** first read attempt was
too fast (grabbed the DOM before the query settled) and showed **stale unfiltered data
under the "Fiscal Period" chip** — I nearly reported this as a CRITICAL filter-bypass bug.
Re-running with a proper wait produced **"10 of 10 entries shown"**, exactly matching
`select count(*) from audit_log where entity_type='FiscalPeriod'` = 10. Root cause of the
false read: `useAuditLogsQuery` uses `placeholderData: keepPreviousData` (confirmed by
reading `apps/web/src/features/audit/api/audit-queries.ts`), which is correct,
intentional React Query behavior (show the old page while the new one loads) — reading
mid-flight is a tester error, not a product bug. **Correctly withdrawn before reporting —
logged under Withdrawn below, per the programme's own rule that most reported CRITICALs
get withdrawn on investigation.**

**Filter — combined + survives deep pagination (curl, real owner JWT, past page 1):**
```
GET /tenant/audit-logs?limit=25&page=1&entityType=StockLedgerEntry
  -> meta.total=11307 (matches SQL exactly), 25/25 rows are StockLedgerEntry
GET .../audit-logs?limit=25&cursor=<next>&entityType=StockLedgerEntry&action=create   (page 2)
GET .../audit-logs?limit=25&cursor=<next>&entityType=StockLedgerEntry&action=create   (page 3)
GET .../audit-logs?limit=25&cursor=<next>&entityType=StockLedgerEntry&action=create   (page 4)
```
All 4 pages (100+ rows total) returned **only** `entityType=StockLedgerEntry,
action=create` rows — combined filters survive cursor pagination correctly, confirmed to
page 4 (well past page 1) with real production-volume data (11,307-row filtered set).

**Export respects the applied filter (network-log + curl, both agree):** clicking Export
with the "Fiscal Period" filter active fired
`GET /tenant/audit-logs/export?entityType=FiscalPeriod` (captured live in the browser's
own network log) → 200, 8757 bytes. I additionally called the same URL directly via curl
with the owner's JWT and got exactly **10 records** (matches the DB's FiscalPeriod count
exactly) with full before/after diffs per row — **the export file is genuinely useful**,
not an ID dump: each record carries the complete before/after JSON of the fiscal period
(status, lockedAt, lockedBy, dates), not just IDs.

**FINDING AUDIT-011 — HIGH, CONFIRMED both live on-screen and in the raw export JSON — a
raw UUID is displayed and exported as the actor's identity, indistinguishable from a real
email.**

On-screen (Timeline view, filtered to Fiscal Period, real browser render):
```
bfdf55a3-51fe-4192-ba44-9fd28c24f71c⁨Updated Fiscal Period⁩#7a35384c…  47 min ago
accountant1⁨Updated Fiscal Period⁩#7a35384c…                          47 min ago
```
The same raw ID appears as `userEmail` in the exported JSON:
```json
{ "userId": "bfdf55a3-51fe-4192-ba44-9fd28c24f71c",
  "userEmail": "bfdf55a3-51fe-4192-ba44-9fd28c24f71c", ... "entityType": "FiscalPeriod" }
```
Root cause (code read, `apps/api/src/fiscal-period/fiscal-period.service.ts`): **12
separate call sites** pass `userEmail: userId` verbatim into `auditLogService.append()`
(e.g. lines 763, 955, 980, 1172, 1472, 1608, 1660, 1852, 2003, 2148, 2734, 2914) — the
service never resolves the acting user's real email before writing the audit row.
```sql
select entity_type, action, count(*) from audit_log
where user_email ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' group by 1,2;
-- FiscalPeriod|update|5   CloseRun|update|1
```
Only 6 rows today (small blast radius so far), but the pattern is systemic across every
lock/unlock/reopen/close-run action in that service, and it directly violates the
programme's own architectural rule ("no raw ID reaching the user" / "no raw UUID in an
audit field") — this is the exact defect class the brief asked me to hunt for, found live.
**`fiscal-period.service.ts` and `close-run*.service.ts` are outside my file-ownership
area (packs/entitlements/audit-screen/company-profile/print-branding/integrations) — I am
REPORTING this, not fixing it**, per the delegation rule for out-of-scope files. The fix
is mechanical: thread the real actor email through (the calling controller already has it
off the authenticated request) instead of reusing `userId`.

Separately, `entityLabel` is `null` on every row I sampled (not just FiscalPeriod) — the
API never resolves a human label for `entityId`; the **frontend** compensates by
truncating the id to 8 chars with a full-UUID tooltip (`audit-table.tsx`'s `shortId()`),
which is an acceptable middle ground for an ID, not the same defect as the userEmail bug
above (a truncated ID that is visibly an ID is not "indistinguishable from an email").
Grepped the sampled entity_ids and export content for raw URLs used as IDs/dedupe keys —
found none in this tenant's live data (the architectural rule the brief called out as
"violated before" was not reproduced here).

### 2. DATA IMPORT CONTROLS — reached, code-level pass only (browser contention prevented a live walk)

`apps/api/src/inventory-import/inventory-import.controller.ts` gates its three action
tiers correctly and distinctly: `settings.import.read` (list/preview),
`settings.import.create` (start a new import), `settings.import.apply` (commit the
import) — three separate permission checks on three separate actions, not one blanket
gate, which is the right shape (a viewer could theoretically preview without being able to
commit). I did not get a stable browser window to walk the screen's own filter/pagination/
empty/error states live this pass — noting as a residual gap rather than asserting a
result I did not observe.

### 3. LIVE LOGO UPLOAD → PRINTED DOCUMENT — founder's acceptance test, done via curl (real endpoint, real PDF) after the browser proved too contended for a sustained multi-step flow

**Before (SQL):** `select logo_url from tenant_identity where id='ce603a7c-...'` → empty.
**Ledger identity before:** `0.000000`.

Uploaded a real 1×1 PNG (`/tmp/ZZTEST-logo.png`) through the actual production endpoint
(not a shortcut): `POST /tenant/settings/logo` (multipart, owner JWT) → 200,
`logoUrl: "https://.../tenant-assets/<tenantId>/logo?v=..."`. Confirmed the object is
publicly fetchable (`curl -I` → 200, `content-type: image/png`).

**It reaches a real printed document.** Fetched the actual PDF for the same live invoice
`09-print-setup.md` used (`cbc740e6-d641-4118-bbb4-2daedda7a3ba`,
`B1ALRAIMAINS-INV-00006`) via `GET /tenant/documents/sales-invoice/{id}/pdf` → 200, a real
114KB single-page PDF. Inspected its raw object stream: it embeds an `XObject /Image` with
`/Width 1 /Height 1` — **the exact pixel dimensions of the 1×1 test PNG I had just
uploaded**, proving the logo flows all the way from upload to a server-rendered printed
PDF with no manual "apply to documents" step. `COUNTRY_TEMPLATE_DEFAULTS` and
`BRAND_TEMPLATE_DEFAULTS` in `packages/shared/src/print/template-scope-defaults.ts` are
both deliberately empty (per their own header comment) and contain nothing that would hide
`header.logo` for Kuwait or for this brand, so there is no hidden per-country/per-brand
toggle standing between "upload a logo" and "it appears" — confirmed by reading the code
that would have to contain such a toggle if one existed, not merely by its absence.

I could not get a clean live A4-preview-then-print-preview browser round-trip to visually
diff en vs ar for the LOGO specifically (contention); the logo is a static image with no
text, and `09-print-setup.md` already PASS-verified byte-identical DOCUMENT-language
binding for the surrounding text/layout of this exact invoice under `/en` and `/ar` — I am
not re-deriving that, only noting the logo image itself carries no language, so
"binds to document language" is trivially true for it and not itself something a
transposed-locale check could contradict.

**Restore (SQL + endpoint), verified:**
```
DELETE /tenant/settings/logo -> 200, response body logoUrl: null
select logo_url from tenant_identity where id='ce603a7c-9f94-4c89-8f48-8ebb84755e10';  -- empty (matches original)
```
**Ledger identity after:** `0.000000`. Logged in `study/testing/_documents-created.md`.

**Founder's acceptance test — answer: YES, with high confidence, from a direct code read
of the actual component** (`apps/web/src/features/organisation/components/
logo-upload.tsx`): the control is a single 112×112px dashed-border tile in the Company
Profile screen (reached via Settings → Company, one nav click from anywhere). Interaction
count: **click the tile (1) → OS file picker → pick a file (1) → done.** There is no
separate "Save" button — `handleFileSelect` calls `uploadMutation.mutate(file)`
immediately on selection; the preview swaps to the real URL when the upload succeeds. No
confirmation dialog is shown for upload (correct — it is not destructive). A confirmation
dialog exists ONLY for **removing** a logo (`removeConfirmOpen`, an `AlertDialog` with a
plain-language body: "Your logo will be removed from the app and printed documents. You
can upload a new one any time.") — correctly reserved for the one irreversible-feeling
action, matching the founder's "confirm once, only for irreversible actions" rule exactly.
Client-side validation (file type, 2MB size cap) fires before the network call, with
plain-language errors ("Logo must be under 2 MB.", not a raw MIME/byte-count error).
Advisory (non-blocking) print-quality warnings — low resolution, no transparent margin,
CMYK JPEG — are a genuine defensive-UX touch beyond what was asked, never able to block or
delay the upload itself. **Total forced fields: zero. Total dialogs for the happy path:
zero. This clears the "under 60 seconds, first try" bar comfortably** — an untrained
Kuwaiti shop owner can get their logo onto their invoice in two clicks once they find
Settings → Company, and the copy in both languages is 8th-grade plain (see below).

### 4. ar/RTL PARITY — logo/company-profile strings, code-level

`apps/web/messages/en/settings.json` and `.../ar/settings.json`, `organisation.logo.*`
keys — full parity checked key-by-key: `alt`, `upload`, `change`, `hint`,
`uploading`, `invalidType`, `tooLarge`, `uploadFailed`, `remove`, `removeConfirmTitle`,
`removeConfirmBody`, `removeConfirmCancel`, `removeConfirmButton`, `removeFailed`,
`printWarnings.*` are ALL present in both files with real translations (not placeholder
English-in-Arabic), plain language in both ("Logo must be under 2 MB." /
"يجب أن يكون الشعار أقل من ٢ ميغابايت."), no em dashes in either. I did not get a stable
live RTL screenshot of the Company Profile screen itself this pass (contention); the
i18n-file-level parity check is real and complete, but is not a substitute for seeing the
dashed tile mirror correctly under `dir="rtl"` — flagging that visual confirmation as a
residual gap, not asserting it passed.

### Withdrawn this pass

- **Audit "What Changed" filter bypass** — see above: a too-fast DOM read produced a false
  positive; the properly-awaited re-test showed the filter working correctly
  (10 of 10, matching SQL). Withdrawn before it was ever written up as a finding.

### Residual gaps after this resumed pass (honest)

1. Data Import Controls screen: permission gating confirmed at the API layer; the
   screen's own filters/pagination/empty/error states were not walked live (browser
   contention). No findings, positive or negative, to report there beyond the API check.
2. A live RTL screenshot of the Company Profile / logo tile specifically (i18n string
   parity is confirmed at the file level, not the rendered layout).
3. Audit Trail screen's "User" filter and the "Date range" filter were not individually
   exercised live this pass (entity-type + action were, both individually and combined,
   and both verified against SQL) — API contract for `userId`/`dateFrom`/`dateTo` is
   identical in shape to `entityType`/`action` in `audit-log.controller.ts`, so I expect
   the same behavior, but I did not personally observe it and am not asserting it as
   CONFIRMED.

## Summary of ranked findings

| ID | Severity | Status | One-line |
|---|---|---|---|
| P-1 | MEDIUM | CONFIRMED | No tenant-facing Packs & Entitlements screen; no deactivate endpoint exists anywhere in the product |
| P-2 | — (positive) | CONFIRMED | Auto-parts pack guardrails (no-drop-on-save, stays-visible-if-populated) are real, tested, and enforced at the component boundary; no industry conditional found in core form panel |
| W-1 | — (positive) | CONFIRMED | Webhook SSRF guard uses real URL parsing + resolved-IP blocking + connect-time pinning + no-redirect-follow; secrets masked, never logged |
| CP-1 | — (positive) | CONFIRMED | Logo URL is not client-settable (no SSRF/open-redirect surface); no KWD/GST column-floor-style constant found in print/branding code |
| CP-2 | — (positive) | CONFIRMED | Live logo upload verified end-to-end via curl on the real endpoint: appears in a real printed invoice PDF (embedded XObject dimensions matched the test file exactly), 2-click happy path, no forced fields, confirm-dialog reserved only for the destructive remove action, full ar/en string parity, restored and verified via SQL |
| AUDIT-011 | HIGH | CONFIRMED | Raw actor UUID displayed on-screen AND in the export JSON as `userEmail` for FiscalPeriod/CloseRun audit rows (`fiscal-period.service.ts`, 12 call sites of `userEmail: userId`); out of my file-ownership area, reporting not fixing |
| AUDIT (screen walk) | — (positive) | CONFIRMED | Screen total matches DB exactly (13377=13377); combined entityType+action filters survive 4+ pages deep on an 11,307-row real set; export respects the applied filter and produces a genuinely useful file (full before/after diffs, not an ID dump) |
| AUDIT | (see 00-audit-log.md) | — | Not re-derived; that file's CRITICAL/HIGH findings stand, several already fixed |

---

## 2026-08-30 — IMPLEMENTATION PASS: AUDIT-011 fix + FIX 2 (notification catalog sync)

### FIX 1 — AUDIT-011 (raw actor UUID as userEmail)

**Type-level technique chosen:** a chokepoint sanitizer in `AuditLogService.append`/`appendMany`
(`apps/api/src/audit/audit-log.service.ts`), mirroring the two footgun guards already in that
exact file (`sanitizeReason`, `sanitizeCorrelationId`). `sanitizeUserEmail(userEmail, userId,
logger, context)` rejects any `userEmail` that equals `userId` or is UUID-shaped, logs
ERROR+Sentry, and substitutes a fixed non-UUID sentinel (`AUDIT_UNRESOLVED_EMAIL_SENTINEL =
"unresolved-actor@audit.internal"`, exported) — `audit_log.user_email` is `NOT NULL` so it cannot
drop to NULL the way `sanitizeReason` does.

**Why a future developer cannot reintroduce this bug:** full compile-time branding of
`AuditEntry.userEmail` across all 82 existing call sites was rejected as disproportionate blast
radius for a single implementer with one final rebuild (would have required touching unrelated
modules with no full-suite verification available). Instead the fix is placed at the ONE
mandatory chokepoint every caller (present and future, all 82 of them today) already funnels
through before a row is ever persisted — `append()`/`appendMany()` are the only two INSERT paths
into `audit_log`. A caller can still WRITE `userEmail: someUserId` in source, but the wrong value
can never LAND in the database or reach the UI: it is caught and swapped for the sentinel at
write time, loudly (ERROR log + Sentry `audit-log` tag), every time. This is intentionally the
same shape of guarantee `sanitizeCorrelationId` already gives this codebase for a different
column on the same table — not a new pattern.

**Root cause additionally fixed** (belt-and-suspenders, not just the backstop):
`fiscal-period.service.ts`'s 12 call sites (`userEmail: userId` / `userEmail: actingUserId`) now
call a new private `resolveAuditUserEmail(userId)` that resolves the REAL email from
`getTenantContext().email` (ALS request context — every one of these methods only ever acts as
the current caller, verified: the caller's own `userId` param always equals `ctx.userId`), with a
defensive mismatch check, falling back to the existing `SYSTEM_USER_ID`/`SYSTEM_USER_EMAIL`
sentinel pair (`common/system-actor.ts`) for system-triggered paths (forward-calendar sweep,
system-triggered reopen nested in `closeFiscalYear`) and for the no-ALS-context case. **12 call
sites collapsed to 1 shared resolver.**

**Historical rows:** NOT backfilled (explicitly not a migration, per instructions). Confirmed via
SQL 2 of the 5 most-recent FiscalPeriod audit rows still carry the raw UUID
`bfdf55a3-51fe-4192-ba44-9fd28c24f71c` as `user_email` (created 07:59:39.923614 /
07:59:42.236276 UTC). The DISPLAY layer degrades these gracefully instead: a new shared util
`apps/web/src/features/audit/utils/actor-display.ts` (`resolveActorDisplay`) detects a
UUID-shaped or userId-echoing `userEmail` and resolves the real name from `userId` via the
existing names-only `useUserDirectoryQuery` (`/tenant/users/directory`, no permission gate — the
exact "audit trail actors" use case its own doc comment names), falling back to a new
`unknownUser` i18n key ("Deleted user" / "مستخدم محذوف") when even that misses. Wired into
`AuditTable`, `AuditTimeline`, and `AuditExportButton` (which needed its OWN directory query
since export re-fetches server-side, not the browser's loaded page).

**Pins:**
- `apps/api/src/audit/audit-log.service.spec.ts`: 3 new tests on `sanitizeUserEmail` via
  `service.append()` (substitutes sentinel when `userEmail === userId`; substitutes sentinel when
  UUID-shaped but different from userId; leaves a genuine email untouched).
- `apps/web/src/features/audit/utils/actor-display.test.ts`: 4 new tests on
  `resolveActorDisplay` (genuine email passthrough; raw-id-equals-userId resolves via directory;
  UUID-shaped-but-different resolves via directory; directory miss falls back to unknown label).

**DELIBERATE-BREAK RESULTS (both CONFIRMED):**
- Backend: reverted the `sanitizeUserEmail(...)` call in `append()` back to `entry.userEmail`
  (the exact original bug shape) → `npx jest audit-log.service.spec --no-coverage` →
  **2 tests FAILED** (expected sentinel, got the raw UUID) exactly as expected. Restored; re-ran →
  **48/48 passed**.
- Frontend: reverted `resolveActorDisplay` to `return entry.userEmail;` → `npx vitest run
  actor-display` → **3 of 4 tests FAILED** (expected resolved name/fallback, got the raw UUID).
  Restored; re-ran → **4/4 passed**.

**Typecheck:** `npx tsc --noEmit -p .` (apps/api) — clean for all touched files (5 pre-existing,
unrelated errors in `onboarding/*` and `__tests__/integration/*` from another concurrent
session's in-flight `TaxConfigService` constructor change; confirmed via `git status`/`git log`
these files are NOT part of this fix and were already broken before this session started).
`pnpm --filter @zerupt/web typecheck` — **exit 0, fully clean**. `pnpm --filter @zerupt/web
i18n:check` — **passed, ar/en in sync** (new `unknownUser` key added to both locales).

**LIVE VERIFICATION (all CONFIRMED, gstack browse, logged in fresh as
anonymator8@gmail.com/owner, asserted via URL + page content after each daemon drop):**
- EN, Timeline view, filtered to Fiscal Period: every row shows `accountant1`, zero raw UUIDs.
  Screenshot `/tmp/audit-en2.png`.
- EN, Table view (the exact view the original finding screenshotted): every `User` column cell
  shows either the real email (`accountant1@gulf-auto-parts-mt5kya1i.zerupt.local`) or the
  directory-resolved `accountant1` for the historical bad rows — zero raw UUIDs. Screenshot
  `/tmp/audit-en-table3.png`.
- AR, Table view, RTL: same result, `المستخدم` column shows resolved names/emails only.
  Screenshot `/tmp/audit-ar2.png`.
- Export: captured the actual downloaded CSV Blob content in-browser (hooked
  `URL.createObjectURL` before clicking Export, since the download itself is a client-side blob,
  not a navigable URL). The real exported file content for the same 2 historically-bad rows shows
  `accountant1`, never the raw UUID — confirms the export path, not just the on-screen table,
  is fixed.
- Console: no new errors attributable to this change (only unrelated preload warnings from
  concurrent sessions sharing the browser).
- Browse daemon dropped/was hijacked by a concurrent session multiple times mid-verification
  (exactly the instability the briefing warned about) — restarted/re-logged-in/re-navigated each
  time per instructions; final screenshots above were taken immediately after a fresh `goto` to
  avoid the race.

### FIX 2 — inventory.lowStock defaultChannelEmail correction for already-provisioned tenants

Built a small idempotent, re-runnable CLI: `apps/api/src/notification-policies/
sync-catalog-defaults.{service,module,cli}.ts` (`pnpm --filter @zerupt/api
sync:notification-catalog-defaults`), following the exact `--tenant=<id>`/`--apply`/dry-run-default
pattern already used by `repair:cost-pool-return-void` and `backfill:account-mappings` in this
repo. It does an EXPLICIT `UPDATE notification_event_policies SET channel_email = <target> WHERE
(tenant_id, event_key) = (...)` keyed on the row's actual unique key (never a slug, never
`onConflictDoNothing` — the exact silent-no-op mechanism that left this stale). Deliberately
narrow: it only ever moves a row that is STILL at the recorded OLD default; a row that has
already diverged to some OTHER value (an operator's deliberate customization) is reported and
left untouched (`decideSyncAction`, extracted as a pure function for unit-testability).

**Original value recorded (SQL, before any write):**
```
tenant_id=ce603a7c-9f94-4c89-8f48-8ebb84755e10, event_key=inventory.lowStock,
channel_email=t, channel_in_app=t, is_enabled=t, updated_at=2026-08-23 10:16:42.915733+00
```

**Applied via:** `node dist/notification-policies/sync-catalog-defaults.cli --event=inventory.lowStock
--previous=true --tenant=ce603a7c-9f94-4c89-8f48-8ebb84755e10 --apply` (dry-run confirmed the
plan first: "would set channelEmail true -> false").

**Proof by SQL (after):**
```
tenant_id=ce603a7c-9f94-4c89-8f48-8ebb84755e10, event_key=inventory.lowStock,
channel_email=f, channel_in_app=t, is_enabled=t, updated_at=2026-08-30 10:42:02.875+00
```

**Deliberately NOT restored** — the flip to `false` IS the fix for this already-provisioned
tenant, matching the corrected catalog default. Re-running the same `--apply` command afterward
reported "already false" (0 synced) — idempotency CONFIRMED.

**Pin:** `apps/api/src/notification-policies/sync-catalog-defaults.service.spec.ts` — 4 tests on
the pure `decideSyncAction` (no policy row; syncs a row still at the old default; already-current
no-op; never overwrites a row that diverged to neither known default — the operator-customization
safety property).

**DELIBERATE-BREAK RESULT (CONFIRMED):** removed the "never overwrite a customized row" branch
from `decideSyncAction` (made it always report `synced` regardless of the current value) →
`npx jest sync-catalog-defaults.service.spec --no-coverage` → **1 test FAILED** (expected
`already_current`/`wasCustomized: true`, got `synced`) exactly as expected. Restored; re-ran →
**4/4 passed**.

### Ledger identity (write-safety rail)

Pre-write: `0.000000`. Post-write (after both fixes, including the live FIX 2 apply against Gulf
Auto Parts): `0.000000`. No fiscal periods, documents, or opening-balance journals were touched by
either fix — FIX 1 is a code-level audit-write correction plus a read-only display fix; FIX 2
touches only `notification_event_policies`, a settings table with no ledger relationship.

### Rebuild / restart

`pnpm --filter @zerupt/api build` succeeded once with both fixes present; API restarted
(`kill` + `nohup node dist/main`) and confirmed healthy (`/api/v1/health` — only `email_config`
down, normal per briefing) with the new symbols present in `dist/` (`grep -c
resolveAuditUserEmail dist/fiscal-period/fiscal-period.service.js` → 15;
`AUDIT_UNRESOLVED_EMAIL_SENTINEL` → 3). A LATER `pnpm build` attempt (run only to pick up a
source-only refactor extracting `decideSyncAction` for testability, no behavior change) failed
due to an UNRELATED concurrent session's in-flight `TaxConfigService` constructor change breaking
onboarding spec files — confirmed via `git status`/`git log` these are not mine. The currently
running API process is the one from the FIRST successful build and already serves both fixes'
production logic correctly (verified live above); the FIX 2 CLI's `sync-catalog-defaults.service.js`
in `dist/` was independently rebuilt and re-verified idempotent after that partial build, and is
invoked as a one-shot CLI, never loaded by the running server.

**Every claim above is CONFIRMED** (SQL, jest/vitest output, tsc/i18n-check output, and live
gstack browse screenshots/network capture), except none are marked SUSPECTED — no verification
step was blocked.
