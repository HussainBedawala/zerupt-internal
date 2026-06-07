import type { ContentBackend } from '../content/backend.js';
import { sanitiseResponse } from '../security.js';

export async function productOverview(backend: ContentBackend): Promise<string> {
  const paths = [
    'internal/agent-os/product/mission.md',
    'internal/agent-os/product/tech-stack.md',
  ];

  const parts: string[] = [];
  for (const p of paths) {
    const label = p.split('/').pop() ?? p;
    try {
      const content = await backend.getFile(p);
      parts.push(`## ${label}\n\n${content}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      parts.push(`## ${label}\n\n_Not available: ${msg}_`);
    }
  }

  return sanitiseResponse(parts.join('\n\n---\n\n'));
}
