/**
 * Simple per-token sliding-window rate limiter (in-memory).
 *
 * H3 ACCEPTED RISK: This limiter is in-process only. State resets on restart and is not
 * shared across multiple instances. For v1 (single Railway instance) this is acceptable.
 * A future multi-instance deployment should replace this with a Redis-backed limiter.
 */

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;

interface RequestRecord {
  readonly timestamps: readonly number[];
}

const store = new Map<string, RequestRecord>();

/**
 * Record a request for the given key and check if it's within limits.
 * Returns true if allowed, false if rate-limited.
 */
export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const existing = store.get(key);
  const timestamps = existing?.timestamps ?? [];

  // Slide window: keep only timestamps within the window
  const recent = timestamps.filter((t) => t > windowStart);

  if (recent.length >= MAX_REQUESTS) {
    store.set(key, { timestamps: recent });
    return false;
  }

  store.set(key, { timestamps: [...recent, now] });
  return true;
}

/**
 * For testing: reset all state.
 */
export function resetRateLimiter(): void {
  store.clear();
}
