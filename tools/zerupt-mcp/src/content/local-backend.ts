/**
 * Local filesystem ContentBackend.
 *
 * Rooted at LOCAL_CONTENT_ROOT env var (e.g. /Users/hus3ain/Development/Zerupt).
 * Virtual paths:
 *   internal/... → <root>/
 *   erp/...      → <root>/erp/
 */
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { checkPathAllowed, normalisePath } from '../security.js';
import type { ContentBackend, SearchHit, SearchScope } from './backend.js';

const MAX_SEARCH_RESULTS = 30;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB guard

// Scope → virtual path prefixes to scan
const SCOPE_ROOTS: Record<SearchScope, readonly string[]> = {
  specs: ['internal/agent-os'],
  docs: ['erp/docs', 'internal/study'],
  code: ['erp/apps', 'erp/packages'],
  all: ['internal/agent-os', 'internal/study', 'erp/docs', 'erp/apps', 'erp/packages'],
};

export class LocalBackend implements ContentBackend {
  private readonly root: string;
  /** Promise that resolves to the real (symlink-resolved) root path. */
  private readonly realRoot: Promise<string>;

  constructor(contentRoot: string) {
    this.root = resolve(contentRoot);
    // C2: pre-resolve root so symlink checks compare canonical paths
    this.realRoot = realpath(this.root).catch(() => this.root);
  }

  /**
   * Resolve a virtual path to an absolute filesystem path.
   * internal/... → <root>/...  (strip "internal/" prefix — it's the root)
   * erp/...      → <root>/erp/...
   */
  private resolveVirtual(virtualPath: string): string {
    const p = normalisePath(virtualPath);
    let rel: string;
    if (p.startsWith('internal/')) {
      rel = p.slice('internal/'.length);
    } else if (p === 'internal') {
      rel = '';
    } else {
      // erp/... or erp/DESIGN.md etc.
      rel = p;
    }
    const abs = resolve(join(this.root, rel));
    // Guard against traversal even after normalization
    if (!abs.startsWith(this.root + '/') && abs !== this.root) {
      throw new Error(`Path traversal attempt blocked: ${virtualPath}`);
    }
    return abs;
  }

  async getFile(virtualPath: string): Promise<string> {
    const denied = checkPathAllowed(virtualPath);
    if (denied) throw new Error(denied);

    const abs = this.resolveVirtual(virtualPath);

    // C2: resolve symlinks and verify the real path stays under root
    const [real, rootReal] = await Promise.all([
      realpath(abs).catch(() => null),
      this.realRoot,
    ]);
    if (!real) throw new Error(`File not found: ${virtualPath}`);
    if (!real.startsWith(rootReal + '/') && real !== rootReal) {
      throw new Error(`Symlink escape blocked: ${virtualPath}`);
    }

    const info = await stat(real).catch(() => null);
    if (!info) throw new Error(`File not found: ${virtualPath}`);
    if (!info.isFile()) throw new Error(`Not a file: ${virtualPath}`);
    if (info.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File too large to read directly: ${virtualPath} (${info.size} bytes)`);
    }

    return readFile(real, 'utf-8');
  }

  async listDir(virtualPath: string): Promise<readonly string[]> {
    // C3: apply the same allowlist + denylist checks as getFile
    const denied = checkPathAllowed(virtualPath);
    if (denied) throw new Error(denied);

    const p = normalisePath(virtualPath);

    const abs = this.resolveVirtual(virtualPath);

    // C2/C3: resolve symlinks and verify the real path stays under root
    const [real, rootReal] = await Promise.all([
      realpath(abs).catch(() => null),
      this.realRoot,
    ]);
    if (!real) throw new Error(`Directory not found: ${virtualPath}`);
    if (!real.startsWith(rootReal + '/') && real !== rootReal) {
      throw new Error(`Symlink escape blocked: ${virtualPath}`);
    }

    const info = await stat(real).catch(() => null);
    if (!info) throw new Error(`Directory not found: ${virtualPath}`);
    if (!info.isDirectory()) throw new Error(`Not a directory: ${virtualPath}`);

    const entries = await readdir(real, { withFileTypes: true });
    // C3/M3: filter denylisted entries from listings
    return entries
      .filter((e) => !isDenylistedSegment(e.name))
      .map((e) => {
        const childVirtual = p ? `${p}/${e.name}` : e.name;
        return e.isDirectory() ? `${childVirtual}/` : childVirtual;
      });
  }

  async search(query: string, scope: SearchScope): Promise<readonly SearchHit[]> {
    const roots = SCOPE_ROOTS[scope];
    const hits: SearchHit[] = [];
    const queryLower = query.toLowerCase();

    for (const root of roots) {
      if (hits.length >= MAX_SEARCH_RESULTS) break;
      await this.searchDir(root, queryLower, hits);
    }

    return hits.slice(0, MAX_SEARCH_RESULTS);
  }

  private async searchDir(
    virtualDir: string,
    queryLower: string,
    hits: SearchHit[],
  ): Promise<void> {
    if (hits.length >= MAX_SEARCH_RESULTS) return;

    const abs = this.resolveVirtual(virtualDir);
    const info = await stat(abs).catch(() => null);
    if (!info?.isDirectory()) return;

    const entries = await readdir(abs, { withFileTypes: true });
    for (const entry of entries) {
      if (hits.length >= MAX_SEARCH_RESULTS) break;

      const childVirtual = `${virtualDir}/${entry.name}`;

      if (entry.isDirectory()) {
        // For directories, only block denylist segments (not full allowlist check,
        // since intermediate dirs like erp/apps/api are not in the allowlist).
        const denied = isDenylistedSegment(entry.name);
        if (denied) continue;
        await this.searchDir(childVirtual, queryLower, hits);
      } else if (entry.isFile() && isTextFile(entry.name) && !isDenylistedSegment(entry.name)) {
        // L2: also filter denylisted file names; then apply full allowlist + denylist check
        const denied = checkPathAllowed(childVirtual);
        if (denied) continue;
        const absFile = join(abs, entry.name);
        const fileStat = await stat(absFile).catch(() => null);
        if (!fileStat || fileStat.size > MAX_FILE_SIZE_BYTES) continue;

        const content = await readFile(absFile, 'utf-8').catch(() => null);
        if (!content) continue;

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (hits.length >= MAX_SEARCH_RESULTS) break;
          const line = lines[i] ?? '';
          if (line.toLowerCase().includes(queryLower)) {
            hits.push({
              path: childVirtual,
              line: i + 1,
              snippet: line.trim().slice(0, 200),
            });
          }
        }
      }
    }
  }
}

// Denylist segments — mirrors security.ts but kept local to avoid import coupling
const DENYLIST_SEGMENT_RE: readonly RegExp[] = [
  /^\.env/i,
  /\.pem$/i,
  /\.key$/i,
  /^node_modules$/,
  /^\.git$/,
  /^dist$/,
  /^coverage$/,
  /^secrets$/,
  /^credentials$/,
  /^drizzle$/,
];

function isDenylistedSegment(segment: string): boolean {
  return DENYLIST_SEGMENT_RE.some((re) => re.test(segment));
}

function isTextFile(name: string): boolean {
  return /\.(md|ts|tsx|js|jsx|json|yaml|yml|txt|sql|py|sh|env\.example|toml|css|html)$/i.test(
    name,
  );
}

/**
 * Create LocalBackend from env or throw.
 */
export function createLocalBackend(): LocalBackend {
  const root = process.env['LOCAL_CONTENT_ROOT'];
  if (!root) {
    throw new Error('LOCAL_CONTENT_ROOT env var is required for local backend');
  }
  return new LocalBackend(root);
}
