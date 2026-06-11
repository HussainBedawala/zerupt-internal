<!-- Website digest | Snapshot: 2026-06-11 | Source: erp/apps/website (regenerate when site changes) -->

# Zerupt Website Digest

Marketing-agent reference snapshot. Factual, current as of 2026-06-11.
Source: `erp/apps/website/` — regenerate this file when routes, copy, or pricing change.

---

## 1. Site Structure

All pages live under `/{locale}/` where locale is `en` or `ar`.

| URL pattern | Purpose |
|---|---|
| `/{locale}/` | Homepage — primary conversion page, full emotional scroll |
| `/{locale}/pricing` | Pricing page — tiers, founding-50, guarantee, industry gate |
| `/{locale}/start` | Founder letter / paid-traffic doorway (noindex) |
| `/{locale}/team` | AI team page — Zee, Mira, Sami and the full agent roster |
| `/{locale}/blog` | Blog index |
| `/{locale}/blog/[slug]` | Individual blog articles (dynamic, typed-data registry) |
| `/{locale}/compare/[competitor]` | Competitor comparison pages (dynamic, 4 slugs) |
| `/{locale}/[country]` | Per-country local SEO pages (dynamic, 6 slugs) |
| `/{locale}/waitlist` | Waitlist landing (noindex until wider launch) |
| `/{locale}/thanks` | Post-conversion confirmation (noindex, never indexed) |
| `/{locale}/progress` | Build-in-public Linear progress dashboard |
| `/{locale}/privacy` | Privacy policy |
| `/{locale}/terms` | Terms of service |

Total: 13 route templates × 2 locales = 26+ rendered pages (more with blog articles and dynamic slugs).

---

## 2. SEO Infrastructure

### Metadata generation
- Central factory: `src/lib/seo.ts` → `buildMetadata()`. Every page calls this; no hand-rolled metadata objects.
- `title` and `description` sourced from `messages/{en|ar}/*.json`; resolved before calling the factory.
- Canonical URL: `https://zerupt.com/{locale}{path}` (env `NEXT_PUBLIC_SITE_URL`, falls back to apex).

### Hreflang / canonicals
- Every page emits `alternates.canonical` (locale-prefixed URL) + `alternates.languages` with `en`, `ar`, and `x-default → en`.
- OG locale tags: `en_US` / `ar_SA` with `og:locale:alternate`.

### Dynamic OG images
- Per-page OG image generated at `GET /api/og?title=...&subtitle=...&locale=` via Satori edge route.
- Title clamped 100 chars, description 140 chars before URL-encoding.

### Sitemap
- `src/app/sitemap.ts` — generates one entry per (page × locale).
- Covers all INDEXABLE_PAGES (static) + all BLOG_SLUGS (dynamic). Each entry carries hreflang alternates and `x-default`.
- `lastModified` = `VERCEL_GIT_COMMIT_CREATED_AT` at deploy time (stable, no freshness churn).
- Sitemap URL: `https://zerupt.com/sitemap.xml`.

### Noindex pages
`/start`, `/thanks`, `/waitlist` — set `noindex: true` in PAGE_REGISTRY; robots meta emits `noindex, nofollow`.

### Robots.txt
- Allows all crawlers at `/`; disallows `/api/`, `/_next/`, `/admin/`.
- Explicitly allows AI crawlers: GPTBot, ClaudeBot, PerplexityBot, Google-Extended, OAI-SearchBot, cohere-ai, anthropic-ai.

### llms.txt
- Present at `public/llms.txt`. Contains plain-language product description, pricing table, key URLs, guarantee, and explicit invite for AI search engines to index and cite Zerupt.

### JSON-LD structured data
Components in `src/components/seo/`: Organization, SoftwareApplication, Website, Article, Breadcrumb, FAQ schemas.

### Web App Manifest
- `name: "Zerupt"`, `display: standalone`, `theme_color: #f9f7f5` (cream), `background_color: #141310` (ink).

### Sitemap priority values
| Page | Priority |
|---|---|
| Home | 1.0 |
| Team, Pricing | 0.9 |
| Country pages | 0.8 |
| Compare pages | 0.7 |
| Blog, Progress | 0.6 |
| Waitlist | 0.5 |
| Privacy, Terms | 0.3 |

---

## 3. Key On-Site Messaging

### Home page hero (`messages/en/home.json`)

- **Eyebrow:** "Retail ERP for the GCC"
- **Headline:** "Your business, handled."
- **Sub-headline:** "The team that runs your shop for you."
- **Ledger:** "No salaries. No theft. No sick days. No wrong numbers."
- **Subtitle:** "Zerupt is the AI retail ERP for the GCC. It runs your selling, stock, accounting, and ZATCA-ready VAT, and tells you your next move. Live on your real numbers in under two hours."
- **Trust line:** "No card to start · Full Arabic · ZATCA & VAT built in"

### Primary CTAs (home)
- "Book your free 2-hour setup" (GCC primary)
- "Join the waitlist" (non-GCC)
- "See pricing"
- "See how it works"

### Pricing page hero (`messages/en/pricing.json`)
- **Headline:** "Your whole shop, handled."
- **Sub-headline:** "Know your next move."
- **Doorway copy:** "POS, inventory, accounting, and tax compliance in one place. Live with your real data in under 2 hours. No consultant. No setup project."

### Start page (founder letter, `messages/en/start.json`)
- **Headline:** "I watched good shops drown in bad software."
- Author: Hussain, 22 years old, grew up in his father's retail software company in the Gulf.

