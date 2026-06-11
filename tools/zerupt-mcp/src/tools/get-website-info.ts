import type { ContentBackend } from '../content/backend.js';
import { sanitiseResponse } from '../security.js';

export type WebsiteDoc = 'digest' | 'seo' | 'experience' | 'copy' | 'all';

const WEBSITE_BASE = 'internal/agent-os/marketing/website';

const DOC_PATHS: Record<Exclude<WebsiteDoc, 'all'>, string> = {
  digest: `${WEBSITE_BASE}/digest.md`,
  seo: `${WEBSITE_BASE}/seo.md`,
  experience: `${WEBSITE_BASE}/01-experience-and-journey.md`,
  copy: `${WEBSITE_BASE}/02-copy-and-keywords.md`,
};

const DOC_LABELS: Record<Exclude<WebsiteDoc, 'all'>, string> = {
  digest: 'Website Digest',
  seo: 'SEO Strategy',
  experience: 'Experience & Journey',
  copy: 'Copy & Keywords',
};

async function fetchDoc(
  backend: ContentBackend,
  key: Exclude<WebsiteDoc, 'all'>,
): Promise<string> {
  const path = DOC_PATHS[key];
  const label = DOC_LABELS[key];
  try {
    const content = await backend.getFile(path);
    return `## ${label}\n\n${content}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `## ${label}\n\n_Not available: ${msg}_`;
  }
}

export async function getWebsiteInfo(
  backend: ContentBackend,
  doc: WebsiteDoc = 'digest',
): Promise<string> {
  if (doc !== 'all') {
    const text = await fetchDoc(backend, doc);
    return sanitiseResponse(text);
  }

  const keys: Array<Exclude<WebsiteDoc, 'all'>> = ['digest', 'seo', 'experience', 'copy'];
  const parts = await Promise.all(keys.map((k) => fetchDoc(backend, k)));
  return sanitiseResponse(parts.join('\n\n---\n\n'));
}
