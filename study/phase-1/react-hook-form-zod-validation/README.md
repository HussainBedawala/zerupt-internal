## 1. React Hook Form + Zod: Schema-Driven Form Validation

**What:** React Hook Form is a performant form library that uses uncontrolled components and ref-based registration. Combined with Zod (a TypeScript-first schema validator), it provides type-safe form validation where the schema is the single source of truth for both runtime validation and TypeScript types.

**Why it matters:** Zerupt's configuration UIs (currency, fiscal, tax, numbering) all need validated forms. Manual `useState` + `validate()` patterns (like the earlier branch-dialog) are error-prone and verbose. React Hook Form + Zod eliminates duplicate type definitions, reduces re-renders, and gives you `z.infer<typeof schema>` for free — the form's TypeScript type is always in sync with the validation rules.

**How it works / Key concepts:**

The integration works through three layers:

```typescript
// 1. Define the schema (single source of truth)
const schema = z.object({
  code: z.string().regex(/^[A-Z]{3}$/, "Must be 3 uppercase letters"),
  name: z.string().min(1).max(100),
  decimalPlaces: z.number().int().min(0).max(4),
});

// 2. Infer the TypeScript type from the schema
type FormValues = z.infer<typeof schema>;
// → { code: string; name: string; decimalPlaces: number }

// 3. Wire into useForm with zodResolver
const form = useForm<FormValues>({
  resolver: zodResolver(schema),
  defaultValues: { code: "", name: "", decimalPlaces: 2 },
});
```

**Key patterns used in Zerupt:**

- **zodResolver bridge:** `@hookform/resolvers/zod` adapts Zod's validation to React Hook Form's resolver interface. Works with Zod v3 and v4.
- **Controller for non-native inputs:** shadcn `Select`, `Switch`, etc. need `<Controller>` since they don't expose a native `ref`. `<FormField>` (shadcn wrapper) handles this.
- **Derive enums from constants:** `z.enum(DOCUMENT_TYPES)` instead of hardcoding `z.enum(["POS", "SO", ..."])` — prevents drift between types and validation.
- **`watch()` for reactive UI:** `watch("fieldName")` returns the current value reactively (e.g., live preview in numbering dialog, conditional fields in fiscal year dialog).

**Resources:**
- [React Hook Form docs — useForm](https://react-hook-form.com/docs/useform)
- [shadcn/ui Form component](https://ui.shadcn.com/docs/components/form)
- [@hookform/resolvers — Zod](https://github.com/react-hook-form/resolvers#zod)


## 2. TanStack Query: Server State Management Patterns

**What:** TanStack Query (React Query) manages server state — fetching, caching, synchronizing, and updating data from APIs. It separates server state (what the API says) from client state (UI state like form inputs, modals, filters).

**Why it matters:** Every Zerupt settings panel fetches data from the NestJS API and needs to handle loading, error, stale data, and optimistic updates. TanStack Query provides this out of the box with query invalidation on mutations, automatic refetch, and cache deduplication.

**How it works / Key concepts:**

```typescript
// Query keys are arrays — hierarchical for targeted invalidation
const CURRENCIES_KEY = ["tenant", "currencies"] as const;

// Queries: declarative data fetching
function useCurrenciesQuery(isActive?: boolean) {
  return useQuery({
    queryKey: [...CURRENCIES_KEY, { isActive }],
    queryFn: () => fetchCurrencies({ isActive }),
  });
}

// Mutations: fire-and-forget with cache invalidation
function useCreateCurrencyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => createCurrency(payload),
    onSuccess: () => {
      // Invalidates ALL queries starting with ["tenant", "currencies"]
      queryClient.invalidateQueries({ queryKey: CURRENCIES_KEY });
    },
  });
}
```

**Key patterns used in Zerupt:**

- **Query key hierarchy:** `["tenant", "currencies", { isActive }]` — invalidating `["tenant", "currencies"]` busts all currency queries regardless of filter params.
- **Conditional queries:** `enabled: !!legalEntityId` — fiscal/tax queries only fire when a legal entity is selected.
- **Mutation chaining:** `mutate(payload, { onSuccess: () => setDialogOpen(false) })` — close dialog only on success, not on error.
- **Query/mutation separation:** API client functions are pure (return Promises), query hooks wrap them with caching semantics. This keeps the API layer testable without React.

**Resources:**
- [TanStack Query — Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys)
- [TanStack Query — Mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations)


## 3. Feature Module Architecture: Vertical Slices

**What:** Each settings domain (currencies, fiscal, taxation, numbering) is organized as a self-contained feature module with its own types, API client, query hooks, and components. This is the "vertical slice" or "feature folder" pattern.

**Why it matters:** As Zerupt grows to 8+ phases with dozens of modules, horizontal organization (all types in `/types`, all API calls in `/api`) becomes unnavigable. Vertical slices mean everything related to "currencies" lives in `features/currencies/` — you can understand the entire feature by reading one directory.

**How it works / Key concepts:**

```
features/currencies/
├── types.ts              # All TypeScript interfaces + enum constants
├── api/
│   ├── currencies-api.ts    # Pure API client functions (no React)
│   └── currencies-queries.ts # TanStack Query hooks (React)
├── components/
│   ├── currencies-panel.tsx     # Main entry point (orchestrator)
│   ├── currency-policy-card.tsx # Sub-component
│   ├── currencies-table.tsx     # Sub-component
│   └── currency-dialog.tsx      # Sub-component
└── index.ts              # Public API (re-exports only the panel)
```

**Rules:**
- `index.ts` exports ONLY the panel component — internal components are not public.
- Types mirror the API response shapes (readonly, immutable).
- API client functions are framework-agnostic (can be used outside React).
- Query hooks are the only place where TanStack Query is used.
- Components are `"use client"` (client components for interactivity).

**Resources:**
- [Feature-Sliced Design](https://feature-sliced.design/)
- [Bulletproof React — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