---

## 4. Conversion Mechanics

### Waitlist
- Form at `/waitlist`; also embedded in homepage and triggered from pricing gate.
- Stores email + UTM params (utm_source, utm_medium, utm_campaign) + conversion source in Supabase.
- Sources tracked: home, pricing, start, blog, country, compare, waitlist (typed enum in `src/lib/waitlist.ts`).
- Rate-limited (`src/lib/rate-limit.ts`).

### Industry Gate (pricing page → start CTA)
- Two-step modal: (1) pick industry, (2) routed outcome.
- **WAC industries → signup:** hardware/building, auto parts, general merchandise, stationery/office, electronics/mobile (with IMEI note), apparel/fashion, cosmetics/beauty, grocery/convenience, other general.
- **FIFO industries → waitlist:** pharmacy/medical, fresh food/bakery, restaurant/café (batch+expiry tracking not ready).
- **Out-of-GCC market → waitlist.**

### Founding 50
- Counter fetched live from API (`/api/v1/public/founding-seats`, 60-second revalidation); falls back to env constant.
- Shown on home "offer" section and pricing founding band.
- Promise: first 50 GCC shops lock current pricing permanently.

### Pricing tiers (per outlet/month, SAR anchor)
| Tier | SAR/mo | AED/mo | KWD/mo | Notes |
|---|---|---|---|---|
| Starter | 149 | 149 | 12 | 1 shop, full ERP, basic AI alerts |
| Growth | 349 | 349 | 29 | Multi-shop, full AI advisor (50 actions/mo), most popular |
| Pro | 699 | 699 | 55 | Unlimited AI, agentic automations |

Annual billing: 2 months free (pay 10, use 12). Currency auto-detected from browser timezone.
Extra outlet add-on pricing exists for each tier and currency.
Chains/franchise tier: custom pricing, "Talk to us" CTA.

### Guarantee (two-part)
1. Live in under 2 hours or free setup — "you don't pay until you're live."
2. 30-day full refund, no questions.

### WhatsApp FAB
- Floating WhatsApp button in layout (`src/components/layout/whatsapp-fab.tsx`) for direct contact.

### Cal.com booking
- `src/components/conversion/cal-listener.tsx` — listens for Cal booking events, fires analytics.

---

## 5. Competitor Compare Pages

URL: `/{locale}/compare/[competitor]`

| Slug | Competitor | Description |
|---|---|---|
| `odoo` | Odoo | Open-source ERP, popular with developers/mid-size |
| `foodics` | Foodics | F&B-focused POS/ops platform (GCC market) |
| `zoho` | Zoho | SMB productivity suite with accounting/inventory modules |
| `qoyod` | Qoyod | Saudi-native cloud accounting/invoicing |

Each page: hero subtitle, comparison table (dimensions with zeruptWin flag), and "when fits" honest match guide.

---

## 6. Per-Country Pages

URL: `/{locale}/[country]`

| Slug | Country |
|---|---|
| `saudi-arabia` | Saudi Arabia |
| `uae` | UAE |
| `kuwait` | Kuwait |
| `bahrain` | Bahrain |
| `oman` | Oman |
| `qatar` | Qatar |

All GCC beachhead markets. Pages are highest-intent local SEO (priority 0.8 in sitemap). Compliance notes per country built into pricing page (ZATCA for SA; UAE/BH/OM VAT; QA/KW invoicing-ready, no VAT).

---

## 7. Blog

Two seed articles in the typed registry (`src/lib/blog/posts.ts`):

| Slug | Date | Reading time |
|---|---|---|
| `zatca-e-invoicing-gcc-guide` | 2026-06-10 | 7 min |
| `how-to-know-if-your-shop-is-making-money` | (registered) | — |

Blog is bilingual (en + ar bodies in the same registry entry). Each article auto-appears in sitemap.

---

## 8. AI Agents on Site (team page + home)

Named agents marketed to shop owners as "the team that runs your shop":

| Name | Role | Status |
|---|---|---|
| Zee | Lead advisor / "next move" engine | Live |
| Mira | Migration specialist — imports old data | Live (day one) |
| Sami | Invoice scanner — reads supplier bills | Live (day one) |
| Noor | Dead stock finder | Soon |
| Arjun | Stockout predictor | Soon |
| Tariq | Shrinkage guard | Soon |
| Maya | Margin watchdog | Soon |

---

## 9. Analytics & Tracking

- `src/lib/analytics.ts` — custom analytics helper.
- UTM params captured on waitlist signup and stored in DB.
- Cal.com booking events tracked via listener component.

---

## 10. Gaps / Not Yet on Site

- **No blog content beyond 2 seed articles** — editorial calendar not published.
- **No customer testimonials or case studies** — social proof section absent (home has comparison table and founder quote only).
- **No video / product demo embed** — hero-video component exists (`src/components/home/hero-video.tsx`) but actual video asset status unknown.
- **No live chat** — WhatsApp FAB only (no in-app chat widget).
- **Progress page** (`/progress`) — noindex=false (publicly indexable) but it's a build-in-public dashboard, not a conversion page.
- **Waitlist currently noindex** — flip `noindex: false` in PAGE_REGISTRY when ready to drive organic traffic to `/waitlist`.
- **No Southeast Asia / India country pages** — FAQ mentions them as "next" but no `[country]` pages exist yet.
- **AR copy needs human review** — Hussain noted Arabic WhatsApp number and founder/close images still needed on website story rebuild.
