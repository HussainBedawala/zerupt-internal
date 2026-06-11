# Internationalization (i18n) & Localization

> Native-language-first for each market. Arabic users see Arabic with RTL layout by default.

## Supported Locales

| Code | Language | Direction | Markets | Status |
|------|----------|-----------|---------|--------|
| `ar` | Arabic | RTL | GCC (KW, SA, AE, BH, OM, QA) | Launch |
| `en` | English | LTR | All (fallback) | Launch |
| `hi` | Hindi | LTR | India | Phase 2 |
| `ms` | Malay | LTR | Malaysia | Phase 2 |
| `id` | Indonesian | LTR | Indonesia | Phase 3 |
| `tl` | Filipino | LTR | Philippines | Phase 3 |
| `vi` | Vietnamese | LTR | Vietnam | Phase 3 |

**Selection hierarchy:** User preference (`user.locale`) → Tenant default (`tenant.languageDefault`) → Browser detection

---

## User Locale Fields

| Field | Type | Description |
|-------|------|-------------|
| `locale` | string | IETF BCP 47 tag (`ar`, `en`, `hi`) |
| `dateFormat` | enum | `DMY`, `MDY`, `YMD` |
| `timeFormat` | enum | `12h`, `24h` |
| `numberFormat` | enum | `en` (1,234.56), `ar` (١٬٢٣٤٫٥٦), `hi` (1,23,456.78) |
| `timezone` | string | IANA timezone |

Stored on User entity. Nullable — inherits from tenant defaults.

---

## RTL/LTR Layout

**CSS:** Use logical properties only — never physical `left`/`right`.

| Avoid | Use Instead |
|-------|-------------|
| `margin-left/right` | `margin-inline-start/end` |
| `padding-left/right` | `padding-inline-start/end` |
| `text-align: left/right` | `text-align: start/end` |
| `left: 0` / `right: 0` | `inset-inline-start/end: 0` |

**Direction:** `<html lang="ar" dir="rtl">` — all children inherit. Use Tailwind RTL plugin (`rtl:`, `ltr:` variants).

**Mirrored components:** Sidebar (right in RTL), breadcrumbs, directional icons (flip arrows/chevrons), progress bars, modals.

**Bidi text:** Use `dir="auto"` for user content. Numbers/URLs always LTR within RTL context.

---

## Translation Architecture

```
apps/web/messages/
├── ar/  (common.json, auth.json, settings.json, accounting.json, inventory.json, pos.json, sales.json, purchase.json, reports.json, dashboard.json, onboarding.json)
├── en/
├── hi/
└── ms/
```

**Key format:** `module.section.element` → `"settings.team.invite.title": "Invite Team Member"`

**Interpolation:** `"Reorder {quantity} units of {itemName} from {supplier}"`

**Pluralization:** `"{count, plural, =0 {No items} one {1 item} other {# items}}"`

**Framework:** next-intl with locale-aware routes (`/ar/dashboard`, `/en/dashboard`). Fallback: requested → tenant default → `en`.

---

## Locale-Aware Formatting

All via `Intl.*` APIs.

| Type | Example (en) | Example (ar) | Example (hi) |
|------|--------------|--------------|--------------|
| Number | 1,234.56 | ١٬٢٣٤٫٥٦ | 1,23,456.78 |
| Currency | KWD 1,234.500 | ١٬٢٣٤٫٥٠٠ د.ك | ₹1,23,456.78 |
| Date | Feb 28, 2026 | ٢٨ فبراير ٢٠٢٦ | 28 फ़र॰ 2026 |
| Relative | 2 hours ago | منذ ساعتين | 2 घंटे पहले |

**Note:** Financial documents default to Western numerals (0-9) for universal readability.

---

## Font Stack

```css
:root { --font-sans: 'Inter', 'Noto Sans Arabic', 'Noto Sans Devanagari', system-ui; }
[lang="ar"] { --font-sans: 'Noto Sans Arabic', 'Inter', system-ui; }
[lang="hi"] { --font-sans: 'Noto Sans Devanagari', 'Inter', system-ui; }
```

Load via Google Fonts with `font-display: swap`.

---

## Bilingual Data Fields

Entities with `name` + `nameAlt`: Tenant, Item, Customer, Supplier, Account, Branch, Warehouse, Category, PaymentMethod.

**Display rules:**
1. User locale matches primary → show primary
2. User locale matches alternate → show alternate
3. Neither → show both (primary + alternate in parentheses)

---

## Document Output

**Receipts (POS):** Bilingual by default (GCC). Company/item names on two lines. Labels side-by-side. Numbers always Western (0-9). See `pos/07-receipt-model.md`.

**Invoices:** Header in both languages, line items with primary + alternate, labels bilingual.

**Report exports:** PDF renders in user's locale (RTL for Arabic). Excel/CSV headers translated, data as stored. UTF-8 with BOM.

---

## Search (Meilisearch)

Tokenizers: Arabic (diacritics, root extraction), English (default), Hindi (Devanagari).

Searchable: `name`, `nameAlt`, `sku`, `barcode` — both language fields indexed.

---

## AI/Copilot

- NLQ accepts Arabic, English, Hindi (Phase 2)
- Language detection on input, response in same language
- Mixed-language queries supported
- Suggestion cards translated to user's locale

---

## Validation & Permissions

| Rule | Detail |
|------|--------|
| Locale code | Must be valid IETF BCP 47 |
| Fallback | English translations required for all keys |
| Missing key | Dev: show key path. Prod: fallback to English |

| Action | Permission |
|--------|------------|
| Change own locale | `user.profile.update` |
| Change tenant default | `tenant.settings.update` |
| Edit translations | Platform admin only |

---

## Implementation Checklist (Phase 0)

- [ ] next-intl with locale routing
- [ ] Tailwind RTL plugin configured
- [ ] CSS logical properties enforced (ESLint)
- [ ] Font stack (Arabic + Latin)
- [ ] Core translations (`ar`, `en`) for common/auth/settings
- [ ] `Intl.*` formatting utilities
- [ ] User locale preference in profile
- [ ] `dir` attribute propagation
- [ ] Bilingual receipt template
