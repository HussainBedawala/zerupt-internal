# Phase 0 — i18n & Layout Foundation (DEV-17, DEV-18, DEV-19, DEV-20, DEV-21, DEV-23)

Study topics covering the concepts behind next-intl v4, URL-based locale routing, and RTL/LTR layout in Next.js 16.

---

## 1. next-intl and URL-Based Locale Routing

**What:** next-intl is an i18n library for Next.js that uses a `[locale]` dynamic segment to serve locale-specific content at URL paths like `/en/dashboard` and `/ar/dashboard`.

**Why it matters:** Zerupt targets MENA + India + Southeast Asia — Arabic is RTL, multiple scripts are in play. URL-based routing (vs. cookie-only or subdomain) is SEO-friendly, cacheable by CDN, and lets users share locale-specific links.

**How it works / Key concepts:**
- `defineRouting({ locales, defaultLocale, localePrefix: 'always' })` is the single source of truth
- A `proxy.ts` (Next.js 16) / `middleware.ts` (Next.js 15) intercepts every request, detects the locale from the URL, `Accept-Language` header, or cookie, and redirects/rewrites accordingly
- `getRequestConfig` runs server-side per request to load the correct messages file
- `NextIntlClientProvider` passes messages to the React tree so client components can use `useTranslations()`

```ts
// src/i18n/routing.ts — add a locale here to enable it everywhere
export const routing = defineRouting({
  locales: ['en', 'ar'],
  defaultLocale: 'en',
  localePrefix: 'always', // every URL has explicit prefix: /en/, /ar/
});
```

