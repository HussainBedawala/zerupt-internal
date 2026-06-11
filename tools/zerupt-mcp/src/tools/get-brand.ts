import type { ContentBackend } from '../content/backend.js';
import { sanitiseResponse, RESPONSE_SIZE_CAP } from '../security.js';

export type BrandSection = 'foundation' | 'story' | 'design-system' | 'voice' | 'all';

const SECTION_PATHS: Record<Exclude<BrandSection, 'all'>, string> = {
  foundation: 'internal/agent-os/brand/brand-foundation.md',
  story: 'internal/agent-os/brand/brand-story.md',
  'design-system': 'internal/agent-os/brand/design-system.md',
  voice: 'internal/agent-os/marketing/content-style-guide.md',
};

const SECTION_LABELS: Record<Exclude<BrandSection, 'all'>, string> = {
  foundation: 'Brand Foundation',
  story: 'Brand Story',
  'design-system': 'Design System',
  voice: 'Voice & Content Style',
};

async function fetchSection(
  backend: ContentBackend,
  key: Exclude<BrandSection, 'all'>,
): Promise<string> {
  const path = SECTION_PATHS[key];
  const label = SECTION_LABELS[key];
  try {
    const content = await backend.getFile(path);
    return `## ${label}\n\n${content}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `## ${label}\n\n_Not available: ${msg}_`;
  }
}

export async function getBrand(
  backend: ContentBackend,
  section: BrandSection = 'all',
): Promise<string> {
  if (section !== 'all') {
    const text = await fetchSection(backend, section);
    return sanitiseResponse(text);
  }

  // 'all' — fetch foundation + design-system first (most useful for agents),
  // then story + voice; truncate gracefully if over cap
  const priority: Array<Exclude<BrandSection, 'all'>> = [
    'foundation',
    'design-system',
    'story',
    'voice',
  ];

  const parts: string[] = [];
  for (const key of priority) {
    const part = await fetchSection(backend, key);
    parts.push(part);
    // Stop early if concatenated content already exceeds cap — avoids wasted reads
    const joined = parts.join('\n\n---\n\n');
    if (joined.length > RESPONSE_SIZE_CAP) {
      parts.push(
        '_Note: some sections omitted due to response size cap. ' +
          'Request individual sections (foundation | story | design-system | voice) to read them in full._',
      );
      return sanitiseResponse(joined);
    }
  }

  return sanitiseResponse(parts.join('\n\n---\n\n'));
}
