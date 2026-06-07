import type { ContentBackend } from '../content/backend.js';
import { sanitiseResponse } from '../security.js';

export async function getCodemap(backend: ContentBackend, module: string): Promise<string> {
  if (!/^[\w-]+$/.test(module)) {
    return `Invalid module name: ${module}`;
  }

  const virtualPath = `erp/docs/CODEMAPS/${module}.md`;
  try {
    const content = await backend.getFile(virtualPath);
    return sanitiseResponse(content);
  } catch (err) {
    // H4: sanitise error message before returning to client — strip raw FS paths
    const raw = err instanceof Error ? err.message : String(err);
    const safe = raw.replace(/(?:\/[^\s,'"]+)+/g, '[path]');
    return sanitiseResponse(`Could not read codemap for module "${module}": ${safe}`);
  }
}
