import type { ContentBackend } from '../content/backend.js';
import { checkPathAllowed, sanitiseResponse } from '../security.js';

export async function readFile(backend: ContentBackend, path: string): Promise<string> {
  const denied = checkPathAllowed(path);
  if (denied) return `Access denied: ${denied}`;

  try {
    const content = await backend.getFile(path);
    return sanitiseResponse(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Could not read file: ${msg}`;
  }
}
