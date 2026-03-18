# COA Management UI — Study Topics

## 1. Recursive Tree Rendering in React

The Chart of Accounts is a hierarchical data structure where each account can have child accounts. Rendering this requires **recursive components** — a component that renders itself for each child node.

**Key concepts:**
- A `TreeNode` component receives a node and renders its own row, then maps over `node.children` rendering `<TreeNode>` for each
- Expand/collapse state is managed centrally (a `Set<string>` of expanded IDs) rather than per-node, enabling "expand all" / "collapse all"
- Radix UI's `Collapsible` component handles the animation and accessibility of expand/collapse
- CSS `paddingInlineStart` (logical property) creates visual indentation proportional to `depth`

**Why not virtualization?** For typical COA trees (30-100 visible nodes), recursive rendering is fast enough. Virtualization (e.g., `react-window`) adds complexity and breaks the natural DOM tree structure that accessibility tools rely on. Only consider it if profiling shows performance issues.

## 2. Client-Side Tree Filtering

Filtering a tree is different from filtering a flat list because you must **preserve ancestor paths** to matching nodes.

**Algorithm:**
1. Recursively filter children first
2. Check if the current node matches the filter
3. Keep the node if it matches OR if any descendant matches
4. When the node itself matches but no children do, show all its children (unfiltered)

This "show ancestors of matches" pattern is common in file explorers, org charts, and category trees.

## 3. Enum Case Alignment (Frontend ↔ Backend)

A critical lesson: **frontend types must exactly match the API's enum values**. The database uses `snake_case` enums (`current_asset`, `operating_expense`), and the API passes them through unchanged. The frontend must use the same casing.

**Pattern:** Define enum constants once in a `types.ts` file, derive TypeScript types from them with `as const`, and use those constants everywhere (form schemas, i18n keys, filter options). This creates a single source of truth.

## 4. CSV Import UX Pattern

Bulk data import follows a multi-step wizard pattern:
1. **File selection** — validate file type, size limits
2. **Parse & preview** — show first N rows with per-row validation status
3. **Confirm & execute** — progress bar, cancel capability
4. **Summary** — created/failed counts with error details

**Key concerns:**
- Use a proper CSV parser (papaparse) — naive `split(",")` breaks on quoted fields
- Batch invalidation: invalidate queries once at the end, not per-row
- AbortController/ref pattern: check a `cancelled` flag each iteration so closing the dialog stops the loop
- Throttle progress updates (every N rows) to avoid excessive re-renders

## 5. Bidi Isolation in Bilingual UIs

In a bilingual Arabic/English app, user-generated content (account names) may be in either language. When Arabic text appears inside an English sentence (or vice versa), the Unicode bidirectional algorithm can produce garbled text.

**Solution:** Wrap user content in `<bdi>` elements, which isolate the directionality of their contents from surrounding text. The project's `lib/bidi.ts` utility also provides programmatic isolation.

**RTL tree considerations:**
- Use CSS logical properties (`padding-inline-start` not `padding-left`)
- Mirror directional icons: `ChevronRight` needs `rtl:rotate-180` so it points left in RTL
- `dir="auto"` on text inputs lets the browser detect content direction

## 6. Defensive Dialog Patterns

Radix UI dialogs have subtle lifecycle requirements:
- Never return `null` from a dialog component while `open` is true — this kills the exit animation
- Instead, always render the dialog wrapper and conditionally render the content inside
- Reset mutation state (`mutation.reset()`) when the dialog closes, so stale errors don't appear on the next open
- Reset file inputs (`input.value = ""`) to allow re-selecting the same file
