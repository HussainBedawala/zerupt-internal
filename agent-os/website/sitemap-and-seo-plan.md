# Zerupt Website — Sitemap & SEO Foundation Plan

> **Status:** Plan locked 2026-06-02. Build not started yet — this doc is the blueprint to set up
> the site the *right* way before writing feature code.
> **Canon:** June brand + offer docs win over the March MW Linear issues (see "Linear hygiene").
> **App:** `erp/apps/website` (`@zerupt/website`), Next.js 16 + next-intl v4 (`localePrefix: "always"`,
> en/ar), `motion` for animation, Tailwind v4 tokens in `globals.css` (brand tokens already correct).

---

## 0. Locked decisions (from founder interview)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Build scope (phase 1) | **Lean conversion site + full technical SEO.** No blog/content hub yet. |
| 2 | Conversion action | **GCC → "Book your 2-hour setup" (Cal.com).** SEA/India → **email waitlist**. Geo-aware CTA. |
| 3 | Geo SEO | **Heavy GCC now.** SEA/India = future. IA + sitemap designed to absorb country pages without rework. |
| 4 | Language | **Full ar/en parity at launch.** RTL polished. hreflang both ways + x-default. |

**Implication of #2 (geo-aware conversion):** the site detects/segments visitor market.
- GCC visitor → primary CTA = **Book setup call** (high-intent, concierge, Founding 50).
- SEA / India / other → primary CTA = **Join waitlist** ("Zerupt is launching in your market soon").
- Detection: country page context > IP/`Accept-Language` hint > explicit market picker. Never hard-block;
  always offer both actions, just reorder emphasis.

---

## 1. Sitemap / Information Architecture

### 1.1 URL strategy
- **Locale prefix on everything:** `zerupt.com/en/...` and `zerupt.com/ar/...` (already configured).
- **Root `/`** → 307 redirect to `/{detected-locale}` (Accept-Language → en|ar, default en).
- **`x-default` hreflang → `/en`** (apex canonical home). Every page emits `<link rel=alternate hreflang>`
  for `en`, `ar`, and `x-default`.
- **Slugs:** lowercase, hyphenated, descriptive but not keyword-stuffed. Readable > stuffed (premium brand).
- **Trailing slash:** off (Next default). Enforce one canonical form; no mixed.
- **Apex vs www:** serve on apex `zerupt.com`; `www` 308-redirects to apex. HTTPS enforced (HSTS).

### 1.2 Page inventory — PHASE 1 (launch set)

| Path (per locale) | Purpose | Primary CTA | Schema | Priority |
|---|---|---|---|---|
| `/{locale}` (home) | The landing page. Full narrative. | Geo-aware (call/waitlist) | Organization, WebSite, SoftwareApplication, FAQPage | 1.0 |
| `/{locale}/pricing` | Per-outlet tiers, currency select, Founding 50, guarantee | Book setup / select plan | Product/Offer, FAQPage | 0.9 |
| `/{locale}/start` | Raw founder-voice **ad landing page** (paid traffic). Minimal chrome, long-form letter. | Book / waitlist (UTM-tagged) | — (noindex optional, see §4) | 0.6 |
| `/{locale}/thanks` | Post-conversion confirmation (call booked / waitlisted) | Share / next steps | — (noindex) | — |
| `/{locale}/privacy` | Privacy policy (exists) | — | — | 0.3 |
| `/{locale}/terms` | Terms of service (exists) | — | — | 0.3 |
| `/not-found` | 404 | Back home | — | — |

