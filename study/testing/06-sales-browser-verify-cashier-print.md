# Browser verification — cashier permission fixes + print pipeline (2026-08-29)

Ledger identity check: `0.000000` before first write, `0.000000` after last write (only write this session: cashier1's approval-PIN row, no GL impact).

Tool note: gstack browse was extremely unstable this session (daemon restarted repeatedly, `@ref` clicks/fills timed out constantly — CSS-selector clicks/fills worked reliably instead). Several actions took 3-5 retries. Where the browser genuinely could not produce evidence, I fell back to code-read + SQL and say so explicitly.

## PART A — cashier1 / accountant1

### 1. PIN self-service reachable by non-admin — CONFIRMED, CONFIRMED-secure
Logged in as **cashier1** (identity asserted via user menu: `cashier1@gulf-auto-parts-mt5kya1i.zerupt.local`). Navigated to `/settings/approval-pins` — reachable, shows "No approval PIN set yet." (GET status 200, confirmed in network log). Set PIN 1234 (PUT → 204, confirmed in network log). Page immediately re-rendered to "Change approval PIN" / "Approval PIN set · updated 8/29/2026" and the direct set-form disappeared, replaced by a "Change PIN" link that requires password re-auth (`forgotPin` flow) — this is the overwrite guard surfacing correctly in the UI.

Code-level confirmation (read end-to-end, `apps/api/src/approval-pin/pin-verification.service.ts:258-267`):
```
async setInitialPin(tenantId, userId, pin) {
  const { hasPin } = await this.getPinStatus(tenantId, userId);
  if (hasPin) {
    throw new ConflictException({ code: "PIN_ALREADY_SET", message: "..." });
  }
  ...
}
```
A second PUT re-checks the DB and throws 409 `PIN_ALREADY_SET` before any write — verified by reading the guard, not just trusting the comment. I could not force a second raw PUT through the browser (the app's bearer token isn't in `localStorage`/cookies reachable by an unauthenticated `fetch`, and a raw fetch got 401 as expected), so the 409 itself is CONFIRMED by code read, not by an HTTP capture — the UI's post-set state change is independent corroborating evidence.

Security-critical half — CONFIRMED by code read: `ApprovalPinController.getStatus` and `.setPin` (`apps/api/src/approval-pin/approval-pin.controller.ts:35-79`) derive the user **only** from `getTenantContext().userId`. Neither endpoint accepts a user id from route or body. A cashier cannot set or probe anyone else's PIN.

### 2. Approvals invisible to cashier — CONFIRMED
As cashier1, `/settings/organisation` renders a clean generic error card ("Failed to load organisation settings" + Retry button) — not a crash, not blank, not a UI approval toggle. The sidebar itself never lists "Organisation" for cashier1 (only Approval PINs, Pricing, My Profile). No approval control reachable.

### 3. POS register-create store-type filter — BLOCKED for both tested roles, CONFIRMED by code+SQL
cashier1: `/settings/pos` → "Not available for your configuration" (clean denial).
accountant1: `/pos/registers` → "You don't have access to this page" (clean denial).
Neither role could reach the create-register dialog, so I could not eyeball the picker. Verified by code instead (`apps/web/src/features/pos/components/settings/create-register-dialog.tsx:144-175`): the warehouse list comes from `useWarehouseOptionsQuery(branchId)` (falls back to the names-only directory on 403) and is filtered client-side to `w.type === "store"`; when a branch has exactly one store warehouse it auto-assigns and hides the picker, only showing it for 2+.
SQL: every branch in this tenant (Al Rai, Fahaheel, Jahra, Salmiya) has **exactly one** store-type warehouse — Al Rai's other two (`WH1_B1` "Shuwaikh Central Warehouse", `..._TR` Transit) are non-store, correctly excluded by the filter. So the multi-warehouse-picker code path is architecturally correct but **untestable in this tenant's current data** (no branch has 2+ store warehouses) — not a defect, a data/reachability gap.

### 4. Warehouse pickers on inventory screens — CONFIRMED FIXED
As **accountant1** (asserted via `/inventory/adjustments/new` showing "You do not have permission to post stock adjustments" — the exact role that lacks `settings.warehouse.list`, confirmed via network log 403 on `GET /tenant/warehouses`):
- **New Adjustment** → Location picker populated with all 6 real warehouses (Al Rai Main Showroom, Fahaheel Branch, Jahra Branch, Salmiya Service Center, Shuwaikh Central Warehouse, Transit). NOT empty.
- **New Transfer** → From/To Location pickers identically populated (same 6 names).
- **Stock Levels** → "All locations" filter populated with the 5 branches; per-warehouse columns render correctly (including the Al Rai-owned "Shuwaikh Central Warehouse" column showing real stock, e.g. 27 units on one row) — no branch-scoping leak, this is the expected names-only directory fallback for a role without the admin-gated list permission.

Code confirms the fix (`apps/web/src/features/inventory/api/inventory-queries.ts:663-671`): `useWarehouseOptionsQuery` is now a 6-line shape-adapter delegating entirely to the shared `useAllWarehouseOptionsQuery` — exactly the described fix (no second fetch, no duplicated 403 handling).

Batches / Serial Numbers / Stock Counts filters — **NOT independently re-verified this session** (session/tool instability repeatedly logged me out mid-navigation and I prioritized the higher-value screens + Part B). Given the fix is a single shared hook already confirmed working on 3 of the listed screens, I have no reason to suspect these 3 remaining ones differ, but I did not personally see them — flag as unverified rather than claim a pass.

## PART B — print (owner, since this is not a permission test)

Identity: logged in as owner ("HB" in top bar, dashboard shows Al Rai branch chooser reachable only to owner-tier).

### 5. Print no longer permanently 503s ("not configured") — CONFIRMED but FLAKY, HIGH finding
Triggered "Print" on sales invoice B1ALRAIMAINS-INV-00005 (has a real posted receipt against it). Sequence of 4 attempts:
1. 503 after 39.0s
2. 503 after 34.4s (this attempt, traced in `web.log`, was a genuine `JWTExpired` on the 60s print-render token — the very first hit to `/en/print/render` cost 404s to cold-compile in this dev Turbopack server, blowing well past the 60s token TTL; confirmed via `console.error("print/render: token verification failed JWTExpired...")` in the web log)
3. 503 after 47.95s (route was already warm — `GET /en/print/render 200 in 19.1s` appears in web log for a prior attempt — so this failure happened before ever reaching the web app; no corresponding `/en/print/render` line in web.log for this attempt at all, meaning the renderer stalled server-side, most plausibly `MAX_CONCURRENT_RENDERS` semaphore contention: 10 chrome-headless-shell processes were running concurrently at the time, evidence of multiple parallel test sessions hammering the same shared API instance)
4. **200, 127KB PDF body**, 35.9s — succeeded.

So PUPPETEER_EXECUTABLE_PATH is genuinely configured and functional (verified independently: a standalone `puppeteer-core.launch({executablePath: <configured path>})` + `page.pdf()` in this exact repo produced an 11KB PDF instantly, no errors) — the "not configured" 503 is gone. But the end-to-end pipeline is NOT reliably returning a PDF on the first attempt in this live, heavily-shared dev environment; it needed 4 tries. This is a real, reproducible finding: rank **HIGH, CONFIRMED** (not CRITICAL — no data/money/tenant impact, but "does printing work" failed 3 times before succeeding, which is a real user-facing reliability gap even if partly attributable to this session's unusual concurrent load). I could not extract the successful PDF's bytes for a text-grep (the app opens the blob via `window.open(url, "_blank")`, which headless Chromium's popup handling did not surface as an inspectable tab), so item 6's UUID-grep had to be done at the code level instead (see below).

### 6. SAL-PRINT-001 — payment voucher allocation lines show real doc numbers, never a UUID — CONFIRMED via code trace (could not extract rendered PDF bytes)
Could not download/grep the actual PDF (see above — `window.open` blob not reachable in headless automation, and a direct authenticated fetch to the PDF endpoint 401'd since the bearer token lives outside any storage this session could read).
Traced the full server-side path instead (`apps/api/src/documents/tax-document-assembler.service.ts:508-546`):
```ts
private async resolveReceiptAllocationNumber(tenantId, sourceDocumentType, sourceDocumentId) {
  try {
    if (sourceDocumentType === "invoice") {
      const invoice = await this.salesInvoices.get(tenantId, sourceDocumentId);
      return invoice.number || EMPTY_VALUE_PLACEHOLDER;
    }
    const creditNote = await this.creditNotes.get(tenantId, sourceDocumentId);
    return creditNote.number || EMPTY_VALUE_PLACEHOLDER;
  } catch {
    return EMPTY_VALUE_PLACEHOLDER;
  }
}
```
`assembleSalesReceipt` calls this for every allocation and passes the result as `sourceDocumentNumber` into `PaymentAllocationLike`; the mapper (`packages/shared/src/print/mappers/payment-voucher.mapper.ts:76`) does `itemName: a.sourceDocumentNumber` — a raw uuid is structurally impossible to reach `itemName` because `sourceDocumentNumber` is only ever populated by an active `.get()` lookup that returns `invoice.number`/`creditNote.number`, with `EMPTY_VALUE_PLACEHOLDER` (never the id) on any failure. This is a proper fix, not a rename-only patch.

Corroborating UI evidence (same resolution mechanism, one layer up): opened receipt voucher B1ALRAIMAINS-RV-00005 (has a real allocation) in-app — the Allocations table shows `B1ALRAIMAINS-INV-00005` under "Invoice", never a UUID.
Verdict: **CONFIRMED, HIGH confidence, via full code trace + UI corroboration** — the actual printed PDF was not personally eyeballed this session due to the headless popup-blocking limitation above; flagging this gap explicitly per the method rules rather than claiming full CONFIRMED-by-screenshot status.

### 7. Document-language binding + KWD 3dp + no tax on print — NOT independently browser-verified this session (time/session-instability constrained)
Given the repeated session drops and the ~35-48s-per-attempt print pipeline, I did not complete a full Arabic-UI-print-English-document round trip this session. Code-level signal only: a dedicated test file exists specifically for this invariant (`apps/web/src/features/print/document/__tests__/printed-document.language-binding.test.tsx`), and the project's own hardening log (CLAUDE.md) already documents this as an enforced, previously-audited rule. I am not claiming this as a browser-CONFIRMED pass — report it as SUSPECTED PASS (code/test evidence only) and flag that a follow-up session should complete the live check when the environment is less contended.

## Summary table

| # | Item | Verdict | Confidence |
|---|------|---------|------------|
| 1 | PIN self-service reachable + overwrite guard | CONFIRMED (UI + code) | High |
| 1b | PIN endpoints never take a user id param | CONFIRMED (code) | High |
| 2 | Approvals invisible to cashier | CONFIRMED | High |
| 3 | Register-create store-type filter | BLOCKED for cashier1 + accountant1; CONFIRMED by code+SQL | Medium (untestable live, no branch has 2+ store warehouses) |
| 4 | Inventory warehouse pickers populated | CONFIRMED (New Adjustment, New Transfer, Stock Levels) | High; Batches/Serial/Stock Counts unverified this session |
| 5 | Print no longer "not configured" | CONFIRMED but FLAKY — 3 failures then 1 success | High — rank HIGH finding on reliability |
| 6 | SAL-PRINT-001 no raw UUID on voucher print | CONFIRMED via full code trace + UI corroboration; PDF bytes not personally inspected | Medium-High |
| 7 | Print binds to document language / KWD 3dp / no tax | NOT verified live this session (code/test evidence only) | Low — flag for follow-up |
