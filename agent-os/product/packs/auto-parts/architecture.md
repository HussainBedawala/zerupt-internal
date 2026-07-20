# Industry Packs + Auto-Parts Pack — Architecture

> Status: design (no code yet). Owner: Hussain. Last updated: 2026-07-20.
> North star: **make the shop's life easier.** Every decision below is judged by whether
> counter staff sell faster and the owner loses fewer sales, not by feature count.

**Build the vertical PROPERLY, not for one customer.** This is a product-grade auto-parts capability
that models the industry completely, so we hand a new shop *what it needs* rather than reshaping the
product around one shop's habits. The pilot customer (a GCC auto-parts shop; the requirement came via
Hussain's dad from an existing 5-branch Middle East operator) is validation input, not the spec — no
requirement is customer-specific, and where the dad/customer is unsure (e.g. exact family semantics)
we decide the industry-standard way (see §9–10).

**Brand-agnostic — works for BOTH Zerupt and Merpec.** The pack is a Zerupt-wide vertical capability.
Any tenant, under any brand, that is in the auto-parts business activates it the same way (§6). It is
NOT a Merpec feature; Merpec (Kuwait) simply happens to have the first auto-parts customers. Nothing in
the pack branches on `tenant.brand`.

Auto-parts is the **first industry pack** and it defines the reusable **Industry Pack framework**
(pharmacy, electronics, hardware next). One codebase, never fork. Deps always point DOWN toward
accounting/inventory. Works across GCC, India, SEA by construction (per-tenant data + existing
multi-country COA/tax/currency).

---

## 1. The two tiers of customization (why auto-parts is a PACK, not "custom fields")

- **Tier A — config / custom fields (JSONB, metadata-driven):** scalar ad-hoc attributes a *user*
  invents (shelf note, warranty months). Cheap, AI-writable. **Not built yet, and NOT needed for
  auto-parts v1.** It is the long-tail tool, built later.
- **Tier B — industry pack (real tables + real code + real UI, entitlement-gated):** structural
  domain features that a JSONB bag cannot express. Auto-parts lives here.

**Rule that keeps the build permanent:** *pack-defined* concepts (identifiers, families, fitment,
brands) are **first-class relational tables** — queryable, indexed, searchable. Only *user-invented*
ad-hoc fields go to the Tier-A JSONB engine. Never force auto-parts into a field-bag.

---

## 2. The domain model (industry-standard vocabulary)

Three code levels the customer searches by, on **every screen**:

| Level | Identifies | Cardinality | Purpose |
|---|---|---|---|
| **Item code** (SKU) | one physical part you stock | 1 per part | your stock record |
| **Alternate codes** | other numbers for the **same** item (OEM, brand no, interchange, barcode) | many → 1 item | "what *is* this part?" |
| **Family code** | **different** items that are interchangeable equivalents | 1 family → many items | "what *else* can I sell?" (in-stock substitutes) |

Families beat pairwise cross-references: tag each part with **one** family code; all members are
mutually equivalent. Add a brand later → same family → auto-linked. **Fitment attaches at the
family level** (tag "fits Corolla 2015–19" once; all brands inherit) — big data-entry saving that
de-risks go-live.

Other concepts a real GCC/India/SEA auto-parts shop needs (all first-class):
- **Grade** — genuine/wakala · aftermarket · used · OEM. Gulf customers ask this first. A
  tenant-editable lookup (India/SEA can rename), not a hardcoded enum.
- **Brand / manufacturer** — Bosch, Denso, Wakala. Promoted to an **entity** (filter, report,
  logo), not a free-text string.
- **Part group / taxonomy** — Brakes › Pads. **Reuse the existing `item_categories` tree**; the
  pack seeds an auto-parts taxonomy. No parallel taxonomy.
- **Position/side** (front/rear, L/R), **supersession** (old→new number, a `part_identifiers`
  type), **multiple barcodes** (reuse existing `item_barcodes`), **multiple suppliers + landed
  cost** (import-heavy), **quotations** (exists), **fast/slow/dead-stock** analytics.
