# Settings & Admin — Information Architecture (view hierarchy)

> First study doc of the Settings hardening program. The founder's approach: fix the
> **grouping / hierarchy of the settings views FIRST**, decide what views to add, THEN
> harden each view one at a time. Settings is large and non-linear, so getting the IA
> right is the scaffold the whole program hangs off.

Source of truth in code: `apps/web/src/lib/settings-sections.ts` + labels in
`apps/web/messages/{en,ar}/settings.json` (`settings.groups.*`, `settings.sections.*`).

## Current IA (as shipped)

| Group | Views | Problem |
|-------|-------|---------|
| Organization | company, legal-entities, locations | ok |
| Team & Access | members, roles | ok, but Approval PIN is hidden inside Security |
| Finance | currencies, taxation, fiscal, **numbering** | numbering is a *document* concern, not finance |
| **Documents** | **pos** ("Point of Sale" = receipts/printing), **notifications** | junk drawer: notifications aren't documents; the real document concern (numbering) is under Finance |
| **Data** | data-import, export, **audit**, migration | audit is *governance/compliance*, not data-ops |
| Integrations | api-webhooks | singleton group |
| **AI** | ai-agents | singleton group |
| **Compliance** | zatca | singleton group |
| **Security** | security (bundles auth + **approval PIN** + **retention** as tabs) | singleton group that *hides* two self-serve-critical views inside it |
| Account | billing, **profile** | mixes org-scope (billing) with personal-scope (profile) |

### Structural problems
1. **Four singleton groups** (integrations, ai, compliance, security) — nav bloat, a chevron hiding one link each.
2. **Junk-drawer "Documents"** — holds receipts + notifications, not the actual document-numbering view.
3. **Scope confusion** — Settings conflate three scopes with no visual hierarchy:
   - **Personal / my account** (profile, my notifications, my approval PIN, appearance)
   - **Organization-wide** (company, members, roles, currencies, tax, security policy, billing)
   - **Per-entity / per-branch** (functional currency, fiscal, tax override, numbering, locations)
