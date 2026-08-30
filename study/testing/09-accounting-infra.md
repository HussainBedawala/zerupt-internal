# Phase F — Accounting: infrastructure & cross-cutting findings (lead agent, own work)

These were found and verified by the lead agent directly, not by an area subagent.
Ledger baseline at session start: **0.000000 over 889 lines**.

---

## ACC-INFRA-001 — Arabic chart of accounts shipped five em dashes to a live tenant — CONFIRMED, FIXED

**Rank: MEDIUM** (founder-standard violation, live, user-visible, zero money impact)

The tenant's health endpoint reported `migration_drift: {behindCount: 1}`. The single pending
migration was `0313_fix_arabic_coa_em_dash` — written in a prior session, never applied to this
tenant. Its subject matter is squarely Accounting: five seeded Arabic account names carried the
banned em dash (U+2014), and `accounts.name_alt` is **materialised at provisioning time** from
`BILINGUAL_NAMES` (`apps/api/src/accounts/coa-bilingual.ts`), so nothing re-reads the constant
afterwards. Fixing the constant changes what NEW tenants get and nothing else; without the
migration every already-provisioned Arabic tenant keeps the em dash forever.

These names surface in the Trial Balance, Balance Sheet, General Ledger and Day Book, plus every
one of their CSV exports, for every Arabic (GCC) tenant.

Confirmed live before the fix:

```sql
select code, name, name_alt from accounts
where name_alt like '%—%' or name like '%—%' order by code;
```
```
1129|Bank - Cheques in Transit        |شيكات في الطريق — بنك
1134|Post-Dated Cheques Receivable    |شيكات مؤجلة الدفع — مدينة
2145|Post-Dated Cheques Payable       |شيكات مؤجلة الدفع — دائنة
3200|Retained Earnings - Prior Years  |الأرباح المبقاة — سنوات سابقة
3300|Retained Earnings - Current Year |الأرباح المبقاة — السنة الحالية
```

Note the English side of each already used a plain hyphen, and account 2140 already used a plain
hyphen on the Arabic side for the identical pattern — so this was five stragglers, not a
terminology choice.

**Action taken:** applied the pending migration through the real drizzle migrator (not by hand),
so the journal + hash tracking stays correct.

After:
```
em_dashes_in_accounts = 0
applied_migrations    = 311   (was 310)
posted-ledger identity = 0.000000
```

This also clears the `migration_drift` health check, which **gates deploy**.

**This is the RPT-052 lesson recurring in a new medium.** RPT-052 fixed em dashes at the shared
formatter primitive. This one could not be fixed at a primitive because the value is *snapshotted
into tenant data at provisioning*. Worth noting as a distinct class: **any constant that is
materialised into per-tenant rows at provisioning time cannot be fixed by editing the constant** —
it always needs a data migration as well. The migration file itself documents this correctly.

---

## ACC-INFRA-002 — `drizzle-kit migrate` silently migrates the WRONG database when the env var name is wrong — CONFIRMED

**Rank: HIGH** (deploy/ops safety; a mis-typed variable corrupts nothing but reports success
against a database you did not target)

`CLAUDE.md` documents the tenant migration env var as **`DATABASE_TENANT_URL`**. But
`packages/db/drizzle.config.ts` actually reads **`DIRECT_URL_TENANT`**:

```ts
config({ path: "../../.env" });
const url = process.env.DIRECT_URL_TENANT;
if (!url) throw new Error("DIRECT_URL_TENANT is required");
```

I ran the documented incantation with the Gulf Auto Parts connection string:

```
DATABASE_TENANT_URL="$GULF" npx drizzle-kit migrate
```

It printed **`[✓] migrations applied successfully!`** and exited 0 — but the Gulf tenant was
completely unchanged (still 310 applied migrations, still 5 em dashes). The override was ignored,
`DIRECT_URL_TENANT` fell through to the value in `.env`, and it migrated **`zerupt_tenant_dev`**
instead. Re-running with `DIRECT_URL_TENANT` set produced the intended result (311 applied,
0 em dashes).

**Why this is HIGH and not cosmetic:** the guard `if (!url) throw` only fires when the variable is
ABSENT. It cannot fire when the variable is present-but-from-the-wrong-source, which is exactly
the failure mode a wrong variable NAME produces. The operator gets a green success message for a
migration that landed on a different database. In the manual per-tenant migration procedure this
product actually uses for production tenants, that is how a tenant silently gets left behind — and
"left behind" is precisely the state I found this tenant in (ACC-INFRA-001).

