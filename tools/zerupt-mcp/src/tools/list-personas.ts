import type { ContentBackend } from '../content/backend.js';
import { sanitiseResponse } from '../security.js';

const PERSONA_DIRS = [
  'internal/agent-os/customers/personas',
  'internal/agent-os/customers/journeys',
] as const;

/**
 * Extract the first H1 or H2 heading from markdown content.
 */
function extractHeading(content: string): string {
  const match = content.match(/^#{1,2}\s+(.+)$/m);
  return match?.[1]?.trim() ?? '';
}

/**
 * Derive a human-readable label from a filename.
 * E.g. "ksa-personas-spec.md" → "ksa-personas-spec"
 */
function labelFromFilename(filename: string): string {
  return filename.replace(/\.md$/i, '');
}

export async function listPersonas(backend: ContentBackend): Promise<string> {
  const sections: string[] = [];

  for (const dir of PERSONA_DIRS) {
    const sectionLabel = dir.includes('personas') ? 'Personas' : 'Journeys';
    let entries: readonly string[];
    try {
      entries = await backend.listDir(dir);
    } catch {
      sections.push(`## ${sectionLabel}\n\n_Directory not yet available: ${dir}_`);
      continue;
    }

    const lines: string[] = [];
    for (const entry of entries) {
      if (entry.endsWith('/')) continue; // skip subdirs
      const filename = entry.split('/').pop() ?? entry;
      if (!filename.endsWith('.md')) continue;

      let heading = '';
      try {
        const content = await backend.getFile(entry);
        heading = extractHeading(content);
      } catch {
        // best-effort
      }

      const label = labelFromFilename(filename);
      const summary = heading ? `${label} — ${heading}` : label;
      lines.push(`- \`${entry}\` — ${summary}`);
    }

    sections.push(
      `## ${sectionLabel}\n\n` +
        (lines.length > 0 ? lines.join('\n') : '_No files found._'),
    );
  }

  return sanitiseResponse(sections.join('\n\n'));
}
