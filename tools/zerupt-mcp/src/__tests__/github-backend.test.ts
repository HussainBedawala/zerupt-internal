/**
 * GitHub backend focused tests — mock fetch, cache TTL, 403 warn, URL encoding.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubBackend } from '../content/github-backend.js';

const GITHUB_API = 'https://api.github.com';

// Helper to create a mock Response
function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GitHubBackend — URL encoding (H1)', () => {
  it('encodes special characters in path segments', async () => {
    const backend = new GitHubBackend('test-token');
    const mockFetch = vi.mocked(fetch);

    mockFetch.mockResolvedValueOnce(
      mockResponse(200, {
        type: 'file',
        name: 'mission.md',
        path: 'agent-os/product/mission.md',
        content: Buffer.from('hello').toString('base64'),
        encoding: 'base64',
        sha: 'abc',
        size: 5,
      }),
    );

    await backend.getFile('internal/agent-os/product/mission.md');

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain(`${GITHUB_API}/repos/HussainBedawala/zerupt-internal/contents/`);
    expect(calledUrl).toContain('agent-os/product/mission.md');
  });

  it('encodes spaces and special chars in path segments', async () => {
    const backend = new GitHubBackend('test-token');
    const mockFetch = vi.mocked(fetch);

    mockFetch.mockResolvedValueOnce(mockResponse(404, null));

    try {
      await backend.getFile('internal/agent-os/product/my file.md');
    } catch {
      // expected — file not found
    }

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('my%20file.md');
  });
});

describe('GitHubBackend — 403/429 warn path (H9)', () => {
  it('warns on 403 and returns rate-limit message when all repos fail', async () => {
    const backend = new GitHubBackend('test-token');
    const mockFetch = vi.mocked(fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // All search requests return 403
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
      text: async () => 'rate limited',
    } as Response);

    const hits = await backend.search('hello', 'product');

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0]?.[0]).toContain('403');
    // H9: should surface a message instead of empty array
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.snippet).toMatch(/rate limited|unavailable/i);
  });
});

describe('GitHubBackend — search query sanitisation (H2)', () => {
  it('strips qualifier injection from search query', async () => {
    const backend = new GitHubBackend('test-token');
    const mockFetch = vi.mocked(fetch);

    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { items: [] }),
    );

    await backend.search('hello repo:evil/repo org:attacker', 'product');

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    // The injected qualifier must not appear raw in the URL
    expect(calledUrl).not.toContain('repo:evil');
    expect(calledUrl).not.toContain('org:attacker');
  });
});