**Recommended fix (at the primitive, so the mistake becomes impossible rather than merely
documented):**
1. Make the config **echo the resolved target database name and host** before applying anything,
   so the operator sees WHICH database is about to be migrated. A migrator that does not name its
   target cannot be operated safely.
2. Fix `CLAUDE.md` to name `DIRECT_URL_TENANT`, or better, accept both names in the config with
   an explicit precedence, so the documented spelling cannot be silently inert.
3. Prefer routing per-tenant migrations through the existing `migrate-all.cli` (which is the
   sanctioned fleet path and already has the audit/`migration_runs` trail) rather than raw
   `drizzle-kit migrate` against a hand-pasted connection string.

---

## ACC-INFRA-003 — the programme's own master ledger gate is status-blind — CONFIRMED (methodology defect)

**Rank: MEDIUM** (affects the trustworthiness of every session's integrity claim, including the
ones already recorded)

The gate used throughout this entire hardening programme is:

```sql
SELECT round(sum(debit-credit),6) FROM journal_entry_lines;  -- MUST be 0.000000
```

It sums **every line regardless of journal status**. During this session it read **7.000000** and
briefly looked like the first integrity breach of the programme. It was not. The entire imbalance
sat in a single **draft**:

```sql
select je.entry_number, je.status, je.description, round(sum(l.debit-l.credit),6) as net
from journal_entries je join journal_entry_lines l on l.journal_entry_id = je.id
group by je.id, je.entry_number, je.status, je.description
having round(sum(l.debit-l.credit),6) <> 0;
--  (blank) | draft | ZZTEST unbalanced probe 2 | 7.000000
```

Split by status:

| status | entries | net |
|---|---|---|
| draft | 2 | 7.000000 |
| posted | 121 | **0.000000** |

The posted ledger was never out of balance. But the gate as written cannot tell those two
situations apart, which means it produces a **false alarm** whenever any unbalanced draft exists,
and — more seriously — it would produce a **false all-clear** if a draft imbalance happened to
offset a real posted imbalance.

**The correct gate**, matching the status set the trial balance and reconciliation services
already use (`BALANCE_AFFECTING_JE_STATUSES` = posted + reversed):

```sql
SELECT round(sum(l.debit - l.credit), 6)
FROM journal_entry_lines l
JOIN journal_entries je ON je.id = l.journal_entry_id
WHERE je.status IN ('posted', 'reversed');   -- MUST be 0.000000
```

Both should be run: the status-blind one is still useful as a tripwire, but it must be
*interpreted* by splitting on status rather than treated as a pass/fail.

**Separate, and left to the journals area agent to rule on:** the system accepted and persisted a
deliberately **unbalanced draft** at all. Whether a draft may be unbalanced in flight is a real
design question (many ledgers allow it; the founder's standard is that a draft must EARN its
place), and it is recorded here only as context for the numbers above.

---

## ACC-INFRA-004 — PERF-002's original framing appears to be wrong — SUSPECTED, under investigation

**Rank: (pending)**

PERF-002 has stood open across several phases as a "~3s browser-vs-curl gap ABOVE the API, in the
Next/client layer", with the 27 GB `.next` cache as the leading suspect. My measurements point
somewhere else entirely.

| what | warm timings |
|---|---|
| Next.js page HTML shell, `/en/accounting/trial-balance` | 0.010s, 0.011s, 0.010s, 0.008s |
| `GET /api/v1/health` (does NOT touch a tenant DB) | 0.33s, 0.43s, 0.52s, 0.35s |
| `GET /tenant/accounts?limit=1` | 1.49s, 1.56s, 1.60s, 1.92s |
| `GET /tenant/accounts?limit=50` | 1.39s – 4.10s |
| 3 requests over ONE curl session (HTTP keep-alive) | 1.53s, 2.50s, 1.51s |

Three things follow. The Next layer serves its HTML in **~10ms**, so it is not the bottleneck and
the 27 GB `.next` cache is not implicated in this particular gap. `limit=1` costs the same as
`limit=50`, so it is **not row volume** — it is fixed per-request overhead. And HTTP keep-alive
does not help, so the cost is **server-side per request**, not TCP/TLS to the API.

