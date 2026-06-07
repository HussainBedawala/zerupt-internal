import type { ContentBackend, SearchScope } from '../content/backend.js';
import { sanitiseResponse } from '../security.js';

export async function search(
  backend: ContentBackend,
  query: string,
  scope: SearchScope,
): Promise<string> {
  if (!query.trim()) return 'Query cannot be empty.';

  let hits: readonly { path: string; line?: number; snippet: string }[];
  try {
    hits = await backend.search(query, scope);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Search failed: ${msg}`;
  }

  if (hits.length === 0) {
    return `No results found for "${query}" in scope "${scope}".`;
  }

  const lines = hits.map((h) => {
    const location = h.line != null ? `:${h.line}` : '';
    return `**${h.path}${location}**\n> ${h.snippet}`;
  });

  const header = `Found ${hits.length} result(s) for "${query}" (scope: ${scope})\n\n`;
  return sanitiseResponse(header + lines.join('\n\n'));
}
