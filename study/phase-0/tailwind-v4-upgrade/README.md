# Study Topics — DEV-170: Tailwind CSS v3 → v4 Upgrade

## 1. CSS-First Configuration (@theme directive)

**What:** Tailwind v4 replaces JavaScript config files with CSS-native `@theme` blocks that define design tokens directly in your stylesheet.

**Why it matters:** Eliminates the JS → CSS compilation step. Your theme is co-located with your styles, reducing indirection. For Zerupt's multi-script font system (Latin, Arabic, Devanagari), `@theme inline` lets CSS custom properties from `next/font` resolve at paint time rather than build time.

**Key concepts:**
```css
/* v3: tailwind.config.ts */
theme: { extend: { fontFamily: { sans: ["var(--font-sans)"] } } }

/* v4: globals.css */
@theme inline {
  --font-sans: var(--font-sans), system-ui, sans-serif;
}
```

- `@theme` — values resolved at build time (static tokens like colors, spacing)
- `@theme inline` — values resolved at browser paint time (dynamic vars like `next/font` injections)
- Self-referencing vars (e.g. `--font-sans: var(--font-sans)`) require `inline` to avoid circular resolution at build time

**Resources:**
- [Tailwind v4 Theme Configuration](https://tailwindcss.com/docs/theme)
- [Tailwind v4 Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)

## 2. PostCSS Pipeline Changes in v4

**What:** Tailwind v4 bundles its own PostCSS plugin (`@tailwindcss/postcss`) that replaces both the old `tailwindcss` plugin and `autoprefixer`.

**Why it matters:** Simpler build pipeline — one plugin instead of three. Tailwind v4 uses Lightning CSS internally for vendor prefixing and CSS transforms, so autoprefixer is redundant.

**How it works:**
```js
// v3: postcss.config.mjs
export default { plugins: { "postcss-import": {}, tailwindcss: {}, autoprefixer: {} } }

// v4: postcss.config.mjs
export default { plugins: { "@tailwindcss/postcss": {} } }
```

Lightning CSS handles:
- Vendor prefixing (replaces autoprefixer)
- CSS nesting (replaces postcss-nesting)
- CSS imports (replaces postcss-import)
- Color function transforms (oklch, color-mix)

**Resources:**
- [Lightning CSS](https://lightningcss.dev/)
- [Tailwind v4 PostCSS Setup](https://tailwindcss.com/docs/installation/using-postcss)

## 3. Content Detection and @source

**What:** Tailwind v4 auto-detects content files in your project. For files outside the CSS file's directory tree (like a shared UI package in a monorepo), use the `@source` directive.

**Why it matters:** In Zerupt's monorepo, `packages/ui/` contains shared components consumed by `apps/web/`. Without `@source`, Tailwind would miss classes used only in the UI package and purge them in production — silently breaking components with no build error.

**Key concepts:**
```css
/* Scan a sibling package for Tailwind classes */
@source '../../../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}';
```

- Path is relative to the CSS file, not the project root
- Glob pattern must match all file extensions that may contain Tailwind classes
- No build error if the path is wrong — classes silently get purged (fail-silent, not fail-fast)

**Resources:**
- [Tailwind v4 Content Configuration](https://tailwindcss.com/docs/content-configuration)

## 4. CSS Logical Properties and RTL in Tailwind v4

**What:** CSS logical properties map physical directions (left/right) to semantic directions (start/end) based on the document's writing mode and direction.

**Why it matters:** Zerupt supports Arabic (RTL) and English (LTR). Logical properties mean one set of classes works correctly in both directions without conditional logic.

**Key concepts:**
| Tailwind class | CSS property | LTR result | RTL result |
|---------------|-------------|------------|------------|
| `ms-4` | margin-inline-start | margin-left: 1rem | margin-right: 1rem |
| `me-4` | margin-inline-end | margin-right: 1rem | margin-left: 1rem |
| `ps-4` | padding-inline-start | padding-left: 1rem | padding-right: 1rem |
| `start-0` | inset-inline-start | left: 0 | right: 0 |

Tailwind v4 changes: `rtl:` and `ltr:` variants remain built-in. Logical property utilities unchanged. No migration needed for bidi code.

**Resources:**
- [MDN: CSS Logical Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values)
- [Tailwind RTL Support](https://tailwindcss.com/docs/hover-focus-and-other-states#rtl-support)
