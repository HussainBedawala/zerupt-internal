# Multi-Step Wizard UX Patterns

**Phase 5 · DEV-295** — concepts, trade-offs, and gotchas behind the AI data import wizard UI.

## 1. Wizard state: `useReducer` over Zustand

For a single-screen, single-user, ephemeral flow like an import wizard, a `useReducer` with a finite-state-machine reducer beats Zustand:

- **Discoverability:** every transition is a labeled action. Reading `wizardReducer` once tells you the entire shape of the flow.
- **Testability:** the reducer is pure. Transitions test in microseconds without React, jsdom, or storage stubs.
- **Rejected transitions are free:** `state.step !== "upload" → return state` blocks out-of-order dispatches without any lock/guard scaffolding around the dispatcher.
- **No global pollution:** Zustand's value is cross-component sharing. A wizard owns its tree; sharing is anti-value.

When you'd reach for Zustand instead: when independent panels (e.g. a sidebar progress rail + a header summary + the active step) need to read/write the same state without prop-drilling. We don't have that here — the wizard shell controls everything.

## 2. The sessionStorage temptation

Persisting `{step, jobId}` to `sessionStorage` on every transition seems trivially correct ("tab reload won't lose progress"). It isn't.

**The trap:** writes are easy, restoration isn't. To restore on mount you need to know which `jobId` to look up *before* you've rendered the upload step. Without a URL `?jobId=` param or a key-prefix scan, the writes never get read. Dead state accumulates in the browser, the comment "so a tab reload doesn't lose progress" lies, and reviewers/observers waste cycles tracing the apparent flow.

**Lesson:** persistence is a contract. If you can't honour the *read* side, don't ship the *write* side. We tore the writes out and documented the conditions under which to add it back (URL param + tenant scoping).

## 3. Synchronous API + 5-minute apply: AbortController → poll fallback

Our backend's apply endpoint is synchronous — a 50k-row file blocks until commit. HTTP timeouts (proxies, mobile networks, Cloudflare) eat the response somewhere between 30s and 5min. A naive client just hangs and eventually surfaces a confusing failure.

**Pattern:**

1. Wrap the mutation call in an `AbortController` with a 5min `setTimeout`.
2. On `AbortError` (browser DOMException OR a duck-typed `name === "AbortError"` for Node/jsdom test environments), don't surface failure — *flip to polling*.
3. Polling reuses the existing `useImportJobQuery` with `refetchInterval: 2000` and `enabled: polling`. When the server reports `Applied`, synthesize an `ApplyResponse` from the (limited) data the GET returns and complete the flow.
4. On `Failed`/`RolledBack`, surface the error.

**The synthetic response is honest:** we know `appliedCount` (server returns it on the GET), but `skippedCount`/`failedChunks`/`autoCreated*` are zero-by-default in the polled path. Document this. Don't pretend the polling path returns the same fidelity as the direct response.

**Cleanup discipline:** the `AbortController` and timer must be torn down on unmount. Async mutation callbacks fire after unmount and will `setState` on a dead component. Use a `mountedRef` guard + an effect cleanup that aborts the controller and clears the timer. React 18 won't crash but the warning is correct — the pattern is racy without it.

## 4. React 18 automatic batching ate the success CTAs

This is the most surprising bug in the wizard. Pseudocode of the buggy version:

```tsx
function ApplyStep({ onDone }) {
  const [result, setResult] = useState(null);
  apply.mutate(payload, {
    onSuccess: (data) => {
      setResult(data);   // (1)
      onDone(data);      // (2) → parent dispatches APPLIED → step="done"
    },
  });
  if (result) return <SuccessView withCTAs />;  // (3) never reached
  return <Form />;
}
```

(1) and (2) are batched. The parent re-renders with `step="done"`, unmounts `ApplyStep`, and (3) is never evaluated. The success view exists in code but is structurally unreachable.

**Lesson:** any state machine where a child both *signals success upward* and *renders the success UI itself* is a trap under React 18 batching. Pick one:

- **Move the success UI to the parent's terminal-state branch.** Pass `viewListHref` / `nextEntity` props to the parent and render them when `step === "done"`. ApplyStep just signals via `onDone`. ← What we did.
- **Defer the upward signal.** ApplyStep renders its own success view; the user clicks a "Done" button to advance the parent. More clicks, more states; rejected for a feel-fast import flow.

