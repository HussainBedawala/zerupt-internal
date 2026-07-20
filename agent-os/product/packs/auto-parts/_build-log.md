# Auto-Parts Pack — Build Log (resume marker)

> Mirrors the hardening-log pattern. One row per milestone/layer as it lands, with SHA.
> Plan: `implementation-plan.md`. Spec: `architecture.md`.

## Status
- **2026-07-20** — Plan approved by Hussain. Proceeding autonomously from M0.
  Model policy: Opus for M0 entitlement-resolver + activation-ordering + their tests; Sonnet elsewhere.

## M0 — Pack framework spine  (built + 2 review layers; fix in flight)
- [x] admin-schema: `tenant_packs` table (mig 0035_overjoyed_goblin_queen)
- [x] shared: `packs/` manifest/registry (moduleSlugsForPackKeys, resolvePack, isPackKey)
- [x] entitlement: `resolveTenantEntitlement` single OR source (guard + billing both call; cached 15s; fail-closed) + pure `mergePackModules`
- [x] framework: `apps/api/src/packs/` PackInstallerService (safe order: industry-if-unset → M1 seed seam → COA deferred M6 → flip tenant_packs LAST) + PacksModule
- [x] endpoint: founder-only `POST admin/tenants/:id/packs/:packKey/activate` (@PlatformAdmin + AdminGuard)
- [x] slug-wiring: `auto_parts` in api MODULE_SLUGS + web ModuleSlug (settings-sections.ts)
- [x] tests: 4 suites / 80 tests green (merge, resolver fail-closed, guard, fix-#2 agreement, installer idempotency+order)
- REVIEW L1: security (Opus) + nestjs (Opus). Verdict: 1 CRITICAL (guard blocks @PlatformAdmin routes → activate 403s; also affects existing AdminTenantController), 1 MEDIUM (2nd admin-DB round-trip on hot path), 1 LOW (suspended-pack test). All else SOUND (fail-closed, isolation, cross-DB installer, injection, idempotency).
- FIX DONE: IS_PLATFORM_ADMIN_KEY exemption in EntitlementGuard (+regression spec) + single round-trip via `with:{packs}` relational-where + suspended-pack test. Re-verified: 16 suites / 214 tests green, typecheck green. **M0 CLOSED.**
- Decisions: installer uses `TenantDbResolverService.resolve(tenantId)` (explicit-id, no ALS — verified safe); COA overlay deferred to M6 (v1 posts to standard accounts; onboarding applies overlay at industry pick).
- SHA: _pending (commit at end)_

## M1 — Data model  ✅ CLOSED (built + 2 review layers + fixes)
- [x] `packages/db/src/schema/auto-parts.ts`: 8 tables (mig 0198). part_details 1:1 PK=itemId; fitments familyId + nullable itemId (item-level override).
- [x] pg_trgm fleet + 6 GIN trigram on PACK-OWNED cols only; core inventory_items UNTOUCHED (ponytail upgrade trigger noted). **pg_trgm VERIFIED installable on dev tenant (avail 1.6).**
- [x] partial-unique (tenant,item,type,normalizedValue); NOT global-unique
- [x] seed data (grades ar+en أصلي/وكالة/تجاري/مستعمل, 11-cat starter taxonomy) in `apps/api/src/auto-parts/seed/` + `buildAutoPartsSeed()`
- REVIEW L1 database-reviewer (Opus): no blockers; fixed H1 (fitments partial-unique dedup), vehicleId→restrict, part_details.familyId→restrict (family invariant), empty-string CHECKs, FK-maint indexes → mig 0199.
- REVIEW L2 reuse/i18n/ops (Sonnet): **Option B locked** — part_identifiers stays separate (core untouched); BINDING CONTRACT recorded in plan M2/M3: M2 sole writer→part_identifiers; readers (M3 finder + scanner.service.ts) UNION part_identifiers + core item_alternate_codes. Seed clean.
- Re-verify: both typechecks green, core untouched. **M1 CLOSED.**

## M2 — Add-a-part  ✅ CLOSED (backend+frontend, each 2 review layers + fixes)
- [x] backend: transactional atomic create (ItemsService.createWithTx refactor + SKU pre-resolve; part_details + identifiers + singleton family SGL-<uuid> + fitments in one tx) in `apps/api/src/auto-parts/{parts,brands,families,grades}` + `normalizePartCode`. 14 suites/287 tests.
- [x] backend reviews: nestjs (Opus)+api (Sonnet) → fixed unique-viol→409 + fitment dedup, supplied-vs-generated SKU (writeWithUniqueSku), rollback-modeling test, bounded picker lists.
- [x] frontend: add-part panel (brand/family/grade pickers w/ inline-create, repeatable identifier rows, MoneyInput/QuantityInput, ar+en, defensive UX) + gated nav (declarative NavItem.requiresModule platform ext) + i18n.
- [x] frontend reviews: frontend (Opus)+code (Sonnet) → fixed 2 HIGH data-loss (Enter-submits, dropped draft), submit-gate on inline-create, real server typeahead (SearchableCombobox onSearch), a11y label, error states, batch-entry post-create UX, locale-aware categories, type drift. 5/5 tests, i18n green.
- FOLLOW-UPS (non-blocking, platform-wide): ItemFormPanel shares back-arrow-unsaved-guard + non-locale category gaps; no shared useDebounce hook (each consumer copies).
- SHA: _pending (commit at end)_

## M3 — Universal Part Finder (GO-LIVE GATE)
- [x] backend ✅ CLOSED: `GET /tenant/auto-parts/search` 4-tier ranked (exact code>alt>family>fuzzy name), per-branch stock + price(resolveMany) + family-equivalents + fitment; every leg tenant-scoped + param-safe. Barcode ladder rung 5 (part_identifiers, always-on/empty-for-non-pack).
- [x] backend reviews: security (isolation SOUND) + database (Opus). Fixed: single shared `normalizePartCode` in @zerupt/shared (SQL normalize ELIMINATED — parity root-fix), self-identifiers sku/part_number (indexed exact match), normalizedFamilyCode col+idx, barcode-rung parity, fuzzy≥3 + @Throttle, per-family equivalents, resolveMany itemId-keyed, isolation test strengthened. Mig 0200. 6 suites/169 + 568 shared tests green.
- [x] frontend core ✅ CLOSED: `<PartFinder/>` + standalone page + hook. Reviews: frontend (Opus)+code (Sonnet) → fixed 2 CRITICAL contract-drift (equiv price object, matchedOn.field 8-literal union), hardcoded-KWD→useTenantCurrency, debounce empty-flash, a11y Collapsible, bidi, this-branch-first, fitment sample render. 11/11 tests, i18n+typecheck green.
- [x] embed (essential) ✅: extended shared `ItemsService.search` with always-on `part_identifiers` rung (empty for non-pack) → parts findable by ANY alt/OEM code in EVERY existing picker (POS online/sales/purchase/quotation/adjustments), onPick contract byte-identical, price/tax parity. 122 tests. Mirrors already-reviewed barcode-rung pattern (isolation+regression+dedup tested).
- ENHANCEMENT (tracked, post-go-live): rich in-line equivalents/fitment inside transaction pickers (pack-aware ItemSearchCombobox display) + POS offline-cache alt-code search. Standalone finder delivers full rich UX today.
- **M3 GO-LIVE GATE FUNCTIONALLY COMPLETE.** Checkpoint commit erp **b0e82f66** (M0-M3), docs 73c2645. Full pre-commit passed (lint+turbo typecheck all pkgs). Push held for end.

## M4 — Fitment lookup + family merge/move  (in progress)
- [ ] backend: vehicles/vehicle_makes CRUD; fitments CRUD (attach family/item-level, list, what-fits-vehicle reverse, delete); family merge/move (re-point details+fitments, dedup/union, GC singleton, immutable audit) — fix #6.
- [x] frontend: vehicle cascade picker, vehicles/what-fits/families screens, fitment mgmt (family + item-level override authoring), merge/move behind named confirms.
- [x] reviews: db-integrity (Opus) fixed moveFamily override-loss BLOCKER + FOR UPDATE locks; nestjs fixed double-audit + ParseUUIDPipe + delete-perm; frontend+code fixed fitment vehicle labels, panel-collapse, named confirms. shared use-debounce extracted.
- **M4 CLOSED.** Checkpoint commit erp **8f788593**. Push held for end.

## M6 — Activation UX + import  (in progress — the "how it gets enabled" story)
- [ ] onboarding: industry "Auto Parts" pick auto-activates pack (calls PackInstallerService)
- [ ] founder admin activation UI over M0 endpoint
- [ ] parts import mapping (hook inventory-template-context by industry, AI-first)

## M6 — Activation UX + import
- [x] onboarding: industry auto_parts pick auto-activates pack (OnboardingCompleteService, fail-safe, idempotent). Reviewed (nestjs APPROVE) + fixed. 116 tests.
- [x] founder activation: API endpoint (M0) is the founder path; no admin web shell exists → bespoke admin UI DEFERRED (over-engineering for one button; documented).
- [ ] IMPORT (Wave 4, founder-directed 2026-07-20): industry-driven column PROFILE — for auto_parts the item-import template shows the auto-parts column set (name/unit/category/qty/cost/sell/tax + part-number/brand/family/grade/position/warranty + alt-codes/fitment) and REPLACES the generic columns (drop free-text brand → brand entity; drop weight) — NOT generic+appended. Make it DYNAMIC/SWAPPABLE per industry (build on the shared `resolveItemFormFieldVisibility`/industry seam = one source of truth; adding pharmacy/electronics = add a profile). Seams: `inventory-import/column-visibility.ts` (`resolveColumnVisibility(industry)`), `sheets/items.sheet.ts` (`buildItemsSheet`), `alternate-codes.sheet.ts` pattern (add fitment/part-identifiers sheet); processing via `inventory-import.apply.service.ts` reusing `PartsService.create`. Onboarding + in-app share the engine.

## M5 — Reports + print
- [x] reports backend: parts velocity (fast/slow/dead), sales by brand/category (cost-strip), fitment coverage. Reviewed (db: isolation+cost SOUND; nestjs APPROVE) + fixed (velocity branchId, distinct override count). 3 suites/23.
- [x] reports frontend: registry requiresModule gating + 3 screens (cost cols conditional). 19 tests. [review in flight]
- [ ] DEFERRED FOLLOW-UP: print part-number column on invoice/quotation. Seam ready (verified): `partNumber` exists on inventory_items but NOT on invoice/quotation LINE detail — needs adding to the line projection in the invoice-detail + quotation-detail services (apps/api), then `TaxDocument` gets an optional `showPartNumber?` prop (default false → non-pack invoices byte-identical) wired from `useTenantCapabilities().modules.has("auto_parts")` in `invoice-print-document.tsx`/quotation equivalent + `invoice-to-tax-document.ts`. Deferred: touches the shared money-document template; do it as a focused reviewed change, not at session tail. Counter invoices already print correctly without it.