That leaves roughly **1.1s of fixed overhead per tenant request above `/health`**, which is
consistent with establishing a fresh Neon serverless (WebSocket) connection per request at
~700-900ms RTT to Singapore.

Caveat, stated honestly: about seven agents were hammering the API concurrently while I measured,
which inflates the absolute numbers. The *differentials* were measured under identical load and
are what the argument rests on.

A dedicated agent is diagnosing this properly (instrumented round-trip accounting, tenant-DB
provider read end to end, and the `--network-family-autoselection-attempt-timeout` Happy Eyeballs
issue). Full write-up will be in `09-perf-002-diagnosis.md`. **The long-term fix must not trade
tenant isolation for speed** — a connection cache that leaked across tenants would be a CRITICAL
security defect, far worse than the latency it removed.

---

## ACC-INFRA-005 — outbox failure handling: hypothesis DISPROVEN, but the queue is a live corroboration channel

**Rank: none (withdrawn) / evidence note**

I found three rows in `accounting_event_outbox` with `status='failed'` and `attempts=3`, while the
dead-letters SCREEN queries `status='dead_letter'` and returns **zero** rows. My hypothesis was
that money-affecting events had failed permanently and were **invisible** in the very UI meant to
surface them.

**That hypothesis is wrong, and I am recording it as disproven rather than filing it.** Reading
`outbox.service.ts` and re-querying:

- `OUTBOX_MAX_ATTEMPTS = 5` (`accounting-events.constants.ts:457`). `markFailed` promotes a row to
  `dead_letter` only at `attempts >= maxAttempts`, so `failed` at 3 is a normal mid-backoff state,
  not a terminal one.
- All three rows had `last_attempt_at` within the last four minutes and a `next_retry_at` in the
  near future. They are actively retrying and WILL land in the dead-letters screen once exhausted.

```
event_type                          | attempts | last_attempt_at | next_retry_at | due_now
document.amended                    | 3        | 02:58:03        | 03:08:03      | false
fx.unrealized_revaluation.reversal  | 3        | 02:55:44        | 03:05:44      | false
accounting.post                     | 3        | 02:58:03        | 03:08:03      | false
```

The retry machinery works as designed. Withdrawn.

### What the queue DID reveal (corroboration for two area agents)

The outbox turned out to be an excellent independent oracle — it captures real posting failures
that a screen would never show you. Three distinct genuine problems are visible in it, and I am
recording them here as **evidence**, leaving the ruling to the agents who own those areas:

**1. `fx.unrealized_revaluation.reversal` — a designed mechanism that cannot execute (live)**
```
Transaction date 2026-09-01 falls in a future period. Future-dating is not allowed.
```
Unrealized FX revaluation is specified to **reverse in the NEXT period**. The journal-posting
guard forbids future-dating. Those two rules are in direct contradiction, so the reverse-next-
period leg appears unable to post at all — it fails, retries, and will dead-letter. If that holds,
the IAS 21 revaluation is once again only half-functional (a prior audit already found this whole
area non-functional once, which is exactly why the addendum warned that the Layer-4 log is a map
of what exists, not proof of correctness). Owned by the FX agent; see
`09-accounting-fx-multicurrency.md`.

**2. `cheque.status.received` — party tag on a non-sub-ledger account (live)**
```
Journal line 2 (account ccc4c4b5-...): this account is not a party sub-ledger,
so the line must not carry a party.
```
The cheque-received JE construction attaches a party to a line whose account is not a party
sub-ledger, so the Layer-3 control=>party guard rejects the whole posting. Note the shape: **the
cheque document itself may well have committed while its GL posting failed** — that is the
highest-value defect class in this module, and the outbox is where it becomes visible. Owned by
the bank/cheques agent; see `09-accounting-bank-cheques.md`.

**3. `document.amended` — pre-existing producer/consumer contract mismatch (from 2026-08-28)**
```
Invalid event payload: expected string, received undefined  (x4)
                       expected date, received Date
                       expected string, received undefined
                       expected array, received undefined
payload: {documentType: "purchase.order", mode: "edit", originalDocumentId, amendedDocumentId,
          amendmentId, correlationId}
```
The Purchase amendment producer emits a short "amendment notification" shape while the consumer
validates against the full accounting-event shape, so it can never validate. This predates this
phase and originates in the Purchase amendment event producer, not in accounting.

