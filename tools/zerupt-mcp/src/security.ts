/**
 * Security: path allowlist/denylist, secret scrubbing, response size cap.
 */

export const RESPONSE_SIZE_CAP = 50_000;
export const TRUNCATION_SUFFIX = '\n\n...truncated, narrow your query';

// Allowlist: glob-style prefixes that are permitted
const ALLOWLIST_PREFIXES: readonly string[] = [
  'internal/agent-os/',
  'internal/study/',
  'erp/docs/',
  'erp/DESIGN.md',
  'erp/README.md',
  // code roots — erp/apps/*/src/** and erp/packages/*/src/**
  // validated via regex below
];

// Regex for code src allowlist
const CODE_SRC_RE = /^erp\/(apps|packages)\/[^/]+\/src\//;

// Denylist: path segment patterns that are always blocked
const DENYLIST_SEGMENTS: readonly RegExp[] = [
  /^\.env/i,
  /\.pem$/i,
  /\.key$/i,
  /^node_modules$/,
  /^\.git$/,
  /^dist$/,
  /^coverage$/,
  /^secrets$/,
  /^credentials$/,
  /^drizzle$/,  // drizzle/meta
];

// Secret patterns to redact (M2: bounded quantifiers to prevent ReDoS)
const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-[A-Za-z0-9]{20,80}/g,
  /ghp_[A-Za-z0-9]{36,80}/g,
  /github_pat_[A-Za-z0-9_]{20,80}/g,
  /AKIA[0-9A-Z]{16}/g,
  // JWT: three dot-separated base64url segments — bounded to prevent catastrophic backtrack
  /eyJ[A-Za-z0-9_-]{10,500}\.[A-Za-z0-9_-]{10,500}\.[A-Za-z0-9_-]{10,500}/g,
  // postgres DSN: postgres://user:pass@host/db — non-whitespace/quote chars, bounded
  /postgres:\/\/[^\s"':@]{1,100}:[^\s"'@]{1,200}@[^\s"']{1,300}/gi,
  // Generic URL credentials: https?://user:pass@host — bounded character classes
  /https?:\/\/[^\s"':@]{1,100}:[^\s"'@]{1,200}@[^\s"']{1,300}/gi,
];

/**
 * Normalise a virtual path: URL-decode (M1), collapse separators, strip leading slash.
 * Decoding happens before traversal checks so %2e%2e%2f is caught.
 */
export function normalisePath(raw: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding — treat as literal string
    decoded = raw;
  }
  return decoded
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\//, '')
    .trim();
}

/**
 * Reject path traversal and validate against allowlist/denylist.
 * Returns null if allowed, or an error message string if denied.
 */
export function checkPathAllowed(virtualPath: string): string | null {
  const p = normalisePath(virtualPath);

  // Block path traversal
  if (p.includes('..') || p.startsWith('/')) {
    return `Path traversal denied: ${virtualPath}`;
  }

  // Check each segment against denylist
  const segments = p.split('/');
  for (const segment of segments) {
    for (const deny of DENYLIST_SEGMENTS) {
      if (deny.test(segment)) {
        return `Path segment denied by denylist: ${segment}`;
      }
    }
  }

  // Check allowlist
  const allowed =
    ALLOWLIST_PREFIXES.some((prefix) => p === prefix.replace(/\/$/, '') || p.startsWith(prefix)) ||
    CODE_SRC_RE.test(p);

  if (!allowed) {
    return `Path not in allowlist: ${virtualPath}`;
  }

  return null;
}

/**
 * Scrub secrets from a string, replacing them with [REDACTED].
 */
export function scrubSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex for global regexes
    const re = new RegExp(pattern.source, pattern.flags);
    result = result.replace(re, '[REDACTED]');
  }
  return result;
}

/**
 * Cap response to RESPONSE_SIZE_CAP characters, appending truncation suffix if needed.
 */
export function capResponse(text: string): string {
  if (text.length <= RESPONSE_SIZE_CAP) return text;
  return text.slice(0, RESPONSE_SIZE_CAP) + TRUNCATION_SUFFIX;
}

/**
 * Full pipeline: scrub then cap.
 */
export function sanitiseResponse(raw: string): string {
  return capResponse(scrubSecrets(raw));
}
