import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalBackend } from '../content/local-backend.js';

let tmpRoot: string;
let backend: LocalBackend;

// Build a fixture directory structure that mirrors the virtual path model:
// <tmpRoot>/                               ← LOCAL_CONTENT_ROOT (= "internal" root)
//   agent-os/product/mission.md
//   agent-os/brand/brand-foundation.md
//   agent-os/marketing/marketing-context.md
//   agent-os/customers/personas/ksa-personas-spec.md

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'zerupt-mcp-test-'));
  await mkdir(join(tmpRoot, 'agent-os', 'product'), { recursive: true });
  await mkdir(join(tmpRoot, 'agent-os', 'brand'), { recursive: true });
  await mkdir(join(tmpRoot, 'agent-os', 'marketing'), { recursive: true });
  await mkdir(join(tmpRoot, 'agent-os', 'customers', 'personas'), { recursive: true });

  await writeFile(
    join(tmpRoot, 'agent-os', 'product', 'mission.md'),
    '# Mission\nZerupt is a retail ERP.',
  );
  await writeFile(
    join(tmpRoot, 'agent-os', 'brand', 'brand-foundation.md'),
    '# Brand Foundation\nInk on cream.',
  );
  await writeFile(
    join(tmpRoot, 'agent-os', 'marketing', 'marketing-context.md'),
    '# Marketing Context\nICP: MENA retail.',
  );
  await writeFile(
    join(tmpRoot, 'agent-os', 'customers', 'personas', 'ksa-personas-spec.md'),
    '# KSA Personas\nYousef, Noura.',
  );

  backend = new LocalBackend(tmpRoot);
});

afterAll(async () => {
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

describe('LocalBackend.getFile', () => {
  it('reads internal/agent-os/product/mission.md', async () => {
    const content = await backend.getFile('internal/agent-os/product/mission.md');
    expect(content).toContain('Zerupt is a retail ERP');
  });

  it('reads internal/agent-os/brand/brand-foundation.md', async () => {
    const content = await backend.getFile('internal/agent-os/brand/brand-foundation.md');
    expect(content).toContain('Ink on cream');
  });

  it('reads internal/agent-os/marketing/marketing-context.md', async () => {
    const content = await backend.getFile('internal/agent-os/marketing/marketing-context.md');
    expect(content).toContain('MENA retail');
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
    await expect(backend.getFile('/etc/passwd')).rejects.toThrow();
  });

  // erp paths are denied by the allowlist
  it('throws on erp/docs paths (denied)', async () => {
    await expect(backend.getFile('erp/docs/CODEMAPS/accounting.md')).rejects.toThrow(/not in allowlist/i);
  });

  it('throws on erp/apps src paths (denied)', async () => {
    await expect(backend.getFile('erp/apps/api/src/app.ts')).rejects.toThrow(/not in allowlist/i);
  });
});

describe('LocalBackend.listDir', () => {
  it('lists internal/agent-os/product', async () => {
    const entries = await backend.listDir('internal/agent-os/product');
    expect(entries).toContain('internal/agent-os/product/mission.md');
  });

  it('lists internal/agent-os/brand', async () => {
    const entries = await backend.listDir('internal/agent-os/brand');
    expect(entries).toContain('internal/agent-os/brand/brand-foundation.md');
  });

  it('throws on traversal in listDir', async () => {
    await expect(backend.listDir('internal/../etc')).rejects.toThrow();
  });

  it('throws on erp/docs listDir (denied)', async () => {
    await expect(backend.listDir('erp/docs/CODEMAPS')).rejects.toThrow(/not in allowlist/i);
  });
});

describe('LocalBackend.search', () => {
  it('finds text in product scope', async () => {
    const hits = await backend.search('retail ERP', 'product');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.path).toContain('mission.md');
  });

  it('finds text in brand scope', async () => {
    const hits = await backend.search('Ink on cream', 'brand');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('finds text in all scope', async () => {
    const hits = await backend.search('MENA retail', 'all');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('returns empty for no match', async () => {
    const hits = await backend.search('xyzzy_not_found_12345', 'all');
    expect(hits.length).toBe(0);
  });
});

describe('LocalBackend agent-os tool integration', () => {
  it('reads an agent-os file via get-brand tool', async () => {
    const { getBrand } = await import('../tools/get-brand.js');
    const result = await getBrand(backend, 'foundation');
    expect(result).toContain('Ink on cream');
  });

  it('lists personas via list-personas tool', async () => {
    const { listPersonas } = await import('../tools/list-personas.js');
    const result = await listPersonas(backend);
    expect(result).toContain('ksa-personas-spec');
  });

  it('gets a persona via get-persona tool', async () => {
    const { getPersona } = await import('../tools/get-persona.js');
    const result = await getPersona(backend, 'ksa');
    expect(result).toContain('KSA Personas');
  });
});
