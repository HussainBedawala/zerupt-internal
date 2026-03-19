# Journal Entry Viewer UI

Study topics from DEV-58: Create Journal Entry Viewer UI (list, detail, drill-down).

## Topics

### 1. Integer-Cent Arithmetic for Financial UIs

IEEE-754 floating-point cannot represent all decimal fractions exactly. `0.1 + 0.2 !== 0.3` in JavaScript. Financial UIs that sum monetary values (debit/credit totals) must avoid float accumulation.

**Solution:** Parse decimal strings into integer sub-units (cents, mills) before summing. Compare integers for balance validation — no epsilon tolerance needed.

**Key insight:** The backend stores amounts as decimal strings. The frontend should never convert to `Number` for arithmetic — parse to integer cents, sum, then format back for display.

### 2. Accessible Data Tables (WCAG 2.1)

Data tables that act as navigation (click row → detail page) need explicit accessibility:

- `role="link"` — tells screen readers the row is interactive
- `tabIndex={0}` — makes the row keyboard-focusable
- `onKeyDown` with Enter handler — keyboard equivalent of click
- Visible focus indicator (`focus:ring-2`) — sighted keyboard users need to see where they are

Without these, keyboard-only users cannot navigate the table.

### 3. RTL-Safe Pagination

Pagination arrows (previous/next) carry directional meaning. In LTR, "previous" points left. In RTL, "previous" points right. Using `←`/`→` characters or fixed ChevronLeft/ChevronRight breaks RTL.

**Solution:** Use CSS `rtl:rotate-180` on chevron icons. The icon renders correctly in both directions without JavaScript logic.

### 4. shadcn Dialog vs Custom Modals

Custom modals (`position: fixed; inset: 0`) miss critical accessibility features:

| Feature | Custom Modal | shadcn Dialog (Radix) |
|---------|-------------|----------------------|
| Focus trap | Manual | Built-in |
| Scroll lock | Manual | Built-in |
| Escape to close | Manual | Built-in |
| aria-labelledby | Manual | Auto-linked to DialogTitle |
| Portal rendering | Manual | Built-in |
| Animation | Manual | Built-in |

**Rule:** Never build custom modals. Use shadcn Dialog (wraps Radix UI Dialog) for all modal needs.

### 5. Locale-Aware Routing in next-intl

next-intl provides `useRouter` and `Link` from `@/i18n/navigation` that automatically prefix routes with the current locale. Using Next.js's native `useRouter` from `next/navigation` strips the locale prefix, causing 404s or locale resets.

**Pattern:**
```tsx
// WRONG — loses locale
import { useRouter } from "next/navigation";

// CORRECT — preserves locale
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
```

### 6. Debounced Filter Inputs

Text inputs that trigger API calls on every keystroke create excessive network requests. A 300ms debounce waits for the user to stop typing before firing the query.

**Pattern:** Split state into two: `inputValue` (immediate, for UI responsiveness) and `debouncedValue` (delayed, for API queries). Use `useEffect` + `setTimeout` with cleanup to implement.

### 7. TanStack Query Key Namespacing

Query keys should distinguish between list and detail queries to prevent cache collisions. A list query returning paginated results should not share a cache key prefix with a detail query returning a single record.

**Pattern:** `["tenant", "resource", "list", filters]` vs `["tenant", "resource", "detail", id]`

### 8. Source Document Routing Pattern

Journal entries reference source documents (invoices, receipts, POs) by type and ID. A routing table maps document types to URL patterns, enabling drill-down links. Unknown or future document types gracefully degrade to non-clickable labels with "coming soon" tooltips.

This pattern decouples the journal viewer from specific module implementations — new modules just add a route entry.