**Test discipline:** unit tests passed because they mocked the parent's reducer transitions and asserted on intermediate `setResult`, never on what an end-user actually sees. Integration tests caught it (frontend-reviewer caught it visually before integration tests ran). Lesson: at least one test should walk the success path with the real reducer, not a mock.

## 5. 409 Conflict is success, not error

When apply succeeds and the user retries (network glitch, double-click, sessionStorage replay), the server returns `409 Conflict — already applied`. This is *idempotent success*. UX implications:

- Don't toast an error. The user did the right thing — the import is already done.
- Advance the wizard to its terminal state with a friendly message ("This file was already imported"), not the regular success copy.
- Synthesize an `ApplyResponse` and pass it via `onDone(synthetic, { alreadyApplied: true })` so the wizard's reducer + view branch follow the same code path as a fresh apply.

The temptation is to short-circuit and render an inline "already applied" banner from inside ApplyStep without dispatching APPLIED. **Don't.** The state machine becomes inconsistent — `step === "apply"` while the user sees a success view, sessionStorage (if you had it) is stale, and the wizard's "done" CTAs are unreachable. Always advance the state machine on idempotent success.

## 6. Confidence-color mapping is product policy, not brand

Brand books rarely define a quantitative-confidence color scale (success/warning/destructive). The import spec defines thresholds (≥0.9 / 0.75–0.89 / <0.75) but not colors. **Map them in the component, document the mapping in JSDoc citing the spec.** Don't invent a new "confidence-orange" semantic token — that locks future products into a triple they may not need. Reuse existing `success`/`warning` tokens and let the brand evolve.

The same logic applies to the rung-5 LLM clamp: the API guarantees LLM suggestions never carry `band: "auto"` even at high confidence. The badge component honours an explicit `band` override that wins over the raw score, so the visual tier reflects "auto-applicable" rather than raw confidence — a subtle but meaningful distinction.

## 7. Display-only AI fix suggestions when persistence isn't built

Backend has no endpoint to write applied fixes back. Two options:

- **Hide the suggestions entirely** — but then the AI's value is invisible to the user.
- **Show them with honest copy** — "AI suggested N fixes — edit your source file and re-upload to apply." This is what we shipped.

The temptation in between is to *appear* to apply fixes by mutating local row state and re-running validation. This **lies to the user** — they think they fixed something, but the next apply uses the original staged rows. Cardinal rule: never show a UI that suggests an action the system can't honour.

## 8. The cross-entity hub status proxy

The hub needs to show "you've imported X products" or "import categories first" gating. There's no `/imports?status=Applied&entityType=product` endpoint. We proxy via the entity's own list-count query (`useItemsQuery({ limit: 1 }).data.meta.total`). It's a soft inference — a tenant who manually created products without import will show as "imported" — but for the gating contract ("can I import products yet?") it answers correctly: if the prerequisite has data, you can proceed.

When the import-job-list endpoint lands, swap the count check for `getJobs({ status: "Applied", entityType }).length > 0`. Until then, the proxy is honest about being a proxy in the codemap and JSDoc.

## 9. Why `useReducer` not URL-driven step state

For wizards on a single page, URL-driven steps (`?step=mapping`) are tempting:

- ✅ deep-linking to a step
- ✅ browser back/forward
- ✅ resume after refresh

But:

- ❌ users can teleport to step 4 on a fresh tab and the wizard explodes (no `jobId`, no upload, no mapping)
- ❌ all the guard logic moves to "validate I have the data this step needs" instead of "the reducer guarantees I have it"
- ❌ analytics noise (every URL change is a navigation event)

For a sequential, resumable-only-in-the-same-session flow with strong inter-step data dependencies, in-memory `useReducer` is simpler and safer. URL-driven works when steps are mostly independent (settings panels, multi-page forms with auto-save).

## Related study

- `study/phase-5/import-orchestration-state-machine/` — the **backend** state machine that this UI wraps
- `study/phase-5/ai-import-resolution-ladder/` — the column-mapping resolution rungs the UI surfaces via `ConfidenceBadge`

## Source pointers

- `erp/apps/web/src/features/import/hooks/use-import-wizard.ts` (reducer)
- `erp/apps/web/src/features/import/components/apply-step.tsx` (AbortController + polling)
- `erp/apps/web/src/features/import/components/import-wizard.tsx` (terminal-state branch owns success CTAs)
- `erp/docs/CODEMAPS/import.md` (full module map)
