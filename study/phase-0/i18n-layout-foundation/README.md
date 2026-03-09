# Phase 0 — i18n & Layout Foundation (DEV-17)

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
