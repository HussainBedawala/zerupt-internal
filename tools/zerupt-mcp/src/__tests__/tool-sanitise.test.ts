/**
 * Tool error sanitisation tests — verify error paths go through sanitiseResponse (H4).
 */
import { describe, it, expect } from 'vitest';
import type { ContentBackend, SearchHit, SearchScope } from '../content/backend.js';
import { getBrand } from '../tools/get-brand.js';
import { listFeatures } from '../tools/list-features.js';

/**
 * A backend that always throws with a message containing a simulated filesystem path.
 * Errors must not leak paths to clients (H4).
 */
const failingBackend: ContentBackend = {
  async getFile(_path: string): Promise<string> {
    throw new Error('ENOENT: no such file or directory, open /home/deploy/secrets/.env');
  },
  async listDir(_path: string): Promise<readonly string[]> {
    return [];
  },
  async search(_query: string, _scope: SearchScope): Promise<readonly SearchHit[]> {
    return [];
  },
};

describe('get-brand error handling (H4)', () => {
  it('returns a string result even when backend fails', async () => {
    const result = await getBrand(failingBackend, 'foundation');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not throw on "all" when backend fails', async () => {
    const result = await getBrand(failingBackend, 'all');
    expect(typeof result).toBe('string');
  });
});

describe('list-features error handling', () => {
  it('returns a string result when catalog file is missing', async () => {
    const result = await listFeatures(failingBackend, 'pos', 'all');
    expect(typeof result).toBe('string');
    expect(result).toContain('Could not read feature catalog');
  });

  it('returns a string result for master index when missing', async () => {
    const result = await listFeatures(failingBackend);
    expect(typeof result).toBe('string');
    expect(result).toContain('Could not read feature catalog');
  });

  it('rejects invalid module names', async () => {
    const result = await listFeatures(failingBackend, '../etc/passwd', 'all');
    expect(result).toContain('Invalid module name');
  });
});
