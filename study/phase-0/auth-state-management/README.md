## 1. Supabase onAuthStateChange Events

**What:** A real-time listener that fires whenever the user's auth state changes in the browser.

**Why it matters:** Zerupt uses Supabase SSR with cookie-based sessions. The browser client needs to react to token refreshes, sign-outs (including from other tabs), and initial session hydration without manual polling.

**How it works:**
```ts
supabase.auth.onAuthStateChange((event, session) => {
  // event: INITIAL_SESSION | SIGNED_IN | SIGNED_OUT | TOKEN_REFRESHED | USER_UPDATED
});
```
- `INITIAL_SESSION` fires once on mount after reading the session from cookies
- `TOKEN_REFRESHED` fires automatically when Supabase rotates the access token (transparent to users)
- `SIGNED_OUT` fires on explicit sign-out OR when the refresh token expires
- Returns a subscription object — must call `.unsubscribe()` on cleanup to prevent memory leaks

**Resources:**
- [Supabase Auth State Change docs](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
- [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side/nextjs)

---

## 2. 401 Retry Pattern with Token Revalidation

**What:** An API client interceptor that catches 401 Unauthorized responses, attempts a silent session revalidation, and retries the request once before failing.

**Why it matters:** Access tokens expire. Between the time the client reads the token and the server validates it, the token may have expired. A single transparent retry avoids forcing the user to re-authenticate for a timing issue.

**Key concepts:**
- **Module-level promise lock:** Multiple concurrent 401s share one revalidation call, preventing a thundering herd of refresh requests
- **Single retry only:** Prevents infinite retry loops. If the retry also returns 401, the session is truly expired
- **Separation of concerns:** The API client throws errors; the AuthProvider handles navigation. Data layer should not own routing decisions

```ts
let refreshPromise: Promise<string | null> | null = null;

async function revalidateSession(): Promise<string | null> {
  if (refreshPromise) return refreshPromise; // deduplicate
  refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
  return refreshPromise;
}
```

**Resources:**
- [Axios interceptor pattern](https://axios-http.com/docs/interceptors) (same concept, different library)
- [OAuth 2.0 token refresh RFC 6749 Section 6](https://www.rfc-editor.org/rfc/rfc6749#section-6)

---

## 3. React Context for Auth State

**What:** A React Context provider that holds the current user, session, and loading state, plus a signOut function.

**Why it matters:** Every component in the app needs access to auth state (user info for display, session for API calls, loading state to prevent flash of unauthenticated content). Context avoids prop drilling through the entire tree.

**Key concepts:**
- Provider must be inside `QueryClientProvider` to access `useQueryClient()` for cache clearing on logout
- `useMemo` stabilizes the context value to prevent unnecessary re-renders
- `useCallback` stabilizes the `signOut` function reference
- `isLoading` starts `true` and becomes `false` after `INITIAL_SESSION` — consumers can show skeletons while auth resolves

**Resources:**
- [React Context docs](https://react.dev/reference/react/createContext)
- [Kent C. Dodds — How to use React Context effectively](https://kentcdodds.com/blog/how-to-use-react-context-effectively)

---

## 4. Cache Invalidation on Logout

**What:** Clearing all cached data (TanStack Query, Zustand stores) when a user signs out.

**Why it matters:** If user A logs out and user B logs in on the same browser, stale data from user A could appear. This is a security concern (data leakage between users) and a UX bug (wrong data displayed).

**How it works:**
- `queryClient.clear()` removes ALL queries and mutations from the TanStack Query cache
- Must happen AFTER `supabase.auth.signOut()` succeeds — if signOut fails, the user is still authenticated and clearing the cache would show empty screens
- Zustand stores: call their reset functions (add as stores are created)

**Resources:**
- [TanStack Query — QueryClient.clear()](https://tanstack.com/query/latest/docs/reference/QueryClient#queryclientclear)
