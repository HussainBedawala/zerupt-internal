/**
 * L5: tool error sanitisation tests — verify error paths go through sanitiseResponse.
 */
import { describe, it, expect } from 'vitest';
import type { ContentBackend, SearchHit, SearchScope } from '../content/backend.js';
import { getCodemap } from '../tools/get-codemap.js';
import { readFile } from '../tools/read-file.js';

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

describe('get-codemap error sanitisation (H4)', () => {
  it('returns a sanitised error string, not a raw exception', async () => {
    const result = await getCodemap(failingBackend, 'nonexistent');
    expect(result).toBeTruthy();
    // Must not expose raw filesystem paths to the client
    expect(result).not.toContain('/home/deploy');
    // Must be a string the caller can use (not thrown)
    expect(typeof result).toBe('string');
  });
});

describe('read-file access denied message', () => {
  it('returns access-denied for a blocked path without throwing', async () => {
    const result = await readFile(failingBackend, 'internal/agent-os/.env');
    expect(result).toMatch(/access denied/i);
  });
});