Home page section order (single `<h1>`, then `<h2>` per section):
1. **Hero** — "Your business, handled." + "Know your next move." + geo-aware CTA. Owner-hero imagery.
2. **Problem** — 3 pain cards (enterprise ERP cost / budget-ERP half-broken / spreadsheet+WhatsApp chaos).
3. **The Zerupt Way** — 3 steps (answer → AI configures → live in 2 hours).
4. **Product preview** — branded mockups (POS / your numbers / AI import). Not stock screenshots.
5. **What it does** — outcome-framed capability cards (NOT "modules"; name by owner outcome).
6. **"Your Next Move"** — the one differentiator moment; the single citron-meaning surface.
7. **Comparison** — Zerupt vs SAP/NetSuite/Odoo/Foodics-Qoyod (price, setup time, Arabic/ZATCA, AI).
8. **Pricing teaser** — 3 tiers summary → link to `/pricing`.
9. **Proof / Founding 50** — guarantee (2-part), scarcity counter, founder note.
10. **FAQ** — 6–8 Q&A (FAQPage schema; objection handling + "2 hours, really?").
11. **Final CTA** + **Footer** (links, socials @zerupt.erp / @hussainbuildswithai, "Built in Kuwait").

### 1.3 Page inventory — PHASE 2 (IA reserved now, built next)

| Pattern | Examples | Notes |
|---|---|---|
| GCC country pages | `/{locale}/saudi-arabia`, `/uae`, `/kuwait`, `/bahrain`, `/oman`, `/qatar` | Highest-intent local SEO. Local currency, ZATCA/VAT, local proof, country-specific title/H1. BreadcrumbList schema. **GCC → book call.** |
| Future-market waitlist | `/{locale}/india`, `/singapore`, `/malaysia`, … | "Launching soon" + waitlist capture. **→ waitlist CTA.** |
| Comparison pages | `/{locale}/compare/odoo`, `/compare/foodics`, `/compare/zoho`, `/compare/qoyod` | Bottom-funnel "vs" search intent. |
| Content hub | `/{locale}/blog`, `/blog/[slug]` | Build-in-public + SEO articles. Article schema. |
| Build-in-public | `/{locale}/progress` | Linear-API milestone dashboard (cached server-side, internal milestones hidden). |

> **Decision:** Do NOT build Phase-2 pages yet (lean scope). But `sitemap.ts`, the locale routing, the
> hreflang helper, and the metadata factory are all written **generically** so adding a country page = add
> a route + data entry, zero infra rework.

### 1.4 `sitemap.ts` generation rule
Programmatic: `routing.locales × registeredРages` → emit URL + `lastModified` + `alternates.languages`
(en/ar). Exclude noindex routes (`/start` if chosen, `/thanks`). One sitemap now; split into a sitemap
index when Phase-2 pushes URL count up.

---

## 2. SEO foundations — MASTER CHECKLIST

> Fix order: **Technical indexability → Performance/CWV → On-page/keywords → Off-page/indexing → LLM/AI.**

### 2.1 Technical / crawl & index
- [ ] `app/robots.ts` — allow all; `Disallow` `/api`, Vercel previews; `Sitemap:` absolute URL; host.
- [ ] `app/sitemap.ts` — all locale×page URLs, `lastModified`, `alternates` (en/ar). Absolute URLs.
- [ ] **Canonical** per page (self-referential, locale-correct) via `metadata.alternates.canonical`.
- [ ] **hreflang** — `metadata.alternates.languages` `{ en, ar, "x-default" }` on EVERY page.
- [ ] `<html lang dir>` correct per locale (`dir="rtl"` for ar). `suppressHydrationWarning` on `<html>` only.
- [ ] **Metadata factory** — shared `buildMetadata({title, description, path, locale, image})` so no page
      hand-rolls tags. Title template: `"%s | Zerupt"`; home = exact brand title (no suffix dupe).
- [ ] **JSON-LD** components: `Organization` (logo, sameAs socials, contact), `WebSite`,
      `SoftwareApplication` (category, offers/price, operatingSystem), `FAQPage` (home+pricing),
      `BreadcrumbList` (country pages, phase 2). Validate in Rich Results Test.