Two details worth singling out:
- **`expected date, received Date`** is a textbook instance of defect pattern #9 (type-coercion
  traps). A Zod schema is rejecting an actual JavaScript `Date` object, which means the field is
  declared as a string/ISO date rather than `z.date()`. Same family as the
  `z.coerce.boolean()` truthiness trap and the JS-milliseconds vs Postgres-microseconds cursor bug
  — both of which were CRITICAL. Worth a targeted sweep of event payload schemas.
- This is **an event that has been failing silently for two days** in a module whose own hardening
  log is marked COMPLETE. It reinforces the addendum's warning: Reports was also logged COMPLETE
  and still yielded two money bugs and a CRITICAL pagination defect.

**Recommendation (SUPERSEDED - see correction below):** the outbox `failed`/`dead_letter` state
deserves a visible health signal.

### CORRECTION (2026-08-30, from my own review of an Arabic Trial Balance screenshot)

**My claim that "a bookkeeper has no way to learn that a posting failed until someone queries the
table" was WRONG.** The Trial Balance screen carries a prominent warning banner, in both locales,
reading (in Arabic) `فشل 4 قيود GL ويحتاج إلى مراجعة` - "4 GL entries failed and need review" - with
an actionable drill-through link `عرض القيود الفاشلة` ("view the failed entries").

So failed postings DO surface to the user, and on exactly the screen where a discrepancy would
matter, which is the right place for them. The visible-health-signal gap I recommended closing does
not exist. Withdrawn.

Two genuine but MINOR observations from that same screenshot, for the browser pass to confirm:
- **"GL" is left untranslated inside the Arabic banner.** An English accounting abbreviation is
  meaningless to an Arabic reader; it should be دفتر الأستاذ العام. This is the "no jargon" standard
  applied to i18n.
- **The date field's `يوم / شهر / سنة` placeholder appears to collide with the calendar icon** at the
  field's leading edge under RTL - a possible logical-property bug in the date input.

---

## ACC-INFRA-006 — the last em dash in the web app rendered into a PRINTED receipt preview — CONFIRMED, FIXED

**Rank: MEDIUM** (founder-standard violation, in the print module, and a live instance of the exact
regression class that RPT-052 was created to end)

Sweeping the tenant data for em dashes turned up 624 journal lines and 5 account names carrying
one. The account names were ACC-INFRA-001 above. The journal lines split into two classes, and
**both turned out to be historical, not live** — I checked the producers and they already emit a
colon (`"Purchase return: clearing (inventory relief handed to engine)"` in
`journal-entries/descriptions/purchase-line-text.ts`), so nothing is generating new ones. Recorded
as verified-clean rather than filed.

The live one was in the frontend. A sweep of `apps/web/messages` found exactly one em dash in each
locale:

```
en/settings.json:762:      "noValue": "—",
ar/settings.json:762:      "noValue": "—",
```

Following it to its use site, it is the placeholder for absent fields in the **POS receipt print
preview** (`features/pos/components/settings/register-settings-tab.tsx` -> `buildPreviewReceipt`,
filling `cashierId`, `customerId` and the org name). So the banned character was being rendered
into a printed-document preview — the module the founder singled out as most important.

### Why this is the RPT-052 class, not a typo

A canonical primitive for exactly this already exists, and its doc comment is worth quoting because
it predicted this recurrence:

```ts
// packages/shared/src/format/empty-value.ts
/**
 * NEVER the em dash "—" — banned in all product copy per house style. This
 * placeholder existed as multiple independent, drifting copies before this
 * file: `features/dashboard/lib/constants.ts` had a private `EM_DASH`
 * constant, `src/components/kpi-strip.tsx` hardcoded its own literal, and the
 * purchase feature had 15+ hardcoded "—" literals ... That is exactly how the
 * em dash regressed after being fixed once already (on the dashboard) — fix it
 * here, once, and import this everywhere instead of typing a placeholder character.
 */
export const EMPTY_VALUE_PLACEHOLDER = "-";
```

The POS settings screen was a surviving hand-copy that bypassed the primitive, and it hid better
than the others because it lived in a **translation file** rather than in code — so a grep of
`src/` for `"—"` would never have found it.

### The fix (at the primitive, not at the string)

Editing the two JSON values would have removed the character while leaving the drift mechanism
intact. Instead I removed the ability to drift:

