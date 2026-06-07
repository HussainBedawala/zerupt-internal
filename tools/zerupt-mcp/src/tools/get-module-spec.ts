import type { ContentBackend } from '../content/backend.js';
import { sanitiseResponse } from '../security.js';

const BANNER =
  '> **SPEC = design intent.** Cross-check `get_codemap` for what is actually built.';

export async function getModuleSpec(
  backend: ContentBackend,
  module: string,
  file?: string,
): Promise<string> {
  // Sanitise module name — only allow safe path segments
  if (!/^[\w-]+$/.test(module)) {
    return `Invalid module name: ${module}`;
  }

  if (file) {
    // Sanitise file — must not contain slashes or traversal
    if (file.includes('/') || file.includes('..') || file.includes('\\')) {
      return `Invalid file name: ${file}`;
    }
    const virtualPath = `internal/agent-os/product/${module}/${file}`;
    try {
      const content = await backend.getFile(virtualPath);
      return sanitiseResponse(`${BANNER}\n\n---\n\n${content}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return sanitiseResponse(`${BANNER}\n\nCould not read ${virtualPath}: ${msg}`);
    }
  }

  // List the module directory
  const dirPath = `internal/agent-os/product/${module}`;
  try {
    const entries = await backend.listDir(dirPath);
    const listing = entries.join('\n');
    return sanitiseResponse(`${BANNER}\n\n## Files in ${dirPath}\n\n${listing}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return sanitiseResponse(`${BANNER}\n\nCould not list ${dirPath}: ${msg}`);
  }
}
