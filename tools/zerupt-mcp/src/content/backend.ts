/**
 * ContentBackend interface and shared types.
 */

export interface SearchHit {
  readonly path: string;
  readonly line?: number;
  readonly snippet: string;
}

export type SearchScope = 'specs' | 'code' | 'docs' | 'all';

export interface ContentBackend {
  /**
   * Read a file at the given virtual path. Throws if not found or denied.
   */
  getFile(path: string): Promise<string>;

  /**
   * List children of a virtual directory path.
   * Returns an array of virtual paths (files and dirs with trailing /).
   */
  listDir(path: string): Promise<readonly string[]>;

  /**
   * Search within the given scope. Returns up to 30 hits.
   */
  search(query: string, scope: SearchScope): Promise<readonly SearchHit[]>;
}