1. `register-settings-tab.tsx` now imports `EMPTY_VALUE_PLACEHOLDER` from `@zerupt/shared` and
   passes it directly, matching the convention already used in `customers/print/`,
   `receipt-detail-panel.tsx` and `customers-list-panel.tsx`.
2. The `preview.noValue` key was **deleted from both `en/` and `ar/`**. A placeholder glyph is not
   translatable content, and holding it in the message catalogue is precisely what let it drift
   away from the primitive and escape every code-level sweep.

Verified:
```
pnpm --filter @zerupt/web i18n:check  -> "Translation check passed. All locales are in sync."
pnpm --filter @zerupt/web typecheck   -> 0 errors
grep -ro "—" apps/web/messages/en apps/web/messages/ar | wc -l  -> 0
```

**Generalisable lesson for the programme:** a banned string can hide in a translation catalogue
where no code sweep will find it. Any future em-dash (or banned-copy) audit must sweep
`apps/web/messages/**` and the tenant DATABASE, not just `src/**`. Between this finding and
ACC-INFRA-001, both of the surviving em dashes were outside source code entirely — one in the
message catalogue, one materialised into tenant rows at provisioning time.

---

## ACC-INFRA-007 — a snapshot test whose NAME now contradicts its own snapshot — CONFIRMED

**Rank: LOW** (test-integrity, not a money bug — but it is the exact shape the programme warns about)

Reviewing the uncommitted tree for modified snapshots (this programme's rule: *never* bulk-
regenerate a snapshot, classify every changed line first), one had been updated:

`apps/api/src/accounting-events/helpers/__snapshots__/build-pos-transaction-post.spec.ts.snap`

**The change itself is legitimate and I am not asking for it to be reverted.** It adds
`descriptionAlt` Arabic text to each JE line (`"دفعة: نقداً"`, `"خصم مبيعات"`, `"إيرادات مبيعات"`,
`"ضريبة محصلة"`), which is the bilingual-JE-description work from an earlier phase. I classified
every changed line: **every monetary field is byte-identical** — `debitTC` 50.000 / 44.500,
`creditTC` 100.000 / 4.500, `taxAmountTC` 4.500, `taxableAmountTC` 90.000, and the party, tax-code
and source-document fields are unchanged. Nothing about money moved.

The defect is that the test is *named*:

```
"8. an unmapped-everything payload is byte-identical to the pre-change shape"
```

and its snapshot is now, by construction, **not** byte-identical to the pre-change shape. The test
was written as a frozen-shape regression guard for a specific earlier change; a later, unrelated
feature legitimately altered the shape, the snapshot was updated, and the guard silently became a
tautology that re-freezes whatever the current output happens to be.

This is the "tests can demand defects" class in its quieter form. It is not a test that
**pins outdated behaviour** — it is a test whose stated intent no longer matches what it checks, so
a future reader trusts a guarantee that is no longer being made. The programme has already found a
tenant-scope assertion whose helper could not recurse into arrays (so it could never fail) and three
tests passing for the wrong reason; this is the same family.

**Recommendation:** rename the test to describe what it actually guards now (the full expected
payload shape for an unmapped-everything POS transaction), or, better, replace the opaque
whole-blob snapshot with explicit assertions on the fields that matter — the monetary ones. A
snapshot over a JSON blob cannot express *which* parts are load-bearing, which is precisely why it
degraded into a rubber stamp when the shape moved for an unrelated reason. Snapshots are evidence,
never a rubber stamp.

Not fixed here: it belongs to the POS/bilingual work, not to Accounting, and changing a test's
meaning mid-phase while nine agents are writing to this tree would be reckless.

---

## ACC-INFRA-008 — the `.next` cache lead was REAL, but it is a different bug from PERF-002 — CONFIRMED, FIXED

**Rank: HIGH (developer-environment, not shipped product)**

PERF-002 has been framed for several phases as one thing. It is actually **two independent
problems**, and conflating them is why it stayed open:

**Problem 1 — the API half. ROOT CAUSE FOUND AND FIXED (see `09-perf-002-diagnosis.md`).** Not the
Next layer, not the cache, and not per-request connection setup (my hypothesis, disproven: a cold
Neon connect costs 2.5s, more than an entire request, and the pool logs cache hits). The real cause
was `BranchAccessResolver.isOwner` and `PermissionGuard.hasPermission` both calling an unmemoized
`loadActiveRoles`, so **the identical RBAC query ran twice on every tenant request** — roughly half
of all latency, on every screen in the product.