- [ ] **Semantic HTML** — one `<h1>`/page, ordered headings, `<nav>/<main>/<footer>` landmarks, lists.
- [ ] **404** `not-found.tsx` (branded, links home). Confirm correct 404 status, not soft-200.
- [ ] **Favicon set** — `icon`, `apple-icon`, `manifest.ts` (name, theme-color cream/ink, icons), `theme-color`.
- [ ] **OG/Twitter** — `openGraph` + `twitter` (`summary_large_image`) on every page.
- [ ] **Dynamic OG image** — `@vercel/og` branded template (logo + page title, cream/ink/citron). Per page.
- [ ] **`alt` text** on all meaningful images; decorative images `alt=""`.

### 2.2 Performance / Core Web Vitals (Lighthouse: Perf 90+, A11y 95+, BP 95+, SEO 100)
- [ ] **Fonts** — IBM Plex Sans (Latin+Arabic+Devanagari) + Mono via `next/font` (self-host, subset,
      `display: swap`, preload critical weights 400/500/600 only). Tune fallback metrics to kill CLS.
- [ ] **Images** — `next/image` everywhere, explicit width/height, AVIF/WebP, lazy below fold, hero priority.
- [ ] **CLS** — reserve space for hero/media; no layout shift from fonts/animation. Target CLS < 0.05.
- [ ] **JS** — Server Components by default; `"use client"` only on interactive islands (forms, toggles,
      currency select, lang switch, animated sections). Code-split `motion`; lazy-load below-fold motion.
- [ ] **`prefers-reduced-motion`** respected (brand motion is calm anyway: ≤8px translate, 120/200/320ms).
- [ ] **preconnect/dns-prefetch** — Supabase, Cal.com, fonts (if any external). Self-host fonts to avoid.
- [ ] **Bundle analysis** — `@next/bundle-analyzer`; keep first-load JS lean.
- [ ] **Caching** — static where possible; ISR/revalidate for any data-driven (pricing, future progress).

### 2.3 On-page / keyword strategy
- [ ] **Keyword map** (one primary + 2–3 secondary per page), EN and AR researched **separately**
      (Arabic intent ≠ translated English):
  - Home (en): "retail ERP GCC", "POS and accounting software", brand "Zerupt".
  - Home (ar): "نظام نقاط بيع", "برنامج محاسبة للمتاجر", "ERP للتجزئة".
  - Pricing: "retail POS pricing", "POS software cost UAE/Saudi".
  - Country (P2): "POS software Saudi Arabia", "ZATCA e-invoicing software", "برنامج محاسبة السعودية".
- [ ] **Titles** ≤ 60 chars, **descriptions** ≤ 155, sentence case, brand voice, no jargon
      (no "ERP/module/SKU" as the lead — but category words ARE allowed in `<title>`/meta for intent SEO).
- [ ] **Internal linking** — home → pricing, comparison, (P2) country pages; footer link columns; descriptive anchors.
- [ ] **Copy = brand voice** — lead with outcome, short sentences, "one owner" not "users", end with momentum.
      Sentence case headlines. Reuse `content-style-guide.md` lexicon (USE/AVOID lists).

### 2.4 Off-page / indexing ops (post-deploy)
- [ ] **Google Search Console** — verify (DNS/Vercel), submit sitemap, confirm hreflang has no errors.
- [ ] **Bing Webmaster Tools** — verify + submit (also powers some AI search).
- [ ] **Analytics** — Vercel Analytics + (optional) GA4 with consent. Conversion events: book-call, waitlist,
      plan-click. UTM capture on `/start`.
- [ ] **Google Business Profile** + local citations (GCC) — supports country-page local SEO (Phase 2).
- [ ] **Social profile linkage** — `sameAs` in Organization schema → IG/X profiles, consistent NAP.

### 2.5 LLM / AI-search friendliness (explicit founder ask)
- [ ] **`/llms.txt`** at root — concise product summary, what Zerupt is, who it's for, key URLs (home,
      pricing, country pages), contact. Plain markdown.
- [ ] **FAQPage schema + clear Q&A copy** — LLMs lift answers from structured, factual Q&A.
- [ ] **Entity clarity** — Organization schema with `sameAs`, founder, location; unambiguous brand naming.
- [ ] **Crawler policy** — allow reputable AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended)
      for AI-search visibility. Decision: **allow** (we WANT to be cited). Revisit if scraping abuse appears.
