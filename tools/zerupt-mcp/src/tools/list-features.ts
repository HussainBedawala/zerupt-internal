import type { ContentBackend } from '../content/backend.js';
import { sanitiseResponse } from '../security.js';

export type FeatureStatus = 'shipped' | 'planned' | 'all';

const CATALOG_BASE = 'internal/agent-os/product/feature-catalog';

/**
 * Filter markdown content to sections matching the requested status.
 * Looks for lines like "**Status:** shipped" within each ## section block.
 */
function filterByStatus(content: string, status: FeatureStatus): string {
  if (status === 'all') return content;

  const sections = content.split(/(?=^## )/m);
  const filtered = sections.filter((section) => {
    const statusMatch = section.match(/\*\*Status:\*\*\s*(\w+)/i);
    if (!statusMatch) return true; // keep sections without a status line (e.g. intro)
    return statusMatch[1]?.toLowerCase() === status;
  });

  if (filtered.length <= 1) {
    return filtered.join('') + `\n\n_No features with status "${status}" found._`;
  }
  return filtered.join('');
}

export async function listFeatures(
  backend: ContentBackend,
  module?: string,
  status: FeatureStatus = 'all',
): Promise<string> {
  if (module) {
    // Sanitise module name
    if (!/^[\w-]+$/.test(module)) {
      return `Invalid module name: ${module}`;
    }
    const path = `${CATALOG_BASE}/${module}.md`;
    try {
      const content = await backend.getFile(path);
      const filtered = filterByStatus(content, status);
      return sanitiseResponse(filtered);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Could not read feature catalog for module "${module}": ${msg}`;
    }
  }

  // No module — return the master index README
  const readmePath = `${CATALOG_BASE}/README.md`;
  try {
    const content = await backend.getFile(readmePath);
    return sanitiseResponse(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Could not read feature catalog index: ${msg}`;
  }
}