**Problem 2 — the browser half. This entry.** The `.next` cache was the "strongest lead yet" carried
into this phase, and it turned out to be real, just not the cause of Problem 1.

### Evidence

The cache grew from **27 GB at the start of this session to 32 GB** partway through (during Reports
it reached 38 GB and made the dev server unservable — the same failure recurring). The dev server
then stopped answering entirely: `curl http://localhost:3000/en/login` timed out at 20s, then 30s,
while the API on 3001 answered normally throughout, proving the problem was Next-specific and not
machine-wide load.

The dev server log is unambiguous:

```
GET /en/login 200 in 10.2min (next.js: 7.9min, proxy.ts: 102ms, generate-params: 13ms,
                              application-code: 2.2min)
GET /en/login 200 in  4.7min (next.js: 86s,   proxy.ts: 1620ms, generate-params: 43ms,
                              application-code: 3.3min)
✓ Finished writing to filesystem cache in 4.5min
✓ Finished writing to filesystem cache in 5.2min
✓ Finished filesystem cache database compaction in 11.4s
```

**Minutes, not milliseconds, spent writing to and compacting a 32 GB filesystem cache** — per
request. Note `proxy.ts` at 102ms and `generate-params` at 13ms: the application's own middleware
and routing are fast. The cost is entirely Next's own cache machinery collapsing under its size.

This is what the "~3s browser-vs-curl gap" was always pointing at. It was never a defect in the
product's client layer.

### Action taken

Stopped the dev server, deleted `apps/web/.next` (32 GB, a pure build cache that Next regenerates),
and restarted it under tmux — the repo's hook requires dev servers to run in tmux for log access,
which is a good rule and is why the log above was available at all. Nothing outside `.next` was
touched. The first request afterwards is a full cold compile and is expected to be slow.

### Why this matters beyond one dev machine

- **It is not a product bug and must not be filed as one.** No customer runs `next dev`. Any
  performance finding raised from browser timings during this programme needs re-checking against
  this: several may have been measuring cache pathology, not the product. That is exactly why the
  briefing rule "state the layer and the network baseline for any performance claim" exists.
- **It repeatedly corrupted the testing programme itself.** It made the dev server unservable during
  Reports, and this session it blocked the live browser/RTL pass for at least four separate agents
  (TB/GL, CoA screens, journals, and print — all four independently reported the browser
  unusable). The print agent deleted its blank screenshots rather than leave misleading evidence,
  which was the right call.
- **Recommendation:** treat `.next` size as a monitored dev-environment invariant. A cheap
  pre-flight check (`du -sh apps/web/.next`, warn past a few GB) would have saved two phases of
  confusion. The cache should be cleared between long agent-driven sessions as routine hygiene, not
  diagnosed from scratch each time.

### Related environment cleanup performed at the same time

System load average had climbed to **28.7**. Alongside the wedged dev server there were **17
orphaned gstack `browse` processes** (7 daemon servers, 6 headless Chromium shells, 2 terminal
agents) leaked by agents whose sessions had ended. These were killed. They are test tooling, not
the application, the API, or any user process. This is the mechanism behind the "shared browser
daemon kept being killed" complaint reported independently by four agents: they were not killing
each other so much as contending with a growing pile of abandoned daemons.

---

## ACC-INFRA-009 — the em-dash ban is now ENFORCED by two guards, and I proved one of them fails

**Rank: (process fix) — closes the recurrence mechanism behind ACC-INFRA-001, ACC-INFRA-006 and
ACC-PER-005**

The em-dash ban had been "fixed" at least five times and kept returning, because every fix patched
call sites instead of installing a guard. This phase alone it surfaced in three places no previous
sweep could reach: materialised into tenant DB rows at provisioning, hidden in the web message
catalogue, and in ~14 server-thrown error strings.

Two complementary guards now exist, deliberately split **one per file type, with no third
mechanism**:

1. **ESLint** (`packages/eslint-config/em-dash.js`, wired into both `apps/api/eslint.config.mjs` and
   `apps/web/eslint.config.js`). Bans U+2014 EM DASH and U+2015 HORIZONTAL BAR — but explicitly NOT
   U+2013 EN DASH, which is a legitimate range separator ("Jan–Mar"). It fires only where a string
   is provably on its way to a human: every argument of a thrown `*Exception`/`*Error` constructor
   (in this API the exception message IS the copy the merchant reads), object properties whose KEY
   names a user-visible slot (`message`, `question`, `hint`, `label`, `noValue`, ...), and JSX text
   plus rendered/assistive attributes.

