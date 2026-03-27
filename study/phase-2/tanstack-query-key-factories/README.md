# TanStack Query Key Factories

## Why Query Keys Matter

TanStack Query uses query keys as cache identifiers. Every `useQuery` call associates data with a key, and `invalidateQueries` uses prefix matching to bust caches.

### The Problem with Inline Keys

```typescript
// Scattered across files — easy to typo, hard to refactor
queryKey: ["tenant", "accounts", "tree", params]
queryKey: ["tenant", "accounts", id]
invalidateQueries({ queryKey: ["tenant", "accounts"] })
```

- No single source of truth
- Typos cause silent cache misses
- Renaming a key requires find-and-replace across many files

### Query Key Factory Pattern

A factory is a plain object that produces keys hierarchically:

```typescript
export const accountKeys = {
  all: ["tenant", "accounts"] as const,
  tree: (params) => [...accountKeys.all, "tree", params] as const,
  detail: (id) => [...accountKeys.all, id] as const,
};
```

**Key insight:** TanStack Query matches keys by prefix. `invalidateQueries({ queryKey: accountKeys.all })` busts `tree`, `detail`, and `picker` caches because they all start with `["tenant", "accounts"]`.

### Granular vs Broad Invalidation

| Strategy | When to use |
|----------|------------|
| `accountKeys.all` | After create/delete (affects list + tree) |
| `accountKeys.detail(id)` | After single-entity update |
| `accountKeys.tree(params)` | After tree-specific operation |

Broad invalidation is simpler but causes unnecessary refetches. Granular invalidation is more efficient but requires understanding the cache hierarchy.

## Optimistic Updates

Optimistic updates show the expected result immediately, then reconcile with the server response.

### The Pattern

1. **`onMutate`** — Cancel in-flight queries, snapshot cache, apply optimistic state
2. **`onError`** — Rollback to snapshot
3. **`onSettled`** — Invalidate to get fresh server data regardless of success/failure

```typescript
onMutate: async (variables) => {
  await queryClient.cancelQueries({ queryKey: ... });  // prevent race conditions
  const previous = queryClient.getQueryData(key);       // snapshot for rollback
  queryClient.setQueryData(key, optimisticData);         // instant UI update
  return { previous };                                   // context for onError
},
onError: (err, vars, context) => {
  queryClient.setQueryData(key, context.previous);       // rollback
},
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: ... });      // reconcile with server
},
```

### Why `cancelQueries` is Critical

Without it, a background refetch that resolves between `onMutate` and `onSettled` can overwrite the optimistic state with stale data, making the rollback unreliable.

## Further Reading

- [TanStack Query: Query Key Factory](https://tanstack.com/query/latest/docs/framework/react/community/lukemorales-query-key-factory)
- [TanStack Query: Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
- [Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys)