- [ ] **Self-describing copy** — factual, declarative statements ("Zerupt is X. It does Y. It costs Z in
      country C.") that an LLM can quote verbatim without inference.

### 2.6 Brand / UX consistency (first-impression gate — non-tech TA)
- [ ] **Brand tokens** confirmed cream/ink/citron in `globals.css` (DONE) — audit pages for any stray
      violet/teal/zinc leftover from March scaffolding.
- [ ] **Color rules** — one accent/view; citron never as text on light (use olive-deep); **primary CTA = ink**,
      citron = active/focus/"Zerupt is acting" only.
- [ ] **Defensive UX on every form** — loading / error / empty / success / already-submitted states;
      debounced submit; client+server validation; never lose user input on error.
- [ ] **RTL parity** — logical CSS props only; arrows/chevrons flip; no horizontal overflow in ar;
      Arabic line-height ≥1.5; numbers in Mono.
- [ ] **i18n parity** — `pnpm --filter @zerupt/website i18n:check` passes (en source of truth).
- [ ] **Cross-browser/device** — Chrome/Safari/Firefox/Edge/Samsung; 1920/1440/1366/iPad/iPhone/Android.

---

## 3. Phased build plan (after this plan is approved)

**Phase A — SEO & brand skeleton (do FIRST, before content):**
1. Metadata factory + hreflang helper + canonical. 2. `sitemap.ts`, `robots.ts`, `manifest.ts`, favicons.
3. JSON-LD components (Organization, WebSite, SoftwareApplication). 4. Dynamic OG template. 5. `not-found`.
6. Layout audit: `<html lang dir>`, fonts via `next/font`, brand-token sweep. 7. `/llms.txt`.

**Phase B — Home page** (the 11 sections, §1.2), geo-aware CTA component, FAQ + schema.

**Phase C — Conversion plumbing:** Cal.com booking flow (GCC) + Supabase waitlist (SEA/India) with full
defensive-UX states; UTM capture; `/thanks`; events to analytics.

**Phase D — Ad landing `/start`** (founder voice, minimal, UTM, both CTAs).

**Phase E — Polish & launch gate:** RTL pass, i18n:check, Lighthouse 90+, cross-browser, copy/typo review,
Arabic review → deploy → GSC/Bing submit → verify conversions live → announce.

**Phase F (next, not launch):** GCC country pages, comparison pages, build-in-public dashboard, blog.

---

## 4. Open sub-decisions (resolve during build, low-stakes)
- `/start` indexing: **noindex** (paid-traffic doorway, avoids thin-content/dup with home) — recommended.
- Country-page slugs: descriptive (`/saudi-arabia`) vs ISO (`/sa`) → **descriptive** for readability+SEO.
- Waitlist storage: Supabase `public.waitlist` (schema from DEV-309) — keep, RLS insert-only.
- Whether home shows a live Founding-50 counter pre-launch (needs a source of truth) → static "X of 50" ok for now.

---

## 5. Linear hygiene (MW milestone — 22 issues, all "New")
The March MW issues are **structural scaffolding with stale brand/pricing/copy**. Action:
- **Keep & re-scope (copy/brand refresh to June canon):** 304, 307, 308, 310, 311, 312, 313, 314, 318, 319, 322.
- **Already effectively done / superseded:** 307 (brand tokens done), 315 (pricing page built to new offer),
  320 (lang switch — verify), 323 (RTL — ongoing).
- **Keep as-is (infra/SEO, brand-agnostic):** 309 (waitlist), 316 (BiP → Phase F), 321 (SEO infra → Phase A),
  324 (legal — built), 325 (perf), 326 (cross-browser), 327 (deploy).
- **New issues to add:** geo-aware CTA component; `/llms.txt`; dynamic OG; metadata factory; JSON-LD set;
  GCC country-page template (Phase F); Cal.com booking integration.
- Update issue copy/colors away from violet/teal/per-user pricing → cream/ink/citron + per-outlet GCC.
