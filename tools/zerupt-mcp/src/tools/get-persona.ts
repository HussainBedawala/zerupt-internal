import type { ContentBackend } from '../content/backend.js';
import { sanitiseResponse } from '../security.js';

const SEARCH_DIRS = [
  'internal/agent-os/customers/personas',
  'internal/agent-os/customers/journeys',
] as const;

/**
 * Returns the content of a persona or journey file matching the given name.
 * Matches by filename stem (case-insensitive, ignoring hyphens/spaces).
 */
export async function getPersona(backend: ContentBackend, name: string): Promise<string> {
  if (!name.trim()) return 'Name argument cannot be empty.';

  const needle = name.toLowerCase().replace(/[\s-]+/g, '');

  for (const dir of SEARCH_DIRS) {
    let entries: readonly string[];
    try {
      entries = await backend.listDir(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.endsWith('/')) continue;
      const filename = (entry.split('/').pop() ?? '').replace(/\.md$/i, '');
      const normalised = filename.toLowerCase().replace(/[\s-]+/g, '');

      if (normalised.includes(needle) || needle.includes(normalised)) {
        try {
          const content = await backend.getFile(entry);
          return sanitiseResponse(content);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Could not read "${entry}": ${msg}`;
        }
      }
    }
  }

  return (
    `No persona or journey found matching "${name}". ` +
    'Use `list_personas` to see available entries.'
  );
}