**Resources:**
- [next-intl App Router setup](https://next-intl.dev/docs/getting-started/app-router)
- [next-intl routing configuration](https://next-intl.dev/docs/routing/configuration)

---

## 2. Next.js App Router `[locale]` Segment Pattern

**What:** A dynamic route segment `[locale]` at the top of the app directory makes the locale parameter available to all nested layouts and pages without prop drilling.

**Why it matters:** All of Zerupt's routes will live under `[locale]/` — every page automatically gets access to the current locale for translations, formatting, and direction.

**How it works / Key concepts:**
- File structure: `app/[locale]/layout.tsx` → `app/[locale]/dashboard/page.tsx` etc.
- `params.locale` is a `Promise<string>` in Next.js 16 (must be `await`ed)
- `generateStaticParams()` on the layout tells Next.js to pre-render `/en` and `/ar` at build time — avoids SSR cost on every request

```tsx
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ params }) {
  const { locale } = await params; // must await in Next.js 16
}
```

**Resources:**
- [Next.js dynamic segments](https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes)
- [generateStaticParams](https://nextjs.org/docs/app/api-reference/functions/generate-static-params)

---

## 3. RTL/LTR Layout Direction

**What:** HTML documents have a `dir` attribute (`ltr` or `rtl`) that controls the visual direction of text and layout. Setting it on `<html>` propagates to the entire page.

**Why it matters:** Arabic is a right-to-left language. Without `dir="rtl"`, Arabic text renders correctly but layout (padding, margins, icons, flex direction) is mirrored incorrectly. Zerupt will also add Urdu (`ur`), Persian (`fa`), and Hebrew (`he`) — all RTL — in future.

**How it works / Key concepts:**
- Set `dir` dynamically on `<html>` based on the active locale
- Maintain an explicit `RTL_LOCALES` list so adding a new RTL language is one line
- Use CSS logical properties (`margin-inline-start`, `padding-inline-end`) instead of physical (`margin-left`, `padding-right`) — logical properties flip automatically with `dir`

```tsx
// routing.ts
export const RTL_LOCALES: ReadonlyArray<string> = ['ar']; // add 'he', 'fa', 'ur' here

// layout.tsx
const dir = RTL_LOCALES.includes(locale as Locale) ? 'rtl' : 'ltr';
return <html lang={locale} dir={dir}>
```

**Resources:**
- [MDN: dir attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/dir)
- [CSS logical properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values)

---

## 4. next-intl `proxy.ts` / Middleware Architecture

**What:** The middleware intercepts HTTP requests before they hit any page, performing locale detection and URL normalization (redirecting `/dashboard` → `/en/dashboard`).

**Why it matters:** Without middleware, users hitting the root URL with no locale prefix would get a 404. The middleware handles the redirect transparently and sets a locale cookie for persistence.

**How it works / Key concepts:**
- `createMiddleware(routing)` returns a handler that does locale detection from: (1) URL prefix, (2) cookie, (3) `Accept-Language` header
- `matcher` config tells Next.js which paths the middleware runs on — must exclude `_next`, `api`, and static files
- In Next.js 16 the file is named `proxy.ts` (renamed from `middleware.ts`)
- Non-locale routes (e.g. `/health`) must be added to the matcher's negative lookahead or they'll be redirected to `/en/health`

```ts
// src/proxy.ts
export default createMiddleware(routing);
export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
```

**Resources:**
- [next-intl middleware docs](https://next-intl.dev/docs/routing/middleware)
- [Next.js 16 proxy (upgrade guide)](https://nextjs.org/docs/app/guides/upgrading/version-16)

---

## 5. Static Message Loading Pattern

**What:** Translation messages (JSON files) must be loaded server-side per request. The pattern matters for both security and build-time optimization.

**Why it matters:** A naive `import(\`./messages/${locale}.json\`)` creates a dynamic import with string interpolation — the bundler can't statically analyze it, tree-shaking is impossible, and it opens a path traversal risk if the locale value is ever not fully validated. Zerupt's code uses a static `Record<Locale, loader>` map.

**How it works / Key concepts:**
```ts
// BAD — dynamic, can't tree-shake, latent path traversal
const messages = await import(`../../messages/${locale}.json`);

// GOOD — static map, bundler can analyze all imports, no interpolation
const messageLoaders: Record<Locale, () => Promise<{ default: object }>> = {
  en: () => import('../../messages/en.json'),
  ar: () => import('../../messages/ar.json'),
};
```
- The `messageLoaders` map is exported so tests can assert it stays in sync with `routing.locales`
- Adding a new locale = add to `routing.locales` + `messageLoaders` + create the JSON file

**Resources:**
- [next-intl messages loading](https://next-intl.dev/docs/usage/configuration#i18n-request)
- [Webpack dynamic imports and tree-shaking](https://webpack.js.org/guides/tree-shaking/)

---

## 6. CSS Logical Properties

**What:** CSS logical properties are direction-agnostic equivalents of physical properties like `margin-left`. They map to the correct physical side based on the element's writing direction.

**Why it matters:** Zerupt ships in Arabic (RTL) and English (LTR) from day one. If you write `margin-left: 16px`, it means "left" regardless of direction — breaking Arabic layout. Logical properties flip automatically so one codebase works for both directions.

**How it works / Key concepts:**
```
Physical → Logical equivalent
margin-left       → margin-inline-start
margin-right      → margin-inline-end
padding-left      → padding-inline-start
padding-right     → padding-inline-end
left: 0           → inset-inline-start: 0
right: 0          → inset-inline-end: 0
border-left       → border-inline-start
text-align: left  → text-align: start
```
Tailwind v3 logical utility classes:
- `ms-4` = `margin-inline-start: 1rem`
- `pe-2` = `padding-inline-end: 0.5rem`
- `start-0` = `inset-inline-start: 0`

**Resources:**
- [MDN: CSS Logical Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values)
- [Tailwind logical properties](https://tailwindcss.com/docs/margin#using-logical-properties)

---

## 7. Tailwind RTL/LTR Variants (Built-in v3.3+)

**What:** Tailwind v3.3 introduced built-in `rtl:` and `ltr:` variants that apply a class only when the nearest `dir` attribute matches.

**Why it matters:** Some styles can't be expressed with logical properties alone (e.g. `transform: scaleX(-1)` to mirror an icon). The `rtl:`/`ltr:` variants cover these cases without needing a separate plugin.

**How it works / Key concepts:**
- No plugin needed — works out of the box in Tailwind v3.3+
- Variants are inherited: they check the closest ancestor with a `dir` attribute
- Use logical property classes first (`ms-*`, `start-*`); use `rtl:` / `ltr:` only when logical properties are insufficient

```tsx
// Mirror a chevron icon in RTL without duplicating components
<ChevronRight className="rtl:rotate-180 transition-transform" />

// Logical properties (preferred — no variant needed)
<div className="ms-4 ps-2 start-0">...</div>

// Physical direction override (use sparingly)
<div className="ltr:text-left rtl:text-right">...</div>
```

**Resources:**
- [Tailwind RTL support docs](https://tailwindcss.com/docs/hover-focus-and-other-states#rtl-support)

---

## 8. React Hydration and `suppressHydrationWarning`

**What:** React hydration is the process of attaching React's event system to server-rendered HTML. A hydration mismatch occurs when the HTML the server sent differs from what React renders on the client.

**Why it matters:** The `dir` attribute on `<html>` is set server-side. Browser extensions (translation tools, password managers) often inject attributes into `<html>` and `<body>` before React hydrates — causing false-positive hydration warnings that pollute logs and mask real bugs.

**How it works / Key concepts:**
- `suppressHydrationWarning` on an element tells React to ignore attribute differences on that specific element (it does NOT suppress errors in children)
- Safe to add to `<html>` — browser extensions modify the `<html>` element's attributes (e.g. `translate="no"`, `data-extension-*`)
- **Do NOT add to `<body>`** — React hydration warnings on `<body>` children are real bugs (SSR/CSR mismatches). Suppressing them hides genuine rendering issues in development.

```tsx
// layout.tsx — correct pattern
return (
  <html lang={locale} dir={dir} suppressHydrationWarning>
    <body>
      {children}
    </body>
  </html>
);
```

**Resources:**
- [React hydration docs](https://react.dev/reference/react-dom/client/hydrateRoot#suppressing-unavoidable-hydration-mismatch-errors)
- [Next.js layout docs](https://nextjs.org/docs/app/api-reference/file-conventions/layout)

---

## 9. `--dir-factor` CSS Custom Property Pattern

**What:** A CSS custom property set to `1` in LTR and `-1` in RTL, used to flip directional values (like `translateX`) without duplicating rules.

**Why it matters:** CSS logical properties don't cover everything. `translateX`, `box-shadow` offsets, and some SVG values are physical. The `--dir-factor` pattern lets you write direction-aware transforms with a single rule.

**How it works / Key concepts:**
```css
:root { --dir-factor: 1; }
[dir="rtl"] { --dir-factor: -1; }
```
```tsx
// Slide in from the correct side regardless of direction
style={{ transform: `translateX(calc(var(--dir-factor) * 16px))` }}
```
**Limitation:** `--dir-factor` is page-level only. For mixed-direction subtrees (e.g. an LTR price amount inside an RTL page), compute direction locally using `getDir()` rather than relying on this variable.

**Resources:**
- [MDN: CSS custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)

---

> Topics below added from DEV-19 — Translation file structure & missing key detection.

## 6. Namespace-Based Translation File Structure

**What:** Splitting a single locale JSON file into multiple files, one per application module (e.g., `messages/en/accounting.json`, `messages/ar/settings.json`), each acting as an independent namespace.

**Why it matters:** Zerupt will have 7+ modules and hundreds of translation keys. A single flat file becomes unmanageable for translators and causes unnecessary re-loading of all strings on every page. Namespacing lets you load only what a page needs, keep module teams autonomous, and simplify future translation handoffs.

**How it works / Key concepts:**
- next-intl's `getRequestConfig` receives a plain `messages` object — it doesn't care how you assembled it. You can spread or `Object.fromEntries` multiple files into one object.
- The `NAMESPACES` constant acts as the single registry. Adding a namespace = one line there + two JSON files.
- `Promise.all` loads all files in parallel, not sequentially — important for performance at startup.

```ts
// Merge multiple namespace files into one messages object
const entries = await Promise.all(
  NAMESPACES.map(async (ns) => {
    const mod = await import(`../../messages/${locale}/${ns}.json`);
    return [ns, mod.default] as const;
  })
);
const messages = Object.fromEntries(entries);
```

**Resources:**
- [next-intl: configuration](https://next-intl.dev/docs/usage/configuration)

---

## 7. ICU Message Syntax for Pluralization and Interpolation

**What:** ICU (International Components for Unicode) is a standard syntax for expressing locale-aware string patterns: variable substitution, pluralization, date/number formatting, and gender selection.

**Why it matters:** Arabic has 6 grammatical plural forms (zero, one, two, few, many, other). Using ICU means next-intl handles all of them automatically — you never write `if (count === 1)` in UI code.

**How it works / Key concepts:**
```json
// Interpolation
{ "welcome": "Welcome, {name}!" }

// Pluralization (next-intl uses _one / _other suffix convention)
{ "item_one": "1 item", "item_other": "{count} items" }

// Usage in component
t('item', { count: n })   // → "3 items"
t('welcome', { name: 'Hussain' })  // → "Welcome, Hussain!"
```
- Arabic plural forms are resolved automatically when the locale is `ar` — no extra code needed.

**Resources:**
- [next-intl: translations](https://next-intl.dev/docs/usage/messages)
- [ICU Message Format](https://unicode-org.github.io/icu/userguide/format_parse/messages/)

---

## 8. Missing Translation Detection and CI Gating

**What:** A script that compares all locale files against the source-of-truth (English) and reports missing keys, extra keys, and empty string values. Exits with code 1 if issues are found, so CI fails before broken translations reach production.

**Why it matters:** Missing translations silently render as the translation key string (e.g., `"common.save"`) in the UI. On an Arabic product launch, a single missing key is visible to every user. Automated detection catches this at commit time, not in production.

**How it works / Key concepts:**
- **Flatten keys to dot-notation:** `{ a: { b: "val" } }` → `["a.b"]` — enables simple Set-based comparison regardless of nesting depth.
- **Source of truth = `en/`:** Every other locale must have the same keys. Extra keys in non-English locales are warnings (orphaned), not errors.
- **Exit code 1:** Scripts that exit 1 fail CI steps. `pnpm i18n:check` can be added to a GitHub Actions workflow as a pre-deploy gate.

```ts
// Core algorithm
const missing = sourceKeys.filter(k => !new Set(targetKeys).has(k));
```

**Resources:**
- [Node.js `process.exit`](https://nodejs.org/api/process.html#processexitcode)
- [tsx — TypeScript execution for scripts](https://github.com/privatenumber/tsx)

---

> Topics below added from DEV-20 — Arabic/English locale setup, bidi isolation, static rendering.

## 9. Unicode Bidirectional Algorithm and Bidi Isolation

**What:** The Unicode Bidirectional Algorithm (UBA) determines how to display text that mixes left-to-right and right-to-left characters. Bidi *isolation* is a mechanism to prevent a string from leaking its direction into surrounding text.

**Why it matters:** In an ERP, user-generated content (product names, customer names, addresses) can be Arabic or English regardless of the UI language. Without isolation, an Arabic product name embedded in an English sentence (or vice versa) can corrupt the visual order of surrounding text — a classic "bidi spoofing" bug that also affects UI legibility.

**How it works / Key concepts:**
- **First Strong Isolate (FSI, U+2068)** + **Pop Directional Isolate (PDI, U+2069):** Unicode characters that wrap a string, auto-detecting its direction and preventing it from affecting surrounding text
- **`dir="auto"`:** HTML attribute that applies the first-strong algorithm to the element's content — browser-native equivalent of FSI/PDI but only works on HTML elements, not interpolated strings
- **First-strong algorithm:** Scans characters left-to-right, skips neutrals (digits, punctuation, spaces), returns the direction of the first strongly directional character (Arabic → RTL, Latin → LTR)

```ts
// isolateText() — use when embedding user text inside a translated string
t('greeting', { name: isolateText(customer.name) })
// → "Hello, ‪Hussain‬" (LTR) or "مرحباً، ‪محمد‬" (RTL customer name in RTL string)

// getContentDir() — use to set dir on a user-content container in JSX
<p dir={getContentDir(product.name)}>{product.name}</p>
```

**Resources:**
- [Unicode Bidirectional Algorithm (TR9)](https://unicode.org/reports/tr9/)
- [MDN: dir="auto"](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/dir#auto)
- [Unicode bidi isolates explainer](https://www.w3.org/International/articles/inline-bidi-markup/uba-basics)

---

## 10. Arabic Unicode Ranges and Legacy Encodings

**What:** Arabic text spans multiple Unicode blocks — the main Arabic block (U+0600–06FF), plus Presentation Forms used in legacy systems (U+FB50–FDFF, U+FE70–FEFF).

**Why it matters:** MENA retail data (from POS terminals, ERPs, supplier feeds) often comes from legacy systems that encode Arabic in the Presentation Forms blocks rather than the canonical Arabic block. A direction-detection regex that only covers U+0600–06FF will misclassify these strings as LTR, breaking sorting, display, and search.

**How it works / Key concepts:**
```
U+0590–05FF  Hebrew
U+0600–06FF  Arabic (main block — Farsi, Urdu, Kurdish included)
U+0700–074F  Syriac
U+0750–077F  Arabic Supplement
U+0780–07BF  Thaana (Maldivian)
U+08A0–08FF  Arabic Extended-A
U+FB50–FDFF  Arabic Presentation Forms-A (legacy)
U+FE70–FEFF  Arabic Presentation Forms-B (legacy)
```
- Presentation Forms appear in font-encoded documents, old Windows codepages, and some POS receipt formats
- Always include all three Arabic ranges (main + both Presentation Forms) in any RTL detection regex for production MENA systems

**Resources:**
- [Unicode Arabic block chart](https://www.unicode.org/charts/PDF/U0600.pdf)
- [Unicode Arabic Presentation Forms-A](https://www.unicode.org/charts/PDF/UFB50.pdf)

---

## 11. `setRequestLocale` and next-intl Static Rendering

**What:** `setRequestLocale(locale)` is a next-intl v4 API that must be called in every Server Component that uses next-intl APIs (like `getTranslations`). It enables Next.js static rendering (pre-rendering at build time) by making the locale available without reading it from the request at runtime.

**Why it matters:** Without `setRequestLocale`, every route that calls `getTranslations` or `getMessages` forces dynamic rendering (SSR on every request). Calling it in the root layout and every nested async Server Component unlocks static pre-rendering — critical for performance on Vercel with a global CDN.

**How it works / Key concepts:**
- Must be called **before** any other next-intl API in the same component
- Pairs with `generateStaticParams()` — tells Next.js which locales to pre-render at build time
- In layouts: call it once, then all child Server Components inherit the locale via React context
- In `generateMetadata`: call it separately because `generateMetadata` runs in a different React tree from the layout's default export

```ts
// layout.tsx
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale); // must call here too — separate render
  const t = await getTranslations({ locale, namespace: 'common' });
  return { title: t('appName'), description: t('appTagline') };
}

export default async function LocaleLayout({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale); // and here — in the component render
  const messages = await getMessages();
  // ...
}
```

**Resources:**
- [next-intl: static rendering](https://next-intl.dev/docs/getting-started/app-router/with-i18n-routing#static-rendering)
- [next-intl: generateMetadata](https://next-intl.dev/docs/usage/metadata)

---

## 12. TypeScript Type Predicates for Runtime Narrowing

**What:** A type predicate is a function whose return type is `value is SomeType` — it tells TypeScript that if the function returns `true`, the argument can be treated as `SomeType` in subsequent code, without an explicit cast.

**Why it matters:** Next.js types route params as `string`, but Zerupt's locale type is a union (`"en" | "ar"`). Without a type predicate, you need an `as Locale` cast after the runtime guard — a cast that TypeScript accepts blindly even if the guard logic changes. A type predicate makes the narrowing part of the type signature, so TypeScript enforces correctness.

**How it works / Key concepts:**
```ts
// WITHOUT type predicate — cast is manual and fragile
if (!routing.locales.includes(locale as Locale)) notFound();
const typedLocale = locale as Locale; // TypeScript accepts this blindly

// WITH type predicate — TypeScript narrows automatically
function isLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value);
}
if (!isLocale(locale)) notFound();
// locale is now Locale here — no cast needed
setRequestLocale(locale); // TypeScript knows this is safe
```
- Type predicates work with any control flow — `if`, `filter`, `find`
- They don't add runtime cost — they only affect the type checker

**Resources:**
- [TypeScript handbook: type predicates](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates)

---

## DEV-21 — Locale-Aware Formatting Utilities

---

## N+1. Intl.NumberFormat — The Browser's Built-in Locale Formatter

**What:** `Intl.NumberFormat` is a native JavaScript API that formats numbers according to a BCP 47 locale tag, handling digit systems, grouping separators, decimal symbols, and currency placement automatically.

**Why it matters:** Zerupt targets MENA and India — customers expect Eastern Arabic digits (١٢٣٤) in Arabic UI and Indian-style grouping (1,00,000) in Hindi UI. Rolling a custom formatter would be fragile; `Intl.NumberFormat` uses the platform's ICU data and gets this right out of the box.

**How it works / Key concepts:**
```ts
// Western digits (en-US)
new Intl.NumberFormat("en-US").format(1234567.89)
// → "1,234,567.89"

// Eastern Arabic digits (ar-EG)
new Intl.NumberFormat("ar-EG").format(1234567.89)
// → "١٬٢٣٤٬٥٦٧٫٨٩"

// Currency with symbol placement
new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(49.9)
// → "$49.90"

// Arabic currency (symbol appears after number in RTL context)
new Intl.NumberFormat("ar-EG", { style: "currency", currency: "AED" }).format(49.9)
// → "٤٩٫٩٠ د.إ.‏"
```
- Always use `ar-EG` (not plain `ar`) to guarantee Eastern Arabic digits — plain `ar` may fall back to Western digits depending on OS ICU version.
- The `currency` option requires a valid ISO 4217 three-letter uppercase code. Passing anything else throws a `RangeError`.

**Resources:**
- [MDN: Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)
- [Unicode CLDR — Arabic locale data](https://cldr.unicode.org/)

---

## N+2. BCP 47 Locale Tags and Unicode Extensions

**What:** BCP 47 is the standard for language tags (e.g. `en-US`, `ar-EG`). Unicode extensions (the `-u-` subtag) let you override specific locale behaviors like calendar system, numbering system, and collation.

**Why it matters:** In a retail ERP, financial dates must always be Gregorian — but `ar-EG` alone may render Hijri calendar dates on some ICU builds. Adding `-u-ca-gregory` forces the Gregorian calendar for all Arabic date rendering.

**How it works / Key concepts:**
```ts
// Force Gregorian calendar for Arabic
new Intl.DateTimeFormat("ar-EG-u-ca-gregory", {
  year: "numeric", month: "numeric", day: "numeric"
}).format(new Date("2025-03-15"))
// → "١٥/٣/٢٠٢٥" (Gregorian, Eastern Arabic digits)

// Without -u-ca-gregory, some environments render:
// → "١٤/٩/١٤٤٦" (Hijri calendar — wrong for invoices)
```

Common Unicode extension keys:
- `ca` — calendar (`gregory`, `islamic`, `persian`, `buddhist`)
- `nu` — numbering system (`arab` for Eastern Arabic, `latn` for Western)
- `co` — collation order

**Resources:**
- [BCP 47 spec (RFC 5646)](https://www.rfc-editor.org/rfc/rfc5646)
- [MDN: Locale extensions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl#locale_identification_and_negotiation)

---

## N+3. Intl.RelativeTimeFormat — "2 hours ago" in Any Language

**What:** `Intl.RelativeTimeFormat` formats a numeric offset + time unit into a human-readable relative time string, fully localized (pluralization, grammatical gender, digit system).

**Why it matters:** Zerupt displays "last synced X minutes ago", "invoice due in 3 days" etc. This API handles Arabic's complex plural forms (singular/dual/plural) and RTL-safe output without any manual string building.

**How it works / Key concepts:**
```ts
const rtf = new Intl.RelativeTimeFormat("ar-EG", { numeric: "auto" });

rtf.format(-1, "day")   // → "أمس" (yesterday — not "-1 day")
rtf.format(-2, "hour")  // → "قبل ساعتين" (dual form, automatic)
rtf.format(3, "day")    // → "بعد 3 أيام"

// English
const en = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
en.format(0, "second")  // → "now"
en.format(-1, "day")    // → "yesterday"
```
- `numeric: "auto"` replaces "-1 day" with "yesterday" when a natural word exists.
- `numeric: "always"` always shows the number (useful in compact UIs).
- You must provide the unit yourself — the API doesn't auto-detect it from the magnitude.

**Resources:**
- [MDN: Intl.RelativeTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat)

---

## N+4. Server vs Client Formatting — When to Use Pure Functions vs Hooks

**What:** In Next.js App Router, components are Server Components by default. React hooks (`useLocale`, `useFormatter`) only work in Client Components (`"use client"`). This means formatting utilities need two shapes.

**Why it matters:** Mixing them up causes a runtime error: "You're importing a component that needs `useState`. It only works in a Client Component." Knowing which layer needs what prevents hard-to-debug errors.

**How it works / Key concepts:**
```
Server Component (default)        Client Component ("use client")
─────────────────────────         ──────────────────────────────
import { formatNumber }           import { useFormatNumber }
  from "@/lib/format"               from "@/lib/hooks/use-format"

const locale = await getLocale() // const format = useFormatNumber()
const result = formatNumber(     // const result = format(1234.5)
  1234.5, locale)
```

Pattern used in Zerupt:
- `lib/format.ts` — pure `Intl.*` functions, locale passed as argument → Server Components, API routes, tests
- `lib/hooks/use-format.ts` — thin wrappers calling `useLocale()` → Client Components only

This separation also makes the pure functions trivially testable with Vitest (no React context needed).

**Resources:**
- [Next.js: Server vs Client Components](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns)
- [next-intl: useFormatter hook](https://next-intl.dev/docs/usage/numbers)

---

## 22. Cookie-Based Locale Persistence (NEXT_LOCALE)

**What:** A browser cookie named `NEXT_LOCALE` that stores the user's last-chosen locale so future visits default to it without requiring a URL change.

**Why it matters:** Zerupt supports `ar` and `en`. A user who prefers Arabic shouldn't have to navigate to `/ar/` every time. The cookie makes the preference sticky across sessions — no backend profile needed at this stage.

**How it works / Key concepts:**

next-intl's middleware compares the requested locale against the user's `accept-language` header. When they differ (e.g. user navigates to `/ar/` but browser says `en`), the middleware infers the user explicitly chose a different locale and sets:

```http
Set-Cookie: NEXT_LOCALE=ar; Path=/; SameSite=Lax
```

On the next visit to `/`, the middleware reads this cookie and redirects to `/ar/` automatically. No explicit `document.cookie` or `cookies()` code is needed in your app — it is entirely handled by `createMiddleware(routing)` in `proxy.ts`.

You can customise or disable this cookie via the `localeCookie` option in `defineRouting`.

**Resources:**
- [next-intl: localeCookie config](https://next-intl.dev/docs/routing/configuration#localecookie)
- [next-intl: locale detection order](https://next-intl.dev/docs/routing/middleware#locale-detection)

---

## 23. Typed Navigation Helpers (createNavigation)

**What:** `createNavigation(routing)` from next-intl generates locale-aware versions of Next.js navigation primitives — `Link`, `useRouter`, `usePathname`, `redirect` — that are typed to your supported locales and automatically inject the correct locale prefix into every href.

**Why it matters:** Without this, you'd import from `next/navigation` and manually pass `locale` everywhere. With it, `router.replace('/dashboard', { locale: 'ar' })` navigates to `/ar/dashboard` — locale injection is automatic and type-safe.

**How it works / Key concepts:**

```ts
// src/i18n/navigation.ts
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
```

Import these instead of `next/navigation` across the entire app. TypeScript will error if you pass an unsupported locale.

**Resources:**
- [next-intl: Navigation API](https://next-intl.dev/docs/routing/navigation)

---

## 24. useCallback for Stable Hook Return Values

**What:** `useCallback(fn, deps)` memoises a function so the same reference is returned across renders as long as dependencies haven't changed.

**Why it matters:** Hooks that return functions (like `useLocalePref`'s `setLocale`) should return stable references. If a parent component passes `setLocale` to a child as a prop or puts it in a `useEffect` dependency array, a new reference on every render causes unnecessary re-renders or effect re-runs — a common React performance bug.

**How it works / Key concepts:**

```ts
const setLocale = useCallback(
  (next: Locale): void => {
    if (next === currentLocale) return;
    router.replace(pathname, { locale: next });
  },
  [router, pathname, currentLocale],
);
```

Rule of thumb: any function returned from a custom hook should be wrapped in `useCallback`. This is especially true when the hook abstracts navigation or side-effectful operations.

**Resources:**
- [React: useCallback reference](https://react.dev/reference/react/useCallback)

---

## 25. Testing React Hooks and Components with Vitest + jsdom

**What:** Vitest runs in Node by default, but React hooks and components need a browser-like DOM environment. The `jsdom` environment simulates `document`, `window`, and browser APIs inside Node so tests can render components without a real browser.

**Why it matters:** Zerupt's web app has client components and custom hooks. Without jsdom, `renderHook` and `render` from `@testing-library/react` throw because DOM APIs don't exist.

**How it works / Key concepts:**

Configure Vitest globally:
```ts
// vitest.config.ts
export default defineConfig({
  plugins: [react()],          // transforms JSX in test files
  test: {
    environment: "jsdom",      // DOM APIs available in all tests
    setupFiles: ["./src/test-setup.ts"],  // runs before each test file
  },
});
```

Setup file extends Vitest's `expect` with jest-dom matchers:
```ts
// src/test-setup.ts
import "@testing-library/jest-dom";
```

Override per file if a test genuinely needs Node:
```ts
// @vitest-environment node
```

**Resources:**
- [Vitest: test environments](https://vitest.dev/guide/environment)
- [Testing Library: renderHook](https://testing-library.com/docs/react-testing-library/api/#renderhook)
