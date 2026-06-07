/**
 * GitHub REST API ContentBackend.
 *
 * Reads from two repos:
 *   internal/... → HussainBedawala/zerupt-internal
 *   erp/...      → HussainBedawala/zerupt-erp
 *
 * Uses GitHub Contents API + Code Search.
 * In-memory cache with 5-min TTL keyed by "repo:path".
 * Cache is capped at MAX_CACHE_ENTRIES (H7: prevents unbounded growth).
 */
import { checkPathAllowed, normalisePath } from '../security.js';
import type { ContentBackend, SearchHit, SearchScope } from './backend.js';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 500; // H7: bounded cache
const FETCH_TIMEOUT_MS = 10_000; // M8: 10s timeout on all GitHub fetches
const MAX_SEARCH_RESULTS = 30;
const GITHUB_API = 'https://api.github.com';

const REPO_INTERNAL = 'HussainBedawala/zerupt-internal';
const REPO_ERP = 'HussainBedawala/zerupt-erp';

interface CacheEntry {
  readonly value: unknown;
  readonly expiresAt: number;
}

// Insertion-ordered map so oldest entry is first (Map preserves insertion order)
const cache = new Map<string, CacheEntry>();

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function cacheSet(key: string, value: unknown): void {
  // H7: evict oldest entry when at capacity
  if (cache.size >= MAX_CACHE_ENTRIES && !cache.has(key)) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Scope → GitHub search qualifiers
const SCOPE_PATHS: Record<string, { repo: string; pathPrefix?: string }[]> = {
  specs: [{ repo: REPO_INTERNAL, pathPrefix: 'agent-os' }],
  docs: [
    { repo: REPO_ERP, pathPrefix: 'docs' },
    { repo: REPO_INTERNAL, pathPrefix: 'study' },
  ],
  code: [{ repo: REPO_ERP }],
  all: [{ repo: REPO_INTERNAL }, { repo: REPO_ERP }],
};

interface GithubContentFile {
  type: 'file' | 'dir' | 'symlink';
  name: string;
  path: string;
  content?: string;
  encoding?: string;
  sha: string;
  size: number;
}

interface GithubCodeSearchItem {
  path: string;
  repository: { full_name: string };
  text_matches?: Array<{
    fragment: string;
    matches: Array<{ text: string; indices: number[] }>;
  }>;
}

/**
 * Encode a relative path for the GitHub Contents API (H1).
 * Splits on "/" and encodes each segment individually.
 */
function encodeRelPath(relPath: string): string {
  return relPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * Sanitise a search query to prevent GitHub search qualifier injection (H2).
 * Removes qualifier syntax (key:value) and wraps in double-quotes.
 */
function sanitiseSearchQuery(raw: string): string {
  // Strip qualifier patterns like "repo:", "org:", "path:", "in:", etc.
  const stripped = raw.replace(/[A-Za-z_-]+:[^\s]*/g, '').trim();
  // Strip internal double-quotes to avoid breaking the enclosing ones
  const safe = stripped.replace(/"/g, '');
  return `"${safe}"`;
}

export class GitHubBackend implements ContentBackend {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'zerupt-mcp/0.1.0',
    };
  }

  private repoAndRelPath(virtualPath: string): { repo: string; relPath: string } {
    const p = normalisePath(virtualPath);
    if (p === 'internal' || p.startsWith('internal/')) {
      return {
        repo: REPO_INTERNAL,
        relPath: p === 'internal' ? '' : p.slice('internal/'.length),
      };
    }
    return {
      repo: REPO_ERP,
      relPath: p === 'erp' ? '' : p.slice('erp/'.length),
    };
  }

  /**
   * Fetch from GitHub with a hard timeout (M8) and caching.
   * On non-OK responses: logs body server-side, throws sanitised error (M4).
   */
  private async fetchGitHub<T>(url: string, extraHeaders?: Record<string, string>): Promise<T | null> {
    const cached = cacheGet<T>(url);
    if (cached !== null) return cached;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { ...this.headers(), ...extraHeaders },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      // M4: log raw body server-side, never expose it to clients
      const body = await res.text().catch(() => '(unreadable)');
      console.error(`[zerupt-mcp] GitHub API error ${res.status} for ${url}: ${body}`);
      throw new Error(`GitHub API error ${res.status}`);
    }
    const data = (await res.json()) as T;
    cacheSet(url, data);
    return data;
  }

  async getFile(virtualPath: string): Promise<string> {
    const denied = checkPathAllowed(virtualPath);
    if (denied) throw new Error(denied);

    const { repo, relPath } = this.repoAndRelPath(virtualPath);
    // H1: encode each path segment individually
    const url = `${GITHUB_API}/repos/${repo}/contents/${encodeRelPath(relPath)}`;
    const data = await this.fetchGitHub<GithubContentFile>(url);

    if (!data) throw new Error(`File not found: ${virtualPath}`);
    if (data.type !== 'file') throw new Error(`Not a file: ${virtualPath}`);
    if (!data.content) throw new Error(`No content returned for: ${virtualPath}`);

    const decoded = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
    return decoded;
  }

  async listDir(virtualPath: string): Promise<readonly string[]> {
    const p = normalisePath(virtualPath);
    if (p.includes('..')) throw new Error(`Path traversal denied: ${virtualPath}`);

    const { repo, relPath } = this.repoAndRelPath(virtualPath);
    // H1: encode each path segment individually
    const url = `${GITHUB_API}/repos/${repo}/contents/${encodeRelPath(relPath)}`;
    const data = await this.fetchGitHub<GithubContentFile[]>(url);
    if (!data) throw new Error(`Directory not found: ${virtualPath}`);
    if (!Array.isArray(data)) throw new Error(`Not a directory: ${virtualPath}`);

    return data.map((entry) => {
      const childVirtual = p ? `${p}/${entry.name}` : entry.name;
      return entry.type === 'dir' ? `${childVirtual}/` : childVirtual;
    });
  }

  async search(query: string, scope: string): Promise<readonly SearchHit[]> {
    const targets = SCOPE_PATHS[scope] ?? SCOPE_PATHS['all'];
    if (!targets) return [];

    const hits: SearchHit[] = [];
    // H9: track errors so we can surface them if all repos fail
    let errorCount = 0;
    let lastErrorStatus = 0;

    // H2: sanitise the query before building the GitHub search URL
    const safeQuery = sanitiseSearchQuery(query);

    for (const { repo, pathPrefix } of targets) {
      if (hits.length >= MAX_SEARCH_RESULTS) break;

      let q = `${safeQuery}+repo:${repo}`;
      if (pathPrefix) q += `+path:${pathPrefix}`;

      const url = `${GITHUB_API}/search/code?q=${q}&per_page=30`;
      const cacheKey = `search:${url}`;
      let result = cacheGet<{ items: GithubCodeSearchItem[] }>(cacheKey);
      if (!result) {
        const searchHeaders = {
          Accept: 'application/vnd.github.text-match+json',
        };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        let res: Response;
        try {
          res = await fetch(url, {
            headers: { ...this.headers(), ...searchHeaders },
            signal: controller.signal,
          });
        } catch {
          errorCount++;
          continue;
        } finally {
          clearTimeout(timer);
        }

        if (!res.ok) {
          // H9: warn with status + repo; track for surface-up
          lastErrorStatus = res.status;
          console.warn(
            `[zerupt-mcp] GitHub search error ${res.status} for repo=${repo} query=${query}`,
          );
          errorCount++;
          continue;
        }
        result = (await res.json()) as { items: GithubCodeSearchItem[] };
        cacheSet(cacheKey, result);
      }

      for (const item of result.items) {
        if (hits.length >= MAX_SEARCH_RESULTS) break;
        const virtualPath =
          repo === REPO_INTERNAL ? `internal/${item.path}` : `erp/${item.path}`;
        const snippet =
          item.text_matches?.[0]?.fragment?.trim().slice(0, 200) ?? `Match in ${item.path}`;
        hits.push({ path: virtualPath, snippet });
      }
    }

    // H9: if ALL repos errored, surface a clear message instead of silently returning []
    if (errorCount === targets.length && hits.length === 0) {
      const isRateLimit = lastErrorStatus === 403 || lastErrorStatus === 429;
      const msg = isRateLimit
        ? 'Search temporarily unavailable (GitHub rate limited). Try again in a moment.'
        : 'Search temporarily unavailable. Try again in a moment.';
      return [{ path: '', snippet: msg }];
    }

    return hits.slice(0, MAX_SEARCH_RESULTS);
  }
}

export function createGitHubBackend(): GitHubBackend {
  const token = process.env['GITHUB_TOKEN'];
  if (!token) throw new Error('GITHUB_TOKEN env var required for GitHub backend');
  return new GitHubBackend(token);
}
