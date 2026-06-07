import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalBackend } from '../content/local-backend.js';

let tmpRoot: string;
let backend: LocalBackend;

// Build a fixture directory structure that mirrors the virtual path model:
// <tmpRoot>/                         ← LOCAL_CONTENT_ROOT (= "internal" root)
//   agent-os/product/mission.md
//   erp/docs/CODEMAPS/accounting.md
//   erp/apps/api/src/app.ts

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'zerupt-mcp-test-'));
  await mkdir(join(tmpRoot, 'agent-os', 'product'), { recursive: true });
  await mkdir(join(tmpRoot, 'erp', 'docs', 'CODEMAPS'), { recursive: true });
  await mkdir(join(tmpRoot, 'erp', 'apps', 'api', 'src'), { recursive: true });

  await writeFile(
    join(tmpRoot, 'agent-os', 'product', 'mission.md'),
    '# Mission\nZerupt is a retail ERP.',
  );
  await writeFile(
    join(tmpRoot, 'erp', 'docs', 'CODEMAPS', 'accounting.md'),
    '# Accounting Codemap\nRoutes, services, tables.',
  );
  await writeFile(
    join(tmpRoot, 'erp', 'apps', 'api', 'src', 'app.ts'),
    'export const app = "hello";',
  );

  backend = new LocalBackend(tmpRoot);
});

afterAll(async () => {
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

describe('LocalBackend.getFile', () => {
  it('reads internal/ path', async () => {
    const content = await backend.getFile('internal/agent-os/product/mission.md');
    expect(content).toContain('Zerupt is a retail ERP');
  });

  it('reads erp/docs path', async () => {
    const content = await backend.getFile('erp/docs/CODEMAPS/accounting.md');
    expect(content).toContain('Accounting Codemap');
  });

  it('reads erp/apps src path', async () => {
    const content = await backend.getFile('erp/apps/api/src/app.ts');
    expect(content).toContain('hello');
  });

  it('throws on non-existent file', async () => {
    await expect(backend.getFile('internal/agent-os/product/nonexistent.md')).rejects.toThrow();
  });

  it('throws on denylist path', async () => {
    await expect(backend.getFile('internal/agent-os/.env')).rejects.toThrow(/denied/i);
  });

  it('throws on path traversal attempt', async () => {
    await expect(backend.getFile('internal/agent-os/../../etc/passwd')).rejects.toThrow();
  });

  it('throws on absolute path', async () => {
    // Absolute paths fail allowlist check (starts with /)
    await expect(backend.getFile('/etc/passwd')).rejects.toThrow();
  });
});

describe('LocalBackend.listDir', () => {
  it('lists internal/agent-os/product', async () => {
    const entries = await backend.listDir('internal/agent-os/product');
    expect(entries).toContain('internal/agent-os/product/mission.md');
  });

  it('lists erp/docs/CODEMAPS', async () => {
    const entries = await backend.listDir('erp/docs/CODEMAPS');
    expect(entries).toContain('erp/docs/CODEMAPS/accounting.md');
  });

  it('throws on traversal in listDir', async () => {
    await expect(backend.listDir('internal/../etc')).rejects.toThrow();
  });
});

describe('LocalBackend.search', () => {
  it('finds text in specs scope', async () => {
    const hits = await backend.search('retail ERP', 'specs');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.path).toContain('mission.md');
  });

  it('finds text in docs scope', async () => {
    const hits = await backend.search('Codemap', 'docs');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('finds text in code scope', async () => {
    const hits = await backend.search('hello', 'code');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.path).toContain('app.ts');
  });

  it('returns empty for no match', async () => {
    const hits = await backend.search('xyzzy_not_found_12345', 'all');
    expect(hits.length).toBe(0);
  });
});

describe('LocalBackend read_file tool integration', () => {
  it('reads an allowlisted file via tool layer', async () => {
    const { readFile } = await import('../tools/read-file.js');
    const result = await readFile(backend, 'internal/agent-os/product/mission.md');
    expect(result).toContain('Zerupt is a retail ERP');
  });

  it('returns access-denied message for blocked path', async () => {
    const { readFile } = await import('../tools/read-file.js');
    const result = await readFile(backend, 'internal/agent-os/.env');
    expect(result).toMatch(/access denied|denied/i);
  });
});