4. **Hidden self-serve-critical views** — Approval PIN and Retention/Legal Hold are buried as tabs inside a generic "Security" page; the recon flagged PIN reset as a launch blocker, and burying it hurts discoverability.
5. **Module-name labels** — "Point of Sale" is a module name, not a settings concept (it's *Receipts & Printing*).
6. **Orphaned label** — `pricelists` ("Retail, wholesale, promotional pricing") has an i18n label but no wired section. Decide: wire it (Finance/Sales settings) or delete the label.

## Proposed IA (scope-first, then domain; kill singletons; surface hidden views)

Two visual tiers via a sidebar scope divider: **ORGANIZATION** (admin configures for the
whole business) then **MY ACCOUNT** (applies only to me).

### ━ ORGANIZATION ━

| Group | Views | Change |
|-------|-------|--------|
| **General** | Company · Legal Entities · Locations & Branches | rename "Organization"→"General"; +Owner Transfer action lives on Company |
| **Team & Access** | Members · Roles & Permissions · **Approval PINs** | surface Approval PIN as its own view (was buried in Security) |
| **Finance** | Currencies & Rates · Taxation · Fiscal Year & Periods | drop numbering out to Documents; merge legacy exchange-rates into Currencies |
| **Documents** | **Document Numbering** · **Receipts & Printing** | pull numbering in from Finance; rename "Point of Sale"→"Receipts & Printing" |
| **Automation & AI** | Notification Policies · AI Agents | reframe: both are "what the system does proactively"; kills the AI singleton and rescues notifications from Documents |
| **Integrations** | API & Webhooks | +send-test-webhook (in-view action, not a nav item) |
| **Data** | Data Import · Data Migration · Data Export | remove audit (→ Compliance) |
| **Compliance & Audit** | **Audit Trail** · **Retention & Legal Hold** · ZATCA E-Invoicing | consolidate: pull audit from Data, surface retention from Security, absorb the ZATCA singleton |
| **Security** | Authentication & Password Policy · Sessions & Devices · IP Allowlist | now a real group once PIN/retention move out; +Sessions & Devices (new, needed to enforce the session policy we're wiring) |

### ━ MY ACCOUNT ━

| Group | Views | Change |
|-------|-------|--------|
| **My Account** | Profile & Appearance · My Notifications · My Approval PIN | split personal scope out of "Account"; personal notification prefs live here (org policies stay under Automation & AI) |
| **Billing** | Subscription · Payment Methods · Invoices | org-scope money, kept distinct (billing hardening deferred this pass) |

## Dynamic, country/capability-driven visibility (CORE PRINCIPLE)

Founder ruling (2026-07-06): a tenant must see **only** the settings relevant to their
country + configuration. Everything dynamic. Today `settings-sections.ts` is a **static**
list — e.g. `zatca` (`settings-sections.ts:75`) is shown to EVERY tenant even though ZATCA
e-invoicing only exists in KSA. That is the concrete bug the founder pointed at.

**Reuse, do not invent** (ponytail — both already exist in the API):
- `apps/api/src/entitlement/` — plan/module access (`@RequiresModule`, `entitlement.guard.ts`)
- `apps/api/src/feature-flags/` — feature flags (`@RequiresFeature`, `feature-flag.guard.ts`)
- **Missing dimension = COUNTRY.** Derive the tenant capability context: the set of distinct
  `countryCode`s across the tenant's ACTIVE legal entities (`legal_entities.countryCode`).

**Model:** each `SettingsSection` gains optional gates, all AND-combined:
```
countries?: string[]        // show only if tenant has an active entity in one of these (zatca → ["SA"], india-irn → ["IN"])
requiresModule?: ModuleKey  // entitlement (Receipts & Printing → POS module)
requiresFeature?: FlagKey   // feature flag
requiresPermission?: PermKey// RBAC (some already gated)
```
A `useTenantCapabilities()` context (country set + enabled modules + flags + perms, fetched
once) filters the section list; **empty groups auto-hide** (also fixes the singleton-group
churn — a group with all-gated children simply doesn't render).

**Server-authoritative, not just cosmetic (C1 lesson — client hiding ≠ security):** the
matching BE route MUST also be guarded (`@RequiresModule`/`@RequiresFeature` + a country
assertion). Hiding the nav item is UX; the guard is the control. ZATCA controller must reject
a non-KSA tenant even if someone hand-navigates to the route.

**Country-conditional examples to wire:**
| View | Gate |
|------|------|
| ZATCA E-Invoicing | country ∈ {SA} + POS/invoicing module |
| India e-invoicing (IRN/GST) — future | country ∈ {IN} |
| Taxation label (VAT vs GST vs SST) | per-country label, not a separate view |
| Receipts & Printing | POS module enabled |
| AI Agents | AI features entitled |
| Multi-entity views (Legal Entities) | show always but simplified for single-entity |
| Currencies / multi-currency | multi-currency enabled (else read-only base) |

This capability resolver is **L0 foundation work** — the IA regroup and the resolver ship
together, because the regroup is only "proper" once it renders dynamically per tenant.

## Views to ADD (from recon + IA gaps)

| View / action | Where | Why | Source |
|---------------|-------|-----|--------|
| **Owner Transfer** | General → Company (action) | spec 01 fully defines it; no code exists; business succession = support ticket today | selfserve S1 |
| **Approval PINs** (surfaced) + reset | Team & Access | owner-resets-a-user's-PIN + forgot-PIN re-auth; PIN gates POS/purchase overrides | selfserve S2 |
| **Recovery contact / backup owner** | Security or General | sole-owner lockout has no recovery lever | selfserve S3 |
| **Sessions & Devices** | Security | list/revoke active sessions; required to enforce the session-idle + concurrent-session policy we're wiring | C2 wire-up |
| **Send test webhook** | Integrations (in-view) | self-verify endpoint + signature before go-live | selfserve S4 |
| **Retention & Legal Hold** (surfaced) | Compliance & Audit | exists in code, buried inside Security tab | recon |
| **Per-agent notification toggles** | Automation & AI | disable a noisy agent without DB access | selfserve |

## Taste calls (RESOLVED 2026-07-06)

1. **Scope divider → YES.** Two tiers: ORGANIZATION (admin/org-wide) + MY ACCOUNT (personal).
2. **Automation & AI → YES.** Group = Notification Policies + AI Agents.
3. **`pricelists` → DELETE the dead label.** Pricing config belongs to Sales/Inventory, not global settings.

## Final target structure (implement this exactly)

**ORGANIZATION tier:** general (company, legal-entities, locations) · team-access (members,
roles, approval-pins) · finance (currencies, taxation, fiscal) · documents (numbering,
receipts) · automation-ai (notifications, ai-agents) · integrations (api-webhooks) · data
(data-import, migration, export) · compliance-audit (audit, retention, zatca) · security
(security) · billing (billing).
**MY ACCOUNT tier:** my-account (profile).

Renames: group organization→general; section pos→receipts ("Receipts & Printing").
Moves: numbering finance→documents; audit data→compliance-audit; notifications
documents→automation-ai; ai-agents ai→automation-ai; retention security-tab→compliance-audit
(surface as own view); approval-pin security-tab→team-access (surface as own view).
Deletes: `pricelists` label; dissolve groups ai/compliance (absorbed).
Gates: zatca → countries ["SA"] + invoicing/pos module; receipts → pos module; ai-agents →
ai feature/module.

## View-by-view hardening order (after IA is fixed)

Harden in dependency order (foundation → access → money → docs → integrations → compliance →
personal), each view: BE + FE + DB, self-serve completeness, consistency/ponytail, reviewer
panel, gate, commit. Detailed per-view checklists live in the testing pack (to be created,
mirroring `agent-os/product/testing/{pos,sales}/`).