2. **`apps/web/scripts/check-translations.ts`** (Phase 0b) for the JSON message catalogue, which
   ESLint does not lint. **This closes the exact hole the last em dash hid in** — ACC-INFRA-006 was
   invisible to every `src/` grep because it lived in `messages/en|ar/settings.json`.

### The scoping defence is the important part

The rule deliberately does NOT cover code comments, logger calls, regex literals, or test fixtures,
and the file argues why in writing. The comment case is the load-bearing one: roughly 400 of the
~550 em dashes in `apps/api/src` are prose in doc comments explaining engineering decisions, read by
developers and never by merchants. Banning those *"would produce hundreds of failures on day one and
the rule would be switched off within a week, which is strictly worse than no rule."* That is
correct judgement — a guard's value is entirely in whether it survives contact with a working team.
Regex literals (`/^[-–—]$/` in the numeric normalizer) exist precisely to PARSE dashes out of
customer spreadsheets and are excluded by construction.

The violation message is genuinely useful rather than scolding: it explains WHY (renders badly in
Arabic/RTL and on thermal receipts, and is not how a shop owner writes), points at the canonical
precedent (`packages/shared/src/format/empty-value.ts`), and documents a one-line escape hatch for
a real non-copy need.

### I proved the catalogue gate can actually fail

A guard nobody has watched fail is not a guard — this programme has already found a tenant-scope
assertion whose helper could not recurse into arrays, so it could never fail. So I tested it myself
rather than trusting the report. Injected a probe key into `apps/web/messages/en/accounting.json`
containing an em dash:

```
[en/accounting] EM DASH in copy (house rule: no em dashes in product copy or UI strings
 - use a plain hyphen, a comma, or two sentences): __zztest_guard_probe
```

Restored the file, re-ran: `Translation check passed. All locales are in sync.` **Red, then green.
Confirmed failable.** The ESLint half is verified separately.

**LOW nit:** the guard's own violation message contains an em dash. It is developer console output
rather than product copy, so it is consistent with the logger exclusion — but a rule that breaches
its own rule in its error text undermines itself and should use a hyphen.

---

## ACC-FX-006 — a rate entered as "closing" is invisible to documents, with no explanation — CONFIRMED (LOW, UX)

**Rank: LOW** (UX clarity, not a correctness or money defect)

**This entry also records a finding I initially OVER-CALLED and then corrected**, which is worth
preserving as much as the finding itself.

While answering a founder question about how rates are configured, I tested the lookup live:

```
GET /tenant/exchange-rates/lookup?baseCurrency=AED&quoteCurrency=KWD&date=2026-08-30
-> 404 "No exchange rate found for AED/KWD on 2026-08-30 or any prior date (type: spot)"
```

...even though the tenant demonstrably HAS AED/KWD rates. My first reading was that users enter
rates in Settings and documents then cannot see them, which would have been a serious usability
defect.

**That reading was wrong, and I corrected it before reporting it as such.** Checking the create
dialog rather than inferring from the failure:

- `exchange-rate-dialog.tsx:144` defaults new rates to `rateType: "spot"`.
- The document-side lookup ALSO defaults to `spot` (`exchange-rates-api.ts:71`).
- The user can choose the type from `RATE_TYPES`, and `rateDate <= today` is enforced unless the
  type is `contract` (so only contract rates may be future-dated — sensible).

**The defaults align.** The 404 occurred only because the two rates in this tenant were created as
`closing` by this programme's own FX-revaluation test agent. A normal user entering a rate gets
`spot`, and a transactional form finds it.

### The residual, narrower finding

If a tenant happens to hold ONLY `closing` rates for a pair/date, every transactional form silently
shows an empty rate field, and the user is told nothing about why the rates they just entered had
no effect.

**Recommendation: do NOT make spot fall back to closing.** They are different rates for different
purposes (a period-end closing rate is not the rate you transacted at), and silently substituting
one for the other is precisely the quiet wrongness the codebase-wide "FX fails loud, never silently
defaults" rule exists to prevent. The right fix is a clear message on the FORM: "You have a closing
rate for AED/KWD on this date but no spot rate. Enter a rate, or add a spot rate in Settings."
That keeps the failure loud while making it actionable, which is the founder standard: error copy
says what to DO, not what broke internally.

