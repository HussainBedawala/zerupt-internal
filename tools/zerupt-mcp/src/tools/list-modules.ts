import type { ContentBackend } from '../content/backend.js';
import { sanitiseResponse } from '../security.js';

const CODEMAP_DIR = 'erp/docs/CODEMAPS';

const NOTE =
  '> **Note:** Codemaps = AS-BUILT truth (what is actually implemented). ' +
  'Specs under `internal/agent-os/product/` = design intent; ' +
  'features listed there may not be built yet.';

export async function listModules(backend: ContentBackend): Promise<string> {
  let entries: readonly string[];
  try {
    entries = await backend.listDir(CODEMAP_DIR);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return sanitiseResponse(`Failed to list codemaps: ${msg}`);
  }

  const mdFiles = entries.filter((e) => e.endsWith('.md'));
  const sections: string[] = [NOTE, ''];

  // M7: fetch all codemap previews in parallel instead of serially
  const previews = await Promise.all(
    mdFiles.map(async (entry) => {
      try {
        const content = await backend.getFile(entry);
        return content.split('\n').slice(0, 10).join('\n');
      } catch {
        return '_Preview unavailable_';
      }
    }),
  );

  for (let i = 0; i < mdFiles.length; i++) {
    const entry = mdFiles[i] ?? '';
    // entry is already a virtual path like erp/docs/CODEMAPS/accounting.md
    const moduleName = entry.split('/').pop()?.replace(/\.md$/, '') ?? entry;
    const preview = previews[i] ?? '_Preview unavailable_';
    sections.push(`### ${moduleName}\n\n\`\`\`\n${preview}\n\`\`\``);
  }

  if (mdFiles.length === 0) {
    sections.push('_No codemaps found in erp/docs/CODEMAPS/_');
  }

  return sanitiseResponse(sections.join('\n\n'));
}