- Later/optional: core charge / exchange (reman deposit liability).

---

## 3. Data model (tenant DB) — `packages/db/src/schema/auto-parts.ts`

Extension-table pattern: **core `inventory_items` is NOT modified** (deps point down). Pack tables
FK into it.

- `part_brands` (tenantId, name/nameAlt, logoUrl, isActive) — brand entity.
- `part_families` (tenantId, familyCode, name, description) — the family. Every part belongs to a
  family; a unique part gets an auto-created **singleton family**. Equivalence + fitment key off this.
- `part_details` **1:1 with an item** (itemId PK/FK → inventory_items, brandId FK, familyId FK,
  categoryId reuse, position, gradeId FK, warrantyMonths) — the pack's scalar attributes, off the
  core table.
- `part_identifiers` (tenantId, itemId FK, type[oem|aftermarket|interchange|supplier|supersession],
  value, **normalizedValue**, source) — **alternate codes**. `normalizedValue` = uppercased,
  alnum-only ("04465-02220" == "0446502220"); btree + trigram indexed. Barcodes stay in the
  existing `item_barcodes` table — do not duplicate.
- `part_grades` (tenantId, code, label/labelAlt, order) — seeded defaults, tenant-editable.
- `vehicle_makes` (tenantId, name) + `vehicles` (tenantId, makeId FK, model, yearFrom, yearTo,
  engine, engineCode, trim) — per-tenant fitment targets. Country-appropriate automatically.
- `fitments` (tenantId, **familyId** FK, vehicleId FK, note) — many-to-many at family level.

**Uniform schema:** every tenant DB gets these tables via normal fleet migrations; they sit **empty**
for non-auto-parts tenants (empty tables are free). Preserves the migrate-all-tenants deploy gate —
no per-tenant schema drift. `pg_trgm` added fleet-wide via migration (green-field: no search infra
exists today).

Reuse (never hand-roll): `resolvePackUnit()` for units, `item_categories` for taxonomy,
`item_barcodes` for barcodes, `materialized_stock_levels` for per-warehouse stock, `price_lists` for
tiered pricing, existing sales pricing resolution for price at sale time.

---

## 4. The Universal Part Finder (the signature feature)

Auto-parts is a *lookup* business — the search box IS the product, and it lives on **every** screen
(POS add-line, sales order, quotation, purchase, stock inquiry, inventory), not just inventory.

- API `GET /auto-parts/search?q=&branchId=` — normalizes `q`, matches across `inventory_items.sku`
  / `partNumber` / `name` (trigram fuzzy) + `part_identifiers.normalizedValue` + `item_barcodes` +
  `part_families.familyCode` + `part_brands.name`. Ranked (exact code > alternate > family > fuzzy
  name).
- Returns per hit: brand, grade, **stock per branch** (aggregate warehouses), price/tier, shelf,
  **fitment summary**, and **in-stock family equivalents** ("Bosch out → Denso 3 @ 8 KWD").
- Shared React `<PartFinder/>` embedded in all transaction screens. Default: always show the family
  (exact match on top), so staff upsell/substitute without memorizing equivalents.

---

## 5. The Industry Pack framework (reusable spine)

A **pack** is a versioned, code-defined manifest that composes across every layer (generalizes the
existing COA `base + country + industry` overlay pattern):

```
Pack "auto-parts" = {
  key: "auto-parts",
  modules: ["auto_parts"],          // entitlement slot(s) — code + UI gate
  coaIndustry: "auto_parts",        // existing COA overlay
  seeds: [part_grades defaults, auto-parts item_categories taxonomy],
  defaults: { quotationHeavy, units, numbering },
}
```

- **Manifest/registry:** `packages/shared/src/packs/` (pure data, shared by api + web — mirrors the
  `brand/` config pattern).
- **Domain module (api):** `apps/api/src/auto-parts/` — a normal feature module (parts, brands,
  families, identifiers, vehicles, fitments, search), every controller `@RequiresModule("auto_parts")`.
