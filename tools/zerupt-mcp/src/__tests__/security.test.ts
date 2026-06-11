import { describe, it, expect } from 'vitest';
import {
  checkPathAllowed,
  normalisePath,
  scrubSecrets,
  capResponse,
  sanitiseResponse,
  RESPONSE_SIZE_CAP,
  TRUNCATION_SUFFIX,
} from '../security.js';

describe('normalisePath', () => {
  it('strips leading slash', () => {
    expect(normalisePath('/internal/agent-os/foo.md')).toBe('internal/agent-os/foo.md');
  });
  it('collapses double slashes', () => {
    expect(normalisePath('erp//docs//CODEMAPS/a.md')).toBe('erp/docs/CODEMAPS/a.md');
  });
  it('converts backslashes', () => {
    expect(normalisePath('erp\\docs\\CODEMAPS')).toBe('erp/docs/CODEMAPS');
  });
});

describe('checkPathAllowed — allowlist', () => {
  it('allows internal/agent-os paths', () => {
    expect(checkPathAllowed('internal/agent-os/product/mission.md')).toBeNull();
  });
  it('allows internal/agent-os brand paths', () => {
    expect(checkPathAllowed('internal/agent-os/brand/brand-foundation.md')).toBeNull();
  });
  it('allows internal/agent-os marketing paths', () => {
    expect(checkPathAllowed('internal/agent-os/marketing/marketing-context.md')).toBeNull();
  });
  it('allows internal/agent-os customers paths', () => {
    expect(checkPathAllowed('internal/agent-os/customers/personas/ksa-personas-spec.md')).toBeNull();
  });
  it('allows internal/agent-os feature-catalog paths', () => {
    expect(checkPathAllowed('internal/agent-os/product/feature-catalog/pos.md')).toBeNull();
  });
  // erp/ paths are intentionally DENIED — only agent-os is served
  it('denies internal/study paths (not in scope)', () => {
    expect(checkPathAllowed('internal/study/pos/overview.md')).not.toBeNull();
  });
  it('denies erp/docs paths', () => {
    expect(checkPathAllowed('erp/docs/CODEMAPS/accounting.md')).not.toBeNull();
  });
  it('denies erp/DESIGN.md', () => {
    expect(checkPathAllowed('erp/DESIGN.md')).not.toBeNull();
  });
  it('denies erp/README.md', () => {
    expect(checkPathAllowed('erp/README.md')).not.toBeNull();
  });
  it('denies erp/apps src paths', () => {
    expect(checkPathAllowed('erp/apps/api/src/modules/pos/pos.service.ts')).not.toBeNull();
  });
  it('denies erp/packages src paths', () => {
    expect(checkPathAllowed('erp/packages/db/src/schema/index.ts')).not.toBeNull();
  });
});

describe('checkPathAllowed — denylist', () => {
  it('blocks .env files', () => {
    expect(checkPathAllowed('internal/agent-os/.env')).not.toBeNull();
  });
  it('blocks .env.local even in allowed dir', () => {
    expect(checkPathAllowed('internal/agent-os/.env.local')).not.toBeNull();
  });
  it('blocks .pem files', () => {
    expect(checkPathAllowed('internal/agent-os/certs/cert.pem')).not.toBeNull();
  });
  it('blocks .key files', () => {
    expect(checkPathAllowed('internal/agent-os/private.key')).not.toBeNull();
  });
  it('blocks node_modules inside agent-os', () => {
    expect(checkPathAllowed('internal/agent-os/node_modules/foo')).not.toBeNull();
  });
  it('blocks .git', () => {
    expect(checkPathAllowed('internal/agent-os/.git/config')).not.toBeNull();
  });
  it('blocks dist inside agent-os', () => {
    expect(checkPathAllowed('internal/agent-os/dist/index.js')).not.toBeNull();
  });
  it('blocks coverage inside agent-os', () => {
    expect(checkPathAllowed('internal/agent-os/coverage/lcov.info')).not.toBeNull();
  });
  it('blocks drizzle (meta) inside agent-os', () => {
    expect(checkPathAllowed('internal/agent-os/drizzle/meta/0001.json')).not.toBeNull();
  });
});

describe('checkPathAllowed — traversal', () => {
  it('blocks .. traversal', () => {
    expect(checkPathAllowed('internal/agent-os/../../etc/passwd')).not.toBeNull();
  });
  it('blocks encoded-like traversal in path', () => {
    expect(checkPathAllowed('internal/agent-os/../../../root')).not.toBeNull();
  });
  it('blocks paths not in allowlist', () => {
    expect(checkPathAllowed('random/path/file.md')).not.toBeNull();
  });
});

describe('scrubSecrets', () => {
  it('redacts OpenAI-style keys', () => {
    const text = 'key: sk-abcdefghijklmnopqrstuvwxyz123456';
    expect(scrubSecrets(text)).toContain('[REDACTED]');
    expect(scrubSecrets(text)).not.toContain('sk-abc');
  });
  it('redacts GitHub PAT', () => {
    const text = 'token: ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    expect(scrubSecrets(text)).toContain('[REDACTED]');
  });
  it('redacts GitHub fine-grained PAT', () => {
    const text = 'token: github_pat_AAAAAAAAAAAAAA_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
    expect(scrubSecrets(text)).toContain('[REDACTED]');
  });
  it('redacts AWS access keys', () => {
    const text = 'aws: AKIAIOSFODNN7EXAMPLE';
    expect(scrubSecrets(text)).toContain('[REDACTED]');
  });
  it('redacts postgres connection strings', () => {
    const text = 'db: postgres://user:password@host:5432/dbname';
    expect(scrubSecrets(text)).toContain('[REDACTED]');
  });
  it('redacts http basic auth URLs', () => {
    const text = 'url: https://admin:secret@example.com/api';
    expect(scrubSecrets(text)).toContain('[REDACTED]');
  });
  it('leaves normal text intact', () => {
    const text = 'Hello, this is normal text without secrets.';
    expect(scrubSecrets(text)).toBe(text);
  });
});

describe('capResponse', () => {
  it('returns text unchanged when under cap', () => {
    const text = 'short text';
    expect(capResponse(text)).toBe(text);
  });
  it('truncates at cap and appends suffix', () => {
    const longText = 'x'.repeat(RESPONSE_SIZE_CAP + 100);
    const result = capResponse(longText);
    expect(result.length).toBe(RESPONSE_SIZE_CAP + TRUNCATION_SUFFIX.length);
    expect(result.endsWith(TRUNCATION_SUFFIX)).toBe(true);
  });
  it('handles exactly cap length', () => {
    const text = 'x'.repeat(RESPONSE_SIZE_CAP);
    expect(capResponse(text)).toBe(text);
  });
});

describe('sanitiseResponse', () => {
  it('scrubs and caps', () => {
    const text = 'key: sk-' + 'a'.repeat(25) + ' ' + 'x'.repeat(RESPONSE_SIZE_CAP);
    const result = sanitiseResponse(text);
    expect(result).not.toContain('sk-');
    expect(result.length).toBeLessThanOrEqual(RESPONSE_SIZE_CAP + TRUNCATION_SUFFIX.length);
  });
});
