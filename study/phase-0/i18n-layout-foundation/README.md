# Phase 0 — i18n & Layout Foundation (DEV-17, DEV-18, DEV-19)

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
- It is safe to add to `<html>` and `<body>` — these are always rendered once at the top level
- Next.js App Router convention: always add it to both `<html>` and `<body>` in the root layout

```tsx
// layout.tsx — correct pattern
return (
  <html lang={locale} dir={dir} suppressHydrationWarning>
    <body suppressHydrationWarning>
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