- **Framework (api):** `apps/api/src/packs/` — registry + `PackInstallerService` + founder
  activation endpoint.
- **Web:** `apps/web/src/app/[locale]/(app)/auto-parts/` + `apps/web/src/features/auto-parts/`
  (`<PartFinder/>`, forms). Nav gated `requiresModule: "auto_parts"`.
- **Terminology:** the pack ships its own screens with part vocabulary natively ("Add Part", "Part
  Finder"). A *global* "product→part" relabel engine is Tier-A, deferred — not needed for v1.

---

## 6. Flagging + activation (entitlement)

Today entitlement is **plan-driven only** (`plans.modules` jsonb). A per-customer plan is the
anti-pattern we reject, and merpec-standard (all-modules) is the wrong grain (not every merpec
tenant is auto-parts). So add a **per-tenant pack layer**:

- **`tenant_packs`** (admin DB): tenantId, packKey, status(active/…), version, activatedAt.
- **Entitlement resolution becomes:** `moduleEnabled = plan.modules[slug] OR activeTenantPacks
  grant slug`. `EntitlementService` merges the two (fail-closed as today).
- **Frontend "just works":** `GET /tenant/billing/subscription` returns the **merged** modules map;
  `use-tenant-capabilities` + `settings-sections` gating already consume it — add the `auto_parts`
  nav section with `requiresModule`.

**Module slug wiring (6 touch-points):** `MODULE_SLUGS` + `ModuleSlug` type
(`entitlement.constants.ts`), plan/pack seed, `@RequiresModule("auto_parts")` on pack controllers,
the subscription endpoint's merged map, `use-tenant-capabilities.ts`, and a nav section in
`settings-sections.ts`.

**Activation = `PackInstallerService.install(tenantId, "auto-parts")`** — idempotent (upsert /
existence-check, mirrors `seed-config.step.ts`):
1. admin: upsert `tenant_packs` active → module now entitled.
2. tenant DB: seed `part_grades` defaults + auto-parts `item_categories` taxonomy; set
   `tenant_identity.industry = "auto_parts"` if unset.
3. COA: `auto_parts` overlay (already wired via onboarding industry; idempotent additionalAccounts
   if activated post-hoc).

Tables always exist (uniform schema), so the installer only seeds DATA + flips entitlement.

**Activation paths:**
- **Onboarding:** picking industry "Auto Parts" (`step1-business-info`) auto-activates the pack.
- **Post-hoc (existing tenant):** founder-only `POST /admin/tenants/:id/packs/auto-parts:activate`.
- **AI-driven:** because activation is pure data/config over pre-built code, an AI can onboard an
  auto-parts tenant on autopilot (set entitlement, seed, write fitment) — it never forks code. This
  is the strategic payoff of the pack model.

---

## 7. Multi-country / multi-branch (works everywhere by construction)

- **Vehicles/fitment** are per-tenant → country-appropriate automatically (no shared catalog to
  license now; each shop owns its data — its asset).
- **Grades** are a tenant-editable lookup → GCC "wakala" vs India/SEA naming.
- **COA/tax/currency** already multi-country (COA country overlays + `markets.ts`).
- **Branches:** stock is per-warehouse (`warehouse.branchId`) in `materialized_stock_levels`; the
  finder shows this-branch + other-branch availability. Pack tables are tenant-global (identifiers,
  families, fitment); stock/price come from core branch-scoped inventory.

---

## 8. Build plan (full permanent build, sequenced to go live without a complete catalog)

| Milestone | Contents | Ships value |
|---|---|---|
| **M0 — Pack spine** | manifest + registry (`shared/packs`), `tenant_packs` (admin), entitlement merge, subscription endpoint merged map, `PackInstallerService`, founder activation endpoint, `auto_parts` slug through all 6 gates | reusable by every future pack |
| **M1 — Data model** | `auto-parts.ts` schema (brands, details, families, identifiers, grades, makes, vehicles, fitments) + `pg_trgm` + normalized/trigram indexes; installer seeds grades + taxonomy | foundation |
| **M2 — Add-a-part** | pack item-create writing item (via `ItemsService`) + details + identifiers + family + fitment in one tx; normalization; brand/family/grade pickers; repeatable alternate-code + fitment rows | parts get entered |
| **M3 — Universal Finder** | search API (any code, trigram, normalized) + `<PartFinder/>` returning stock/price/shelf/family-equivalents/fitment; embed in POS/sales/quotation/purchase/stock | **GO-LIVE GATE** — shop can add parts + sell with universal search + core POS/sales/accounting |
| **M4 — Fitment lookup** | vehicle picker (make→model→year→engine), "what fits this car" screen, family-level fitment mgmt | richer counter lookup |
| **M5 — Reports + print** | fast/slow/dead-stock, sales by brand/group, fitment coverage; counter invoice + quotation print (GCC) | owner insight |
| **M6 — Activation UX + import** | onboarding "Auto Parts" auto-activates; founder admin activation; parts import mapping (hook `inventory-template-context` by industry) | scale onboarding |

Each milestone is independently shippable. Customer can go live after **M3**; M4–M6 enrich. A part
with no fitment tagged is fully sellable by number from item #1 — fitment gets richer as they tag,
never blocking launch.

---

## 9. Key decisions (made, with rationale)

1. **Auto-parts is a Tier-B pack, not custom fields** — identifiers/families/fitment are relational
   & searched; a JSONB bag can't index them.
2. **Extension tables, core untouched** — `part_details` 1:1 off `inventory_items`; deps point down.
3. **Uniform schema, gated at entitlement** — all tenant DBs carry (empty) pack tables; preserves
   fleet migration; no per-tenant drift.
4. **Family code over pairwise cross-refs** — tag once; fitment inherits at family level.
5. **Normalized identifier search + `pg_trgm`** — real-world punctuation variance; green-field search.
6. **Per-tenant `tenant_packs` entitlement layer** — packs are sellable à la carte; no per-customer
   plans; merged into the existing modules map so frontend gating is unchanged.
7. **Reuse core primitives** — `resolvePackUnit`, `item_categories`, `item_barcodes`,
   `materialized_stock_levels`, `price_lists`, existing sales pricing. Never hand-roll.
8. **Pack ships its own part-vocabulary screens** — defer a global terminology-override engine (Tier
   A) as YAGNI for v1.
9. **Brand + grade as entities/lookups** — filter/report/logo + multi-country renaming.

## 10. Resolved by decision (product-grade, not customer-shaped)

The dad/pilot customer is not certain on these, so we decide the industry-standard way and build the
complete model. Do NOT wait for customer confirmation on any of these.

- **Family semantics = strict "interchangeable equivalents."** `part_families` means *substitutable*
  parts (drives in-stock alternatives). The *loose* "brake-pad range / browse by group" need is served
  by the existing `item_categories` taxonomy — a separate axis. Build **both**; they compose (a part
  has one family AND one category). This removes the ambiguity by modeling the two real needs
  separately instead of overloading one field.
- **Finder default = always show the family, exact match on top.** More sales, more transparency; an
  out-of-stock-only reveal hides upsell. (A per-tenant setting to suppress alternatives can come later
  if any shop objects — do not build the toggle up front, YAGNI.)
- **Support BOTH counter (POS) and wholesale B2B in the model.** Both are core auto-parts flows and
  both already exist in the platform (POS + sales orders + quotations + `price_lists` tiers + AR). The
  pack does not choose; it surfaces tiered price + stock + credit context in the finder so a shop runs
  either or both. No customer-profile branching in the schema.
- **Grade is first-class** (genuine/wakala/aftermarket/used), tenant-editable lookup.
- **Fitment is built fully in v1** (see M4) but degrades gracefully — parts sell by number with zero
  fitment. Never ship a version that omits the fitment tables, or every item must be re-touched later.