### How rates are scoped (documented here because it was not written down anywhere)

`exchange_rates` is keyed by `(tenantId, baseCurrency, quoteCurrency, rateDate, rateType)`. There is
**no `branchId` and no `legalEntityId` on the row at all.** Rates are TENANT-WIDE.

That is the correct model and should not be changed: an exchange rate is a property of a currency
pair on a date, not of a shop. What varies per branch is the FUNCTIONAL CURRENCY, inherited from the
branch's legal entity; the rate is then resolved for that pair. Two branches booking a USD purchase
on the same day must use the same rate, or nothing reconciles.

Rates are also immutable-by-date: you do not edit a rate, you add a new dated one. Historical
documents keep the rate they were booked at, which is what an audit requires.

**Method note:** I reported this to the founder as a probable serious gap and corrected myself
within the same exchange once I checked the create dialog instead of inferring from the failing
lookup. The lesson is the programme's own rule restated: a failing call tells you two things
disagree, never which one is wrong.

---

## ACC-FX-007 — a single global rate feed is the WRONG ARCHITECTURE for a MENA-first product — CONFIRMED

**Rank: HIGH (product architecture, latent until multi-currency ships)**

**This entry corrects advice I gave the founder earlier in this session.** I recommended switching
the broken `exchangerate.host` provider to Frankfurter (ECB), noting only that "ECB does not publish
KWD". That understated it badly.

Verified directly against the live API (`https://api.frankfurter.dev/v1/currencies`, 30 currencies):

| Group | Coverage |
|---|---|
| **GCC: KWD, AED, SAR, QAR, OMR, BHD** | **ALL ABSENT** |
| India + SEA: INR, MYR, IDR, THB, PHP, SGD | all present (VND absent) |
| Supplier currencies: USD, EUR, JPY, CNY, KRW, GBP | all present |

So ECB is **useless for the entire primary launch market** and perfectly good for India/SEA.

### Why the fix is not "pick a different feed"

A single global feed cannot be correct for these markets, because the three currency groups need
three genuinely different treatments:

1. **Hard-pegged Gulf currencies (AED 3.6725, SAR 3.75, QAR, OMR, BHD).** These are FIXED by their
   central banks. A **peg constant is MORE accurate than any market feed** — pulling a market rate
   would inject meaningless daily noise into books that should show a fixed rate, and would produce
   phantom FX gains and losses on balances that never actually moved. This is the opposite of the
   usual instinct that "live data is better data".
2. **KWD.** Pegged to an undisclosed currency BASKET, not to USD, and periodically adjusted by the
   Central Bank of Kuwait. It genuinely needs a live source, and CBK publishes daily rates.
3. **INR / MYR / IDR / THB / PHP.** Genuinely floating; ECB serves them well.

### The scalable design

Resolution must be **per currency pair**, not per tenant. The seam already half exists: `currency_policies`
carries a `provider` column and `ExchangeRateFetchService` throws `UnsupportedProviderError` for an
unknown one. What is missing is the idea that DIFFERENT PAIRS RESOLVE DIFFERENTLY:

- a **peg table** (pair -> fixed rate, with the pegging authority and effective date recorded) for the
  hard-pegged currencies, which also makes the peg auditable and updatable if a central bank ever
  re-pegs;
- a **CBK source** for KWD;
- **ECB/Frankfurter** for the floating majors and India/SEA;
- and the existing fail-loud path for anything unresolvable.

### What is already correct and must be preserved

The fail-loud behaviour is right and tested: a KWD request now raises `UnsupportedCurrencyError` in
BOTH base and quote position, with **zero network calls and zero rows stored**. It refuses honestly
rather than silently defaulting — which is the whole point of the codebase-wide "FX fails loud,
never silently defaults" rule. **Do not "fix" the GCC gap by falling back to a default or an inverse
guess.**

### Method note

I gave a confident recommendation from partial evidence (I had tested only KWD) and it was
materially wrong for five more currencies covering the entire launch region. The agent that
implemented it tested the whole currency list and escalated. Recorded here because the correction is
more useful than the original advice: **when validating a provider against "the worst-case country",
enumerate the actual market list rather than spot-checking one currency.**
