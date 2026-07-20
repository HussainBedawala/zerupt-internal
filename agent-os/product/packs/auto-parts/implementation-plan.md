# Auto-Parts Pack — Implementation Plan (layer-by-layer)

> Companion to `architecture.md` (the authoritative spec). This is the executable plan:
> milestones → layers → tasks, with the architecture-review fixes baked in.
> Status: awaiting Hussain go-ahead on M0. Last updated 2026-07-20.
> Resume marker: `_build-log.md` (created at M0 start), mirrors the hardening-log pattern.

## 0. Verified ground truth (from seam audit — cite these, don't re-discover)

| Seam | Reality | Consequence for plan |
|---|---|---|
| Entitlement grain | `MODULE_SLUGS = [settings,accounting,inventory,pos,sales,purchase,reports]`; `hasModule(planModules, slug)` fail-closed; 15s `PLAN_CACHE` keyed by tenantId (guard.ts:54,205) | pack = a new module slug `auto_parts`; grant flows through the SAME guard |
| Two merge sites | `EntitlementGuard.fetchTenantPlan` (guard.ts:205) AND `BillingService.getSubscription` (billing.service.ts:89) both read `plan.modules` independently | **must not** merge in two places — one shared resolver (fix #2) |
| Frontend gating | `use-tenant-capabilities.ts` → `Set<string>` of truthy modules; `settings-sections.ts` `requiresModule?: ModuleSlug` (line 65, gate 227) | typed union — widen `ModuleSlug` before nav can declare `auto_parts` |
| Items create | `ItemsService.create(tenantId, input)` (items.service.ts:606), **exported** from `inventory.module.ts:145` (POS already consumes) | pack calls `ItemsService.create`, never re-implements item write |
| Item columns | `partNumber`, free-text `brand`, `categoryId`, `sellingPrice` all present on `inventory_items` | core untouched; `part_details` extends 1:1 |
| Pricing authority | `PriceResolutionService.resolve()/resolveMany()` (price-resolution.service.ts) is SoT; falls back to `sellingPrice` | finder calls PriceResolutionService, never reads sellingPrice directly |
| Stock | `materializedStockLevels` (inventory-costing.ts:455) unique `(itemId,warehouseId)`, **no branchId** | branch = join `msl.warehouseId → warehouses.branchId` always |
| Provisioning idempotency | `seed-config.step.ts` = insert-first `onConflictDoNothing`/`onConflictDoUpdate` (not check-then-insert) | `PackInstallerService` mirrors exactly |
| COA | `auto_parts` already in `IndustryType` + `INDUSTRY_VARIANTS` (coa-template.ts:40,67) | reuse overlay; no new accounting logic |
| Admin schema | plain pg-core, varchar+CHECK (anti-enum), export via `index.ts`, own drizzle.config | `tenant_packs` = new file + index export + generate |
| pg_trgm | absent everywhere | green-field; add via fleet migration (fix #7 caveats) |
| Green-field | no `/auto-parts` route, no `packs/` framework | build clean |

## 1. Cross-cutting guarantees (apply to EVERY milestone — the review's "ponytail + dynamic + brand + locale + config" mandate)

- **Ponytail / lazy-first:** reuse `ItemsService`, `PriceResolutionService`, `resolvePackUnit`, `item_categories`, `item_barcodes`, `materializedStockLevels`, `price_lists`, COA overlay, `seed-config.step` pattern. No parallel taxonomy, no hand-rolled money/qty/pickers. Every reuse cited in the task. Mark deliberate deferrals `// ponytail:`.
- **Dynamic, never hardcoded:** grades, brands, families, vehicles, taxonomy = tenant data/lookups. No hardcoded enum for grade. No hardcoded English/Arabic — primary/secondary from the supported-languages registry.
- **Brand-agnostic:** zero `tenant.brand` branches anywhere. Print/email templates (M5) inherit brand from `brand/` config. Test asserts identical behavior for a Zerupt vs Merpec tenant.
- **Locale-aware:** every entity carries `name`/`nameAlt` (or `label`/`labelAlt`); search matches BOTH columns; list ORDER BY uses locale-aware collation; display + sort locale resolved from tenant language registry, never hardcoded `en` (fix #9).
- **Config / entitlement:** every pack controller `@RequiresModule("auto_parts")`; fail-CLOSED on any resolution error.
- **Money/tenant/auth non-negotiables:** every query tenant-scoped via Drizzle builder (no hand-assembled SQL; avoid the `= ANY(${jsArray})` tuple footgun); 100% coverage on money + entitlement paths; immutable audit log on every pack mutation (esp. family merge).
- **Defensive UX:** loading/error/empty/success on every screen; the finder NEVER auto-picks on an ambiguous normalized match — it shows the disambiguation list (fix #4).

## 2. Milestones (each independently shippable; typecheck + `pnpm --filter @zerupt/api test` green before each commit)

### M0 — Pack framework spine  *(reusable by every future pack)*
Layers: **admin-schema → entitlement → framework → activation-endpoint → slug-wiring → tests**
1. **admin-schema:** `packages/db-admin/src/schema/tenant-packs.ts` — `(id, tenantId, packKey, status[active|suspended] varchar+CHECK, version, activatedAt, seedCompletedAt nullable)`. Export in `index.ts`; `drizzle-kit generate` from `db-admin`. `seedCompletedAt` supports the reconciliation query (fix #1).
2. **entitlement (fix #2 + #3):** add ONE resolver `EntitlementService.resolveEnabledModules(tenantId)` = plan.modules ∪ active `tenant_packs` grants (via pack→modules manifest). Fold the pack grant into the cached `TenantPlanFacts` so it stays a single admin round-trip; pack-query error THROWS → fail-closed (never default-grant). Guard AND billing endpoint both call this resolver — no second merge site.
3. **framework:** `packages/shared/src/packs/` manifest+registry (pure data: `{key, modules, coaIndustry, seeds, defaults}`). `apps/api/src/packs/` = registry + `PackInstallerService` + founder endpoint.
4. **activation (fix #1 — SAFE ORDER):** `install(tenantId, packKey)` = (a) seed tenant DB grades+taxonomy idempotently, (b) apply COA overlay `onConflictDoNothing` (fix #10), (c) set `tenant_identity.industry` if unset, **(d) LAST: flip admin `tenant_packs` active + stamp `seedCompletedAt`.** Re-runnable; entitlement flip is the final all-or-nothing commit.
5. **endpoint:** founder-only `POST /admin/tenants/:id/packs/:packKey:activate`.
6. **slug-wiring (6 gates):** `MODULE_SLUGS`+`ModuleSlug` (add `auto_parts`), plan/pack seed, `@RequiresModule` (M2+ controllers), merged subscription map (via resolver), `use-tenant-capabilities.ts`, `settings-sections.ts` nav. Grep the extra web consumers the review flagged (`section-gate.tsx`, `plan-params.ts`, `reports-index-grid.tsx`) for hardcoded module lists.
7. **tests (100%):** guard-vs-subscription agreement for a pack-only tenant (plan denies, pack grants); fail-closed on pack-query error; installer idempotency + partial-failure (seed ok / flip fails → not entitled, re-run completes).

### M1 — Data model  *(foundation)*
Layers: **schema → extension (pg_trgm) → indexes → installer-seeds → fleet-migration**
1. `packages/db/src/schema/auto-parts.ts`: `part_brands`, `part_families`, `part_details` (1:1 itemId PK/FK), `part_identifiers` (+`normalizedValue`), `part_grades`, `vehicle_makes`, `vehicles`, `fitments`. **fitments carries BOTH `familyId` and nullable `itemId`** (fix #5 — item-level override modeled now, UI in M4). All tenant-scoped, `name`/`nameAlt`.
2. `pg_trgm` fleet migration — **first confirm installable on the Neon tenant role fleet-wide** (per-cell secret path allows `CREATE EXTENSION`) before generating (fix #7).
3. Indexes: partial-unique `(tenantId, itemId, type, normalizedValue)` on identifiers (dedup per item, NOT global-unique — fix #4); btree+GIN trigram on `normalizedValue` AND on `inventory_items.name`+`nameAlt`; use `CREATE INDEX CONCURRENTLY` where the migrator supports it (fix #7).
4. Installer seeds: default `part_grades` (genuine/wakala/aftermarket/used, ar+en labels, tenant-editable) + auto-parts `item_categories` taxonomy.
5. Uniform fleet migration — empty for non-auto-parts tenants; verify migrate-all gate stays green and surfaces per-tenant failure (fix #7).

### M2 — Add-a-part  *(parts get entered)*
Layers: **service (tx) → normalization → controller/DTO → web form**
- Pack item-create in ONE transaction: `ItemsService.create` → `part_details` → `part_identifiers` → family (auto-singleton if none) → optional item/family fitment.
- Code normalization helper (uppercase alnum-only) shared by write + search.
- Brand/family/grade pickers (reuse shared entity-picker primitives); repeatable alternate-code + fitment rows; ar+en; defensive UX states.
- **BINDING REUSE CONTRACT (from M1 review — Option B, core `item_alternate_codes` stays untouched):** M2 is the SOLE writer of auto-parts cross-reference codes and writes to `part_identifiers` ONLY — never dual-write to core `item_alternate_codes`. This is the anti-split-brain rule. (Readers union both tables — see M3 + scanner below.)

### M3 — Universal Part Finder  *(GO-LIVE GATE)*
Layers: **search-service → API → `<PartFinder/>` → embeds**
- `GET /auto-parts/search?q=&branchId=` via **Drizzle builder, every leg tenant-scoped, bound params only** (fix #8). Match sku/partNumber/name+nameAlt (trigram) + identifiers.normalizedValue + item_barcodes + family code + brand (both locales). Ranked exact>alternate>family>fuzzy, disambiguated by `type` (fix #4).
- Returns per hit: brand, grade, per-branch stock (join through warehouses), price via `PriceResolutionService`, shelf, fitment summary (labeled family-inherited vs item-verified — fix #5), in-stock family equivalents.
- **Ambiguous normalized match → disambiguation list, never auto-pick.** Decide cross-branch stock visibility by module persona (fix #8).
- Shared `<PartFinder/>` embedded in POS add-line, sales order, quotation, purchase, stock inquiry, inventory.
- **Code-resolution reads UNION both `part_identifiers` AND core `item_alternate_codes`** (tenant-scoped), so a code entered anywhere is never missed (defensive, no split-brain). Build this as a shared resolver.
- **Cross-module (CORRECTED target):** the real POS/scan code ladder is `ItemsService.lookupByBarcode` (items.service.ts:454+: scale → item_barcodes → SKU → item_alternate_codes), NOT the Sami invoice scanner. Add a `part_identifiers` rung to that ladder. KEY: `part_identifiers` is empty for non-pack tenants, so the rung is **always-on with NO entitlement check** (empty indexed lookup, zero admin round-trip on the hot scan path) — simpler and correct. Tenant-scoped.

### M4 — Fitment lookup  *(richer counter lookup)*
- Vehicle picker (make→model→year→engine); "what fits this car"; family-level fitment mgmt + **item-level override UI** (schema already there from M1).
- Family **merge/move** operation (fix #6): `mergeFamilies`/`moveToFamily` in one tx — re-point + dedup fitments, garbage-collect empty singletons, immutable audit, explicit union-vs-drop fitment decision.

### M5 — Reports + print  *(owner insight)*
- Fast/slow/dead-stock, sales by brand/group, fitment coverage (reuse reports layer patterns).
- Counter-invoice + quotation print (GCC) — **brand-driven from `brand/` config**, never hardcoded (fix #11).

### M6 — Activation UX + import  *(scale onboarding)*
- Onboarding "Auto Parts" industry auto-activates pack (calls installer).
- Founder admin activation UI over the M0 endpoint.
- Parts import mapping — hook `inventory-template-context.service.ts` by industry; AI-first field resolution (per import mandate).

## 3. Open questions surfaced by review (decide as they arrive, mostly M3/M4 — none block M0)
- Supersession chain depth (transitive old→new→newer resolution) — decide at M2/M3 (fix #13).
- Cross-branch stock visibility per persona — decide at M3 (fix #8).
- Family-merge: fitment union vs drop — decide at M4 (fix #6).
- Set/pair UoM via `resolvePackUnit` — confirm at M2 (fix #13).
- Core-charge/exchange liability — deferred; ensure ledger doesn't preclude (fix #13).

## 4. Delegation & review policy
- Implementation subagents get the lazy-first ladder + reuse targets pasted in (they don't inherit CLAUDE.md). Model: Sonnet standard; Opus only for the entitlement-merge/activation-ordering correctness (M0) and any money path.
- Reviewers stay paranoid (no lazy framing): `code-reviewer` always; `nestjs-reviewer`+`api-reviewer` (backend), `database-reviewer`+`neon-postgres` (migrations), `security-reviewer` (entitlement/search), `accounting-reviewer` (COA overlay), `frontend-reviewer` (finder/forms).
- Commit per milestone, conventional lowercase, body <100 chars, to `erp/` repo. Log SHA in `_build-log.md`.
